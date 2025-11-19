const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = {
    target: ["web", "es2020"],
    entry: {
        'feature-extraction-cpu': './src/feature-extraction-cpu.mjs',
        'feature-extraction-gpu': './src/feature-extraction-gpu.mjs',
        'sentence-similarity-cpu': './src/sentence-similarity-cpu.mjs',
        'sentence-similarity-gpu': './src/sentence-similarity-gpu.mjs',
        'speech-recognition-cpu': './src/speech-recognition-cpu.mjs',
        'speech-recognition-gpu': './src/speech-recognition-gpu.mjs',
        'background-removal-cpu': './src/background-removal-cpu.mjs',
        'background-removal-gpu': './src/background-removal-gpu.mjs',
        'text-reranking-cpu': './src/text-reranking-cpu.mjs',
        'text-reranking-gpu': './src/text-reranking-gpu.mjs',
        'image-classification-cpu': './src/image-classification-cpu.mjs',
        'image-classification-gpu': './src/image-classification-gpu.mjs',
        'zero-shot-image-classification-cpu': './src/zero-shot-image-classification-cpu.mjs',
        'zero-shot-image-classification-gpu': './src/zero-shot-image-classification-gpu.mjs',
        'text-to-speech-cpu': './src/text-to-speech-cpu.mjs',
        'text-to-speech-gpu': './src/text-to-speech-gpu.mjs',
    },
    plugins: [
        new HtmlWebpackPlugin({
            title: "Transfomers.js Runner",
            template: path.resolve(__dirname, "src", "index.html"),
            filename: 'feature-extraction-cpu.html',
            chunks: ['feature-extraction-cpu'],
        }),
        new HtmlWebpackPlugin({
            title: "Transfomers.js Runner",
            template: path.resolve(__dirname, "src", "index.html"),
            filename: 'feature-extraction-gpu.html',
            chunks: ['feature-extraction-gpu'],
        }),
        new HtmlWebpackPlugin({
            title: "Transfomers.js Runner",
            template: path.resolve(__dirname, "src", "index.html"),
            filename: 'sentence-similarity-cpu.html',
            chunks: ['sentence-similarity-cpu'],
        }),
        new HtmlWebpackPlugin({
            title: "Transfomers.js Runner",
            template: path.resolve(__dirname, "src", "index.html"),
            filename: 'sentence-similarity-gpu.html',
            chunks: ['sentence-similarity-gpu'],
        }),
        new HtmlWebpackPlugin({
            title: "Transfomers.js Runner",
            template: path.resolve(__dirname, "src", "index.html"),
            filename: 'speech-recognition-cpu.html',
            chunks: ['speech-recognition-cpu'],
        }),
        new HtmlWebpackPlugin({
            title: "Transfomers.js Runner",
            template: path.resolve(__dirname, "src", "index.html"),
            filename: 'speech-recognition-gpu.html',
            chunks: ['speech-recognition-gpu'],
        }),
        new HtmlWebpackPlugin({
            title: "Transfomers.js Runner",
            template: path.resolve(__dirname, "src", "index.html"),
            filename: 'background-removal-cpu.html',
            chunks: ['background-removal-cpu'],
        }),
        new HtmlWebpackPlugin({
            title: "Transfomers.js Runner",
            template: path.resolve(__dirname, "src", "index.html"),
            filename: 'background-removal-gpu.html',
            chunks: ['background-removal-gpu'],
        }),
        new HtmlWebpackPlugin({
            title: "Transfomers.js Runner",
            template: path.resolve(__dirname, "src", "index.html"),
            filename: 'text-reranking-cpu.html',
            chunks: ['text-reranking-cpu'],
        }),
        new HtmlWebpackPlugin({
            title: "Transfomers.js Runner",
            template: path.resolve(__dirname, "src", "index.html"),
            filename: 'text-reranking-gpu.html',
            chunks: ['text-reranking-gpu'],
        }),
        new HtmlWebpackPlugin({
            title: "Transfomers.js Runner",
            template: path.resolve(__dirname, "src", "index.html"),
            filename: 'image-classification-cpu.html',
            chunks: ['image-classification-cpu'],
        }),
        new HtmlWebpackPlugin({
            title: "Transfomers.js Runner",
            template: path.resolve(__dirname, "src", "index.html"),
            filename: 'image-classification-gpu.html',
            chunks: ['image-classification-gpu'],
        }),
        new HtmlWebpackPlugin({
            title: "Transfomers.js Runner",
            template: path.resolve(__dirname, "src", "index.html"),
            filename: 'zero-shot-image-classification-cpu.html',
            chunks: ['zero-shot-image-classification-cpu'],
        }),
        new HtmlWebpackPlugin({
            title: "Transfomers.js Runner",
            template: path.resolve(__dirname, "src", "index.html"),
            filename: 'zero-shot-image-classification-gpu.html',
            chunks: ['zero-shot-image-classification-gpu'],
        }),
        new HtmlWebpackPlugin({
            title: "Transfomers.js Runner",
            template: path.resolve(__dirname, "src", "index.html"),
            filename: 'text-to-speech-cpu.html',
            chunks: ['text-to-speech-cpu'],
        }),
        new HtmlWebpackPlugin({
            title: "Transfomers.js Runner",
            template: path.resolve(__dirname, "src", "index.html"),
            filename: 'text-to-speech-gpu.html',
            chunks: ['text-to-speech-gpu'],
        }),
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
