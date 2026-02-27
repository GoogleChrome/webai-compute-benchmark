#! /usr/bin/env node

import assert from "assert";
import testSetup from "./helper.mjs";
import { benchmarkConfigurator } from "../resources/benchmark-configurator.mjs";

const HELP = `
This script runs end2end tests by invoking the benchmark via the main page in /index.html.
`.trim();

const ONE_MINUTE_IN_MS = 60000;

const { driver, PORT, stop } = await testSetup(HELP);

// Running all of the benchmarks is very slow (especially when the GPU is emulated). To run the
// tests faster we run all of the Wasm benchmarks, and only a few GPU tests to cover most of
// the common code. To run all benchmarks, enable this.
const RUN_FULL_SUITE = false;
let tags = 'wasm,gpu-test-suite';
let suites = benchmarkConfigurator.suites.filter(suite =>
    !suite.url.includes('/experimental/') &&
    suite.tags.some((tag) => tag === 'wasm' || tag === 'gpu-test-suite')
);
let timeout = 20 * ONE_MINUTE_IN_MS;

if (RUN_FULL_SUITE) {
    tags = 'all';
    suites = benchmarkConfigurator.suites;
    timeout = 30 * ONE_MINUTE_IN_MS;
}

async function testPage(url) {
    console.log(`Testing: ${url}`);
    await driver.get(`http://localhost:${PORT}/${url}`);

    await driver.executeAsyncScript((callback) => {
        if (globalThis.benchmarkClient)
            callback();
        else
            globalThis.addEventListener("BenchmarkReady", () => callback(), { once: true });
    });

    console.log("    - Awaiting Benchmark");
    const { error, metrics } = await driver.executeAsyncScript((callback) => {
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
    assert(metrics.Geomean.mean > 0);
    assert(metrics.Score.mean > 0);
}

function validateMetric(name, metric) {
    assert(metric.name === name);
    assert(metric.mean >= 0);
}

async function testIterations() {
    const iterationCount = 2;
    const subIterationCount = 1;
    const metrics = await testPage(`index.html?iterationCount=${iterationCount}&subIterationCount=${subIterationCount}&tags=${tags}`);
    suites.forEach((suite) => {
        if (suite.enabled) {
            const metric = metrics[suite.name];
            assert(metric, `Missing suite result for ${suite.name}`);
            assert(metric.values.length === iterationCount);
            console.log(`Suite ${suite.name} took ${metric.sum}ms`);
        } else {
            assert(!(suite.name in metrics));
        }
    });
    assert(metrics.Geomean.values.length === iterationCount);
    assert(metrics.Score.values.length === iterationCount);
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
    const metrics = await testPage(`index.html?${params.join("&")}`);

    console.log("Collected metrics keys:", Object.keys(metrics));

    suites.forEach((suite) => {
        const metric = metrics[suite.name];
        assert(metric, `Missing suite result for ${suite.name}`);
        assert(metric.values.length === iterationCount);

        // Verify submetrics generated from steps
        for (let i = 0; i < subIterationCount; i++) {
            // we use some() to find the submetric since the separator might be '/'
            const submetricKey = Object.keys(metrics).find(k => k.startsWith(suite.name) && k.includes(`run-${i + 1}`));
            assert(submetricKey, `Missing submetric result ending in run-${i + 1} for ${suite.name}`);
            const submetric = metrics[submetricKey];
            assert(submetric.values.length === iterationCount);
        }
    });
}

async function testAll() {
    const metrics = await testPage(`index.html?iterationCount=1&subIterationCount=1&tags=${tags}`);
    suites.forEach((suite) => {
        assert(suite.name in metrics);
        const metric = metrics[suite.name];
        assert(metric.values.length === 1);
    });
    assert(metrics.Geomean.values.length === 1);
    assert(metrics.Score.values.length === 1);
}

async function testDeveloperMode() {
    const params = ["developerMode", "iterationCount=1", "warmupBeforeSync=2", "waitBeforeSync=2", "shuffleSeed=123", "suites=Image-Classification-LiteRT.js-wasm"];
    const metrics = await testPage(`index.html?${params.join("&")}`);
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
        await testIterations();
        await testSubIterations();
        await testAll();
        await testDeveloperMode();
        console.log("\nTests complete!");
    } catch (e) {
        console.error("\nTests failed!");
        throw e;
    } finally {
        stop();
    }
}

setImmediate(test);
