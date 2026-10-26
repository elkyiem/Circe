import { z } from "zod";
import { nativeCall } from "@/utils/native";
import { themeVarsSchema } from "@/utils/theme";

const libraryInfoSchema = z.object({
  name: z.string().min(1),
  counts: z.object({ active: z.number() }).optional().catch(undefined),
  theme: themeVarsSchema.nullish().catch(undefined),
});

type LibraryInfo = z.infer<typeof libraryInfoSchema>;

export type ProbeResult =
  | { state: "offline"; message?: string; iris?: boolean }
  | { state: "connected"; library: LibraryInfo };

export async function probe(): Promise<ProbeResult> {
  const result = await nativeCall({ type: "library.info" });
  if (!result.ok)
    return {
      state: "offline",
      message:
        result.error === "iris_pairing_required"
          ? "Open Connection to pair this extension with your Iris host."
          : result.error === "iris_offline"
            ? "The Iris host is unreachable. Check the host and your Tailscale connection."
            : result.error === "iris_auth_required"
              ? "Your Iris connection expired or was revoked. Open Connection to pair again."
              : result.error === "iris_library_changed"
                ? "The Iris host opened another Library. Open Connection to pair with it."
                : undefined,
      iris: result.error.startsWith("iris_"),
    };
  const library = libraryInfoSchema.safeParse(result.data);
  if (!library.success) return { state: "offline" };
  return { state: "connected", library: library.data };
}
