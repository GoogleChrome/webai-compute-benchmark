#!/bin/bash
# Copyright 2026 Google LLC
#
# Use of this source code is governed by a BSD-style
# license that can be found in the LICENSE file or at
# https://developers.google.com/open-source/licenses/bsd
#
# Adapted from wasm-perf/benchmarks/ggml/build-emscripten.sh:
# SPDX-FileCopyrightText: Copyright 2026 Arm Limited and/or its affiliates <open-source-office@arm.com>
# SPDX-License-Identifier: BSD-3-Clause

set -e

GGML_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
EXPERIMENTAL_DIR="$( cd "$GGML_DIR/../.." >/dev/null 2>&1 && pwd )"
SRC_DIR="$GGML_DIR/src"
GGML_SRC="$SRC_DIR/ggml"
OUT_DIR="$EXPERIMENTAL_DIR/dist/ggml"

if [[ "$1" != "--force" && -f "$OUT_DIR/test-quantize-perf.mjs" && -f "$OUT_DIR/test-quantize-perf.wasm" ]]; then
  echo "GGML Wasm binaries already exist in $OUT_DIR. Skipping build."
  exit 0
fi

mkdir -p "$SRC_DIR"

CC="${CC:-emcc}"
CXX="${CXX:-em++}"
if ! command -v "$CC" >/dev/null 2>&1 || ! command -v "$CXX" >/dev/null 2>&1; then
  echo "Error: $CC / $CXX not found. Please activate emsdk or set CC and CXX." >&2
  exit 1
fi

DEFAULT_CFLAGS=(
  -O3
  -fno-exceptions
  -mbulk-memory
  -mextended-const
  -mmultivalue
  -mmutable-globals
  -mnontrapping-fptoint
  -mrelaxed-simd
  -msign-ext
  -msimd128
)
CFLAGS="${CFLAGS:-${DEFAULT_CFLAGS[*]}}"

EM_LDFLAGS=(
  -sENVIRONMENT=web
  -sMODULARIZE=1
  -sEXPORT_ES6=1
  -sALLOW_MEMORY_GROWTH=1
)

# v0.9.4
GGML_COMMIT="72632094336524a9c809e129e8b1c52154543a5a"

if [[ ! -d "$GGML_SRC" ]]; then
  echo "Downloading GGML source..."
  mkdir -p "$GGML_SRC"
  curl -LSs "https://github.com/ggml-org/ggml/archive/$GGML_COMMIT.tar.gz" \
    | tar --strip-components=1 -xz -C "$GGML_SRC"
fi

DEFINES=(
  -DGGML_USE_CPU
  -DGGML_VERSION=\"0.9.4\"
  -DGGML_COMMIT=\"$GGML_COMMIT\"
)

INCLUDES=(
  -I "$GGML_SRC/src"
  -I "$GGML_SRC/src/ggml/"
  -I "$GGML_SRC/src/ggml-cpu/"
  -I "$GGML_SRC/include"
)

mkdir -p "$OUT_DIR"
pushd "$OUT_DIR" >/dev/null

echo "Compiling GGML object files with Emscripten..."
"$CC" $CFLAGS "${DEFINES[@]}" "${INCLUDES[@]}" -c \
  "$GGML_SRC/src/ggml-cpu/arch/wasm/quants.c" \
  -o wasm-quants.o

"$CC" $CFLAGS "${DEFINES[@]}" "${INCLUDES[@]}" -c \
  "$GGML_SRC/src/ggml.c" \
  "$GGML_SRC/src/ggml-quants.c" \
  "$GGML_SRC/src/ggml-cpu/ggml-cpu.c" \
  "$GGML_SRC/src/ggml-cpu/quants.c"

echo "Linking test-quantize-perf.mjs + test-quantize-perf.wasm with Emscripten..."
"$CXX" $CFLAGS "${DEFINES[@]}" "${INCLUDES[@]}" "${EM_LDFLAGS[@]}" \
  "$GGML_SRC/tests/test-quantize-perf.cpp" \
  "$GGML_SRC/src/ggml-cpu/repack.cpp" \
  "$GGML_SRC/src/ggml-cpu/traits.cpp" \
  "$GGML_SRC/src/ggml-cpu/binary-ops.cpp" \
  "$GGML_SRC/src/ggml-cpu/unary-ops.cpp" \
  "$GGML_SRC/src/ggml-cpu/vec.cpp" \
  "$GGML_SRC/src/ggml-cpu/ops.cpp" \
  "$GGML_SRC/src/ggml-threading.cpp" \
  ggml.o \
  ggml-quants.o \
  ggml-cpu.o \
  quants.o \
  wasm-quants.o \
  -o "$OUT_DIR/test-quantize-perf.mjs"

rm -f ./*.o
popd >/dev/null

echo "Successfully built GGML Wasm module in $OUT_DIR"
