import { STEP_RUNNER_LOOKUP } from "./shared/step-runner.mjs";
import { isValidUrl } from "./shared/params.mjs";
import { isValidIdentifier } from "./shared/helpers.mjs";

export class SuiteRunner {
    #frame;
    #params;
    #suite;
    #client;
    #suiteResults;
    #prepareTime = 0;
    #stopForwardingFrameErrors = null;

    constructor(frame, params, suite, client, measuredValues) {
        if (!isValidIdentifier(suite?.name)) {
            throw new Error(`Invalid suite.name=${suite?.name}, expected valid identifier.`);
        }
        if (suite.steps && (!Array.isArray(suite.steps) || !suite.steps.every((step) => isValidIdentifier(step?.name)))) {
            throw new Error(`Invalid step names in suite ${suite.name}`);
        }
        // FIXME: Create SuiteRunner-local measuredValues.
        this.#suiteResults = measuredValues.steps[suite.name];
        if (!this.#suiteResults) {
            this.#suiteResults = { steps: {}, prepare: 0, total: 0 };
            measuredValues.steps[suite.name] = this.#suiteResults;
        }
        this.#frame = frame;
        this.#client = client;
        this.#suite = suite;
        this.#params = params;
    }

    get frame() {
        return this.#frame;
    }

    get params() {
        return this.#params;
    }

    get suite() {
        return this.#suite;
    }

    get client() {
        return this.#client;
    }

    get suiteResults() {
        return this.#suiteResults;
    }

    get stepRunnerType() {
        return this.#suite.type ? "async" : "default";
    }

    async run() {
        await this._prepareSuite();
        await this._runSuite();
    }

    /**
     * Called by the BenchmarkRunner once the suite is done, whether it succeeded
     * or failed, right before the frame is removed.
     */
    async teardown() {
        // Errors raised while the workload shuts down don't affect the results.
        this.#stopForwardingFrameErrors?.();
        this.#stopForwardingFrameErrors = null;
    }

    async _prepareSuite() {
        const suiteName = this.#suite.name;
        const suitePrepareStartLabel = `suite-${suiteName}-prepare-start`;
        const suitePrepareEndLabel = `suite-${suiteName}-prepare-end`;

        performance.mark(suitePrepareStartLabel);
        await this._loadFrame();
        await this.#suite.prepare();
        performance.mark(suitePrepareEndLabel);

        const entry = performance.measure(`suite-${suiteName}-prepare`, suitePrepareStartLabel, suitePrepareEndLabel);
        this.#prepareTime = entry.duration;
    }

    async _runSuite() {
        const suiteName = this.#suite.name;
        const suiteStartLabel = `suite-${suiteName}-start`;
        const suiteEndLabel = `suite-${suiteName}-end`;

        performance.mark(suiteStartLabel);
        for (const step of this.#suite.steps) {
            if (this.#client?.willRunTest) {
                await this.#client.willRunTest(this.#suite, step);
            }

            const stepRunnerType = this.stepRunnerType;
            const stepRunnerClass = STEP_RUNNER_LOOKUP[stepRunnerType];
            const stepRunner = new stepRunnerClass(this.#frame, null, this.#params, this.#suite, step, this._recordStepResults, stepRunnerType);
            await stepRunner.runStep();
        }
        performance.mark(suiteEndLabel);

        performance.measure(`suite-${suiteName}`, suiteStartLabel, suiteEndLabel);
        this._validateSuiteResults();
        await this._updateClient();
    }

    _validateSuiteResults() {
        // When the test is fast and the precision is low (for example with Firefox'
        // privacy.resistFingerprinting preference), it's possible that the measured
        // total duration for an entire is 0.
        const { total: suiteTotal, prepare: suitePrepare } = this.#suiteResults;
        if (!Number.isFinite(suiteTotal) || suiteTotal <= 0) {
            throw new Error(`Got invalid 0-time total for suite ${this.#suite.name}: ${suiteTotal}`);
        }
        if (this.#params.measurePrepare && (!Number.isFinite(suitePrepare) || suitePrepare <= 0)) {
            throw new Error(`Got invalid 0-time prepare time for suite ${this.#suite.name}: ${suitePrepare}`);
        }
    }

    async _loadFrame() {
        return new Promise((resolve, reject) => {
            const frame = this.#frame;
            frame.onload = () => {
                const contentWindow = frame.contentWindow;
                if (contentWindow) {
                    const forwardError = (e) => {
                        window.dispatchEvent(
                            new ErrorEvent("error", {
                                message: e.message,
                                filename: e.filename,
                                lineno: e.lineno,
                                colno: e.colno,
                                error: e.error,
                            })
                        );
                    };
                    const forwardRejection = (e) => {
                        window.dispatchEvent(
                            new PromiseRejectionEvent("unhandledrejection", {
                                promise: e.promise,
                                reason: e.reason,
                            })
                        );
                    };
                    contentWindow.addEventListener("error", forwardError);
                    contentWindow.addEventListener("unhandledrejection", forwardRejection);
                    this.#stopForwardingFrameErrors = () => {
                        contentWindow.removeEventListener("error", forwardError);
                        contentWindow.removeEventListener("unhandledrejection", forwardRejection);
                    };
                }
                resolve();
            };
            frame.onerror = () => reject();
            const targetUrl = `${this.#suite.url}?${this.#params.toSearchParams()}`;
            if (!isValidUrl(targetUrl)) {
                reject(new Error(`Invalid suite URL: ${targetUrl}`));
                return;
            }
            frame.src = targetUrl;
        });
    }

    _recordStepResults = async (step, syncTime, asyncTime) => {
        let total = syncTime + asyncTime;
        this.#suiteResults.steps[step.name] = {
            tests: { Sync: syncTime, Async: asyncTime },
            total: total,
        };
        this.#suiteResults.prepare = this.#prepareTime;
        this.#suiteResults.total = total;
    };

    async _updateClient(suite = this.#suite) {
        if (this.#client?.didFinishSuite) {
            await this.#client.didFinishSuite(suite);
        }
    }
}

// How long to wait for a workload to release its resources (see
// shared/workload-teardown.mjs) before removing its frame anyway.
const WORKLOAD_TEARDOWN_TIMEOUT_MS = 10000;

export class RemoteSuiteRunner extends SuiteRunner {
    #appId;
    #prepareTime;
    #messageHandler = null;
    #workloadSupportsTeardown = false;

    get appId() {
        return this.#appId;
    }

    set appId(id) {
        this.#appId = id;
    }

    async run() {
        this.postMessageCallbacks = new Map();
        this._startListening();
        // Workloads using shared/workload-teardown.mjs announce that they can
        // release their resources on request, see teardown().
        this._startSubscription("teardown-ready", () => {
            this.#workloadSupportsTeardown = true;
        });

        // FIXME: use this._suite in all SuiteRunner methods directly.
        try {
            await this._prepareSuite();
            await this._runSuite();
        } finally {
            this._stopListening();
        }
    }

    async teardown() {
        await super.teardown();
        // run() never returns if the workload reported an error, so its
        // listener and subscriptions might still be registered. Drop them, so a
        // late "suite-complete" can't resume the failed suite during teardown.
        this._stopListening();
        this.postMessageCallbacks?.clear();
        const contentWindow = this.frame?.contentWindow;
        if (!this.#workloadSupportsTeardown || !contentWindow) {
            return;
        }
        // Removing the frame isn't enough to reliably free the memory used by the
        // workload, so ask it to release its resources explicitly first.
        this._startListening();
        let timeoutId;
        try {
            const teardownComplete = this._subscribeOnce("teardown-complete").then(() => true);
            const timeout = new Promise((resolve) => {
                timeoutId = setTimeout(() => resolve(false), WORKLOAD_TEARDOWN_TIMEOUT_MS);
            });
            contentWindow.postMessage({ key: "benchmark-connector", type: "benchmark-teardown" }, window.location.origin);
            if (!(await Promise.race([teardownComplete, timeout]))) {
                console.warn(`Workload ${this.suite.name} did not finish its teardown within ${WORKLOAD_TEARDOWN_TIMEOUT_MS}ms.`);
            }
        } finally {
            clearTimeout(timeoutId);
            this._stopListening();
        }
    }

    _startListening() {
        if (!this.#messageHandler) {
            this.#messageHandler = this._handlePostMessage.bind(this);
            window.addEventListener("message", this.#messageHandler);
        }
    }

    _stopListening() {
        if (this.#messageHandler) {
            window.removeEventListener("message", this.#messageHandler);
            this.#messageHandler = null;
        }
    }

    async _prepareSuite() {
        const suiteName = this.suite.name;
        const suitePrepareStartLabel = `suite-${suiteName}-prepare-start`;
        const suitePrepareEndLabel = `suite-${suiteName}-prepare-end`;

        performance.mark(suitePrepareStartLabel);

        // Wait for the app-ready message from the workload.
        const appReadyPromise = this._subscribeOnce("app-ready");
        await this._loadFrame(this.suite);
        const response = await appReadyPromise;
        await this.suite.prepare?.();
        // Capture appId to pass along with messages.
        this.appId = response?.appId;

        performance.mark(suitePrepareEndLabel);

        const entry = performance.measure(`suite-${suiteName}-prepare`, suitePrepareStartLabel, suitePrepareEndLabel);
        this.#prepareTime = entry.duration;
    }

    async _runSuite() {
        // Ask workload to run its own tests.
        this.frame.contentWindow.postMessage({ id: this.appId, key: "benchmark-connector", type: "benchmark-suite", name: this.suite.config?.name || "default" }, "*");
        // Capture metrics from the completed tests.
        const response = await this._subscribeOnce("suite-complete");
        if (!Object.keys(response.result.steps).every(isValidIdentifier)) {
            throw new Error(`Invalid step names in suite ${this.suite.name}`);
        }

        this.suiteResults.steps = {
            ...this.suiteResults.steps,
            ...response.result.steps,
        };

        this.suiteResults.prepare = this.#prepareTime;
        this.suiteResults.total = response.result.total;

        this._validateSuiteResults();
        await this._updateClient();
    }

    _handlePostMessage(event) {
        // Ignore messages not originating from the active same-origin workload iframe
        // to prevent cross-window result spoofing.
        if (event.origin !== window.location.origin || !this.frame?.contentWindow || event.source !== this.frame.contentWindow) {
            return;
        }
        const callback = this.postMessageCallbacks.get(event.data?.type);
        if (callback) {
            callback(event);
        }
    }

    _startSubscription(type, callback) {
        if (this.postMessageCallbacks.has(type)) {
            throw new Error("Callback exists already");
        }

        this.postMessageCallbacks.set(type, callback);
    }

    _stopSubscription(type) {
        if (!this.postMessageCallbacks.has(type)) {
            throw new Error("Callback does not exist");
        }

        this.postMessageCallbacks.delete(type);
    }

    _subscribeOnce(type) {
        return new Promise((resolve) => {
            this._startSubscription(type, (e) => {
                this._stopSubscription(type);
                resolve(e.data);
            });
        });
    }
}

export const SUITE_RUNNER_LOOKUP = Object.freeze({
    __proto__: null,
    default: SuiteRunner,
    async: SuiteRunner,
    remote: RemoteSuiteRunner,
});
