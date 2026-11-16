import {
  LibraryRepairApplyRequestSchema,
  LibraryRepairJobRequestSchema,
  LibraryRepairPreviewRequestSchema,
} from "../../../shared/library-repair-contracts";
import { query } from "./params";

export const libraryRepairQueries = {
  "libraryRepairs.preview": query(
    LibraryRepairPreviewRequestSchema,
    async ({ kind, saveIds }) =>
      (
        await import("../../core/library-repair-jobs")
      ).startLibraryRepairPreview(kind, saveIds),
  ),
  "libraryRepairs.apply": query(
    LibraryRepairApplyRequestSchema,
    async ({ token }) =>
      (await import("../../core/library-repair-jobs")).startLibraryRepairApply(
        token,
      ),
  ),
  "libraryRepairs.cancel": query(
    LibraryRepairJobRequestSchema,
    async ({ id }) =>
      (await import("../../core/library-repair-jobs")).cancelLibraryRepairJob(
        id,
      ),
  ),
  "libraryRepairs.get": query(LibraryRepairJobRequestSchema, async ({ id }) =>
    (await import("../../core/library-repair-jobs")).getLibraryRepairJob(id),
  ),
};
