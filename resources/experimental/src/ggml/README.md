# GGML Wasm Quantization & Dot-Product Benchmark (`test-quantize-perf`)

## Overview

The **GGML** benchmark (`Experimental-GGML-wasm`) measures the low-bit quantization and vector dot-product kernels that power local Large Language Model (LLM) inference (such as `llama.cpp`) in WebAssembly.

It compiles [`ggml`](https://github.com/ggml-org/ggml) `v1.0.0` ([`417a024b`](https://github.com/ggml-org/ggml/tree/417a024b4fb6bc3116d41af7c067166a039bdf12)), including its hand-written WebAssembly SIMD kernels in `src/ggml-cpu/arch/wasm/quants.c`, together with ggml's own `tests/test-quantize-perf.cpp` driver into `build/test-quantize-perf.wasm`. It is built with Emscripten using `-O3 -msimd128 -mrelaxed-simd` (see [`build-wasm.sh`](build-wasm.sh) and [`build/README.md`](build/README.md) for the exact compiler version and flags).

---

## Why Quantization Matters for WebAI / LLM Inference

During single-batch LLM token generation (autoregressive decoding), most CPU time is spent in matrix-vector multiplication.

Instead of decompressing weights back into 32-bit floats (`f32`) in memory, GGML:

1. Quantizes the incoming `f32` activation vector on the fly into an intermediate 8-bit block format (`Q8_0`, `Q8_1`, or `Q8_K`).
2. Computes the dot product directly between the compressed weight blocks (`Q4_0`, `Q4_K`, etc.) and the quantized activation blocks using 128-bit Wasm SIMD integer arithmetic.

---

## How Measurement & Scoring Work

- Each sub-benchmark instantiates the precompiled `test-quantize-perf.wasm` module (compilation happens once, outside the measurement) and runs its `main()` with:
  `--op <op_name> --iterations 10 -3`
    - **`-3`:** Runs every kernel at **three array sizes**: 4,096, 65,536, and 655,360 floats (16 KB, 256 KB, and 2.5 MB as `f32`). These are ggml's nominal L1/L2/L3 sizes; the largest does not fit in the L1 or L2 cache of typical CPUs.
    - **`--iterations 10`:** At each size, the kernel runs 5 untimed warm-up iterations followed by 10 iterations.
    - **Types tested:** In one run, `test-quantize-perf` loops over every `ggml_type` that has both a CPU `from_float` and a `to_float` implementation. In v1.0.0 that is **21 types**: `f16`, `q4_0`, `q4_1`, `q5_0`, `q5_1`, `q8_0`, `q2_K`, `q3_K`, `q4_K`, `q5_K`, `q6_K`, `iq4_nl`, `iq4_xs`, `bf16`, `tq1_0`, `tq2_0`, `mxfp4`, `nvfp4`, `q1_0`, `q2_0`, `f8_e4m3`.
- **Timing:** The benchmark measures the wall-clock time (in **milliseconds, `ms`**) of each complete `test-quantize-perf` run and reports the sum of the two sub-benchmarks as the `Experimental-GGML-wasm` total. The program's own throughput output is discarded. Wall-clock time therefore also includes module instantiation, generating 2 × 655,360 random input floats, `ggml_cpu_init()` (which builds a 64K-entry fp16→fp32 lookup table), and per-type setup (see below).

---

## Top-Level Benchmark

- **`Experimental-GGML-wasm`**: Runs two LLM-inference-related operations (`vec_dot_q` and `quantize_row_q_dot`) as sub-benchmarks.

---

## Sub-Benchmarks Explained

### 1. `vec_dot_q`: Quantized Vector Dot Product

- **CLI invocation:** `--op vec_dot_q --iterations 10 -3`
- **What it does:**
  For each type, quantizes two 655,360-element `f32` arrays into that type with `from_float`. It then times `ggml_get_type_traits_cpu(type)->vec_dot(...)` on them, computing `sum(w_i * x_i)` directly on the compressed data.
- **What the timed kernels exercise in Wasm:**
    - **Hand-written Wasm SIMD dot products** (`arch/wasm/quants.c`) for `q4_0`, `q4_1`, `q5_0`, `q5_1`, `q8_0`, and `q2_K`–`q6_K`. These unpack 2- to 6-bit weights with `v128.and` / `i8x16.shr_u` / `i8x16.shl` / `v128.or`, sign-extend to 16-bit (`i16x8.extend_{low,high}_i8x16_s`), and multiply-accumulate with `i32x4.dot_i16x8_s`. Each block's integer sum is then scaled by its `fp16` scale factor (`f32x4.convert_i32x4_s`, `f32x4.mul`, `f32x4.add`).
    - **Scalar C fallbacks** (`*_generic`, possibly auto-vectorized by the compiler) for `iq4_nl`, `iq4_xs`, `mxfp4`, `nvfp4`, `q1_0`, `q2_0`, `tq1_0`, and `tq2_0`, which have no Wasm-specific kernel.
    - **Floating-point dot products** (`vec.cpp`, using ggml's generic Wasm SIMD `f32x4` mappings) for `f16`, `bf16`, and `f8_e4m3`. Note: since ggml switched to `f32` activations for `f16`, `f16`'s `vec_dot` expects an `f32` second operand, while `test-quantize-perf` still passes `f16`-encoded data. The `f16` result is therefore numerically meaningless, though it still does the same amount of work.

### 2. `quantize_row_q_dot`: On-the-Fly Activation Quantization

- **CLI invocation:** `--op quantize_row_q_dot --iterations 10 -3`
- **What it does:**
  For each type, times the `from_float` of that type's activation format (`vec_dot_type`). Before `vec_dot_q` can run during LLM inference, the incoming `f32` activation vector from the previous layer must be converted into this format. Many types share an activation format, so the 21 types exercise only a handful of distinct kernels:

    | Activation format | Kernel                          | Weight types using it                                              |
    | ----------------- | ------------------------------- | ------------------------------------------------------------------ |
    | `Q8_0`            | `quantize_row_q8_0` (Wasm SIMD) | `q4_0`, `q5_0`, `q8_0`, `iq4_nl`, `mxfp4`, `nvfp4`, `q1_0`, `q2_0` |
    | `Q8_1`            | `quantize_row_q8_1` (Wasm SIMD) | `q4_1`, `q5_1`                                                     |
    | `Q8_K`            | `quantize_row_q8_K` (Wasm SIMD) | `q2_K`, `q3_K`, `q4_K`, `q5_K`, `q6_K`, `iq4_xs`, `tq1_0`, `tq2_0` |
    | `BF16`            | `fp32` → `bf16` conversion      | `bf16`                                                             |
    | `F32`             | `memcpy`                        | `f16`, `f8_e4m3`                                                   |

- **What it tests in Wasm (`Q8_*` kernels):**
    - **`Q8_0` / `Q8_1` (32-float blocks):** Max-abs reduction with `f32x4.abs` and `f32x4.max`, scale `d = max|x| / 127`, multiply by `1 / d` (`f32x4.mul`), and convert with `i32x4.trunc_sat_f32x4_s`. Each byte is then stored with a per-lane `i32x4.extract_lane`. `Q8_1` also computes each block's sum.
    - **`Q8_K` (256-float blocks):** Min/max reduction with `f32x4.pmin` / `f32x4.pmax` and lane shuffles, scale by `-127 / amax`, round with `f32x4.nearest` + `i32x4.trunc_sat_f32x4_s`, narrow to 8-bit (`i16x8.narrow_i32x4_s`, `i8x16.narrow_i16x8_s`), store with `v128.store`, and compute the 16-element sub-block sums used by K-quant dot products.

---

## Omitted `test-quantize-perf` Modes (Not Run)

`test-quantize-perf.cpp` supports three additional `--op` modes that are intentionally excluded from `SUB_BENCHMARKS` because they represent offline model preparation or unvectorized baselines rather than real-time inference:

- **`quantize_row_q_reference`:** Unvectorized scalar C reference implementation used only for correctness testing.
- **`quantize_row_q`:** Offline float32-to-quantized model weight compression (used when converting a model on disk, not during token generation).
- **`dequantize_row_q`:** Unpacking quantized weights back to `f32` (only used as a fallback for operators that lack a direct `vec_dot_q` kernel).
