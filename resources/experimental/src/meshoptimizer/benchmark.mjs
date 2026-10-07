// Copyright 2026 Google LLC
//
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file or at
// https://developers.google.com/open-source/licenses/bsd

/**
 * Experimental Meshoptimizer Wasm benchmark (codecbench).
 */

import CodecbenchModule from "../../dist/meshoptimizer/codecbench.mjs";
import {
  AsyncBenchmarkStep,
  AsyncBenchmarkSuite,
  BenchmarkConnector,
} from "speedometer-utils/benchmark.mjs";
import { forceLayout } from "speedometer-utils/helpers.mjs";
import { params } from "speedometer-utils/params.mjs";

const codecbenchUrl = new URL(
  "../../dist/meshoptimizer/codecbench.wasm",
  import.meta.url,
);

/**
 * codecbench.cpp measures maximum decoding throughput (best timing over 50
 * iterations) across core geometry codecs (benchCodecs) and branchless
 * attribute filter decoders (benchFilters):
 *
 * A. Core Geometry Codecs (benchCodecs):
 *   - vtx0 / vtx1: Vertex buffer decoding (meshopt_decodeVertexBuffer, codec
 *     versions 0 and 1) converting compressed byte streams back into
 *     uncompressed interleaved vertex data.
 *   - idx: Index buffer decoding (meshopt_decodeIndexBuffer) reconstructing
 *     index buffers (triangle topology) from variable-length byte-encoded
 *     triangle sequences.
 *
 * B. Attribute Filter Decoders (benchFilters):
 *   - oct8 & oct12: Octahedral normal vector decoding (8-bit and 12-bit
 *     precision via meshopt_decodeFilterOct).
 *   - quat12: Quaternion rotation decoding (12-bit precision via
 *     meshopt_decodeFilterQuat).
 *   - col8 & col12: Color attribute un-filtering (8-bit and 12-bit precision
 *     via meshopt_decodeFilterColor).
 *   - exp: Exponential/floating-point attribute un-filtering
 *     (meshopt_decodeFilterExp).
 */
const SUB_BENCHMARK_NAMES = [
  "vtx0",
  "vtx1",
  "idx",
  "oct8",
  "oct12",
  "quat12",
  "col8",
  "col12",
  "exp",
];

const SCORE_REGEX = new RegExp(
  "Score \\(GB\\/s\\):" +
    "\\s+([0-9]*\\.?[0-9]+)".repeat(SUB_BENCHMARK_NAMES.length),
);

function geometricMean(values) {
  const logSum = values.reduce((sum, v) => sum + Math.log(v), 0);
  return Math.exp(logSum / values.length);
}

function instantiatePrecompiled(wasmModule) {
  return (imports, successCallback) => {
    const instance = new WebAssembly.Instance(wasmModule, imports);
    successCallback(instance, wasmModule);
    return instance.exports;
  };
}

class MeshoptimizerBenchmark {
  constructor() {
    this.meshoptimizerModule = null;
  }

  async init() {
    console.log(
      "Compiling Meshoptimizer Wasm module (not part of benchmark measurement)...",
    );
    this.meshoptimizerModule = await WebAssembly.compileStreaming(
      fetch(codecbenchUrl),
    );
    console.log(
      "Meshoptimizer Wasm module compiled; starting measured benchmark runs...",
    );
  }

  async runAndParseScore() {
    let stdout = "";
    console.log("Running codecbench...");
    await CodecbenchModule({
      print: (line) => {
        console.log(line);
        stdout += line + "\n";
      },
      printErr: (line) => console.error(line),
      instantiateWasm: instantiatePrecompiled(this.meshoptimizerModule),
    });

    const match = stdout.match(SCORE_REGEX);
    if (!match) {
      throw new Error(`Failed to parse codecbench output:\n${stdout}`);
    }

    const gbpsScores = match
      .slice(1, SUB_BENCHMARK_NAMES.length + 1)
      .map(Number);
    const steps = {};
    SUB_BENCHMARK_NAMES.forEach((name, i) => {
      steps[name] = { tests: {}, total: 1000 / gbpsScores[i] };
    });

    return {
      steps,
      total: 1000 / geometricMean(gbpsScores),
    };
  }
}

function createMeshoptimizerSuite(benchmark, subIterationCount) {
  const steps = Array.from({ length: subIterationCount }, (_, i) => {
    let parsedResult = null;
    const step = new AsyncBenchmarkStep(
      `sub-iter-${i + 1}`,
      async () => {
        forceLayout();
        parsedResult = await benchmark.runAndParseScore();
        forceLayout();
      },
      { measureAsync: false },
    );
    return {
      name: step.name,
      async runAndRecord(stepParams, suite, recordCallback) {
        await step.runAndRecord(stepParams, suite, recordCallback);
        return parsedResult;
      },
    };
  });
  return new AsyncBenchmarkSuite("default", steps);
}

const appName = "Meshoptimizer";
const appVersion = "0.25";

try {
  const benchmark = new MeshoptimizerBenchmark();
  await benchmark.init();

  /*--------- Running test suites ---------*/
  const suites = {
    default: createMeshoptimizerSuite(benchmark, params.subIterationCount),
  };

  const benchmarkConnector = new BenchmarkConnector(
    suites,
    appName,
    appVersion,
  );
  benchmarkConnector.connect();
} catch (error) {
  console.error("Failed to initialize Meshoptimizer benchmark:", error);
  throw error;
}
