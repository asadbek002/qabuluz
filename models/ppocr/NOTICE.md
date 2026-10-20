# PP-OCRv4 models (weight-only INT8)

`det.onnx` and `rec.onnx` are the PaddleOCR PP-OCRv4 detection / recognition models
(`ch_PP-OCRv4_det_infer.onnx`, `ch_PP-OCRv4_rec_infer.onnx` from the `@gutenye/ocr-models`
npm package, MIT; models by PaddlePaddle, Apache-2.0: https://github.com/PaddlePaddle/PaddleOCR)
with their Conv/MatMul weights stored as per-channel INT8 to make the browser download ~4x
smaller. Inference still runs in float32.

Regenerate with:

    pip install onnx numpy
    python scripts/quantize-ppocr.py node_modules/@gutenye/ocr-models/assets models/ppocr

After changing these files (or upgrading onnxruntime-web / pdfjs-dist), bump the version in
`lib/ocr/assets.json` so browsers fetch the new files instead of their year-long cached copy.
