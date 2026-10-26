import {
  hasMediaThumbnail,
  isAuxiliaryKind,
  isOriginalImageKind,
  POSTER_KIND,
  THUMBNAIL_DARK_KIND,
  THUMBNAIL_KIND,
} from "@shared/save-file-names";
import sharp from "sharp";

const MAX_EDGE = 1024;

export async function renderThumbnail(
  input: string | Buffer,
): Promise<Buffer | null> {
  try {
    return await sharp(input, { failOn: "none", pages: 1 })
      .rotate()
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    return null;
  }
}

interface ThumbnailInput {
  kind: string;
  path: string;
  custom?: boolean | null;
}

export function thumbnailSource(
  files: readonly { kind: string; path: string }[],
): { kind: string; path: string } | undefined {
  return (
    files.find((file) => file.kind === POSTER_KIND) ??
    files.find((file) => isOriginalImageKind(file.kind)) ??
    files.find((file) => !isAuxiliaryKind(file.kind))
  );
}

function hasCustomThumbnail(files: readonly ThumbnailInput[]): boolean {
  return files.some(
    (file) =>
      (file.kind === THUMBNAIL_KIND || file.kind === THUMBNAIL_DARK_KIND) &&
      file.custom === true,
  );
}

/** The file a new thumbnail renders from; a thumbnail you picked is never replaced, even when forced. */
export function thumbnailToRender(
  files: readonly ThumbnailInput[],
  force: boolean,
): { kind: string; path: string } | undefined {
  if (hasCustomThumbnail(files)) return undefined;
  if (!force && hasMediaThumbnail(files)) return undefined;
  return thumbnailSource(files);
}
