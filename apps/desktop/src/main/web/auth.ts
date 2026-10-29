import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { lstat, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function readPrivateWebState(path: string, maxBytes: number) {
  const file = await lstat(path);
  if (
    !file.isFile() ||
    file.isSymbolicLink() ||
    file.size > maxBytes ||
    (process.platform !== "win32" &&
      ((file.mode & 0o077) !== 0 || file.uid !== process.getuid?.()))
  )
    throw new Error(
      "Private browser state must be a private file owned by this user.",
    );
  return readFile(path, "utf8");
}

export async function webAccessKey(sandbox: string): Promise<string> {
  const path = join(sandbox, "web-access-key");
  try {
    return (await readPrivateWebState(path, 256)).trim();
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

export interface SavedWebSession {
  idHash: string;
  expiry: number;
  scope: string;
}
export function createWebSessions(
  key: string,
  now: () => number = Date.now,
  storage?: {
    restored: SavedWebSession[];
    persist(rows: SavedWebSession[]): Promise<void>;
    warn(cause: unknown): void;
  },
) {
  const hash = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  const sessions = new Map<
    string,
    { expiry: number; scope: string; listeners: Set<() => void> }
  >();
  for (const row of storage?.restored ?? [])
    if (row.expiry > now())
      sessions.set(row.idHash, {
        expiry: row.expiry,
        scope: row.scope,
        listeners: new Set(),
      });
  let writes = Promise.resolve();
  let closed = false;
  function changed() {
    if (!storage || closed) return;
    const rows = [...sessions].map(([idHash, session]) => ({
      idHash,
      expiry: session.expiry,
      scope: session.scope,
    }));
    writes = writes.catch(() => {}).then(() => storage.persist(rows));
    void writes.catch(storage.warn);
  }
  function revokeHash(id: string) {
    const session = sessions.get(id);
    if (!session) return;
    sessions.delete(id);
    changed();
    for (const listener of session.listeners) listener();
  }
  return {
    isClosed: () => closed,
    login(presented: string, scope = ""): string | null {
      if (closed) throw new Error("The host is restarting. Try again shortly.");
      if (
        !timingSafeEqual(
          Buffer.from(hash(key), "hex"),
          Buffer.from(hash(presented), "hex"),
        )
      )
        return null;
      for (const [id, session] of sessions)
        if (session.expiry <= now()) revokeHash(id);
      if (sessions.size >= 100) {
        const first = sessions.keys().next().value;
        if (first) revokeHash(first);
      }
      const id = randomBytes(32).toString("base64url");
      sessions.set(hash(id), {
        expiry: now() + 12 * 60 * 60_000,
        scope,
        listeners: new Set(),
      });
      changed();
      return id;
    },
    valid(id: string | undefined, scope = ""): boolean {
      if (closed) return false;
      const idHash = hash(id ?? "");
      const session = sessions.get(idHash);
      if (!session || session.expiry <= now() || session.scope !== scope) {
        revokeHash(idHash);
        return false;
      }
      return true;
    },
    onRevoke(id: string | undefined, listener: () => void) {
      const session = sessions.get(hash(id ?? ""));
      session?.listeners.add(listener);
      return () => {
        session?.listeners.delete(listener);
      };
    },
    revoke(id: string | undefined) {
      if (closed) throw new Error("The host is restarting. Try again shortly.");
      const idHash = hash(id ?? "");
      if (sessions.has(idHash)) revokeHash(idHash);
      else changed();
    },
    flush: () => writes,
    async close() {
      closed = true;
      for (const session of sessions.values()) {
        for (const listener of session.listeners) listener();
        session.listeners.clear();
      }
      await writes;
    },
  };
}
