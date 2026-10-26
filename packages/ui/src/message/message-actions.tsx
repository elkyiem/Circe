import { IconChatBubble, IconCheck, IconCopy } from "@pond/icons";
import { useEffect, useState } from "react";
import { Button } from "../button";
import { ActionHint } from "../shared/action-hint";
import { Tooltip } from "../tooltip";
import styles from "./styles.module.css";

export function ActionBar({
  text,
  onCopy,
  onQuote,
}: {
  text?: string;
  /** Writes the text through the host app; without it the browser clipboard is used. */
  onCopy?: (text: string) => Promise<void>;
  onQuote?: () => void;
} = {}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <Tooltip.Provider>
      <div className={styles.actions}>
        <ActionHint label={copied ? "Copied" : "Copy"}>
          <Button
            icon
            size="xs"
            variant="text"
            aria-label="Copy"
            disabled={!text}
            onClick={() => {
              if (!text) return;
              const write =
                onCopy ?? ((value) => navigator.clipboard.writeText(value));
              void write(text).then(
                () => setCopied(true),
                () => setCopied(false),
              );
            }}
          >
            {copied ? <IconCheck /> : <IconCopy />}
          </Button>
        </ActionHint>
        {onQuote ? (
          <ActionHint label="Quote">
            <Button
              icon
              variant="text"
              size="xs"
              aria-label="Quote"
              onClick={onQuote}
            >
              <IconChatBubble />
            </Button>
          </ActionHint>
        ) : null}
      </div>
    </Tooltip.Provider>
  );
}
