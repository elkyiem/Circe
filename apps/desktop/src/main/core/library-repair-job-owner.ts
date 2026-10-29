import { randomUUID } from "node:crypto";
import type {
  LibraryRepairJob,
  LibraryRepairKind,
} from "../../shared/library-repair-contracts";
import { libraryAccess } from "./library-access";
import type { libraryRepairService } from "./library-repairs";

interface RepairJobRecord {
  job: LibraryRepairJob;
  scope: string;
  controller: AbortController;
  settled: Promise<void>;
}

/** A repair owns its Library until its last recoverable unit has settled. */
export function createLibraryRepairJobs(dependencies: {
  scope(): string;
  service: Pick<
    typeof libraryRepairService,
    "preview" | "apply" | "discard" | "kindForToken"
  >;
}) {
  const jobs = new Map<string, RepairJobRecord>();
  const maximumJobs = 100;
  let stopping = false;

  function admit() {
    if (stopping) throw new Error("Library repairs are stopping.");
    libraryAccess.assertNewWorkAllowed();
  }

  async function cancelAll() {
    const retained = [...jobs.values()];
    for (const record of retained)
      if (record.job.status === "queued" || record.job.status === "running")
        record.controller.abort();
    await Promise.all(retained.map((record) => record.settled));
  }

  function createJob(
    phase: LibraryRepairJob["phase"],
    kind: LibraryRepairKind,
    token?: string,
  ): LibraryRepairJob {
    admit();
    for (const [id, record] of jobs) {
      if (jobs.size < maximumJobs) break;
      if (record.job.status !== "queued" && record.job.status !== "running")
        jobs.delete(id);
    }
    if (jobs.size >= maximumJobs)
      throw new Error(
        "Wait for a running Library repair before starting another.",
      );
    const settled = Promise.withResolvers<void>();
    const record: RepairJobRecord = {
      job: {
        id: randomUUID(),
        phase,
        kind,
        status: "queued",
        processed: 0,
        total: 0,
      },
      scope: dependencies.scope(),
      controller: new AbortController(),
      settled: settled.promise,
    };
    jobs.set(record.job.id, record);
    void libraryAccess
      .run(async () => {
        record.job.status = "running";
        const progress = (processed: number, total: number) => {
          record.job.processed = processed;
          record.job.total = total;
        };
        if (record.scope !== dependencies.scope())
          throw new Error(
            "The active Library changed. Preview the repair again.",
          );
        if (phase === "preview") {
          const preview = await dependencies.service.preview({
            kind,
            signal: record.controller.signal,
            onProgress: progress,
          });
          if (record.controller.signal.aborted)
            dependencies.service.discard(preview.token);
          else record.job.preview = preview;
        } else {
          if (!token) throw new Error("Preview the repair before applying it.");
          const applied = await dependencies.service.apply({
            token,
            signal: record.controller.signal,
            onProgress: progress,
          });
          record.job.result = applied.result;
        }
        record.job.status = record.controller.signal.aborted
          ? "cancelled"
          : "completed";
      })
      .catch((error: Error) => {
        record.job.status = record.controller.signal.aborted
          ? "cancelled"
          : "failed";
        if (!record.controller.signal.aborted)
          record.job.error = error.message || "The Library repair failed.";
      })
      .finally(() => settled.resolve());
    return structuredClone(record.job);
  }

  function current(id: string) {
    const record = jobs.get(id);
    return record?.scope === dependencies.scope() ? record : undefined;
  }

  return {
    preview(kind: LibraryRepairKind) {
      return createJob("preview", kind);
    },
    apply(token: string) {
      admit();
      const kind = dependencies.service.kindForToken(token);
      if (!kind) throw new Error("This repair preview expired. Preview again.");
      return createJob("apply", kind, token);
    },
    cancel(id: string): LibraryRepairJob | null {
      const record = current(id);
      if (!record) return null;
      if (record.job.status === "queued" || record.job.status === "running")
        record.controller.abort();
      // Cancellation requests stop between recoverable units; only settlement is terminal.
      return structuredClone(record.job);
    },
    get(id: string): LibraryRepairJob | null {
      const record = current(id);
      return record ? structuredClone(record.job) : null;
    },
    cancelAll,
    async stop() {
      stopping = true;
      await cancelAll();
    },
  };
}
