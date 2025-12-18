import { STEP_INVOKER_LOOKUP } from "./step-invoker.mjs";

export class StepRunner {
    #frame;
    #page;
    #params;
    #suite;
    #step;
    #callback;
    #type;

    constructor(frame, page, params, suite, step, callback, type) {
        this.#suite = suite;
        this.#step = step;
        this.#params = params;
        this.#callback = callback;
        this.#page = page;
        this.#frame = frame;
        this.#type = type;
    }

    get page() {
        return this.#page;
    }

    get step() {
        return this.#step;
    }

    _runSyncStep(test, page) {
        test.run(page);
    }

    async runStep() {
        // Prepare all mark labels outside the measuring loop.
        const suiteName = this.#suite.name;
        const stepName = this.#step.name;
        const syncStartLabel = `${suiteName}.${stepName}-start`;
        const syncEndLabel = `${suiteName}.${stepName}-sync-end`;
        const asyncEndLabel = `${suiteName}.${stepName}-async-end`;

        let syncTime;
        let asyncStartTime;
        let asyncTime;

        const runSync = async () => {
            if (this.#params.warmupBeforeSync) {
                performance.mark("warmup-start");
                const startTime = performance.now();
                // Infinite loop for the specified ms.
                while (performance.now() - startTime < this.#params.warmupBeforeSync)
                    continue;
                performance.mark("warmup-end");
            }
            performance.mark(syncStartLabel);
            const syncStartTime = performance.now();

            if (this.#type === "async")
                await this._runSyncStep(this.step, this.page);
            else
                this._runSyncStep(this.step, this.page);

            const mark = performance.mark(syncEndLabel);
            const syncEndTime = mark.startTime;

            syncTime = syncEndTime - syncStartTime;
            asyncStartTime = syncEndTime;
        };
        const measureAsync = () => {
            // Some browsers don't immediately update the layout for paint.
            // Force the layout here to ensure we're measuring the layout time.
            // FIXME: This seems to be broken when building the TodoMVC workload from sources.
            // Compare the rebuilt dist/ output with the scripts in resources/shared/*.mjs.
            this.page?.layout();

            const asyncEndTime = performance.now();
            performance.mark(asyncEndLabel);

            asyncTime = asyncEndTime - asyncStartTime;

            if (this.#params.warmupBeforeSync)
                performance.measure("warmup", "warmup-start", "warmup-end");
            performance.measure(`${suiteName}.${stepName}-sync`, syncStartLabel, syncEndLabel);
            performance.measure(`${suiteName}.${stepName}-async`, syncEndLabel, asyncEndLabel);
        };

        const report = () => this.#callback(this.#step, syncTime, asyncTime);
        const invokerType = this.invokerType;
        const invokerClass = STEP_INVOKER_LOOKUP[invokerType];
        const invoker = new invokerClass(runSync, measureAsync, report, this.#params);

        return invoker.start();
    }

    get invokerType() {
        if (this.#suite.type === "async") return "async";
        if (this.#params.useAsyncSteps) return "async";
        return this.#params.measurementMethod
    }
}

export class AsyncStepRunner extends StepRunner {
    constructor(frame, page, params, suite, step, callback, type) {
        super(frame, page, params, suite, step, callback, type = "async");
    }

    async _runSyncStep(test, page) {
        await test.run(page);
    }
}

export class RemoteStepRunner extends StepRunner {
}


export const STEP_RUNNER_LOOKUP = Object.freeze({
    __proto__: null,
    default: StepRunner,
    async: AsyncStepRunner,
    remote: RemoteStepRunner,
});
