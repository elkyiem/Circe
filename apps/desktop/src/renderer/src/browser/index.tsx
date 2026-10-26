import { Button, Input } from "@pond/ui";
import { WebSessionSchema } from "@shared/web-contracts";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { z } from "zod";
import { installBrowserAdapter, webRequest } from "./adapter";
import "../styles.css";
import "../app/boot-shell";
import styles from "./styles.module.css";

function BrowserConnection() {
  const [session, setSession] = useState<ReturnType<
    typeof WebSessionSchema.parse
  > | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Connecting to Electron host…");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const onError = (event: Event) => {
      if (event instanceof CustomEvent) setError(String(event.detail));
    };
    const onConnection = (event: Event) => {
      if (event instanceof CustomEvent) setStatus(String(event.detail));
    };
    window.addEventListener("iris-error", onError);
    window.addEventListener("iris-connection", onConnection);
    void fetch("/web/session")
      .then(async (response) => {
        if (response.ok)
          setSession(WebSessionSchema.parse(await response.json()));
        else setStatus("Connect to your private library");
      })
      .catch(() =>
        setError("The Electron host is unavailable. Start it and reload."),
      );
    return () => {
      window.removeEventListener("iris-error", onError);
      window.removeEventListener("iris-connection", onConnection);
    };
  }, []);
  useEffect(() => {
    if (!session) return;
    installBrowserAdapter(session.libraryId);
    // Agent is host-only for now; do not restore its native resting pane on reload.
    localStorage.setItem("pond.rightOpen", "0");
    localStorage.setItem("pond.agent", "0");
    if (matchMedia("(max-width: 700px)").matches)
      localStorage.setItem("pond.sidebar", "0");
    void import("../main")
      .then(() => setReady(true))
      .catch(() =>
        setError("The application could not start. Reload to retry."),
      );
  }, [session]);
  return (
    <section
      className={session ? styles.bar : styles.connect}
      aria-label="Host connection"
    >
      {!session ? (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            const form = new FormData(event.currentTarget);
            try {
              setSession(
                WebSessionSchema.parse(
                  await webRequest(
                    "session",
                    JSON.stringify({ key: form.get("key") }),
                  ),
                ),
              );
            } catch (failure) {
              setError(
                failure instanceof Error
                  ? failure.message
                  : "Connection failed.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <h1>Iris</h1>
          <p>{status}</p>
          <p>
            Enter the access key from your isolated host’s web-access-key file.
          </p>
          <label htmlFor="host-key">Host access key</label>
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
                setError("Choose the host’s small web-access-key text file.");
                return;
              }
              setBusy(true);
              setError("");
              try {
                setSession(
                  WebSessionSchema.parse(
                    await webRequest(
                      "session",
                      JSON.stringify({ key: (await file.text()).trim() }),
                    ),
                  ),
                );
              } catch (failure) {
                setError(
                  failure instanceof Error
                    ? failure.message
                    : "Connection failed.",
                );
              } finally {
                setBusy(false);
              }
            }}
          />
        </form>
      ) : (
        <>
          <span role="status">{status}</span>
          {ready && session.fixtures && (
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
          )}
          {ready && session.fixtures && (
            <Button
              disabled={busy}
              onClick={async () => {
                const select = document.getElementById("fixture-kind");
                if (!(select instanceof HTMLSelectElement)) return;
                setBusy(true);
                setError("");
                try {
                  const result = z
                    .object({ id: z.string(), created: z.boolean() })
                    .parse(
                      await webRequest(
                        "fixtures",
                        JSON.stringify({ kind: select.value }),
                      ),
                    );
                  setStatus(
                    result.created
                      ? "Save enqueued · follow progress in Downloads"
                      : "Fixture already in library",
                  );
                } catch (failure) {
                  setError(
                    failure instanceof Error
                      ? failure.message
                      : "Could not enqueue.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Enqueuing…" : "Enqueue fixture"}
            </Button>
          )}
          <Button
            onClick={async () => {
              await fetch("/web/session", { method: "DELETE" });
              location.reload();
            }}
          >
            Disconnect
          </Button>
        </>
      )}
      <p id="host-error" role="alert" hidden={!error}>
        {error}
      </p>
      {error && (
        <>
          <Button onClick={() => location.reload()}>Reload</Button>
          <Button onClick={() => setError("")}>Dismiss</Button>
        </>
      )}
    </section>
  );
}

const host = document.getElementById("browser-connection");
if (!host) throw new Error("Browser connection mount missing.");
createRoot(host).render(<BrowserConnection />);
