import { CaptureReceiptSchema } from "@pond/schema/capture";
import type { Source } from "@pond/schema/db";
import type { NativeRequest, NativeResponse } from "@pond/schema/native";
import { withMutationScope } from "../core/executor";
import { readLibraryIdentity } from "../core/library-identity";
import { liveNativePorts } from "../native/ports";
import { dispatchNative } from "../native/rpc";
import { libraryId, libraryRoot } from "../paths";
import {
  getPendingSessionSource,
  setPendingSessionSource,
} from "../pending-session";
import type { ExtensionHost } from "./extension-api";
import type { ExtensionAuth } from "./extension-auth";

export function createExtensionBridge(auth: ExtensionAuth) {
  let pendingLibrary: string | null = null;
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
        const response = await dispatchNative(request, ports);
        if (
          response.ok &&
          (request.type === "capture.accept" ||
            request.type === "capture.status")
        ) {
          const receipt = CaptureReceiptSchema.parse(response.data);
          return {
            ok: true,
            data: {
              ...receipt,
              library: expected,
              error: receipt.error
                ? "Capture failed. Inspect Downloads in Iris."
                : undefined,
            },
          };
        }
        return response;
      }),
  };
  return {
    host,
    async connectSource(source: Source) {
      if (!auth.hasPair(libraryId()))
        return { ok: false, mode: "extension" as const };
      pendingLibrary = libraryId();
      setPendingSessionSource(source);
      return { ok: true, mode: "extension" as const };
    },
  };
}
