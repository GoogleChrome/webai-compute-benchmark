// Copyright 2026 Google LLC
//
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file or at
// https://developers.google.com/open-source/licenses/bsd

/**
 * Experimental LiteRT-LM benchmark using WebGPU and the Gemma model.
 */

import { Engine, loadLiteRtLm, SamplerType } from "@litert-lm/core";
import { BenchmarkConnector } from "speedometer-utils/benchmark.mjs";
import { fetchModelWithProgress } from "speedometer-utils/download-utils.mjs";
import { createSubIteratedSuite } from "speedometer-utils/helpers.mjs";
import { params } from "speedometer-utils/params.mjs";
import {
  LLM_BENCHMARK_PROMPT,
  LLM_MAX_OUTPUT_TOKENS,
} from "../llm-benchmark-config.mjs";

const weightsPath = "../models/litert-lm/gemma3-270m-it-q4_0-web.litertlm";
const wasmPath = "resources/wasm/";

class LiteRtLmBenchmark {
  constructor() {
    this.engine = null;
  }

  async init() {
    console.log(
      "Loading LiteRT-LM wasm module (not part of benchmark measurement)...",
    );
    await loadLiteRtLm(wasmPath);
    console.log(
      "Downloading model and initializing LiteRT-LM engine (not part of benchmark measurement)...",
    );
    const modelStream = await fetchModelWithProgress(weightsPath);
    this.engine = await Engine.create({
      model: modelStream,
      benchmarkEnabled: true,
    });
    console.log(
      "LiteRT-LM engine initialized. Model download and initialization are complete; starting measured benchmark runs...",
    );
  }

  async run() {
    console.log("Generating...");
    const conversation = await this.engine.createConversation({
      sessionConfig: {
        maxOutputTokens: LLM_MAX_OUTPUT_TOKENS,
        stopTokenIds: [],
        samplerParams: {
          type: SamplerType.GREEDY,
          temperature: 0,
          k: 1,
          seed: 42,
        },
      },
    });
    try {
      const result = await conversation.sendMessage(LLM_BENCHMARK_PROMPT);
      console.log(result?.content?.[0]?.text ?? result);
      const benchmarkInfo = await conversation.getBenchmarkInfo();
      console.log("Benchmark info:", {
        timeToFirstTokenInSecond: benchmarkInfo.timeToFirstTokenInSecond,
        lastPrefillTokensPerSecond: benchmarkInfo.lastPrefillTokensPerSecond,
        lastDecodeTokensPerSecond: benchmarkInfo.lastDecodeTokensPerSecond,
        lastDecodeTokenCount: benchmarkInfo.lastDecodeTokenCount,
      });
    } finally {
      await conversation.delete();
    }
  }
}

const appName = "LiteRT-LM";
const appVersion = "0.1.0";

try {
  const benchmark = new LiteRtLmBenchmark();
  await benchmark.init();

  /*--------- Running test suites ---------*/
  const suites = {
    default: createSubIteratedSuite(benchmark, params.subIterationCount),
  };

  const benchmarkConnector = new BenchmarkConnector(
    suites,
    appName,
    appVersion,
  );
  benchmarkConnector.connect();
} catch (error) {
  console.error("Failed to initialize LiteRT-LM benchmark:", error);
  throw error;
}
