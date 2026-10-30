import type { App } from "electron";

/** Called only after the Library transition has drained work and closed servers. */
export function relaunchWebHost(
  runtime: Pick<App, "relaunch" | "exit">,
  supervised: boolean,
): void {
  if (supervised) {
    runtime.exit(75);
    return;
  }
  // The Dock launcher execs Electron; it has no parent that can replace it.
  runtime.relaunch();
  runtime.exit(0);
}
