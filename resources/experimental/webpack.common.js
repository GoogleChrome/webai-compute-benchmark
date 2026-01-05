const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = {
    target: ["web", "es2020"],
    entry: {
        'text2text-generation-cpu': './src/text2text-generation-cpu.mjs',
        'text2text-generation-gpu': './src/text2text-generation-gpu.mjs',
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
