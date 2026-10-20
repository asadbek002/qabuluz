// Browser-only OCR: turns an uploaded image or PDF into text with tesseract.js and parses it.
// Everything runs on the student's device; the engine files are served from /ocr (see
// scripts/copy-ocr-assets.mjs), so no document image is sent anywhere for recognition.
import type { Worker } from "tesseract.js";
import { parsePassport, parseResidenceCard, type PassportData, type ResidenceCardData } from "./parse";

let workerPromise: Promise<Worker> | null = null;

function getWorker() {
  workerPromise ??= import("tesseract.js").then((mod) => {
    // CommonJS package: bundlers expose it either as named exports or under `default`.
    const createWorker = typeof mod.createWorker === "function" ? mod.createWorker : mod.default.createWorker;
    return createWorker("eng", 1, { workerPath: "/ocr/worker.min.js", corePath: "/ocr/core", langPath: "/ocr/lang", gzip: false });
  }).catch((error) => { workerPromise = null; throw error; });
  return workerPromise;
}

/** Start downloading the OCR engine early (e.g. when the documents step opens). */
export function preloadOcr() {
  getWorker().catch(() => {});
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

/** Crop (fractions of the source), rotate, scale to `targetWidth` and convert to high-contrast grayscale. */
function prepare(src: HTMLCanvasElement, opts: { top?: number; bottom?: number; rotate?: 0 | 90 | 270; targetWidth: number }) {
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
  for (let i = 0; i < d.length; i += 4) {
    const g = ((d[i] - min) * 255) / range;
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

function rotate(src: HTMLCanvasElement, deg: 90 | 270) {
  const out = document.createElement("canvas");
  out.width = src.height;
  out.height = src.width;
  const ctx = out.getContext("2d")!;
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}

const MRZ_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<";

async function ocr(canvas: HTMLCanvasElement, mode: "page" | "mrz") {
  const worker = await getWorker();
  await worker.setParameters({
    tessedit_char_whitelist: mode === "mrz" ? MRZ_CHARS : "",
    tessedit_pageseg_mode: (mode === "mrz" ? "6" : "3") as never,
    preserve_interword_spaces: "1",
  });
  const { data } = await worker.recognize(canvas);
  return data.text;
}

export type PassportResult = { data: PassportData | null; pdf: boolean };

/** Reads the passport data page: dedicated MRZ passes first, then the whole page as fallback. */
export async function readPassport(file: File): Promise<PassportResult> {
  const source = await toCanvas(file);
  let best: PassportData | null = null;
  const attempts: [Parameters<typeof prepare>[1], "page" | "mrz"][] = [
    [{ top: 0.7, targetWidth: 1800 }, "mrz"],
    [{ top: 0.55, targetWidth: 1800 }, "mrz"],
    [{ targetWidth: 2000 }, "page"],
    [{ rotate: 90, top: 0.6, targetWidth: 1800 }, "mrz"],
    [{ rotate: 270, top: 0.6, targetWidth: 1800 }, "mrz"],
  ];
  let pageText = "";
  let mrzText = "";
  for (const [opts, mode] of attempts) {
    const text = await ocr(prepare(source, opts), mode);
    if (mode === "page") pageText = text;
    const parsed = parsePassport(`${pageText}\n${text}`);
    if (parsed && (!best || score(parsed) > score(best))) { best = parsed; if (mode === "mrz") mrzText = text; }
    if (best?.verified && best.lastName && best.firstName) break;
  }
  // The MRZ truncates long names; when it was read before the full page, also read the
  // printed names and let parsePassport merge them.
  if (best?.verified && !pageText) {
    const merged = parsePassport(`${await ocr(prepare(source, { targetWidth: 2000 }), "page")}\n${mrzText}`);
    if (merged?.verified) best = merged;
  }
  return { data: best, pdf: isPdf(file) };
}

function score(p: PassportData) {
  return (p.verified ? 10 : 0) + ["lastName", "firstName", "middleName", "passportNumber", "birthDate", "gender", "citizenship"].filter((k) => p[k as keyof PassportData]).length;
}

export async function readResidenceCard(file: File): Promise<ResidenceCardData | null> {
  const source = await toCanvas(file);
  let best: ResidenceCardData | null = null;
  for (const opts of [{ targetWidth: 1600 }, { targetWidth: 2400 }, { rotate: 90 as const, targetWidth: 1600 }, { rotate: 270 as const, targetWidth: 1600 }]) {
    const parsed = parseResidenceCard(await ocr(prepare(source, opts), "page"));
    if (parsed && (!best || Object.keys(parsed).length > Object.keys(best).length)) best = parsed;
    if (best?.arcNumber && best.visaType) break;
  }
  return best;
}
