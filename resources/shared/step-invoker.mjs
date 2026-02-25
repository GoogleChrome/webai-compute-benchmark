class StepInvoker {
    constructor(syncCallback, asyncCallback, reportCallback, params) {
        this._syncCallback = syncCallback;
        this._asyncCallback = asyncCallback;
        this._reportCallback = reportCallback;
        this._params = params;
    }
}

class BaseRAFStepInvoker extends StepInvoker {
    start() {
        return new Promise((resolve) => {
            if (this._params.waitBeforeSync)
                setTimeout(() => this._scheduleCallbacks(resolve), this._params.waitBeforeSync);
            else
                this._scheduleCallbacks(resolve);
        });
    }
}

class RAFStepInvoker extends BaseRAFStepInvoker {
    _scheduleCallbacks(resolve) {
        requestAnimationFrame(() => this._syncCallback());
        requestAnimationFrame(() => {
            setTimeout(() => {
                this._asyncCallback();
                setTimeout(async () => {
                    const result = await this._reportCallback();
                    resolve(result);
                }, 0);
            }, 0);
        });
    }
}

class AsyncRAFStepInvoker extends BaseRAFStepInvoker {
    static mc = new MessageChannel();
    _scheduleCallbacks(resolve) {
        let gotTimer = false;
        let gotMessage = false;
        let gotPromise = false;

        const tryTriggerAsyncCallback = () => {
            if (!gotTimer || !gotMessage || !gotPromise)
                return;

            this._asyncCallback();
            setTimeout(async () => {
                const result = await this._reportCallback();
                resolve(result);
            }, 0);
        };

        requestAnimationFrame(async () => {
            await this._syncCallback();
            gotPromise = true;
            tryTriggerAsyncCallback();
        });

        requestAnimationFrame(() => {
            setTimeout(async () => {
                await Promise.resolve();
                gotTimer = true;
                tryTriggerAsyncCallback();
            });

            AsyncRAFStepInvoker.mc.port1.addEventListener(
                "message",
                async function () {
                    await Promise.resolve();
                    gotMessage = true;
                    tryTriggerAsyncCallback();
                },
                { once: true }
            );
            AsyncRAFStepInvoker.mc.port1.start();
            AsyncRAFStepInvoker.mc.port2.postMessage("trigger port1 message callback");
        });
    }
}

export const STEP_INVOKER_LOOKUP = Object.freeze({
    __proto__: null,
    raf: RAFStepInvoker,
    async: AsyncRAFStepInvoker,
});
