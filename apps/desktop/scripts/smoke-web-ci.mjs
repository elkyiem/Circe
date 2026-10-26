import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import electron from "electron";

if (!process.env.CI)
  throw new Error(
    "This ephemeral runner is for CI. Local chats use the designated shared host.",
  );
const cwd = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = await mkdtemp(join(tmpdir(), "iris-web-ci-"));
const env = {
  ...process.env,
  POND_SANDBOX: directory,
  IRIS_WEB_PORT: "4792",
  IRIS_WEB_ORIGIN: "http://127.0.0.1:4792",
  IRIS_WEB_FIXTURES: "1",
};
delete env.ELECTRON_RUN_AS_NODE;
const host = spawn(process.execPath, ["scripts/start-web.mjs"], {
  cwd,
  env,
  stdio: "inherit",
});
const closed = new Promise((resolve) => host.once("exit", resolve));
const run = (executable, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Verification process exited ${code}.`)),
    );
  });
const deadline = setTimeout(() => {
  host.kill("SIGTERM");
  process.exitCode = 1;
}, 180000);
try {
  const started = Date.now();
  while (true) {
    if (host.exitCode !== null)
      throw new Error("The isolated host exited before readiness.");
    try {
      if ((await fetch(`${env.IRIS_WEB_ORIGIN}/web/session`)).status === 401)
        break;
    } catch {}
    if (Date.now() - started > 60000)
      throw new Error("The isolated host did not become ready.");
    await pause(250);
  }
  await run(process.execPath, ["scripts/smoke-web.mjs"]);
  await run(process.execPath, ["scripts/smoke-web-parity.mjs"]);
  await run(process.execPath, ["scripts/smoke-web-canvas.mjs"]);
  await run(electron, ["scripts/smoke-web-browser.cjs"]);
} finally {
  clearTimeout(deadline);
  host.kill("SIGTERM");
  const ended = await Promise.race([
    closed.then(() => true),
    pause(5000).then(() => false),
  ]);
  if (!ended) {
    host.kill("SIGKILL");
    await closed;
  }
  await rm(directory, { recursive: true, force: true });
}
