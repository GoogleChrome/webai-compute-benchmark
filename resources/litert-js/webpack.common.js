const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
    target: ["web", "es2020"],
    entry: {
        'image-segmentation-cpu': './src/image-segmentation-cpu.mjs',
        'image-segmentation-gpu': './src/image-segmentation-gpu.mjs',
        'image-classification-cpu': './src/image-classification-cpu.mjs',
        'image-classification-gpu': './src/image-classification-gpu.mjs',
        'hand-detection-cpu': './src/hand-detection-cpu.mjs',
        'hand-detection-gpu': './src/hand-detection-gpu.mjs',
    },
    plugins: [
        new HtmlWebpackPlugin({
            title: "LiteRT.js Runner",
            template: path.resolve(__dirname, "src", "index.html"),
            filename: 'image-segmentation-cpu.html',
            chunks: ['image-segmentation-cpu'],
        }),
        new HtmlWebpackPlugin({
            title: "LiteRT.js Runner",
            template: path.resolve(__dirname, "src", "index.html"),
            filename: 'image-segmentation-gpu.html',
            chunks: ['image-segmentation-gpu'],
        }),
        new HtmlWebpackPlugin({
            title: "LiteRT.js Runner",
            template: path.resolve(__dirname, "src", "index.html"),
            filename: 'image-classification-cpu.html',
            chunks: ['image-classification-cpu'],
        }),
        new HtmlWebpackPlugin({
            title: "LiteRT.js Runner",
            template: path.resolve(__dirname, "src", "index.html"),
            filename: 'image-classification-gpu.html',
            chunks: ['image-classification-gpu'],
        }),
        new HtmlWebpackPlugin({
            title: "LiteRT.js Runner",
            template: path.resolve(__dirname, "src", "index.html"),
            filename: 'hand-detection-cpu.html',
            chunks: ['hand-detection-cpu'],
        }),
        new HtmlWebpackPlugin({
            title: "LiteRT.js Runner",
            template: path.resolve(__dirname, "src", "index.html"),
            filename: 'hand-detection-gpu.html',
            chunks: ['hand-detection-gpu'],
        }),
        new CopyPlugin({
            patterns: [
                {
                    from: path.resolve(__dirname, 'node_modules/@litertjs/core/wasm'),
                    to: path.resolve(__dirname, 'dist/resources/wasm'),
                    // This is to prevent an error on hot-reloads
                    noErrorOnMissing: true,
                },
            ],
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
