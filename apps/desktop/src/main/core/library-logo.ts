import { type NativeImage, nativeImage } from "electron";
import type { LogoSource } from "../../shared/logo-crop";

/** Caps the image sent to the renderer for cropping; the logo itself is only 256px. */
const CROP_SOURCE_SIZE = 1024;

/** Downscales a picked image to the size the logo crop editor measures in. */
export function logoCropSource(image: NativeImage): LogoSource {
  const { width, height } = image.getSize();
  const scale = CROP_SOURCE_SIZE / Math.max(width, height);
  const source =
    scale >= 1
      ? image
      : image.resize({
          width: Math.max(1, Math.round(width * scale)),
          height: Math.max(1, Math.round(height * scale)),
          quality: "best",
        });
  return { src: source.toDataURL(), ...source.getSize() };
}

/** Native and browser pickers share the same crop source before the logo is cut. */
export function readLibraryLogo(
  path: string,
): { ok: true; image: LogoSource } | { ok: false; reason: "invalid_image" } {
  const image = nativeImage.createFromPath(path);
  if (image.isEmpty()) return { ok: false, reason: "invalid_image" };
  return { ok: true, image: logoCropSource(image) };
}
