/**
 * Experimental LiteRT-LM benchmark using WebGPU and the Gemma model.
 */

import { Engine, loadLiteRtLm } from "@litert-lm/core";
import { BenchmarkConnector } from "speedometer-utils/benchmark.mjs";
import { createSubIteratedSuite } from "speedometer-utils/helpers.mjs";
import { params } from "speedometer-utils/params.mjs";

const weightsPath = "../models/litert-lm/gemma-4-E2B-it-web.litertlm";
const wasmPath = "resources/wasm/";

const ONE_MB = 1024 * 1024;
const TEN_MB = 10 * ONE_MB;

async function fetchModelWithProgress(url) {
  console.log(`Fetching model from ${url}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch model from ${url}: ${response.status} ${response.statusText}`,
    );
  }
  if (!response.body) {
    throw new Error(`Response body is empty for ${url}`);
  }

  const contentLength = response.headers.get("content-length");
  const total = contentLength ? parseInt(contentLength, 10) : null;
  let loaded = 0;
  let lastLogged = -1;

  const progressStream = new TransformStream({
    transform(chunk, controller) {
      loaded += chunk.byteLength;
      if (total) {
        const percent = Math.floor((loaded / total) * 100);
        if (percent !== lastLogged) {
          console.log(`Downloading model: ${percent}%`);
          lastLogged = percent;
        }
      } else {
        const currentMb = Math.floor(loaded / TEN_MB);
        if (currentMb !== lastLogged) {
          console.log(`Downloading model: ${Math.floor(loaded / ONE_MB)} MB`);
          lastLogged = currentMb;
        }
      }
      controller.enqueue(chunk);
    },
  });

  return response.body.pipeThrough(progressStream);
}

class LiteRtLmBenchmark {
  constructor() {
    this.engine = null;
  }

  async init() {
    console.log("Loading LiteRT-LM wasm module...");
    await loadLiteRtLm(wasmPath);
    console.log("Downloading model and initializing LiteRT-LM engine...");
    const modelStream = await fetchModelWithProgress(weightsPath);
    this.engine = await Engine.create({
      model: modelStream,
    });
    console.log("LiteRT-LM engine initialized.");
  }

  async run() {
    const sentence = "Max 100 word response. Why is the sky blue?";
    console.log("Generating...");
    const conversation = await this.engine.createConversation();
    try {
      const result = await conversation.sendMessage(sentence);
      console.log(result?.content?.[0]?.text ?? result);
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

  const benchmarkConnector = new BenchmarkConnector(suites, appName, appVersion);
  benchmarkConnector.connect();
} catch (error) {
  console.error("Failed to initialize LiteRT-LM benchmark:", error);
  throw error;
}
