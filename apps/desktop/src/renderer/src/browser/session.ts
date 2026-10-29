import { WebSessionSchema } from "@shared/web-contracts";

/** Only an authentication rejection should open the access-key form. */
export async function readBrowserSession() {
  const response = await fetch("/web/session");
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("The host is temporarily unavailable.");
  return WebSessionSchema.parse(await response.json());
}
