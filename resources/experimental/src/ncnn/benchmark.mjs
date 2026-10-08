// Copyright 2026 Google LLC
//
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file or at
// https://developers.google.com/open-source/licenses/bsd

/**
 * Experimental NCNN Wasm neural network inference benchmark (benchncnn).
 */

import BenchncnnModule from "../../dist/ncnn/benchncnn.mjs";
import { AsyncBenchmarkStep, AsyncBenchmarkSuite, BenchmarkConnector } from "speedometer-utils/benchmark.mjs";
import { forceLayout } from "speedometer-utils/helpers.mjs";
import { params } from "speedometer-utils/params.mjs";

const benchncnnWasmUrl = new URL("../../dist/ncnn/benchncnn.wasm", import.meta.url);

const DATA_BASE_URL = new URL("ncnn/data/", window.location.href);

/**
 * Matches benchncnn's per-model summary line written to stderr:
 *   `<model>  min = <ms>  max = <ms>  avg = <ms>`
 * The timing covers only `Extractor` input + extract (inference) for the timed
 * loop iterations, excluding param parsing, weight setup and the warm-up
 * iterations.
 */
const AVG_REGEX = /avg =\s+([0-9]*\.?[0-9]+)/;

/**
 * benchncnn positional arguments, matching wasm-perf/benchmarks/ncnn/ncnn.py:
 *   [loop count] [num threads] [powersave] [gpu device] [cooling down]
 * benchncnn always runs 8 untimed warm-up inferences before the timed loop.
 */
const LOOP_COUNT = "1";
const NUM_THREADS = "1";
const POWERSAVE = "0";
const GPU_DEVICE = "-1";
const COOLING_DOWN = "0";

/**
 * Weights are not loaded from disk: benchncnn uses an all-zero DataReader, so
 * only the network topology (`.param`) files are needed. Input tensors are
 * filled with a constant value.
 */
const SUB_BENCHMARKS = [
    { name: "efficientnetv2_b0", shape: "[224,224,3]" },
    { name: "mobilenet_v3", shape: "[224,224,3]" },
    { name: "regnety_400m", shape: "[224,224,3]" },
    { name: "resnet18", shape: "[224,224,3]" },
    { name: "resnet50_int8", shape: "[224,224,3]" },
    { name: "yolov4-tiny", shape: "[416,416,3]" },
];

function instantiatePrecompiled(wasmModule) {
    return (imports, successCallback) => {
        const instance = new WebAssembly.Instance(wasmModule, imports);
        successCallback(instance, wasmModule);
        return instance.exports;
    };
}

async function fetchUint8Array(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    return new Uint8Array(await response.arrayBuffer());
}

class NcnnBenchmark {
    constructor() {
        this.ncnnModule = null;
        this.paramFiles = new Map();
    }

    async init() {
        console.log("Compiling NCNN Wasm module and loading param files (not part of benchmark measurement)...");

        const [ncnnModule] = await Promise.all([
            WebAssembly.compileStreaming(fetch(benchncnnWasmUrl)),
            ...SUB_BENCHMARKS.map(async ({ name }) => {
                const filename = `${name}.param`;
                const bytes = await fetchUint8Array(new URL(filename, DATA_BASE_URL));
                this.paramFiles.set(filename, bytes);
            }),
        ]);
        this.ncnnModule = ncnnModule;

        console.log("NCNN Wasm module and param files loaded; starting measured benchmark runs...");
    }

    async runSubBenchmark({ name, shape }) {
        console.log(`Running ${name}...`);
        const paramFile = `${name}.param`;
        const paramBytes = this.paramFiles.get(paramFile);

        // benchncnn reports its results on stderr.
        let stderr = "";
        await BenchncnnModule({
            arguments: [LOOP_COUNT, NUM_THREADS, POWERSAVE, GPU_DEVICE, COOLING_DOWN, `param=/${paramFile}`, `shape=${shape}`],
            preRun: [
                (mod) => {
                    mod.FS.writeFile(`/${paramFile}`, paramBytes);
                },
            ],
            print: (line) => console.log(`  [${name}] ${line}`),
            printErr: (line) => {
                console.log(`  [${name}] ${line}`);
                stderr += line + "\n";
            },
            instantiateWasm: instantiatePrecompiled(this.ncnnModule),
        });

        const match = stderr.match(AVG_REGEX);
        if (!match) {
            throw new Error(`Failed to parse benchncnn output for ${name}:\n${stderr}`);
        }

        return {
            tests: {},
            total: Number(match[1]),
        };
    }
}

function createNcnnSubSuite(benchmark, subBenchmark, subIterationCount) {
    const steps = Array.from({ length: subIterationCount }, (_, i) => {
        let parsedResult = null;
        const step = new AsyncBenchmarkStep(
            `sub-iter-${i + 1}`,
            async () => {
                forceLayout();
                parsedResult = await benchmark.runSubBenchmark(subBenchmark);
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
    return new AsyncBenchmarkSuite(subBenchmark.name, steps);
}

const appName = "NCNN";
const appVersion = "20241226";

try {
    const benchmark = new NcnnBenchmark();
    await benchmark.init();

    const steps = SUB_BENCHMARKS.map((subBenchmark) => {
        const subSuite = createNcnnSubSuite(benchmark, subBenchmark, params.subIterationCount);
        return {
            name: subBenchmark.name,
            async runAndRecord(stepParams) {
                const { result } = await subSuite.runAndRecord(stepParams);
                return result;
            },
        };
    });

    /*--------- Running test suites ---------*/
    const suites = {
        default: new AsyncBenchmarkSuite("default", steps),
    };

    const benchmarkConnector = new BenchmarkConnector(suites, appName, appVersion);
    benchmarkConnector.connect();
} catch (error) {
    console.error("Failed to initialize NCNN benchmark:", error);
    throw error;
}
