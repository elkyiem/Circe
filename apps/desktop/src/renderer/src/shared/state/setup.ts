import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

export type SetupProfile = "new" | "existing";

/** A step setup can open on directly, instead of the first one. */
export type SetupStart = "import";

interface SetupState {
  open: boolean;
  profile: SetupProfile;
  start: SetupStart | null;
}

const store = new Store<SetupState>({
  open: false,
  profile: "existing",
  start: null,
});

export const setupFlow = {
  open(profile: SetupProfile, start: SetupStart | null = null): void {
    store.setState(() => ({ open: true, profile, start }));
  },
  close(): void {
    store.setState((s) => (s.open ? { ...s, open: false } : s));
  },
  isOpen(): boolean {
    return store.state.open;
  },
};

export function useSetupFlow(): SetupState {
  return useSelector(store, (s) => s);
}
