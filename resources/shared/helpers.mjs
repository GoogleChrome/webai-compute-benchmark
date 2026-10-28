/**
 * Helper Methods
 *
 * Various methods that are extracted from the Page class.
 */
export function getParent(lookupStartNode, path) {
    lookupStartNode = lookupStartNode.shadowRoot ?? lookupStartNode;
    const parent = path.reduce((root, selector) => {
        const node = root.querySelector(selector);
        return node.shadowRoot ?? node;
    }, lookupStartNode);

    return parent;
}

export function getElement(selector, path = [], lookupStartNode = document) {
    const element = getParent(lookupStartNode, path).querySelector(selector);
    return element;
}

export function getAllElements(selector, path = [], lookupStartNode = document) {
    const elements = Array.from(getParent(lookupStartNode, path).querySelectorAll(selector));
    return elements;
}

export function forceLayout(body, layoutMode = "getBoundingRectAndElementFromPoint") {
    body ??= document.body;
    const rect = body.getBoundingClientRect();
    switch (layoutMode) {
        case "getBoundingRectAndElementFromPoint":
            return document.elementFromPoint((rect.width / 2) | 0, (rect.height / 2) | 0);
        case "getBoundingClientRect":
            return rect.height;
        default:
            throw Error(`Invalid layoutMode: ${layoutMode}`);
    }
}

import { AsyncBenchmarkStep, AsyncBenchmarkSuite } from "./benchmark.mjs";

export function createSubIteratedSuite(benchmark, subIterationCount) {
    const steps = [];
    for (let i = 0; i < subIterationCount; i++) {
        steps.push(
            new AsyncBenchmarkStep(
                `sub-iter-${i + 1}`,
                async () => {
                    forceLayout();
                    await benchmark.run();
                    forceLayout();
                },
                { measureAsync: false }
            )
        );
    }
    return new AsyncBenchmarkSuite("default", steps);
}

/**
 * Creates `subIterationCount` async benchmark steps (`sub-iter-1` .. `sub-iter-N`)
 * that return the `{ tests, total }` result produced by `runFn()` instead of the
 * outer JS step duration, for workloads that report internal Wasm timings.
 */
export function createSubIteratedSteps(runFn, subIterationCount) {
    return Array.from({ length: subIterationCount }, (_, i) => {
        let parsedResult = null;
        const step = new AsyncBenchmarkStep(
            `sub-iter-${i + 1}`,
            async () => {
                forceLayout();
                parsedResult = await runFn();
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
}

/**
 * Emscripten `instantiateWasm` callback factory that instantiates an already-compiled
 * `WebAssembly.Module`, avoiding repeated compilation inside measured runs.
 */
export function instantiatePrecompiled(wasmModule, onError) {
    return (imports, successCallback) => {
        WebAssembly.instantiate(wasmModule, imports).then((instance) => {
            successCallback(instance, wasmModule);
        }, onError);
        return {};
    };
}

export async function getVisualOutputCanvas(width, height) {
    const output = document.getElementById("output");
    output.classList.add("visual-output");
    let finalCanvas = output.querySelector("canvas");

    if (!finalCanvas) {
        finalCanvas = document.createElement("canvas");
        output.innerHTML = "";
        output.appendChild(finalCanvas);
    }

    finalCanvas.width = width;
    finalCanvas.height = height;

    const ctx = finalCanvas.getContext("2d", { willReadFrequently: true });
    return { ctx, canvas: finalCanvas };
}

// Restrict suite, step, tag, and metric names to safe characters and non-prototype
// keys to prevent CSV formula/delimiter injection, innerHTML XSS, and prototype pollution.
const VALID_IDENTIFIER = /^[a-zA-Z0-9][\w .-]*$/;

export function isValidIdentifier(name) {
    return typeof name === "string" && !(name in Object.prototype) && VALID_IDENTIFIER.test(name);
}
