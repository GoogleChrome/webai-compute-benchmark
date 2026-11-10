// SPDX-License-Identifier: BSD-3-Clause

#ifndef _CONVERSIONS_H_
#define _CONVERSIONS_H_

#include <type_traits>

#include "util.h"

template <typename OutTy, typename InTy>
Result convert_1d(OutTy* out, InTy* in, unsigned N) {
  Timer vector_timer;
  for (unsigned i = 0; i < N; ++i) {
    out[i] = in[i];
  }
  double vector_time = vector_timer.end();

  OutTy *temp = new OutTy[N];

  Timer scalar_timer;
  #pragma clang loop vectorize(disable)
  for (unsigned i = 0; i < N; ++i) {
    temp[i] = in[i];
  }
  double scalar_time = scalar_timer.end();

  for (unsigned i = 0; i < N; ++i) {
    if (temp[i] != out[i]) {
      delete[] temp;
      return Result{vector_time, scalar_time, false};
    }
  }

  delete[] temp;
  return Result{vector_time, scalar_time, true};
}

template <typename OutTy, typename InTy>
bool init_and_run_convert_1d(double& total_vector_time, double& total_scalar_time,
                             unsigned N) {
  InTy *in = new InTy[N];
  OutTy *out = new OutTy[N];
  for (unsigned i = 0; i < N; ++i) {
    if constexpr (std::is_floating_point_v<InTy> && std::is_integral_v<OutTy>) {
      if constexpr (std::is_unsigned_v<OutTy>) {
        in[i] = static_cast<InTy>(static_cast<uint8_t>(fast_rand()));
      } else {
        in[i] = static_cast<InTy>(static_cast<int8_t>(fast_rand()));
      }
    } else {
      in[i] = static_cast<InTy>(fast_rand());
    }
  }
  Result res = convert_1d<OutTy, InTy>(out, in, N);
  total_vector_time += res.vector_msec;
  total_scalar_time += res.scalar_msec;
  delete[] in;
  delete[] out;
  return res.success;
}

#endif // _CONVERSIONS_H_
