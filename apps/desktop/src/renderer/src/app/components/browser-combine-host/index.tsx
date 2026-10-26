import { Dialog } from "@pond/ui";
import { useSelector } from "@tanstack/react-store";
import { lazy, Suspense } from "react";
import {
  browserCombineStore,
  closeBrowserCombine,
} from "../../../browser/combine-images";
import styles from "./styles.module.css";

const CombineImages = lazy(() =>
  import("@/features/saves/components/combine-images").then((module) => ({
    default: module.CombineImages,
  })),
);

export function BrowserCombineHost() {
  const input = useSelector(browserCombineStore, (value) => value);
  if (!input) return null;
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) closeBrowserCombine();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className={styles.popup} aria-label="Combine Images">
          <Suspense fallback={<p role="status">Loading image composition</p>}>
            <CombineImages
              {...input}
              onClose={closeBrowserCombine}
              subscribeZoom={() => () => {}}
              onResolveDrop={async (files) => {
                const result = await window.pond.query("saves.importFiles", {
                  paths: files.map((file) => window.pond.pathForFile(file)),
                });
                if (!result.ok)
                  throw new Error("The images could not be uploaded.");
                return result.ids ?? [];
              }}
            />
          </Suspense>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
