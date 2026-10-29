import { realpath, stat } from "node:fs/promises";
import { isPathInside } from "../lib/path-identity";

/** Watchers may move source files, so lexical paths are insufficient for overlap checks. */
export async function autoImportLocation(path: string, library: string) {
  const [directory, root] = await Promise.all([
    realpath(path),
    realpath(library),
  ]);
  const identity = await stat(directory);
  if (!identity.isDirectory()) throw new Error("Choose a folder to watch.");
  if (
    isPathInside(root, directory, { includeSame: true }) ||
    isPathInside(directory, root, { includeSame: true })
  )
    throw new Error(
      "Choose a watched folder outside the Library and its parent folders.",
    );
  return { path: directory, dev: identity.dev, ino: identity.ino };
}
