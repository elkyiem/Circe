import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

const store = new Store({ open: false });

export const supportDialog = {
  open(): void {
    store.setState(() => ({ open: true }));
  },
  close(): void {
    store.setState((s) => (s.open ? { open: false } : s));
  },
  isOpen(): boolean {
    return store.state.open;
  },
};

export function useSupportDialogOpen(): boolean {
  return useSelector(store, (s) => s.open);
}
