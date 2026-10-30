// Copyright 2026 Google LLC
//
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file or at
// https://developers.google.com/open-source/licenses/bsd

/**
 * Experimental wasm-perf microkernels Wasm benchmark (MAC and Convert).
 */

import MicrokernelsModule from "./build/microkernels.mjs";
import { AsyncBenchmarkSuite, BenchmarkConnector } from "speedometer-utils/benchmark.mjs";
import { createSubIteratedSteps, instantiatePrecompiled } from "speedometer-utils/helpers.mjs";
import { params } from "speedometer-utils/params.mjs";

const microkernelsUrl = new URL("./build/microkernels.wasm", import.meta.url);

// Loop count `N` passed to each suite's sub-benchmarks
const MAC_LOOP_COUNT = 5000000;
const CONVERT_LOOP_COUNT = 10000000;

/**
 * `microkernels/src/main.cc` times auto-vectorized kernels over arrays of
 * `N` pseudo-random elements, across many accumulator/input type combinations
 * (int8 .. int64, float, double), alongside a scalar reference
 * (`#pragma clang loop vectorize(disable)`) used to validate the result:
 *
 *   - mac (1d / 2d / 3d / 4d): Multiply-accumulate (MAC) reductions over
 *     contiguous 1D arrays and arrays of 2-, 3- and 4-component structs
 *     (42 type combinations per dimension).
 *   - convert (1d): Element-wise type conversion kernels across 56
 *     input/output type pairs (`out[i] = static_cast<OutTy>(in[i])`).
 */
const MAC_SUB_BENCHMARK_NAMES = ["1d", "2d", "3d", "4d"];

const MAC_VECTOR_TIME_REGEX = /^total mac vector run time:\s*([0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)/m;
const CONVERT_VECTOR_TIME_REGEX = /^total convert vector run time:\s*([0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)/m;

function parseSingleVectorTime(regex, label, stdout) {
    if (/^Failed /m.test(stdout)) {
        throw new Error(`microkernels "${label}" reported a validation failure:\n${stdout}`);
    }
    const match = stdout.match(regex);
    if (!match) {
        throw new Error(`Failed to parse microkernels "${label}" output:\n${stdout}`);
    }
    const timeMs = Number(match[1]);
    if (!Number.isFinite(timeMs) || timeMs <= 0) {
        throw new Error(`Invalid microkernels "${label}" timing value: ${timeMs}\n${stdout}`);
    }
    return timeMs;
}

export function parseMacOutput(name, stdout) {
    return parseSingleVectorTime(MAC_VECTOR_TIME_REGEX, `mac-${name}`, stdout);
}

export function parseConvertOutput(stdout) {
    return parseSingleVectorTime(CONVERT_VECTOR_TIME_REGEX, "convert-1d", stdout);
}

class MicrokernelsBenchmark {
    constructor(suiteName) {
        this.suiteName = suiteName;
        this.wasmModule = null;
    }

    async init() {
        console.log(`Compiling microkernels Wasm module for ${this.suiteName} (not part of benchmark measurement)...`);
        this.wasmModule = await WebAssembly.compileStreaming(fetch(microkernelsUrl));
        console.log(`Microkernels Wasm module compiled; starting measured ${this.suiteName} benchmark runs...`);
    }

    /**
     * Runs a single CLI sub-benchmark in a fresh module instance, so that each
     * run starts with a clean linear memory.
     */
    async runCliArg(loopCount, arg) {
        console.log(`Running microkernels (${this.suiteName}) ${arg} (N=${loopCount})...`);
        let stdout = "";
        await new Promise((resolve, reject) => {
            MicrokernelsModule({
                arguments: [String(loopCount), arg],
                print: (line) => {
                    console.log(`  [${this.suiteName}:${arg}] ${line}`);
                    stdout += `${line}\n`;
                },
                printErr: (line) => console.error(`  [${this.suiteName}:${arg}] ${line}`),
                instantiateWasm: instantiatePrecompiled(this.wasmModule, reject),
            }).then(resolve, reject);
        });
        return stdout;
    }

    async runMacSubBenchmark(name) {
        const stdout = await this.runCliArg(MAC_LOOP_COUNT, name);
        return {
            tests: {},
            total: parseMacOutput(name, stdout),
        };
    }

    async runConvertSubBenchmark() {
        const stdout = await this.runCliArg(CONVERT_LOOP_COUNT, "convert");
        return {
            tests: {},
            total: parseConvertOutput(stdout),
        };
    }
}

function createMicrokernelsSuite(benchmark, suiteName, subIterationCount) {
    const subBenchmarkNames = suiteName === "mac" ? MAC_SUB_BENCHMARK_NAMES : ["1d"];
    const runSubBenchmark = (name) => (suiteName === "mac" ? benchmark.runMacSubBenchmark(name) : benchmark.runConvertSubBenchmark());

    // TODO(ryandiaz): We may want to report the total as a geomean
    // so one sub-benchmark doesn't dominate.
    const steps = subBenchmarkNames.map((name) => {
        const subSuite = new AsyncBenchmarkSuite(
            name,
            createSubIteratedSteps(() => runSubBenchmark(name), subIterationCount)
        );
        return {
            name,
            async runAndRecord(stepParams, _parentSuite, _parentRecord, onProgress) {
                const { result } = await subSuite.runAndRecord(stepParams, onProgress);
                return result;
            },
        };
    });
    return new AsyncBenchmarkSuite("default", steps);
}

const VALID_SUITES = new Set(["mac", "convert"]);
const appVersion = "aee16b1";

/**
 * Wires up the benchmark for either the `"mac"` or `"convert"` microkernels suite.
 *
 * @param {"mac" | "convert"} suiteName
 */
export async function initializeMicrokernelsBenchmark(suiteName) {
    if (!VALID_SUITES.has(suiteName)) {
        throw new Error(`Unknown Microkernels suite "${suiteName}", expected one of: ${[...VALID_SUITES].join(", ")}`);
    }

    const appName = `Microkernels-${suiteName}`;
    try {
        const benchmark = new MicrokernelsBenchmark(suiteName);
        await benchmark.init();

        /*--------- Running test suites ---------*/
        const suites = {
            default: createMicrokernelsSuite(benchmark, suiteName, params.subIterationCount),
        };

        const benchmarkConnector = new BenchmarkConnector(suites, appName, appVersion);
        benchmarkConnector.connect();
    } catch (error) {
        console.error(`Failed to initialize ${appName} benchmark:`, error);
        throw error;
    }
}
