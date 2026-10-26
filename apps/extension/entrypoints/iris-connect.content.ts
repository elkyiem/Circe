import { SOURCES } from "@pond/schema/source-ids";
import { sendMessage } from "@/utils/messaging";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  main(context) {
    context.addEventListener(window, "message", (event) => {
      if (event.source !== window || event.origin !== location.origin) return;
      if (
        event.data?.type !== "iris-connect-source" ||
        !SOURCES.includes(event.data.source)
      )
        return;
      // The background also checks the sender against the privately paired host.
      void sendMessage("irisConnectSource", {
        source: event.data.source,
      }).catch(() => {});
    });
  },
});
