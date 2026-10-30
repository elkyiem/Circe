import type { SavesImportFilesResult } from "../../shared/saves-import-contracts";
import { WebFileImportSchema } from "../../shared/web-files-contracts";
import { reviewImportDuplicates } from "../core/duplicate-import";
import { withMutationScope } from "../core/executor";
import { createFolder, setSaveFolders } from "../core/folders";
import { importFiles } from "../core/import-files";
import { runLibraryTransfer } from "../core/library-transfers";
import { createManualSave } from "../core/manual-import";
import { libraryId } from "../paths";
import { WebRequestError } from "./errors";
import { resolveImportFolders } from "./import-folders";
import type { createWebUploads } from "./uploads";

type StagedFile = Awaited<
  ReturnType<ReturnType<typeof createWebUploads>["get"]>
>;

/** Keep folder admission, imported files and assignments in one host-owned transfer. */
export function importUploadedFiles(
  raw: ReturnType<typeof WebFileImportSchema.parse>,
  staged: StagedFile[],
  expectedLibrary: string,
): Promise<SavesImportFilesResult> {
  const input = WebFileImportSchema.parse(raw);
  return runLibraryTransfer(async () => {
    if (expectedLibrary !== libraryId())
      throw new WebRequestError(
        "The active Library changed. Reload before importing.",
      );
    const directoryFolders = await withMutationScope(() =>
      resolveImportFolders({
        paths: input.paths,
        relativePaths: input.relativePaths,
        parentId: input.folderIds[0] ?? null,
      }),
    );
    const toToken = new Map(
      staged.map((file, index) => [file.path, input.paths[index] ?? ""]),
    );
    const candidates = await reviewImportDuplicates(
      staged.map((file) => file.path),
    );
    const useExisting = Object.fromEntries(
      candidates.flatMap((candidate) =>
        (input.duplicateDecisions[toToken.get(candidate.path) ?? ""] ??
          input.duplicatePolicy) === "use-existing"
          ? [[candidate.path, candidate.existingId]]
          : [],
      ),
    );
    const existingFolders = new Map<string, Set<string>>();
    for (const [path, id] of Object.entries(useExisting)) {
      const folder = directoryFolders.get(toToken.get(path) ?? "");
      if (!folder) continue;
      const assigned = existingFolders.get(id) ?? new Set<string>();
      assigned.add(folder);
      existingFolders.set(id, assigned);
    }
    const ids = new Set<string>();
    const failedPaths: string[] = [];
    for (const file of new Map(
      staged.map((file) => [file.path, file]),
    ).values()) {
      const token = toToken.get(file.path) ?? "";
      const folder = directoryFolders.get(token);
      const existing = useExisting[file.path];
      const imported = await importFiles(
        {
          paths: [file.path],
          origin: input.origin,
          tags: input.tags,
          useExisting,
          folderIds: [
            ...new Set([
              ...input.folderIds,
              ...(folder ? [folder] : []),
              ...(existing ? (existingFolders.get(existing) ?? []) : []),
            ]),
          ],
        },
        {
          createFolder,
          assignFolders: setSaveFolders,
          importFile: (data) =>
            createManualSave({ ...data, sourceId: `web-upload:${file.id}` }),
        },
      );
      if (imported.ok) for (const id of imported.ids ?? []) ids.add(id);
      if (imported.failedPaths?.length) failedPaths.push(token);
    }
    return ids.size
      ? { ok: true, ids: [...ids], failedPaths }
      : { ok: false, error: "no_files", failedPaths };
  });
}
