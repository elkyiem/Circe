import {
  CirceHostOriginSchema,
  ExtensionPairRequestSchema,
} from "@pond/schema/extension-connection";
import { SOURCES } from "@pond/schema/source-ids";
import { z } from "zod";
import { readConnection, writeConnection } from "@/utils/connection-store";
import { onMessage } from "@/utils/messaging";
import { hostTransport } from "@/utils/native";
import { connectBrowserSource } from "./session";
import { syncSettings } from "./settings";

const PairInput = ExtensionPairRequestSchema.extend({
  origin: CirceHostOriginSchema,
});
const SourceInput = z.strictObject({ source: z.enum(SOURCES) });
const internalPage = (url?: string) =>
  Boolean(url?.startsWith(browser.runtime.getURL("")));
const unavailable = {
  ok: false as const,
  message: "Open the Circé extension panel to change its connection.",
};

export function registerConnectionMessages() {
  onMessage("irisConnection", async ({ sender }) => {
    if (!internalPage(sender.url)) return null;
    const connection = await readConnection().catch(() => null);
    return connection
      ? {
          origin: connection.origin,
          name: connection.name,
          expiresAt: connection.expiresAt,
        }
      : null;
  });
  onMessage("irisPair", async ({ data, sender }) => {
    if (!internalPage(sender.url)) return unavailable;
    try {
      const input = PairInput.parse(data);
      const connection = await hostTransport.pair(
        input.origin,
        input.key,
        input.name,
      );
      await writeConnection(connection);
      await browser.storage.session.remove([
        "libraryTheme",
        "libraryName",
        "sessionPushScheduler",
      ]);
      await browser.alarms.create("iris-session", { periodInMinutes: 0.5 });
      await syncSettings(true);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error && !(error instanceof z.ZodError)
            ? error.message
            : "Check the Circé address and access key.",
      };
    }
  });
  onMessage("irisDisconnect", async ({ sender }) => {
    if (!internalPage(sender.url)) return unavailable;
    try {
      const connection = await readConnection();
      if (connection) await hostTransport.revoke(connection);
      await writeConnection(null);
      await browser.alarms.clear("iris-session");
      await browser.storage.session.remove([
        "libraryTheme",
        "libraryName",
        "sessionPushScheduler",
      ]);
      return { ok: true };
    } catch {
      return {
        ok: false,
        message:
          "Couldn't revoke the connection. Reconnect to the Circé host and try again.",
      };
    }
  });
  onMessage("irisConnectSource", async ({ data, sender }) => {
    const connection = await readConnection();
    if (
      !connection ||
      !sender.url ||
      new URL(sender.url).origin !== connection.origin
    )
      return { ok: false, message: "This page is not the paired Circé host." };
    const parsed = SourceInput.safeParse(data);
    if (!parsed.success)
      return { ok: false, message: "Choose a supported Source." };
    return connectBrowserSource(parsed.data.source);
  });
}
