# Eigen Wasm Linear Algebra & Geometry Benchmark (`eig33` & `geometry`)

## Overview

The **Eigen** benchmarks (`Experimental-Eigen-Eig33-wasm` and `Experimental-Eigen-Geometry-wasm`) measure small-matrix numerical linear algebra, eigenvalue decomposition, and 3D spatial transformation performance in WebAssembly using [`Eigen`](https://gitlab.com/libeigen/eigen), the C++ expression-template linear algebra library used across scientific computing, computer vision, robotics, and machine learning runtimes (including TensorFlow and MediaPipe).

Specifically, the workload compiles upstream's standalone **`bench/eig33.cpp`** and **`bench/geometry.cpp`** microbenchmarks to WebAssembly (`eig33.wasm` and `geometry.wasm`) using Emscripten with 128-bit SIMD, and relaxed SIMD enabled .

---

## Why Include Eigen in a WebAI Compute Benchmark?

While large matrix-multiplication benchmarks isolate dense neural network layer throughput, end-to-end WebAI pipelines (such as 3D hand/body pose tracking, face mesh alignment, point-cloud registration, AR/SLAM, and physics/Kalman filtering) spend significant CPU time in **small fixed-size matrix solvers and geometric coordinate transforms** before and after model inference:

- **Small-Matrix Decomposition (`eig33`):** Computing surface normals, principal components (PCA), and covariance ellipsoids requires solving thousands of 3 x 3 symmetric eigenvalue problems, stressing `f64x2` SIMD, scalar register allocation, square-root/trigonometric math (`sqrt`, `cos`, `acos`), and data-dependent convergence branches.
- **Batched 3D Coordinate Transforms (`geometry`):** Transforming batches of 3D keypoints or vertices by quaternions, rigid-body isometries, and affine/projective camera matrices stresses C++ expression-template inlining and `f32x4` SIMD vectorization across non-multiple-of-4 vector widths.

---

## How Measurement & Scoring Work

Both benchmarks use Eigen's `BenchTimer` harness, which executes `rep` iterations of an operation per try across `tries` runs and records the **best (minimum) elapsed time** in seconds:

1. **`Experimental-Eigen-Eig33-wasm` (`eig33.wasm`):**
    - Evaluates 3 eigensolver implementations on random 3 x 3 symmetric `Matrix3d` (FP64) matrices.
    - Each solver runs **`10` tries of `400,000` repetitions** and prints its best elapsed time in seconds (`Eigen iterative: <s>s`, `Eigen direct : <s>s`, `Direct: <s>s`).
    - The benchmark converts each solver's best time to **milliseconds (`ms`)**, reports each solver as a sub-benchmark, and computes the **geometric mean** of the 3 solvers as the `Experimental-Eigen-Eig33-wasm` total for each sub-iteration.

2. **`Experimental-Eigen-Geometry-wasm` (`geometry.wasm`):**
    - Evaluates 7 3D transformation representations on FP32 point batches of shape 3 x N across **8 batch sizes (`N = 1, 2, 3, 4, 5, 6, 7, 8`)**.
    - Each cell runs **`10` tries of `100,000` repetitions** and prints a row of 8 best times in seconds (one for each `N = 1..8`).
    - Following `wasm-perf`, the benchmark converts all 8 batch timings in a row to **milliseconds (`ms`)** and summarizes each row by its **geometric mean**.
    - The top-level `Experimental-Eigen-Geometry-wasm` total for each sub-iteration is the **geometric mean** across all 7 transformation sub-benchmarks.

---

## Top-Level Benchmarks & Sub-Benchmarks

### 1. `Experimental-Eigen-Eig33-wasm` — _3 x 3 Symmetric Eigenvalue Decomposition (FP64)_

Computes all eigenvalues and eigenvectors of a 3 x 3 self-adjoint (symmetric) `double` matrix (`A = V * Lambda * V^T`) using three different algorithms:

- **`eigen-iterative` (`SelfAdjointEigenSolver<Matrix3d>::compute`):**
  Reduces the 3 x 3 symmetric matrix to tridiagonal form using Householder reflections, then runs implicit symmetric QR iteration (Wilkinson shift) until convergence. Tests iterative loop control flow, branching, and FP64 arithmetic.

- **`eigen-direct` (`SelfAdjointEigenSolver<Matrix3d>::computeDirect`):**
  Eigen's closed-form analytical 3 x 3 eigensolver. Solves the cubic characteristic polynomial directly using trigonometric root extraction (`cos`, `acos`, `sqrt`) and computes eigenvectors via cross products. Tests transcendental math performance and branchless small-matrix vectorization.

- **`direct` (`eigen33` reference solver):**
  Standalone closed-form 3 x 3 analytical eigensolver in `bench/eig33.cpp` that includes fast rank-1 and rank-2 Givens plane-rotation shortcuts before falling back to cubic root extraction and cross-product eigenvector orthogonalization.

---

### 2. `Experimental-Eigen-Geometry-wasm` — _Batched 3D Spatial Transformations (FP32, 3 x N for `N = 1..8`)_

Transforms batches of `N` 3D points (`Eigen::Matrix<float, 3, N>` for `N = 1..8`) using seven geometric representations in `Eigen::Geometry`:

- **`matrix-3x3` (`matrix 3x3` — `Eigen::Matrix3f`):**
  Multiplies a 3 x 3 rotation/linear matrix directly against the 3 x N point batch (`T * pts`). Serves as the baseline small-matrix FP32 GEMM (3 x 3 x N).

- **`quaternion` (`quaternion` — `Eigen::Quaternionf`):**
  Applies a 3D unit quaternion rotation directly to each 3D column vector using the cross-product sandwich formula (`v' = v + 2 * q_v x (q_v x v + q_w * v)`) without constructing a 3 x 3 matrix. Fastest for a single point (`N = 1`), but performs more flops per point than matrix multiplication as `N` grows.

- **`quat-mat` (`quat-mat` — `Quaternionf::toRotationMatrix()`):**
  Converts the quaternion into a 3 x 3 rotation matrix first and then multiplies the 3 x N point batch (`q.toRotationMatrix() * pts`). Measures the batch-size crossover where upfront quaternion-to-matrix conversion is amortized over `N` points.

- **`isometry3` (`isometry3` — `Eigen::Isometry3f`):**
  Applies a 3D rigid-body Euclidean transformation (3D rotation + 3D translation stored in a 4 x 4 matrix). Multiplies the 3 x 3 linear block and adds the 3 x 1 translation vector to each column.

- **`affine3` (`affine3` — `Eigen::Affine3f`):**
  Applies a general 3D affine transformation (linear rotation/scaling/shear + translation) backed by a 4 x 4 homogeneous storage layout (`Eigen::Affine`).

- **`c-affine3` (`c affine3` — `Eigen::AffineCompact3f`):**
  Applies the same 3D affine transformation using Eigen's compact 3 x 4 storage mode (`Eigen::AffineCompact`), which omits the constant `[0, 0, 0, 1]` bottom row to reduce memory footprint.

- **`proj3` (`proj3` — `Eigen::Projective3f`):**
  Applies a full 4 x 4 3D perspective/projective transformation (`Eigen::Projective`) to homogeneous coordinates. The most compute-intensive geometry kernel, requiring a full 4 x 4 x N matrix multiply followed by per-point perspective division (`hnormalized()`).
