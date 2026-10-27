import { IconArrowLeft } from "@pond/icons";
import { Button } from "@pond/ui/button";
import { Input } from "@pond/ui/input";
import { Pane } from "@pond/ui/pane-header";
import { useEffect, useId, useState } from "react";
import { sendMessage } from "@/utils/messaging";
import styles from "./styles.module.css";

type Connection = Awaited<ReturnType<typeof readSummary>>;
const readSummary = () => sendMessage("irisConnection", undefined);

export function ConnectionPanel({ onBack }: { onBack(): void }) {
  const id = useId();
  const [connection, setConnection] = useState<Connection>(null);
  const [origin, setOrigin] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void readSummary().then(setConnection);
  }, []);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await sendMessage("irisPair", {
        origin,
        key: key.trim(),
        name: "Circé browser extension",
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setKey("");
      setConnection(await readSummary());
    } catch {
      setError(
        "Couldn't reach Circé. Check the address and your Tailscale connection.",
      );
    } finally {
      setBusy(false);
    }
  };
  const disconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await sendMessage("irisDisconnect", undefined);
      if (!result.ok) setError(result.message);
      else setConnection(null);
    } catch {
      setError("Couldn't disconnect. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={styles.panel}>
      <Pane.Header
        title={
          <>
            <Button
              icon
              size="sm"
              variant="ghost"
              aria-label="Back"
              onClick={onBack}
            >
              <IconArrowLeft size={16} />
            </Button>
            Connection
          </>
        }
      />
      <div className={styles.body}>
        {connection ? (
          <>
            <p role="status">Paired with {connection.name}</p>
            <p className={styles.address}>{connection.origin}</p>
            <p>
              Source sessions and captures from this browser go to this Circé
              host.
            </p>
            <Button disabled={busy} onClick={() => void disconnect()}>
              Disconnect Circé
            </Button>
          </>
        ) : (
          <form
            onSubmit={(event) => void submit(event)}
            className={styles.form}
          >
            <p>Connect to Circé on your Mac or another private host.</p>
            <label htmlFor={`${id}-origin`}>Circé address</label>
            <Input.Root>
              <Input.Field
                id={`${id}-origin`}
                type="url"
                value={origin}
                onValueChange={setOrigin}
                placeholder="https://your-mac.ts.net:9443"
                required
                autoComplete="url"
              />
            </Input.Root>
            <label htmlFor={`${id}-key`}>Host access key</label>
            <Input.Root>
              <Input.Field
                id={`${id}-key`}
                type="password"
                value={key}
                onValueChange={setKey}
                required
                autoComplete="off"
                aria-describedby={`${id}-privacy`}
              />
            </Input.Root>
            <label htmlFor={`${id}-file`}>Or choose the access key file</label>
            <input
              id={`${id}-file`}
              type="file"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (!file) return;
                if (file.size > 1024) {
                  setError(
                    "Choose the small web-access-key file from the Circé host.",
                  );
                  return;
                }
                void file
                  .text()
                  .then((value) => setKey(value.trim()))
                  .catch(() => setError("Couldn't read the access key file."));
                event.currentTarget.value = "";
              }}
            />
            <p id={`${id}-privacy`}>
              Pairing authorizes this extension to send captures and requested
              Source sessions to this host. The access key is used once; a
              separate connection credential stays in the extension.
            </p>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Connecting…" : "Connect Circé"}
            </Button>
          </form>
        )}
        <p role="alert" className={styles.error}>
          {error}
        </p>
      </div>
    </div>
  );
}
