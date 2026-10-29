import type { WebReplayTicket } from "@shared/web-replay-contracts";

interface BrowserReplayTransport {
  open(input: { saveId: string; pageUrl: string }): Promise<WebReplayTicket>;
  close(id: string): Promise<void>;
}
let transport: BrowserReplayTransport | null = null;

/** Browser composition supplies transport; the shared viewer retains navigation and presentation. */
export function configureBrowserReplay(input: BrowserReplayTransport): void {
  transport = input;
}
export const browserReplay = {
  open(input: { saveId: string; pageUrl: string }) {
    if (!transport)
      throw new Error("Browser archives are not connected. Reload Circé.");
    return transport.open(input);
  },
  async close(id: string): Promise<void> {
    await transport?.close(id);
  },
};
