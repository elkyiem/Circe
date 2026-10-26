import { getConnInfo } from "@hono/node-server/conninfo";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import {
  WebFixtureSchema,
  WebQueryRequestSchema,
} from "../../shared/web-contracts";
import { stringifyWebValue } from "../../shared/web-serialization";
import type { WireSyncAction } from "../../shared/wire";
import { createWebSessions } from "./auth";

const COOKIE = "iris_session";
const Login = z.object({ key: z.string().max(256) }).strict();

export interface WebHost {
  origin: string;
  key: string;
  assets: string;
  libraryId(): string;
  query(
    request: ReturnType<typeof WebQueryRequestSchema.parse>,
  ): Promise<Response>;
  media(request: Request, saveId: string, filename: string): Promise<Response>;
  subscribe(listener: (action: WireSyncAction) => void): () => void;
  fixture?: (
    kind: z.infer<typeof WebFixtureSchema>,
  ) => Promise<{ id: string; created: boolean }>;
  fixtureAsset?: (name: string) => Promise<Response>;
}

export function createWebApp(host: WebHost) {
  const app = new Hono();
  const sessions = createWebSessions(host.key);
  const failures = new Map<string, { count: number; until: number }>();
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    c.header("X-Frame-Options", "DENY");
    const origin = c.req.header("origin");
    const expectedHost = new URL(host.origin).host;
    if (
      c.req.header("host") !== expectedHost ||
      (c.req.path.startsWith("/web/") &&
        ((origin && origin !== host.origin) ||
          c.req.header("sec-fetch-site") === "cross-site"))
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
    if (c.req.header("origin") !== host.origin)
      return c.json({ error: "Origin required." }, 403);
    const ip = getConnInfo(c).remote.address ?? "local";
    const failure = failures.get(ip);
    if (failure && failure.until > Date.now() && failure.count >= 10)
      return c.json(
        { error: "Too many attempts. Try again in five minutes." },
        429,
      );
    const { key } = Login.parse(await c.req.json());
    const id = sessions.login(key);
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
      secure: host.origin.startsWith("https:"),
      path: "/",
      maxAge: 43200,
    });
    return c.json({
      libraryId: host.libraryId(),
      fixtures: Boolean(host.fixture),
    });
  });
  app.use("/web/*", async (c, next) => {
    if (!sessions.valid(getCookie(c, COOKIE)))
      return c.json(
        { error: "Connect to the Iris host with your access key." },
        401,
      );
    if (
      c.req.method !== "GET" &&
      c.req.method !== "HEAD" &&
      c.req.header("origin") !== host.origin
    )
      return c.json({ error: "Origin required." }, 403);
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
  app.post("/web/query", async (c) =>
    host.query(WebQueryRequestSchema.parse(await c.req.json())),
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
      const off = host.subscribe((action) => {
        void stream.writeSSE({
          event: "sync",
          data: stringifyWebValue(action),
        });
      });
      stream.onAbort(off);
      try {
        await stream.writeSSE({ event: "ready", data: host.libraryId() });
        while (!stream.aborted && sessions.valid(getCookie(c, COOKIE))) {
          await stream.writeSSE({ event: "heartbeat", data: "connected" });
          await stream.sleep(15000);
        }
      } finally {
        off();
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
  app.onError((error, c) =>
    c.json(
      {
        error:
          error instanceof z.ZodError
            ? "Invalid browser request."
            : "The host could not complete this action.",
      },
      error instanceof z.ZodError ? 422 : 500,
    ),
  );
  return app;
}
