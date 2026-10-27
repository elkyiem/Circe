import { CaptureReceiptSchema } from "@pond/schema/capture";
import type { Source } from "@pond/schema/db";
import type { NativeRequest, NativeResponse } from "@pond/schema/native";
import { IPC } from "../../shared/constants";
import { onCaptureComplete } from "../core/captures";
import { withMutationScope } from "../core/executor";
import { readLibraryIdentity } from "../core/library-identity";
import { broadcast } from "../lib/broadcast";
import { liveNativePorts } from "../native/ports";
import { dispatchNative } from "../native/rpc";
import { libraryId, libraryRoot } from "../paths";
import {
  getPendingSessionSource,
  setPendingSessionSource,
} from "../pending-session";
import type { ExtensionHost } from "./extension-api";
import type { ExtensionAuth } from "./extension-auth";
import { createWebFishHandoff } from "./fish-handoff";

export function createExtensionBridge(auth: ExtensionAuth) {
  let pendingLibrary: string | null = null;
  const handoff = createWebFishHandoff({
    libraryId,
    fishExists: async (id) => {
      const { readFish } = await import("../core/fish/store");
      return readFish(id) !== null;
    },
    open: (payload) => broadcast(IPC.fishOpen, payload),
    now: Date.now,
  });
  const stopHandoff = onCaptureComplete(handoff.complete);
  const host: ExtensionHost = {
    auth,
    libraryId,
    libraryName: () => readLibraryIdentity(libraryRoot()).name,
    dispatch: (
      request: NativeRequest,
      expected: string,
    ): Promise<NativeResponse> =>
      withMutationScope(async () => {
        if (expected !== libraryId())
          return { ok: false, error: "library_changed" };
        const ports = liveNativePorts();
        if (request.type === "session.pending") {
          const source =
            pendingLibrary === expected ? getPendingSessionSource() : null;
          return {
            ok: true,
            data: source ? { source } : null,
          };
        }
        if (
          request.type === "session.import" &&
          (pendingLibrary !== expected ||
            getPendingSessionSource() !== request.source)
        )
          return { ok: false, error: "source_connection_not_requested" };
        if (request.type === "library.info") {
          const { path: _path, ...info } = await ports.libraryInfo();
          return { ok: true, data: info };
        }
        let response: NativeResponse;
        if (request.type === "capture.accept") {
          const { fishId, ...capture } = request;
          if (fishId) handoff.remember(request.draft.id, fishId);
          response = await dispatchNative(capture, ports);
        } else response = await dispatchNative(request, ports);
        if (
          response.ok &&
          (request.type === "capture.accept" ||
            request.type === "capture.status")
        ) {
          const receipt = CaptureReceiptSchema.parse(response.data);
          if (receipt.state === "complete") await handoff.complete(receipt);
          return {
            ok: true,
            data: {
              ...receipt,
              library: expected,
              error: receipt.error
                ? "Capture failed. Inspect Downloads in Circé."
                : undefined,
            },
          };
        }
        return response;
      }),
  };
  return {
    host,
    close() {
      stopHandoff();
      handoff.clear();
    },
    async connectSource(source: Source) {
      if (!auth.hasPair(libraryId()))
        return { ok: false, mode: "extension" as const };
      pendingLibrary = libraryId();
      setPendingSessionSource(source);
      return { ok: true, mode: "extension" as const };
    },
  };
}
