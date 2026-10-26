import { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { afterEach, describe, expect, it } from "vitest";
import type { WireSyncAction } from "../../shared/wire";
import { createWebApp, type WebHost } from "./app";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanups.splice(0)) await close();
});

async function host() {
  const listeners = new Set<(event: WireSyncAction) => void>();
  const calls: string[] = [];
  const config: WebHost = {
    origin: "",
    key: "test-only-access-key",
    assets: "/nonexistent",
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
    fetch(`${config.origin}${path}`, init);
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
  it("requires authentication for queries, media and events", async () => {
    const test = await host();
    for (const path of [
      "/web/session",
      "/web/events",
      "/web/media/save/photo.png",
    ])
      expect((await test.request(path)).status).toBe(401);
    expect((await test.request("/web/query", { method: "POST" })).status).toBe(
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
  });
  it("allows only the explicit catalog and never credentials or native paths", async () => {
    const test = await host();
    const cookie = await test.login();
    for (const name of [
      "settings.ingestToken",
      "agent.saveKey",
      "saves.createManual",
      "library.switchTo",
      "saves.filePath",
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
  it("opens an authenticated event stream and cleans up on disconnect", async () => {
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
      actorReason: "pipeline:finalize",
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
    controller.abort();
    await reader?.cancel().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(test.listeners.size).toBe(0);
  });
});
