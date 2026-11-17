// Copyright 2026 Google LLC
//
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file or at
// https://developers.google.com/open-source/licenses/bsd
//
// Adapted from wasm-perf/benchmarks/microkernels/src/mac.h:
// SPDX-FileCopyrightText: Copyright 2026 Arm Limited and/or its affiliates <open-source-office@arm.com>
// SPDX-License-Identifier: BSD-3-Clause

#ifndef _MAC_H_
#define _MAC_H_

#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <limits>
#include <type_traits>

#include "util.h"

// Cap floating-point MAC validation tolerances strictly below 1.0 so the check
// never becomes vacuous at large N. Without a cap,
// `N * std::numeric_limits<float>::epsilon()` exceeds 1.0 at N >= 2^23
// (accepting vec_res == 0 for any scalar_res) and exceeds 2.0 at N >= 2^24
// (e.g., tol ~= 2.38 at N = 20,000,000), where the triangle inequality
// |v - s| <= 2 * max(|v|, |s|) makes `diff <= tol * max_res` unconditionally
// true for any two finite floats—even opposite signs.
//
// Setting kMaxFpRelTol = 0.45 (< 0.5) rejects zeroed results (ratio 1.0),
// sign flips (ratio 2.0), and dropped SIMD lanes (1/4 lanes -> 0.75,
// 2/4 lanes -> 0.50), while accommodating genuine float rounding drift at
// large N (up to ~0.32 on periodic 2D int8xint8 LCG inputs whose 4 SIMD lanes
// accumulate large opposite-sign sums that cancel on horizontal reduction).
// For double, N * epsilon stays tiny (~4.4e-9 at N = 20M) so the cap is unused.
constexpr double kMaxFpRelTol = 0.45;

// Tighter cap for the cancellation fallback path relative to
// walk_scale = sum(|p_i|) / sqrt(N). Kept well below 0.5 so a broken zeroed
// result (where |scalar_res| is typically ~0.5 * walk_scale for a zero-mean
// random walk) cannot slip through the fallback.
constexpr double kMaxFpWalkTol = 0.1;

template <typename AccTy>
double fp_mac_tol(unsigned N, double max_tol) {
  return std::min(
      static_cast<double>(N) * std::numeric_limits<AccTy>::epsilon(), max_tol);
}

template <typename AccTy, typename ProductFn>
[[gnu::noinline]] bool fp_mac_fallback_equal(AccTy vec_res, AccTy scalar_res,
                                             unsigned N, ProductFn product_at) {
  const double v = static_cast<double>(vec_res);
  const double s = static_cast<double>(scalar_res);
  const double diff = std::abs(v - s);
  double abs_sum = 0.0;
  for (unsigned i = 0; i < N; ++i) {
    abs_sum += std::abs(static_cast<double>(product_at(i)));
  }
  const double walk_scale =
      N > 0 ? abs_sum / std::sqrt(static_cast<double>(N)) : 0.0;
  return diff <= fp_mac_tol<AccTy>(N, kMaxFpWalkTol) * walk_scale;
}

// SIMD reductions reassociate floating-point additions across lanes (and may
// contract multiply-adds), changing rounding relative to the scalar loop.
template <typename AccTy, typename ProductFn>
bool mac_equal(AccTy vec_res, AccTy scalar_res, unsigned N,
               ProductFn product_at) {
  if constexpr (!std::is_floating_point_v<AccTy>) {
    return vec_res == scalar_res;
  } else {
    const double v = static_cast<double>(vec_res);
    const double s = static_cast<double>(scalar_res);
    if (!std::isfinite(v) || !std::isfinite(s)) {
      return false;
    }
    const double tol = fp_mac_tol<AccTy>(N, kMaxFpRelTol);
    const double diff = std::abs(v - s);
    const double max_res = std::max(std::abs(v), std::abs(s));
    if (diff <= tol * max_res) {
      return true;
    }
    return fp_mac_fallback_equal(vec_res, scalar_res, N, product_at);
  }
}

template <typename AccTy, typename InTyA, typename InTyB,
          template <typename> class VecTy>
bool mac_field_equal(AccTy vec_res, AccTy scalar_res, const VecTy<InTyA>* a,
                     const VecTy<InTyB>* b, unsigned N,
                     InTyA VecTy<InTyA>::* field_a,
                     InTyB VecTy<InTyB>::* field_b) {
  return mac_equal(vec_res, scalar_res, N, [&](unsigned i) {
    return static_cast<AccTy>(a[i].*field_a) *
           static_cast<AccTy>(b[i].*field_b);
  });
}

template <typename AccTy, typename InTyA, typename InTyB>
Result mac_1d(InTyA* a, InTyB* b, unsigned N) {

  Timer vector_timer;
  AccTy vec_res = 0;
  for (unsigned i = 0; i < N; ++i) {
    vec_res += static_cast<AccTy>(a[i]) * static_cast<AccTy>(b[i]);
  }
  double vector_time = vector_timer.end();

  Timer scalar_timer;
  AccTy scalar_res = 0;
  #pragma clang loop vectorize(disable)
  for (unsigned i = 0; i < N; ++i) {
    scalar_res += static_cast<AccTy>(a[i]) * static_cast<AccTy>(b[i]);
  }
  double scalar_time = scalar_timer.end();

  return Result{vector_time, scalar_time,
                mac_equal(vec_res, scalar_res, N, [&](unsigned i) {
                  return static_cast<AccTy>(a[i]) * static_cast<AccTy>(b[i]);
                })};
}

template <typename AccTy, typename InTyA, typename InTyB>
bool init_and_run_mac_1d(double& total_vector_time, double& total_scalar_time,
                     unsigned N) {
  InTyA *a = new InTyA[N];
  InTyB *b = new InTyB[N];
  for (unsigned i = 0; i < N; ++i) {
    a[i] = static_cast<InTyA>(fast_rand());
    b[i] = static_cast<InTyB>(fast_rand());
  }
  Result res = mac_1d<AccTy, InTyA, InTyB>(a, b, N);
  total_vector_time += res.vector_msec;
  total_scalar_time += res.scalar_msec;
  delete[] a;
  delete[] b;
  return res.success;
}

template <typename T>
struct Vector2D {
  T x = 0;
  T y = 0;
};

template <typename AccTy, typename InTyA, typename InTyB>
Result mac_2d(Vector2D<InTyA>* a, Vector2D<InTyB>* b, unsigned N) {

  Timer vector_timer;
  Vector2D<AccTy> vec_res;
  for (unsigned i = 0; i < N; ++i) {
    vec_res.x += static_cast<AccTy>(a[i].x) * static_cast<AccTy>(b[i].x);
    vec_res.y += static_cast<AccTy>(a[i].y) * static_cast<AccTy>(b[i].y);
  }
  double vector_time = vector_timer.end();

  Timer scalar_timer;
  Vector2D<AccTy> scalar_res;
  #pragma clang loop vectorize(disable)
  for (unsigned i = 0; i < N; ++i) {
    scalar_res.x += static_cast<AccTy>(a[i].x) * static_cast<AccTy>(b[i].x);
    scalar_res.y += static_cast<AccTy>(a[i].y) * static_cast<AccTy>(b[i].y);
  }
  double scalar_time = scalar_timer.end();

  return Result{vector_time, scalar_time,
                (mac_field_equal(vec_res.x, scalar_res.x, a, b, N,
                                 &Vector2D<InTyA>::x, &Vector2D<InTyB>::x) &&
                 mac_field_equal(vec_res.y, scalar_res.y, a, b, N,
                                 &Vector2D<InTyA>::y, &Vector2D<InTyB>::y))};
}

template <typename AccTy, typename InTyA, typename InTyB>
bool init_and_run_mac_2d(double& total_vector_time,
                     double& total_scalar_time,
                     unsigned N) {
  Vector2D<InTyA> *a = new Vector2D<InTyA>[N];
  Vector2D<InTyB> *b = new Vector2D<InTyB>[N];
  for (unsigned i = 0; i < N; ++i) {
    a[i].x = static_cast<InTyA>(fast_rand());
    a[i].y = static_cast<InTyA>(fast_rand());
    b[i].x = static_cast<InTyB>(fast_rand());
    b[i].y = static_cast<InTyB>(fast_rand());
  }
  Result res = mac_2d<AccTy, InTyA, InTyB>(a, b, N);
  total_vector_time += res.vector_msec;
  total_scalar_time += res.scalar_msec;
  delete[] a;
  delete[] b;
  return res.success;
}

template <typename T>
struct Vector3D {
  T x = 0;
  T y = 0;
  T z = 0;
};

template <typename AccTy, typename InTyA, typename InTyB>
Result mac_3d(Vector3D<InTyA>* a, Vector3D<InTyB>* b, unsigned N) {

  Timer vector_timer;
  Vector3D<AccTy> vec_res;
  for (unsigned i = 0; i < N; ++i) {
    vec_res.x += static_cast<AccTy>(a[i].x) * static_cast<AccTy>(b[i].x);
    vec_res.y += static_cast<AccTy>(a[i].y) * static_cast<AccTy>(b[i].y);
    vec_res.z += static_cast<AccTy>(a[i].z) * static_cast<AccTy>(b[i].z);
  }
  double vector_time = vector_timer.end();

  Timer scalar_timer;
  Vector3D<AccTy> scalar_res;
  #pragma clang loop vectorize(disable)
  for (unsigned i = 0; i < N; ++i) {
    scalar_res.x += static_cast<AccTy>(a[i].x) * static_cast<AccTy>(b[i].x);
    scalar_res.y += static_cast<AccTy>(a[i].y) * static_cast<AccTy>(b[i].y);
    scalar_res.z += static_cast<AccTy>(a[i].z) * static_cast<AccTy>(b[i].z);
  }
  double scalar_time = scalar_timer.end();

  return Result{vector_time, scalar_time,
                (mac_field_equal(vec_res.x, scalar_res.x, a, b, N,
                                 &Vector3D<InTyA>::x, &Vector3D<InTyB>::x) &&
                 mac_field_equal(vec_res.y, scalar_res.y, a, b, N,
                                 &Vector3D<InTyA>::y, &Vector3D<InTyB>::y) &&
                 mac_field_equal(vec_res.z, scalar_res.z, a, b, N,
                                 &Vector3D<InTyA>::z, &Vector3D<InTyB>::z))};
}

template <typename AccTy, typename InTyA, typename InTyB>
bool init_and_run_mac_3d(double& total_vector_time,
                     double& total_scalar_time,
                     unsigned N) {
  Vector3D<InTyA> *a = new Vector3D<InTyA>[N];
  Vector3D<InTyB> *b = new Vector3D<InTyB>[N];
  for (unsigned i = 0; i < N; ++i) {
    a[i].x = static_cast<InTyA>(fast_rand());
    a[i].y = static_cast<InTyA>(fast_rand());
    a[i].z = static_cast<InTyA>(fast_rand());
    b[i].x = static_cast<InTyB>(fast_rand());
    b[i].y = static_cast<InTyB>(fast_rand());
    b[i].z = static_cast<InTyB>(fast_rand());
  }
  Result res = mac_3d<AccTy, InTyA, InTyB>(a, b, N);
  total_vector_time += res.vector_msec;
  total_scalar_time += res.scalar_msec;
  delete[] a;
  delete[] b;
  return res.success;
}

template <typename T>
struct Vector4D {
  T x = 0;
  T y = 0;
  T z = 0;
  T w = 0;
};

template <typename AccTy, typename InTyA, typename InTyB>
Result mac_4d(Vector4D<InTyA>* a, Vector4D<InTyB>* b, unsigned N) {

  Timer vector_timer;
  Vector4D<AccTy> vec_res;
  for (unsigned i = 0; i < N; ++i) {
    vec_res.x += static_cast<AccTy>(a[i].x) * static_cast<AccTy>(b[i].x);
    vec_res.y += static_cast<AccTy>(a[i].y) * static_cast<AccTy>(b[i].y);
    vec_res.z += static_cast<AccTy>(a[i].z) * static_cast<AccTy>(b[i].z);
    vec_res.w += static_cast<AccTy>(a[i].w) * static_cast<AccTy>(b[i].w);
  }
  double vector_time = vector_timer.end();

  Timer scalar_timer;
  Vector4D<AccTy> scalar_res;
  #pragma clang loop vectorize(disable)
  for (unsigned i = 0; i < N; ++i) {
    scalar_res.x += static_cast<AccTy>(a[i].x) * static_cast<AccTy>(b[i].x);
    scalar_res.y += static_cast<AccTy>(a[i].y) * static_cast<AccTy>(b[i].y);
    scalar_res.z += static_cast<AccTy>(a[i].z) * static_cast<AccTy>(b[i].z);
    scalar_res.w += static_cast<AccTy>(a[i].w) * static_cast<AccTy>(b[i].w);
  }
  double scalar_time = scalar_timer.end();

  return Result{vector_time, scalar_time,
                (mac_field_equal(vec_res.x, scalar_res.x, a, b, N,
                                 &Vector4D<InTyA>::x, &Vector4D<InTyB>::x) &&
                 mac_field_equal(vec_res.y, scalar_res.y, a, b, N,
                                 &Vector4D<InTyA>::y, &Vector4D<InTyB>::y) &&
                 mac_field_equal(vec_res.z, scalar_res.z, a, b, N,
                                 &Vector4D<InTyA>::z, &Vector4D<InTyB>::z) &&
                 mac_field_equal(vec_res.w, scalar_res.w, a, b, N,
                                 &Vector4D<InTyA>::w, &Vector4D<InTyB>::w))};
}

template <typename AccTy, typename InTyA, typename InTyB>
bool init_and_run_mac_4d(double& total_vector_time,
                     double& total_scalar_time,
                     unsigned N) {
  Vector4D<InTyA> *a = new Vector4D<InTyA>[N];
  Vector4D<InTyB> *b = new Vector4D<InTyB>[N];
  for (unsigned i = 0; i < N; ++i) {
    a[i].x = static_cast<InTyA>(fast_rand());
    a[i].y = static_cast<InTyA>(fast_rand());
    a[i].z = static_cast<InTyA>(fast_rand());
    a[i].w = static_cast<InTyA>(fast_rand());
    b[i].x = static_cast<InTyB>(fast_rand());
    b[i].y = static_cast<InTyB>(fast_rand());
    b[i].z = static_cast<InTyB>(fast_rand());
    b[i].w = static_cast<InTyB>(fast_rand());
  }
  Result res = mac_4d<AccTy, InTyA, InTyB>(a, b, N);
  total_vector_time += res.vector_msec;
  total_scalar_time += res.scalar_msec;
  delete[] a;
  delete[] b;
  return res.success;
}

#endif // _MAC_H_
