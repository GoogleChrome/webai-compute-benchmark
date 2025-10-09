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
        url: "resources/transformers-js/dist/index.html",
        extraParams: { type: 'feature-extraction-cpu' },
        tags: ["default", "feature-extraction"],
        async prepare() {},
        type: "remote",
    },
    {
        name: "Feature Extraction on gpu",
        url: "resources/transformers-js/dist/index.html",
        extraParams: { type: 'feature-extraction-gpu' },
        tags: ["default", "feature-extraction"],
        async prepare() {},
        type: "remote",
    },
    {
        name: "Sentence Similarity on cpu",
        url: "resources/transformers-js/dist/index.html",
        extraParams: { type: 'sentence-similarity-cpu' },
        tags: ["default", "sentence-similarity"],
        async prepare() {},
        type: "remote",
    },
    {
        name: "Sentence Similarity on gpu",
        url: "resources/transformers-js/dist/index.html",
        extraParams: { type: 'sentence-similarity-gpu' },
        tags: ["default", "sentence-similarity"],
        async prepare() {},
        type: "remote",
    }
];
