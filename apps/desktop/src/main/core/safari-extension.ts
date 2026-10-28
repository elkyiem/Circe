import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { shell } from "electron";
import log from "electron-log/main.js";
import type {
  OkResult,
  OpenSafariResult,
} from "../../shared/query-contracts-shared";

const execFileAsync = promisify(execFile);

/** Safari's own UTI for web extensions; the only plug-in type this module looks at. */
const SAFARI_EXTENSION_POINT = "com.apple.Safari.web-extension";

/**
 * `enabled`      — Safari runs it.
 * `disabled`     — bundled and known to LaunchServices, but switched off in Safari settings.
 * `not_registered` — bundled, yet LaunchServices has not seen it (app was just installed).
 * `not_bundled`  — this build has no appex (dev builds without Xcode, and non-macOS).
 */
export type SafariExtensionState =
  | "enabled"
  | "disabled"
  | "not_registered"
  | "not_bundled";

/**
 * Safari builds its extension list from the code signature. A Developer ID build is listed
 * without help; an ad-hoc one is refused unless Safari's "Allow unsigned extensions" is on,
 * which is why a locally built app appears to have no extension at all.
 */
export type SafariExtensionSignature = "developer-id" | "ad-hoc" | "unknown";

export interface SafariExtensionStatus {
  state: SafariExtensionState;
  bundleId: string | null;
  signature: SafariExtensionSignature;
}

export interface RegisteredExtension {
  id: string;
  enabled: boolean;
  path: string | null;
}

/**
 * Parses `pluginkit -m -v`. Entries are one line each, with a marker column first:
 *
 * ```
 *      so.pond.desktop.Extension(1.0)\t<uuid>\t<date>\t/Applications/Pond.app/Contents/PlugIns/Pond Extension.appex
 * +    so.pond.desktop.Extension(1.0)\t<uuid>\t<date>\t/applications/.../
 * ```
 *
 * `+` means enabled; a space or `-` means registered but off. Some macOS builds print the
 * properties on their own indented lines instead, so both shapes are accepted. Kept pure
 * so it can be tested without `pluginkit` present.
 */
export function parsePluginkit(output: string): RegisteredExtension[] {
  const found: RegisteredExtension[] = [];
  let previous: RegisteredExtension | null = null;
  for (const line of output.split("\n")) {
    const single = line.match(/^([+ -]?)\s*(\S+)\((\d[\d.]*)\)(?:\t(.*))?$/);
    if (single) {
      const fields = (single[4] ?? "").split("\t").filter(Boolean);
      previous = {
        id: single[2] ?? "",
        enabled: single[1] === "+",
        path: fields.at(-1) ?? null,
      };
      found.push(previous);
      continue;
    }
    if (!previous) continue;
    const property = line.match(/^\s+(Path|Parent Bundle) = (.+?)\s*$/);
    if (property?.[1] === "Path") previous.path = property[2] ?? null;
  }
  return found;
}

/** The bundle's Info.plist as XML, converting if Xcode produced a binary plist. */
async function plistText(path: string): Promise<string | null> {
  try {
    const raw = readFileSync(path);
    if (raw.subarray(0, 8).toString("latin1").startsWith("bplist")) {
      const { stdout } = await execFileAsync(
        "plutil",
        ["-convert", "xml1", "-o", "-", path],
        { maxBuffer: 4 * 1024 * 1024 },
      );
      return stdout;
    }
    return raw.toString("utf8");
  } catch (cause) {
    log.warn("[pond safari] could not read Info.plist", path, cause);
    return null;
  }
}

/**
 * The Safari appex this copy of Pond ships, if any. `Contents/PlugIns` is a sibling of
 * `Contents/Resources`, which is what `process.resourcesPath` points at.
 */
async function bundledExtension(): Promise<{
  path: string;
  bundleId: string | null;
} | null> {
  const resources = process.resourcesPath;
  if (!resources) return null;
  const plugIns = join(resources, "..", "PlugIns");
  if (!existsSync(plugIns)) return null;
  let entries: string[];
  try {
    entries = readdirSync(plugIns);
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.endsWith(".appex")) continue;
    const path = join(plugIns, entry);
    const text = await plistText(join(path, "Contents", "Info.plist"));
    if (!text?.includes(SAFARI_EXTENSION_POINT)) continue;
    const bundleId =
      text.match(
        /<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/,
      )?.[1] ?? null;
    return { path, bundleId };
  }
  return null;
}

async function registeredExtensions(): Promise<RegisteredExtension[]> {
  try {
    const { stdout } = await execFileAsync("pluginkit", [
      "-m",
      "-v",
      "-p",
      SAFARI_EXTENSION_POINT,
    ]);
    return parsePluginkit(stdout);
  } catch (cause) {
    // No matches makes pluginkit exit non-zero with empty output; both mean "none".
    log.debug("[pond safari] pluginkit returned nothing", cause);
    return [];
  }
}

/**
 * The output a failed `execFile` captured. Node rejects with an `Error` carrying `stdout`
 * and `stderr` strings, but the error type does not say so.
 */
function captureOf(cause: unknown) {
  // SAFETY: execFile always attaches both buffers to its rejection; the fallbacks cover a
  // non-Error throw, and String() keeps either from being undefined.
  const captured = (cause ?? {}) as { stdout?: unknown; stderr?: unknown };
  return {
    stdout: String(captured.stdout ?? ""),
    stderr: String(captured.stderr ?? ""),
  };
}

/** How the appex is signed, which decides whether Safari lists it unaided. */
async function signatureKind(
  appexPath: string,
): Promise<SafariExtensionSignature> {
  try {
    const { stdout } = await execFileAsync("codesign", ["-dvv", appexPath]);
    return stdout.includes("Authority=Developer ID Application")
      ? "developer-id"
      : "ad-hoc";
  } catch (cause) {
    /** `codesign -d` writes its report to stderr, so a non-zero exit still carries it. */
    const { stdout, stderr } = captureOf(cause);
    const report = `${stdout}\n${stderr}`;
    if (report.includes("Authority=Developer ID Application"))
      return "developer-id";
    if (report.includes("Signature=adhoc")) return "ad-hoc";
    return "unknown";
  }
}

export async function safariExtensionStatus(): Promise<SafariExtensionStatus> {
  if (process.platform !== "darwin") {
    return { state: "not_bundled", bundleId: null, signature: "unknown" };
  }
  const appex = await bundledExtension();
  if (!appex) {
    return { state: "not_bundled", bundleId: null, signature: "unknown" };
  }
  const signature = await signatureKind(appex.path);

  const registered = await registeredExtensions();
  const match = appex.bundleId
    ? registered.find((extension) => extension.id === appex.bundleId)
    : registered.find((extension) => extension.path === appex.path);
  if (!match) {
    return { state: "not_registered", bundleId: appex.bundleId, signature };
  }
  return {
    state: match.enabled ? "enabled" : "disabled",
    bundleId: appex.bundleId,
    signature,
  };
}

/** Where `build-safari-extension.mjs` puts the settings helper. */
function settingsHelper(): string {
  const resources = process.resourcesPath;
  if (!resources) return "";
  return join(resources, "bin", "pond-safari-settings");
}

/**
 * Opens Safari's settings at Pond's extension.
 *
 * `SFSafariApplication.showPreferencesForExtension` is the only supported way in; it is
 * reached through a small signed helper because Electron cannot call it directly. Safari
 * refuses the call when it does not list the extension — which is exactly the case a
 * locally built, ad-hoc signed copy hits — so the failure is reported with the reason
 * instead of silently opening Safari's start page.
 */
export async function openSafariSettings(
  status: SafariExtensionStatus,
): Promise<OpenSafariResult> {
  if (process.platform !== "darwin") {
    return {
      ok: false,
      reason: "unsupported",
      error: "Safari is only on macOS.",
    };
  }
  if (!status.bundleId) {
    return {
      ok: false,
      reason: "not-bundled",
      error: "This build does not include the Safari extension.",
    };
  }

  const helper = settingsHelper();
  if (!helper || !existsSync(helper)) {
    return {
      ok: false,
      reason: "helper-missing",
      error: "This build does not include the Safari settings helper.",
    };
  }

  const args = [status.bundleId];
  try {
    await execFileAsync(helper, args, { timeout: 15_000 });
    return { ok: true };
  } catch (cause) {
    const { stderr } = captureOf(cause);
    const detail = stderr.trim();
    log.warn("[pond safari] settings helper failed", helper, detail, cause);
    /** An ad-hoc build is refused for the signature reason, so point at that setting. */
    return {
      ok: false,
      reason:
        status.signature === "ad-hoc" ? "unsigned-build" : "safari-refused",
      error: detail || "Safari did not open Pond's extension settings.",
    };
  }
}

/** Plain launch, used as the fallback when Safari will not jump to the extension. */
export async function openSafari(): Promise<OkResult> {
  if (process.platform !== "darwin") {
    return { ok: false, error: "Safari is only available on macOS." };
  }
  const failure = await shell.openPath("/Applications/Safari.app");
  if (!failure) return { ok: true };
  try {
    await execFileAsync("open", ["-b", "com.apple.Safari"]);
    return { ok: true };
  } catch (cause) {
    log.warn("[pond safari] could not open Safari", cause);
    return {
      ok: false,
      error:
        "Pond couldn't open Safari. Open it yourself and enable Pond in Settings.",
    };
  }
}
