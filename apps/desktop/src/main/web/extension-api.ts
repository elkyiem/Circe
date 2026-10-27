import { getConnInfo } from "@hono/node-server/conninfo";
import {
  EXTENSION_REQUEST_ACCESS,
  ExtensionOriginSchema,
  ExtensionPairRequestSchema,
} from "@pond/schema/extension-connection";
import {
  type NativeRequest,
  type NativeResponse,
  nativeRequestSchema,
} from "@pond/schema/native";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { ExtensionAuth } from "./extension-auth";

export interface ExtensionHost {
  auth: ExtensionAuth;
  libraryId(): string;
  libraryName(): string;
  dispatch(request: NativeRequest, libraryId: string): Promise<NativeResponse>;
}

/** Extension credentials never authorize the renderer API, files, media, or arbitrary operations. */
export function createExtensionApi(
  host: ExtensionHost,
  origins: () => string[],
) {
  const app = new Hono();
  const failures = new Map<string, { count: number; until: number }>();
  const originFor = (header: string | undefined) =>
    origins().find((origin) => new URL(origin).host === header);
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    const extension =
      c.req.header("x-iris-extension") ?? c.req.header("origin");
    const origin = c.req.header("origin");
    if (
      !originFor(c.req.header("host")) ||
      !ExtensionOriginSchema.safeParse(extension).success ||
      (origin && origin !== extension) ||
      (c.req.method !== "OPTIONS" && !c.req.header("x-iris-extension"))
    )
      return c.json({ ok: false, error: "extension_origin_denied" }, 403);
    if (origin) {
      c.header("Access-Control-Allow-Origin", origin);
      c.header("Vary", "Origin");
      c.header("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
      c.header(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Circé-Extension, X-Circé-Library",
      );
    }
    if (c.req.method === "OPTIONS") return c.body(null, 204);
    await next();
  });
  app.use(
    "*",
    bodyLimit({
      maxSize: 8 * 1024 * 1024,
      onError: (c) => c.json({ ok: false, error: "too_large" }, 413),
    }),
  );
  app.post("/pair", async (c) => {
    const ip = getConnInfo(c).remote.address ?? "local";
    const previous = failures.get(ip);
    if (previous && previous.until > Date.now() && previous.count >= 10)
      return c.json({ ok: false, error: "pairing_rate_limited" }, 429);
    const input = ExtensionPairRequestSchema.parse(await c.req.json());
    const libraryId = host.libraryId();
    const name = host.libraryName();
    const result = await host.auth.pair({
      ...input,
      extension: c.req.header("x-iris-extension") ?? "",
      origin: originFor(c.req.header("host")) ?? "",
      libraryId,
      replaceToken: c.req.header("authorization")?.replace(/^Bearer /, ""),
    });
    if (!result) {
      const failure =
        previous && previous.until > Date.now()
          ? previous
          : { count: 0, until: Date.now() + 300_000 };
      failure.count++;
      failures.set(ip, failure);
      return c.json({ ok: false, error: "access_key_rejected" }, 401);
    }
    failures.delete(ip);
    return c.json({
      ...result,
      libraryId,
      name,
      origin: originFor(c.req.header("host")),
    });
  });
  app.use("*", async (c, next) => {
    const token = c.req.header("authorization")?.replace(/^Bearer /, "") ?? "";
    if (
      !host.auth.valid(
        token,
        c.req.header("x-iris-extension") ?? "",
        originFor(c.req.header("host")) ?? "",
        c.req.header("x-iris-library") ?? "",
      )
    )
      return c.json({ ok: false, error: "extension_auth_required" }, 401);
    if (
      c.req.header("x-iris-library") !== host.libraryId() &&
      !(c.req.method === "DELETE" && c.req.path.endsWith("/pair"))
    )
      return c.json({ ok: false, error: "library_changed" }, 409);
    await next();
  });
  app.delete("/pair", async (c) => {
    await host.auth.revoke(
      c.req.header("authorization")?.replace(/^Bearer /, "") ?? "",
      c.req.header("x-iris-extension") ?? "",
      originFor(c.req.header("host")) ?? "",
      c.req.header("x-iris-library") ?? "",
    );
    return c.json({ ok: true });
  });
  app.post("/request", async (c) => {
    const input = nativeRequestSchema.parse(await c.req.json());
    if (!EXTENSION_REQUEST_ACCESS[input.type])
      return c.json({ ok: false, error: "unsupported_operation" }, 403);
    return c.json(
      await host.dispatch(input, c.req.header("x-iris-library") ?? ""),
    );
  });
  app.onError((error, c) =>
    c.json(
      {
        ok: false,
        error:
          error instanceof z.ZodError || error instanceof SyntaxError
            ? "invalid_request"
            : "internal",
      },
      error instanceof z.ZodError || error instanceof SyntaxError ? 422 : 500,
    ),
  );
  app.all("*", (c) => c.notFound());
  return app;
}
