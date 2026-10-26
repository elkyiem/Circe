import type { createBrowserHistory } from "@tanstack/react-router";
import { z } from "zod";
import type { LibraryNav } from "@/shared/lib/library-nav";

const Scope = z
  .object({
    folder: z.string().min(1).max(200).optional(),
    tag: z.string().trim().min(1).max(100).optional(),
    scope: z.enum(["random", "uncategorized"]).optional(),
  })
  .refine(
    (input) =>
      Object.values(input).filter((value) => value !== undefined).length <= 1,
  );
const scopeKeys = ["folder", "tag", "scope"];
const pageNav = new Map<string, LibraryNav>([
  ["/trash", { kind: "trash" }],
  ["/sources", { kind: "sources" }],
  ["/downloads", { kind: "downloads" }],
  ["/recents", { kind: "recents" }],
  ["/recently-added", { kind: "recentlyAdded" }],
]);
function scopePath(pathname: string) {
  return pathname === "/" || /^\/save\/[^/]+\/?$/.test(pathname);
}
function fromLocation(location: {
  pathname: string;
  search: string;
}): LibraryNav | null {
  const page = pageNav.get(location.pathname);
  if (page) return page;
  if (!scopePath(location.pathname)) return null;
  const search = new URLSearchParams(location.search);
  if (scopeKeys.some((key) => search.getAll(key).length > 1))
    return { kind: "all" };
  const parsed = Scope.safeParse(Object.fromEntries(search));
  if (!parsed.success) return { kind: "all" };
  const { folder, tag, scope } = parsed.data;
  if (folder) return { kind: "folder", id: folder };
  if (tag) return { kind: "tag", name: tag };
  return scope ? { kind: scope } : { kind: "all" };
}
function withScope(href: string, nav: LibraryNav) {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const url = new URL(href, "https://iris.invalid");
  if (
    !scopePath(url.pathname) ||
    scopeKeys.some((key) => url.searchParams.has(key))
  )
    return href;
  if (nav.kind === "folder") url.searchParams.set("folder", nav.id);
  else if (nav.kind === "tag") url.searchParams.set("tag", nav.name);
  else if (nav.kind === "random" || nav.kind === "uncategorized")
    url.searchParams.set("scope", nav.kind);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Carry the existing Library scope through the real browser history, including Save reloads. */
export function bindBrowserLibraryHistory(
  history: ReturnType<typeof createBrowserHistory>,
  state: { getNav(): LibraryNav; setNav(nav: LibraryNav): void },
) {
  const push = history.push;
  const replace = history.replace;
  history.push = (href, ...args) =>
    push(withScope(href, state.getNav()), ...args);
  history.replace = (href, ...args) =>
    replace(withScope(href, state.getNav()), ...args);
  const restore = () => {
    const nav = fromLocation(history.location);
    if (nav && JSON.stringify(nav) !== JSON.stringify(state.getNav()))
      state.setNav(nav);
  };
  restore();
  const detach = history.subscribe(restore);
  return () => {
    detach();
    history.push = push;
    history.replace = replace;
  };
}
