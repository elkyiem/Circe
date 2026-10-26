import { compareVersions } from "@pond/schema/changelog";

const STATE_KEY = "pond:fishIntro";
/** The first release with this dialog; 2.0.0 shipped Fish without it. */
const INTRO_VERSION = "2.0.1";

type IntroState = "due" | "shown";

/** Libraries that ran a release before this dialog existed have never been introduced to Fish. */
export function isFishIntroDue(lastSeenVersion: string | null): boolean {
  return (
    lastSeenVersion !== null &&
    compareVersions(lastSeenVersion, INTRO_VERSION) < 0
  );
}

export function readFishIntroState(): IntroState | null {
  try {
    const value = localStorage.getItem(STATE_KEY);
    return value === "due" || value === "shown" ? value : null;
  } catch {
    return "shown";
  }
}

export function writeFishIntroState(state: IntroState): void {
  try {
    localStorage.setItem(STATE_KEY, state);
  } catch {}
}
