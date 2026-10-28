import { parseMode } from "@/features/saves/lib/list";
import { listBaseFromPath } from "@/features/search/query";

let lastListPath = "/";
let lastListSearch = "";

function isSavePath(pathname: string): boolean {
  return /^\/save\/[^/]+\/?$/.test(pathname);
}

function isLibraryListPath(pathname: string): boolean {
  if (isSavePath(pathname) || pathname.startsWith("/fish/")) return false;
  if (pathname.startsWith("/sources")) {
    return false;
  }
  if (pathname.startsWith("/downloads") || pathname.startsWith("/canvas/"))
    return true;
  return parseMode(listBaseFromPath(pathname)) !== null;
}

/** Library grids where the details column follows the current Save selection. */
export function isSaveCollectionPath(pathname: string): boolean {
  if (isSavePath(pathname)) return false;
  return parseMode(listBaseFromPath(pathname)) !== null;
}

export function rememberListPath(pathname: string, search = ""): void {
  if (!isLibraryListPath(pathname)) return;
  lastListPath = listBaseFromPath(pathname);
  lastListSearch = search;
}

export function getLastListPath(): string {
  return lastListPath;
}

export function getLastListSearch(): string {
  return lastListSearch;
}

export function listPathForLocation(pathname: string): string {
  if (isSavePath(pathname)) return lastListPath;
  if (isLibraryListPath(pathname)) return listBaseFromPath(pathname);
  return lastListPath;
}
