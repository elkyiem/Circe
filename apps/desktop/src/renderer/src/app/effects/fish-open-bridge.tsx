import { useEffect } from "react";
import { addSavesToChat } from "@/features/agent";

export function FishOpenBridge(): null {
  useEffect(
    () =>
      window.pond.onFishOpen(({ fishId, saveIds }) =>
        addSavesToChat(saveIds, fishId),
      ),
    [],
  );
  return null;
}
