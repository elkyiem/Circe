/// <reference lib="dom" />

import type { JsonValue } from "@pond/schema/json";
import { captureFromPageDom, type HarvestAdaptCtx } from "../from-page";
import { buildItemExpression } from "../lib/expression";

interface SaveeItemPage {
  title?: string;
  author?: string;
  mediaUrls: Array<{ url: string; type: "image" | "video" }>;
  meta: { authorUrl?: string };
}

export function buildExpression(shortId: string): string {
  return buildItemExpression(() => ({}), inPageSaveeHarvest, shortId);
}

async function inPageSaveeHarvest(): Promise<SaveeItemPage | null> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (document.querySelector('meta[property="og:image"]')) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  const meta = (key: string): string =>
    document
      .querySelector(`meta[property="${key}"], meta[name="${key}"]`)
      ?.getAttribute("content")
      ?.trim() ?? "";
  let ld: {
    name?: string;
    contentUrl?: string;
    creator?: { name?: string; url?: string };
  } | null = null;
  for (const node of document.querySelectorAll(
    'script[type="application/ld+json"]',
  )) {
    try {
      const parsed = JSON.parse(node.textContent ?? "");
      if (parsed?.["@type"] === "ImageObject") ld = parsed;
    } catch {}
  }
  const page: SaveeItemPage = { mediaUrls: [], meta: {} };
  const title =
    ld?.name?.trim() ||
    meta("og:title").replace(/\s+by\s+.+?\s+–\s+Savee$/, "");
  if (title) page.title = title;
  if (ld?.creator?.name) page.author = ld.creator.name;
  if (ld?.creator?.url) page.meta.authorUrl = ld.creator.url;
  const media = ld?.contentUrl || meta("og:image");
  if (media) {
    page.mediaUrls.push({
      url: media,
      type: /\.mp4(?:\?|$)/i.test(media) ? "video" : "image",
    });
  }
  return page.title || media ? page : null;
}

export function adapt(raw: JsonValue, ctx: HarvestAdaptCtx) {
  return captureFromPageDom(raw, ctx);
}
