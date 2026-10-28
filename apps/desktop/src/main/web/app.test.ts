import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { afterEach, describe, expect, it } from "vitest";
import type { WireSyncAction } from "../../shared/wire";
import { createWebApp, type WebHost } from "./app";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanups.splice(0)) await close();
});

async function host(assets = "/nonexistent") {
  const listeners = new Set<(event: WireSyncAction) => void>();
  const calls: string[] = [];
  const config: WebHost = {
    origin: "",
    key: "test-only-access-key",
    assets,
    libraryId: () => "test-library",
    query: async ({ name }) => {
      calls.push(name);
      return Response.json({ ok: true });
    },
    media: async () => new Response("private media"),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const app = createWebApp(config);
  const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 });
  await new Promise<void>((resolve) => server.once("listening", resolve));
  /** SAFETY: a listening TCP server has an AddressInfo address. */
  const address = server.address() as AddressInfo;
  config.origin = `http://127.0.0.1:${address.port}`;
  cleanups.push(
    () =>
      new Promise((resolve) => {
        if (server instanceof Server) server.closeAllConnections();
        server.close(() => resolve());
      }),
  );
  const request = (path: string, init: RequestInit = {}) =>
    fetch(`${config.origin}${path}`, {
      ...init,
      headers: { "x-iris-library": config.libraryId(), ...init.headers },
    });
  const login = async () => {
    const response = await request("/web/session", {
      method: "POST",
      headers: { origin: config.origin, "content-type": "application/json" },
      body: JSON.stringify({ key: config.key }),
    });
    return response.headers.get("set-cookie")?.split(";")[0] ?? "";
  };
  return { app, config, request, login, calls, listeners };
}

describe("browser host boundary", () => {
  it("requires the current authenticated Library and exact origin for logo operations", async () => {
    const test = await host();
    const seen: string[] = [];
    test.config.files = async (input, library) => {
      seen.push(`${library}:${input.name}`);
      return Response.json({
        ok: true,
        icon: "data:image/png;base64,aWNvbg==",
      });
    };
    const body = JSON.stringify({
      name: "library.identity.pickIcon",
      params: { paths: ["iris-upload:11111111-1111-4111-8111-111111111111"] },
    });
    expect(
      (await test.request("/web/files", { method: "POST", body })).status,
    ).toBe(401);
    const cookie = await test.login();
    for (const [origin, library, status] of [
      ["https://attacker.test", "test-library", 403],
      [test.config.origin, "other-library", 409],
      [test.config.origin, "test-library", 200],
    ] as const) {
      const response = await test.request("/web/files", {
        method: "POST",
        body,
        headers: {
          cookie,
          origin,
          "x-iris-library": library,
          "content-type": "application/json",
        },
      });
      expect(response.status).toBe(status);
    }
    expect(seen).toEqual(["test-library:library.identity.pickIcon"]);
  });
  it("serves the application document for deep links and preserves missing API/asset errors", async () => {
    const directory = await mkdtemp(join(tmpdir(), "iris-web-routes-"));
    cleanups.push(() => rm(directory, { recursive: true, force: true }));
    await writeFile(
      join(directory, "browser.html"),
      "<!doctype html><title>Circé route fixture</title>",
    );
    const test = await host(directory);
    for (const path of [
      "/",
      "/assistant",
      "/save/fixture",
      "/settings/agent-models",
    ])
      expect(await (await test.request(path)).text()).toBe(
        "<!doctype html><title>Circé route fixture</title>",
      );
    expect((await test.request("/assets/missing.js")).status).toBe(404);
    expect((await test.request("/web/missing")).status).toBe(401);
    expect(
      (
        await test.request("/web/missing", {
          headers: { cookie: await test.login() },
        })
      ).status,
    ).toBe(404);
  });
  it("requires authentication for queries, media and events", async () => {
    const test = await host();
    for (const path of [
      "/web/session",
      "/web/events",
      "/web/media/save/photo.png",
      "/web/download/00000000-0000-0000-0000-000000000000",
      "/web/preview/save/missing.mp4",
    ])
      expect((await test.request(path)).status).toBe(401);
    for (const path of [
      "query",
      "files",
      "video",
      "agent",
      "command",
      "transactions",
      "history",
    ])
      expect(
        (await test.request(`/web/${path}`, { method: "POST" })).status,
      ).toBe(401);
    expect((await test.request("/web/upload", { method: "PUT" })).status).toBe(
      401,
    );
  });
  it("sets an HttpOnly strict session and rejects bad credentials", async () => {
    const test = await host();
    const response = await test.request("/web/session", {
      method: "POST",
      headers: {
        origin: test.config.origin,
        "content-type": "application/json",
      },
      body: JSON.stringify({ key: "wrong" }),
    });
    expect(response.status).toBe(401);
    const cookie = await test.login();
    expect(cookie).toMatch(/^iris_session=/);
    expect(
      (await test.request("/web/session", { headers: { cookie } })).status,
    ).toBe(200);
  });
  it("rejects foreign origins, missing mutation origins and DNS rebinding", async () => {
    const test = await host();
    const cookie = await test.login();
    for (const origin of ["https://attacker.test", "null", ""]) {
      const response = await test.request("/web/query", {
        method: "POST",
        headers: { cookie, origin, "content-type": "application/json" },
        body: JSON.stringify({
          name: "folders.create",
          params: { name: "no" },
        }),
      });
      expect(response.status).toBe(403);
    }
    const response = await test.app.request("/web/session", {
      headers: { cookie, host: "attacker.test" },
    });
    expect(response.status).toBe(403);
    expect(test.calls).toEqual([]);
    expect(
      (
        await test.app.request("/web/media/save/image.png", {
          headers: {
            host: new URL(test.config.origin).host,
            cookie,
            "sec-fetch-site": "same-site",
          },
        })
      ).status,
    ).toBe(403);
  });
  it("allows only the explicit catalog and never credentials or native paths", async () => {
    const test = await host();
    const cookie = await test.login();
    for (const name of [
      "settings.ingestToken",
      "agent.readKey",
      "saves.createManual",
      "library.switchTo",
      "saves.filePath",
      "extension.safariStatus",
      "extension.openSafariSettings",
      "extension.openSafari",
      "__proto__",
    ]) {
      const response = await test.request("/web/query", {
        method: "POST",
        headers: {
          cookie,
          origin: test.config.origin,
          "content-type": "application/json",
        },
        body: JSON.stringify({ name }),
      });
      expect(response.status).toBe(422);
    }
    expect(test.calls).toEqual([]);
  });
  it("serves media to a session and revokes access on logout", async () => {
    const test = await host();
    const cookie = await test.login();
    expect(
      await (
        await test.request("/web/media/save/image.png", { headers: { cookie } })
      ).text(),
    ).toBe("private media");
    await test.request("/web/session", {
      method: "DELETE",
      headers: { cookie, origin: test.config.origin },
    });
    expect(
      (await test.request("/web/media/save/image.png", { headers: { cookie } }))
        .status,
    ).toBe(401);
  });
  it("accepts only configured private origins and keeps their sessions separate", async () => {
    const test = await host();
    const remoteOrigin = "https://iris.owner.ts.net:9443";
    test.config.origins = [remoteOrigin];
    const response = await test.app.request(
      `${remoteOrigin}/web/session`,
      {
        method: "POST",
        headers: {
          host: "iris.owner.ts.net:9443",
          origin: remoteOrigin,
          "content-type": "application/json",
        },
        body: JSON.stringify({ key: test.config.key }),
      },
      { incoming: { socket: { remoteAddress: "127.0.0.1" } } },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Secure");
    const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
    expect(
      (
        await test.app.request(`${remoteOrigin}/web/session`, {
          headers: { host: "iris.owner.ts.net:9443", cookie },
        })
      ).status,
    ).toBe(200);
    expect(
      (await test.request("/web/session", { headers: { cookie } })).status,
    ).toBe(401);
    expect(
      (
        await test.app.request("/web/session", {
          method: "POST",
          headers: {
            host: "iris.owner.ts.net:9443",
            origin: test.config.origin,
          },
        })
      ).status,
    ).toBe(403);
  });
  it("revokes an idle event stream immediately on logout", async () => {
    const test = await host();
    const cookie = await test.login();
    const controller = new AbortController();
    const stream = await test.request("/web/events", {
      headers: { cookie },
      signal: controller.signal,
    });
    const reader = stream.body?.getReader();
    await reader?.read();
    expect(test.listeners.size).toBe(1);
    await test.request("/web/session", {
      method: "DELETE",
      headers: { cookie, origin: test.config.origin },
    });
    expect(test.listeners.size).toBe(0);
    controller.abort();
    await reader?.cancel().catch(() => {});
  });
  it("rejects writes for a stale Library before invoking a handler", async () => {
    const test = await host();
    const cookie = await test.login();
    const response = await test.request("/web/query", {
      method: "POST",
      headers: {
        cookie,
        origin: test.config.origin,
        "content-type": "application/json",
        "x-iris-library": "another-library",
      },
      body: JSON.stringify({
        name: "folders.create",
        params: { name: "wrong target" },
      }),
    });
    expect(response.status).toBe(409);
    expect(test.calls).toEqual([]);
  });
  it.each(["pipeline:finalize", "pipeline:refresh-blocked"])(
    "delivers %s over an authenticated event stream and cleans up on disconnect",
    async (actorReason) => {
      const test = await host();
      const cookie = await test.login();
      const controller = new AbortController();
      const response = await test.request("/web/events", {
        headers: { cookie },
        signal: controller.signal,
      });
      const reader = response.body?.getReader();
      const first = await reader?.read();
      expect(new TextDecoder().decode(first?.value)).toContain("event: ready");
      expect(test.listeners.size).toBe(1);
      const action: WireSyncAction = {
        id: 7,
        batchId: null,
        modelName: "save",
        modelId: "fixture",
        action: "U",
        data: { status: "complete" },
        prevData: null,
        actor: "system",
        actorReason,
        createdAt: 1234,
      };
      for (const listener of test.listeners) listener(action);
      let delivered = "";
      while (!delivered.includes("event: sync")) {
        const chunk = await reader?.read();
        if (!chunk || chunk.done) break;
        delivered += new TextDecoder().decode(chunk.value);
      }
      expect(delivered).toContain('"status":"complete"');
      expect(delivered).toContain('"createdAt":1234');
      expect(delivered).toContain(JSON.stringify(actorReason));
      controller.abort();
      await reader?.cancel().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(test.listeners.size).toBe(0);
    },
  );
});
