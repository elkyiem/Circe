import type { ReplayWebPage } from "replaywebpage";
import { z } from "zod";
import {
  ReplayChildMessageSchema,
  ReplayPageUrlSchema,
  type ReplayParentMessageSchema,
  type ReplayPin,
  ReplayPinSchema,
} from "../../../shared/web-replay-contracts";
import { observeReplayLinks } from "./replay-links";

declare const __CIRCE_REPLAY_PIN: ReplayPin;
declare global {
  interface HTMLElementTagNameMap {
    "replay-web-page": ReplayWebPage;
  }
}
const pin = ReplayPinSchema.parse(__CIRCE_REPLAY_PIN);
const key = (url: string) => {
  const parsed = new URL(url);
  parsed.hash = "";
  return parsed.href;
};
const pages = new Set(pin.pages.map(key));
function post(message: ReturnType<typeof ReplayParentMessageSchema.parse>) {
  parent.postMessage(message, pin.parentOrigin);
}
function resolve(href: string): string | null {
  const prefix = `${location.origin}/replay/w/${pin.collection}/`;
  let url = href;
  if (url.startsWith(prefix)) {
    const replay = url.slice(prefix.length);
    const marker = replay.indexOf("/http");
    if (marker < 0) return null;
    url = replay.slice(marker + 1);
  }
  const parsed = ReplayPageUrlSchema.safeParse(url);
  return parsed.success ? parsed.data : null;
}
async function activateWorker() {
  const registration = await navigator.serviceWorker.register(
    "/replay/sw.js?serveIndex=1",
    { scope: "/replay/" },
  );
  if (registration.active?.state === "activated") return;
  await new Promise<void>((accept, reject) => {
    const worker =
      registration.installing ?? registration.waiting ?? registration.active;
    if (!worker) return reject(new Error("The archive worker did not start."));
    const finish = (error?: Error) => {
      clearTimeout(timer);
      worker.removeEventListener("statechange", changed);
      if (error) reject(error);
      else accept();
    };
    const changed = () => {
      if (worker.state === "activated") finish();
      else if (worker.state === "redundant")
        finish(new Error("The archive worker could not activate."));
    };
    const timer = setTimeout(
      () => finish(new Error("The archive worker took too long to start.")),
      12_000,
    );
    worker.addEventListener("statechange", changed);
    changed();
  });
}
async function start() {
  if (parent === window) throw new Error("Open this archive from Circé.");
  if (new URL(pin.source).origin !== location.origin)
    throw new Error("This archive's source address changed.");
  await activateWorker();
  await customElements.whenDefined("replay-web-page");
  const replay = document.createElement("replay-web-page");
  replay.source = pin.source;
  replay.coll = pin.collection;
  replay.url = pin.pageUrl;
  replay.replaybase = "/replay/";
  replay.swName = "sw.js";
  replay.embed = "replayonly";
  replay.noWebWorker = true;
  replay.config = JSON.stringify({
    headers: { Authorization: pin.authorization },
    csp: pin.csp,
    liveRedirectOnNotFound: false,
  });
  const links = observeReplayLinks({
    document,
    resolve,
    visit(url) {
      if (pages.has(key(url))) replay.url = url;
      else
        post({
          type: "circe-replay:external",
          generation: pin.generation,
          url,
        });
    },
  });
  const changed = (event: Event) => {
    if (!(event instanceof CustomEvent)) return;
    const value = z
      .looseObject({ url: ReplayPageUrlSchema })
      .safeParse(event.detail);
    if (value.success && pages.has(key(value.data.url)))
      post({
        type: "circe-replay:navigate",
        generation: pin.generation,
        url: value.data.url,
      });
    links.refresh();
  };
  replay.addEventListener("rwp-url-change", changed);
  replay.addEventListener("rwp-page-loading", () => links.refresh());
  const message = (event: MessageEvent) => {
    if (event.source !== parent || event.origin !== pin.parentOrigin) return;
    const parsed = ReplayChildMessageSchema.safeParse(event.data);
    if (!parsed.success || parsed.data.generation !== pin.generation) return;
    if (parsed.data.type === "circe-replay:reload") location.reload();
    else if (pages.has(key(parsed.data.url))) replay.url = parsed.data.url;
  };
  window.addEventListener("message", message);
  document.getElementById("error")?.remove();
  document.body.append(replay);
  await replay.updateComplete;
  links.refresh();
  const keepalive = setInterval(() => {
    void fetch(pin.source, {
      method: "HEAD",
      headers: { Authorization: pin.authorization },
    }).catch(() => {});
  }, 5 * 60_000);
  window.addEventListener(
    "pagehide",
    () => {
      clearInterval(keepalive);
      links.dispose();
      window.removeEventListener("message", message);
    },
    { once: true },
  );
  post({ type: "circe-replay:ready", generation: pin.generation });
}
void start().catch((error: Error) => {
  const message = `Could not open this archive. ${error.message}`.slice(
    0,
    1000,
  );
  const status = document.getElementById("error");
  if (status) status.textContent = message;
  post({ type: "circe-replay:error", generation: pin.generation, message });
});
