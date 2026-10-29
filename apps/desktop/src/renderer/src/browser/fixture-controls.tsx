import { Button } from "@pond/ui";
import { z } from "zod";
import { webRequest } from "./adapter";

/** Opt-in development fixtures share the real queue; absent in ordinary sessions. */
export function BrowserFixtureControls({
  busy,
  onBusy,
  onStatus,
  onError,
}: {
  busy: boolean;
  onBusy(value: boolean): void;
  onStatus(message: string): void;
  onError(message: string): void;
}) {
  return (
    <>
      <label>
        Offline fixture{" "}
        <select
          aria-label="Offline fixture"
          defaultValue="quote"
          id="fixture-kind"
        >
          <option value="quote">Quoted post</option>
          <option value="image">Original image</option>
          <option value="video">Video</option>
        </select>
      </label>
      <Button
        disabled={busy}
        onClick={async () => {
          const select = document.getElementById("fixture-kind");
          if (!(select instanceof HTMLSelectElement)) return;
          onBusy(true);
          onError("");
          try {
            const result = z
              .object({ id: z.string(), created: z.boolean() })
              .parse(
                await webRequest(
                  "fixtures",
                  JSON.stringify({ kind: select.value }),
                ),
              );
            onStatus(
              result.created
                ? "Save enqueued · follow progress in Downloads"
                : "Fixture already in library",
            );
          } catch (cause) {
            onError(
              cause instanceof Error ? cause.message : "Could not enqueue.",
            );
          } finally {
            onBusy(false);
          }
        }}
      >
        {busy ? "Enqueuing…" : "Enqueue fixture"}
      </Button>
    </>
  );
}
