/**
 * Runs in the page's MAIN world: only web platform globals exist here, never chrome.* or WXT APIs.
 * Patches fetch/XHR/sendBeacon once per page and fans each request out to registered source interceptors.
 */

import { safeParse } from "zod/v4/core";
import type { PondMessage } from "@/utils/types";
import { TextValue } from "./json";

const POND_EVENT = "pond:capture";

function emit(message: PondMessage): void {
  window.postMessage({ type: POND_EVENT, message }, "*");
}

/** A click hook and the network interceptor both report one save, often seconds apart. */
const CAPTURE_DEDUPE_MS = 4000;
const recentCaptures = new Map<string, number>();

/** Instagram serves one post under `/p/`, `/reel/` and `/tv/`, so the shortcode is the key there. */
export function canonicalCaptureUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "instagram.com") {
      const shortcode = /^\/(?:p|reels?|tv)\/([^/]+)/.exec(parsed.pathname);
      if (shortcode?.[1]) return `instagram.com/p/${shortcode[1]}`;
    }
    return `${host}${parsed.pathname.replace(/\/+$/, "")}`;
  } catch {
    return url;
  }
}

export function capture(
  url: string,
  trigger: string,
  now: number = Date.now(),
): void {
  const intent = /:(?:like|upvote)$/.test(trigger) ? "like" : "save";
  const key = `${intent} ${canonicalCaptureUrl(url)}`;
  const previous = recentCaptures.get(key);
  if (previous !== undefined && now - previous < CAPTURE_DEDUPE_MS) return;
  for (const [entry, at] of recentCaptures)
    if (now - at >= CAPTURE_DEDUPE_MS) recentCaptures.delete(entry);
  recentCaptures.set(key, now);
  emit({ kind: "capture", payload: { url, trigger } });
}

export function log(
  level: "info" | "warn" | "error",
  message: string,
  data?: string,
): void {
  emit({ kind: "log", level, message, data });
}

export interface RequestLens {
  readonly url: string;
  readonly method: string;
  getHeader(name: string): string | null;
  readBody(): Promise<string | null>;
}

interface ResponseLens {
  readonly status: number;
  readonly ok: boolean;
  readText(): Promise<string | null>;
}

interface SourceInterceptor {
  id: string;
  match(req: RequestLens): boolean;
  onResponse(req: RequestLens, res: ResponseLens): void | Promise<void>;
  onBeacon?(url: string, body: string | null): void | Promise<void>;
}

interface Registry {
  handlers: SourceInterceptor[];
  ids: Set<string>;
  patchedFetch: boolean;
  patchedXhr: boolean;
  patchedBeacon: boolean;
}

/** Every Pond injector on a page evaluates its own copy of this module, so `Symbol.for` gives them one shared registry. */
const REGISTRY_KEY = Symbol.for("pond.interceptors");

declare global {
  interface Window {
    [REGISTRY_KEY]?: Registry;
  }
}

function registry(): Registry {
  const existing = window[REGISTRY_KEY];
  if (existing) return existing;
  const created: Registry = {
    handlers: [],
    ids: new Set<string>(),
    patchedFetch: false,
    patchedXhr: false,
    patchedBeacon: false,
  };
  window[REGISTRY_KEY] = created;
  return created;
}

function once<T>(fn: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | undefined;
  return () => {
    if (!cached) cached = fn();
    return cached;
  };
}

function normalizeHeaders(
  source: HeadersInit | Headers | null | undefined,
): Map<string, string> {
  const out = new Map<string, string>();
  if (!source) return out;
  if ("Headers" in globalThis && source instanceof Headers) {
    source.forEach((value, key) => {
      out.set(key.toLowerCase(), value);
    });
    return out;
  }
  if (Array.isArray(source)) {
    for (const entry of source) {
      if (Array.isArray(entry) && entry.length >= 2) {
        out.set(String(entry[0]).toLowerCase(), String(entry[1]));
      }
    }
    return out;
  }
  for (const [key, value] of Object.entries(source)) {
    out.set(key.toLowerCase(), String(value));
  }
  return out;
}

type InterceptedBody = Document | BodyInit | null | undefined;

async function bodyToText(body: InterceptedBody): Promise<string | null> {
  if (body == null) return null;
  const text = safeParse(TextValue, body);
  if (text.success) return text.data;
  if (body instanceof URLSearchParams) return body.toString();
  if ("FormData" in globalThis && body instanceof FormData) {
    const params = new URLSearchParams();
    body.forEach((value, key) => {
      params.append(key, value instanceof File ? "[file]" : value);
    });
    return params.toString();
  }
  if ("Blob" in globalThis && body instanceof Blob) {
    try {
      return await body.text();
    } catch {
      return null;
    }
  }
  if (body instanceof ArrayBuffer) return new TextDecoder().decode(body);
  if (ArrayBuffer.isView(body)) return new TextDecoder().decode(body);
  return null;
}

function safeMatch(handler: SourceInterceptor, req: RequestLens): boolean {
  try {
    return handler.match(req);
  } catch (err) {
    log("warn", `${handler.id} match error`, String(err));
    return false;
  }
}

function dispatch(
  matched: SourceInterceptor[],
  req: RequestLens,
  res: ResponseLens,
): void {
  for (const handler of matched) {
    try {
      const result = handler.onResponse(req, res);
      if (result instanceof Promise) {
        result.catch((err) =>
          log("warn", `${handler.id} hook error`, String(err)),
        );
      }
    } catch (err) {
      log("warn", `${handler.id} hook error`, String(err));
    }
  }
}

function patchFetch(reg: Registry): void {
  if (reg.patchedFetch) return;
  reg.patchedFetch = true;
  const origFetch = window.fetch;

  window.fetch = function patchedFetch(
    this: Window,
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const request =
      "Request" in globalThis && input instanceof Request ? input : null;
    const url = request ? request.url : String(input);
    const method = String(
      init?.method ?? request?.method ?? "GET",
    ).toUpperCase();
    const headers = normalizeHeaders(init?.headers ?? request?.headers);

    let matched: SourceInterceptor[] = [];
    let req: RequestLens | null = null;
    if (reg.handlers.length > 0) {
      const requestClone =
        request && init?.body == null ? request.clone() : null;
      const readBody = once(async () => {
        if (init?.body != null) return bodyToText(init.body);
        if (requestClone) {
          try {
            return await requestClone.text();
          } catch {
            return null;
          }
        }
        return null;
      });
      req = {
        url,
        method,
        getHeader: (name) => headers.get(name.toLowerCase()) ?? null,
        readBody,
      };
      const candidate = req;
      matched = reg.handlers.filter((h) => safeMatch(h, candidate));
    }

    const promise = origFetch.call(this, input, init);
    if (matched.length === 0 || !req) return promise;

    const activeReq = req;
    const activeMatched = matched;
    promise
      .then((response) => {
        const clone = (() => {
          try {
            return response.clone();
          } catch {
            return null;
          }
        })();
        const readText = once(async () => {
          if (!clone) return null;
          try {
            return await clone.text();
          } catch {
            return null;
          }
        });
        dispatch(activeMatched, activeReq, {
          status: response.status,
          ok: response.ok,
          readText,
        });
      })
      .catch(() => {});

    return promise;
  };
}

interface XhrState {
  method: string;
  url: string;
  headers: Map<string, string>;
  body: InterceptedBody;
}

type XhrOpenRest = [
  async?: boolean,
  username?: string | null,
  password?: string | null,
];

function patchXhr(reg: Registry): void {
  if (reg.patchedXhr) return;
  reg.patchedXhr = true;

  const proto = XMLHttpRequest.prototype;
  const origOpen: (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    ...rest: XhrOpenRest
  ) => void = proto.open;
  const origSend = proto.send;
  const origSetHeader = proto.setRequestHeader;
  const states = new WeakMap<XMLHttpRequest, XhrState>();

  proto.open = function patchedOpen(
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    ...rest: XhrOpenRest
  ) {
    states.set(this, {
      method: String(method ?? "GET").toUpperCase(),
      url: String(url ?? ""),
      headers: new Map(),
      body: null,
    });
    return origOpen.call(this, method, url, ...rest);
  };

  proto.setRequestHeader = function patchedSetRequestHeader(
    this: XMLHttpRequest,
    name: string,
    value: string,
  ) {
    const state = states.get(this);
    if (state) {
      try {
        state.headers.set(String(name).toLowerCase(), String(value));
      } catch {}
    }
    return origSetHeader.call(this, name, value);
  };

  proto.send = function patchedSend(
    this: XMLHttpRequest,
    body?: Document | XMLHttpRequestBodyInit | null,
  ) {
    const state = states.get(this);
    if (state && reg.handlers.length > 0) {
      state.body = body ?? null;
      const readBody = once(() => bodyToText(state.body));
      const req: RequestLens = {
        url: state.url,
        method: state.method,
        getHeader: (name) => state.headers.get(name.toLowerCase()) ?? null,
        readBody,
      };
      const matched = reg.handlers.filter((h) => safeMatch(h, req));
      if (matched.length > 0) {
        this.addEventListener(
          "load",
          () => {
            const readText = once(async () =>
              this.responseType === "" || this.responseType === "text"
                ? this.responseText
                : null,
            );
            dispatch(matched, req, {
              status: this.status,
              ok: this.status >= 200 && this.status < 300,
              readText,
            });
          },
          { once: true },
        );
      }
    }
    return origSend.call(this, body);
  };
}

function patchBeacon(reg: Registry): void {
  if (reg.patchedBeacon) return;
  if (!globalThis.navigator?.sendBeacon) return;
  reg.patchedBeacon = true;
  const origBeacon = navigator.sendBeacon.bind(navigator);

  navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
    const result = origBeacon(url, data);
    const beaconHandlers = reg.handlers.filter((h) => h.onBeacon);
    if (beaconHandlers.length > 0) {
      const beaconUrl = String(url);
      void bodyToText(data).then((body) => {
        for (const handler of beaconHandlers) {
          try {
            void Promise.resolve(handler.onBeacon?.(beaconUrl, body)).catch(
              (err) => log("warn", `${handler.id} beacon error`, String(err)),
            );
          } catch (err) {
            log("warn", `${handler.id} beacon error`, String(err));
          }
        }
      });
    }
    return result;
  };
}

export function installInterceptor(def: SourceInterceptor): void {
  const reg = registry();
  if (reg.ids.has(def.id)) return;
  reg.ids.add(def.id);
  reg.handlers.push(def);
  patchFetch(reg);
  patchXhr(reg);
  if (def.onBeacon) patchBeacon(reg);
  log("info", `${def.id} inject ready`);
}
