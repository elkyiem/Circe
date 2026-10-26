import { nativeImage } from "electron";
import type { QueryResult } from "../../shared/query-contracts";

/** Native and browser pickers share Pond's portable 256-pixel PNG representation. */
export function readLibraryLogo(
  path: string,
): QueryResult<"library.identity.pickIcon"> {
  const image = nativeImage.createFromPath(path);
  if (image.isEmpty()) return { ok: false, reason: "invalid_image" };
  return {
    ok: true,
    icon: image
      .resize({ width: 256, height: 256, quality: "best" })
      .toDataURL(),
  };
}
