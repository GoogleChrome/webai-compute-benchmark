// SPDX-License-Identifier: BSD-3-Clause

#ifndef _UTIL_H_
#define _UTIL_H_

#include <ctime>

struct Result {
  double vector_msec = 0.0;
  double scalar_msec = 0.0;
  bool success = false;
};

struct Timer {
  Timer() {
    clock_gettime(CLOCK_MONOTONIC, &start);
  }
  double end() {
    clock_gettime(CLOCK_MONOTONIC, &stop);
    double secs  = stop.tv_sec - start.tv_sec;
    double msecs = (stop.tv_nsec - start.tv_nsec) / 1.0e6;
    return msecs + secs*1000;
  }
  struct timespec start, stop;
};

// https://stackoverflow.com/questions/26237419/faster-than-rand
static unsigned int g_seed;

// Used to seed the generator.
inline void fast_srand(int seed) {
  g_seed = seed;
}

// Compute a pseudorandom integer.
inline int fast_rand(void) {
  g_seed = (214013*g_seed+2531011);
  return g_seed;
}

#endif // _UTIL_H_
