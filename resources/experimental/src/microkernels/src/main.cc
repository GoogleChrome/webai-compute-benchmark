// SPDX-License-Identifier: BSD-3-Clause

#include <cstdint>
#include <iostream>

#include "convert.h"
#include "mac.h"

#define PASS 0
#define FAIL -1

template <unsigned Dimension>
int run_mac_kernels(unsigned N) {
  Result res;
  double scalar_time = 0.0;
  double vector_time = 0.0;
  double total_vector_time = 0.0;
  double total_scalar_time = 0.0;
  std::cout << "mac kernels" << std::endl;

#define INIT_AND_RUN(AccTy, InTyA, InTyB) \
  if constexpr (Dimension == 1) { \
    if (!init_and_run_mac_1d<AccTy, InTyA, InTyB>( \
        vector_time, scalar_time, N)) { \
      return FAIL; \
    } \
  } else if constexpr (Dimension == 2) { \
    if (!init_and_run_mac_2d<AccTy, InTyA, InTyB>( \
      vector_time, scalar_time, N)) { \
      return FAIL; \
    } \
  } else if constexpr (Dimension == 3) { \
    if (!init_and_run_mac_3d<AccTy, InTyA, InTyB>( \
      vector_time, scalar_time, N)) { \
      return FAIL; \
    } \
  } else if constexpr (Dimension == 4) { \
    if (!init_and_run_mac_4d<AccTy, InTyA, InTyB>( \
      vector_time, scalar_time, N)) { \
      return FAIL; \
    } \
  }

  vector_time = 0.0;
  scalar_time = 0.0;
  INIT_AND_RUN(int8_t, uint8_t, int8_t)
  INIT_AND_RUN(int8_t, int8_t, int8_t)
  INIT_AND_RUN(int16_t, int8_t, int8_t)
  INIT_AND_RUN(int16_t, int8_t, uint8_t)
  INIT_AND_RUN(int16_t, int16_t, int16_t)
  INIT_AND_RUN(int16_t, uint16_t, int16_t)
  INIT_AND_RUN(int32_t, int8_t, int8_t)
  INIT_AND_RUN(int32_t, int8_t, uint8_t)
  INIT_AND_RUN(int32_t, uint8_t, uint8_t)
  INIT_AND_RUN(int32_t, int16_t, int8_t)
  INIT_AND_RUN(int32_t, int16_t, uint8_t)
  INIT_AND_RUN(int32_t, uint16_t, uint8_t)
  INIT_AND_RUN(int32_t, int16_t, int16_t)
  INIT_AND_RUN(int32_t, uint16_t, uint16_t)
  INIT_AND_RUN(uint8_t, uint8_t, int8_t)
  INIT_AND_RUN(uint8_t, int8_t, int8_t)
  INIT_AND_RUN(uint16_t, int8_t, int8_t)
  INIT_AND_RUN(uint16_t, int8_t, uint8_t)
  INIT_AND_RUN(uint16_t, uint16_t, uint16_t)
  INIT_AND_RUN(uint16_t, int16_t, uint16_t)
  INIT_AND_RUN(uint32_t, int8_t, int8_t)
  INIT_AND_RUN(uint32_t, int8_t, uint8_t)
  INIT_AND_RUN(uint32_t, uint8_t, uint8_t)
  INIT_AND_RUN(uint32_t, int16_t, int8_t)
  INIT_AND_RUN(uint32_t, int16_t, uint8_t)
  INIT_AND_RUN(uint32_t, uint16_t, uint8_t)
  INIT_AND_RUN(uint32_t, int16_t, int16_t)
  INIT_AND_RUN(uint32_t, uint16_t, uint16_t)
  INIT_AND_RUN(uint64_t, uint32_t, uint32_t)
  INIT_AND_RUN(uint64_t, int32_t, int32_t)
  INIT_AND_RUN(uint64_t, int32_t, uint32_t)
  INIT_AND_RUN(int64_t, uint32_t, uint32_t)
  INIT_AND_RUN(int64_t, int32_t, int32_t)
  INIT_AND_RUN(int64_t, int32_t, uint32_t)
  INIT_AND_RUN(float, int8_t, int8_t)
  INIT_AND_RUN(float, int16_t, int8_t)
  INIT_AND_RUN(float, int16_t, int16_t)
  INIT_AND_RUN(float, int32_t, int8_t)
  INIT_AND_RUN(float, int32_t, int16_t)
  INIT_AND_RUN(float, float, float)
  INIT_AND_RUN(double, float, float)
  INIT_AND_RUN(double, double, double)
  total_vector_time += vector_time;
  total_scalar_time += scalar_time;
  std::cout << Dimension << "D vector time: " << vector_time << std::endl;
  std::cout << Dimension << "D scalar time: " << scalar_time << std::endl;
  std::cout << "vector time change: "
            << 100 * (scalar_time - vector_time) / scalar_time
            << "%" << std::endl << std::endl;

#undef INIT_AND_RUN

  std::cout << "total mac vector run time: " << total_vector_time << std::endl;
  std::cout << "total mac scalar run time: " << total_scalar_time << std::endl;
  return PASS;
}

int run_convert_kernels(unsigned N) {
  Result res;
  double scalar_time = 0.0;
  double vector_time = 0.0;
  double total_vector_time = 0.0;
  double total_scalar_time = 0.0;
  std::cout << "convert kernels" << std::endl;

#define INIT_AND_RUN(OutTy, InTy) \
    if (!init_and_run_convert_1d<OutTy, InTy>( \
        vector_time, scalar_time, N)) { \
      return FAIL; \
    }

  vector_time = 0.0;
  scalar_time = 0.0;
  INIT_AND_RUN(int16_t, int8_t)
  INIT_AND_RUN(int16_t, uint8_t)
  INIT_AND_RUN(int32_t, int8_t)
  INIT_AND_RUN(int32_t, uint8_t)
  INIT_AND_RUN(int32_t, int16_t)
  INIT_AND_RUN(int32_t, uint16_t)
  INIT_AND_RUN(uint32_t, uint8_t)
  INIT_AND_RUN(uint32_t, int16_t)
  INIT_AND_RUN(uint32_t, uint16_t)
  INIT_AND_RUN(uint32_t, int32_t)
  INIT_AND_RUN(int64_t, int16_t)
  INIT_AND_RUN(int64_t, uint16_t)
  INIT_AND_RUN(int64_t, uint32_t)
  INIT_AND_RUN(uint64_t, uint8_t)
  INIT_AND_RUN(uint64_t, int16_t)
  INIT_AND_RUN(uint64_t, uint16_t)
  INIT_AND_RUN(uint64_t, int32_t)
  INIT_AND_RUN(float, int8_t)
  INIT_AND_RUN(float, uint8_t)
  INIT_AND_RUN(float, int16_t)
  INIT_AND_RUN(float, uint16_t)
  INIT_AND_RUN(float, int32_t)
  INIT_AND_RUN(float, uint32_t)
  INIT_AND_RUN(double, int8_t)
  INIT_AND_RUN(double, uint8_t)
  INIT_AND_RUN(double, int16_t)
  INIT_AND_RUN(double, uint16_t)
  INIT_AND_RUN(double, int32_t)
  INIT_AND_RUN(double, uint32_t)
  INIT_AND_RUN(double, float)
  INIT_AND_RUN(int8_t, int16_t)
  INIT_AND_RUN(int8_t, int32_t)
  INIT_AND_RUN(int8_t, int64_t)
  INIT_AND_RUN(int8_t, float)
  INIT_AND_RUN(int8_t, double)
  INIT_AND_RUN(uint8_t, int16_t)
  INIT_AND_RUN(uint8_t, int32_t)
  INIT_AND_RUN(uint8_t, int64_t)
  INIT_AND_RUN(uint8_t, float)
  INIT_AND_RUN(uint8_t, double)
  INIT_AND_RUN(int8_t, uint16_t)
  INIT_AND_RUN(int8_t, uint32_t)
  INIT_AND_RUN(int8_t, uint64_t)
  INIT_AND_RUN(int16_t, int32_t)
  INIT_AND_RUN(int16_t, int64_t)
  INIT_AND_RUN(int16_t, float)
  INIT_AND_RUN(int16_t, double)
  INIT_AND_RUN(uint16_t, int32_t)
  INIT_AND_RUN(uint16_t, int64_t)
  INIT_AND_RUN(uint16_t, float)
  INIT_AND_RUN(uint16_t, double)
  INIT_AND_RUN(int16_t, uint32_t)
  INIT_AND_RUN(int16_t, uint64_t)
  INIT_AND_RUN(int32_t, int64_t)
  INIT_AND_RUN(int32_t, float)
  INIT_AND_RUN(int32_t, double)
  total_vector_time += vector_time;
  total_scalar_time += scalar_time;
  std::cout << "1D vector time: " << vector_time << std::endl;
  std::cout << "1D scalar time: " << scalar_time << std::endl;
  std::cout << "vector time change: "
            << 100 * (scalar_time - vector_time) / scalar_time
            << "%" << std::endl << std::endl;

#undef INIT_AND_RUN

  std::cout << "total convert vector run time: " << total_vector_time << std::endl;
  std::cout << "total convert scalar run time: " << total_scalar_time << std::endl;
  return PASS;
}

int main(int argc, char** argv) {
  if (argc != 3) {
    std::cout << "supply value for loop count N and sub-benchmark name." << std::endl;
    return 0;
  }
  fast_srand(std::time(nullptr));
  unsigned N = std::stoi(argv[1]);

  std::string benchmark = argv[2];
  if (benchmark == "1d") {
    if (run_mac_kernels<1>(N) == FAIL) {
      std::cout << "Failed mac 1d kernels" << std::endl;
    }
  } else if (benchmark == "convert") {
    if (run_convert_kernels(N) == FAIL) {
      std::cout << "Failed convert kernels" << std::endl;
    }
  } else if (benchmark == "2d") {
    if (run_mac_kernels<2>(N) == FAIL) {
      std::cout << "Failed mac 2d kernels" << std::endl;
    }
  } else if (benchmark == "3d") {
    if (run_mac_kernels<3>(N) == FAIL) {
      std::cout << "Failed mac 3d kernels" << std::endl;
    }
  } else if (benchmark == "4d") {
    if (run_mac_kernels<4>(N) == FAIL) {
      std::cout << "Failed mac 4d kernels" << std::endl;
    }
  }

  return 0;
}
