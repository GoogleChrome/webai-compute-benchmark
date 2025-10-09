const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = {
    entry: {
        app: path.resolve(__dirname, "src", "index.mjs"),
    },
    plugins: [
        new HtmlWebpackPlugin({
            title: "Transfomers.js Runner",
            template: path.resolve(__dirname, "src", "index.html"),
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
};
