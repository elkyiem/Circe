import { Button, Dialog } from "@pond/ui";
import {
  ReplayParentMessageSchema,
  type WebReplayTicket,
} from "@shared/web-replay-contracts";
import { useEffect, useRef, useState } from "react";
import { browserReplay } from "@/features/saves/browser-replay";
import { archiveUrlKey } from "@/features/saves/lib/media/archive";
import styles from "./styles.module.css";

export default function BrowserArchiveFrame({
  saveId,
  pageUrl,
  reload,
  onNavigate,
}: {
  saveId: string;
  pageUrl: string;
  reload: number;
  onNavigate(url: string): void;
}) {
  const [ticket, setTicket] = useState<WebReplayTicket | null>(null);
  const [error, setError] = useState("");
  const [external, setExternal] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const currentPage = useRef(pageUrl);
  const navigate = useRef(onNavigate);
  currentPage.current = pageUrl;
  navigate.current = onNavigate;
  const proposals = useRef<number[]>([]);
  const previousReload = useRef(reload);

  useEffect(() => {
    let disposed = false;
    let opened: WebReplayTicket | null = null;
    setTicket(null);
    setError("");
    setExternal(null);
    void browserReplay.open({ saveId, pageUrl: currentPage.current }).then(
      (value) => {
        opened = value;
        if (disposed) void browserReplay.close(value.id).catch(() => {});
        else setTicket(value);
      },
      (failure: Error) => {
        if (!disposed) setError(failure.message);
      },
    );
    return () => {
      disposed = true;
      if (opened) void browserReplay.close(opened.id).catch(() => {});
    };
  }, [saveId]);

  useEffect(() => {
    if (!ticket) return;
    const visit = () =>
      frame.current?.contentWindow?.postMessage(
        {
          type: "circe-replay:visit",
          generation: ticket.generation,
          url: currentPage.current,
        },
        ticket.origin,
      );
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== ticket.origin ||
        event.source !== frame.current?.contentWindow
      )
        return;
      const parsed = ReplayParentMessageSchema.safeParse(event.data);
      if (!parsed.success || parsed.data.generation !== ticket.generation)
        return;
      const message = parsed.data;
      if (message.type === "circe-replay:ready") visit();
      else if (message.type === "circe-replay:navigate") {
        if (archiveUrlKey(message.url) !== archiveUrlKey(currentPage.current))
          navigate.current(message.url);
      } else if (message.type === "circe-replay:error")
        setError(message.message);
      else {
        const now = Date.now();
        proposals.current = proposals.current.filter(
          (time) => time > now - 60_000,
        );
        if (proposals.current.length >= 3) return;
        proposals.current.push(now);
        setExternal((previous) => previous ?? message.url);
      }
    };
    window.addEventListener("message", receive);
    visit();
    return () => window.removeEventListener("message", receive);
  }, [ticket]);

  useEffect(() => {
    if (ticket)
      frame.current?.contentWindow?.postMessage(
        {
          type: "circe-replay:visit",
          generation: ticket.generation,
          url: pageUrl,
        },
        ticket.origin,
      );
  }, [ticket, pageUrl]);
  useEffect(() => {
    if (previousReload.current === reload) return;
    previousReload.current = reload;
    if (ticket)
      frame.current?.contentWindow?.postMessage(
        {
          type: "circe-replay:reload",
          generation: ticket.generation,
        },
        ticket.origin,
      );
  }, [ticket, reload]);

  return (
    <div className={styles.root} data-browser-archive>
      {ticket ? (
        <iframe
          ref={frame}
          className={styles.frame}
          src={ticket.url}
          title="Archived page"
          sandbox="allow-scripts allow-same-origin"
          referrerPolicy="no-referrer"
        />
      ) : null}
      {error || !ticket ? (
        <p className={styles.status} role="status">
          {error || "Opening archived page…"}
        </p>
      ) : null}
      <Dialog.Root
        open={external !== null}
        onOpenChange={(open) => {
          if (!open) setExternal(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Popup>
            <Dialog.Header>
              <Dialog.Title>Open this link?</Dialog.Title>
              <Dialog.Close />
            </Dialog.Header>
            <Dialog.Content>
              <Dialog.Description>
                This link leaves your saved archive and opens the live website.
              </Dialog.Description>
              <p className={styles.url}>{external}</p>
            </Dialog.Content>
            <Dialog.Footer>
              <Button
                onClick={() => {
                  if (external) void window.pond.openExternal(external);
                  setExternal(null);
                }}
              >
                Open Link
              </Button>
            </Dialog.Footer>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
