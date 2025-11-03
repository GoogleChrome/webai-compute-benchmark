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
