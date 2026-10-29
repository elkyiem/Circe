import { link, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { mapConcurrent } from "../../shared/map-concurrent";
import type { QueryInput, QueryResult } from "../../shared/query-contracts";
import type { EagleImportProgress } from "../../shared/saves-import-contracts";
import { WebEagleImportSchema } from "../../shared/web-files-contracts";
import { createPrivateWorkDirectories } from "../lib/private-work-directories";
import { WebRequestError } from "./errors";
import type { createWebUploads } from "./uploads";

/** Assemble only granted visiting-device files; native import receives one private complete tree. */
export function createWebEagleImport(input: {
  root: string;
  uploads: Pick<ReturnType<typeof createWebUploads>, "get">;
  importLibrary(
    params: QueryInput<"saves.importEagleLibrary">,
    progress: (value: EagleImportProgress) => void,
  ): Promise<QueryResult<"saves.importEagleLibrary">>;
  progress(value: EagleImportProgress): void;
}) {
  const work = createPrivateWorkDirectories(input.root, "eagle-import");
  return async (
    raw: ReturnType<typeof WebEagleImportSchema.parse>,
    library: string,
  ) => {
    const request = WebEagleImportSchema.parse(raw);
    const roots = new Set(request.files.map((file) => file.path.split("/")[0]));
    const paths = request.files.map((file) =>
      file.path.split("/").slice(1).join("/"),
    );
    if (
      roots.size !== 1 ||
      paths.some((path) => !path) ||
      new Set(paths.map((path) => path.normalize("NFC").toLowerCase())).size !==
        paths.length
    )
      throw new WebRequestError(
        "Choose one Eagle Library folder with distinct file names.",
        422,
      );
    const staged = await mapConcurrent(request.files, 8, (file) =>
      input.uploads.get(file.token, library),
    );
    const directory = await work.create();
    try {
      const tree = join(directory, "library");
      await mkdir(tree, { mode: 0o700 });
      await mapConcurrent(staged, 8, async (file, index) => {
        const path = paths[index];
        if (!path)
          throw new WebRequestError(
            "Choose a complete Eagle Library folder.",
            422,
          );
        const destination = join(tree, path);
        await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
        await link(file.path, destination);
      });
      return await input.importLibrary(
        {
          path: tree,
          dryRun: request.dryRun,
          importShortcuts: request.importShortcuts,
          progressId: request.progressId,
        },
        input.progress,
      );
    } finally {
      await work.remove(directory);
    }
  };
}
