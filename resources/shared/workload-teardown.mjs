// Copyright 2026 Google LLC
//
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file or at
// https://developers.google.com/open-source/licenses/bsd

/**
 * Workload teardown.
 *
 * Every workload runs in a same-origin iframe of the runner. The runner removes
 * the iframe once the suite is done, but that alone doesn't reliably free the
 * memory held by the workload's Wasm and WebGPU runtimes.
 *
 * Importing this module installs the tracking needed to release these
 * resources explicitly. It must be imported before any runtime is initialized,
 * i.e. by the workload entry point before calling into the ML libraries, and
 * never by the runner page itself. Workloads that don't keep a runtime alive
 * (no threads, WebGPU devices or loaded models, e.g. GGML and Tract) don't need
 * it: the runner only requests a teardown from workloads that announced support.
 *
 * Workloads register their own cleanup (releasing inference sessions, deleting
 * models, ...) with `registerTeardown()`. The runner sends a
 * "benchmark-teardown" message after the suite has finished (successfully or
 * not) and waits for "teardown-complete" before removing the iframe.
 */

const DISPOSER_TIMEOUT_MS = 5000;

const disposers = [];
const pendingAtomicsWaiters = new Set();
const webGpuDevices = new Set();
let isTornDown = false;
let teardownPromise = null;

/**
 * Registers a cleanup function that runs when the workload is torn down.
 * Cleanup functions run in reverse registration order and may be async. They
 * must cope with a partially initialized workload, since the teardown also runs
 * after a failed initialization.
 *
 * @param {() => (void | Promise<void>)} disposer
 */
export function registerTeardown(disposer) {
    if (typeof disposer !== "function") {
        throw new TypeError("registerTeardown expects a function.");
    }
    disposers.push(disposer);
}

/**
 * Releases all resources held by the workload. Safe to call more than once.
 * The workload can't run any more inferences afterwards.
 *
 * @returns {Promise<void>}
 */
export function teardownWorkload() {
    teardownPromise ??= runTeardown();
    return teardownPromise;
}

async function runTeardown() {
    // Workload-specific cleanup, while the runtimes are still functional.
    for (const disposer of disposers.splice(0).reverse()) {
        try {
            await withTimeout(Promise.resolve().then(disposer), DISPOSER_TIMEOUT_MS);
        } catch (error) {
            console.warn("Workload teardown step failed:", error);
        }
    }
    // Free GPU memory now instead of whenever the device is garbage-collected.
    for (const device of webGpuDevices) {
        try {
            device.destroy();
        } catch (error) {
            console.warn("Failed to destroy WebGPU device:", error);
        }
    }
    webGpuDevices.clear();
    // Settle pending Atomics.waitAsync() waiters and don't create new ones,
    // so the engine holds no references to this realm anymore.
    isTornDown = true;
    for (const { typedArray, index } of pendingAtomicsWaiters) {
        try {
            Atomics.notify(typedArray, index);
        } catch (error) {
            console.warn("Failed to notify pending Atomics.waitAsync() waiter:", error);
        }
    }
    pendingAtomicsWaiters.clear();
}

function withTimeout(promise, timeoutMs) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function trackAtomicsWaitAsync() {
    const originalWaitAsync = globalThis.Atomics?.waitAsync;
    if (typeof originalWaitAsync !== "function") {
        return;
    }
    Atomics.waitAsync = function waitAsync(...args) {
        if (isTornDown) {
            // The runtime is shutting down: hand out a promise that never
            // settles. Unlike a real waiter, it isn't registered with the
            // engine, so it doesn't keep this realm alive.
            return { async: true, value: new Promise(() => {}) };
        }
        const result = Reflect.apply(originalWaitAsync, Atomics, args);
        if (result.async) {
            const [typedArray, index] = args;
            const waiter = { typedArray, index };
            pendingAtomicsWaiters.add(waiter);
            const forgetWaiter = () => pendingAtomicsWaiters.delete(waiter);
            result.value.then(forgetWaiter, forgetWaiter);
        }
        return result;
    };
}

function trackWebGpuDevices() {
    const adapterPrototype = globalThis.GPUAdapter?.prototype;
    const originalRequestDevice = adapterPrototype?.requestDevice;
    if (typeof originalRequestDevice !== "function") {
        return;
    }
    adapterPrototype.requestDevice = async function requestDevice(...args) {
        const device = await Reflect.apply(originalRequestDevice, this, args);
        if (isTornDown) {
            device.destroy();
        } else {
            webGpuDevices.add(device);
        }
        return device;
    };
}

function isTeardownRequest(event) {
    // Only the runner, i.e. the same-origin parent window, may request a teardown.
    return event.source === window.parent && event.origin === window.origin && event.data?.key === "benchmark-connector" && event.data?.type === "benchmark-teardown";
}

function listenForTeardownRequests() {
    const runner = window.parent;
    if (runner === window) {
        // Running standalone, outside of the benchmark runner.
        return;
    }
    window.addEventListener("message", (event) => {
        if (!isTeardownRequest(event)) {
            return;
        }
        teardownWorkload().finally(() => {
            runner.postMessage({ type: "teardown-complete", status: "success" }, window.origin);
        });
    });
    // Let the runner know that it can request a teardown before removing the iframe.
    runner.postMessage({ type: "teardown-ready", status: "success" }, window.origin);
}

if (typeof window !== "undefined") {
    trackAtomicsWaitAsync();
    trackWebGpuDevices();
    listenForTeardownRequests();
}
