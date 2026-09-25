const fs = require("fs");
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = {
    cache: {
        type: 'filesystem',
    },
    target: ["web", "es2020"],
    entry: {
        'text2text-generation-cpu': './src/text2text-generation-cpu.mjs',
        'text2text-generation-gpu': './src/text2text-generation-gpu.mjs',
        'gemma': './src/gemma/benchmark.mjs',
        'litert-lm': './src/litert-lm/benchmark.mjs',
        'llama-cpp-wasm': './src/llama-cpp/wasm.mjs',
        'llama-cpp-webgpu': './src/llama-cpp/webgpu.mjs',
    },
    plugins: [
        new HtmlWebpackPlugin({
            title: "Experimental Runner",
            template: path.resolve(__dirname, "src", "index.html"),
            filename: 'text2text-generation-cpu.html',
            chunks: ['text2text-generation-cpu'],
        }),
        new HtmlWebpackPlugin({
            title: "Experimental Runner",
            template: path.resolve(__dirname, "src", "index.html"),
            filename: 'text2text-generation-gpu.html',
            chunks: ['text2text-generation-gpu'],
        }),
        new HtmlWebpackPlugin({
            title: "Experimental Gemma Runner",
            template: path.resolve(__dirname, "src", "console-runner.html"),
            filename: 'gemma.html',
            chunks: ['gemma'],
        }),
        new HtmlWebpackPlugin({
            title: "Experimental LiteRT-LM Runner",
            template: path.resolve(__dirname, "src", "console-runner.html"),
            filename: 'litert-lm.html',
            chunks: ['litert-lm'],
        }),
        new HtmlWebpackPlugin({
            title: "Experimental Llama.cpp Wasm Runner",
            template: path.resolve(__dirname, "src", "console-runner.html"),
            filename: 'llama-cpp-wasm.html',
            chunks: ['llama-cpp-wasm'],
        }),
        new HtmlWebpackPlugin({
            title: "Experimental Llama.cpp WebGPU Runner",
            template: path.resolve(__dirname, "src", "console-runner.html"),
            filename: 'llama-cpp-webgpu.html',
            chunks: ['llama-cpp-webgpu'],
        }),
        {
            apply(compiler) {
                compiler.hooks.afterEmit.tap("CopyWasmPlugin", () => {
                    fs.cpSync(
                        path.resolve(__dirname, "node_modules/@litert-lm/core/wasm"),
                        path.resolve(__dirname, "dist/resources/wasm"),
                        { recursive: true, force: true },
                    );
                    fs.cpSync(
                        path.resolve(__dirname, "node_modules/@wllama/wllama/esm/wasm/wllama.wasm"),
                        path.resolve(__dirname, "dist/resources/wasm/wllama.wasm"),
                        { force: true },
                    );
                });
            },
        },
    ],
    output: {
        filename: "[name].bundle.js",
        path: path.resolve(__dirname, "dist"),
        clean: true,
    },
    module: {
        rules: [
            {
                test: /\.(png|svg|jpg|jpeg|gif|wav)$/i,
                type: "asset/resource",
                //type: "asset/inline",
            },
        ],
    },
    optimization: {
        // Separate out the common code.
        splitChunks: {
            chunks: 'all',
        },
    },
};
