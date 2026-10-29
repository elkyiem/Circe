import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, readdir, realpath, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type {
  HostDestination,
  HostLocationEntry,
  HostLocationListing,
  HostLocationPurpose,
  HostLocationsRequest,
} from "../../shared/web-host-locations";
import { HostLocationNameSchema } from "../../shared/web-host-locations";
import { LibraryMetadataError, readLibraryId } from "../lib/library-id";
import { isPathInside, isSamePath } from "../lib/path-identity";
import { WebRequestError } from "./errors";

export interface HostLocationScope {
  library: string;
  session: string;
}
interface HostLocationRoot {
  name: string;
  path: string;
}
interface LocationGrant {
  scope: string;
  purpose: HostLocationPurpose;
  root: string;
  path: string;
  device: number;
  inode: number;
  identity: string | null;
  expires: number;
  entry: HostLocationEntry;
}
class LocationGrantLimitError extends WebRequestError {
  constructor() {
    super("Close this picker and try again in a few minutes.", 422);
  }
}
const unavailableCodes = new Set([
  "ENOENT",
  "ENOTDIR",
  "EACCES",
  "EPERM",
  "ELOOP",
]);
function locationIdentity(path: string): string | null {
  try {
    return readLibraryId(path);
  } catch (error) {
    if (error instanceof LibraryMetadataError) return null;
    throw error;
  }
}
/** Display paths confer no authority; only canonical, scoped selections cross into native operations. */
export function createHostLocations(input: {
  roots(): Promise<HostLocationRoot[]>;
  now?: () => number;
}) {
  const now = input.now ?? Date.now;
  const grants = new Map<string, LocationGrant>();
  const byPath = new Map<string, string>();
  const ttl = 10 * 60 * 1000;
  const scopeKey = (scope: HostLocationScope) =>
    createHash("sha256")
      .update(`${scope.library}\0${scope.session}`)
      .digest("hex");
  function prune() {
    for (const [token, grant] of grants)
      if (grant.expires <= now()) {
        grants.delete(token);
      }
    for (const [path, token] of byPath)
      if (!grants.has(token)) byPath.delete(path);
  }
  async function issue(
    root: string,
    path: string,
    purpose: HostLocationPurpose,
    scope: HostLocationScope,
    name = basename(path),
  ) {
    const canonical = await realpath(path);
    if (!isSamePath(root, canonical) && !isPathInside(root, canonical))
      throw new WebRequestError(
        "This folder is outside the selected host location.",
        422,
      );
    const info = await stat(canonical);
    if (!info.isDirectory())
      throw new WebRequestError("Choose a folder on the host.", 422);
    prune();
    const key = JSON.stringify([scopeKey(scope), purpose, root, canonical]);
    const previous = byPath.get(key);
    const manifest = existsSync(join(canonical, "pond-backup-manifest.json"));
    const bundleName = /\.pond$/i.test(canonical);
    const items = existsSync(join(canonical, "items"));
    const identity =
      bundleName || items || manifest ? locationIdentity(canonical) : null;
    const kind =
      bundleName || (identity !== null && (items || manifest))
        ? manifest
          ? "backup"
          : "library"
        : "directory";
    const existing = previous ? grants.get(previous) : undefined;
    if (
      existing &&
      existing.device === info.dev &&
      existing.inode === info.ino &&
      existing.entry.kind === kind &&
      existing.identity === identity
    )
      return existing.entry;
    if (previous) grants.delete(previous);
    if (grants.size >= 16384) throw new LocationGrantLimitError();
    const handle = randomUUID();
    const entry = {
      handle,
      name,
      path: canonical,
      kind,
    } satisfies HostLocationEntry;
    grants.set(handle, {
      scope: scopeKey(scope),
      purpose,
      root,
      path: canonical,
      device: info.dev,
      inode: info.ino,
      identity,
      expires: now() + ttl,
      entry,
    });
    byPath.set(key, handle);
    return entry;
  }
  async function grantFor(
    handle: string,
    purpose: HostLocationPurpose,
    scope: HostLocationScope,
  ) {
    prune();
    const grant = grants.get(handle);
    if (!grant || grant.scope !== scopeKey(scope) || grant.purpose !== purpose)
      throw new WebRequestError(
        "This host selection expired. Choose the location again.",
        422,
      );
    const canonical = await realpath(grant.path).catch(() => null);
    if (
      !canonical ||
      !isSamePath(canonical, grant.path) ||
      (!isSamePath(grant.root, canonical) &&
        !isPathInside(grant.root, canonical))
    )
      throw new WebRequestError(
        "This host folder moved. Choose the location again.",
        422,
      );
    if (
      grant.entry.kind !== "directory" &&
      locationIdentity(canonical) !== grant.identity
    )
      throw new WebRequestError("This Library changed. Choose it again.", 422);
    const info = await stat(canonical);
    if (
      !info.isDirectory() ||
      info.dev !== grant.device ||
      info.ino !== grant.inode
    )
      throw new WebRequestError(
        "This host folder was replaced. Choose the location again.",
        422,
      );
    return grant;
  }
  return {
    async list(
      request: Extract<HostLocationsRequest, { action: "list" }>,
      scope: HostLocationScope,
    ): Promise<HostLocationListing> {
      if (!request.handle) {
        const entries: HostLocationEntry[] = [];
        const paths = new Set<string>();
        for (const root of await input.roots()) {
          try {
            const canonical = await realpath(root.path);
            if (paths.has(canonical)) continue;
            paths.add(canonical);
            entries.push(
              await issue(
                canonical,
                canonical,
                request.purpose,
                scope,
                root.name,
              ),
            );
          } catch (error) {
            if (error instanceof WebRequestError) throw error;
            if (
              !(error instanceof Error) ||
              !("code" in error) ||
              !unavailableCodes.has(String(error.code))
            )
              throw error;
          }
        }
        return { current: null, parent: null, entries, nextOffset: null };
      }
      const grant = await grantFor(request.handle, request.purpose, scope);
      if (grant.entry.kind !== "directory")
        throw new WebRequestError("Select this Library as a whole.", 422);
      const names = (await readdir(grant.path, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
        .map((entry) => entry.name)
        .filter(
          (name) =>
            (request.hidden || !name.startsWith(".")) &&
            name
              .toLocaleLowerCase()
              .includes(request.filter.toLocaleLowerCase()),
        )
        .sort((a, b) => a.localeCompare(b));
      const entries: HostLocationEntry[] = [];
      for (const name of names.slice(request.offset, request.offset + 500)) {
        try {
          entries.push(
            await issue(
              grant.root,
              join(grant.path, name),
              request.purpose,
              scope,
            ),
          );
        } catch (error) {
          if (error instanceof LocationGrantLimitError) throw error;
          if (
            !(error instanceof WebRequestError) &&
            (!(error instanceof Error) ||
              !("code" in error) ||
              !unavailableCodes.has(String(error.code)))
          )
            throw error;
        }
      }
      const parent = isSamePath(grant.path, grant.root)
        ? null
        : await issue(grant.root, dirname(grant.path), request.purpose, scope);
      return {
        current: grant.entry,
        parent,
        entries,
        nextOffset:
          request.offset + 500 < names.length ? request.offset + 500 : null,
      };
    },
    async mkdir(
      request: Extract<HostLocationsRequest, { action: "mkdir" }>,
      scope: HostLocationScope,
    ) {
      const parent = await grantFor(request.parent, request.purpose, scope);
      if (parent.entry.kind !== "directory")
        throw new WebRequestError(
          "Choose a parent folder outside a Library.",
          422,
        );
      const name = HostLocationNameSchema.parse(request.name);
      const path = join(parent.path, name);
      if (!isPathInside(parent.path, path))
        throw new WebRequestError("Choose a folder inside this location.", 422);
      try {
        await mkdir(path, { mode: 0o700 });
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "EEXIST"
        )
          throw new WebRequestError(
            "A folder with this name already exists.",
            422,
          );
        throw error;
      }
      return issue(parent.root, path, request.purpose, scope);
    },
    async known(
      path: string,
      purpose: HostLocationPurpose,
      scope: HostLocationScope,
    ) {
      const canonical = await realpath(path);
      for (const root of await input.roots()) {
        const base = await realpath(root.path).catch(() => null);
        if (base && isPathInside(base, canonical, { includeSame: true }))
          return issue(base, canonical, purpose, scope);
      }
      throw new WebRequestError(
        "This Library is outside the available host locations.",
        422,
      );
    },
    async source(
      handle: string,
      purpose: HostLocationPurpose,
      scope: HostLocationScope,
    ) {
      const grant = await grantFor(handle, purpose, scope);
      const identity = locationIdentity(grant.path);
      const items = await stat(join(grant.path, "items")).catch(() => null);
      const manifest = await stat(
        join(grant.path, "pond-backup-manifest.json"),
      ).catch(() => null);
      const copyMarker =
        purpose === "copy"
          ? await lstat(join(grant.path, "pond-backup-manifest.json")).catch(
              (error: NodeJS.ErrnoException) => {
                if (error.code === "ENOENT") return null;
                throw error;
              },
            )
          : null;
      if (copyMarker)
        throw new WebRequestError(
          "Choose a working Library. A backup snapshot cannot receive Saves.",
          422,
        );
      if (!identity || (!items?.isDirectory() && !manifest?.isFile()))
        throw new WebRequestError(
          "Choose a Pond Library or a complete Library backup.",
          422,
        );
      return grant.path;
    },
    async destination(
      destination: HostDestination,
      purpose: HostLocationPurpose,
      scope: HostLocationScope,
    ) {
      const parent = await grantFor(destination.parent, purpose, scope);
      if (parent.entry.kind !== "directory")
        throw new WebRequestError(
          "Choose a parent folder outside a Library.",
          422,
        );
      const name = HostLocationNameSchema.parse(destination.name);
      const path = join(
        parent.path,
        /\.pond$/i.test(name) ? name : `${name}.pond`,
      );
      if (!isPathInside(parent.path, path))
        throw new WebRequestError(
          "Choose a destination inside this location.",
          422,
        );
      return path;
    },
    async parent(
      handle: string,
      purpose: HostLocationPurpose,
      scope: HostLocationScope,
    ) {
      const grant = await grantFor(handle, purpose, scope);
      if (grant.entry.kind !== "directory")
        throw new WebRequestError(
          "Choose a parent folder outside a Library.",
          422,
        );
      return grant.path;
    },
  };
}
