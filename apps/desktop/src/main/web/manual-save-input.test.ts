import { expect, it, vi } from "vitest";
import { classifyManualSave } from "../core/manual-import";
import { prepareWebManualSave } from "./manual-save-input";

it("preserves an empty Note's explicit text type so the native importer accepts it", async () => {
  const resolveUpload = vi.fn(async () => ({ id: "unused", path: "unused" }));
  const input = await prepareWebManualSave(
    { title: null, note: null, mediaType: "text" },
    resolveUpload,
  );
  expect(input).toMatchObject({ title: null, note: null, mediaType: "text" });
  expect(resolveUpload).not.toHaveBeenCalled();
  expect(
    classifyManualSave({
      hasFiles: false,
      hasUrl: false,
      onlyTextFiles: false,
      title: input.title ?? null,
      textBody: input.note ?? null,
      mediaType: input.mediaType,
      importedType: null,
    }),
  ).toEqual({ ok: true, isTextSave: true, mediaType: "text" });
});

it("retains media metadata while resolving only Library-bound upload tickets", async () => {
  const token = "iris-upload:11111111-1111-4111-8111-111111111111";
  const resolveUpload = vi.fn(async () => ({
    id: "host-ticket",
    path: "/isolated/upload/image.png",
  }));
  const input = await prepareWebManualSave(
    {
      title: "Device image",
      note: "Original note",
      tags: ["fixture"],
      filePaths: [token],
      mediaType: "image",
      width: 320,
      height: 200,
      sourceId: "untrusted-source-identity",
    },
    resolveUpload,
  );
  expect(resolveUpload).toHaveBeenCalledExactlyOnceWith(token);
  expect(input).toEqual({
    title: "Device image",
    url: null,
    note: "Original note",
    tags: ["fixture"],
    filePaths: ["/isolated/upload/image.png"],
    sourceId: "web-upload:host-ticket",
    mediaType: "image",
    width: 320,
    height: 200,
  });
});

it("rejects host paths, unknown media types and unavailable upload tickets", async () => {
  const resolveUpload = vi.fn(async () => {
    throw new Error("Upload expired");
  });
  await expect(
    prepareWebManualSave({ filePaths: ["/host/private.png"] }, resolveUpload),
  ).rejects.toThrow();
  await expect(
    prepareWebManualSave({ mediaType: "unknown" }, resolveUpload),
  ).rejects.toThrow();
  expect(resolveUpload).not.toHaveBeenCalled();
  await expect(
    prepareWebManualSave(
      { filePaths: ["iris-upload:11111111-1111-4111-8111-111111111111"] },
      resolveUpload,
    ),
  ).rejects.toThrow("Upload expired");
});
