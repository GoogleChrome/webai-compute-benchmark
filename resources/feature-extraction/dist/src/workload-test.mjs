import { BenchmarkStep, BenchmarkSuite } from "./speedometer-utils/benchmark.mjs";
import { getAllElements, getElement } from "./speedometer-utils/helpers.mjs";
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

export const appName = "Feature extraction";
export const appVersion = "1.0.0";


async function runFeatureExtraction() {
    SENTENCE_1 = "Today is sunny."
    const output = document.getElement('embeddingOutput');

    document.getElement('sentenceText').textContent = `"${SENTENCE_1}"`;

    const model = await pipeline('feature-extraction', "Xenova/UAE-Large-V1");

    const result = await model(SENTENCE_1, { pooling: 'mean', normalize: true });
    const embedding = Array.from(result.data);

    output.textContent = JSON.stringify(embedding.slice(0, 5) + '...', null, 2);

}

const suites = {
    default: new BenchmarkSuite("default", [
        new BenchmarkStep("Extract features in example text", () => {
            document.addEventListener('DOMContentLoaded', runFeatureExtraction);
        }),
    ]),
};

export default suites;
