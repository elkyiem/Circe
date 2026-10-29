import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createTransferJobStore } from "../../core/transfer-jobs";
import { createTransferJobQueries } from "./transfer-jobs";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "circe-native-transfer-"));
  roots.push(root);
  const source = join(root, "artifact.zip");
  await writeFile(source, "validated artifact bytes");
  const destination = join(root, "chosen.zip");
  const store = createTransferJobStore(join(root, "jobs"));
  const state = {
    choose: true,
    staleAfterPicker: false,
    stale: false,
    nativeRetries: 0,
    hostedRetries: 0,
    artifacts: 0,
  };
  const queries = createTransferJobQueries({
    store: () => store,
    delivery: () => ({
      list: () => store.list(),
      retry: async (id) => {
        expect(id).toBe("job");
        state.hostedRetries++;
        return { ok: true };
      },
      artifact: async (id) => {
        expect(id).toBe("job");
        state.artifacts++;
        if (state.stale) throw new Error("The Library changed");
        return { path: source, filename: "Saves.zip" };
      },
    }),
    retry: async () => {
      state.nativeRetries++;
      throw new Error("Unprepared browser source");
    },
    chooseFile: async (name) => {
      expect(name).toBe("Saves.zip");
      if (state.staleAfterPicker) state.stale = true;
      return state.choose ? destination : null;
    },
    copyFile,
  });
  return { state, queries, destination };
}
it("routes desktop Retry through the resident owner that prepares browser-created jobs", async () => {
  const test = await fixture();
  expect(await test.queries["transferJobs.retry"]({ id: "job" })).toEqual({
    ok: true,
  });
  expect(test.state.hostedRetries).toBe(1);
  expect(test.state.nativeRetries).toBe(0);
});
it("saves a completed browser export on the desktop and treats Save As cancellation as a dismissal", async () => {
  const test = await fixture();
  test.state.choose = false;
  expect(await test.queries["transferJobs.download"]({ id: "job" })).toEqual({
    ok: false,
    reason: "cancelled",
  });
  await expect(readFile(test.destination)).rejects.toMatchObject({
    code: "ENOENT",
  });
  test.state.choose = true;
  expect(await test.queries["transferJobs.download"]({ id: "job" })).toEqual({
    ok: true,
  });
  expect(await readFile(test.destination, "utf8")).toBe(
    "validated artifact bytes",
  );
  expect(test.state.artifacts).toBe(3);
});
it("rechecks the artifact after the native picker before copying any bytes", async () => {
  const test = await fixture();
  test.state.staleAfterPicker = true;
  await expect(
    test.queries["transferJobs.download"]({ id: "job" }),
  ).rejects.toThrow("Library changed");
  await expect(readFile(test.destination)).rejects.toMatchObject({
    code: "ENOENT",
  });
});
