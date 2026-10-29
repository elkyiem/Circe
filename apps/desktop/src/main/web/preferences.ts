import type { z } from "zod";
import { WebRequestError } from "./errors";

/** Durable host folders are authorized by the location chooser, never by a preference string. */
export function validateWebPreferences(
  params: Record<string, z.infer<ReturnType<typeof z.json>>> | undefined,
) {
  if (params && Object.hasOwn(params, "autoImport"))
    throw new WebRequestError(
      "Use the Mac host folder controls to change a watched folder.",
      422,
    );
}
