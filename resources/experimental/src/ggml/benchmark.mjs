// Copyright 2026 Google LLC
//
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file or at
// https://developers.google.com/open-source/licenses/bsd

/**
 * Experimental GGML Wasm quantization benchmark (test-quantize-perf).
 */

import TestQuantizePerfModule from "../../dist/ggml/test-quantize-perf.mjs";
import {
  AsyncBenchmarkSuite,
  BenchmarkConnector,
} from "speedometer-utils/benchmark.mjs";
import { createSubIteratedSuite } from "speedometer-utils/helpers.mjs";
import { params } from "speedometer-utils/params.mjs";

const testQuantizePerfUrl = new URL(
  "../../dist/ggml/test-quantize-perf.wasm",
  import.meta.url,
);

/**
 * `test-quantize-perf.cpp` supports 5 `--op` measurement modes testing distinct
 * phases of data transformation and math used during model loading and inference:
 *   https://github.com/ggml-org/ggml/blob/ffa4e8b80930029a35991f94e7c8a93cd67730ab/tests/test-quantize-perf.cpp#L4
 *
 * Kept measurements (real-time inference / token generation hot path):
 * - `vec_dot_q` (Vector Dot Product): Computes element-wise dot products directly
 *   on compressed quantized data without unpacking to float32 first. This is the
 *   core matrix multiplication inner loop and the most executed operation in LLM
 *   inference.
 * - `quantize_row_q_dot` (Real-Time Activation Prep): Compresses incoming float32
 *   prompts/activations on the fly into a temporary quantized format optimized
 *   for the matrix multiplication engine so both weights and activations can use
 *   fast integer math during inference.
 *
 * Omitted measurements (offline, baseline, or non-hot-path operations):
 * - `quantize_row_q_reference` (Baseline Compression): Simple, unvectorized C/C++
 *   reference implementation for float32-to-quantized conversion, intended as a
 *   correctness baseline rather than a realistic workload.
 * - `quantize_row_q` (Fast Model Compression): SIMD-optimized float32-to-quantized
 *   block compression used when converting or loading a model on disk into
 *   quantized memory, rather than during per-token inference.
 * - `dequantize_row_q` (Unpacking / Decompression): Expands quantized integers
 *   back to float32 for occasional ops that cannot run in quantized format,
 *   which is secondary compared to direct quantized dot products (`vec_dot_q`).
 */
const SUB_BENCHMARKS = [
  {
    name: "vec_dot_q",
    args: ["--op", "vec_dot_q", "--iterations", "10", "-3"],
  },
  {
    name: "quantize_row_q_dot",
    args: ["--op", "quantize_row_q_dot", "--iterations", "10", "-3"],
  },
];

function instantiatePrecompiled(wasmModule) {
  return (imports, successCallback) => {
    const instance = new WebAssembly.Instance(wasmModule, imports);
    successCallback(instance, wasmModule);
    return instance.exports;
  };
}

class GgmlBenchmark {
  constructor() {
    this.ggmlModule = null;
  }

  async init() {
    console.log(
      "Compiling GGML Wasm module (not part of benchmark measurement)...",
    );
    this.ggmlModule = await WebAssembly.compileStreaming(
      fetch(testQuantizePerfUrl),
    );
    console.log(
      "GGML Wasm module compiled; starting measured benchmark runs...",
    );
  }

  async runSubBenchmark(name, args) {
    console.log(`Running ${name}...`);
    await TestQuantizePerfModule({
      arguments: [...args],
      print: () => { },
      printErr: () => { },
      instantiateWasm: instantiatePrecompiled(this.ggmlModule),
    });
  }
}

const appName = "GGML";
const appVersion = "0.9.4";

try {
  const benchmark = new GgmlBenchmark();
  await benchmark.init();

  // TODO(ryandiaz) We may want to report the total as a geomean
  // so one sub benchmark doesn't dominate.
  const steps = SUB_BENCHMARKS.map(({ name, args }) => {
    const subSuite = createSubIteratedSuite(
      { name, run: () => benchmark.runSubBenchmark(name, args) },
      params.subIterationCount,
      name,
    );
    return {
      name,
      async runAndRecord(params) {
        const { result } = await subSuite.runAndRecord(params);
        return result;
      },
    };
  });

  /*--------- Running test suites ---------*/
  const suites = {
    default: new AsyncBenchmarkSuite("default", steps),
  };

  const benchmarkConnector = new BenchmarkConnector(
    suites,
    appName,
    appVersion,
  );
  benchmarkConnector.connect();
} catch (error) {
  console.error("Failed to initialize GGML benchmark:", error);
  throw error;
}
