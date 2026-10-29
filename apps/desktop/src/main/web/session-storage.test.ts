import { chmod, lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { openStoredWebSessions } from "./session-storage";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "circe-browser-sessions-"));
  roots.push(directory);
  const path = join(directory, "sessions.json");
  const warnings: unknown[] = [];
  let now = 1000;
  const open = (key = "fixture-access-key") =>
    openStoredWebSessions({
      path,
      key,
      now: () => now,
      warn: (cause) => warnings.push(cause),
    });
  return {
    path,
    warnings,
    open,
    expire: () => {
      now += 12 * 60 * 60_000;
    },
  };
}
it("survives a host replacement with the same Library and origin while storing only hashes", async () => {
  const test = await fixture();
  const sessions = await test.open();
  const cookie = sessions.login(
    "fixture-access-key",
    "https://circe.test\0library-a",
  );
  if (!cookie) throw new Error("Fixture login failed");
  await sessions.flush();
  const text = await readFile(test.path, "utf8");
  expect(text).not.toContain(cookie);
  expect(text).not.toContain("fixture-access-key");
  expect((await lstat(test.path)).mode & 0o777).toBe(0o600);
  await sessions.close();
  const reopened = await test.open();
  expect(reopened.valid(cookie, "https://circe.test\0library-a")).toBe(true);
  expect(reopened.valid(cookie, "https://other.test\0library-a")).toBe(false);
  await reopened.flush();
  const again = await test.open();
  expect(again.valid(cookie, "https://circe.test\0library-a")).toBe(false);
  await Promise.all([reopened.close(), again.close()]);
});
it("durably revokes logout and rejects rotated keys, other Libraries and expired credentials", async () => {
  const test = await fixture();
  const sessions = await test.open();
  const cookie =
    sessions.login("fixture-access-key", "https://circe.test\0library-a") ?? "";
  await sessions.flush();
  const rotated = await test.open("replacement-key");
  expect(rotated.valid(cookie, "https://circe.test\0library-a")).toBe(false);
  await rotated.close();
  await sessions.close();
  const original = await test.open();
  expect(original.valid(cookie, "https://circe.test\0library-b")).toBe(false);
  await original.flush();
  const another =
    original.login("fixture-access-key", "https://circe.test\0library-a") ?? "";
  await original.flush();
  original.revoke(another);
  await original.flush();
  await original.close();
  const loggedOut = await test.open();
  expect(loggedOut.valid(another, "https://circe.test\0library-a")).toBe(false);
  const expiring = loggedOut.login("fixture-access-key", "scope") ?? "";
  await loggedOut.flush();
  await loggedOut.close();
  test.expire();
  const expired = await test.open();
  expect(expired.valid(expiring, "scope")).toBe(false);
  await expired.close();
});

it.skipIf(process.platform === "win32")(
  "fails closed for a session file accessible by another OS user",
  async () => {
    const test = await fixture();
    const sessions = await test.open();
    const cookie = sessions.login("fixture-access-key", "scope") ?? "";
    await sessions.flush();
    await sessions.close();
    await chmod(test.path, 0o666);
    const reopened = await test.open();
    expect(reopened.valid(cookie, "scope")).toBe(false);
    expect(test.warnings).toHaveLength(1);
    await reopened.close();
  },
);
