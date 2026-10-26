import { describe, expect, it, vi } from "vitest";
import type { DownloadRow } from "@/features/downloads/lib/status-feed";
import { downloadStatusLabel } from "./status";

function row(
  status: DownloadRow["status"],
  extras: Partial<DownloadRow> = {},
): DownloadRow {
  return {
    id: status,
    saveId: status,
    name: status,
    url: "https://example.com",
    source: "web",
    status,
    stage: null,
    op: null,
    progress: null,
    attempts: 0,
    error: null,
    ts: 0,
    durationMs: null,
    live: true,
    ...extras,
  };
}

describe("downloadStatusLabel", () => {
  it("explains the source request budget without claiming a failed download", () => {
    vi.spyOn(Date, "now").mockReturnValue(0);
    try {
      const limited = row("parked", {
        source: "twitter",
        deferredReason: "source_budget",
        nextRunAt: 180_000,
      });
      expect(downloadStatusLabel(limited, false)).toBe("Twitter limit · 3m");
      expect(downloadStatusLabel(limited, true)).toBe("Paused");
      expect(downloadStatusLabel({ ...limited, nextRunAt: 0 }, false)).toBe(
        "Checking Twitter limit",
      );
      expect(
        downloadStatusLabel(
          { ...limited, deferredReason: "breaker_open" },
          false,
        ),
      ).toBe("Waiting for Twitter");
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("uses short table labels", () => {
    expect(downloadStatusLabel(row("waiting"), false)).toBe("Waiting");
    expect(downloadStatusLabel(row("waiting"), true)).toBe("Paused");
    expect(
      downloadStatusLabel(row("waiting", { interactive: true }), true),
    ).toBe("Waiting");
    expect(downloadStatusLabel(row("running"), false)).toBe("In Progress");
    expect(
      downloadStatusLabel(
        row("running", { stage: "Reading page", op: "harvest_metadata" }),
        false,
      ),
    ).toBe("In Progress");
    expect(downloadStatusLabel(row("retrying"), false)).toBe("Retrying");
    vi.spyOn(Date, "now").mockReturnValue(0);
    expect(
      downloadStatusLabel(row("retrying", { nextRunAt: 180_000 }), false),
    ).toBe("Retrying in 3m");
    vi.restoreAllMocks();
    expect(downloadStatusLabel(row("blocked"), false)).toBe("Failed");
    expect(downloadStatusLabel(row("failed"), false)).toBe("Failed");
    expect(downloadStatusLabel(row("complete"), false)).toBe("Completed");
    expect(downloadStatusLabel(row("cancelled"), false)).toBe("Canceled");
    expect(downloadStatusLabel(row("skipped"), false)).toBe("Skipped");
  });
});
