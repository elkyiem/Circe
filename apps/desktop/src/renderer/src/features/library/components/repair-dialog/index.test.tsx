import type {
  LibraryRepairJob,
  LibraryRepairKind,
  LibraryRepairQueryInputs,
  LibraryRepairQueryResults,
} from "@shared/library-repair-contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryRepairDialog } from ".";

type RepairRequest = {
  [Name in keyof LibraryRepairQueryInputs]: [
    Name,
    LibraryRepairQueryInputs[Name],
  ];
}[keyof LibraryRepairQueryInputs];
type RepairReply = LibraryRepairQueryResults[keyof LibraryRepairQueryResults];

/** Jobs belong to the host; reads can return an earlier snapshot after a transport delay. */
class RepairHost {
  readonly calls: RepairRequest[] = [];
  readonly cancellations: string[] = [];
  readonly jobs = new Map<string, LibraryRepairJob>();
  readonly previews: Promise<LibraryRepairJob>[] = [];
  readonly applications: Promise<LibraryRepairJob>[] = [];
  readonly reads = new Map<string, Promise<LibraryRepairJob | null>[]>();

  preview(job: LibraryRepairJob | Promise<LibraryRepairJob>): void {
    this.previews.push(Promise.resolve(job));
  }

  read(
    id: string,
    job: LibraryRepairJob | null | Promise<LibraryRepairJob | null>,
  ): void {
    const waiting = this.reads.get(id) ?? [];
    waiting.push(Promise.resolve(job));
    this.reads.set(id, waiting);
  }

  query = async (...request: RepairRequest): Promise<RepairReply> => {
    this.calls.push(request);
    const [name, params] = request;
    switch (name) {
      case "libraryRepairs.preview": {
        const pending = this.previews.shift();
        if (!pending) throw new Error("No preview was planned for this test.");
        const next = await pending;
        expect(next.kind).toBe(params.kind);
        this.jobs.set(next.id, next);
        return next;
      }
      case "libraryRepairs.get": {
        const pending = this.reads.get(params.id)?.shift();
        return pending ? pending : (this.jobs.get(params.id) ?? null);
      }
      case "libraryRepairs.apply": {
        const preview = [...this.jobs.values()].find(
          (job) => job.preview?.token === params.token,
        );
        if (!preview) throw new Error("A valid host preview is required.");
        const pending = this.applications.shift();
        if (!pending)
          throw new Error("No application was planned for this test.");
        const next = await pending;
        this.jobs.set(next.id, next);
        return next;
      }
      case "libraryRepairs.cancel":
        // Cancellation is an acknowledgement; the recoverable host unit can still be running.
        this.cancellations.push(params.id);
        return this.jobs.get(params.id) ?? null;
    }
  };
}

function runningJob(
  id: string,
  phase: LibraryRepairJob["phase"] = "preview",
  kind: LibraryRepairKind = "thumbnails",
): LibraryRepairJob {
  return { id, kind, phase, status: "running", processed: 0, total: 1 };
}

function previewJob(
  id: string,
  title: string,
  kind: LibraryRepairKind = "thumbnails",
  count = 1,
): LibraryRepairJob {
  return {
    ...runningJob(id, "preview", kind),
    status: "completed",
    processed: 1,
    preview: {
      token: `token-${id}`,
      expiresAt: Date.now() + 600000,
      issues: Array.from({ length: count }, (_, index) => ({
        id: `${id}-issue-${index}`,
        kind,
        saveId: `${id}-save-${index}`,
        title,
        summary: "The thumbnail is damaged.",
        detail: "Rebuild the thumbnail from the original.",
      })),
      confirmation: {
        affectedSaves: count,
        createsBackups: true,
        canUndo: true,
        movesToTrash: false,
        rewritesMetadata: false,
        renamesFiles: false,
        regeneratesThumbnails: true,
      },
    },
  };
}

function appliedJob(id: string): LibraryRepairJob {
  return {
    ...runningJob(id, "apply"),
    status: "completed",
    processed: 17,
    total: 17,
    result: { repaired: 17, skipped: 0, undoRecorded: true },
  };
}

describe("retained Library repair dialog", () => {
  let host: RepairHost;
  let mount: HTMLDivElement;
  let root: Root;
  let kind: LibraryRepairKind;
  let opened: boolean;
  let closes: number;

  function paint(open: boolean, nextKind = kind): void {
    opened = open;
    kind = nextKind;
    root.render(
      <LibraryRepairDialog
        kind={kind}
        open={opened}
        onClose={() => {
          closes++;
          paint(false);
        }}
      />,
    );
  }

  async function render(open: boolean, nextKind = kind): Promise<void> {
    await act(async () => paint(open, nextKind));
  }

  function button(label: string): HTMLButtonElement {
    const target = [...document.querySelectorAll("button")].find(
      (node) => node.textContent?.trim() === label,
    );
    if (!target) throw new Error(`Missing ${label} button.`);
    return target;
  }

  async function click(label: string): Promise<void> {
    const target = button(label);
    expect(target.disabled).toBe(false);
    await act(async () => target.click());
  }

  function text(): string {
    return document.querySelector('[role="dialog"]')?.textContent ?? "";
  }

  beforeEach(() => {
    vi.useFakeTimers();
    host = new RepairHost();
    vi.stubGlobal("pond", { query: host.query });
    mount = document.createElement("div");
    document.body.append(mount);
    root = createRoot(mount);
    kind = "thumbnails";
    opened = false;
    closes = 0;
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    await act(async () => vi.runOnlyPendingTimersAsync());
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it("does not start a retained closed dialog until the user opens it", async () => {
    await render(false);
    expect(host.calls).toEqual([]);
    host.preview(previewJob("opened", "Requested preview"));
    await render(true);
    expect(text()).toContain("Requested preview");
    expect(
      host.calls.filter(([name]) => name === "libraryRepairs.preview"),
    ).toHaveLength(1);
  });

  it("Cancel and reopening the same repair scans again instead of reusing its old token", async () => {
    host.preview(previewJob("first", "Old damaged thumbnail"));
    await render(true);
    expect(text()).toContain("Old damaged thumbnail");
    await click("Cancel");
    expect(opened).toBe(false);
    expect(closes).toBe(1);

    host.preview(previewJob("second", "Already repaired elsewhere", kind, 0));
    await render(true);
    expect(
      host.calls.filter(([name]) => name === "libraryRepairs.preview"),
    ).toHaveLength(2);
    expect(text()).toContain("No repairs needed.");
    expect(text()).not.toContain("Old damaged thumbnail");
    expect(
      [...document.querySelectorAll("button")].some(
        (node) => node.textContent?.trim() === "Repair",
      ),
    ).toBe(false);
  });

  it("clears a prior preview error when the same retained repair is reopened", async () => {
    const failed = Promise.withResolvers<LibraryRepairJob>();
    host.preview(failed.promise);
    await render(true);
    await act(async () => failed.reject(new Error("Connection unavailable")));
    expect(text()).toContain("Pond couldn't check your library. Try again.");
    await click("Cancel");

    host.preview(previewJob("fresh", "Fresh successful preview"));
    await render(true);
    expect(text()).toContain("Fresh successful preview");
    expect(text()).not.toContain("couldn't check your library");
    expect(button("Repair").disabled).toBe(false);
  });

  it("cancels a preview whose start acknowledgement arrives after Cancel and reopen", async () => {
    const old = Promise.withResolvers<LibraryRepairJob>();
    host.preview(old.promise);
    await render(true);
    await click("Cancel");
    host.preview(previewJob("new", "Current preview"));
    await render(true);

    await act(async () => old.resolve(runningJob("late-preview")));
    expect(host.cancellations).toContain("late-preview");
    expect(text()).toContain("Current preview");
    expect(text()).not.toContain("Checking library");
    expect(button("Repair").disabled).toBe(false);
  });

  it("ignores an old preview read that settles after Cancel and reopen", async () => {
    const read = Promise.withResolvers<LibraryRepairJob | null>();
    host.preview(runningJob("old-preview"));
    host.read("old-preview", read.promise);
    await render(true);
    expect(host.calls).toContainEqual([
      "libraryRepairs.get",
      { id: "old-preview" },
    ]);
    await click("Cancel");
    expect(host.cancellations).toContain("old-preview");

    host.preview(previewJob("fresh", "Fresh preview after closing"));
    await render(true);
    await act(async () =>
      read.resolve(previewJob("old-preview", "Stale late issue")),
    );
    expect(text()).toContain("Fresh preview after closing");
    expect(text()).not.toContain("Stale late issue");
  });

  it("ignores a preview read from another repair kind when the retained dialog changes kind", async () => {
    const read = Promise.withResolvers<LibraryRepairJob | null>();
    host.preview(runningJob("old-kind"));
    host.read("old-kind", read.promise);
    await render(true);
    host.preview(
      previewJob("new-kind", "Current filename issue", "physical-file-names"),
    );
    await render(true, "physical-file-names");

    await act(async () =>
      read.resolve(previewJob("old-kind", "Stale thumbnail issue")),
    );
    expect(text()).toContain("Repair Physical File Names");
    expect(text()).toContain("Current filename issue");
    expect(text()).not.toContain("Stale thumbnail issue");
  });

  it("cancels a repair whose apply acknowledgement arrives after the dialog has reopened", async () => {
    host.preview(previewJob("preview", "First repair"));
    await render(true);
    const apply = Promise.withResolvers<LibraryRepairJob>();
    host.applications.push(apply.promise);
    await click("Repair");
    await click("Cancel");
    host.preview(previewJob("new-preview", "Current repair preview"));
    await render(true);

    await act(async () => apply.resolve(runningJob("late-apply", "apply")));
    expect(host.cancellations).toContain("late-apply");
    expect(text()).toContain("Current repair preview");
    expect(text()).not.toContain("Repaired");
    expect(button("Repair").disabled).toBe(false);
  });

  it("ignores an old apply poll that completes after Cancel and reopening", async () => {
    host.preview(previewJob("preview", "First repair"));
    await render(true);
    host.applications.push(Promise.resolve(runningJob("old-apply", "apply")));
    const read = Promise.withResolvers<LibraryRepairJob | null>();
    host.read("old-apply", read.promise);
    await click("Repair");
    expect(host.calls).toContainEqual([
      "libraryRepairs.get",
      { id: "old-apply" },
    ]);
    await click("Cancel");
    expect(host.cancellations).toContain("old-apply");

    host.preview(previewJob("new-preview", "New preview is still actionable"));
    await render(true);
    await act(async () => read.resolve(appliedJob("old-apply")));
    expect(text()).toContain("New preview is still actionable");
    expect(text()).not.toContain("Repaired 17 Saves.");
    expect(button("Repair").disabled).toBe(false);
  });

  it.each(["preview", "apply"] as const)(
    "reports a later %s polling transport failure and leaves Cancel usable without an unhandled rejection",
    async (phase) => {
      const failures: Error[] = [];
      const rejected = (error: Error) => failures.push(error);
      process.on("unhandledRejection", rejected);
      try {
        const id = `running-${phase}`;
        const pending = Promise.withResolvers<LibraryRepairJob | null>();
        host.read(id, runningJob(id, phase));
        host.read(id, pending.promise);
        if (phase === "preview") host.preview(runningJob(id));
        else {
          host.preview(previewJob("preview", "Repair ready to apply"));
          host.applications.push(Promise.resolve(runningJob(id, "apply")));
        }
        await render(true);
        if (phase === "apply") await click("Repair");
        await act(async () => vi.advanceTimersByTimeAsync(200));
        expect(
          host.calls.filter(
            ([name, params]) =>
              name === "libraryRepairs.get" && params.id === id,
          ),
        ).toHaveLength(2);
        await act(async () =>
          pending.reject(new Error("Transport disconnected while polling")),
        );

        expect(text()).toContain(
          phase === "preview"
            ? "Pond couldn't check your library. Try again."
            : "Pond couldn't repair your library. Try again.",
        );
        expect(button("Cancel").disabled).toBe(false);
        await click("Cancel");
        expect(opened).toBe(false);
        expect(host.cancellations).toContain(id);
        await act(async () => vi.advanceTimersByTimeAsync(1000));
        expect(failures).toEqual([]);
      } finally {
        process.removeListener("unhandledRejection", rejected);
      }
    },
  );
});
