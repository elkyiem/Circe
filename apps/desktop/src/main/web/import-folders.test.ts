import { expect, it, vi } from "vitest";
import type { createFolder, listFolders } from "../core/folders";
import { resolveImportFolders } from "./import-folders";

const first = "iris-upload:11111111-1111-4111-8111-111111111111";
const second = "iris-upload:22222222-2222-4222-8222-222222222222";
function hostFolders() {
  const rows: Awaited<ReturnType<typeof listFolders>> = [];
  const create = vi.fn<typeof createFolder>(async (input) => {
    const folder = {
      id: String(rows.length + 1),
      name: input.name.trim(),
      parentId: input.parentId ?? null,
      color: null,
      sortOrder: 0,
      createdAt: new Date(),
    };
    rows.push(folder);
    return folder;
  });
  return { rows, createFolder: create, listFolders: async () => [...rows] };
}

it("retains nested folders and reuses their identities when a selection is retried", async () => {
  const host = hostFolders();
  const parent = await host.createFolder({ name: "Destination" });
  const input = {
    paths: [first, second],
    parentId: parent.id,
    relativePaths: {
      [first]: " Picked/Images/same.png",
      [second]: "Picked/Videos/same.png",
    },
  };
  const resolved = await resolveImportFolders(input, host);
  const root = host.rows.find((folder) => folder.name === "Picked");
  expect(root?.parentId).toBe(parent.id);
  expect(
    host.rows.find((folder) => folder.id === resolved.get(first)),
  ).toMatchObject({ name: "Images", parentId: root?.id });
  expect(
    host.rows.find((folder) => folder.id === resolved.get(second)),
  ).toMatchObject({ name: "Videos", parentId: root?.id });
  expect(await resolveImportFolders(input, host)).toEqual(resolved);
  expect(host.rows).toHaveLength(4);
});

it.each([
  "../outside/file.png",
  "/absolute/file.png",
  "Picked/../../file.png",
  "Picked\\escape.png",
  "C:/file.png",
  "Picked//file.png",
  "Picked/\u0000.png",
])("rejects unsafe relative path %j before creating folders", async (path) => {
  const host = hostFolders();
  await expect(
    resolveImportFolders(
      { paths: [first], parentId: null, relativePaths: { [first]: path } },
      host,
    ),
  ).rejects.toThrow();
  expect(host.createFolder).not.toHaveBeenCalled();
});

it("rejects unknown uploads, ambiguous paths and a missing destination", async () => {
  const host = hostFolders();
  await expect(
    resolveImportFolders(
      {
        paths: [first],
        parentId: null,
        relativePaths: { [second]: "Picked/file.png" },
      },
      host,
    ),
  ).rejects.toThrow(/inconsistent/);
  await expect(
    resolveImportFolders(
      {
        paths: [first, second],
        parentId: null,
        relativePaths: {
          [first]: "Picked/file.png",
          [second]: "Picked/file.png",
        },
      },
      host,
    ),
  ).rejects.toThrow(/inconsistent/);
  await expect(
    resolveImportFolders(
      {
        paths: [first],
        parentId: "missing",
        relativePaths: { [first]: "Picked/file.png" },
      },
      host,
    ),
  ).rejects.toThrow(/no longer exists/);
  expect(host.createFolder).not.toHaveBeenCalled();
});
