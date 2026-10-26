import {
  type CombineImagesWindowOpen,
  CombineImagesWindowOpenSchema,
} from "@shared/combine-images-contracts";
import { Store } from "@tanstack/store";

/** Retain an open request while the shared composition UI's lazy chunk loads. */
export const browserCombineStore = new Store<CombineImagesWindowOpen | null>(
  null,
);
export function openBrowserCombine(input: CombineImagesWindowOpen) {
  browserCombineStore.setState(() =>
    CombineImagesWindowOpenSchema.parse(input),
  );
}
export function closeBrowserCombine() {
  browserCombineStore.setState(() => null);
}
