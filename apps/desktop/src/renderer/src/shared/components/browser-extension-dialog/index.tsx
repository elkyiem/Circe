import { CHROME_WEB_STORE_URL, FIREFOX_ADDONS_URL } from "@pond/schema/native";
import { Button, Dialog } from "@pond/ui";
import { useState } from "react";
import styles from "./styles.module.css";

const STORES = [
  {
    name: "Chrome Web Store",
    browsers: "Chrome, Arc, Brave, and Edge",
    action: "Add to Chrome",
    url: CHROME_WEB_STORE_URL,
  },
  {
    name: "Firefox Add-ons",
    browsers: "Firefox and Zen",
    action: "Add to Firefox",
    url: FIREFOX_ADDONS_URL,
  },
];

export function BrowserExtensionDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  async function openStore(url: string): Promise<void> {
    setError(null);
    const result = await window.pond.openExternal(url);
    if (!result.ok) {
      setError("Pond couldn't open the store page. Try again.");
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(next) => !next && setError(null)}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className={styles.popup}>
          <div className={styles.body}>
            <Dialog.Title className={styles.title}>
              Browser Extension
            </Dialog.Title>
            <Dialog.Description>
              Save pages and images from your browser into your library.
            </Dialog.Description>
            {error ? <p className={styles.error}>{error}</p> : null}
            <ul className={styles.stores}>
              {STORES.map((store) => (
                <li key={store.name} className={styles.store}>
                  <div className={styles.text}>
                    <span className={styles.name}>{store.name}</span>
                    <span className={styles.browsers}>{store.browsers}</span>
                  </div>
                  <Button onClick={() => void openStore(store.url)}>
                    {store.action}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
