import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type {
  ReplayPin,
  WebReplayTicket,
} from "../../shared/web-replay-contracts";
import {
  REPLAY_WORKER_POLICY,
  replayDocumentPolicy,
  WebReplayRequestSchema,
} from "../../shared/web-replay-contracts";
import { libraryAccess } from "../core/library-access";
import { WebRequestError } from "./errors";
import { libraryResponse } from "./library-response";
import type { PreparedReplayArchive } from "./replay-archive";
import type { createReplayCache } from "./replay-cache";
import type { createReplayRoutes } from "./replay-routes";
import { replaySourceResponse } from "./replay-source";

export interface ReplayScope {
  library: string;
  session: string;
  parentOrigin: string;
  valid(): boolean;
  onRevoke(listener: () => void): () => void;
}
export interface ReplayAssets {
  ui: string;
  worker: string;
  bootstrap: string;
  workerAsset: string;
  bootstrapAsset: string;
}
interface Grant {
  ticket: WebReplayTicket;
  hostname: string;
  pin: ReplayPin;
  scope: ReplayScope;
  archive: PreparedReplayArchive;
  directory: string;
  controller: AbortController;
  reads: Set<Promise<void>>;
  offRevoke(): void;
  expires: number;
}

/** Exact-Host replay exposes one sanitized Save revision and no application authority. */
export function createReplayHost(dependencies: {
  routes: ReturnType<typeof createReplayRoutes>;
  cache: ReturnType<typeof createReplayCache>;
  libraryId(): string;
  assets(): Promise<ReplayAssets>;
  prepare(input: {
    saveId: string;
    pageUrl: string;
    directory: string;
    signal: AbortSignal;
  }): Promise<PreparedReplayArchive>;
  warn(error: Error): void;
  now?: () => number;
}) {
  const grants = new Map<string, Grant>();
  const hosts = new Map<string, Grant>();
  const closing = new Map<string, Grant>();
  const revocations = new WeakMap<Grant, Promise<void>>();
  const draining = new Set<Promise<void>>();
  const opening = new Set<{
    controller: AbortController;
    settled: Promise<void>;
  }>();
  const now = dependencies.now ?? Date.now;
  const lifetimeMs = 30 * 60_000;
  let stopping = false;
  let closed: Promise<void> | null = null;

  function revoke(grant: Grant): Promise<void> {
    const existing = revocations.get(grant);
    if (existing) return existing;
    if (grants.get(grant.ticket.id) !== grant) return Promise.resolve();
    const cleanup = Promise.withResolvers<void>();
    revocations.set(grant, cleanup.promise);
    draining.add(cleanup.promise);
    closing.set(grant.ticket.id, grant);
    grants.delete(grant.ticket.id);
    hosts.delete(grant.hostname);
    grant.controller.abort();
    grant.offRevoke();
    void (async () => {
      try {
        dependencies.routes.remove(grant.hostname);
      } finally {
        await Promise.all(grant.reads);
        await dependencies.cache.remove(grant.directory);
      }
    })().then(cleanup.resolve, cleanup.reject);
    const forget = () => {
      draining.delete(cleanup.promise);
      closing.delete(grant.ticket.id);
    };
    void cleanup.promise.then(forget, forget);
    return cleanup.promise;
  }
  const warn = (error: Error) => dependencies.warn(error);
  async function prune() {
    const expired = [...grants.values()].filter(
      (grant) =>
        grant.expires <= now() ||
        !grant.scope.valid() ||
        (libraryAccess.isOpen() &&
          grant.scope.library !== dependencies.libraryId()),
    );
    await Promise.all(expired.map(revoke));
  }
  const timer = setInterval(() => void prune().catch(warn), 60_000);
  timer.unref();
  function valid(grant: Grant): boolean {
    return (
      !stopping &&
      grants.get(grant.ticket.id) === grant &&
      grant.expires > now() &&
      grant.scope.valid()
    );
  }
  function respond(
    body: BodyInit | null,
    type: string,
    policy: string,
    method: string,
    status = 200,
  ) {
    return new Response(method === "HEAD" ? null : body, {
      status,
      headers: {
        "content-type": type,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
        "content-security-policy": policy,
        "cross-origin-resource-policy": "same-origin",
      },
    });
  }
  async function open(
    input: Extract<
      ReturnType<typeof WebReplayRequestSchema.parse>,
      { action: "open" }
    >,
    scope: ReplayScope,
    signal?: AbortSignal,
  ) {
    libraryAccess.assertNewWorkAllowed();
    if (
      stopping ||
      !scope.valid() ||
      scope.library !== dependencies.libraryId()
    )
      throw new WebRequestError("Reload Circé before opening an archive.");
    await prune();
    libraryAccess.assertNewWorkAllowed();
    if (stopping || !scope.valid())
      throw new WebRequestError("The archive session has ended.");
    if (opening.size >= 2 || grants.size + opening.size >= 20)
      throw new WebRequestError(
        "Wait for the current archive to finish opening, then try again.",
        429,
      );
    const controller = new AbortController();
    const abortOpening = () => controller.abort();
    signal?.addEventListener("abort", abortOpening, { once: true });
    if (signal?.aborted) controller.abort();
    const settled = Promise.withResolvers<void>();
    const pending = { controller, settled: settled.promise };
    opening.add(pending);
    let grant: Grant | null = null;
    const offRevoke = scope.onRevoke(() => {
      controller.abort();
      if (grant) void revoke(grant).catch(warn);
    });
    if (!scope.valid()) controller.abort();
    let directory: string | null = null;
    let hostname: string | null = null;
    try {
      const assets = await dependencies.assets();
      controller.signal.throwIfAborted();
      if (
        (input.workerAsset && input.workerAsset !== assets.workerAsset) ||
        (input.bootstrapAsset && input.bootstrapAsset !== assets.bootstrapAsset)
      )
        throw new WebRequestError(
          "This tab uses an older archive viewer. Reload Circé before opening the archive.",
        );
      directory = await dependencies.cache.create();
      controller.signal.throwIfAborted();
      const archive = await dependencies.prepare({
        saveId: input.saveId,
        pageUrl: input.pageUrl,
        directory,
        signal: controller.signal,
      });
      controller.signal.throwIfAborted();
      libraryAccess.assertNewWorkAllowed();
      if (!scope.valid() || scope.library !== dependencies.libraryId())
        throw new WebRequestError(
          "The Library changed while opening this archive. Reload Circé.",
        );
      hostname = await dependencies.routes.register();
      controller.signal.throwIfAborted();
      libraryAccess.assertNewWorkAllowed();
      if (stopping || !scope.valid())
        throw new WebRequestError("The archive session has ended.");
      const origin = `https://${hostname}`;
      const ticket = {
        id: randomUUID(),
        generation: randomUUID(),
        origin,
        url: `${origin}/viewer`,
      };
      const pin: ReplayPin = {
        collection: `archive-${archive.revision.slice(0, 32)}`,
        source: `${origin}/archive/source.warc.gz`,
        authorization: `Bearer ${randomBytes(32).toString("base64url")}`,
        parentOrigin: scope.parentOrigin,
        generation: ticket.generation,
        pageUrl: archive.pageUrl,
        pages: archive.pages,
        csp: replayDocumentPolicy(scope.parentOrigin),
      };
      grant = {
        ticket,
        pin,
        scope,
        archive,
        directory,
        hostname,
        controller,
        offRevoke,
        reads: new Set(),
        expires: now() + lifetimeMs,
      };
      grants.set(ticket.id, grant);
      hosts.set(hostname, grant);
      return ticket;
    } catch (error) {
      controller.abort();
      offRevoke();
      try {
        if (hostname) dependencies.routes.remove(hostname);
      } finally {
        if (directory) await dependencies.cache.remove(directory);
      }
      throw error;
    } finally {
      signal?.removeEventListener("abort", abortOpening);
      opening.delete(pending);
      settled.resolve();
    }
  }
  return {
    async request(
      raw: ReturnType<typeof WebReplayRequestSchema.parse>,
      scope: ReplayScope,
      signal?: AbortSignal,
    ) {
      const input = WebReplayRequestSchema.parse(raw);
      if (input.action === "open") return open(input, scope, signal);
      const grant = grants.get(input.id) ?? closing.get(input.id);
      if (
        grant &&
        (grant.scope.session !== scope.session ||
          grant.scope.library !== scope.library ||
          grant.scope.parentOrigin !== scope.parentOrigin)
      )
        throw new WebRequestError(
          "This archive belongs to another browser session.",
          403,
        );
      if (grant) await revoke(grant);
      return { ok: true };
    },
    async handle(request: Request): Promise<Response | null> {
      const hostname = (
        request.headers.get("host") ?? new URL(request.url).host
      ).toLowerCase();
      const grant = hosts.get(hostname);
      if (!grant) return null;
      const { method } = request;
      const denied = (status = 403) =>
        respond(
          "This archive is unavailable. Reopen it from Circé.",
          "text/plain",
          grant.pin.csp,
          method,
          status,
        );
      if (!valid(grant)) {
        void revoke(grant).catch(warn);
        return denied();
      }
      if (!new Set(["GET", "HEAD"]).has(method)) return denied(405);
      const origin = request.headers.get("origin");
      if (origin && origin !== grant.ticket.origin) return denied();
      if (!libraryAccess.isOpen()) return denied(503);
      if (grant.scope.library !== dependencies.libraryId()) {
        void revoke(grant).catch(warn);
        return denied();
      }
      grant.expires = now() + lifetimeMs;
      const url = new URL(request.url);
      if (url.pathname === "/archive/source.warc.gz") {
        const digest = (value: string) =>
          createHash("sha256").update(value).digest();
        if (
          url.search ||
          !timingSafeEqual(
            digest(request.headers.get("authorization") ?? ""),
            digest(grant.pin.authorization),
          )
        )
          return denied();
      }
      const signal = AbortSignal.any([request.signal, grant.controller.signal]);
      const scopedRequest = new Request(request, { signal });
      return libraryResponse(scopedRequest, async () => {
        if (!valid(grant) || !(await grant.archive.current())) {
          void revoke(grant).catch(warn);
          return denied(409);
        }
        if (!valid(grant)) return denied();
        if (url.pathname === "/archive/source.warc.gz") {
          const response = replaySourceResponse({
            request: scopedRequest,
            archive: grant.archive,
            signal,
            authorized: () => valid(grant),
            track: (read) => {
              grant.reads.add(read);
              void read.then(() => grant.reads.delete(read));
            },
          });
          response.headers.set("x-content-type-options", "nosniff");
          response.headers.set("referrer-policy", "no-referrer");
          response.headers.set("cross-origin-resource-policy", "same-origin");
          return response;
        }
        const assets = await dependencies.assets();
        if (!valid(grant)) return denied();
        const prefix = `globalThis.__CIRCE_REPLAY_PIN=${JSON.stringify(grant.pin)};\n`;
        if (url.pathname === "/replay/sw.js") {
          if (url.search !== "?serveIndex=1") return denied();
          const response = respond(
            prefix + assets.worker,
            "application/javascript; charset=utf-8",
            REPLAY_WORKER_POLICY,
            method,
          );
          response.headers.set("service-worker-allowed", "/replay/");
          return response;
        }
        if (url.search) return denied(404);
        if (["/ui.js", "/replay/ui.js"].includes(url.pathname))
          return respond(
            assets.ui,
            "application/javascript; charset=utf-8",
            grant.pin.csp,
            method,
          );
        if (url.pathname === "/bootstrap.js")
          return respond(
            prefix + assets.bootstrap,
            "application/javascript; charset=utf-8",
            grant.pin.csp,
            method,
          );
        if (url.pathname === "/viewer")
          return respond(
            '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,replay-web-page{display:block;height:100%;margin:0;overflow:hidden}body{background:#0a0a0a;color:#eee;font:16px system-ui}#error{padding:24px}</style><script src="/ui.js"></script></head><body><p id="error" role="status">Opening archived page…</p><script src="/bootstrap.js"></script></body></html>',
            "text/html; charset=utf-8",
            grant.pin.csp,
            method,
          );
        if (url.pathname === "/replay/index.html")
          return respond(
            '<!doctype html><meta charset="utf-8"><script src="./ui.js"></script><replay-app-main></replay-app-main>',
            "text/html; charset=utf-8",
            grant.pin.csp,
            method,
          );
        return denied(404);
      });
    },
    close(): Promise<void> {
      closed ??= (async () => {
        stopping = true;
        clearInterval(timer);
        for (const pending of opening) pending.controller.abort();
        const work = [...grants.values()].map(revoke);
        const results = await Promise.allSettled([
          ...work,
          ...draining,
          ...[...opening].map((pending) => pending.settled),
        ]);
        dependencies.routes.close();
        const errors = results.flatMap((result) =>
          result.status === "rejected" ? [result.reason] : [],
        );
        if (errors.length)
          throw new AggregateError(
            errors,
            "Archive replay could not finish stopping.",
          );
      })();
      return closed;
    },
  };
}
