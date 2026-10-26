import type { Capture } from "@pond/schema/raw";
import { TerminalError } from "../../../pipeline/extractors/errors";

/** Watch pages sit behind Turnstile, so captures come only from the API. */
export function buildExpression(): string {
  throw new TerminalError("vimeo watch pages are not loaded");
}

export function adapt(): Capture | null {
  return null;
}
