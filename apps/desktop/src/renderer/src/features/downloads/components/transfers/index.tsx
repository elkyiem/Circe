import { Button } from "@pond/ui";
import type { TransferJob } from "@shared/transfer-contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import styles from "./styles.module.css";

const labels = {
  export_eagle_package: "Export Eagle Package",
  export_files: "Export Files",
  export_package: "Export Pond Package",
  import_eagle_package: "Import Eagle Package",
  import_package: "Import Pond Package",
  copy_library: "Copy to Library",
  merge_library: "Merge Library",
} satisfies Record<TransferJob["request"]["kind"], string>;
const states = {
  running: "In progress",
  cancelling: "Cancelling after this file",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Canceled",
  interrupted: "Interrupted",
} satisfies Record<TransferJob["status"], string>;
function useTransferAction(
  kind: "cancel" | "retry" | "download",
  onStart: () => void,
  onError: (error: Error) => void,
) {
  const client = useQueryClient();
  const queries = {
    cancel: "transferJobs.cancel",
    retry: "transferJobs.retry",
    download: "transferJobs.download",
  } as const;
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await window.pond.query(queries[kind], { id });
      if (!result.ok && "reason" in result && result.reason === "cancelled")
        return;
      if (!result.ok)
        throw new Error(
          result.error ?? "This transfer has already changed. Try again.",
        );
    },
    onMutate: onStart,
    onSuccess: () => client.invalidateQueries({ queryKey: ["transfer-jobs"] }),
    onError,
  });
}
export function TransferJobsPanel({ search = "" }: { search?: string }) {
  const [error, setError] = useState<string | null>(null);
  const jobs = useQuery({
    queryKey: ["transfer-jobs"],
    queryFn: () => window.pond.query("transferJobs.list", {}),
    refetchInterval: 1000,
  });
  const start = () => setError(null);
  const fail = (cause: Error) => setError(cause.message);
  const cancel = useTransferAction("cancel", start, fail);
  const retry = useTransferAction("retry", start, fail);
  const download = useTransferAction("download", start, fail);
  const visible = (jobs.data ?? [])
    .filter((job) =>
      `${labels[job.request.kind]} ${job.request.destination}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .slice(0, 30);
  if (!visible.length && !jobs.isError) return null;
  return (
    <section
      className={styles.panel}
      aria-label="Library transfers"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll transfer history independently of the download table.
      tabIndex={0}
    >
      <h2>Library Transfers</h2>
      {jobs.isError ? (
        <p role="alert">Couldn't load transfer history.</p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {visible.map((job) => {
        const active = job.status === "running" || job.status === "cancelling";
        return (
          <article key={job.id} className={styles.row}>
            <div className={styles.details}>
              <strong>{labels[job.request.kind]}</strong>
              <span
                className={styles.destination}
                title={job.request.destination}
              >
                {job.request.destination}
              </span>
              <span>
                {states[job.status]}
                {active && job.total
                  ? ` · ${job.phase}: ${job.completed} of ${job.total}`
                  : ""}
              </span>
              {active ? (
                <progress
                  aria-label={`${labels[job.request.kind]} progress`}
                  max={job.total || 1}
                  value={job.total ? job.completed : undefined}
                />
              ) : null}
              {job.error && job.status !== "cancelled" ? (
                <span className={styles.error}>{job.error}</span>
              ) : null}
            </div>
            {job.status === "running" ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate(job.id)}
              >
                Cancel
              </Button>
            ) : ["failed", "cancelled", "interrupted"].includes(job.status) ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={retry.isPending}
                loading={retry.isPending && retry.variables === job.id}
                onClick={() => retry.mutate(job.id)}
              >
                Retry
              </Button>
            ) : job.browserDownload ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={download.isPending}
                onClick={() => download.mutate(job.id)}
              >
                Download
              </Button>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}
