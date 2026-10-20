// Copies the OCR / PDF runtime files into public/ocr so they are served by this site
// (no third-party CDN; document images never leave the student's browser).
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { gunzipSync } from "node:zlib";

const require = createRequire(import.meta.url);
const out = path.resolve("public/ocr");
mkdirSync(path.join(out, "core"), { recursive: true });
mkdirSync(path.join(out, "lang"), { recursive: true });

const tesseractDir = path.dirname(require.resolve("tesseract.js/package.json"));
const coreDir = path.dirname(createRequire(path.join(tesseractDir, "package.json")).resolve("tesseract.js-core/package.json"));
const engDir = path.dirname(require.resolve("@tesseract.js-data/eng/package.json"));
const pdfDir = path.dirname(require.resolve("pdfjs-dist/package.json"));

copyFileSync(path.join(tesseractDir, "dist/worker.min.js"), path.join(out, "worker.min.js"));
// LSTM-only engine builds; the worker picks the fastest one the browser supports.
for (const f of ["tesseract-core-relaxedsimd-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-lstm.wasm.js"]) {
  copyFileSync(path.join(coreDir, f), path.join(out, "core", f));
}
// Stored uncompressed: the production static server does not serve *.gz files.
writeFileSync(path.join(out, "lang/eng.traineddata"), gunzipSync(readFileSync(path.join(engDir, "4.0.0_best_int/eng.traineddata.gz"))));
copyFileSync(path.join(pdfDir, "legacy/build/pdf.worker.min.mjs"), path.join(out, "pdf.worker.min.mjs"));
console.log("OCR assets copied to public/ocr");
