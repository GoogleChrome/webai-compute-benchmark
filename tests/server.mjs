// Simple server for local testing.

import * as path from "path";
import commandLineArgs from "command-line-args";
import esMain from "es-main";
import LocalWebServer from "lws";
import "lws-cors";
import "lws-index";
import "lws-log";
import "lws-static";

const ROOT_DIR = path.join(process.cwd(), "./");

export default async function serve(port, { verbose = false } = {}) {
    if (!port) {
        throw new Error("Port is required");
    }
    const stack = ["lws-cors", "lws-static", "lws-index"];
    if (verbose) {
        stack.unshift("lws-log");
    }
    const ws = await LocalWebServer.create({
        port: port,
        directory: ROOT_DIR,
        corsOpenerPolicy: "same-origin",
        corsEmbedderPolicy: "require-corp",
        logFormat: "dev",
        stack,
    });
    await verifyStartup(ws, port);

    process.on("exit", () => ws.server.close());

    return {
        close() {
            ws.server.close();
        },
    };
}

async function verifyStartup(ws, port) {
    await new Promise((resolve, reject) => {
        ws.server.on("listening", () => {
            console.log(`Server started on http://localhost:${port}`);
            resolve();
        });
        ws.server.on("error", (e) => {
            console.error("Error while starting the server", e);
            reject(e);
        });
    });
}

function main() {
    const optionDefinitions = [{ name: "port", type: Number, defaultValue: 8080, description: "Set the test-server port, The default value is 8080." }];
    const options = commandLineArgs(optionDefinitions);
    serve(options.port, { verbose: true });
}

if (esMain(import.meta)) {
    main();
}
