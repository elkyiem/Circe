import { WebReplayTicketSchema } from "@shared/web-replay-contracts";
import type { WebValue } from "@shared/web-serialization";
import { configureBrowserReplay } from "@/features/saves/browser-replay";
import bootstrapAsset from "./replay-bootstrap?worker&url";
import workerAsset from "./replay-worker?worker&url";

export function installBrowserReplay(input: {
  request(path: string, body?: string): Promise<WebValue>;
  headers(): Record<string, string>;
}) {
  const opened = new Set<string>();
  configureBrowserReplay({
    async open(selection) {
      const ticket = WebReplayTicketSchema.parse(
        await input.request(
          "replay",
          JSON.stringify({
            action: "open",
            ...selection,
            workerAsset,
            bootstrapAsset,
          }),
        ),
      );
      if (new URL(ticket.url).origin !== ticket.origin)
        throw new Error("The host returned an invalid archive address.");
      opened.add(ticket.id);
      return ticket;
    },
    async close(id) {
      opened.delete(id);
      await input.request("replay", JSON.stringify({ action: "close", id }));
    },
  });
  window.addEventListener(
    "pagehide",
    () => {
      for (const id of opened)
        void fetch("/web/replay", {
          method: "POST",
          headers: input.headers(),
          body: JSON.stringify({ action: "close", id }),
          keepalive: true,
        }).catch(() => {});
      opened.clear();
    },
    { once: true },
  );
}
