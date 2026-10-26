import { useEffect, useRef, useState } from "react";
import styles from "./styles.module.css";

interface ResponseAnnouncementProps {
  running: boolean;
  responseId?: string;
  requiredAction?: string;
  error?: string | null;
  stopped?: boolean;
}

export function ResponseAnnouncement({
  running,
  responseId,
  requiredAction,
  error,
  stopped,
}: ResponseAnnouncementProps) {
  const previous = useRef({
    running,
    responseId,
    requiredAction,
    error,
    stopped,
  });
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    const before = previous.current;
    previous.current = { running, responseId, requiredAction, error, stopped };
    if (
      error &&
      (error !== before.error ||
        before.running ||
        responseId !== before.responseId)
    )
      setAnnouncement(`Response failed: ${error}`);
    else if (running) setAnnouncement("");
    else if (
      requiredAction &&
      (before.running ||
        requiredAction !== before.requiredAction ||
        responseId !== before.responseId)
    )
      setAnnouncement(requiredAction);
    else if (
      responseId &&
      (before.running ||
        responseId !== before.responseId ||
        stopped !== before.stopped)
    )
      setAnnouncement(stopped ? "Response stopped." : "Response complete.");
  }, [running, responseId, requiredAction, error, stopped]);
  return (
    <span
      className={styles.announcement}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {announcement}
    </span>
  );
}
