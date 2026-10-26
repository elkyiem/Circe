import { WebImportRelativePathsSchema } from "../../shared/web-files-contracts";
import { createFolder, listFolders } from "../core/folders";
import { WebRequestError } from "./errors";

const runtime = { createFolder, listFolders };

/** Called inside the host mutation scope. Retried uploads reuse the same folder tree. */
export async function resolveImportFolders(
  input: {
    paths: string[];
    relativePaths: Record<string, string>;
    parentId: string | null;
  },
  dependencies = runtime,
) {
  const relativePaths = WebImportRelativePathsSchema.parse(input.relativePaths);
  const selected = new Set(input.paths);
  const names = new Set<string>();
  for (const [token, path] of Object.entries(relativePaths)) {
    if (!selected.has(token) || names.has(path))
      throw new WebRequestError(
        "The uploaded folder selection is inconsistent.",
        422,
      );
    names.add(path);
  }
  const folders = await dependencies.listFolders();
  if (input.parentId && !folders.some((folder) => folder.id === input.parentId))
    throw new WebRequestError("The destination folder no longer exists.", 404);
  const resolved = new Map<string, string>();
  for (const [token, path] of Object.entries(relativePaths)) {
    let parentId = input.parentId;
    for (const segment of path.split("/").slice(0, -1)) {
      const name = segment.trim();
      const existing = folders.find(
        (folder) =>
          folder.parentId === parentId &&
          folder.name.toLowerCase() === name.toLowerCase(),
      );
      const folder =
        existing ?? (await dependencies.createFolder({ name, parentId }));
      if (!existing) folders.push(folder);
      parentId = folder.id;
    }
    if (parentId) resolved.set(token, parentId);
  }
  return resolved;
}
