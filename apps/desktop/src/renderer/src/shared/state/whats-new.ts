import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

interface WhatsNewState {
  open: boolean;
  /** Versions to show; null shows every bundled entry. */
  versions: readonly string[] | null;
}

const SEEN_KEY = "pond:whatsNewSeenVersion";

const store = new Store<WhatsNewState>({ open: false, versions: null });

/** The app version What's New last ran for, or null on a first run. */
export function readWhatsNewSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

export function writeWhatsNewSeen(version: string): void {
  try {
    localStorage.setItem(SEEN_KEY, version);
  } catch {}
}

export const whatsNewDialog = {
  open(versions: readonly string[] | null = null): void {
    store.setState(() => ({ open: true, versions }));
  },
  close(): void {
    store.setState((s) => (s.open ? { ...s, open: false } : s));
  },
  isOpen(): boolean {
    return store.state.open;
  },
};

export function useWhatsNewDialog(): WhatsNewState {
  return useSelector(store, (s) => s);
}
