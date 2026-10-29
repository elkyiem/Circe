import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sandbox = await mkdtemp(join(tmpdir(), "circe-enrichment-smoke-"));
const env = { ...process.env, POND_SANDBOX: sandbox };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(
  require("electron"),
  [fileURLToPath(new URL("./smoke-enrichment.cjs", import.meta.url))],
  { env, stdio: "inherit" },
);
let forced;
const deadline = setTimeout(() => {
  child.kill("SIGTERM");
  forced = setTimeout(() => child.kill("SIGKILL"), 5000);
}, 310000);
try {
  process.exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
} finally {
  clearTimeout(deadline);
  clearTimeout(forced);
  await rm(sandbox, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
