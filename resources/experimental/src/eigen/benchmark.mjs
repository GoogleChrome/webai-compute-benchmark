// Copyright 2026 Google LLC
//
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file or at
// https://developers.google.com/open-source/licenses/bsd

/**
 * Experimental Eigen Wasm linear algebra & geometry benchmark (eig33 and geometry).
 */

import Eig33Module from "./build/eig33.mjs";
import GeometryModule from "./build/geometry.mjs";
import { AsyncBenchmarkStep, AsyncBenchmarkSuite, BenchmarkConnector } from "speedometer-utils/benchmark.mjs";
import { forceLayout } from "speedometer-utils/helpers.mjs";
import { params } from "speedometer-utils/params.mjs";

const NUM_PATTERN = "([0-9]*\\.?[0-9]+(?:[eE][-+]?[0-9]+)?)";
const EIGHT_NUMS_PATTERN = Array.from({ length: 8 }, () => NUM_PATTERN).join("\\s+");

/**
 * `bench/eig33.cpp` measures 3x3 symmetric eigenvalue decomposition (FP64,
 * best time over 10 tries of 400,000 repetitions) across three solvers:
 *   - eigen-iterative: Tridiagonalization + implicit symmetric QR iteration
 *     (`SelfAdjointEigenSolver::compute`).
 *   - eigen-direct: Closed-form trigonometric root solver
 *     (`SelfAdjointEigenSolver::computeDirect`).
 *   - direct: Custom closed-form 3x3 eigensolver reference (`eigen33`).
 */
const EIG33_SUB_BENCHMARKS = [
    {
        name: "eigen-iterative",
        regex: new RegExp(`^Eigen iterative:\\s*${NUM_PATTERN}s`, "m"),
    },
    {
        name: "eigen-direct",
        regex: new RegExp(`^Eigen direct\\s*:\\s*${NUM_PATTERN}s`, "m"),
    },
    {
        name: "direct",
        regex: new RegExp(`^Direct:\\s*${NUM_PATTERN}s`, "m"),
    },
];

/**
 * `bench/geometry.cpp` measures 3D geometry transformations on FP32 point
 * batches of size 3xN for N = 1..8 (best time over 10 tries of 100,000
 * repetitions) across 7 transformation representations. Following
 * `wasm-perf/benchmarks/eigen/eigen.py`, each row's 8 batch sizes (N = 1..8)
 * are summarized by their geometric mean.
 */
const GEOMETRY_SUB_BENCHMARKS = [
    {
        name: "matrix-3x3",
        regex: new RegExp(`^matrix 3x3\\s+${EIGHT_NUMS_PATTERN}`, "m"),
    },
    {
        name: "quaternion",
        regex: new RegExp(`^quaternion\\s+${EIGHT_NUMS_PATTERN}`, "m"),
    },
    {
        name: "quat-mat",
        regex: new RegExp(`^quat-mat\\s+${EIGHT_NUMS_PATTERN}`, "m"),
    },
    {
        name: "isometry3",
        regex: new RegExp(`^isometry3\\s+${EIGHT_NUMS_PATTERN}`, "m"),
    },
    {
        name: "affine3",
        regex: new RegExp(`^affine3\\s+${EIGHT_NUMS_PATTERN}`, "m"),
    },
    {
        name: "c-affine3",
        regex: new RegExp(`^c affine3\\s+${EIGHT_NUMS_PATTERN}`, "m"),
    },
    {
        name: "proj3",
        regex: new RegExp(`^proj3\\s+${EIGHT_NUMS_PATTERN}`, "m"),
    },
];

function geometricMean(values) {
    const logSum = values.reduce((sum, v) => sum + Math.log(v), 0);
    return Math.exp(logSum / values.length);
}

function parsePositiveMs(rawStrings, label, stdout) {
    const msValues = rawStrings.map((s) => Number(s) * 1000);
    if (msValues.some((v) => !Number.isFinite(v) || v <= 0)) {
        throw new Error(`Invalid timing values for ${label}: ${rawStrings.join(", ")}\n${stdout}`);
    }
    return msValues;
}

export function parseEig33Output(stdout) {
    const steps = {};
    const stepTotals = [];

    for (const { name, regex } of EIG33_SUB_BENCHMARKS) {
        const match = stdout.match(regex);
        if (!match) {
            throw new Error(`Failed to parse "${name}" from eig33 output:\n${stdout}`);
        }
        const [timeMs] = parsePositiveMs([match[1]], name, stdout);
        steps[name] = { tests: {}, total: timeMs };
        stepTotals.push(timeMs);
    }

    return {
        steps,
        total: geometricMean(stepTotals),
    };
}

export function parseGeometryOutput(stdout) {
    const steps = {};
    const stepTotals = [];

    for (const { name, regex } of GEOMETRY_SUB_BENCHMARKS) {
        const match = stdout.match(regex);
        if (!match) {
            throw new Error(`Failed to parse "${name}" from geometry output:\n${stdout}`);
        }
        const batchMsValues = parsePositiveMs(match.slice(1, 9), name, stdout);
        const rowGeomeanMs = geometricMean(batchMsValues);
        steps[name] = { tests: {}, total: rowGeomeanMs };
        stepTotals.push(rowGeomeanMs);
    }

    return {
        steps,
        total: geometricMean(stepTotals),
    };
}

const EIGEN_SUITES = {
    eig33: {
        wasmUrl: new URL("./build/eig33.wasm", import.meta.url),
        moduleFactory: Eig33Module,
        parseOutput: parseEig33Output,
    },
    geometry: {
        wasmUrl: new URL("./build/geometry.wasm", import.meta.url),
        moduleFactory: GeometryModule,
        parseOutput: parseGeometryOutput,
    },
};

function instantiatePrecompiled(wasmModule, onError) {
    return (imports, successCallback) => {
        WebAssembly.instantiate(wasmModule, imports).then((instance) => {
            successCallback(instance, wasmModule);
        }, onError);
        return {};
    };
}

class EigenBenchmark {
    constructor(suiteName, suiteConfig) {
        this.suiteName = suiteName;
        this.suiteConfig = suiteConfig;
        this.wasmModule = null;
    }

    async init() {
        console.log(`Compiling Eigen ${this.suiteName} Wasm module (not part of benchmark measurement)...`);
        this.wasmModule = await WebAssembly.compileStreaming(fetch(this.suiteConfig.wasmUrl));
        console.log(`Eigen ${this.suiteName} Wasm module compiled; starting measured benchmark runs...`);
    }

    async runAndParse() {
        console.log(`Running Eigen ${this.suiteName}...`);
        let stdout = "";
        await new Promise((resolve, reject) => {
            this.suiteConfig
                .moduleFactory({
                    print: (line) => {
                        console.log(`  [${this.suiteName}] ${line}`);
                        stdout += `${line}\n`;
                    },
                    printErr: (line) => console.error(`  [${this.suiteName}] ${line}`),
                    instantiateWasm: instantiatePrecompiled(this.wasmModule, reject),
                })
                .then(resolve, reject);
        });

        return this.suiteConfig.parseOutput(stdout);
    }
}

function createEigenSuite(benchmark, subIterationCount) {
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
    const suite = new AsyncBenchmarkSuite("default", steps);
    return {
        async runAndRecord(stepParams, onProgress) {
            const response = await suite.runAndRecord(stepParams, onProgress);
            const measuredValues = response.result;

            // Transpose sub-iter -> sub-benchmark into sub-benchmark -> sub-iter:
            const subBenchmarkSteps = {};
            for (const [subIterName, subIterResult] of Object.entries(measuredValues.steps)) {
                for (const [subBenchName, subBenchResult] of Object.entries(subIterResult.steps)) {
                    subBenchmarkSteps[subBenchName] ??= { steps: {}, total: 0 };
                    const val = subBenchResult.total;
                    subBenchmarkSteps[subBenchName].steps[subIterName] = { tests: {}, total: val };
                    subBenchmarkSteps[subBenchName].total += val;
                }
            }
            measuredValues.steps = subBenchmarkSteps;

            return response;
        },
    };
}

const appVersion = "5.0.0-dev";

/**
 * Wires up the benchmark for one of the Eigen suites in `EIGEN_SUITES`.
 *
 * @param {keyof typeof EIGEN_SUITES} suiteName
 */
export async function initializeEigenBenchmark(suiteName) {
    const suiteConfig = EIGEN_SUITES[suiteName];
    if (!suiteConfig) {
        throw new Error(`Unknown Eigen suite "${suiteName}", expected one of: ${Object.keys(EIGEN_SUITES).join(", ")}`);
    }

    const appName = `Eigen-${suiteName}`;
    try {
        const benchmark = new EigenBenchmark(suiteName, suiteConfig);
        await benchmark.init();

        /*--------- Running test suites ---------*/
        const suites = {
            default: createEigenSuite(benchmark, params.subIterationCount),
        };

        const benchmarkConnector = new BenchmarkConnector(suites, appName, appVersion);
        benchmarkConnector.connect();
    } catch (error) {
        console.error(`Failed to initialize ${appName} benchmark:`, error);
        throw error;
    }
}
