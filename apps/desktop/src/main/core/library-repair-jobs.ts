import { libraryId, libraryRoot } from "../paths";
import { createLibraryRepairJobs } from "./library-repair-job-owner";
import { libraryRepairService } from "./library-repairs";

const jobs = createLibraryRepairJobs({
  scope: () => `${libraryId()}\0${libraryRoot()}`,
  service: libraryRepairService,
});
export const startLibraryRepairPreview = jobs.preview;
export const startLibraryRepairApply = jobs.apply;
export const cancelLibraryRepairJob = jobs.cancel;
export const getLibraryRepairJob = jobs.get;
export const cancelAllLibraryRepairs = jobs.cancelAll;
export const stopLibraryRepairs = jobs.stop;
