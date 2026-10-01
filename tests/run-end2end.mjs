#! /usr/bin/env node

import assert from "assert";
import testSetup from "./helper.mjs";
import { benchmarkConfigurator } from "../resources/benchmark-configurator.mjs";

const HELP = `
This script runs end2end tests by invoking the benchmark via the main page in /index.html.
`.trim();

const ONE_MINUTE_IN_MS = 60000;

const { driver, createDriver, concurrency, PORT, stop } = await testSetup(HELP);

// Running all of the benchmarks is very slow (especially when the GPU is emulated). To run the
// tests faster we run all of the Wasm benchmarks, and only a few GPU tests to cover most of
// the common code. To run all benchmarks, enable this.
const RUN_FULL_SUITE = false;
let suites = benchmarkConfigurator.suites.filter(suite =>
    !suite.url.includes('/experimental/') &&
    suite.tags.some((tag) => tag === 'wasm' || tag === 'gpu-test-suite')
);
let timeout = 10 * ONE_MINUTE_IN_MS;

if (RUN_FULL_SUITE) {
    suites = benchmarkConfigurator.suites;
    timeout = 20 * ONE_MINUTE_IN_MS;
}

const availableDrivers = [driver];
let createdDriversCount = 1;
const waitingResolvers = [];

async function acquireDriver() {
    if (availableDrivers.length > 0)
        return availableDrivers.pop();
    if (createdDriversCount < concurrency) {
        createdDriversCount++;
        try {
            const newDriver = await createDriver();
            await newDriver.manage().setTimeouts({ script: timeout });
            return newDriver;
        } catch (e) {
            createdDriversCount--;
            throw e;
        }
    }
    return new Promise((resolve) => waitingResolvers.push(resolve));
}

function releaseDriver(targetDriver) {
    if (waitingResolvers.length > 0) {
        const resolve = waitingResolvers.shift();
        resolve(targetDriver);
    } else {
        availableDrivers.push(targetDriver);
    }
}

async function withDriver(fn) {
    const targetDriver = await acquireDriver();
    try {
        return await fn(targetDriver);
    } finally {
        releaseDriver(targetDriver);
    }
}

async function testPage(targetDriver, url) {
    console.log(`Testing: ${url}`);
    await targetDriver.get(`http://localhost:${PORT}/${url}`);

    await targetDriver.executeAsyncScript((callback) => {
        if (globalThis.benchmarkClient)
            callback();
        else
            globalThis.addEventListener("BenchmarkReady", () => callback(), { once: true });
    });

    console.log(`    - Awaiting Benchmark: ${url}`);
    const { error, metrics } = await targetDriver.executeAsyncScript((callback) => {
        globalThis.addEventListener(
            "BenchmarkDone",
            () =>
                callback({
                    metrics: globalThis.benchmarkClient.metrics,
                }),
            { once: true }
        );
        // Install error handlers to report page errors back to selenium.
        globalThis.addEventListener("error", (message, source, lineno, colno, error) =>
            callback({
                error: { message, source, lineno, colno, error },
            })
        );
        globalThis.addEventListener("unhandledrejection", (e) => {
            callback({
                error: {
                    message: e.reason.toString(),
                    stack: e.reason?.stack,
                },
            });
        });
        globalThis.benchmarkClient.start();
    });

    if (error)
        throw new Error(error.message + (error?.stack ?? ""));

    validateMetrics(metrics);
    return metrics;
}

function validateMetrics(metrics) {
    for (const [name, metric] of Object.entries(metrics))
        validateMetric(name, metric);
    assert((metrics["Wasm-Geomean"]?.mean > 0) || (metrics["WebGPU-Geomean"]?.mean > 0));
    assert((metrics["Wasm-Score"]?.mean > 0) || (metrics["WebGPU-Score"]?.mean > 0));
}

function validateMetric(name, metric) {
    assert(metric.name === name);
    assert(metric.mean >= 0);
}

async function testIterations() {
    const iterationCount = 2;
    const subIterationCount = 1;
    const enabledSuites = suites.filter((suite) => suite.enabled);
    await Promise.all(
        enabledSuites.map((suite) =>
            withDriver(async (targetDriver) => {
                const metrics = await testPage(
                    targetDriver,
                    `index.html?iterationCount=${iterationCount}&subIterationCount=${subIterationCount}&suites=${suite.name}`
                );
                suites.forEach((otherSuite) => {
                    if (otherSuite.name === suite.name) {
                        const metric = metrics[otherSuite.name];
                        assert(metric, `Missing suite result for ${otherSuite.name}`);
                        assert(metric.values.length === iterationCount);
                        console.log(`Suite ${otherSuite.name} took ${metric.sum}ms`);
                    } else {
                        assert(!(otherSuite.name in metrics));
                    }
                });
                if (metrics["Wasm-Geomean"]?.mean > 0) {
                    assert(metrics["Wasm-Geomean"].values.length === iterationCount);
                    assert(metrics["Wasm-Score"].values.length === iterationCount);
                }
                if (metrics["WebGPU-Geomean"]?.mean > 0) {
                    assert(metrics["WebGPU-Geomean"].values.length === iterationCount);
                    assert(metrics["WebGPU-Score"].values.length === iterationCount);
                }
            })
        )
    );
}

async function testSubIterations() {
    const testSuites = [
        "Image-Classification-LiteRT.js-wasm",
        "Feature-Extraction-wasm"
    ];

    let suites = benchmarkConfigurator.suites.filter(suite => testSuites.includes(suite.name));
    const iterationCount = 1;
    const subIterationCount = 3;
    // URL with suites specified
    const params = [`iterationCount=${iterationCount}`, `subIterationCount=${subIterationCount}`, `suites=${testSuites.join(',')}`];
    const metrics = await withDriver((targetDriver) => testPage(targetDriver, `index.html?${params.join("&")}`));

    suites.forEach((suite) => {
        const metric = metrics[suite.name];
        assert(metric, `Missing suite result for ${suite.name}`);
        assert(metric.values.length === iterationCount);

        // Verify submetrics generated from steps
        for (let i = 0; i < subIterationCount; i++) {
            // we use some() to find the submetric since the separator might be '/'
            const submetricKey = Object.keys(metrics).find(k => k.startsWith(suite.name) && k.includes(`sub-iter-${i + 1}`));
            assert(submetricKey, `Missing submetric result ending in sub-iter-${i + 1} for ${suite.name}`);
            const submetric = metrics[submetricKey];
            assert(submetric.values.length === iterationCount);
        }
    });
}

async function testAll() {
    await Promise.all(
        suites.map((suite) =>
            withDriver(async (targetDriver) => {
                const metrics = await testPage(
                    targetDriver,
                    `index.html?iterationCount=1&subIterationCount=1&suites=${suite.name}`
                );
                assert(suite.name in metrics);
                const metric = metrics[suite.name];
                assert(metric.values.length === 1);
                if (metrics["Wasm-Geomean"]?.mean > 0) {
                    assert(metrics["Wasm-Geomean"].values.length === 1);
                    assert(metrics["Wasm-Score"].values.length === 1);
                }
                if (metrics["WebGPU-Geomean"]?.mean > 0) {
                    assert(metrics["WebGPU-Geomean"].values.length === 1);
                    assert(metrics["WebGPU-Score"].values.length === 1);
                }
            })
        )
    );
}

async function testDeveloperMode() {
    const params = ["developerMode", "iterationCount=1", "warmupBeforeSync=2", "waitBeforeSync=2", "shuffleSeed=123", "suites=Image-Classification-LiteRT.js-wasm"];
    const metrics = await withDriver((targetDriver) => testPage(targetDriver, `index.html?${params.join("&")}`));
    suites.forEach((suite) => {
        if (suite.name === "Image-Classification-LiteRT.js-wasm") {
            const metric = metrics[suite.name];
            assert(metric.values.length === 1);
        } else {
            assert(!(suite.name in metrics));
        }
    });
}

async function test() {
    try {
        benchmarkConfigurator.suites.forEach((suite) => {
            if (suite.tags.includes("default") && suite.tags.includes("experimental")) {
                throw new Error(`Suite "${suite.name}" has both 'default' and 'experimental' tags. Experimental workloads should only have the 'experimental' tag, while stable workloads should have the 'default' tag.`);
            }
        });
        await driver.manage().setTimeouts({ script: timeout });
        await Promise.all([
            testIterations(),
            testSubIterations(),
            testAll(),
            testDeveloperMode(),
        ]);
        console.log("\nTests complete!");
    } catch (e) {
        console.error("\nTests failed!");
        throw e;
    } finally {
        await stop();
    }
}

setImmediate(test);
