import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import electron from "electron";

const sandbox = resolve(
  process.env.POND_SANDBOX ?? "../../.artifacts/iris-web-sandbox",
);
mkdirSync(sandbox, { recursive: true });
const runtimeEnv = { ...process.env };
delete runtimeEnv.ELECTRON_RUN_AS_NODE;
for (const address of [
  runtimeEnv.PORTLESS_URL,
  runtimeEnv.PORTLESS_TAILSCALE_URL,
])
  if (address) console.info(`Circé: ${address}`);
let stopping = false;
let child;
function startHost() {
  child = spawn(electron, [".", "--enable-logging", "--use-mock-keychain"], {
    stdio: "inherit",
    env: {
      ...runtimeEnv,
      POND_SANDBOX: sandbox,
      CIRCE_WEB: "1",
      CIRCE_WEB_SUPERVISED: "1",
      CIRCE_LOCAL_API_PORT: process.env.CIRCE_LOCAL_API_PORT ?? "4788",
      CIRCE_WEB_FIXTURES:
        process.env.CIRCE_WEB_FIXTURES ?? process.env.IRIS_WEB_FIXTURES ?? "0",
    },
  });
  child.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    if (code === 75 && !stopping) {
      startHost();
      return;
    }
    process.exit(code ?? 1);
  });
}
startHost();
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stopping = true;
    child.kill(signal);
  });
