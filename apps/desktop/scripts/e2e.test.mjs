import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as pause } from "node:timers/promises";
import { suites } from "./e2e/catalog.mjs";
import { checkCoverage, coverageSummary } from "./e2e/coverage.mjs";
import { junit } from "./e2e/report.mjs";
import { runCommand } from "./e2e/run-command.mjs";
import { sharedCases } from "./e2e/shared-cases.cjs";

test("upstream capabilities, access changes and route additions need an E2E decision", async () => {
  const inventory = await checkCoverage();
  const ids = sharedCases.map((scenario) => scenario.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const scenario of sharedCases) {
    assert.ok(scenario.queries.length > 0);
    assert.equal(new Set(scenario.queries).size, scenario.queries.length);
    for (const query of scenario.queries)
      assert.ok(
        query in inventory.queries,
        `${scenario.id}: unknown query ${query}`,
      );
  }
  const summary = coverageSummary(inventory);
  assert.equal(
    summary.totalQueries,
    summary.sharedScenarioQueries + summary.pendingQueries.length,
  );
  for (const suite of suites)
    await readFile(new URL(`./${suite.script}`, import.meta.url));
});

test("JUnit exposes failure details and escapes fixture text", () => {
  const xml = junit([
    {
      id: 'test<&"',
      status: "failed",
      durationMs: 1200,
      error: "Invalid <Save>",
      logPath: "/tmp/proof&log",
    },
  ]);
  assert.match(xml, /failures="1"/);
  assert.match(xml, /time="1.2"/);
  assert.match(xml, /test&lt;&amp;&quot;/);
  assert.match(xml, /Invalid &lt;Save&gt;/);
  assert.match(xml, /proof&amp;log/);
});

test("fixture failures retain stdout and stderr; a hung fixture is killed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "circe-e2e-runner-"));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    const logPath = join(directory, "failure.log");
    const result = await runCommand({
      command: process.execPath,
      args: [
        "-e",
        "console.log('fixture output'); console.error('fixture failure'); process.exitCode=2",
      ],
      env,
      timeoutMs: 5000,
      logPath,
    });
    assert.equal(result.status, "failed");
    assert.equal(result.exitCode, 2);
    assert.match(
      await readFile(logPath, "utf8"),
      /fixture output\nfixture failure/,
    );
    const hung = await runCommand({
      command: process.execPath,
      args: ["-e", "setInterval(()=>{},1000)"],
      env,
      timeoutMs: 200,
      logPath: join(directory, "timeout.log"),
    });
    assert.equal(hung.status, "failed");
    assert.match(hung.error, /Timed out/);
    const missing = await runCommand({
      command: join(directory, "missing-executable"),
      args: [],
      env,
      timeoutMs: 5000,
      logPath: join(directory, "missing.log"),
    });
    assert.equal(missing.status, "failed");
    assert.match(missing.error, /ENOENT/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("cancellation lets a fixture finish its owned cleanup before exiting", {
  skip:
    process.platform === "win32"
      ? "Windows taskkill does not deliver POSIX signals"
      : false,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "circe-e2e-cancel-"));
  const controller = new AbortController();
  const logPath = join(directory, "cancel.log");
  const marker = join(directory, "cleaned.txt");
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const running = runCommand({
    command: process.execPath,
    args: [
      "-e",
      `const fs=require('node:fs'); process.on('SIGTERM',()=>setTimeout(()=>{fs.writeFileSync(${JSON.stringify(marker)},'cleaned');process.exit(0)},250));console.log('ready');setInterval(()=>{},1000)`,
    ],
    env,
    timeoutMs: 10000,
    logPath,
    signal: controller.signal,
  });
  try {
    const deadline = Date.now() + 5000;
    while (true) {
      const log = await readFile(logPath, "utf8").catch(() => "");
      if (log.includes("ready")) break;
      assert.ok(
        Date.now() < deadline,
        "Cancellation fixture did not become ready",
      );
      await pause(20);
    }
    controller.abort();
    const result = await running;
    assert.equal(result.status, "failed");
    assert.equal(result.error, "Cancelled");
    assert.equal(await readFile(marker, "utf8"), "cleaned");
  } finally {
    controller.abort();
    await running;
    await rm(directory, { recursive: true, force: true });
  }
});
