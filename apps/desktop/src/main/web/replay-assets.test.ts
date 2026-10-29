import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { replayAssets } from "./replay-assets";

const roots: string[] = [];
const entryKinds: Array<"worker" | "bootstrap"> = ["worker", "bootstrap"];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "circe-replay-assets-"));
  roots.push(root);
  const browser = join(root, "browser");
  const resources = join(root, "resources");
  const assets = join(browser, "assets");
  await mkdir(assets, { recursive: true });
  await mkdir(join(resources, "replay"), { recursive: true });
  await writeFile(join(resources, "replay", "ui.js"), "fixture RWP UI");
  await writeFile(join(assets, "replay-worker-a_1-b.js"), "fixture worker");
  await writeFile(
    join(assets, "replay-bootstrap-B2_c.js"),
    "fixture bootstrap",
  );
  return { assets, resources, load: replayAssets({ browser, resources }) };
}

it("binds both fingerprinted entrypoints and the real resource UI to one shared loading promise", async () => {
  const test = await fixture();
  const loading = test.load();
  expect(test.load()).toBe(loading);
  expect(await loading).toEqual({
    ui: "fixture RWP UI",
    worker: "fixture worker",
    bootstrap: "fixture bootstrap",
    workerAsset: "/assets/replay-worker-a_1-b.js",
    bootstrapAsset: "/assets/replay-bootstrap-B2_c.js",
  });
  await writeFile(
    join(test.assets, "replay-worker-a_1-b.js"),
    "changed disk build",
  );
  expect((await test.load()).worker).toBe("fixture worker");
});

it.each(entryKinds)(
  "rejects a missing %s entrypoint and can retry after the build is repaired",
  async (kind) => {
    const test = await fixture();
    const filename =
      kind === "worker" ? "replay-worker-a_1-b.js" : "replay-bootstrap-B2_c.js";
    await rm(join(test.assets, filename));
    await expect(test.load()).rejects.toThrow("Rebuild the Circé browser");
    await writeFile(join(test.assets, filename), "repaired entrypoint");
    expect((await test.load())[kind]).toBe("repaired entrypoint");
  },
);

it.each(entryKinds)(
  "rejects ambiguous %s builds instead of selecting an arbitrary fingerprint",
  async (kind) => {
    const test = await fixture();
    const duplicate = join(test.assets, `replay-${kind}-duplicate.js`);
    await writeFile(duplicate, "unrelated build");
    await expect(test.load()).rejects.toThrow("Rebuild the Circé browser");
    await rm(duplicate);
    expect((await test.load())[kind]).toBe(`fixture ${kind}`);
  },
);

it("requires a literal .js suffix and excludes map files and invalid fingerprint names", async () => {
  const test = await fixture();
  await rm(join(test.assets, "replay-worker-a_1-b.js"));
  for (const name of [
    "replay-worker-decoyXjs",
    "replay-worker-decoy.js.map",
    "replay-worker-decoy.extra.js",
    "replay-worker-.js",
  ])
    await writeFile(join(test.assets, name), "not a valid built worker");
  await expect(test.load()).rejects.toThrow("Rebuild the Circé browser");
  await writeFile(join(test.assets, "replay-worker-real.js"), "real worker");
  expect((await test.load()).workerAsset).toBe("/assets/replay-worker-real.js");
});

it("does not retain a failed resource read and reloads the complete asset set on retry", async () => {
  const test = await fixture();
  const ui = join(test.resources, "replay", "ui.js");
  await rm(ui);
  await expect(test.load()).rejects.toMatchObject({ code: "ENOENT" });
  await writeFile(ui, "restored RWP UI");
  await writeFile(
    join(test.assets, "replay-bootstrap-B2_c.js"),
    "fresh bootstrap after failed load",
  );
  const result = await test.load();
  expect(result.ui).toBe("restored RWP UI");
  expect(result.bootstrap).toBe("fresh bootstrap after failed load");
});
