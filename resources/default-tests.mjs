import { BenchmarkTestStep } from "./benchmark-runner.mjs";

export const defaultSuites = [
    // {
    //     name: "TodoMVC-WebComponents-PostMessage",
    //     url: "resources/todomvc/vanilla-examples/javascript-web-components/dist/index.html",
    //     tags: ["default", "todomvc", "webcomponents"],
    //     async prepare() {},
    //     type: "remote",
    //     /* config: {
    //         name: "default", // optional param to target non-default tests locally
    //     }, */
    // },
    {
        name: "Empty-PostMessage",
        url: "resources/empty/dist/index.html",
        tags: ["default", "empty"],
        async prepare() {},
        type: "remote",
    },
    {
        name: "Feature Extraction on cpu",
        url: "resources/transformers-js/dist/feature-extraction-cpu.html",
        tags: ["default", "feature-extraction"],
        async prepare() {},
        type: "remote",
    },
    {
        name: "Feature Extraction on gpu",
        url: "resources/transformers-js/dist/feature-extraction-gpu.html",
        tags: ["default", "feature-extraction"],
        async prepare() {},
        type: "remote",
    },
    {
        name: "Sentence Similarity on cpu",
        url: "resources/transformers-js/dist/sentence-similarity-cpu.html",
        tags: ["default", "sentence-similarity"],
        async prepare() {},
        type: "remote",
    },
    {
        name: "Sentence Similarity on gpu",
        url: "resources/transformers-js/dist/sentence-similarity-gpu.html",
        tags: ["default", "sentence-similarity"],
        async prepare() {},
        type: "remote",
    },
    {
        name: "Speech Recognition on cpu",
        url: "resources/transformers-js/dist/speech-recognition-cpu.html",
        tags: ["default", "speech-recognition"],
        async prepare() {},
        type: "remote",
    },
    {
        name: "Speech Recognition on gpu",
        url: "resources/transformers-js/dist/speech-recognition-gpu.html",
        tags: ["default", "speech-recognition"],
        async prepare() {},
        type: "remote",
    },
        {
        name: "Background Removal on cpu",
        url: "resources/transformers-js/dist/background-removal-cpu.html",
        tags: ["default", "background-removal"],
        async prepare() {},
        type: "remote",
    },
    {
        name: "Background Removal on gpu",
        url: "resources/transformers-js/dist/background-removal-gpu.html",
        tags: ["default", "background-removal"],
        async prepare() {},
        type: "remote",
    }
];
