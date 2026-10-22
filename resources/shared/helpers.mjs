export function forceLayout(body) {
    body ??= document.body;
    const rect = body.getBoundingClientRect();
    return document.elementFromPoint((rect.width / 2) | 0, (rect.height / 2) | 0);
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

export const WEBGPU_UNAVAILABLE_ERROR_MESSAGE = "WebGPU is not available or enabled in this browser.";

export async function ensureWebGPU() {
    let device = null;
    if (globalThis.navigator?.gpu) {
        try {
            const adapter = await navigator.gpu.requestAdapter();
            device = await adapter?.requestDevice();
            device?.destroy();
        } catch {
            device = null;
        }
    }
    if (!device) {
        throw new Error(WEBGPU_UNAVAILABLE_ERROR_MESSAGE);
    }
}
