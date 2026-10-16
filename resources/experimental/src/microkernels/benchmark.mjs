// Copyright 2026 Google LLC
//
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file or at
// https://developers.google.com/open-source/licenses/bsd

/**
 * Experimental wasm-perf microkernels Wasm benchmark.
 */

import MicrokernelsModule from "./build/microkernels.mjs";
import { AsyncBenchmarkStep, AsyncBenchmarkSuite, BenchmarkConnector } from "speedometer-utils/benchmark.mjs";
import { forceLayout } from "speedometer-utils/helpers.mjs";
import { params } from "speedometer-utils/params.mjs";

const microkernelsUrl = new URL("./build/microkernels.wasm", import.meta.url);

/**
 * Loop count `N` passed to every sub-benchmark, matching
 * `wasm-perf/benchmarks/microkernels/microkernels.py`.
 */
const LOOP_COUNT = 1000000;

/**
 * `microkernels/src/main.cc` times auto-vectorized kernels over arrays of
 * `N` pseudo-random elements, across many accumulator/input type combinations
 * (int8 .. int64, float, double), alongside a scalar reference
 * (`#pragma clang loop vectorize(disable)`) used to validate the result:
 *
 *   - 1d: 1D multiply-accumulate (MAC) reductions plus 1D element-wise type
 *     conversion kernels.
 *   - 2d / 3d / 4d: MAC reductions over arrays of 2-, 3- and 4-component
 *     structs (strided / interleaved access patterns).
 *
 * Following `microkernels.py`, each sub-benchmark's result is the sum of all
 * reported "vector run time" values (in ms), i.e. the vectorized kernels only.
 */
const SUB_BENCHMARK_NAMES = ["1d", "2d", "3d", "4d"];

const VECTOR_TIME_REGEX = /vector run time: ([0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)/g;

function geometricMean(values) {
    const logSum = values.reduce((sum, v) => sum + Math.log(v), 0);
    return Math.exp(logSum / values.length);
}

function instantiatePrecompiled(wasmModule, onError) {
    return (imports, successCallback) => {
        WebAssembly.instantiate(wasmModule, imports).then((instance) => {
            successCallback(instance, wasmModule);
        }, onError);
        return {};
    };
}

export function parseMicrokernelsOutput(name, stdout) {
    const matches = [...stdout.matchAll(VECTOR_TIME_REGEX)];
    if (matches.length === 0) {
        throw new Error(`Failed to parse microkernels "${name}" output:\n${stdout}`);
    }
    // main.cc reports a validation failure (vectorized result != scalar
    // reference) by printing "Failed ... kernels" and skipping the remaining
    // kernels of that group. wasm-perf still sums the reported timings, so we
    // do the same, but surface the failure in the console.
    if (/^Failed /m.test(stdout)) {
        console.warn(`microkernels "${name}" reported a validation failure:\n${stdout}`);
    }

    const timeMs = matches.reduce((sum, match) => sum + Number(match[1]), 0);
    if (!Number.isFinite(timeMs) || timeMs <= 0) {
        throw new Error(`Invalid microkernels "${name}" timing value: ${timeMs}\n${stdout}`);
    }
    return timeMs;
}

class MicrokernelsBenchmark {
    constructor() {
        this.wasmModule = null;
    }

    async init() {
        console.log("Compiling microkernels Wasm module (not part of benchmark measurement)...");
        this.wasmModule = await WebAssembly.compileStreaming(fetch(microkernelsUrl));
        console.log("Microkernels Wasm module compiled; starting measured benchmark runs...");
    }

    /**
     * Runs a single sub-benchmark in a fresh module instance, so that each run
     * starts with a clean linear memory (the 1d convert kernels do not free
     * their output buffers).
     */
    async runSubBenchmark(name) {
        console.log(`Running microkernels ${name}...`);
        let stdout = "";
        await new Promise((resolve, reject) => {
            MicrokernelsModule({
                arguments: [String(LOOP_COUNT), name],
                print: (line) => {
                    console.log(`  [${name}] ${line}`);
                    stdout += `${line}\n`;
                },
                printErr: (line) => console.error(`  [${name}] ${line}`),
                instantiateWasm: instantiatePrecompiled(this.wasmModule, reject),
            }).then(resolve, reject);
        });
        return parseMicrokernelsOutput(name, stdout);
    }

    async runAndParse() {
        const steps = {};
        const stepTotals = [];
        for (const name of SUB_BENCHMARK_NAMES) {
            const timeMs = await this.runSubBenchmark(name);
            steps[name] = { tests: {}, total: timeMs };
            stepTotals.push(timeMs);
        }
        return {
            steps,
            total: geometricMean(stepTotals),
        };
    }
}

function createMicrokernelsSuite(benchmark, subIterationCount) {
    const steps = Array.from({ length: subIterationCount }, (_, i) => {
        let parsedResult = null;
        const step = new AsyncBenchmarkStep(
            `sub-iter-${i + 1}`,
            async () => {
                forceLayout();
                parsedResult = await benchmark.runAndParse();
                forceLayout();
            },
            { measureAsync: false }
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

const appName = "Microkernels";
const appVersion = "aee16b1";

try {
    const benchmark = new MicrokernelsBenchmark();
    await benchmark.init();

    /*--------- Running test suites ---------*/
    const suites = {
        default: createMicrokernelsSuite(benchmark, params.subIterationCount),
    };

    const benchmarkConnector = new BenchmarkConnector(suites, appName, appVersion);
    benchmarkConnector.connect();
} catch (error) {
    console.error("Failed to initialize Microkernels benchmark:", error);
    throw error;
}
