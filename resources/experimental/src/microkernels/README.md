# Microkernels Wasm SIMD Benchmark (`mac` & `convert`)

## Overview

The **Microkernels** benchmarks (`Experimental-Microkernels-MAC-wasm` and `Experimental-Microkernels-Convert-wasm`) measure compiler auto-vectorization and WebAssembly SIMD instruction throughput across a comprehensive matrix of integer and floating-point multiply-accumulate (MAC) reductions and element-wise type conversions, adapted from Arm's [`wasm-perf/benchmarks/microkernels`](https://gitlab.arm.com/runtimes/wasm-perf/-/tree/aee16b1a619868c65abf45ff89ca29160d9c36fd/benchmarks/microkernels) (`aee16b1`) suite.

---

## Why Include Microkernels in a WebAI Compute Benchmark?

While hand-tuned inference engines (`ggml`, `ncnn`) use explicit SIMD intrinsics for specific quantized matrix-multiply layouts, broader WebAI workloads depend heavily on **Clang/LLVM loop auto-vectorization and the browser Wasm JIT's SIMD lowering** across diverse data types and struct layouts:

- **Mixed-Precision Multiply-Accumulate (`MAC`):** Quantized convolutions, dot products, and multi-channel signal processing routinely multiply narrow inputs (`int8`, `uint8`, `int16`) into wider integer (`int16`, `int32`, `int64`) or floating-point (`float`, `double`) accumulators over both flat arrays (`1D`) and interleaved multi-channel structs (`2D`, `3D`, `4D`). This isolates widening SIMD multiplies (`i16x8.extmul_*`, `i32x4.extmul_*`), integer dot-product lowering (`i32x4.dot_i16x8_s` / relaxed dot-product instructions), and horizontal vector reductions.
- **Bulk Type Widening, Narrowing & Float-Int Casts (`Convert`):** Tensor ingestion (converting `uint8` image pixels or `int16` PCM audio to `float`), dynamic quantization/dequantization, and precision casting spend substantial wall-clock time streaming through linear memory while extending, truncating, or converting between `8`-, `16`-, `32`-, and `64`-bit integers and `float`/`double`.

---

## How Measurement & Scoring Work

1. **Per-Run Fresh Instantiation & Input Generation:**
   Each sub-benchmark instantiates a fresh `microkernels.wasm` and for every kernel variant, the harness allocates input buffers of `N` elements on the heap and populates them with pseudo-random values (`fast_rand()`) outside the timed region.

2. **Internal Vector Timing & Scalar Validation:**
   For each type combination, the C++ harness runs and times the **auto-vectorized loop** then runs an unvectorized **scalar reference loop** (`#pragma clang loop vectorize(disable)`) to verify correctness (using exact equality for integers and relative tolerance for reassociated `-ffast-math` floating-point reductions). If any kernel fails validation, the benchmark throws an error.

3. **Output & Aggregation (`ms`):**
   Although the binary executes both vectorized and scalar loops for validation, the benchmark parses **only the cumulative vectorized kernel time** (`total mac vector run time` or `total convert vector run time`, in **milliseconds, `ms`**), excluding buffer allocation, random initialization, and scalar reference execution:
    - **`Experimental-Microkernels-MAC-wasm`:** Reports the **sum** of its 4 dimensional sub-benchmarks (`1d`, `2d`, `3d`, `4d`), where each sub-benchmark sums vectorized execution times across **42 `(AccTy, InTyA, InTyB)` type combinations**.
    - **`Experimental-Microkernels-Convert-wasm`:** Reports a single `1d` sub-benchmark that sums vectorized execution times across **56 `(OutTy, InTy)` conversion pairs**.

---

## Top-Level Benchmarks & Sub-Benchmarks

### 1. `Experimental-Microkernels-MAC-wasm` — _Multiply-Accumulate Reductions (1D–4D)_

Evaluates multiply-accumulate reductions across **42 `(AccTy, InTyA, InTyB)` type combinations**:

- **Same-Width & Widening Integer Accumulators:** `int8`/`uint8`, `int16`/`uint16`, `int32`/`uint32`, and `int64`/`uint64` accumulators paired with signed and unsigned `8`-, `16`-, and `32`-bit inputs.
- **Mixed & Native Floating-Point Accumulators:** `float` accumulators over integer (`int8`, `int16`, `int32`) and `float` inputs, plus `double` accumulators over `float` and `double` inputs.

Each sub-benchmark tests the same 42 type combinations over a different data layout:

- **`1d` (`mac_1d` — Contiguous Scalar Arrays):**
  Computes `vec_res += static_cast<AccTy>(a[i]) * static_cast<AccTy>(b[i])` over flat contiguous arrays `InTyA[N]` and `InTyB[N]`. Isolates unit-stride SIMD loads, widening/promoting multiplies, vector lane accumulation, and final horizontal reduction.

- **`2d` (`mac_2d` — 2-Component Interleaved Structs, `Vector2D { x, y }`):**
  Accumulates independent `.x` and `.y` channels across arrays of 2-element structs (`Vector2D<T>[N]`, such as 2D UV/screen coordinates or stereo/complex pairs).

- **`3d` (`mac_3d` — 3-Component Interleaved Structs, `Vector3D { x, y, z }`):**
  Accumulates independent `.x`, `.y`, and `.z` channels across arrays of 3-element structs (`Vector3D<T>[N]`, such as RGB pixels, 3D positions, or surface normals). Because 3-component structs do not align evenly to power-of-two 128-bit SIMD lane counts, this sub-benchmark heavily stresses compiler interleaved-load / shuffle deinterleaving (`i8x16.swizzle`) and SLP vectorization.

- **`4d` (`mac_4d` — 4-Component Interleaved Structs, `Vector4D { x, y, z, w }`):**
  Accumulates independent `.x`, `.y`, `.z`, and `.w` channels across arrays of 4-element structs (`Vector4D<T>[N]`, such as RGBA pixels, quaternions, or 4D homogeneous coordinates).

---

### 2. `Experimental-Microkernels-Convert-wasm` — _Element-Wise Type Conversions_

Evaluates `out[i] = static_cast<OutTy>(in[i])` over `N` contiguous elements under sub-benchmark **`1d`**, summing vectorized execution time across **56 `(OutTy, InTy)` conversion pairs** spanning three categories:

- **Integer Widening & Sign-Casting (17 pairs):**
  Sign-extending, zero-extending, and reinterpreting `int8`, `uint8`, `int16`, `uint16`, and `int32` inputs into `int16`, `int32`, `uint32`, `int64`, and `uint64` outputs (`i16x8.extend_*_i8x16`, `i32x4.extend_*_i16x8`, `i64x2.extend_*_i32x4`).

- **Integer-to-Float & Float Promotion (13 pairs):**
  Converting `8`-, `16`-, and `32`-bit signed and unsigned integers to `float` and `double`, plus promoting `float` to `double` (`f32x4.convert_i32x4_s/u`, `f64x2.convert_low_i32x4_s/u`, `f64x2.promote_low_f32x4`).

- **Integer Narrowing & Float-to-Integer Truncation (26 pairs):**
  Demoting wider integers (`16`-, `32`-, and `64`-bit) and truncating `float` and `double` inputs (initialized within valid target integer range so C++ float-to-int casts avoid undefined behavior) down to `int8`, `uint8`, `int16`, `uint16`, and `int32` (`i32x4.trunc_sat_f32x4_s/u`, `i32x4.trunc_sat_f64x2_s/u_zero`, and SIMD byte/word narrowing shuffles).
