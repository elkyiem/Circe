import { Button } from "@pond/ui";
import { WebSessionSchema } from "@shared/web-contracts";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { installBrowserAdapter, webRequest } from "./adapter";
import { BrowserConnectionForm } from "./connection-form";
import { BrowserFixtureControls } from "./fixture-controls";
import { registerBrowserPwa } from "./pwa";
import { readBrowserSession } from "./session";
import "../styles.css";
import "../app/boot-shell";
import styles from "./styles.module.css";

function BrowserConnection() {
  const [session, setSession] = useState<ReturnType<
    typeof WebSessionSchema.parse
  > | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Connecting to Circé…");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  useEffect(() => {
    void registerBrowserPwa();
    let active = true;
    const onError = (event: Event) => {
      if (event instanceof CustomEvent) setError(String(event.detail));
    };
    const onConnection = (event: Event) => {
      if (event instanceof CustomEvent) setStatus(String(event.detail));
    };
    window.addEventListener("iris-error", onError);
    window.addEventListener("iris-connection", onConnection);
    void readBrowserSession()
      .then((current) => {
        if (!active) return;
        if (current) setSession(current);
        else setStatus("Connect to your private library");
        setCheckingSession(false);
      })
      .catch(() => {
        if (active)
          setError(
            "Your Mac is unavailable. Check that Circé and Tailscale are running, then reload.",
          );
      });
    return () => {
      active = false;
      window.removeEventListener("iris-error", onError);
      window.removeEventListener("iris-connection", onConnection);
    };
  }, []);
  useEffect(() => {
    if (!session) return;
    if (matchMedia("(max-width: 700px)").matches) {
      localStorage.setItem("pond.sidebar", "0");
      localStorage.setItem("pond.details", "0");
    }
    void installBrowserAdapter(session.libraryId)
      .then(() => import("../main"))
      .then(() => setReady(true))
      .catch((failure) => {
        console.error("Circé browser startup failed", failure);
        setError(
          failure instanceof Error
            ? failure.message
            : "The application could not start. Reload to retry.",
        );
      });
  }, [session]);
  if (checkingSession && !session)
    return (
      <section
        className={styles.connect}
        aria-label="Host connection"
        aria-busy={!error}
      >
        <h1>Circé</h1>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <Button onClick={() => location.reload()}>Reload</Button>
          </>
        ) : (
          <p role="status">Connecting to your Library…</p>
        )}
      </section>
    );
  if (
    ready &&
    session &&
    !session.fixtures &&
    !error &&
    status === "Connected to Circé"
  )
    return null;
  return (
    <section
      className={session ? styles.bar : styles.connect}
      aria-label="Host connection"
    >
      {!session ? (
        <BrowserConnectionForm
          status={status}
          busy={busy}
          onError={setError}
          onConnect={async (key) => {
            setBusy(true);
            setError("");
            try {
              setSession(
                WebSessionSchema.parse(
                  await webRequest("session", JSON.stringify({ key })),
                ),
              );
            } catch (cause) {
              setError(
                cause instanceof Error ? cause.message : "Connection failed.",
              );
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : (
        <>
          <span role="status">{status}</span>
          {ready && session.fixtures ? (
            <BrowserFixtureControls
              busy={busy}
              onBusy={setBusy}
              onStatus={setStatus}
              onError={setError}
            />
          ) : null}
          <Button
            onClick={async () => {
              try {
                const response = await fetch("/web/session", {
                  method: "DELETE",
                  headers: { "x-iris-library": session.libraryId },
                });
                if (!response.ok)
                  throw new Error("Couldn’t disconnect. Try again.");
                location.reload();
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Couldn’t disconnect. Try again.",
                );
              }
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
