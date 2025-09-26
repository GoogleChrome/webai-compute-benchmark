import { BenchmarkStep, AsyncBenchmarkStep, AsyncBenchmarkSuite } from "/node_modules/speedometer-utils/benchmark.mjs";
import { getAllElements, getElement, forceLayout } from "/node_modules/speedometer-utils/helpers.mjs";
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

export const appName = "Feature extraction on cpu";
export const appVersion = "1.0.0";


async function runFeatureExtraction() {
    const SENTENCE_1 = `San Francisco has a unique Mediterranean climate characterized by mild,
                        wet winters and dry, cool summers. The city is famous for its persistent
                        fog which keeps temperatures comfortable and often cool near the coast.`
    const output = document.getElementById('embeddingOutput');

    document.getElementById('sentenceText').textContent = `"${SENTENCE_1}"`;

    const model = await pipeline('feature-extraction', "Xenova/UAE-Large-V1", { device: "cpu" },);

    const result = await model(SENTENCE_1, { pooling: 'mean', normalize: true });
    const embedding = Array.from(result.data);

    output.textContent = JSON.stringify(embedding.slice(0, 5) + '...', null, 2);

}

const suites = {
    default: new AsyncBenchmarkSuite("default", [
        new AsyncBenchmarkStep("Extract features in example text", async () => {
            forceLayout();
            await runFeatureExtraction();
            forceLayout();   
        }),
    ], true),
};

export default suites;
