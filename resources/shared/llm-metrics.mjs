// Copyright 2026 Google LLC
//
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file or at
// https://developers.google.com/open-source/licenses/bsd

import { createSubIteratedSuite } from "./helpers.mjs";

const LLM_METRICS = [
    { key: "ttftMs", name: "TTFT", unit: "ms" },
    { key: "prefillTokensPerSec", name: "Prefill-TPS", unit: "tps" },
    { key: "decodeTokensPerSec", name: "Decode-TPS", unit: "tps" },
];

function isPositiveFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function validateLlmMetrics(metrics) {
    if (!metrics || typeof metrics !== "object") {
        throw new Error(`Expected LLM metrics object, got ${metrics}.`);
    }
    const validated = {};
    for (const { key, name } of LLM_METRICS) {
        if (!isPositiveFiniteNumber(metrics[key])) {
            throw new Error(`Invalid ${name} (${key}=${metrics[key]}).`);
        }
        validated[key] = metrics[key];
    }
    return validated;
}

/**
 * Wraps `benchmark.run()` (which must resolve `{ ttftMs, prefillTokensPerSec,
 * decodeTokensPerSec }`) in a sub-iterated suite whose `total` stays the sum of
 * outer wall-clock durations (`ms`) for `Wasm-Score` / `WebGPU-Score`, while
 * exposing `TTFT` (`ms`) and `Prefill-TPS` / `Decode-TPS` (`tps`) as child
 * metrics aggregated across sub-iterations via geometric mean.
 */
export function createLlmSubIteratedSuite(benchmark, subIterationCount, name = "default") {
    const subIterMetrics = [];
    const suite = createSubIteratedSuite(
        {
            async run() {
                subIterMetrics.push(await benchmark.run());
            },
        },
        subIterationCount,
        name
    );

    return {
        name: suite.name,
        async runAndRecord(stepParams) {
            subIterMetrics.length = 0;
            const response = await suite.runAndRecord(stepParams);
            const validated = subIterMetrics.map((raw) => {
                const m = validateLlmMetrics(raw);
                console.log(`LLM metrics: TTFT=${m.ttftMs.toFixed(2)}ms, Prefill-TPS=${m.prefillTokensPerSec.toFixed(2)} tps, Decode-TPS=${m.decodeTokensPerSec.toFixed(2)} tps`);
                return m;
            });
            const subIterNames = Object.keys(response.result.steps);
            const transposedSteps = {};
            for (const def of LLM_METRICS) {
                const childSteps = {};
                let logSum = 0;
                for (let i = 0; i < subIterNames.length; i++) {
                    const value = validated[i][def.key];
                    childSteps[subIterNames[i]] = { unit: def.unit, tests: {}, total: value };
                    logSum += Math.log(value);
                }
                // Use the geometric mean across sub-iterations so cold first-run and
                // warm steady-state runs are weighted proportionally (1/N per
                // sub-iteration, e.g. 20% cold / 80% warm at subIterationCount=5)
                // without a slow cold duration dominating harmonic mean or fast warm
                // rates swamping arithmetic mean, and so ms and tps use the same formula.
                transposedSteps[def.name] = {
                    unit: def.unit,
                    steps: childSteps,
                    total: Math.exp(logSum / subIterNames.length),
                };
            }
            response.result.steps = transposedSteps;
            return response;
        },
    };
}
