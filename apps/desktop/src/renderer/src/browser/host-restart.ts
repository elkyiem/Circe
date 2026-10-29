/** A successful write can replace the host; do not reload into its shutdown window. */
export async function waitForHostRestart(dependencies: {
  previous: string;
  readInstance: (remainingMs: number) => Promise<string>;
  pause: (milliseconds: number) => Promise<void>;
  attempts: number;
  timeoutMs: number;
  now?: () => number;
}): Promise<void> {
  const now = dependencies.now ?? Date.now;
  const deadline = now() + dependencies.timeoutMs;
  for (let attempt = 0; attempt < dependencies.attempts; attempt++) {
    const remaining = deadline - now();
    if (remaining <= 0) break;
    await dependencies.pause(Math.min(500, remaining));
    const requestTime = deadline - now();
    if (requestTime <= 0) break;
    try {
      if (
        (await dependencies.readInstance(requestTime)) !== dependencies.previous
      )
        return;
    } catch {
      // A proxy error or closed socket is expected while the old host exits.
    }
  }
  throw new Error(
    "The Library was saved, but the host has not returned. Reload to reconnect.",
  );
}
