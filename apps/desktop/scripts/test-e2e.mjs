import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import electron from "electron";
import { suites } from "./e2e/catalog.mjs";
import { checkCoverage, coverageSummary } from "./e2e/coverage.mjs";
import { junit } from "./e2e/report.mjs";
import { runCommand } from "./e2e/run-command.mjs";

const args = process.argv.slice(2);
for (const arg of args)
  if (
    !["--ci", "--list", "--coverage"].includes(arg) &&
    !arg.startsWith("--suite=")
  )
    throw new Error(`Unknown E2E option: ${arg}`);
const selectedIds = args
  .filter((arg) => arg.startsWith("--suite="))
  .flatMap((arg) => arg.slice(8).split(","));
for (const id of selectedIds)
  if (!suites.some((suite) => suite.id === id))
    throw new Error(`Unknown E2E suite: ${id}`);
if (args.includes("--list")) {
  for (const suite of suites)
    console.log(`${suite.id}${suite.ciOnly ? " (isolated CI host only)" : ""}`);
} else {
  const inventory = await checkCoverage();
  const summary = coverageSummary(inventory);
  if (args.includes("--coverage"))
    console.log(JSON.stringify(summary, null, 2));
  else {
    const selected = suites.filter((suite) =>
      selectedIds.length
        ? selectedIds.includes(suite.id)
        : !suite.ciOnly || args.includes("--ci"),
    );
    if (selected.some((suite) => suite.ciOnly) && !process.env.CI)
      throw new Error(
        "The browser suite creates an ephemeral host in CI only. Local browser checks use the designated shared runtime; see docs/circe/e2e.md.",
      );
    const cwd = fileURLToPath(new URL("../", import.meta.url));
    const directory = resolve(cwd, "../../.artifacts/e2e");
    await mkdir(directory, { recursive: true });
    const env = { ...process.env };
    for (const key of [
      "ELECTRON_RUN_AS_NODE",
      "ELECTRON_RENDERER_URL",
      "CIRCE_WEB",
      "IRIS_WEB",
      "POND_SANDBOX",
    ])
      delete env[key];
    const controller = new AbortController();
    const cancel = () => controller.abort();
    process.once("SIGINT", cancel);
    process.once("SIGTERM", cancel);
    const results = [];
    try {
      for (const suite of selected) {
        if (controller.signal.aborted) break;
        const logPath = join(directory, `${suite.id}.log`);
        console.log(`E2E_START ${suite.id}`);
        const result = {
          id: suite.id,
          logPath,
          ...(await runCommand({
            command: suite.runtime === "electron" ? electron : process.execPath,
            args: [
              join("scripts", suite.script),
              ...(suite.runtime === "electron" ? ["--use-mock-keychain"] : []),
            ],
            cwd,
            env,
            timeoutMs: suite.timeoutMs,
            logPath,
            signal: controller.signal,
          })),
        };
        results.push(result);
        await writeFile(
          join(directory, "results.json"),
          JSON.stringify({ coverage: summary, results }, null, 2),
        );
        await writeFile(join(directory, "junit.xml"), junit(results));
        console.log(
          `E2E_${result.status.toUpperCase()} ${suite.id} (${Math.round(result.durationMs / 1000)}s): ${logPath}`,
        );
        if (result.status === "failed")
          console.error((await readFile(logPath, "utf8")).slice(-8000));
      }
    } finally {
      process.removeListener("SIGINT", cancel);
      process.removeListener("SIGTERM", cancel);
    }
    if (
      controller.signal.aborted ||
      results.some((result) => result.status === "failed")
    )
      process.exitCode = 1;
  }
}
