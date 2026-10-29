import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import { afterEach, expect, it } from "vitest";
import {
  REPLAY_WORKER_POLICY,
  ReplayPinSchema,
  type WebReplayTicket,
  WebReplayTicketSchema,
} from "../../shared/web-replay-contracts";
import { libraryAccess } from "../core/library-access";
import { createWebSessions } from "./auth";
import { createReplayCache } from "./replay-cache";
import { createReplayHost, type ReplayScope } from "./replay-host";

type Dependencies = Parameters<typeof createReplayHost>[0];
const cleanups: Array<() => Promise<void>> = [];
const parentOrigin = "https://circe.test";
const hostKey = "FAKE_PRIVATE_HOST_ACCESS_KEY_CANARY";
const parentCookie = "FAKE_PRIVATE_PARENT_COOKIE_CANARY";
const assets = {
  ui: "/* fixture replay UI */",
  worker: "/* fixture policy worker */",
  bootstrap: "/* fixture replay bootstrap */",
  workerAsset: "/assets/replay-worker-fixture.js",
  bootstrapAsset: "/assets/replay-bootstrap-fixture.js",
};

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  // This also detects an accidentally unconsumed libraryResponse body.
  await libraryAccess.transition({
    prepare: async () => {},
    operation: async () => {},
    keepClosed: () => false,
    drainTimeoutMs: 500,
  });
});

async function fixture(bytes = Buffer.from("PRIVATE SANITIZED DERIVATIVE")) {
  const root = await mkdtemp(join(tmpdir(), "circe-replay-host-"));
  const cache = createReplayCache(root);
  const releases = new Set<() => void>();
  const pending = new Set<Promise<Response | null>>();
  const responses = new Set<Response>();
  const removing = new Set<Promise<void>>();
  const warnings: Error[] = [];
  const directories: string[] = [];
  const preparedSignals: AbortSignal[] = [];
  const allRoutes = new Set(["circe.test", "nono.test"]);
  const owned = new Set<string>();
  const removed: string[] = [];
  let serial = 0;
  let routeCloseCalls = 0;
  let library = "library-a";
  let current = true;
  let clock = 1_000;
  let loadAssets: Dependencies["assets"] = async () => assets;
  let created = async (_directory: string) => {};
  let beforeRemove = async (_directory: string) => {};
  const defaultPrepare: Dependencies["prepare"] = async (input) => {
    input.signal.throwIfAborted();
    preparedSignals.push(input.signal);
    const file = join(input.directory, "source.warc.gz");
    await writeFile(file, bytes, { mode: 0o600, signal: input.signal });
    return {
      file,
      size: bytes.length,
      revision: createHash("sha256").update(input.saveId).digest("hex"),
      pageUrl: input.pageUrl,
      pages: [input.pageUrl],
      current: async () => current,
    };
  };
  let prepare = defaultPrepare;
  const sessions = createWebSessions(hostKey, () => clock);
  const sessionScope = (libraryId = library, origin = parentOrigin) =>
    `${origin}\0${libraryId}`;
  function scope(libraryId = library, origin = parentOrigin): ReplayScope {
    const binding = sessionScope(libraryId, origin);
    const session = sessions.login(hostKey, binding);
    if (!session) throw new Error("Fixture session login failed.");
    return {
      library: libraryId,
      session,
      parentOrigin: origin,
      valid: () => sessions.valid(session, binding),
      onRevoke: (listener) => sessions.onRevoke(session, listener),
    };
  }
  const initialScope = scope();
  const host = createReplayHost({
    cache: {
      async create() {
        const directory = await cache.create();
        directories.push(directory);
        await created(directory);
        return directory;
      },
      async remove(directory) {
        const work = (async () => {
          await beforeRemove(directory);
          await cache.remove(directory);
        })();
        removing.add(work);
        try {
          await work;
        } finally {
          removing.delete(work);
        }
      },
    },
    routes: {
      async register() {
        const hostname = `r-${(++serial).toString(16).padStart(36, "0")}.replay.test`;
        owned.add(hostname);
        allRoutes.add(hostname);
        return hostname;
      },
      remove(hostname) {
        if (!owned.delete(hostname))
          throw new Error("Attempted to remove another route owner.");
        allRoutes.delete(hostname);
        removed.push(hostname);
      },
      close() {
        routeCloseCalls++;
        for (const hostname of owned) {
          allRoutes.delete(hostname);
          removed.push(hostname);
        }
        owned.clear();
      },
    },
    assets: () => loadAssets(),
    prepare: (input) => prepare(input),
    libraryId: () => library,
    warn: (error) => warnings.push(error),
    now: () => clock,
  });
  function gate() {
    const deferred = Promise.withResolvers<void>();
    const release = () => deferred.resolve();
    releases.add(release);
    return { promise: deferred.promise, release };
  }
  async function open(
    saveId = "save-a",
    bound = initialScope,
    signal?: AbortSignal,
  ) {
    return WebReplayTicketSchema.parse(
      await host.request(
        {
          action: "open",
          saveId,
          pageUrl: "https://saved.test/index.html",
          workerAsset: assets.workerAsset,
          bootstrapAsset: assets.bootstrapAsset,
        },
        bound,
        signal,
      ),
    );
  }
  async function request(
    ticket: WebReplayTicket,
    path = "/viewer",
    init: RequestInit = {},
  ) {
    const call = host.handle(
      new Request(ticket.origin + path, {
        ...init,
        headers: { host: new URL(ticket.origin).host, ...init.headers },
      }),
    );
    pending.add(call);
    const response = await call;
    pending.delete(call);
    if (response) responses.add(response);
    return response;
  }
  async function read(response: Response | null) {
    if (!response) throw new Error("Expected a replay response.");
    try {
      return {
        status: response.status,
        headers: response.headers,
        bytes: Buffer.from(await response.arrayBuffer()),
      };
    } finally {
      responses.delete(response);
    }
  }
  async function pin(ticket: WebReplayTicket) {
    const response = await read(await request(ticket, "/bootstrap.js"));
    const prefix = response.bytes.toString().split("\n", 1)[0];
    if (!prefix?.startsWith("globalThis.__CIRCE_REPLAY_PIN="))
      throw new Error("Expected the archive-only bootstrap pin prefix.");
    const value = prefix.slice("globalThis.__CIRCE_REPLAY_PIN=".length, -1);
    return ReplayPinSchema.parse(JSON.parse(value));
  }
  cleanups.push(async () => {
    for (const release of releases) release();
    await Promise.allSettled(pending);
    for (const response of responses)
      if (response.body && !response.body.locked)
        await response.body.cancel().catch(() => {});
    await host.close();
    await Promise.allSettled(removing);
    await rm(root, { recursive: true, force: true });
  });
  return {
    host,
    root,
    bytes,
    scope: initialScope,
    sessions,
    directories,
    preparedSignals,
    warnings,
    allRoutes,
    removed,
    open,
    request,
    read,
    pin,
    gate,
    foreignScope: scope,
    routeCloseCalls: () => routeCloseCalls,
    setLibrary(value: string) {
      library = value;
    },
    setCurrent(value: boolean) {
      current = value;
    },
    advance(milliseconds: number) {
      clock += milliseconds;
    },
    setAssets(value: Dependencies["assets"]) {
      loadAssets = value;
    },
    setPrepare(value: Dependencies["prepare"]) {
      prepare = value;
    },
    defaultPrepare,
    afterCreate(value: typeof created) {
      created = value;
    },
    beforeRemove(value: typeof beforeRemove) {
      beforeRemove = value;
    },
  };
}

it("dispatches only an exact owned Host and fences methods, origins and paths", async () => {
  const test = await fixture();
  const ticket = await test.open();
  for (const host of [
    "circe.test",
    "nono.test",
    `${new URL(ticket.origin).host}.attacker.test`,
    `${new URL(ticket.origin).host}:444`,
  ]) {
    expect(
      await test.host.handle(new Request(ticket.url, { headers: { host } })),
    ).toBeNull();
  }
  expect(
    (await test.read(await test.request(ticket, "/viewer", { method: "POST" })))
      .status,
  ).toBe(405);
  expect(
    (
      await test.read(
        await test.request(ticket, "/viewer", {
          headers: { origin: parentOrigin },
        }),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await test.read(
        await test.request(ticket, "/viewer", { headers: { origin: "null" } }),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await test.read(
        await test.request(ticket, "/viewer", {
          headers: { origin: ticket.origin },
        }),
      )
    ).status,
  ).toBe(200);
  for (const path of [
    "/web/session",
    "/web/capabilities",
    "/archive/other.warc.gz",
    "/viewer?source=https://attacker.test/",
  ])
    expect((await test.read(await test.request(ticket, path))).status).toBe(
      404,
    );
});

it("serves only the canonical worker URL with its own global CSP and no parent authority", async () => {
  const test = await fixture();
  const ticket = await test.open();
  for (const path of [
    "/viewer",
    "/ui.js",
    "/replay/ui.js",
    "/bootstrap.js",
    "/replay/index.html",
    "/replay/sw.js?serveIndex=1",
  ]) {
    const response = await test.read(
      await test.request(ticket, path, {
        headers: { cookie: `iris_session=${parentCookie}` },
      }),
    );
    expect(response.status).toBe(200);
    const text = response.bytes.toString();
    expect(text.includes(hostKey)).toBe(false);
    expect(text.includes(parentCookie)).toBe(false);
    expect(text.includes(test.scope.session)).toBe(false);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    if (path.includes("sw.js")) {
      expect(response.headers.get("content-security-policy")).toBe(
        REPLAY_WORKER_POLICY,
      );
      expect(response.headers.get("service-worker-allowed")).toBe("/replay/");
    } else
      expect(
        response.headers
          .get("content-security-policy")
          ?.includes("connect-src 'self' data: blob:"),
      ).toBe(true);
  }
  for (const query of [
    "",
    "?serveIndex=1&allowProxyPassthrough=1",
    "?injectScripts=https://attacker.test/script.js",
    "?serveIndex=01",
  ])
    expect(
      (await test.read(await test.request(ticket, `/replay/sw.js${query}`)))
        .status,
    ).toBe(403);
});

it("requires the exact source Bearer for GET, HEAD and byte ranges across distinct Save grants", async () => {
  const test = await fixture();
  const first = await test.open("save-a");
  const second = await test.open("save-b");
  const firstPin = await test.pin(first);
  const secondPin = await test.pin(second);
  for (const method of ["GET", "HEAD"]) {
    for (const authorization of ["", "Bearer invalid", secondPin.authorization])
      expect(
        (
          await test.read(
            await test.request(first, "/archive/source.warc.gz", {
              method,
              headers: { authorization },
            }),
          )
        ).status,
      ).toBe(403);
    const response = await test.read(
      await test.request(first, "/archive/source.warc.gz", {
        method,
        headers: { authorization: firstPin.authorization },
      }),
    );
    expect(response.status).toBe(200);
    expect(
      response.bytes.equals(method === "HEAD" ? Buffer.alloc(0) : test.bytes),
    ).toBe(true);
    expect(Number(response.headers.get("content-length"))).toBe(
      test.bytes.length,
    );
  }
  const partial = await test.read(
    await test.request(first, "/archive/source.warc.gz", {
      headers: { authorization: firstPin.authorization, range: "bytes=3-8" },
    }),
  );
  expect(partial.status).toBe(206);
  expect(partial.bytes.equals(test.bytes.subarray(3, 9))).toBe(true);
  expect(partial.headers.get("content-range")).toBe(
    `bytes 3-8/${test.bytes.length}`,
  );
  const invalid = await test.read(
    await test.request(first, "/archive/source.warc.gz", {
      headers: {
        authorization: firstPin.authorization,
        range: `bytes=${test.bytes.length}-`,
      },
    }),
  );
  expect(invalid.status).toBe(416);
  expect(invalid.headers.get("content-range")).toBe(
    `bytes */${test.bytes.length}`,
  );
  expect(
    (
      await test.read(
        await test.request(first, "/archive/source.warc.gz?raw=1", {
          headers: { authorization: firstPin.authorization },
        }),
      )
    ).status,
  ).toBe(403);
});

it("permits same-session repeated close while denying a foreign session, Library or parent origin", async () => {
  const test = await fixture();
  const ticket = await test.open();
  for (const scope of [
    test.foreignScope(),
    { ...test.scope, library: "foreign-library" },
    { ...test.scope, parentOrigin: "https://foreign.test" },
  ])
    await expect(
      test.host.request({ action: "close", id: ticket.id }, scope),
    ).rejects.toMatchObject({ status: 403 });
  expect((await test.read(await test.request(ticket))).status).toBe(200);
  await expect(
    test.host.request({ action: "close", id: ticket.id }, test.scope),
  ).resolves.toEqual({ ok: true });
  await expect(
    test.host.request({ action: "close", id: ticket.id }, test.scope),
  ).resolves.toEqual({ ok: true });
  expect(await test.request(ticket)).toBeNull();
  expect([...test.allRoutes]).toEqual(["circe.test", "nono.test"]);
  expect(test.removed).toHaveLength(1);
  expect(await readdir(test.root)).toEqual([]);
});

it.each(["Library", "revision"])(
  "denies every fresh replay path after its %s changes",
  async (change) => {
    const test = await fixture();
    const cases = [];
    for (const path of [
      "/viewer",
      "/bootstrap.js",
      "/ui.js",
      "/replay/index.html",
      "/replay/sw.js?serveIndex=1",
      "/archive/source.warc.gz",
    ]) {
      const ticket = await test.open();
      cases.push({ path, ticket, pin: await test.pin(ticket) });
    }
    if (change === "Library") test.setLibrary("library-b");
    else test.setCurrent(false);
    for (const item of cases) {
      const response = await test.request(item.ticket, item.path, {
        headers: { authorization: item.pin.authorization },
      });
      if (response) expect((await test.read(response)).status).not.toBe(200);
    }
  },
);

it("expires inactive grants and rejects an expired parent session on the next public request", async () => {
  const test = await fixture();
  const ticket = await test.open();
  test.advance(30 * 60_000 + 1);
  expect((await test.read(await test.request(ticket))).status).toBe(403);
  const fresh = await test.open();
  test.advance(12 * 60 * 60_000 + 1);
  expect((await test.read(await test.request(fresh))).status).toBe(403);
  await expect(test.open()).rejects.toThrow("Reload Circé");
});

it("aborts an active source read, deletes the private derivative and releases its Library lease on session revocation", async () => {
  const test = await fixture(Buffer.alloc(4 * 1024 * 1024, 83));
  const ticket = await test.open();
  const pin = await test.pin(ticket);
  const response = await test.request(ticket, "/archive/source.warc.gz", {
    headers: { authorization: pin.authorization },
  });
  if (!response?.body) throw new Error("Expected the source body.");
  const reader = response.body.getReader();
  try {
    expect((await reader.read()).done).toBe(false);
    test.sessions.revoke(test.scope.session);
    await reader.cancel().catch(() => {});
  } finally {
    reader.releaseLock();
  }
  await test.host.close();
  expect(await readdir(test.root)).toEqual([]);
  expect([...test.allRoutes]).toEqual(["circe.test", "nono.test"]);
});

it("keeps delayed public asset work inside the Library lease and rechecks session validity after loading", async () => {
  const test = await fixture();
  const ticket = await test.open();
  const waiting = test.gate();
  const entered = test.gate();
  test.setAssets(async () => {
    entered.release();
    await waiting.promise;
    return assets;
  });
  const response = test.request(ticket, "/bootstrap.js");
  await entered.promise;
  let changed = false;
  const transition = libraryAccess.transition({
    prepare: async () => {},
    operation: async () => {
      changed = true;
    },
    keepClosed: () => false,
    drainTimeoutMs: 500,
  });
  await setImmediate();
  expect(changed).toBe(false);
  test.sessions.revoke(test.scope.session);
  waiting.release();
  expect((await test.read(await response)).status).toBe(403);
  await transition;
  expect(changed).toBe(true);
});

it.each(["assets", "cache"])(
  "cancels an opening session during delayed %s without publishing a route or private cache",
  async (phase) => {
    const test = await fixture();
    const waiting = test.gate();
    const entered = test.gate();
    if (phase === "assets")
      test.setAssets(async () => {
        entered.release();
        await waiting.promise;
        return assets;
      });
    else
      test.afterCreate(async () => {
        entered.release();
        await waiting.promise;
      });
    const opening = test.open();
    const rejected = expect(opening).rejects.toThrow();
    await entered.promise;
    test.sessions.revoke(test.scope.session);
    waiting.release();
    await rejected;
    expect(await readdir(test.root)).toEqual([]);
    expect([...test.allRoutes]).toEqual(["circe.test", "nono.test"]);
  },
);

it("drains a cancelled opening preparation before closing its route registry", async () => {
  const test = await fixture();
  const waiting = test.gate();
  const entered = test.gate();
  const signals: AbortSignal[] = [];
  test.setPrepare(async (input) => {
    signals.push(input.signal);
    entered.release();
    await waiting.promise;
    return test.defaultPrepare(input);
  });
  const opening = test.open();
  const rejected = expect(opening).rejects.toThrow();
  await entered.promise;
  const closing = test.host.close();
  expect(signals[0]?.aborted).toBe(true);
  expect(test.routeCloseCalls()).toBe(0);
  waiting.release();
  await rejected;
  await closing;
  expect(test.routeCloseCalls()).toBe(1);
  expect(await readdir(test.root)).toEqual([]);
  await expect(test.open()).rejects.toThrow("Reload Circé");
});

it("rejects an already-aborted HTTP open before preparing private data or registering a route", async () => {
  const test = await fixture();
  const request = new AbortController();
  request.abort();
  let prepared = false;
  test.setPrepare(async (input) => {
    prepared = true;
    return test.defaultPrepare(input);
  });
  await expect(
    test.open("save-a", test.scope, request.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(prepared).toBe(false);
  expect(test.directories).toHaveLength(0);
  expect([...test.allRoutes]).toEqual(["circe.test", "nono.test"]);
  expect(test.scope.valid()).toBe(true);
});

it("aborts an HTTP opening during preparation and removes its partial private derivative", async () => {
  const test = await fixture();
  const waiting = test.gate();
  const entered = test.gate();
  const request = new AbortController();
  const signals: AbortSignal[] = [];
  test.setPrepare(async (input) => {
    signals.push(input.signal);
    await writeFile(
      join(input.directory, "source.warc.gz"),
      "partial private derivative",
      { mode: 0o600 },
    );
    entered.release();
    await waiting.promise;
    input.signal.throwIfAborted();
    return test.defaultPrepare(input);
  });
  const opening = test.open("save-a", test.scope, request.signal);
  const rejected = expect(opening).rejects.toMatchObject({
    name: "AbortError",
  });
  await entered.promise;
  const directory = test.directories[0];
  if (!directory) throw new Error("Expected the opening private cache.");
  expect((await stat(join(directory, "source.warc.gz"))).isFile()).toBe(true);
  request.abort();
  expect(signals[0]?.aborted).toBe(true);
  waiting.release();
  await rejected;
  expect(await readdir(test.root)).toEqual([]);
  expect([...test.allRoutes]).toEqual(["circe.test", "nono.test"]);
  // Cancelling one HTTP operation does not sign the user's browser out.
  expect(test.scope.valid()).toBe(true);
  const replacement = await test.open();
  expect((await test.read(await test.request(replacement))).status).toBe(200);
});

it("detaches HTTP opening cancellation once its completed replay grant has been returned", async () => {
  const test = await fixture();
  const request = new AbortController();
  const ticket = await test.open("save-a", test.scope, request.signal);
  const pin = await test.pin(ticket);
  request.abort();
  expect((await test.read(await test.request(ticket))).status).toBe(200);
  const original = await test.read(
    await test.request(ticket, "/archive/source.warc.gz", {
      headers: { authorization: pin.authorization },
    }),
  );
  expect(original.status).toBe(200);
  expect(original.bytes.equals(test.bytes)).toBe(true);
  expect(test.removed).toHaveLength(0);
  test.sessions.revoke(test.scope.session);
  await test.host.close();
  expect(await readdir(test.root)).toEqual([]);
});

it("awaits cache cleanup already started by session revocation before host shutdown completes", async () => {
  const test = await fixture();
  await test.open();
  const waiting = test.gate();
  const entered = test.gate();
  test.beforeRemove(async () => {
    entered.release();
    await waiting.promise;
  });
  test.sessions.revoke(test.scope.session);
  await entered.promise;
  let stopped = false;
  const closing = test.host.close().then(() => {
    stopped = true;
  });
  try {
    await setImmediate();
    expect(stopped).toBe(false);
  } finally {
    waiting.release();
    await closing;
  }
  expect(await readdir(test.root)).toEqual([]);
});

it("does not return a repeated ticket close before its first cleanup has drained", async () => {
  const test = await fixture();
  const ticket = await test.open();
  const waiting = test.gate();
  const entered = test.gate();
  test.beforeRemove(async () => {
    entered.release();
    await waiting.promise;
  });
  const first = test.host.request(
    { action: "close", id: ticket.id },
    test.scope,
  );
  await entered.promise;
  let repeatedDone = false;
  const repeated = test.host
    .request({ action: "close", id: ticket.id }, test.scope)
    .then(() => {
      repeatedDone = true;
    });
  try {
    await setImmediate();
    expect(repeatedDone).toBe(false);
  } finally {
    waiting.release();
    await Promise.all([first, repeated]);
  }
  expect(await readdir(test.root)).toEqual([]);
});

it("rejects a stale renderer asset fingerprint before creating private state", async () => {
  const test = await fixture();
  await expect(
    test.host.request(
      {
        action: "open",
        saveId: "save-a",
        pageUrl: "https://saved.test/",
        workerAsset: "/assets/replay-worker-stale.js",
      },
      test.scope,
    ),
  ).rejects.toThrow("older archive viewer");
  expect(test.directories).toHaveLength(0);
  expect([...test.allRoutes]).toEqual(["circe.test", "nono.test"]);
});

it("removes only owned cache directories and closes the registry once", async () => {
  const test = await fixture();
  const unrelated = join(test.root, "unrelated.txt");
  await writeFile(unrelated, "unrelated cache owner");
  await test.open("save-a");
  await test.open("save-b");
  const first = test.host.close();
  expect(test.host.close()).toBe(first);
  await first;
  expect((await stat(unrelated)).isFile()).toBe(true);
  expect(await readdir(test.root)).toEqual(["unrelated.txt"]);
  expect([...test.allRoutes]).toEqual(["circe.test", "nono.test"]);
  expect(test.routeCloseCalls()).toBe(1);
});
