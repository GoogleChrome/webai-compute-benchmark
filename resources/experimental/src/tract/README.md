# Tract Wasm Neural Network Inference Benchmark

## Overview

The **Tract** benchmarks (`Experimental-Tract-*-wasm`) measure end-to-end neural network graph optimization and single-threaded CPU inference performance in WebAssembly using [`tract`](https://github.com/sonos/tract) (`v0.22.0`), Sonos's pure-Rust, self-contained ONNX and TensorFlow Lite inference engine.

The three example binaries (`example-onnx-mobilenet-v2`, `example-pytorch-resnet`, and `example-tflite-mobilenet-v3`) are compiled from Rust to `wasm32-unknown-emscripten` with 128-bit SIMD and relaxed SIMD enabled.

---

## How Measurement & Scoring Work

The benchmark measures and sums two compute-intensive phases:

- **`optimize_time`:** Tract's ahead-of-time graph compiler, which performs constant folding, operator fusion (e.g., fusing Conv2D + BatchNorm + ReLU/Clip), layout selection (`NCHW` vs. packed `HWIO`/`MMM` tiles), and kernel selection.
- **`run_time` (`resize` + tensor normalization + `model.run(...)`):** Bilinear/triangle image resizing to 224 x 224 x 3, RGB-to-FP32 tensor normalization, and full forward-pass neural network inference.

**Output & Aggregation:**
Each invocation prints the total time of both phases, and each top-level suite, which represents a specific model architectur, reports the sum of its sub-benchmarks, which represent a different quantization.

---

## Top-Level Benchmarks & Sub-Benchmarks

The workload is split into **three top-level benchmarks** by model architecture and framework format:

### 1. `Experimental-Tract-ONNX-MobileNet-V2-wasm`

Runs image classification on a static 224x224 image using **MobileNetV2** (an efficient mobile CNN architecture built around inverted residual blocks and depthwise separable convolutions). It compares three precision/quantization representations of the same ONNX graph:

- **`example-onnx-mobilenet-v2` (`mobilenetv2-7.onnx` — FP32 Baseline):**
  Standard 32-bit floating-point (`f32`) MobileNetV2.

- **`example-onnx-mobilenet-v2-quantized-qdq` (`mobilenetv2-7-qdq.onnx` — INT8 QDQ):**
  8-bit quantized MobileNetV2 encoded in ONNX **QDQ (`QuantizeLinear` / `DequantizeLinear`)** format. Tests Tract's graph optimizer (`into_optimized()`), which must pattern-match and fold QDQ node pairs into true quantized operators before executing INT8 convolutions.

- **`example-onnx-mobilenet-v2-quantized-qo` (`mobilenetv2-7-qo.onnx` — INT8 QOperator):**
  8-bit quantized MobileNetV2 encoded directly with ONNX **QOperator (`QLinearConv`, `QLinearMatMul`, `QLinearAdd`)** integer operators. Because the graph is already lowered to integer ops, graph optimization is faster and execution focuses directly on 8-bit integer (`i8`/`u8` → `i32`) SIMD dot-product and requantization kernels.

---

### 2. `Experimental-Tract-PyTorch-ResNet-wasm`

Runs image classification on a static 224x224 image using a PyTorch-exported **ResNet-18** model. Unlike MobileNetV2's lightweight depthwise convolutions, ResNet uses **dense $3 \times 3$ standard convolutions** with large channel counts (64 to 512 channels) and residual skip connections—making it roughly 3 times heavier in raw compute and memory footprint:

- **`example-pytorch-resnet` (`resnet.onnx` — FP32 Baseline):**
  32-bit floating-point ResNet. Heavily compute-bound on `im2col` / indirect tiled general matrix multiplication (GEMM) using Wasm `f32x4` SIMD FMA loops.

- **`example-pytorch-resnet-quantized-qdq` (`resnet-qdq.onnx` — INT8 QDQ):**
  8-bit Quantize/Dequantize (`QuantizeLinear` / `DequantizeLinear`) ResNet. Stresses both Tract's QDQ graph-rewriting passes on a deep residual graph and INT8 GEMM tile execution.

- **`example-pytorch-resnet-quantized-qo` (`resnet-qo.onnx` — INT8 QOperator):**
  8-bit QOperator (`QLinearConv`) ResNet. Isolates dense INT8 matrix-multiplication throughput on large 3 x 3 convolutional layers.

---

### 3. `Experimental-Tract-TFLite-MobileNet-V3-wasm`

Runs image classification on a static 224 x 224 image using Google's **TensorFlow Lite (`.tflite`)** flatbuffer format instead of ONNX:

- **`example-tflite-mobilenet-v3` (`mobilenet_v3_small_100_224.tflite` — FP32 TFLite):**
  32-bit floating-point **MobileNetV3-Small**. In addition to depthwise separable convolutions, MobileNetV3 introduces **Squeeze-and-Excitation (SE)** global pooling blocks and **Hard-Swish** non-linear activations, testing Tract's `tract-tflite` subgraph translator and element-wise activation fusion in Wasm.
