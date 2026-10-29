import type {
  HostLocationEntry,
  HostLocationListing,
  HostLocationPurpose,
  HostLocationsRequest,
} from "@shared/web-host-locations";
import { Store } from "@tanstack/store";
export interface HostLocationSelection {
  entry: HostLocationEntry;
  name?: string;
}
interface PickerInput {
  title: string;
  purpose: HostLocationPurpose;
  name?: string;
  initial?: string;
  list(
    input: Extract<HostLocationsRequest, { action: "list" }>,
  ): Promise<HostLocationListing>;
  mkdir(
    input: Extract<HostLocationsRequest, { action: "mkdir" }>,
  ): Promise<HostLocationEntry>;
}
export const hostLocationPickerStore = new Store<
  (PickerInput & { id: number }) | null
>(null);
let sequence = 0;
let settle: ((selection: HostLocationSelection | null) => void) | null = null;
export function pickHostLocation(
  input: PickerInput,
): Promise<HostLocationSelection | null> {
  if (settle)
    return Promise.reject(
      new Error("Finish the current host-location selection first."),
    );
  return new Promise((resolve) => {
    settle = resolve;
    hostLocationPickerStore.setState(() => ({ ...input, id: ++sequence }));
  });
}
export function finishHostLocation(
  selection: HostLocationSelection | null,
): void {
  const resolve = settle;
  settle = null;
  hostLocationPickerStore.setState(() => null);
  resolve?.(selection);
}
