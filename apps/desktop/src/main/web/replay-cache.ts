import { createPrivateWorkDirectories } from "../lib/private-work-directories";

export function createReplayCache(root: string) {
  return createPrivateWorkDirectories(root, "replay");
}
