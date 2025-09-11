import { BenchmarkTestStep } from "./benchmark-runner.mjs";
import { getTodoText, defaultLanguage } from "./shared/translations.mjs";
import { numberOfItemsToAdd } from "./shared/todomvc-utils.mjs";

export const defaultSuites = [
    {
        name: "TodoMVC-WebComponents-PostMessage",
        url: "resources/todomvc/vanilla-examples/javascript-web-components/dist/index.html",
        tags: ["default", "todomvc", "webcomponents"],
        async prepare() {},
        type: "remote",
        /* config: {
            name: "default", // optional param to target non-default tests locally
        }, */
    },
];
