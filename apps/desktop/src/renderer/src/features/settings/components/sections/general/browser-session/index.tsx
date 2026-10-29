import { Button, Dialog, Settings } from "@pond/ui";
import { useState } from "react";
import styles from "./styles.module.css";

export function BrowserSessionRow() {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Settings.ItemDetails>
        <Settings.ItemTitle>This Browser</Settings.ItemTitle>
        <Settings.ItemDescription>
          Disconnect when you’ve finished using a shared device.
          {error ? <span role="alert">{error}</span> : null}
        </Settings.ItemDescription>
      </Settings.ItemDetails>
      <Settings.ItemControl>
        <Button
          size="sm"
          className={styles.disconnect}
          variant="secondary"
          onClick={() =>
            Dialog.confirm({
              title: "Disconnect This Browser?",
              description:
                "Use your access key to connect again. Your library stays on your Mac.",
              confirmLabel: "Disconnect",
              onConfirm: async () => {
                setError(null);
                try {
                  const response = await fetch("/web/session", {
                    method: "DELETE",
                  });
                  if (!response.ok)
                    throw new Error("Couldn’t disconnect. Try again.");
                  location.reload();
                } catch (cause) {
                  const message =
                    cause instanceof Error
                      ? cause.message
                      : "Couldn’t disconnect. Try again.";
                  setError(message);
                  throw new Error(message);
                }
              },
            })
          }
        >
          Disconnect
        </Button>
      </Settings.ItemControl>
    </>
  );
}
