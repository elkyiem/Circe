import { getConnInfo } from "@hono/node-server/conninfo";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import {
  type AgentStreamRequest,
  agentStreamRequest,
} from "../../shared/assistant";
import { WEB_QUERY_ACCESS } from "../../shared/web-capabilities";
import {
  WebFixtureSchema,
  WebQueryRequestSchema,
} from "../../shared/web-contracts";
import { WebFileQuerySchema } from "../../shared/web-files-contracts";
import {
  type WebHistorySchema,
  WebTransactionsSchema,
} from "../../shared/web-mutations";
import { stringifyWebValue } from "../../shared/web-serialization";
import { WebVideoRequestSchema } from "../../shared/web-video-contracts";
import type { WireSyncAction } from "../../shared/wire";
import { createWebSessions } from "./auth";
import { WebRequestError } from "./errors";
import { createExtensionApi, type ExtensionHost } from "./extension-api";

const COOKIE = "iris_session";
const Login = z.object({ key: z.string().max(256) }).strict();

export interface WebHost {
  extension?: ExtensionHost;
  origin: string;
  origins?: string[];
  key: string;
  assets: string;
  libraryId(): string;
  query(
    request: ReturnType<typeof WebQueryRequestSchema.parse>,
  ): Promise<Response>;
  media(request: Request, saveId: string, filename: string): Promise<Response>;
  subscribe(listener: (action: WireSyncAction) => void): () => void;
  subscribeStatus?: (
    listener: (event: { name: string; data: string }) => void,
  ) => () => void;
  history?: (action?: {
    kind: "undo" | "redo";
    revision: number;
  }) => Promise<ReturnType<typeof WebHistorySchema.parse> & { ok?: boolean }>;
  mutate?: (
    input: ReturnType<typeof WebTransactionsSchema.parse>,
    libraryId: string,
  ) => Promise<{ revision: number }>;
  command?: (
    input: Record<string, z.infer<ReturnType<typeof z.json>>>,
  ) => Promise<Response>;
  agent?: (input: AgentStreamRequest, signal: AbortSignal) => Promise<Response>;
  upload?: (
    request: Request,
    filename: string,
    libraryId: string,
  ) => Promise<Response>;
  files?: (
    input: ReturnType<typeof WebFileQuerySchema.parse>,
    libraryId: string,
  ) => Promise<Response>;
  download?: (
    request: Request,
    id: string,
    libraryId: string,
  ) => Promise<Response>;
  video?: (
    input: ReturnType<typeof WebVideoRequestSchema.parse>,
    libraryId: string,
  ) => Promise<Response>;
  preview?: (
    request: Request,
    saveId: string,
    filename: string,
  ) => Promise<Response>;
  fixture?: (
    kind: z.infer<typeof WebFixtureSchema>,
  ) => Promise<{ id: string; created: boolean }>;
  fixtureAsset?: (name: string) => Promise<Response>;
}

export function createWebApp(host: WebHost) {
  const app = new Hono();
  if (host.extension)
    app.route(
      "/extension",
      createExtensionApi(host.extension, () => [
        host.origin,
        ...(host.origins ?? []),
      ]),
    );
  const sessions = createWebSessions(host.key);
  const failures = new Map<string, { count: number; until: number }>();
  const requestOrigin = (hostHeader: string | undefined) =>
    [host.origin, ...(host.origins ?? [])].find(
      (origin) => new URL(origin).host === hostHeader,
    );
  const sessionScope = (hostHeader: string | undefined) =>
    `${requestOrigin(hostHeader)}\0${host.libraryId()}`;
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    c.header("X-Frame-Options", "DENY");
    const origin = c.req.header("origin");
    const expectedOrigin = requestOrigin(c.req.header("host"));
    if (
      !expectedOrigin ||
      (c.req.path.startsWith("/web/") &&
        ((origin && origin !== expectedOrigin) ||
          ["cross-site", "same-site"].includes(
            c.req.header("sec-fetch-site") ?? "",
          )))
    ) {
      // Only disposable public fixture bytes have a host-only loopback path.
      if (
        host.fixtureAsset &&
        c.req.path.startsWith("/_fixtures/") &&
        getConnInfo(c).remote.address === "127.0.0.1" &&
        c.req.header("host")?.startsWith("127.0.0.1:")
      ) {
        return host.fixtureAsset(c.req.path.slice("/_fixtures/".length));
      }
      return c.json({ error: "This browser origin is not allowed." }, 403);
    }
    await next();
  });
  app.post("/web/session", async (c) => {
    if (c.req.header("origin") !== requestOrigin(c.req.header("host")))
      return c.json({ error: "Origin required." }, 403);
    const ip = getConnInfo(c).remote.address ?? "local";
    const failure = failures.get(ip);
    if (failure && failure.until > Date.now() && failure.count >= 10)
      return c.json(
        { error: "Too many attempts. Try again in five minutes." },
        429,
      );
    const { key } = Login.parse(await c.req.json());
    const id = sessions.login(key, sessionScope(c.req.header("host")));
    if (!id) {
      const entry =
        failure && failure.until > Date.now()
          ? failure
          : { count: 0, until: Date.now() + 300_000 };
      entry.count += 1;
      failures.set(ip, entry);
      return c.json({ error: "The access key was not accepted." }, 401);
    }
    failures.delete(ip);
    setCookie(c, COOKIE, id, {
      httpOnly: true,
      sameSite: "Strict",
      secure: c.req.header("origin")?.startsWith("https:"),
      path: "/",
      maxAge: 43200,
    });
    return c.json({
      libraryId: host.libraryId(),
      fixtures: Boolean(host.fixture),
    });
  });
  app.use("/web/*", async (c, next) => {
    if (
      !sessions.valid(getCookie(c, COOKIE), sessionScope(c.req.header("host")))
    )
      return c.json(
        { error: "Connect to the Circé host with your access key." },
        401,
      );
    if (
      c.req.method !== "GET" &&
      c.req.method !== "HEAD" &&
      c.req.header("origin") !== requestOrigin(c.req.header("host"))
    )
      return c.json({ error: "Origin required." }, 403);
    if (
      c.req.method !== "GET" &&
      c.req.method !== "HEAD" &&
      c.req.header("x-iris-library") !== host.libraryId()
    )
      return c.json(
        { error: "The active Library changed. Reload before editing." },
        409,
      );
    await next();
  });
  app.get("/web/session", (c) =>
    c.json({ libraryId: host.libraryId(), fixtures: Boolean(host.fixture) }),
  );
  app.delete("/web/session", (c) => {
    sessions.revoke(getCookie(c, COOKIE));
    deleteCookie(c, COOKIE, { path: "/" });
    return c.json({ ok: true });
  });
  app.get("/web/extensions", (c) =>
    c.json({ connections: host.extension?.auth.list(host.libraryId()) ?? [] }),
  );
  app.delete("/web/extensions", async (c) => {
    await host.extension?.auth.revokeAll(host.libraryId());
    return c.json({ ok: true });
  });
  app.get("/web/capabilities", (c) => c.json({ queries: WEB_QUERY_ACCESS }));
  app.get("/web/history", async (c) =>
    host.history ? c.json(await host.history()) : c.notFound(),
  );
  app.post("/web/history", async (c) => {
    if (!host.history) return c.notFound();
    const input = z
      .object({
        kind: z.enum(["undo", "redo"]),
        revision: z.number().int().nonnegative(),
      })
      .strict()
      .parse(await c.req.json());
    const result = await host.history(input);
    return result.ok === false
      ? c.json(
          {
            error:
              "History changed in another window. Reload before Undo or Redo.",
          },
          409,
        )
      : c.json(result);
  });
  app.post("/web/transactions", async (c) => {
    if (!host.mutate) return c.notFound();
    const result = await host.mutate(
      WebTransactionsSchema.parse(await c.req.json()),
      c.req.header("x-iris-library") ?? "",
    );
    c.header("x-iris-history", String(result.revision));
    return c.json({ ok: true });
  });
  app.post("/web/command", async (c) =>
    host.command
      ? host.command(z.record(z.string(), z.json()).parse(await c.req.json()))
      : c.notFound(),
  );
  app.post("/web/agent", async (c) =>
    host.agent
      ? host.agent(
          agentStreamRequest.parse(await c.req.json()),
          c.req.raw.signal,
        )
      : c.notFound(),
  );
  app.put("/web/upload", async (c) =>
    host.upload
      ? host.upload(
          c.req.raw,
          decodeURIComponent(c.req.header("x-iris-filename") ?? "upload"),
          c.req.header("x-iris-library") ?? "",
        )
      : c.notFound(),
  );
  app.post("/web/files", async (c) =>
    host.files
      ? host.files(
          WebFileQuerySchema.parse(await c.req.json()),
          c.req.header("x-iris-library") ?? "",
        )
      : c.notFound(),
  );
  app.on(["GET", "HEAD"], "/web/download/:id", async (c) =>
    host.download
      ? host.download(c.req.raw, c.req.param("id"), host.libraryId())
      : c.notFound(),
  );
  app.post("/web/query", async (c) => {
    const request = WebQueryRequestSchema.parse(await c.req.json());
    return host.query({
      ...request,
      libraryId: c.req.header("x-iris-library"),
    });
  });
  app.post("/web/video", async (c) =>
    host.video
      ? host.video(
          WebVideoRequestSchema.parse(await c.req.json()),
          c.req.header("x-iris-library") ?? "",
        )
      : c.notFound(),
  );
  app.on(["GET", "HEAD"], "/web/preview/:saveId/:filename", (c) =>
    host.preview
      ? host.preview(c.req.raw, c.req.param("saveId"), c.req.param("filename"))
      : c.notFound(),
  );
  app.on(["GET", "HEAD"], "/web/media/:saveId/*", (c) =>
    host.media(
      c.req.raw,
      c.req.param("saveId"),
      decodeURIComponent(c.req.path.split("/").slice(4).join("/")),
    ),
  );
  app.get("/web/events", (c) =>
    streamSSE(c, async (stream) => {
      const session = getCookie(c, COOKIE);
      const scope = sessionScope(c.req.header("host"));
      const valid = () =>
        sessions.valid(session, scope) &&
        scope === sessionScope(c.req.header("host"));
      const off = host.subscribe((action) => {
        if (!valid()) {
          stream.abort();
          return;
        }
        void stream
          .writeSSE({
            event: "sync",
            data: stringifyWebValue(action),
          })
          .catch(() => cleanup());
      });
      const offStatus = host.subscribeStatus?.((event) => {
        if (!valid()) {
          stream.abort();
          return;
        }
        void stream
          .writeSSE({ event: event.name, data: event.data })
          .catch(() => cleanup());
      });
      const cleanup = () => {
        off();
        offStatus?.();
        offRevoke();
      };
      const offRevoke = sessions.onRevoke(session, () => stream.abort());
      stream.onAbort(cleanup);
      try {
        await stream.writeSSE({ event: "ready", data: host.libraryId() });
        while (!stream.aborted && valid()) {
          await stream.writeSSE({ event: "heartbeat", data: "connected" });
          await stream.sleep(15000);
        }
      } finally {
        cleanup();
      }
    }),
  );
  app.post("/web/fixtures", async (c) => {
    if (!host.fixture)
      return c.json({ error: "Fixture ingestion is disabled." }, 404);
    const { kind } = z
      .object({ kind: WebFixtureSchema })
      .strict()
      .parse(await c.req.json());
    return c.json(await host.fixture(kind));
  });
  app.get("/_fixtures/:name", (c) => {
    if (!host.fixtureAsset || getConnInfo(c).remote.address !== "127.0.0.1")
      return c.notFound();
    return host.fixtureAsset(c.req.param("name"));
  });
  app.get("/", serveStatic({ root: host.assets, path: "browser.html" }));
  app.get("/*", serveStatic({ root: host.assets }));
  app.get("/*", async (c, next) => {
    if (c.req.path.startsWith("/web/") || c.req.path.startsWith("/assets/"))
      return c.notFound();
    const response = await serveStatic({
      root: host.assets,
      path: "browser.html",
    })(c, next);
    return response instanceof Response ? response : c.notFound();
  });
  app.onError((error, c) =>
    c.json(
      {
        error:
          error instanceof WebRequestError
            ? error.message
            : error instanceof z.ZodError
              ? "Invalid browser request."
              : "The host could not complete this action.",
      },
      error instanceof WebRequestError
        ? error.status
        : error instanceof z.ZodError
          ? 422
          : 500,
    ),
  );
  return app;
}
