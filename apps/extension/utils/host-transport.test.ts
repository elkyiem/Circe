import type { ExtensionConnection } from "@pond/schema/extension-connection";
import type { NativeRequest } from "@pond/schema/native";
import { describe, expect, it } from "vitest";
import { createHostTransport } from "./host-transport";

const connection: ExtensionConnection = {
  origin: "https://iris.test",
  token: "t".repeat(43),
  libraryId: "library-a",
  name: "Fixture Library",
  expiresAt: Date.now() + 60000,
};
function fixture({
  remote = connection,
  status = 200,
  fail = false,
}: {
  remote?: ExtensionConnection | null;
  status?: number;
  fail?: boolean;
} = {}) {
  const native: NativeRequest[] = [];
  const requests: { url: string; init?: RequestInit }[] = [];
  const transport = createHostTransport({
    extension: "chrome-extension://fixture",
    read: async () => remote,
    native: async (input) => {
      native.push(input);
      return { ok: true, data: "native" };
    },
    fetch: async (url, init) => {
      requests.push({ url: String(url), init });
      if (fail) throw new TypeError("Network failed");
      return Response.json(
        String(url).endsWith("/pair")
          ? connection
          : { ok: true, data: "remote" },
        { status },
      );
    },
  });
  return { transport, native, requests };
}

describe("extension host transport", () => {
  it("does not route to native Pond when stored Circé credentials cannot be read", async () => {
    const native: NativeRequest[] = [];
    const transport = createHostTransport({
      extension: "chrome-extension://fixture",
      read: async () => {
        throw new Error("Unreadable connection");
      },
      native: async (input) => {
        native.push(input);
        return { ok: true, data: null };
      },
      fetch,
    });
    expect(await transport.call({ type: "hello" })).toEqual({
      ok: false,
      error: "iris_auth_required",
    });
    expect(native).toEqual([]);
  });
  it("keeps the native desktop path when unpaired", async () => {
    const test = fixture({ remote: null });
    expect(await test.transport.call({ type: "hello" })).toEqual({
      ok: true,
      data: "native",
    });
    expect(test.native).toEqual([{ type: "hello" }]);
    expect(test.requests).toEqual([]);
  });
  it("serializes the existing message with a scoped bearer header and no browser cookies", async () => {
    const test = fixture();
    expect(await test.transport.call({ type: "session.pending" })).toEqual({
      ok: true,
      data: "remote",
    });
    const call = test.requests[0];
    expect(call?.url).toBe("https://iris.test/extension/request");
    expect(call?.url).not.toContain(connection.token);
    expect(call?.init).toMatchObject({
      credentials: "omit",
      redirect: "error",
      body: JSON.stringify({ type: "session.pending" }),
      headers: {
        authorization: `Bearer ${connection.token}`,
        "x-iris-library": "library-a",
      },
    });
    expect(test.native).toEqual([]);
  });
  it.each([401, 409])(
    "reports HTTP %s without silently saving to local Pond",
    async (status) => {
      const test = fixture({ status });
      expect(await test.transport.call({ type: "library.info" })).toEqual({
        ok: false,
        error: status === 401 ? "iris_auth_required" : "iris_library_changed",
      });
      expect(test.native).toEqual([]);
    },
  );
  it("reports disconnection and expiry without a native fallback", async () => {
    const disconnected = fixture({ fail: true });
    expect(await disconnected.transport.call({ type: "hello" })).toEqual({
      ok: false,
      error: "iris_offline",
    });
    const expired = fixture({ remote: { ...connection, expiresAt: 0 } });
    expect(await expired.transport.call({ type: "hello" })).toEqual({
      ok: false,
      error: "iris_auth_required",
    });
    expect(expired.requests).toEqual([]);
    expect(disconnected.native).toEqual([]);
  });
  it("rejects insecure remote origins before sending the bootstrap key", async () => {
    const test = fixture();
    for (const origin of [
      "http://remote.test",
      "https://user:password@iris.test",
      "https://iris.test/path",
      "https://iris.test/?token=secret",
    ])
      await expect(
        test.transport.pair(origin, "fixture-key", "fixture"),
      ).rejects.toThrow();
    expect(test.requests).toEqual([]);
    expect(
      await test.transport.pair(connection.origin, "fixture-key", "fixture"),
    ).toEqual(connection);
    expect(test.requests[0]?.url).not.toContain("fixture-key");
  });
});
