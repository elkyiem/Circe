import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import { beginLibraryLayoutTransition } from "@/features/library/lib/library-layout-transition";
import { navigationHistory } from "@/features/library/state/navigation-history";
import type { LibraryNav } from "@/shared/lib/library-nav";
import { isBrowserRuntime } from "@/shared/lib/platform";

export type { LibraryNav } from "@/shared/lib/library-nav";

export const SIDEBAR_WIDTH_DEFAULT = 220;
export const SIDEBAR_WIDTH_MIN = 256;
export const SIDEBAR_WIDTH_MAX = 420;

export const DETAILS_WIDTH_DEFAULT = 320;
export const DETAILS_WIDTH_MIN = 280;
export const DETAILS_WIDTH_MAX = 480;

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === "0") return false;
    if (stored === "1") return true;
  } catch {}
  return fallback;
}

function readWidth(
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored == null) return fallback;
    const next = Number.parseInt(stored, 10);
    if (!Number.isFinite(next)) return fallback;
    return Math.min(max, Math.max(min, next));
  } catch {
    return fallback;
  }
}

function writeWidth(key: string, width: number): void {
  try {
    window.localStorage.setItem(key, String(width));
  } catch {}
}

function overlayPanels(): boolean {
  return isBrowserRuntime() && window.matchMedia("(max-width: 700px)").matches;
}

interface ChromeState {
  nav: LibraryNav;
  sidebarOpen: boolean;
  sidebarWidth: number;
  detailsOpen: boolean;
  detailsWidth: number;
}

const store = new Store<ChromeState>({
  nav: { kind: "all" },
  sidebarOpen: readFlag("pond.sidebar", true),
  sidebarWidth: readWidth(
    "pond.sidebarWidth",
    SIDEBAR_WIDTH_DEFAULT,
    SIDEBAR_WIDTH_MIN,
    SIDEBAR_WIDTH_MAX,
  ),
  detailsOpen: readFlag("pond.details", true),
  detailsWidth: readWidth(
    "pond.detailsWidth",
    DETAILS_WIDTH_DEFAULT,
    DETAILS_WIDTH_MIN,
    DETAILS_WIDTH_MAX,
  ),
});

export const libraryChrome = {
  getState(): ChromeState {
    return store.state;
  },
  setNav(nav: LibraryNav): void {
    navigationHistory.record(nav);
    store.setState((s) => ({ ...s, nav }));
  },
  toggleSidebar(): void {
    beginLibraryLayoutTransition();
    if (!store.state.sidebarOpen && overlayPanels())
      libraryChrome.setDetailsOpen(false);
    store.setState((s) => {
      const sidebarOpen = !s.sidebarOpen;
      try {
        window.localStorage.setItem("pond.sidebar", sidebarOpen ? "1" : "0");
      } catch {}
      return { ...s, sidebarOpen };
    });
  },
  setSidebarWidth(sidebarWidth: number): void {
    const next = Math.min(
      SIDEBAR_WIDTH_MAX,
      Math.max(SIDEBAR_WIDTH_MIN, Math.round(sidebarWidth)),
    );
    writeWidth("pond.sidebarWidth", next);
    store.setState((s) =>
      s.sidebarWidth === next ? s : { ...s, sidebarWidth: next },
    );
  },
  setDetailsOpen(detailsOpen: boolean): void {
    if (store.state.detailsOpen === detailsOpen) return;
    beginLibraryLayoutTransition();
    if (detailsOpen && store.state.sidebarOpen && overlayPanels())
      libraryChrome.toggleSidebar();
    try {
      window.localStorage.setItem("pond.details", detailsOpen ? "1" : "0");
    } catch {}
    store.setState((s) => ({ ...s, detailsOpen }));
  },
  toggleDetails(): void {
    libraryChrome.setDetailsOpen(!store.state.detailsOpen);
  },
  setDetailsWidth(detailsWidth: number): void {
    const next = Math.min(
      DETAILS_WIDTH_MAX,
      Math.max(DETAILS_WIDTH_MIN, Math.round(detailsWidth)),
    );
    writeWidth("pond.detailsWidth", next);
    store.setState((s) =>
      s.detailsWidth === next ? s : { ...s, detailsWidth: next },
    );
  },
};

export function useLibraryNav(): LibraryNav {
  return useSelector(store, (s) => s.nav);
}

export function useSidebarOpen(): boolean {
  return useSelector(store, (s) => s.sidebarOpen);
}

export function useSidebarWidth(): number {
  return useSelector(store, (s) => s.sidebarWidth);
}

export function useDetailsOpen(): boolean {
  return useSelector(store, (s) => s.detailsOpen);
}

export function useDetailsWidth(): number {
  return useSelector(store, (s) => s.detailsWidth);
}
