import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const tokenServicePath = fileURLToPath(new URL("./mercado-livre-token-service.mjs", import.meta.url));
const vinextPath = fileURLToPath(new URL("../node_modules/vinext/dist/cli.js", import.meta.url));
const port = String(Number(process.env.PORT || 10000));
const renderEnv = {
  ...process.env,
  CI: "true",
};

const children = [
  spawn(process.execPath, [tokenServicePath], { stdio: "inherit", env: renderEnv }),
  spawn(process.execPath, [vinextPath,
    "start",
    "--hostname", "0.0.0.0",
    "--port", port,
  ], { stdio: "inherit", env: renderEnv }),
];

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  setTimeout(() => process.exit(exitCode), 500).unref();
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
