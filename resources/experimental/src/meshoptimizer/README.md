# Meshoptimizer Wasm Benchmark (`codecbench`)

## Overview

The **Meshoptimizer** benchmark (`Experimental-Meshoptimizer-wasm`) measures WebAssembly integer and 128-bit SIMD decompression performance using [`meshoptimizer`](https://github.com/zeux/meshoptimizer) (`v0.25`), a C++ 3D mesh optimization and compression library widely used in glTF, WebGL/WebGPU 3D engines, and game asset pipelines.

Specifically, it compiles and runs upstream's standalone **`tools/codecbench.cpp`** harness via Emscripten with 128-bit SIMD and relaxed SIMD enabled.

---

## How Measurement & Scoring Work

1. **Test Data Generation:**
   On each run, `codecbench` procedurally generates a synthetic 3D grid mesh of vertices and triangles, along with 32 MB and 64 MB buffers of packed 4-channel 8-bit (`u8x4`) and 16-bit (`u16x4`) vertex attributes.

2. **Internal Timing Loop:**
   For each decoder, `codecbench` compresses the test buffer once, then runs the decompression kernel in a loop and records the **best (minimum) decompression time**, reporting throughput in **GB/s** (`Score (GB/s): ...`).

3. **Conversion to Time (`ms`-equivalent metric):**
   Because the benchmark runner expects lower-is-better duration metrics, the benchmark converts each sub-benchmark's throughput (in GB/s) into an inverse throughput metric which corresponds to milliseconds per gigabyte of decoded mesh data.
   The top-level `Experimental-Meshoptimizer-wasm` total for each sub-iteration is the geometric mean of each sub-metric's ms/GB measure.

---

## Top-Level Benchmark

- **`Experimental-Meshoptimizer-wasm`**: Runs `codecbench` and reports the 9 geometry and attribute filter decoders below as sub-benchmarks (`<sub-bench> / sub-iter-N`).

---

## Sub-Benchmarks Explained

`codecbench` tests two distinct stages of glTF mesh decoding:

### A. Core Geometry Codecs (`benchCodecs`)

vtx0, vtx1, and idx measure unpacking compressed byte streams back into
the raw points and triangles that define a 3D shape using different
formats.

- `vtx0` (Vertex Decoder v0): Unpacks compressed 3D point data (positions,
  normals, texture coordinates) using the original version 0 format.
- `vtx1` (Vertex Decoder v1): Unpacks the same 3D point data using the
  newer version 1 format, which trades a little extra decoding work for
  smaller file sizes.
- `idx` (Index / Triangle Decoder): Unpacks the list of which vertices
  connect to form each triangle on the 3D surface.

### B. Attribute Filter Decoders (`benchFilters`)

In `meshoptimizer`, vertex attributes (normals, tangents/quaternions, colors, and UV/position exponents) are pre-quantized so their lower bits are zero, making them compress much better under `vtx0`/`vtx1`. After vertex decoding, **branchless SIMD filter decoders** run in-place over the buffer to restore full floating-point or normalized integer values.
Once the raw bytes are unpacked, these six filters convert compactly
stored numbers back into usable 3D values (surface directions,
rotations, colors, and floats):

- `oct8` (8-bit Normals): Unpacks 3D surface directions ("normals") that
  were flattened into two 8-bit numbers using an octahedron mapping.
- `oct12` (12-bit Normals): Same surface-direction unpacking as oct8, but
  at higher 12-bit precision for smoother curved surfaces.
- `quat12` (12-bit Rotations): Unpacks 3D rotations (quaternions) stored
  at 12-bit precision.
- `col8` (8-bit Colors): Unpacks RGBA vertex colors stored at 8 bits per
  channel (converting from compact YCoCg color deltas back to standard
  RGB).
- `col12` (12-bit Colors): Same color unpacking as col8, but at higher
  12-bit precision per channel.
- `exp` (Floating-Point Exponents): Unpacks general-purpose floating-point
  attributes (such as 3D positions or UV coordinates) that were compressed
  by sharing or quantizing their binary exponents.
