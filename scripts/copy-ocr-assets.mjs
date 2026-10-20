// Copies the OCR / PDF runtime files into public/ocr so they are served by this site
// (no third-party CDN; document images never leave the student's browser).
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const out = path.resolve("public/ocr");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const pdfDir = path.dirname(require.resolve("pdfjs-dist/package.json"));
copyFileSync(path.join(pdfDir, "legacy/build/pdf.worker.min.mjs"), path.join(out, "pdf.worker.min.mjs"));

// PaddleOCR (PP-OCRv4) models + onnxruntime-web WASM runtime.
mkdirSync(path.join(out, "ppocr"), { recursive: true });
mkdirSync(path.join(out, "ort"), { recursive: true });
const modelsDir = path.resolve("node_modules/@gutenye/ocr-models/assets");
copyFileSync(path.join(modelsDir, "ch_PP-OCRv4_det_infer.onnx"), path.join(out, "ppocr/det.onnx"));
copyFileSync(path.join(modelsDir, "ch_PP-OCRv4_rec_infer.onnx"), path.join(out, "ppocr/rec.onnx"));
copyFileSync(path.join(modelsDir, "ppocr_keys_v1.txt"), path.join(out, "ppocr/keys.txt"));
const ortDir = path.resolve("node_modules/onnxruntime-web/dist");
for (const f of ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"]) copyFileSync(path.join(ortDir, f), path.join(out, "ort", f));
console.log("OCR assets copied to public/ocr");
