import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function webAccessKey(sandbox: string): Promise<string> {
  const path = join(sandbox, "web-access-key");
  try {
    return (await readFile(path, "utf8")).trim();
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ENOENT"
    )
      throw error;
    const key = randomBytes(32).toString("base64url");
    await writeFile(path, key, { mode: 0o600, flag: "wx" });
    return key;
  }
}

export function createWebSessions(key: string, now: () => number = Date.now) {
  const sessions = new Map<string, number>();
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return {
    login(presented: string): string | null {
      if (!timingSafeEqual(digest(key), digest(presented))) return null;
      for (const [id, expiry] of sessions)
        if (expiry <= now()) sessions.delete(id);
      if (sessions.size >= 100)
        sessions.delete(sessions.keys().next().value ?? "");
      const id = randomBytes(32).toString("base64url");
      sessions.set(id, now() + 12 * 60 * 60_000);
      return id;
    },
    valid(id: string | undefined): boolean {
      return (sessions.get(id ?? "") ?? 0) > now();
    },
    revoke(id: string | undefined): void {
      sessions.delete(id ?? "");
    },
  };
}
