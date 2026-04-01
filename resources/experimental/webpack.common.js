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
            template: path.resolve(__dirname, "src", "gemma", "index.html"),
            filename: 'gemma.html',
            chunks: ['gemma'],
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
