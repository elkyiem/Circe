import { CaptureReceiptSchema } from "@pond/schema/capture";
import type { NativeResponse } from "@pond/schema/native";

export type CaptureStatus =
  | "sending"
  | "saved"
  | "duplicate"
  | "failed"
  | "offline";

export type CaptureOutcome =
  | { status: "sending"; id: string }
  | { status: "saved" | "duplicate"; id: string; saveId?: string }
  | { status: "failed"; id: string; message: string }
  | { status: "offline"; id: string };

const NATIVE_ERRORS = new Map([
  [
    "iris_pairing_required",
    "Pair the Iris extension in Connection before saving.",
  ],
  [
    "iris_auth_required",
    "Reconnect the Iris extension to authorize this Library.",
  ],
  [
    "iris_library_changed",
    "The host opened another Library. Pair the Iris extension again.",
  ],
  [
    "iris_invalid_response",
    "The Iris host returned an unreadable reply. Update Iris and try again.",
  ],
  [
    "too_large",
    "This capture exceeds the 8 MB extension limit. Save a smaller region.",
  ],
  ["unsupported_url", "Pond can't save this page. Try a screenshot instead."],
  [
    "capture_unavailable",
    "This version of Pond can't take saves from the browser. Update Pond.",
  ],
  ["invalid", "Pond couldn't read this save. Update Pond and try again."],
]);

const GENERIC_ERROR = "Pond couldn't save this. Try again.";

export function outcomeFromResponse(
  id: string,
  response: NativeResponse,
): CaptureOutcome {
  if (!response.ok) {
    if (response.error === "offline" || response.error === "iris_offline")
      return { status: "offline", id };
    return {
      status: "failed",
      id,
      message: NATIVE_ERRORS.get(response.error) ?? GENERIC_ERROR,
    };
  }
  const receipt = CaptureReceiptSchema.safeParse(response.data);
  if (!receipt.success) return { status: "sending", id };
  const { state, saveIds, duplicateCount, error } = receipt.data;
  if (state === "failed" || state === "cancelled") {
    return { status: "failed", id, message: error ?? GENERIC_ERROR };
  }
  if (state !== "complete") return { status: "sending", id };
  const saveId = saveIds[0];
  const status =
    duplicateCount > 0 && duplicateCount === saveIds.length
      ? "duplicate"
      : "saved";
  return saveId ? { status, id, saveId } : { status, id };
}

export function isSettled(outcome: CaptureOutcome): boolean {
  return outcome.status !== "sending";
}
