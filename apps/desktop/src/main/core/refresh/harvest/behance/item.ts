/// <reference lib="dom" />

import type { JsonValue } from "@pond/schema/json";
import { captureFromPageDom, type HarvestAdaptCtx } from "../from-page";
import { buildItemExpression } from "../lib/expression";

interface BehancePage {
  title?: string;
  description?: string;
  author?: string;
  mediaUrls: Array<{ url: string; type: "image" }>;
  meta: { publishedAt?: string; authorUrl?: string };
}

interface BehanceSize {
  url?: string;
  width?: number | null;
}

export function buildExpression(projectId: string): string {
  return buildItemExpression(() => ({}), inPageBehanceHarvest, projectId);
}

/** The store keeps every module size; the widest is the `source` upload, ahead of `max_3840` and `disp`. */
async function inPageBehanceHarvest(): Promise<BehancePage | null> {
  const deadline = Date.now() + 12_000;
  let raw: string | null | undefined;
  while (Date.now() < deadline) {
    raw = document.getElementById("beconfig-store_state")?.textContent;
    if (raw) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!raw) return null;
  const project = JSON.parse(raw)?.project?.project;
  if (!project) return null;
  const pick = (sizes: BehanceSize[] = []) =>
    sizes.reduce<BehanceSize | undefined>(
      (best, s) => (!best || (s.width ?? 0) > (best.width ?? 0) ? s : best),
      undefined,
    )?.url;
  const mediaUrls: BehancePage["mediaUrls"] = [];
  for (const module of project.modules ?? []) {
    if (module?.__typename !== "ImageModule") continue;
    const url = pick(module.imageSizes?.allAvailable);
    if (url) mediaUrls.push({ url, type: "image" });
  }
  if (mediaUrls.length === 0) {
    const cover = pick(project.covers?.allAvailable);
    if (cover) mediaUrls.push({ url: cover, type: "image" });
  }
  const owner = project.owners?.[0];
  const page: BehancePage = { mediaUrls, meta: {} };
  if (project.name) page.title = project.name;
  if (project.description) page.description = project.description;
  if (owner?.displayName) page.author = owner.displayName;
  if (owner?.url) page.meta.authorUrl = owner.url;
  if (project.publishedOn) {
    page.meta.publishedAt = new Date(project.publishedOn * 1000).toISOString();
  }
  return page;
}

export function adapt(raw: JsonValue, ctx: HarvestAdaptCtx) {
  return captureFromPageDom(raw, ctx);
}
