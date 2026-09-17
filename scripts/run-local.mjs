import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const tokenServicePath = fileURLToPath(new URL("./mercado-livre-token-service.mjs", import.meta.url));
const appRunnerPath = fileURLToPath(new URL("./run-framework.mjs", import.meta.url));
const children = [
  spawn(process.execPath, [tokenServicePath], { stdio: "inherit", env: process.env }),
  spawn(process.execPath, [appRunnerPath, "dev"], { stdio: "inherit", env: process.env }),
];

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  setTimeout(() => process.exit(exitCode), 250).unref();
}

for (const child of children) {
  child.on("error", (error) => {
    console.error(error);
    stop(1);
  });
  child.on("exit", (code, signal) => {
    if (!stopping) stop(signal ? 1 : (code ?? 0));
  });
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
