# NCNN Wasm Neural Network Inference Benchmark (`benchncnn`)

## Overview

The **NCNN** benchmarks (`Experimental-NCNN-*-wasm`) measure single-threaded CPU neural network inference performance in WebAssembly using [`ncnn`](https://github.com/Tencent/ncnn), Tencent's high-performance C++ neural network inference framework optimized for mobile and edge platforms.

Specifically, it compiles `libncnn` and upstream's standalone **`benchmark/benchncnn.cpp`** harness via CMake and Emscripten with 128-bit SIMD and relaxed SIMD enabled (`-O3 -ffast-math -msimd128 -mrelaxed-simd`, mapping NCNN's SSE2 SIMD intrinsics path to WebAssembly SIMD).

---

## How Measurement & Scoring Work

1. **Warm-Up & Timed Inference Loop:**
   Each sub-iteration invokes `benchncnn.wasm`. Before starting the timer, `benchncnn` runs several **untimed warm-up forward passes** to populate internal packed weight buffers and warm up CPU caches and Wasm JIT code, followed by the timed `Extractor` forward pass.

2. **Output & Aggregation:**
   `benchncnn` prints `<model>  min = <ms>  max = <ms>  avg = <ms>` timing of the extractor forward pass to `stderr`. The benchmark parses the `avg` inference duration in **milliseconds (`ms`)** for each sub-iteration (`<model> / sub-iter-N`).

---

## Top-Level Benchmarks & Sub-Benchmarks

The workload is split into **three top-level benchmarks**, selected from NCNN's benchmark suite to cover distinct WebAssembly SIMD compute and memory profiles with minimal overlap:

### 1. `Experimental-NCNN-ResNet50-INT8-wasm`

- **What it does:**
  Runs forward-pass image classification inference through an **8-bit integer quantized ResNet-50** deep residual convolutional network (50 layers with bottleneck blocks of `1 x 1`, `3 x 3`, and `1 x 1` convolutions and skip-connection additions).
- **What it tests in Wasm:**
    - **INT8 Symmetric Quantization & Requantization:** Dynamic FP32-to-INT8 activation quantization (`quantize`), INT32 accumulator dequantization/rescaling (`dequantize` / `requantize`), and fused activation clipping.
    - **INT8 SIMD Convolution & GEMM Kernels:** Exercises NCNN's 8-bit integer convolution kernels (`conv1x1s1_sgemm_int8`, `conv3x3s1_int8`), testing 128-bit Wasm SIMD 8-bit/16-bit integer widening multiply-accumulate instructions (`i16x8.extmul_*`, `i32x4.dot_i16x8_s`) and 4-channel/8-channel SIMD tensor packing (`elempack = 4` / `8`).

---

### 2. `Experimental-NCNN-EfficientNetV2-B0-wasm`

- **What it does:**
  Runs 32-bit floating-point (`f32`) inference on **EfficientNetV2-B0**, a modern mobile vision backbone that combines **Fused-MBConv** stages (dense `3 x 3` expansion convolutions in early layers) with **MBConv** inverted residual stages (`1 x 1` expansion + `3 x 3` depthwise separable convolution + **Squeeze-and-Excitation** attention + `1 x 1` projection) and **Swish (`SiLU`)** non-linear activations.
- **What it tests in Wasm:**
    - **Broad FP32 Operator Mix:** Tests how well the Wasm engine handles a diverse sequence of operator types within a single network—alternating between compute-dense `3 x 3` convolutions, bandwidth-bound `3 x 3` depthwise separable convolutions, global average pooling, channel-wise Squeeze-and-Excitation scaling, and element-wise residual additions.
    - **Vectorized Transcendental Math (`Swish` / `Sigmoid`):** Unlike ReLU-only networks, EfficientNetV2 applies $x \cdot \sigma(x) = x / (1 + e^{-x})$ across feature maps, exercising NCNN's SIMD polynomial `exp` approximation (`exp_ps`) and vector division/reciprocal instructions (`f32x4.div`).

---

### 3. `Experimental-NCNN-YOLOv4-Tiny-wasm`

- **What it does:**
  Runs 32-bit floating-point (`f32`) object detection backbone and multi-scale feature pyramid inference using **YOLOv4-Tiny** at a higher **`416 x 416` spatial resolution** (3.4x more pixels per input frame than `224 x 224` classification models) using Cross-Stage Partial (`CSPBlock`) connections, LeakyReLU activations, feature map concatenation, and upsampling.
- **What it tests in Wasm:**
    - **High-Resolution Dense FP32 `3 x 3` Convolutions (Winograd / SGEMM):** Stresses NCNN's SIMD-packed (`elempack = 4`) `3 x 3` Winograd (`conv3x3s1_winograd*`) and `im2col` + SGEMM floating-point kernels (`f32x4.mul` + `f32x4.add` / relaxed FMA) over large spatial feature maps.
    - **Memory Bandwidth & Cache Pressure:** Because intermediate feature tensors at `416 x 416` and `208 x 208` exceed L1/L2 cache capacity, plus CSP route splitting (`Crop` / `Slice`) and multi-branch `Concat` operations copy across feature pyramid levels, this benchmark stresses Wasm linear-memory bandwidth and cache locality alongside raw FP32 SIMD throughput.
