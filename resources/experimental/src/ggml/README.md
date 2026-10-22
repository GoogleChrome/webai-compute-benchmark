# GGML Wasm Quantization & Dot-Product Benchmark (`test-quantize-perf`)

## Overview

The **GGML** benchmark (`Experimental-GGML-wasm`) measures the core low-bit integer quantization and vector dot-product microkernels that power local Large Language Model (LLM) inference (such as `llama.cpp` and `Gemma.cpp`) in WebAssembly.

It compiles [`ggml`](https://github.com/ggml-org/ggml) (`v0.9.4`)—including its hand-tuned WebAssembly SIMD quantization kernels in `src/ggml-cpu/arch/wasm/quants.c`—into `test-quantize-perf.wasm` using Emscripten with 128-bit SIMD and relaxed SIMD enabled (`-O3 -msimd128 -mrelaxed-simd`).

---

## Why Quantization Matters for WebAI / LLM Inference

During single-batch LLM token generation (autoregressive decoding), over **90% of CPU execution time** is spent in matrix-vector multiplication.

Instead of decompressing weights back into 32-bit floats (`f32`) in memory, GGML:

1. Quantizes the incoming `f32` activation vector `x` on the fly into an intermediate 8-bit block format (`Q8_0`, `Q8_1`, or `Q8_K`).
2. Computes the dot product directly between the compressed weight blocks (`Q4_0`, `Q4_K`, etc.) and the quantized activation blocks using **128-bit Wasm SIMD integer multiply-accumulate instructions** (`i16x8.extmul_*`, `i32x4.dot_i16x8_s`, `i8x16.swizzle`).

---

## How Measurement & Scoring Work

- Each sub-benchmark invokes `test-quantize-perf.wasm` with CLI flags:
  `--op <op_name> --iterations 10 -3`
    - **`-3` (L1 Cache Working Set):** Selects an array size of **32,768 floats** (32K elements = 128 KB as `f32`), chosen to fit inside the CPU's L1/L2 cache so the benchmark isolates **Wasm SIMD instruction throughput** rather than main-memory RAM bandwidth.
    - **`--iterations 10`:** Runs each quantization type's kernel 10 times per invocation.
    - **Quantization Formats Tested:** Within a single run, `test-quantize-perf` iterates through GGML's supported quantization block formats.
- **Timing:** The benchmark measures the wall-clock execution time (in **milliseconds, `ms`**) of each sub-benchmark, and reports their sum as the `Experimental-GGML-wasm` total.

---

## Top-Level Benchmark

- **`Experimental-GGML-wasm`**: Runs the two real-time LLM inference hot-path operations (`vec_dot_q` and `quantize_row_q_dot`) as sub-benchmarks.

---

## Sub-Benchmarks Explained

### 1. `vec_dot_q` — _Quantized Vector Dot Product (LLM Matrix-Multiply Inner Loop)_

- **CLI invocation:** `--op vec_dot_q --iterations 10 -3`
- **What it does:**
  Calls `ggml_get_type_traits_cpu(type)->vec_dot(...)` across every quantized weight format. Given a row of pre-quantized model weights (e.g., 4-bit `Q4_0` or super-block `Q4_K`) and a row of quantized activations (`Q8_0` / `Q8_K`), it computes their scalar dot product `sum(w_i * x_i)` directly in compressed form.
- **What it tests in Wasm:**
    - **Bit unpacking & nibble extraction:** Splitting packed 2-, 3-, 4-, 5-, and 6-bit weight nibbles into 8-bit signed integers using SIMD bitwise masks (`v128.and`), shifts (`i16x8.shr_u`), and lookup tables (`i8x16.swizzle`).
    - **Integer SIMD multiply-accumulate:** Widening 8-bit weights × 8-bit activations into 16-bit and 32-bit integer accumulators (`i32x4.dot_i16x8_s` / relaxed dot-product instructions).
    - **Block-scale accumulation:** Converting each 32- or 256-element block's integer sum to `f32`, multiplying by the block's `fp16`-to-`f32` scale factor (and min/zero-point offset for asymmetric formats), and accumulating into a `f32x4` register.

### 2. `quantize_row_q_dot` — _On-the-Fly Activation Quantization_

- **CLI invocation:** `--op quantize_row_q_dot --iterations 10 -3`
- **What it does:**
  Calls `ggml_get_type_traits_cpu(type)->from_float(...)` for the activation dot-product format (`vec_dot_type`, typically `Q8_0`, `Q8_1`, or `Q8_K`) associated with each weight quantization type. Before `vec_dot_q` can run during LLM inference, the incoming `f32` activation vector from the previous layer must be dynamically quantized into 8-bit integer blocks.
- **What it tests in Wasm:**
    - **SIMD Horizontal Reductions:** Finding the maximum absolute value (`max(|x_i|)`) across each 32- or 256-float block using `f32x4.abs` and `f32x4.max`.
    - **Reciprocal Scaling & Rounding:** Computing the block scale factor `d = max(|x_i|) / 127`, multiplying all 32 floats by `1 / d`, rounding to nearest integer (`f32x4.nearest` + `i32x4.trunc_sat_f32x4_s`), narrowing `i32x4` → `i16x8` → `i8x16` (`i8x16.narrow_i16x8_s`), and computing block sums needed by asymmetric formats.

---

## Omitted `test-quantize-perf` Modes (Not Run)

`test-quantize-perf.cpp` supports three additional `--op` modes that are intentionally excluded from `SUB_BENCHMARKS` because they represent offline model preparation or unvectorized baselines rather than real-time inference:

- **`quantize_row_q_reference`:** Unvectorized scalar C reference implementation used only for correctness testing.
- **`quantize_row_q`:** Offline float32-to-quantized model weight compression (used when converting a model on disk, not during token generation).
- **`dequantize_row_q`:** Unpacking quantized weights back to `f32` (only used as a fallback for operators that lack a direct `vec_dot_q` kernel).
