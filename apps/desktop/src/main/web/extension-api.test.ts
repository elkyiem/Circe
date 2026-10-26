import { mkdtemp, rm } from "node:fs/promises";
import { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { IRIS_EXTENSION_ID } from "@pond/schema/extension-connection";
import type { NativeRequest } from "@pond/schema/native";
import { afterEach, describe, expect, it } from "vitest";
import { createWebApp, type WebHost } from "./app";
import { openExtensionAuth } from "./extension-auth";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
const extension = `chrome-extension://${IRIS_EXTENSION_ID}`;
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "iris-extension-api-"));
  const auth = await openExtensionAuth({
    path: join(directory, "pairs.json"),
    key: "test-key",
  });
  let library = "library-a";
  const calls: NativeRequest[] = [];
  const config: WebHost = {
    origin: "",
    key: "test-key",
    assets: "/missing",
    libraryId: () => library,
    query: async () => Response.json({}),
    media: async () => new Response("private"),
    subscribe: () => () => {},
    extension: {
      auth,
      libraryId: () => library,
      libraryName: () => "Test Library",
      dispatch: async (input) => {
        calls.push(input);
        return { ok: true, data: input.type };
      },
    },
  };
  const app = createWebApp(config);
  const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 });
  await new Promise<void>((resolve) => server.once("listening", resolve));
  /** SAFETY: the listening TCP server has an AddressInfo address. */
  config.origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  cleanups.push(async () => {
    if (server instanceof Server) server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  const request = (path: string, init: RequestInit = {}) =>
    fetch(`${config.origin}${path}`, init);
  const pair = async () => {
    const response = await request("/extension/pair", {
      method: "POST",
      headers: {
        origin: extension,
        "x-iris-extension": extension,
        "content-type": "application/json",
      },
      body: JSON.stringify({ key: "test-key", name: "Chrome fixture" }),
    });
    expect(response.status).toBe(200);
    const body: { token: string } = await response.json();
    return {
      origin: extension,
      "x-iris-extension": extension,
      "x-iris-library": "library-a",
      authorization: `Bearer ${body.token}`,
      "content-type": "application/json",
    };
  };
  return {
    config,
    request,
    pair,
    calls,
    auth,
    switchLibrary: () => {
      library = "library-b";
    },
  };
}

describe("remote extension boundary", () => {
  it("allows a pinned extension preflight and rejects ordinary websites and unknown extensions", async () => {
    const test = await fixture();
    const accepted = await test.request("/extension/request", {
      method: "OPTIONS",
      headers: {
        origin: extension,
        "access-control-request-headers":
          "authorization,x-iris-extension,x-iris-library",
      },
    });
    expect(accepted.status).toBe(204);
    expect(accepted.headers.get("access-control-allow-origin")).toBe(extension);
    expect(accepted.headers.has("access-control-allow-credentials")).toBe(
      false,
    );
    for (const origin of [
      "https://attacker.test",
      "chrome-extension://unknown",
      test.config.origin,
    ]) {
      const denied = await test.request("/extension/request", {
        method: "POST",
        headers: { origin, "x-iris-extension": extension },
        body: "{}",
      });
      expect(denied.status).toBe(403);
      expect(denied.headers.has("access-control-allow-origin")).toBe(false);
    }
  });
  it("requires pairing for every request and never authorizes browser/media routes with an extension token", async () => {
    const test = await fixture();
    const headers = await test.pair();
    const body = JSON.stringify({ type: "library.info" });
    expect(
      (
        await test.request("/extension/request", {
          method: "POST",
          headers: { origin: extension, "x-iris-extension": extension },
          body,
        })
      ).status,
    ).toBe(401);
    const accepted = await test.request("/extension/request", {
      method: "POST",
      headers,
      body,
    });
    expect(await accepted.json()).toEqual({ ok: true, data: "library.info" });
    expect(test.calls).toHaveLength(1);
    for (const path of [
      "/web/session",
      "/web/media/save/photo.png",
      "/web/events",
    ])
      expect((await test.request(path, { headers })).status).toBe(403);
    test.switchLibrary();
    expect(
      (
        await test.request("/extension/request", {
          method: "POST",
          headers,
          body,
        })
      ).status,
    ).toBe(409);
    expect(
      (await test.request("/extension/pair", { method: "DELETE", headers }))
        .status,
    ).toBe(200);
    expect(test.auth.list("library-a")).toEqual([]);
  });
  it("rejects unlisted operations, host file capture, oversized bodies and revoked credentials", async () => {
    const test = await fixture();
    const headers = await test.pair();
    for (const [body, status] of [
      [{ type: "enqueue", url: "https://example.com" }, 403],
      [
        {
          type: "capture.accept",
          draft: {
            id: "test",
            items: [{ kind: "file", path: "/private/secret" }],
          },
        },
        422,
      ],
      [{ type: "prefs.get" }, 422],
    ] as const)
      expect(
        (
          await test.request("/extension/request", {
            method: "POST",
            headers,
            body: JSON.stringify(body),
          })
        ).status,
      ).toBe(status);
    expect(
      (
        await test.request("/extension/request", {
          method: "POST",
          headers,
          body: "x".repeat(8 * 1024 * 1024 + 1),
        })
      ).status,
    ).toBe(413);
    expect(test.calls).toEqual([]);
    expect(
      (await test.request("/extension/pair", { method: "DELETE", headers }))
        .status,
    ).toBe(200);
    expect(
      (
        await test.request("/extension/request", {
          method: "POST",
          headers,
          body: JSON.stringify({ type: "hello" }),
        })
      ).status,
    ).toBe(401);
  });
  it("rate limits incorrect access keys", async () => {
    const test = await fixture();
    for (let attempt = 0; attempt < 11; attempt++) {
      const response = await test.request("/extension/pair", {
        method: "POST",
        headers: {
          origin: extension,
          "x-iris-extension": extension,
          "content-type": "application/json",
        },
        body: JSON.stringify({ key: "wrong", name: "fixture" }),
      });
      expect(response.status).toBe(attempt < 10 ? 401 : 429);
    }
    expect(test.auth.list("library-a")).toEqual([]);
  });
});
