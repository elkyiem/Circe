import { Button } from "@pond/ui/button";
import { Empty } from "@pond/ui/empty";
import { createRoot } from "react-dom/client";
import appIcon from "../generated/app-icon-previews/aqua.png?inline";
import "@pond/ui/reset.css";
import "@pond/theme/theme.css";
import styles from "./offline.module.css";

function OfflineConnection() {
  return (
    <Empty.Root className={styles.empty}>
      <Empty.Media className={styles.icon}>
        <img src={appIcon} width="48" height="48" alt="" />
      </Empty.Media>
      <Empty.Title>Reconnect to your Library</Empty.Title>
      <Empty.Description>
        Connect to Tailscale and make sure your Mac is awake and running Circé.
      </Empty.Description>
      <Empty.Description>
        Your Library stays on your Mac. Reconnect to continue.
      </Empty.Description>
      <Empty.Action>
        <Button className={styles.retry} onClick={() => location.assign("/")}>
          Try again
        </Button>
      </Empty.Action>
    </Empty.Root>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing offline connection root");
createRoot(root).render(<OfflineConnection />);
