import { IRIS_EXTENSION_ID } from "@pond/schema/extension-connection";
import {
  NATIVE_HOST_NAME,
  type NativeRequest,
  type NativeResponse,
  nativeResponseSchema,
  SAFARI_HOST_NAME,
} from "@pond/schema/native";
import { readConnection } from "./connection-store";
import { createHostTransport } from "./host-transport";

export type NativeUnreachable =
  | "offline"
  | "host_missing"
  | "host_forbidden"
  | "host_failed"
  | "incompatible";

const UNREACHABLE: ReadonlySet<string> = new Set<NativeUnreachable>([
  "offline",
  "host_missing",
  "host_forbidden",
  "host_failed",
  "incompatible",
]);

export function isUnreachable(error: string): error is NativeUnreachable {
  return UNREACHABLE.has(error);
}

/** Maps Chromium's and Firefox's `sendNativeMessage` rejections onto what you can fix. */
export function unreachableFromMessage(message: string): NativeUnreachable {
  if (/forbidden|does not have permission/i.test(message))
    return "host_forbidden";
  if (/not found|no such native application/i.test(message))
    return "host_missing";
  if (/exited|failed to start|communicating|disconnected/i.test(message))
    return "host_failed";
  return "offline";
}

/** Safari routes native messages to the handler in Pond's app extension, not `pond-native-host`. */
const HOST_NAME =
  import.meta.env.BROWSER === "safari" ? SAFARI_HOST_NAME : NATIVE_HOST_NAME;

async function localCall(request: NativeRequest): Promise<NativeResponse> {
  if (browser.runtime.id === IRIS_EXTENSION_ID)
    return { ok: false, error: "iris_pairing_required" };
  try {
    const response = await browser.runtime.sendNativeMessage(
      HOST_NAME,
      request,
    );
    const parsed = nativeResponseSchema.safeParse(response);
    return parsed.success ? parsed.data : { ok: false, error: "incompatible" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: unreachableFromMessage(message) };
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
