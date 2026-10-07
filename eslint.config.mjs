// Copyright 2026 Google LLC
//
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file or at
// https://developers.google.com/open-source/licenses/bsd

import js from "@eslint/js";
import globals from "globals";

export default [
    {
        ignores: ["**/node_modules/**", "**/dist/**", "**/models/**", "**/.angular/**", "resources/build-info.mjs", "resources/experimental/src/gemma/build/**", "sandbox/**", "script/model-analyzer/**"],
    },
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.worker,
                ...globals.mocha,
                // Unit test specific
                sinon: "readonly",
                expect: "readonly",
                // Injected dependencies
                testRunner: "readonly",
                startBenchmark: "readonly",
                PerfTestRunner: "readonly",
                deltas: "readonly",
            },
        },
        rules: {
            "consistent-return": "error",
            curly: ["error", "all"],
            eqeqeq: "error",
            "no-constant-condition": "off",
            "no-extra-bind": "error",
            "no-redeclare": "off",
            "no-return-assign": "error",
            "no-self-compare": "error",
            "no-unused-expressions": "error",
            "no-unused-vars": ["error", { vars: "all", args: "none", caughtErrors: "none" }],
            "prefer-template": "error",
        },
    },
];
