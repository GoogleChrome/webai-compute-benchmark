const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = {
    target: ["web", "es2020"],
    entry: {
        'feature-extraction-cpu': './src/feature-extraction-cpu.mjs',
        'feature-extraction-gpu': './src/feature-extraction-gpu.mjs',
        'sentence-similarity-cpu': './src/sentence-similarity-cpu.mjs',
        'sentence-similarity-gpu': './src/sentence-similarity-gpu.mjs',
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
