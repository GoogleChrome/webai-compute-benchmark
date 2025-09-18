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
        name: "Feature Extraction",
        url: "resources/feature-extraction/dist/index.html",
        tags: ["default", "feature-extraction"],
        async prepare() {},
        type: "remote",
    }
];
