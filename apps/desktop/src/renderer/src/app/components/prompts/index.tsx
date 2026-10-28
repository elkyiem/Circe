import { Dialog } from "@pond/ui";
import { useEffect, useState } from "react";
import { BrowserExtensionDialog } from "@/shared/components/browser-extension-dialog";
import { fishIntroDialog } from "@/shared/state/fish-intro";
import {
  type PromptId,
  promptDialog,
  useActivePrompt,
} from "@/shared/state/prompts";
import { setupFlow } from "@/shared/state/setup";
import { supportDialog } from "@/shared/state/support";
import { whatsNewDialog } from "@/shared/state/whats-new";
import {
  hasAskedForSupport,
  markAskedForSupport,
} from "../support-dialog/eligibility";
import { promptSpec } from "./catalog";
import { pickPrompt, promptsSettledBy } from "./eligibility";
import { hasAsked, markAsked, readPromptSignals } from "./signals";
import styles from "./styles.module.css";

const CHECK_DELAY_MS = 20_000;

function anotherDialogOpen(): boolean {
  return (
    setupFlow.isOpen() ||
    whatsNewDialog.isOpen() ||
    supportDialog.isOpen() ||
    fishIntroDialog.isOpen() ||
    promptDialog.isOpen()
  );
}

/** One automatic ask per launch at most, and never on top of another dialog. */
function useAskOncePerLaunch(): void {
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const signals = await readPromptSignals(Date.now());
        if (!active || anotherDialogOpen()) return;
        const choice = pickPrompt(signals, (id) =>
          id === "support" ? hasAskedForSupport() : hasAsked(id),
        );
        if (choice === "support") {
          markAskedForSupport();
          supportDialog.open();
        } else if (choice) {
          for (const id of promptsSettledBy(choice)) markAsked(id);
          promptDialog.open(choice);
        }
      } catch {}
    }, CHECK_DELAY_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);
}

export function PromptHost() {
  const id = useActivePrompt();
  const [shown, setShown] = useState<PromptId | null>(null);
  const [extensionOpen, setExtensionOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useAskOncePerLaunch();

  if (id !== null && id !== shown) setShown(id);
  const spec = shown ? promptSpec(shown) : null;

  async function confirm() {
    if (!spec) return;
    setBusy(true);
    try {
      await spec.run({ openExtension: () => setExtensionOpen(true) });
    } finally {
      setBusy(false);
      promptDialog.close();
    }
  }

  return (
    <>
      <Dialog.Root
        open={id !== null}
        onOpenChange={(next) => {
          if (!next) promptDialog.close();
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Popup>
            <Dialog.Header data-empty />
            {spec ? (
              <>
                <Dialog.Content>
                  <div className={styles.body}>
                    <div className={styles.visual}>
                      <span className={styles.tile} data-tone={spec.tone}>
                        {spec.icon}
                      </span>
                    </div>
                    <div className={styles.copy}>
                      <Dialog.Title className={styles.title}>
                        {spec.title}
                      </Dialog.Title>
                      <Dialog.Description className={styles.description}>
                        {spec.description}
                      </Dialog.Description>
                    </div>
                    {spec.note ? (
                      <p className={styles.note}>{spec.note}</p>
                    ) : null}
                  </div>
                </Dialog.Content>
                <Dialog.Footer layout="fill">
                  <Dialog.Cancel>{spec.cancel ?? "Not Now"}</Dialog.Cancel>
                  <Dialog.Confirm
                    disabled={busy}
                    onClick={() => void confirm()}
                  >
                    {spec.confirm}
                  </Dialog.Confirm>
                </Dialog.Footer>
              </>
            ) : null}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
      <BrowserExtensionDialog
        open={extensionOpen}
        onOpenChange={setExtensionOpen}
      />
    </>
  );
}
