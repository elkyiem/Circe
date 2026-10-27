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
const child = spawn(
  electron,
  [".", "--enable-logging", "--use-mock-keychain"],
  {
    stdio: "inherit",
    env: {
      ...runtimeEnv,
      POND_SANDBOX: sandbox,
      CIRCE_WEB: "1",
      CIRCE_WEB_FIXTURES:
        process.env.CIRCE_WEB_FIXTURES ?? process.env.IRIS_WEB_FIXTURES ?? "1",
    },
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
