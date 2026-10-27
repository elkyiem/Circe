import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openExtensionAuth } from "./extension-auth";

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0))
    await rm(path, { recursive: true, force: true });
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "iris-extension-auth-"));
  directories.push(directory);
  const path = join(directory, "connections.json");
  let time = 1000;
  const options = { path, key: "fixture-access-key", now: () => time };
  return {
    path,
    options,
    auth: await openExtensionAuth(options),
    advance: () => {
      time += 91 * 24 * 60 * 60_000;
    },
  };
}
const input = {
  key: "fixture-access-key",
  name: "Test browser",
  extension: "chrome-extension://fixture",
  origin: "https://iris.test",
  libraryId: "library-a",
};

describe("Circé extension credentials", () => {
  it("rejects a wrong bootstrap key and stores only a digest of the separate credential", async () => {
    const test = await fixture();
    expect(await test.auth.pair({ ...input, key: "wrong" })).toBeNull();
    const pair = await test.auth.pair(input);
    expect(pair).not.toBeNull();
    if (!pair) throw new Error("Pairing failed.");
    const bytes = await readFile(test.path, "utf8");
    expect(bytes).not.toContain(input.key);
    expect(bytes).not.toContain(pair.token);
    if (process.platform !== "win32")
      expect((await stat(test.path)).mode & 0o777).toBe(0o600);
  });
  it("binds extension identity, address and Library, and survives a host restart", async () => {
    const test = await fixture();
    const pair = await test.auth.pair(input);
    if (!pair) throw new Error("Pairing failed.");
    const reopened = await openExtensionAuth(test.options);
    expect(
      reopened.valid(
        pair.token,
        input.extension,
        input.origin,
        input.libraryId,
      ),
    ).toBe(true);
    for (const [extension, origin, library] of [
      ["other", input.origin, input.libraryId],
      [input.extension, "https://other.test", input.libraryId],
      [input.extension, input.origin, "library-b"],
    ] as const)
      expect(reopened.valid(pair.token, extension, origin, library)).toBe(
        false,
      );
    expect(reopened.list(input.libraryId)[0]).not.toHaveProperty("digest");
  });
  it("rotates one browser's credential, revokes it persistently, and expires old connections", async () => {
    const test = await fixture();
    const first = await test.auth.pair(input);
    const second = await test.auth.pair({
      ...input,
      replaceToken: first?.token,
    });
    if (!first || !second) throw new Error("Pairing failed.");
    expect(
      test.auth.valid(
        first.token,
        input.extension,
        input.origin,
        input.libraryId,
      ),
    ).toBe(false);
    expect(
      test.auth.valid(
        second.token,
        input.extension,
        input.origin,
        input.libraryId,
      ),
    ).toBe(true);
    await test.auth.revoke(
      second.token,
      input.extension,
      input.origin,
      input.libraryId,
    );
    expect(
      (await openExtensionAuth(test.options)).list(input.libraryId),
    ).toEqual([]);
    await test.auth.pair(input);
    test.advance();
    expect(test.auth.hasPair(input.libraryId)).toBe(false);
    expect(test.auth.list(input.libraryId)).toEqual([]);
  });
  it("serializes concurrent pairing and preserves other Libraries when revoking", async () => {
    const test = await fixture();
    await Promise.all([
      test.auth.pair(input),
      test.auth.pair({ ...input, libraryId: "library-b" }),
    ]);
    await test.auth.revokeAll("library-a");
    const reopened = await openExtensionAuth(test.options);
    expect(reopened.list("library-a")).toEqual([]);
    expect(reopened.list("library-b")).toHaveLength(1);
  });
  it("keeps two browsers with the same extension ID independently authorized", async () => {
    const test = await fixture();
    const first = await test.auth.pair(input);
    const second = await test.auth.pair(input);
    if (!first || !second) throw new Error("Pairing failed.");
    await test.auth.revoke(
      first.token,
      input.extension,
      input.origin,
      input.libraryId,
    );
    expect(
      test.auth.valid(
        first.token,
        input.extension,
        input.origin,
        input.libraryId,
      ),
    ).toBe(false);
    expect(
      test.auth.valid(
        second.token,
        input.extension,
        input.origin,
        input.libraryId,
      ),
    ).toBe(true);
  });
});
