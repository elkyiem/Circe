import { IRIS_EXTENSION_ID } from "@pond/schema/extension-connection";
import {
  NATIVE_HOST_NAME,
  type NativeRequest,
  type NativeResponse,
  nativeResponseSchema,
} from "@pond/schema/native";
import { readConnection } from "./connection-store";
import { createHostTransport } from "./host-transport";

async function localCall(request: NativeRequest): Promise<NativeResponse> {
  if (browser.runtime.id === IRIS_EXTENSION_ID)
    return { ok: false, error: "iris_pairing_required" };
  try {
    const response = await browser.runtime.sendNativeMessage(
      NATIVE_HOST_NAME,
      request,
    );
    const parsed = nativeResponseSchema.safeParse(response);
    return parsed.success ? parsed.data : { ok: false, error: "offline" };
  } catch {
    return { ok: false, error: "offline" };
  }
}

export const hostTransport = createHostTransport({
  read: readConnection,
  fetch: (...args) => fetch(...args),
  native: localCall,
  extension: browser.runtime.getURL("").replace(/\/$/, ""),
});

/** A paired Iris failure must never fall through to a different local Library. */
export const nativeCall = hostTransport.call;
