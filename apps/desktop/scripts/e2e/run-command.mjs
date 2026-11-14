import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { finished } from "node:stream/promises";
import { spawnProcessGroup } from "../process-group.mjs";

/** Bound fixture lifetime and retain output without buffering an entire browser run. */
export async function runCommand({
  command,
  args,
  cwd,
  env,
  timeoutMs,
  logPath,
  signal,
}) {
  const started = Date.now();
  const log = createWriteStream(logPath, { mode: 0o600 });
  // Open evidence before starting a process so a failed log path cannot orphan it.
  await new Promise((resolve, reject) => {
    log.once("open", resolve);
    log.once("error", reject);
  });
  const options = { cwd, env, stdio: ["ignore", "pipe", "pipe"] };
  const group =
    process.platform === "win32"
      ? null
      : spawnProcessGroup(command, args, options);
  const child = group?.child ?? spawn(command, args, options);
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  let error;
  let stopping;
  const stop = () => {
    stopping ??= group
      ? group.stop(5000)
      : new Promise((resolve) => {
          if (!child.pid) return resolve();
          const killer = spawn(
            "taskkill",
            ["/pid", String(child.pid), "/T", "/F"],
            { stdio: "ignore" },
          );
          killer.once("error", resolve);
          killer.once("close", resolve);
        });
    return stopping;
  };
  const abort = () => {
    error = "Cancelled";
    void stop();
  };
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => {
    error = `Timed out after ${timeoutMs}ms`;
    void stop();
  }, timeoutMs);
  const code = await new Promise((resolve) => {
    child.once("error", (failure) => {
      error = failure.message;
      resolve(null);
    });
    child.once("close", resolve);
    if (signal?.aborted) abort();
  });
  clearTimeout(timer);
  signal?.removeEventListener("abort", abort);
  // Clean descendants even when the Electron parent exited unsuccessfully.
  await stop().catch((failure) => {
    error ??= failure.message;
  });
  log.end();
  await finished(log);
  return {
    status: code === 0 && !error ? "passed" : "failed",
    exitCode: code,
    durationMs: Date.now() - started,
    error,
  };
}
