import { IconCircleCheckFill } from "@pond/icons";
import { Button, Dialog } from "@pond/ui";
import { useEffect, useState } from "react";
import { ConnectionVisual } from "@/features/sources/components/flow/connection-visual";
import {
  type AccountRow,
  useAccounts,
} from "@/features/sources/hooks/use-accounts";
import { openSources } from "@/features/sources/lib/open";
import { getSourceDef } from "@/features/sources/lib/registry";
import {
  connectFlow,
  useConnectCompleted,
  useConnectedAccount,
  useConnectedBefore,
  useConnectMode,
  useConnectProblem,
  useConnectSource,
  useConnectWaiting,
} from "@/features/sources/state/connect-flow";
import { sourceFlow } from "@/features/sources/state/source-flow";
import { syncMonitor } from "@/features/sources/state/sync-monitor";
import { BrowserExtensionDialog } from "@/shared/components/browser-extension-dialog";
import { isBrowserRuntime } from "@/shared/lib/platform";
import { findArrivedAccount } from "./arrival";
import styles from "./styles.module.css";

export function ConnectWaitSection() {
  const source = useConnectSource();
  const completed = useConnectCompleted();
  const problem = useConnectProblem();
  const account = useConnectedAccount();
  const mode = useConnectMode();
  useConnectArrival();
  if (!source) return null;
  const label = getSourceDef(source).label;
  const step = completed ? "connected" : (problem ?? "waiting");
  const choosing = completed && account?.sync.importPending === true;
  const next = completed && !choosing;

  return (
    <div className={styles.body}>
      <ConnectionVisual
        source={source}
        state={
          completed
            ? "connected"
            : problem === "unavailable"
              ? "failed"
              : "waiting"
        }
      />
      <div
        key={step}
        className={styles.copy}
        data-state={step === "waiting" ? undefined : step}
        aria-live="polite"
      >
        <h2 className={styles.title}>
          {step === "connected"
            ? `${label} is connected`
            : step === "unavailable"
              ? `Couldn't connect ${label}`
              : step === "signed_out"
                ? `Signed out of ${label}`
                : `Connect ${label} to Pond`}
        </h2>
        <p className={styles.description}>
          {choosing ? (
            <>
              Next, choose what Pond imports.
              <br />
              Nothing syncs until you start the import.
            </>
          ) : next ? (
            <>
              Pond is syncing your saved posts now.
              <br />
              New saves keep arriving in your library.
            </>
          ) : step === "unavailable" ? (
            isBrowserRuntime() && mode === "extension" ? (
              "Pair the Iris extension using Connection in its panel, then try again. No Source session has been connected."
            ) : (
              "Pond couldn't open the sign-in page. Try again."
            )
          ) : step === "signed_out" ? (
            isBrowserRuntime() ? (
              mode === "extension" ? (
                "Sign in in the browser where the paired Iris extension is installed. Iris will finish the connection here."
              ) : (
                "Sign-in was not completed in the isolated host window. Open it again to connect."
              )
            ) : (
              <>
                Pond's extension found a browser profile signed out of {label}.
                <br />
                Sign in there, or add the extension to the profile you use.
              </>
            )
          ) : (
            <>
              {isBrowserRuntime()
                ? mode === "extension"
                  ? `The Iris extension is connecting ${label} from your browser. Sign in there if needed.`
                  : `Sign in to ${label} in the isolated window on the host computer.`
                : `Sign in to ${label} in your browser.`}
              <br />
              Pond will finish the connection here.
            </>
          )}
        </p>
      </div>
      <ConnectPromises completed={completed} label={label} />
    </div>
  );
}

const RESPONSIBLE_USE_URL =
  "https://github.com/raphaelsalaja/pond/blob/main/RESPONSIBLE-USE.md";

function ConnectPromises({
  completed,
  label,
}: {
  completed: boolean;
  label: string;
}) {
  return (
    <>
      <div className={styles.details}>
        <p className={styles["details-title"]}>Pond will</p>
        <ul className={styles.checklist}>
          <li>
            <IconCircleCheckFill size={12} className={styles.check} />
            <span>
              {isBrowserRuntime()
                ? "Keep your session on the host computer"
                : "Keep your session on this device"}
            </span>
          </li>
          <li>
            <IconCircleCheckFill size={12} className={styles.check} />
            <span>Read your saved posts</span>
          </li>
          <li>
            <IconCircleCheckFill size={12} className={styles.check} />
            <span>Add new saves to your library</span>
          </li>
        </ul>
      </div>
      {completed ? null : (
        <>
          <ExtensionNote />
          <p className={styles.note}>
            You're responsible for following {label}'s terms while Pond syncs
            your account.{" "}
            <Button
              variant="link"
              size="xs"
              onClick={() => void window.pond.openExternal(RESPONSIBLE_USE_URL)}
            >
              Responsible Use
            </Button>
          </p>
        </>
      )}
    </>
  );
}

function ExtensionNote() {
  const [open, setOpen] = useState(false);
  const mode = useConnectMode();
  if (isBrowserRuntime())
    return (
      <p className={styles.note}>
        {mode === "extension"
          ? "Only the paired extension shares the requested Source session with the Iris host. Captures are saved to that host’s Library."
          : "Sign-in needs access to the host computer. Iris keeps the Account session there; it does not read another browser’s cookies."}
      </p>
    );
  return (
    <p className={styles.note}>
      Pond gets your session through its browser extension. Install it in the
      browser you sign in with.{" "}
      <Button variant="link" size="xs" onClick={() => setOpen(true)}>
        Get Extension
      </Button>
      <BrowserExtensionDialog open={open} onOpenChange={setOpen} />
    </p>
  );
}

export function ConnectActions() {
  const completed = useConnectCompleted();
  const problem = useConnectProblem();
  const account = useConnectedAccount();
  if (completed && account)
    return (
      <Dialog.Confirm
        onClick={() => {
          connectFlow.clear();
          sourceFlow.close();
          openSources({ type: "inspect-account", id: account.id });
        }}
      >
        Continue
      </Dialog.Confirm>
    );
  return (
    <>
      <Dialog.Cancel />
      {problem === "unavailable" ? (
        <Dialog.Confirm onClick={() => connectFlow.retry()}>
          Try Again
        </Dialog.Confirm>
      ) : problem === "signed_out" ? (
        <Dialog.Confirm onClick={() => connectFlow.retry()}>
          Open Sign-In Page
        </Dialog.Confirm>
      ) : null}
    </>
  );
}

function useConnectArrival(): void {
  const waiting = useConnectWaiting();
  const connectedBefore = useConnectedBefore();
  const { refetch } = useAccounts();

  useEffect(() => {
    if (!waiting) return;
    const source = waiting;
    let cancelled = false;
    let arrivedOnce = false;
    let inflight = false;
    let pending = false;
    let importedAccountId: string | null = null;

    const finish = (account: AccountRow) => {
      if (cancelled || arrivedOnce) return;
      arrivedOnce = true;
      syncMonitor.seed(account.id, source, { connected: true });
      if (!account.sync.importPending) void window.pond.syncRunNow(account.id);
      connectFlow.complete(account);
    };

    const tick = () => {
      if (cancelled || arrivedOnce) return;
      if (inflight) {
        pending = true;
        return;
      }
      inflight = true;
      void (async () => {
        try {
          const list = await refetch();
          if (cancelled || arrivedOnce) return;
          const arrived = findArrivedAccount(
            list,
            source,
            connectedBefore,
            importedAccountId,
          );
          if (!arrived) return;
          finish(arrived);
        } catch {
        } finally {
          inflight = false;
          if (pending) {
            pending = false;
            tick();
          }
        }
      })();
    };

    const stopListen = window.pond.onSessionImported((payload) => {
      if (payload.source !== source) return;
      importedAccountId = payload.accountId;
      tick();
    });
    const stopFailureListen = window.pond.onSessionImportFailed((payload) => {
      if (payload.source !== source) return;
      connectFlow.rejectSession(source, payload.reason);
    });

    tick();
    const timer = setInterval(tick, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
      stopListen();
      stopFailureListen();
    };
  }, [waiting, connectedBefore, refetch]);
}
