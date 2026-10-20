// Copies the OCR / PDF runtime files into public/ocr/<version> so they are served by this site
// (no third-party CDN; document images never leave the student's browser). The version folder
// (lib/ocr/assets.json) lets them be cached for a year: bump it whenever these files change.
import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { version } = JSON.parse(readFileSync("lib/ocr/assets.json", "utf8"));
rmSync(path.resolve("public/ocr"), { recursive: true, force: true });
const out = path.resolve("public/ocr", version);
mkdirSync(path.join(out, "ppocr"), { recursive: true });
mkdirSync(path.join(out, "ort"), { recursive: true });

const pdfDir = path.dirname(require.resolve("pdfjs-dist/package.json"));
copyFileSync(path.join(pdfDir, "legacy/build/pdf.worker.min.mjs"), path.join(out, "pdf.worker.min.mjs"));

// PaddleOCR PP-OCRv4 models, weight-only INT8 (models/ppocr, made by scripts/quantize-ppocr.py
// from @gutenye/ocr-models) + the dictionary + the onnxruntime-web WASM runtime.
copyFileSync("models/ppocr/det.onnx", path.join(out, "ppocr/det.onnx"));
copyFileSync("models/ppocr/rec.onnx", path.join(out, "ppocr/rec.onnx"));
copyFileSync(path.resolve("node_modules/@gutenye/ocr-models/assets/ppocr_keys_v1.txt"), path.join(out, "ppocr/keys.txt"));
const ortDir = path.resolve("node_modules/onnxruntime-web/dist");
for (const f of ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"]) copyFileSync(path.join(ortDir, f), path.join(out, "ort", f));
console.log(`OCR assets copied to public/ocr/${version}`);
