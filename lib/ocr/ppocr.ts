// Browser-only PaddleOCR (PP-OCRv4) pipeline on onnxruntime-web:
//   detection (DBNet: probability map -> text boxes) + recognition (CRNN + CTC per box).
// Models and the WASM runtime are served from /ocr (scripts/copy-ocr-assets.mjs); images never
// leave the device. The document is already upright when it gets here, so boxes are axis-aligned.
import type { InferenceSession, Tensor } from "onnxruntime-web";
import { version as assetsVersion } from "./assets.json";

/** Versioned folder of the OCR files (cached for a year, see next.config.ts). */
export const OCR_BASE = `/ocr/${assetsVersion}`;

type Ort = typeof import("onnxruntime-web");
type Engine = { ort: Ort; det: InferenceSession; rec: InferenceSession; dict: string[] };

let enginePromise: Promise<Engine> | null = null;

function loadEngine() {
  enginePromise ??= (async () => {
    const ort = (await import("onnxruntime-web/wasm")) as unknown as Ort;
    ort.env.wasm.wasmPaths = `${OCR_BASE}/ort/`;
    // Threads need a cross-origin isolated page (COOP/COEP headers, see next.config.ts);
    // otherwise run single-threaded, which works everywhere.
    ort.env.wasm.numThreads = globalThis.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
    const options: InferenceSession.SessionOptions = { executionProviders: ["wasm"], graphOptimizationLevel: "all" };
    const [det, rec, keys] = await Promise.all([
      ort.InferenceSession.create(`${OCR_BASE}/ppocr/det.onnx`, options),
      ort.InferenceSession.create(`${OCR_BASE}/ppocr/rec.onnx`, options),
      fetch(`${OCR_BASE}/ppocr/keys.txt`).then((r) => r.text()),
    ]);
    // CTC classes: 0 = blank, then the dictionary, then the space character.
    const dict = ["", ...keys.split(/\r?\n/).filter((l, i, all) => l !== "" || i < all.length - 1), " "];
    return { ort, det, rec, dict };
  })().catch((error) => { enginePromise = null; throw error; });
  return enginePromise;
}

export function preloadPpOcr() {
  loadEngine().catch(() => {});
}

export type OcrLine = { text: string; score: number; box: { x: number; y: number; w: number; h: number } };

const DET_MEAN = [0.485, 0.456, 0.406];
const DET_STD = [0.229, 0.224, 0.225];

function pixels(canvas: HTMLCanvasElement) {
  return canvas.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height).data;
}

function resized(src: HTMLCanvasElement, width: number, height: number, sx = 0, sy = 0, sw = src.width, sh = src.height) {
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, width, height);
  return out;
}

/** Find text boxes. `limit` caps the longer side fed to the detector (multiple of 32). */
async function detect(engine: Engine, src: HTMLCanvasElement, limit: number) {
  const scale = Math.min(1, limit / Math.max(src.width, src.height));
  const w = Math.max(32, Math.round((src.width * scale) / 32) * 32);
  const h = Math.max(32, Math.round((src.height * scale) / 32) * 32);
  const data = pixels(resized(src, w, h));
  const input = new Float32Array(3 * w * h);
  // PaddleOCR feeds BGR with these (RGB-ordered) mean/std values; mirror it exactly.
  for (let i = 0, p = 0; p < w * h; i += 4, p++) {
    input[p] = (data[i + 2] / 255 - DET_MEAN[0]) / DET_STD[0];
    input[w * h + p] = (data[i + 1] / 255 - DET_MEAN[1]) / DET_STD[1];
    input[2 * w * h + p] = (data[i] / 255 - DET_MEAN[2]) / DET_STD[2];
  }
  const out = await engine.det.run({ [engine.det.inputNames[0]]: new engine.ort.Tensor("float32", input, [1, 3, h, w]) });
  const prob = (out[engine.det.outputNames[0]] as Tensor).data as Float32Array;

  // Connected components of the binarised probability map (DBNet post-processing).
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < prob.length; i++) mask[i] = prob[i] > 0.3 ? 1 : 0;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const boxes: OcrLine["box"][] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let minX = w, minY = h, maxX = 0, maxY = 0, area = 0, sum = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % w, y = (p - x) / w;
      area++;
      sum += prob[p];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (q < 0 || q >= mask.length || seen[q] || !mask[q]) continue;
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === w - 1)) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    if (bh < 3 || bw < 3 || sum / area < 0.6) continue;
    // "Unclip": the model predicts shrunken text kernels; grow them back (ratio 1.5).
    const d = (bw * bh * 1.5) / (2 * (bw + bh));
    const x0 = Math.max(0, minX - d), y0 = Math.max(0, minY - d);
    const x1 = Math.min(w, maxX + 1 + d), y1 = Math.min(h, maxY + 1 + d);
    boxes.push({ x: (x0 / w) * src.width, y: (y0 / h) * src.height, w: ((x1 - x0) / w) * src.width, h: ((y1 - y0) / h) * src.height });
  }
  return boxes;
}

const REC_HEIGHT = 48;

async function recognize(engine: Engine, src: HTMLCanvasElement, box: OcrLine["box"]) {
  const width = Math.min(3200, Math.max(16, Math.ceil((REC_HEIGHT * box.w) / box.h)));
  const data = pixels(resized(src, width, REC_HEIGHT, box.x, box.y, box.w, box.h));
  const n = width * REC_HEIGHT;
  const input = new Float32Array(3 * n);
  for (let i = 0, p = 0; p < n; i += 4, p++) {
    input[p] = (data[i + 2] / 255 - 0.5) / 0.5;
    input[n + p] = (data[i + 1] / 255 - 0.5) / 0.5;
    input[2 * n + p] = (data[i] / 255 - 0.5) / 0.5;
  }
  const out = await engine.rec.run({ [engine.rec.inputNames[0]]: new engine.ort.Tensor("float32", input, [1, 3, REC_HEIGHT, width]) });
  const tensor = out[engine.rec.outputNames[0]] as Tensor;
  const [, steps, classes] = tensor.dims as number[];
  const probs = tensor.data as Float32Array;
  let last = 0, scoreSum = 0, count = 0;
  const chars: { ch: string; x: number }[] = [];
  for (let t = 0; t < steps; t++) {
    let best = 0, bestP = -Infinity;
    for (let c = 0; c < classes; c++) {
      const v = probs[t * classes + c];
      if (v > bestP) { bestP = v; best = c; }
    }
    if (best !== 0 && best !== last) {
      chars.push({ ch: engine.dict[best] ?? "", x: ((t + 0.5) * width) / steps });
      scoreSum += bestP;
      count++;
    }
    last = best;
  }
  return { text: withWordSpaces(chars, blankColumns(data, width)), score: count ? scoreSum / count : 0, data, width };
}

/** Columns of the (48 px high) line image that contain no ink. */
function blankColumns(data: Uint8ClampedArray, width: number) {
  const gray = new Float32Array(width * REC_HEIGHT);
  let min = 255, max = 0;
  for (let p = 0; p < gray.length; p++) {
    const g = 0.299 * data[p * 4] + 0.587 * data[p * 4 + 1] + 0.114 * data[p * 4 + 2];
    gray[p] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const threshold = min + (max - min) * 0.5;
  const blank = new Uint8Array(width);
  for (let x = 0; x < width; x++) {
    let ink = 0;
    for (let y = 4; y < REC_HEIGHT - 4; y++) if (gray[y * width + x] < threshold) ink++;
    blank[x] = ink === 0 ? 1 : 0;
  }
  return blank;
}

const MIN_WORD_GAP = REC_HEIGHT * 0.4;

/** Word segments [from, to) of a line image, split at blank runs wider than a letter gap. */
function wordSegments(blank: Uint8Array) {
  const segments: [number, number][] = [];
  let start = -1, run = 0;
  for (let x = 0; x <= blank.length; x++) {
    const empty = x === blank.length || blank[x];
    if (!empty) {
      if (start < 0) start = x;
      run = 0;
    } else if (start >= 0) {
      run++;
      if (run >= MIN_WORD_GAP || x === blank.length) { segments.push([start, x - run + 1]); start = -1; run = 0; }
    }
  }
  return segments;
}

/**
 * The Chinese/English model rarely emits spaces ("SATTAROVELBEK"). Put them back where the
 * line image has a blank column run wider than a letter gap between two recognised characters.
 */
function withWordSpaces(chars: { ch: string; x: number }[], blank: Uint8Array) {
  if (chars.length < 2) return chars.map((c) => c.ch).join("");
  let out = chars[0].ch;
  for (let i = 1; i < chars.length; i++) {
    const from = Math.round(chars[i - 1].x), to = Math.round(chars[i].x);
    let run = 0, longest = 0;
    for (let x = from; x < to; x++) { run = blank[x] ? run + 1 : 0; if (run > longest) longest = run; }
    if (longest >= MIN_WORD_GAP && chars[i].ch !== " " && !out.endsWith(" ")) out += " ";
    out += chars[i].ch;
  }
  return out;
}

/**
 * The model knows Latin and Chinese but not Hangul. On a line like "체류자격 유학 (D-2)" the
 * Hangul confuses it and even "(D-2)" is lost; reading each word separately recovers it.
 */
async function recognizeLine(engine: Engine, src: HTMLCanvasElement, box: OcrLine["box"]) {
  const first = await recognize(engine, src, box);
  if (!/[^\x00-\x7F]|\(\s*\)|（\s*）/.test(first.text)) return first;
  const segments = wordSegments(blankColumns(first.data, first.width));
  if (segments.length < 2) return first;
  const words: string[] = [];
  let scoreSum = 0;
  for (const [from, to] of segments) {
    const pad = 4;
    const x0 = Math.max(0, from - pad), x1 = Math.min(first.width, to + pad);
    const sub = { x: box.x + (x0 / first.width) * box.w, y: box.y, w: ((x1 - x0) / first.width) * box.w, h: box.h };
    const word = await recognize(engine, src, sub);
    words.push(word.text.trim());
    scoreSum += word.score;
  }
  return { ...first, text: words.filter(Boolean).join(" "), score: scoreSum / segments.length };
}

/** Recognise all text lines of an (upright) image, top to bottom. */
export async function readLines(src: HTMLCanvasElement, limit = 1280, maxBoxes = Infinity): Promise<OcrLine[]> {
  const engine = await loadEngine();
  let boxes = await detect(engine, src, limit);
  // For a quick orientation probe only the widest lines are needed.
  if (boxes.length > maxBoxes) boxes = [...boxes].sort((a, b) => b.w - a.w).slice(0, maxBoxes);
  const lines: OcrLine[] = [];
  for (const box of boxes) {
    const { text, score } = await recognizeLine(engine, src, box);
    if (text.trim()) lines.push({ text, score, box });
  }
  return lines;
}

/** Join detected boxes into text lines (boxes overlapping vertically form one line). */
export function linesToText(lines: OcrLine[]) {
  const sorted = [...lines].sort((a, b) => a.box.y + a.box.h / 2 - (b.box.y + b.box.h / 2));
  const rows: OcrLine[][] = [];
  for (const line of sorted) {
    const cy = line.box.y + line.box.h / 2;
    const row = rows.find((r) => Math.abs(r[0].box.y + r[0].box.h / 2 - cy) < Math.min(r[0].box.h, line.box.h) * 0.5);
    if (row) row.push(line); else rows.push([line]);
  }
  // NFKC turns full-width forms the Chinese model likes ("（Ｄ－８）") into ASCII.
  return rows.map((r) => r.sort((a, b) => a.box.x - b.box.x).map((l) => l.text).join(" ")).join("\n").normalize("NFKC");
}
