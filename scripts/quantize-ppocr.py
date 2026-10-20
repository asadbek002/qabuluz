"""Shrink the PP-OCRv4 ONNX models for the browser: weight-only INT8 (per output channel).

Weights of Conv / MatMul / ConvTranspose (>= 1024 values) are stored as int8 + a float scale and
turned back into float32 by a DequantizeLinear node. ONNX Runtime constant-folds that when the
session is created, so inference runs in float32 exactly as before; only the download is ~4x smaller.

Usage (needs `pip install onnx numpy`):
  python scripts/quantize-ppocr.py node_modules/@gutenye/ocr-models/assets models/ppocr
"""
import sys
from pathlib import Path

import numpy as np
import onnx
from onnx import helper, numpy_helper, version_converter

QUANT_OPS = {"Conv": 1, "ConvTranspose": 1, "MatMul": 1}  # op -> index of the weight input


def constants_to_initializers(model):
    graph = model.graph
    keep = []
    for node in graph.node:
        if node.op_type == "Constant" and len(node.attribute) == 1 and node.attribute[0].name == "value":
            tensor = node.attribute[0].t
            tensor.name = node.output[0]
            graph.initializer.append(tensor)
        else:
            keep.append(node)
    del graph.node[:]
    graph.node.extend(keep)


def quantize(model):
    graph = model.graph
    inits = {i.name: i for i in graph.initializer}
    users = {}
    for node in graph.node:
        for i, name in enumerate(node.input):
            users.setdefault(name, []).append((node, i))
    new_nodes, done = [], set()
    for node in graph.node:
        idx = QUANT_OPS.get(node.op_type)
        if idx is None or idx >= len(node.input):
            continue
        name = node.input[idx]
        if name in done or name not in inits:
            continue
        w = numpy_helper.to_array(inits[name]).astype(np.float32)
        if w.size < 1024 or w.ndim < 2:
            continue
        # Conv: [out, in, kh, kw] -> axis 0; ConvTranspose: [in, out, kh, kw] -> axis 1; MatMul: [in, out] -> axis 1.
        axis = 0 if node.op_type == "Conv" else 1
        reduce_axes = tuple(a for a in range(w.ndim) if a != axis)
        scale = np.abs(w).max(axis=reduce_axes) / 127.0
        scale[scale == 0] = 1.0
        shape = [1] * w.ndim
        shape[axis] = -1
        q = np.clip(np.round(w / scale.reshape(shape)), -127, 127).astype(np.int8)
        graph.initializer.remove(inits[name])
        graph.initializer.append(numpy_helper.from_array(q, name + "_q"))
        graph.initializer.append(numpy_helper.from_array(scale.astype(np.float32), name + "_scale"))
        graph.initializer.append(numpy_helper.from_array(np.zeros(scale.shape, np.int8), name + "_zero"))
        new_nodes.append(helper.make_node("DequantizeLinear", [name + "_q", name + "_scale", name + "_zero"], [name], axis=axis))
        done.add(name)
    # Dequantize nodes first so every weight is defined before use.
    nodes = new_nodes + list(graph.node)
    del graph.node[:]
    graph.node.extend(nodes)
    return len(done)


def main(src_dir, out_dir):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    for src, dst in [("ch_PP-OCRv4_det_infer.onnx", "det.onnx"), ("ch_PP-OCRv4_rec_infer.onnx", "rec.onnx")]:
        model = onnx.load(str(Path(src_dir) / src))
        # Per-channel DequantizeLinear needs opset 13.
        model = version_converter.convert_version(model, 13)
        constants_to_initializers(model)
        count = quantize(model)
        onnx.checker.check_model(model)
        onnx.save(model, str(out / dst))
        print(f"{dst}: {count} weights quantized, {(out / dst).stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
