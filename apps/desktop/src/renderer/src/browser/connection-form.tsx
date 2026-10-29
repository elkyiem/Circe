import { Button, Input } from "@pond/ui";
import { z } from "zod";

export function BrowserConnectionForm({
  status,
  busy,
  onConnect,
  onError,
}: {
  status: string;
  busy: boolean;
  onConnect(key: string): Promise<void>;
  onError(message: string): void;
}) {
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        await onConnect(
          z.string().parse(new FormData(event.currentTarget).get("key")),
        );
      }}
    >
      <h1>Circé</h1>
      <p>{status}</p>
      <p>
        Use the access key saved on your Mac, or choose a key file copied to
        this device.
      </p>
      <label htmlFor="host-key">Access key</label>
      <Input.Root>
        <Input.Field
          id="host-key"
          name="key"
          type="password"
          autoComplete="current-password"
          required
          aria-describedby="host-error"
        />
      </Input.Root>
      <Button type="submit" disabled={busy}>
        {busy ? "Connecting…" : "Connect"}
      </Button>
      <label htmlFor="host-key-file">
        Or choose the access key file from this device
      </label>
      <input
        id="host-key-file"
        aria-label="Access key file"
        type="file"
        disabled={busy}
        onChange={async (event) => {
          const file = event.currentTarget.files?.[0];
          if (!file) return;
          if (file.size > 256) {
            onError("Choose the access key file copied from your Mac.");
            return;
          }
          try {
            await onConnect((await file.text()).trim());
          } catch (cause) {
            onError(
              cause instanceof Error
                ? cause.message
                : "Couldn’t read the access key file.",
            );
          }
        }}
      />
    </form>
  );
}
