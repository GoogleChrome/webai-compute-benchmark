const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = {
    target: ["web", "es2020"],
    entry: {
        'summarization-cpu': './src/summarization-cpu.mjs',
        'summarization-gpu': './src/summarization-gpu.mjs',
    },
    plugins: [
        new HtmlWebpackPlugin({
            title: "Experimental Runner",
            template: path.resolve(__dirname, "src", "index.html"),
            filename: 'summarization-cpu.html',
            chunks: ['summarization-cpu'],
        }),
        new HtmlWebpackPlugin({
            title: "Experimental Runner",
            template: path.resolve(__dirname, "src", "index.html"),
            filename: 'summarization-gpu.html',
            chunks: ['summarization-gpu'],
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
