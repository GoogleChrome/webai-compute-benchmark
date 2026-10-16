const fs = require("fs");
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = {
    cache: {
        type: "filesystem",
    },
    target: ["web", "es2020"],
    entry: {
        "text2text-generation-cpu": "./src/text2text-generation-cpu.mjs",
        "text2text-generation-gpu": "./src/text2text-generation-gpu.mjs",
        gemma: "./src/gemma/benchmark.mjs",
        "litert-lm": "./src/litert-lm/benchmark.mjs",
        eigen: "./src/eigen/benchmark.mjs",
        ggml: "./src/ggml/benchmark.mjs",
        "tract-onnx-mobilenet-v2": "./src/tract/onnx-mobilenet-v2.mjs",
        "tract-pytorch-resnet": "./src/tract/pytorch-resnet.mjs",
        "tract-tflite-mobilenet-v3": "./src/tract/tflite-mobilenet-v3.mjs",
        "llama-cpp-wasm": "./src/llama-cpp/wasm.mjs",
        "llama-cpp-webgpu": "./src/llama-cpp/webgpu.mjs",
    },
    plugins: [
        new HtmlWebpackPlugin({
            title: "Experimental Runner",
            template: path.resolve(__dirname, "src", "index.html"),
            filename: "text2text-generation-cpu.html",
            chunks: ["text2text-generation-cpu"],
        }),
        new HtmlWebpackPlugin({
            title: "Experimental Runner",
            template: path.resolve(__dirname, "src", "index.html"),
            filename: "text2text-generation-gpu.html",
            chunks: ["text2text-generation-gpu"],
        }),
        new HtmlWebpackPlugin({
            title: "Experimental Gemma Runner",
            template: path.resolve(__dirname, "src", "console-runner.html"),
            filename: "gemma.html",
            chunks: ["gemma"],
        }),
        new HtmlWebpackPlugin({
            title: "Experimental LiteRT-LM Runner",
            template: path.resolve(__dirname, "src", "console-runner.html"),
            filename: "litert-lm.html",
            chunks: ["litert-lm"],
        }),
        new HtmlWebpackPlugin({
            title: "Experimental GGML Runner",
            template: path.resolve(__dirname, "src", "console-runner.html"),
            filename: "ggml.html",
            chunks: ["ggml"],
        }),
        new HtmlWebpackPlugin({
            title: "Experimental Tract ONNX MobileNetV2 Runner",
            template: path.resolve(__dirname, "src", "console-runner.html"),
            filename: "tract-onnx-mobilenet-v2.html",
            chunks: ["tract-onnx-mobilenet-v2"],
        }),
        new HtmlWebpackPlugin({
            title: "Experimental Tract PyTorch ResNet Runner",
            template: path.resolve(__dirname, "src", "console-runner.html"),
            filename: "tract-pytorch-resnet.html",
            chunks: ["tract-pytorch-resnet"],
        }),
        new HtmlWebpackPlugin({
            title: "Experimental Tract TFLite MobileNetV3 Runner",
            template: path.resolve(__dirname, "src", "console-runner.html"),
            filename: "tract-tflite-mobilenet-v3.html",
            chunks: ["tract-tflite-mobilenet-v3"],
        }),
        new HtmlWebpackPlugin({
            title: "Experimental Llama.cpp Wasm Runner",
            template: path.resolve(__dirname, "src", "console-runner.html"),
            filename: "llama-cpp-wasm.html",
            chunks: ["llama-cpp-wasm"],
        }),
        new HtmlWebpackPlugin({
            title: "Experimental Llama.cpp WebGPU Runner",
            template: path.resolve(__dirname, "src", "console-runner.html"),
            filename: "llama-cpp-webgpu.html",
            chunks: ["llama-cpp-webgpu"],
        }),
        new HtmlWebpackPlugin({
            title: "Experimental Eigen Runner",
            template: path.resolve(__dirname, "src", "console-runner.html"),
            filename: "eigen.html",
            chunks: ["eigen"],
        }),
        {
            apply(compiler) {
                compiler.hooks.afterEmit.tap("CopyWasmPlugin", () => {
                    fs.cpSync(path.resolve(__dirname, "node_modules/@litert-lm/core/wasm"), path.resolve(__dirname, "dist/resources/wasm"), { recursive: true, force: true });
                    fs.cpSync(path.resolve(__dirname, "node_modules/@wllama/wllama/esm/wasm/wllama.wasm"), path.resolve(__dirname, "dist/resources/wasm/wllama.wasm"), { force: true });
                });
            },
        },
    ],
    output: {
        filename: "[name].bundle.js",
        path: path.resolve(__dirname, "dist"),
        clean: {
            keep: /^eigen\//,
        },
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
            chunks: "all",
        },
    },
};
