// Copyright 2026 Google LLC
//
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file or at
// https://developers.google.com/open-source/licenses/bsd

/**
 * Experimental GGML Wasm quantization benchmark (test-quantize-perf).
 */

import TestQuantizePerfModule from "../../dist/ggml/test-quantize-perf.mjs";
import { BenchmarkConnector } from "speedometer-utils/benchmark.mjs";
import { createSubIteratedSuite } from "speedometer-utils/helpers.mjs";
import { params } from "speedometer-utils/params.mjs";

const testQuantizePerfUrl = new URL(
  "../../dist/ggml/test-quantize-perf.wasm",
  import.meta.url,
);

const SUB_BENCHMARKS = [
  ["--op", "dequantize_row_q", "--iterations", "200", "-3"],
  ["--op", "quantize_row_q", "--iterations", "5", "-3"],
  ["--op", "quantize_row_q_dot", "--iterations", "100", "-3"],
  ["--op", "vec_dot_q", "--iterations", "100", "-3"],
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

  async run() {
    for (const args of SUB_BENCHMARKS) {
      await TestQuantizePerfModule({
        arguments: [...args],
        print: () => {},
        printErr: () => {},
        instantiateWasm: instantiatePrecompiled(this.ggmlModule),
      });
    }
  }
}

const appName = "GGML";
const appVersion = "0.9.4";

try {
  const benchmark = new GgmlBenchmark();
  await benchmark.init();

  /*--------- Running test suites ---------*/
  const suites = {
    default: createSubIteratedSuite(benchmark, params.subIterationCount),
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
