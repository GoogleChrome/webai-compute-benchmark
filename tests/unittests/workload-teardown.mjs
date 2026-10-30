// Copyright 2026 Google LLC
//
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file or at
// https://developers.google.com/open-source/licenses/bsd

// workload-teardown.mjs patches globals when it's imported, so it's loaded in
// an iframe that plays the role of a workload, with this page as the runner.
const TEARDOWN_MODULE_URL = new URL("../../resources/shared/workload-teardown.mjs", import.meta.url).href;

function nextMessageFrom(source, type) {
    return new Promise((resolve) => {
        const onMessage = (event) => {
            if (event.source === source && event.data?.type === type) {
                window.removeEventListener("message", onMessage);
                resolve(event.data);
            }
        };
        window.addEventListener("message", onMessage);
    });
}

describe("workload-teardown", () => {
    let frame = null;

    async function loadWorkload(script) {
        frame = document.createElement("iframe");
        frame.srcdoc = `<script type="module">import * as teardown from "${TEARDOWN_MODULE_URL}";\n${script}</script>`;
        document.body.appendChild(frame);
        const workload = frame.contentWindow;
        await nextMessageFrom(workload, "teardown-ready");
        return workload;
    }

    async function requestTeardown(workload) {
        const teardownComplete = nextMessageFrom(workload, "teardown-complete");
        workload.postMessage({ key: "benchmark-connector", type: "benchmark-teardown" }, window.location.origin);
        await teardownComplete;
    }

    afterEach(() => {
        frame?.remove();
        frame = null;
    });

    it("should run the registered teardown functions in reverse order", async () => {
        const workload = await loadWorkload(`
            window.calls = [];
            teardown.registerTeardown(() => window.calls.push("first"));
            teardown.registerTeardown(async () => window.calls.push("second"));
            teardown.registerTeardown(() => {
                throw new Error("Failing teardown functions don't prevent the others from running.");
            });
        `);

        await requestTeardown(workload);

        expect(Array.from(workload.calls)).to.eql(["second", "first"]);
    });

    it("should settle pending Atomics.waitAsync() calls and not register new ones", async function () {
        const workload = await loadWorkload(`
            if (window.crossOriginIsolated && typeof Atomics.waitAsync === "function") {
                window.heap = new Int32Array(new SharedArrayBuffer(16));
                window.pendingWait = Atomics.waitAsync(window.heap, 0, 0).value;
            }
        `);
        if (!workload.pendingWait) {
            this.skip();
        }

        await requestTeardown(workload);

        expect(await workload.pendingWait).to.be("ok");
        const { async, value } = workload.Atomics.waitAsync(workload.heap, 0, 0);
        expect(async).to.be(true);
        const settled = await Promise.race([value.then(() => true), new Promise((resolve) => setTimeout(() => resolve(false), 50))]);
        expect(settled).to.be(false);
    });

    it("should ignore teardown requests that don't come from the runner", async () => {
        const workload = await loadWorkload(`
            window.calls = [];
            teardown.registerTeardown(() => window.calls.push("teardown"));
            window.postMessage({ key: "benchmark-connector", type: "benchmark-teardown" }, "*");
        `);

        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(workload.calls.length).to.be(0);
    });
});
