import { SOURCES } from "@pond/schema/source-ids";
import { z } from "zod";
import { sendMessage } from "@/utils/messaging";

const Connect = z
  .object({ type: z.literal("iris-connect-source"), source: z.enum(SOURCES) })
  .strict();

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  main(context) {
    context.addEventListener(window, "message", (event) => {
      if (event.source !== window || event.origin !== location.origin) return;
      const parsed = Connect.safeParse(event.data);
      if (!parsed.success) return;
      // The background also checks the sender against the privately paired host.
      void sendMessage("irisConnectSource", {
        source: parsed.data.source,
      }).catch(() => {});
    });
  },
});
