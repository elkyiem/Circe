import { SHORTCUT_PLATFORM } from "@shared/shortcuts";

export function isBrowserRuntime(): boolean {
  return globalThis.document?.documentElement.dataset.runtime === "browser";
}

/** navigator.platform is stable for the process lifetime; resolve the reveal label once. */
export const REVEAL_LABEL: string = (() => {
  if (!globalThis.navigator) return "Reveal in Finder";
  const p = navigator.platform?.toLowerCase() ?? "";
  if (p.includes("win")) return "Reveal in File Explorer";
  if (p.includes("linux")) return "Show in File Manager";
  return "Reveal in Finder";
})();

export const IS_MAC: boolean = SHORTCUT_PLATFORM === "mac";

/** Native setup paths follow the host OS, even from another visiting device. */
export function hostNavigatorPlatform(): string {
  switch (globalThis.document?.documentElement.dataset.hostPlatform) {
    case "darwin":
      return "MacIntel";
    case "win32":
      return "Win32";
    case "linux":
      return "Linux";
    default:
      return globalThis.navigator?.platform ?? "";
  }
}

/** Provider execution and OS settings belong to the host, not the visiting browser. */
export function isMacHost(): boolean {
  const host = globalThis.document?.documentElement.dataset.hostPlatform;
  return host ? host === "darwin" : IS_MAC;
}

export function hostDeviceName(): string {
  if (isBrowserRuntime())
    return isMacHost() ? "your Mac host" : "your host computer";
  return THIS_DEVICE;
}

/** The device noun used in settings copy. */
export const THIS_DEVICE: string = IS_MAC ? "this Mac" : "this computer";

export const FILE_MANAGER: string = IS_MAC
  ? "Finder"
  : SHORTCUT_PLATFORM === "windows"
    ? "File Explorer"
    : "your file manager";

/** The native share sheet exists only on macOS; main rejects saves.share elsewhere. */
export function canShareOn(platformName: string): boolean {
  const p = platformName.toLowerCase();
  return !p.includes("win") && !p.includes("linux");
}

export const CAN_SHARE: boolean = canShareOn(
  globalThis.navigator?.platform ?? "",
);

type Platform = "mac" | "other";

let platform: Platform | null = null;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const cb of listeners) cb();
}

function _ensure(): void {
  if (platform !== null || pending) return;
  pending = window.pond.appInfo().then((info) => {
    platform = info.platform === "darwin" ? "mac" : "other";
    pending = null;
    emit();
  });
}
