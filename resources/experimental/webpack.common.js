const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = {
    target: ["web", "es2020"],
    entry: {
        'empty-cpu': './src/empty-cpu.mjs',
        'empty-gpu': './src/empty-gpu.mjs',
    },
    plugins: [
        new HtmlWebpackPlugin({
            title: "Experimental Runner",
            template: path.resolve(__dirname, "src", "index.html"),
            filename: 'empty-cpu.html',
            chunks: ['empty-cpu'],
        }),
        new HtmlWebpackPlugin({
            title: "Experimental Runner",
            template: path.resolve(__dirname, "src", "index.html"),
            filename: 'empty-gpu.html',
            chunks: ['empty-gpu'],
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
