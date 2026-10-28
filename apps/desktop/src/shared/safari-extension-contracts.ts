import type {
  EmptyInput,
  OkResult,
  OpenSafariResult,
} from "./query-contracts-shared";

/**
 * Whether the Safari appex that ships inside Pond.app is switched on.
 *
 * Safari has no store page and nothing to download, so the extension cannot be installed
 * from the dialog the way the Chrome and Firefox ones are. It is already in the bundle;
 * the only unknown is whether Safari lists it and whether the user has enabled it.
 */
export type SafariExtensionState =
  | "enabled"
  | "disabled"
  | "not_registered"
  | "not_bundled";

/**
 * Safari reads the extension from its code signature. A Developer ID build is listed
 * unaided; an ad-hoc one needs Safari's "Allow unsigned extensions", so a locally built
 * copy shows no extension at all until that is on.
 */
export type SafariExtensionSignature = "developer-id" | "ad-hoc" | "unknown";

export interface SafariExtensionStatus {
  state: SafariExtensionState;
  bundleId: string | null;
  signature: SafariExtensionSignature;
}

export interface SafariExtensionQueryInputs {
  "extension.safariStatus": EmptyInput;
  "extension.openSafariSettings": EmptyInput;
  "extension.openSafari": EmptyInput;
}

export interface SafariExtensionQueryResults {
  "extension.safariStatus": SafariExtensionStatus;
  "extension.openSafariSettings": OpenSafariResult;
  "extension.openSafari": OkResult;
}
