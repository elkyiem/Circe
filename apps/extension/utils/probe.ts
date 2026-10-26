import { z } from "zod";
import {
  isUnreachable,
  type NativeUnreachable,
  nativeCall,
} from "@/utils/native";
import { themeVarsSchema } from "@/utils/theme";

const libraryInfoSchema = z.object({
  name: z.string().min(1),
  counts: z.object({ active: z.number() }).optional().catch(undefined),
  theme: themeVarsSchema.nullish().catch(undefined),
});

type LibraryInfo = z.infer<typeof libraryInfoSchema>;

export type ProbeResult =
  | {
      state: "offline";
      reason: NativeUnreachable;
      message?: string;
      iris?: boolean;
    }
  | { state: "connected"; library: LibraryInfo };

export const OFFLINE: ProbeResult = { state: "offline", reason: "offline" };

export async function probe(): Promise<ProbeResult> {
  const result = await nativeCall({ type: "library.info" });
  if (!result.ok) {
    if (result.error.startsWith("iris_"))
      return {
        state: "offline",
        reason: "offline",
        iris: true,
        message:
          result.error === "iris_pairing_required"
            ? "Open Connection to pair this extension with your Iris host."
            : result.error === "iris_offline"
              ? "The Iris host is unreachable. Check the host and your Tailscale connection."
              : result.error === "iris_library_changed"
                ? "The Iris host opened another Library. Open Connection to pair with it."
                : "Your Iris connection expired or was revoked. Open Connection to pair again.",
      };
    if (isUnreachable(result.error))
      return { state: "offline", reason: result.error };
    /** Pond answered but rejected the request, so it's older than this extension. */
    if (result.error === "invalid")
      return { state: "offline", reason: "incompatible" };
    return OFFLINE;
  }
  const library = libraryInfoSchema.safeParse(result.data);
  if (!library.success) return { state: "offline", reason: "incompatible" };
  return { state: "connected", library: library.data };
}
