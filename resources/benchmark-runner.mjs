import { Metric } from "./metric.mjs";
import { params } from "./shared/params.mjs";
import { isValidIdentifier } from "./shared/helpers.mjs";
import { SUITE_RUNNER_LOOKUP } from "./suite-runner.mjs";

const performance = globalThis.performance;

export function geomeanToScore(geomean) {
    return 10000 / geomean;
}

// https://stackoverflow.com/a/47593316
function seededHashRandomNumberGenerator(a) {
    return function () {
        var t = a += 0x6d2b79f5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return (t ^ (t >>> 14)) >>> 0;
    };
}

class WakeLock {
    #wakeLockSentinel = undefined;
    async request() {
        if (!navigator.wakeLock)
            return;
        try {
            this.#wakeLockSentinel = await navigator.wakeLock.request("screen");
        } catch (err) {
            console.error(`${err.name}, ${err.message}`);
        }
    }

    async release() {
        if (!this.#wakeLockSentinel)
            return;
        try {
            await this.#wakeLockSentinel.release();
        } catch (err) {
            console.error(`${err.name}, ${err.message}`);
        } finally {
            this.#wakeLockSentinel = undefined;
        }
    }
}

export class BenchmarkRunner {
    constructor(suites, client) {
        if (!Array.isArray(suites) || !suites.every((suite) => isValidIdentifier(suite?.name)))
            throw new Error("Invalid suites");
        this._suites = suites;
        this._client = client;
        this._metrics = null;
        this._iterationCount = params.iterationCount;
        if (params.shuffleSeed !== "off")
            this._suiteOrderRandomNumberGenerator = seededHashRandomNumberGenerator(params.shuffleSeed);
        this._wakeLock = new WakeLock();
        this._resetMeasuredValues();
    }

    _resetMeasuredValues() {
        this._measuredValues = { steps: {} };
    }

    async runMultipleIterations(iterationCount) {
        this._iterationCount = iterationCount;
        if (this._client?.willStartFirstIteration)
            await this._client.willStartFirstIteration(iterationCount);

        try {
            await this._runMultipleIterations();
        } catch (error) {
            console.error(error);
            if (this._client?.handleError) {
                await this._client.handleError(error);
                return;
            }
        }

        if (this._client?.didFinishLastIteration)
            await this._client.didFinishLastIteration(this._metrics);
    }

    async _runMultipleIterations() {
        const iterationStartLabel = "iteration-start";
        const iterationEndLabel = "iteration-end";
        for (let i = 0; i < this._iterationCount; i++) {
            performance.mark(iterationStartLabel);
            await this.runAllSuites(i);
            performance.mark(iterationEndLabel);
            performance.measure(`iteration-${i}`, iterationStartLabel, iterationEndLabel);
        }
    }

    _removeFrame() {
        if (this._frame) {
            this._frame.parentNode.removeChild(this._frame);
            this._frame = null;
        }
    }

    async _appendFrame() {
        const frame = document.createElement("iframe");
        const style = frame.style;
        style.width = `${params.viewport.width}px`;
        style.height = `${params.viewport.height}px`;
        style.border = "0px none";
        style.position = "absolute";
        frame.setAttribute("scrolling", "no");
        frame.className = "test-runner";
        style.left = "50%";
        style.top = "50%";
        style.transform = "translate(-50%, -50%)";

        if (this._client?.willAddTestFrame)
            await this._client.willAddTestFrame(frame);

        document.body.insertBefore(frame, document.body.firstChild);
        this._frame = frame;
        return frame;
    }

    async _prepareAllSuites() {
        this._resetMeasuredValues();
        await this._wakeLock.request();

        const prepareStartLabel = "runner-prepare-start";
        const prepareEndLabel = "runner-prepare-end";

        performance.mark(prepareStartLabel);
        let suites = [...this._suites];
        if (this._suiteOrderRandomNumberGenerator)
            this._shuffleSuites(suites);

        performance.mark(prepareEndLabel);
        performance.measure("runner-prepare", prepareStartLabel, prepareEndLabel);

        return suites;
    }

    _shuffleSuites(suites) {
        // We just do a simple Fisher-Yates shuffle based on the repeated hash of the
        // seed. This is not a high quality RNG, but it's plenty good enough.
        for (let i = 0; i < suites.length - 1; i++) {
            const j = i + (this._suiteOrderRandomNumberGenerator() % (suites.length - i));
            const tmp = suites[i];
            suites[i] = suites[j];
            suites[j] = tmp;
        }
    }

    async runAllSuites(iteration) {
        const suites = await this._prepareAllSuites();
        try {
            for (const suite of suites) {
                if (!suite.enabled)
                    continue;
                try {
                    await this._appendFrame();
                    let cleanupErrorListeners;
                    const errorPromise = new Promise((_, reject) => {
                        const errorHandler = (e) => {
                            reject(new Error(`Workload ${suite.name} encountered an error: ${e.message || e.reason}`));
                        };
                        window.addEventListener("error", errorHandler, { once: true });
                        window.addEventListener("unhandledrejection", errorHandler, { once: true });
                        
                        cleanupErrorListeners = () => {
                            window.removeEventListener("error", errorHandler);
                            window.removeEventListener("unhandledrejection", errorHandler);
                        };
                    });

                    try {
                        await Promise.race([this.runSuite(suite), errorPromise]);
                    } finally {
                        if (cleanupErrorListeners) cleanupErrorListeners();
                    }
                } catch (error) {
                    console.error(`Workload ${suite.name} failed:`, error);
                    this._measuredValues.steps[suite.name] = { total: 0 };
                    this._client?.didFailSuite?.(suite, error);
                } finally {
                    this._removeFrame();
                }
            }
        } finally {
            await this._finishRunAllSuites(iteration);
        }
    }

    async _finishRunAllSuites(iteration) {
        const finalizeStartLabel = "runner-finalize-start";
        const finalizeEndLabel = "runner-finalize-end";

        performance.mark(finalizeStartLabel);
        await this._finalize(iteration);
        performance.mark(finalizeEndLabel);
        performance.measure("runner-finalize", finalizeStartLabel, finalizeEndLabel);
        await this._wakeLock.release();
    }

    async runSuite(suite) {
        // FIXME: Encapsulate more state in the SuiteRunner.
        // FIXME: Return and use measured values from SuiteRunner.
        const type = suite.type ?? "default";
        const suiteRunnerClass = SUITE_RUNNER_LOOKUP[type];
        const suiteRunner = new suiteRunnerClass(this._frame, this._page, params, suite, this._client, this._measuredValues);
        await suiteRunner.run();
    }

    async _finalize(iteration) {
        this._appendIterationMetrics(iteration);
        if (this._client?.didRunSuites) {
            const iterationWasmMetric = this._metrics[`Iteration-${iteration}-Wasm-Total`];
            const iterationWebgpuMetric = this._metrics[`Iteration-${iteration}-WebGPU-Total`];

            const hasWasm = this._suites.some(s => s.enabled && s.tags?.includes("wasm"));
            const hasWebgpu = this._suites.some(s => s.enabled && s.tags?.includes("webgpu"));

            if (hasWasm && isNaN(iterationWasmMetric?.geomean)) {
                throw new Error(`Iteration ${iteration}: Wasm was enabled but produced NaN geomean.`);
            }
            if (hasWebgpu && isNaN(iterationWebgpuMetric?.geomean)) {
                throw new Error(`Iteration ${iteration}: WebGPU was enabled but produced NaN geomean.`);
            }

            const wasmGeomean = hasWasm ? iterationWasmMetric.geomean : 0;
            const webgpuGeomean = hasWebgpu ? iterationWebgpuMetric.geomean : 0;

            this._measuredValues.wasmGeomean = wasmGeomean;
            this._measuredValues.wasmScore = geomeanToScore(wasmGeomean);
            this._measuredValues.webgpuGeomean = webgpuGeomean;
            this._measuredValues.webgpuScore = geomeanToScore(webgpuGeomean);

            await this._client.didRunSuites(this._measuredValues);
        }
    }

    _appendIterationMetrics(iteration) {
        const getMetric = (name, unit = "ms") => this._metrics[name] || (this._metrics[name] = new Metric(name, unit));
        const iterationMetric = (i, name) => {
            if (i >= params.iterationCount)
                throw new Error(`Requested iteration=${i} does not exist.`);
            return getMetric(`Iteration-${i}-${name}`);
        };

        const collectSubMetrics = (prefix, items, parent) => {
            for (let name in items) {
                const results = items[name];
                const metric = getMetric(prefix + name);
                metric.add(results.total ?? results);
                if (metric.parent !== parent)
                    parent.addChild(metric);
                if (results.steps)
                    collectSubMetrics(`${metric.name}${Metric.separator}`, results.steps, metric);
            }
        };
        const initializeMetrics = this._metrics === null;
        if (initializeMetrics)
            this._metrics = { __proto__: null };

        const iterationResults = this._measuredValues.steps;
        collectSubMetrics("", iterationResults);

        if (initializeMetrics) {
            // Prepare all iteration metrics so they are listed at the end of
            // of the _metrics object.
            for (let i = 0; i < this._iterationCount; i++) {
                iterationMetric(i, "Wasm-Total").description = `Wasm test totals for iteration ${i}`;
                iterationMetric(i, "WebGPU-Total").description = `WebGPU test totals for iteration ${i}`;
            }
            getMetric("Wasm-Geomean", "ms").description = "Geomean of Wasm test totals";
            getMetric("Wasm-Score", "score").description = "Scaled inverse of the Wasm Geomean";
            getMetric("WebGPU-Geomean", "ms").description = "Geomean of WebGPU test totals";
            getMetric("WebGPU-Score", "score").description = "Scaled inverse of the WebGPU Geomean";
            if (params.measurePrepare)
                getMetric("Prepare", "ms").description = "Geomean of workload prepare times";
        }

        const wasmGeomean = getMetric("Wasm-Geomean");
        const webgpuGeomean = getMetric("WebGPU-Geomean");
        const iterationWasmTotal = iterationMetric(iteration, "Wasm-Total");
        const iterationWebgpuTotal = iterationMetric(iteration, "WebGPU-Total");

        for (const [suiteName, results] of Object.entries(iterationResults)) {
            if (results.total > 0) {
                const suite = this._suites.find(s => s.name === suiteName);
                if (suite?.tags?.includes("wasm")) {
                    iterationWasmTotal.add(results.total);
                } else if (suite?.tags?.includes("webgpu")) {
                    iterationWebgpuTotal.add(results.total);
                } else {
                    throw new Error(`Suite ${suiteName} has neither "wasm" nor "webgpu" tag.`);
                }
            }
        }

        iterationWasmTotal.computeAggregatedMetrics();
        iterationWebgpuTotal.computeAggregatedMetrics();

        if (!isNaN(iterationWasmTotal.geomean) && iterationWasmTotal.geomean > 0) {
            wasmGeomean.add(iterationWasmTotal.geomean);
            getMetric("Wasm-Score", "score").add(geomeanToScore(iterationWasmTotal.geomean));
        }
        if (!isNaN(iterationWebgpuTotal.geomean) && iterationWebgpuTotal.geomean > 0) {
            webgpuGeomean.add(iterationWebgpuTotal.geomean);
            getMetric("WebGPU-Score", "score").add(geomeanToScore(iterationWebgpuTotal.geomean));
        }

        if (params.measurePrepare) {
            const iterationPrepare = iterationMetric(iteration, "Prepare");
            for (const results of Object.values(iterationResults))
                iterationPrepare.add(results.prepare);
            iterationPrepare.computeAggregatedMetrics();
            const prepare = getMetric("Prepare");
            prepare.add(iterationPrepare.geomean);
        }

        for (const metric of Object.values(this._metrics))
            metric.computeAggregatedMetrics();
    }
}
