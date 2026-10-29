import {
  API,
  Collection,
  SWCollections,
  SWReplay,
} from "@webrecorder/wabac/swlib";
import { z } from "zod";
import {
  type ReplayPin,
  ReplayPinSchema,
} from "../../../shared/web-replay-contracts";

/** Supplied by the exact-Host worker response, then validated before engine setup. */
declare const __CIRCE_REPLAY_PIN: ReplayPin;
const pin = ReplayPinSchema.parse(__CIRCE_REPLAY_PIN);
if (new URL(pin.source).origin !== location.origin)
  throw new Error("The archive source must belong to this replay origin.");
const policy = () => ({
  csp: pin.csp,
  headers: { Authorization: pin.authorization },
  liveRedirectOnNotFound: false,
});
const denied = () =>
  Response.json(
    { error: "This archive cannot perform that operation." },
    {
      status: 403,
      headers: {
        "Content-Security-Policy": pin.csp,
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
type FetchContext = Parameters<SWReplay["handleFetch"]>[0];
type StoreConfig = Parameters<SWCollections["_initStore"]>[1];
const AddCollectionSchema = z.looseObject({
  name: z.string(),
  file: z.looseObject({
    sourceUrl: z.string(),
    loadUrl: z.string().optional(),
  }),
});
const MessageSchema = z.looseObject({ msg_type: z.string().max(100) });

class ReadOnlyAPI extends API {
  override get routes(): API["routes"] {
    const available = super.routes;
    const routes: API["routes"] = {};
    for (const name of [
      "index",
      "coll",
      "pages",
      "urls",
      "urlsTs",
      "curated",
      "textIndex",
    ]) {
      const route = available[name];
      if (route) routes[name] = route;
    }
    return routes;
  }
  override async apiResponse(
    path: string,
    request: Request,
    event: FetchContext,
  ): Promise<Response> {
    const pathname = path.split("?", 1)[0];
    if (
      request.method !== "GET" ||
      (pathname !== "coll-index" &&
        pathname !== `c/${pin.collection}` &&
        !pathname?.startsWith(`c/${pin.collection}/`))
    )
      return denied();
    return super.apiResponse(path, request, event);
  }
}

class PinnedCollections extends SWCollections {
  private validate(type: string, config: StoreConfig): StoreConfig {
    if (
      !new Set(["archive", "remotesource"]).has(type) ||
      config.dbname !== `db:${pin.collection}` ||
      config.sourceUrl !== pin.source ||
      config.loadUrl !== pin.source ||
      config.remotePrefix ||
      config.extra?.fileHandle ||
      config.extra?.arrayBuffer ||
      JSON.stringify(config.headers) !==
        JSON.stringify({ Authorization: pin.authorization })
    )
      throw new Error(
        "This archive's stored source changed. Reopen the archive.",
      );
    // The complete IndexedDB configuration is untrusted, including executable policy.
    return {
      dbname: `db:${pin.collection}`,
      sourceUrl: pin.source,
      loadUrl: pin.source,
      headers: { Authorization: pin.authorization },
      extraConfig: policy(),
      metadata: config.metadata,
      size: config.size,
      sourceName: "source.warc.gz",
      decode: true,
      root: false,
    };
  }
  override async _initStore(type: string, config: StoreConfig) {
    return super._initStore(type, this.validate(type, config));
  }
  override _createCollection(
    input: Parameters<SWCollections["_createCollection"]>[0],
  ) {
    if (input.name !== pin.collection)
      throw new Error("Unknown archive collection.");
    return new Collection(
      // Reload omits type here; _initStore already checked the actual persisted type.
      {
        ...input,
        config: this.validate(input.type ?? "archive", input.config),
      },
      this.prefixes,
      policy(),
    );
  }
  override async getColl(name: string) {
    return name === pin.collection ? super.getColl(name) : undefined;
  }
  override async listAll() {
    return (await super.listAll()).filter(
      (entry) => entry.name === pin.collection,
    );
  }
  override async loadColl(name: string) {
    if (name !== pin.collection) return undefined;
    try {
      return await super.loadColl(name);
    } catch {
      return undefined;
    }
  }
  override async addCollection(
    raw: Parameters<SWCollections["addCollection"]>[0],
    progress: Parameters<SWCollections["addCollection"]>[1],
  ) {
    const input = AddCollectionSchema.parse(raw);
    if (
      input.name !== pin.collection ||
      input.file.sourceUrl !== pin.source ||
      (input.file.loadUrl && input.file.loadUrl !== pin.source) ||
      input.type ||
      input.remotePrefix ||
      input.file.blob ||
      input.file.extra ||
      input.file.newFullImport
    )
      throw new Error("This replay cannot import another source.");
    return super.addCollection(
      {
        name: pin.collection,
        skipExisting: true,
        file: {
          sourceUrl: pin.source,
          loadUrl: pin.source,
          name: "source.warc.gz",
          headers: { Authorization: pin.authorization },
        },
        extraConfig: policy(),
      },
      progress,
    );
  }
  override async _handleMessage(event: MessageEvent) {
    const parsed = MessageSchema.safeParse(event.data);
    if (!parsed.success) return;
    if (parsed.data.msg_type === "listAll") return super._handleMessage(event);
    if (parsed.data.msg_type !== "addColl") return;
    const incoming = AddCollectionSchema.safeParse(event.data);
    if (
      !incoming.success ||
      incoming.data.name !== pin.collection ||
      incoming.data.file.sourceUrl !== pin.source ||
      (incoming.data.file.loadUrl &&
        incoming.data.file.loadUrl !== pin.source) ||
      incoming.data.type ||
      incoming.data.remotePrefix ||
      incoming.data.file.blob ||
      incoming.data.file.extra ||
      incoming.data.file.newFullImport
    )
      return;
    // The installed supported hook reads data and source; force idempotence before
    // its existing-collection branch can delete a collection supplied by a caller.
    return super._handleMessage({
      ...event,
      source: event.source,
      data: {
        msg_type: "addColl",
        name: pin.collection,
        skipExisting: true,
        file: {
          sourceUrl: pin.source,
          loadUrl: pin.source,
          name: "source.warc.gz",
          headers: { Authorization: pin.authorization },
        },
        extraConfig: policy(),
      },
    });
  }
}

class PinnedReplay extends SWReplay {
  override async defaultFetch(
    request: RequestInfo | URL,
    options: RequestInit = {},
  ): Promise<Response> {
    const url = new URL(
      request instanceof Request ? request.url : String(request),
      location.href,
    );
    if (
      url.origin !== location.origin ||
      !new Set([
        "/viewer",
        "/ui.js",
        "/replay/index.html",
        "/replay/ui.js",
        "/replay/sw.js",
      ]).has(url.pathname)
    )
      return denied();
    return super.defaultFetch(request, { ...options, redirect: "error" });
  }
  override async handleFetch(event: FetchContext): Promise<Response> {
    if (new URL(event.request.url).origin !== location.origin) return denied();
    let response: Response;
    try {
      response = await super.handleFetch(event);
    } catch {
      response = Response.json(
        { error: "This archived resource is unavailable." },
        { status: 409 },
      );
    }
    if (response.type === "opaque" || response.type === "opaqueredirect")
      return denied();
    const headers = new Headers(response.headers);
    headers.set("Content-Security-Policy", pin.csp);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-DNS-Prefetch-Control", "off");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

new PinnedReplay({
  ApiClass: ReadOnlyAPI,
  CollectionsClass: PinnedCollections,
  defaultConfig: policy(),
});
