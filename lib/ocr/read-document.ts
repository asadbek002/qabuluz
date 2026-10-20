// Browser-only OCR: turns an uploaded image or PDF into text with PaddleOCR (PP-OCRv4 on
// onnxruntime-web, see ./ppocr) and parses it. Everything runs on the student's device; the
// engine files are served from /ocr (scripts/copy-ocr-assets.mjs), so no document image is
// sent anywhere for recognition.
import { linesToText, preloadPpOcr, readLines } from "./ppocr";
import { parsePassport, parseResidenceCard, type PassportData, type ResidenceCardData } from "./parse";

/** Start downloading the OCR engine early (e.g. when the documents step opens). */
export function preloadOcr() {
  preloadPpOcr();
}

async function pdfFirstPage(file: File): Promise<HTMLCanvasElement> {
  // Legacy build: includes polyfills, the default build needs very recent browsers.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/ocr/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(3, 2200 / Math.max(base.width, base.height)) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvas, viewport }).promise;
  await task.destroy();
  return canvas;
}

async function imageToCanvas(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(async () => {
    const url = URL.createObjectURL(file);
    try { const img = new Image(); img.src = url; await img.decode(); return img; } finally { URL.revokeObjectURL(url); }
  });
  const width = "naturalWidth" in bitmap ? bitmap.naturalWidth : bitmap.width;
  const height = "naturalHeight" in bitmap ? bitmap.naturalHeight : bitmap.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  if ("close" in bitmap) bitmap.close();
  return canvas;
}

export function isPdf(file: File) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

async function toCanvas(file: File) {
  return isPdf(file) ? pdfFirstPage(file) : imageToCanvas(file);
}

type Prepare = { top?: number; bottom?: number; rotate?: number; targetWidth: number; binarize?: boolean };

/** Crop (fractions of the source), rotate, scale to `targetWidth` and convert to high-contrast grayscale (or black/white). */
function prepare(src: HTMLCanvasElement, opts: Prepare) {
  const rotated = opts.rotate ? rotate(src, opts.rotate) : src;
  const y0 = Math.round(rotated.height * (opts.top ?? 0));
  const y1 = Math.round(rotated.height * (opts.bottom ?? 1));
  const scale = opts.targetWidth / rotated.width;
  const out = document.createElement("canvas");
  out.width = opts.targetWidth;
  out.height = Math.max(1, Math.round((y1 - y0) * scale));
  const ctx = out.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(rotated, 0, y0, rotated.width, y1 - y0, 0, 0, out.width, out.height);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  let min = 255, max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(1, max - min);
  const histogram = new Array<number>(256).fill(0);
  for (let i = 0; i < d.length; i += 4) {
    const g = ((d[i] - min) * 255) / range;
    d[i] = d[i + 1] = d[i + 2] = g;
    histogram[Math.round(g)]++;
  }
  if (opts.binarize) {
    const t = otsu(histogram, d.length / 4);
    for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = d[i] > t ? 255 : 0;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

/** Otsu's threshold: the gray level that best separates ink from paper. */
function otsu(histogram: number[], total: number) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];
  let sumB = 0, wB = 0, best = 0, threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * histogram[t];
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
    if (between > best) { best = between; threshold = t; }
  }
  return threshold;
}

/** Rotate by any angle; the canvas grows so no corner is cut off (new area is white). */
function rotate(src: HTMLCanvasElement, deg: number) {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
  const out = document.createElement("canvas");
  out.width = Math.round(src.width * cos + src.height * sin);
  out.height = Math.round(src.width * sin + src.height * cos);
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}

/**
 * Angle (degrees, -90…89) that turns the text lines horizontal: the rotation whose horizontal
 * projection of dark pixels is the most "peaky" (lines of ink separated by blank gaps).
 * Handles sideways photos (≈ ±90°) as well as tilted ones; upside-down is decided separately.
 */
/** Letter-stroke pixels of a downscaled copy (coordinates relative to its centre). */
function inkPoints(src: HTMLCanvasElement) {
  const small = prepare(src, { targetWidth: Math.min(800, src.width) });
  const { width, height } = small;
  const data = small.getContext("2d")!.getImageData(0, 0, width, height).data;
  // Ink = pixels clearly darker than their neighbourhood (adaptive threshold via an integral
  // image), so letter strokes count but large dark areas, photos and page edges do not.
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += data[(y * width + x) * 4];
      integral[(y + 1) * (width + 1) + x + 1] = integral[y * (width + 1) + x + 1] + row;
    }
  }
  const r = 7;
  const xs: number[] = [], ys: number[] = [];
  for (let y = r; y < height - r; y++) for (let x = r; x < width - r; x++) {
    const a = (y - r) * (width + 1) + (x - r), b = (y - r) * (width + 1) + (x + r + 1);
    const c = (y + r + 1) * (width + 1) + (x - r), d = (y + r + 1) * (width + 1) + (x + r + 1);
    const mean = (integral[d] - integral[b] - integral[c] + integral[a]) / ((2 * r + 1) ** 2);
    if (data[(y * width + x) * 4] < mean - 25) { xs.push(x - width / 2); ys.push(y - height / 2); }
  }
  return { xs, ys, width, height, scale: src.width / width };
}

function textLineAngle(src: HTMLCanvasElement) {
  const { xs, ys, width, height } = inkPoints(src);
  if (xs.length < 300) return 0;
  const half = Math.ceil(Math.hypot(width, height) / 2);
  // Text lines give a projection with sharp steps between ink rows and blank gaps; the sum of
  // squared differences between neighbouring rows is largest when the lines are horizontal.
  const scoreAt = (deg: number) => {
    const rad = (deg * Math.PI) / 180, s = Math.sin(rad), c = Math.cos(rad);
    const bins = new Float64Array(2 * half + 2);
    for (let i = 0; i < xs.length; i++) bins[Math.round(xs[i] * s + ys[i] * c) + half]++;
    let sum = 0;
    for (let i = 1; i < bins.length; i++) sum += (bins[i] - bins[i - 1]) ** 2;
    return sum;
  };
  let best = 0, bestScore = -1;
  for (let deg = -90; deg < 90; deg += 2) { const v = scoreAt(deg); if (v > bestScore) { bestScore = v; best = deg; } }
  for (let deg = best - 1.5; deg <= best + 1.5; deg += 0.5) { const v = scoreAt(deg); if (v > bestScore) { bestScore = v; best = deg; } }
  return Math.abs(best) < 0.75 ? 0 : best;
}

/** Crop to where the text is (plus a margin): drops table/background around the document and
 *  the empty corners added by rotation, so the "bottom part" crops really hit the MRZ. */
function cropToInk(src: HTMLCanvasElement) {
  const { xs, ys, width, height, scale } = inkPoints(src);
  if (xs.length < 300) return src;
  const pct = (arr: number[], q: number) => [...arr].sort((a, b) => a - b)[Math.floor((arr.length - 1) * q)];
  const mx = width * 0.04, my = height * 0.04;
  const x0 = Math.max(0, pct(xs, 0.005) + width / 2 - mx), x1 = Math.min(width, pct(xs, 0.995) + width / 2 + mx);
  const y0 = Math.max(0, pct(ys, 0.005) + height / 2 - my), y1 = Math.min(height, pct(ys, 0.995) + height / 2 + my);
  if ((x1 - x0) * (y1 - y0) > width * height * 0.9) return src;
  const out = document.createElement("canvas");
  out.width = Math.round((x1 - x0) * scale);
  out.height = Math.round((y1 - y0) * scale);
  out.getContext("2d")!.drawImage(src, x0 * scale, y0 * scale, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

/** Turn the document upright: straighten the text lines, then pick 0° or 180° by OCR confidence. */
async function upright(src: HTMLCanvasElement) {
  const angle = textLineAngle(src);
  const straight = cropToInk(angle ? rotate(src, angle) : src);
  // Upside-down text still yields "words" with some confidence, so judge by words that are
  // printed on every Uzbek passport / Korean residence card; fall back to confidence.
  // ("<<<" is left out: it reads the same upside down.)
  const keywords = /PASSPORT|PASPORT|REPUBLIC|RESPUBLIKASI|UZBEKISTAN|SURNAME|GIVEN|NAMES|NATIONALITY|BIRTH|AUTHORITY|EXPIRY|RESIDENCE|CARD|IMMIGRATION|OFFICE|CHIEF|P<UZB|\d{6}-\d{7}/g;
  const probe = async (deg: number) => {
    const { text, confidence } = await ocrRaw(deg ? rotate(straight, deg) : straight, 960, 8);
    const hits = (text.toUpperCase().replace(/\s+(?=[-<])|(?<=[-<])\s+/g, "").match(keywords) ?? []).length;
    // Upside-down lines get low recognition scores, so confidence breaks ties.
    return hits * 1000 + confidence;
  };
  const upright0 = await probe(0);
  // A clear keyword hit at 0° means the photo is already upright: skip the second pass.
  const upright180 = upright0 >= 3000 ? 0 : await probe(180);
  return upright180 > upright0 ? rotate(straight, 180) : straight;
}

async function ocrRaw(canvas: HTMLCanvasElement, limit = 1280, maxBoxes = Infinity) {
  const lines = await readLines(canvas, limit, maxBoxes);
  const confidence = lines.length ? (lines.reduce((sum, l) => sum + l.score, 0) / lines.length) * 100 : 0;
  return { text: linesToText(lines), confidence };
}

async function ocr(canvas: HTMLCanvasElement, limit = 1280) {
  return (await ocrRaw(canvas, limit)).text;
}

/** Horizontal band of the image (fractions of its height), in colour. */
function band(src: HTMLCanvasElement, top: number, bottom = 1) {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = Math.max(1, Math.round(src.height * (bottom - top)));
  out.getContext("2d")!.drawImage(src, 0, Math.round(src.height * top), src.width, out.height, 0, 0, out.width, out.height);
  return out;
}

export type PassportResult = { data: PassportData | null; pdf: boolean };

/** Reads the passport data page: whole page first, then extra passes only while it is incomplete. */
export async function readPassport(file: File): Promise<PassportResult> {
  const source = await upright(await toCanvas(file));
  const attempts: (() => Promise<string>)[] = [
    () => ocr(source),
    // MRZ band at a higher effective resolution (the detector input is capped).
    () => ocr(band(source, 0.6), 1600),
    () => ocr(prepare(source, { targetWidth: Math.min(2400, Math.max(1600, source.width)), binarize: true })),
    // In case the upright guess was wrong (e.g. a very dark photo).
    () => ocr(rotate(source, 180)),
  ];
  let text = "";
  let best: PassportData | null = null;
  for (const attempt of attempts) {
    text += `\n${await attempt()}`;
    const parsed = parsePassport(text);
    if (parsed && (!best || score(parsed) > score(best))) best = parsed;
    if (best?.verified && best.namesClean) break;
    // Printed fields come first: when the page OCR already gave every field, the extra passes
    // (which only look for the MRZ) are not needed.
    if (best?.namesClean && best.lastName && best.firstName && best.middleName && best.passportNumber && best.birthDate && best.gender) break;
  }
  return { data: best, pdf: isPdf(file) };
}

function score(p: PassportData) {
  return (p.verified ? 10 : 0) + (p.namesClean ? 5 : 0) + (p.numberOk ? 2 : 0) + (p.birthDateOk ? 2 : 0) + ["lastName", "firstName", "middleName", "passportNumber", "birthDate", "gender", "citizenship"].filter((k) => p[k as keyof PassportData]).length;
}

export async function readResidenceCard(file: File): Promise<ResidenceCardData | null> {
  const source = await upright(await toCanvas(file));
  let best: ResidenceCardData | null = null;
  const attempts = [() => ocr(source), () => ocr(source, 1920), () => ocr(prepare(source, { targetWidth: 1600, binarize: true })), () => ocr(rotate(source, 180))];
  for (const attempt of attempts) {
    const parsed = parseResidenceCard(await attempt());
    if (parsed && (!best || Object.keys(parsed).length > Object.keys(best).length)) best = parsed;
    if (best?.arcNumber && best.visaType && best.names) break;
  }
  return best;
}
