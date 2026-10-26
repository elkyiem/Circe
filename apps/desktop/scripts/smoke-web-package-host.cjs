const { app } = require("electron");
const { mkdirSync, writeFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");
const [work, mode, bundle] = process.argv.slice(2);
if (!work || !bundle || !["import", "restart"].includes(mode))
  throw new Error("Use the finite smoke-web-package.mjs driver.");
const userData = join(work, "app");
const library = join(work, "Fresh.pond");
mkdirSync(userData, { recursive: true });
mkdirSync(library, { recursive: true });
app.setPath("userData", userData);
app.setAppLogsPath(join(work, "logs"));
app.commandLine.appendSwitch("use-mock-keychain");
writeFileSync(
  join(userData, "library-location.json"),
  JSON.stringify({ path: library }),
);
const timer = setTimeout(() => {
  console.error("WEB_PACKAGE_FAILED: timed out");
  app.exit(1);
}, 60000);

app.whenReady().then(async () => {
  try {
    mkdirSync(bundle, { recursive: true });
    if (mode === "import") {
      const { build } = await import("vite");
      const main = resolve(__dirname, "../src/main");
      const entry = join(bundle, "entry.js");
      writeFileSync(
        entry,
        `
        import assert from "node:assert/strict";
        import { createHash } from "node:crypto";
        import { readFile, writeFile } from "node:fs/promises";
        import { join } from "node:path";
        import { saves } from "@pond/schema/db";
        import { getDb, closeDb } from ${JSON.stringify(`${main}/db.ts`)};
        import { libraryRoot, saveDir } from ${JSON.stringify(`${main}/paths.ts`)};
        import { importPondPackage, exportPondPackage } from ${JSON.stringify(`${main}/core/pond-package.ts`)};
        import { unzipWebDirectory } from ${JSON.stringify(`${main}/web/archives.ts`)};
        function folderPaths(save, manifest) {
          return save.folderIds.map((id) => {
            const names = [];
            for (let depth = 0; id && depth <= manifest.folders.length; depth++) {
              const folder = manifest.folders.find((folder) => folder.id === id);
              assert.ok(folder, "A folder relationship must resolve.");
              names.unshift(folder.name); id = folder.parentId;
            }
            assert.ok(!id, "The folder tree must be acyclic.");
            return names.join("/");
          }).sort();
        }
        async function verifyFiles(rows) {
          for (const row of rows) for (const file of row.files) {
            const bytes = await readFile(join(saveDir(row.id), file.path));
            assert.equal(bytes.length, file.size);
            assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256);
          }
        }
        export async function run(work, mode, expectedLibrary) {
          assert.equal(libraryRoot(), expectedLibrary);
          const db = await getDb();
          if (mode === "restart") {
            const proof = JSON.parse(await readFile(join(work, "proof.json"), "utf8"));
            const rows = await db.select().from(saves);
            assert.deepEqual(rows.map((row) => ({ id: row.id, sourceId: row.sourceId })).sort((a,b) => a.id.localeCompare(b.id)), proof);
            await verifyFiles(rows);
            await closeDb();
            return { restart: true, saves: rows.length };
          }
          assert.equal((await db.select().from(saves)).length, 0);
          const expanded = await unzipWebDirectory(join(work, "Saves.pondpack.zip"), join(work, "expanded"));
          const original = JSON.parse(await readFile(join(expanded, "pond-export.json"), "utf8"));
          assert.equal(original.saves.length, 3);
          const imported = await importPondPackage(expanded);
          assert.equal(imported.imported, 3);
          assert.equal(imported.skipped, 0);
          const rows = await db.select().from(saves);
          assert.equal(rows.length, 3);
          for (const row of rows) {
            const source = original.saves.find((save) => save.source === row.source && save.sourceId === row.sourceId);
            assert.ok(source);
            assert.equal(row.title, source.title);
            assert.equal(row.notes, source.notes);
            assert.deepEqual(row.rawJson, source.rawJson);
            assert.deepEqual(row.files, source.files);
          }
          await verifyFiles(rows);
          const repeated = await importPondPackage(expanded);
          assert.equal(repeated.imported, 0);
          assert.equal(repeated.skipped, 3);
          assert.equal((await db.select().from(saves)).length, 3);
          const roundtrip = join(work, "Roundtrip.pondpack");
          await exportPondPackage(rows.map((row) => row.id), roundtrip);
          const second = JSON.parse(await readFile(join(roundtrip, "pond-export.json"), "utf8"));
          for (const source of original.saves) {
            const restored = second.saves.find((save) => save.source === source.source && save.sourceId === source.sourceId);
            assert.ok(restored);
            assert.deepEqual(folderPaths(restored, second), folderPaths(source, original));
          }
          for (const collection of ["views", "tags", "groups"])
            assert.deepEqual((second.organization?.[collection] ?? []).map((row) => row.name).sort(), (original.organization?.[collection] ?? []).map((row) => row.name).sort());
          await writeFile(join(work, "proof.json"), JSON.stringify(rows.map((row) => ({ id: row.id, sourceId: row.sourceId })).sort((a,b) => a.id.localeCompare(b.id))));
          await closeDb();
          return { imported: 3, originals: true, captureIdentity: true, folderPaths: true, organization: true, dedup: true };
        }
      `,
      );
      await build({
        configFile: false,
        logLevel: "error",
        ssr: { noExternal: ["@pond/schema"] },
        build: {
          ssr: entry,
          outDir: bundle,
          emptyOutDir: false,
          rollupOptions: { output: { entryFileNames: "smoke.mjs" } },
        },
      });
    }
    const fixture = await import(pathToFileURL(join(bundle, "smoke.mjs")).href);
    console.log(
      "WEB_PACKAGE_HOST_PASSED",
      JSON.stringify(await fixture.run(work, mode, library)),
    );
    clearTimeout(timer);
    app.exit(0);
  } catch (error) {
    console.error("WEB_PACKAGE_FAILED", error);
    clearTimeout(timer);
    app.exit(1);
  }
});
