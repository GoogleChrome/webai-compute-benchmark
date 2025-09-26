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
        url: "resources/feature-extraction-cpu/dist/index.html",
        tags: ["default", "feature-extraction"],
        async prepare() {},
        type: "remote",
    },
    {
        name: "Feature Extraction on gpu",
        url: "resources/feature-extraction-gpu/dist/index.html",
        tags: ["default", "feature-extraction"],
        async prepare() {},
        type: "remote",
    }
];
