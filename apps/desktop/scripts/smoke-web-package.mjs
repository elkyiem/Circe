import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import electron from "electron";
import { connectWebHost } from "./web-smoke-client.mjs";

const host = await connectWebHost();
const work = await mkdtemp(join(tmpdir(), "iris-package-roundtrip-"));
const cache = resolve("node_modules/.cache");
await mkdir(cache, { recursive: true });
const bundle = await mkdtemp(join(cache, "iris-package-roundtrip-"));
try {
  const page = await host.query("saves.listPage", { limit: 100 });
  const ids = [
    "900000000000000001",
    "900000000000000002",
    "900000000000000003",
  ].map((sourceId) => page.rows.find((save) => save.sourceId === sourceId)?.id);
  assert.ok(
    ids.every(Boolean),
    "Ingest the quote, image and video fixtures first.",
  );
  const exported = await host.call("files", {
    name: "saves.exportPackage",
    params: { ids },
  });
  const download = await fetch(`${host.origin}${exported.download}`, {
    headers: host.headers,
  });
  assert.equal(download.status, 200);
  await writeFile(
    join(work, "Saves.pondpack.zip"),
    Buffer.from(await download.arrayBuffer()),
    { mode: 0o600 },
  );
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  for (const mode of ["import", "restart"]) {
    await new Promise((resolveRun, reject) => {
      const child = spawn(
        electron,
        [
          resolve("scripts/smoke-web-package-host.cjs"),
          work,
          mode,
          bundle,
          "--use-mock-keychain",
        ],
        {
          env: environment,
          stdio: "inherit",
          signal: AbortSignal.timeout(90000),
        },
      );
      child.once("error", reject);
      child.once("exit", (code) =>
        code === 0
          ? resolveRun()
          : reject(new Error(`Package ${mode} verification exited ${code}.`)),
      );
    });
  }
  console.log(
    "WEB_FRESH_PACKAGE_PASSED",
    JSON.stringify({
      saves: 3,
      captureIdentity: true,
      originals: true,
      organization: true,
      dedup: true,
      restart: true,
    }),
  );
} finally {
  await rm(work, { recursive: true, force: true });
  await rm(bundle, { recursive: true, force: true });
}
