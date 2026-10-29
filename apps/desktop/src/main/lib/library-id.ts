import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { z } from "zod";
import {
  DEFAULT_LIBRARY_NAME,
  LIBRARY_SCHEMA_VERSION,
} from "../../shared/constants";
import { renameSyncWithRetry } from "./rename-retry";

export const UNBOUND_LIBRARY_ID = "unbound";

export const LIBRARY_METADATA_RECOVERY =
  "Restore it from a backup or choose another Library.";

export class LibraryMetadataError extends Error {
  readonly file: string;
  readonly summary: string;

  constructor(file: string, cause: unknown) {
    const summary = `metadata.json in ${libraryNameFromPath(dirname(file))} is unreadable.`;
    super(`${summary} ${LIBRARY_METADATA_RECOVERY}`, { cause });
    this.file = file;
    this.summary = summary;
  }
}

interface LibraryMetadata {
  id: string;
  name: string;
  createdAt: number;
  schemaVersion: number;
  appVersion: string;
}

export function libraryNameFromPath(root: string): string {
  return basename(root).replace(/\.(pond|library)$/i, "") || "Library";
}

export function resolveLibraryId(root: string, committed: boolean): string {
  if (committed && existsSync(root)) return readOrCreateLibraryId(root);
  return UNBOUND_LIBRARY_ID;
}

const StoredMetadataSchema = z.object({ id: z.string().min(1) });

/** A restored snapshot is independently editable; it must not reuse its source's index or session scope. */
export function forkLibraryId(root: string): string {
  const file = join(root, "metadata.json");
  const metadata = z
    .record(z.string(), z.json())
    .parse(JSON.parse(readFileSync(file, "utf8")));
  StoredMetadataSchema.parse(metadata);
  const id = randomId();
  const temporary = join(root, `.metadata-${id}.tmp`);
  try {
    writeFileSync(temporary, JSON.stringify({ ...metadata, id }, null, 2), {
      flag: "wx",
    });
    renameSyncWithRetry(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
  return id;
}

export function readOrCreateLibraryId(
  root: string,
  name: string = DEFAULT_LIBRARY_NAME,
): string {
  return readLibraryId(root) ?? createLibraryMetadata(root, name);
}

export function readLibraryId(root: string): string | null {
  const file = join(root, "metadata.json");
  let raw: string;
  try {
    raw = readFileSync(file, "utf-8");
  } catch (cause) {
    if (isMissing(cause)) return null;
    throw new LibraryMetadataError(file, cause);
  }
  try {
    return StoredMetadataSchema.parse(JSON.parse(raw)).id;
  } catch (cause) {
    throw new LibraryMetadataError(file, cause);
  }
}

function isMissing(cause: unknown): boolean {
  return (
    cause instanceof Error &&
    "code" in cause &&
    (cause.code === "ENOENT" || cause.code === "ENOTDIR")
  );
}

function createLibraryMetadata(root: string, name: string): string {
  const body: LibraryMetadata = {
    id: randomId(),
    name,
    createdAt: Date.now(),
    schemaVersion: LIBRARY_SCHEMA_VERSION,
    appVersion: process.env.npm_package_version ?? "0.0.1",
  };
  mkdirSync(root, { recursive: true });
  /** `wx` fails instead of replacing a metadata.json written since the read. */
  writeFileSync(join(root, "metadata.json"), JSON.stringify(body, null, 2), {
    flag: "wx",
  });
  return body.id;
}

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
