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
  const sessions = new Map<
    string,
    { expiry: number; scope: string; listeners: Set<() => void> }
  >();
  const digest = (value: string) => createHash("sha256").update(value).digest();
  function revoke(id: string | undefined) {
    const session = sessions.get(id ?? "");
    sessions.delete(id ?? "");
    for (const listener of session?.listeners ?? []) listener();
  }
  return {
    login(presented: string, scope = ""): string | null {
      if (!timingSafeEqual(digest(key), digest(presented))) return null;
      for (const [id, session] of sessions)
        if (session.expiry <= now()) revoke(id);
      if (sessions.size >= 100) revoke(sessions.keys().next().value);
      const id = randomBytes(32).toString("base64url");
      sessions.set(id, {
        expiry: now() + 12 * 60 * 60_000,
        scope,
        listeners: new Set(),
      });
      return id;
    },
    valid(id: string | undefined, scope = ""): boolean {
      const session = sessions.get(id ?? "");
      if (!session || session.expiry <= now() || session.scope !== scope) {
        revoke(id);
        return false;
      }
      return true;
    },
    onRevoke(id: string | undefined, listener: () => void) {
      const session = sessions.get(id ?? "");
      session?.listeners.add(listener);
      return () => {
        session?.listeners.delete(listener);
      };
    },
    revoke,
  };
}
