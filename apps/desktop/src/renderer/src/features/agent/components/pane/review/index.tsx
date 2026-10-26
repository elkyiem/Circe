import { Button, Reveal, Swap } from "@pond/ui";
import { Prompt } from "@pond/ui/prompt";
import type { AssistantChange } from "@shared/assistant";
import {
  type ReviewPerform,
  review,
  useReview,
} from "@/features/agent/state/review";
import { useFolders } from "@/features/library";
import { useSourceCovers } from "../save-preview";
import {
  isPurgeTrash,
  reviewOutcome,
  reviewQuestion,
  reviewSummary,
} from "./lib";
import { ChangeRow } from "./row";
import styles from "./styles.module.css";

function useFolderName() {
  const folders = useFolders();
  return (id: string) =>
    folders.find((folder) => folder.id === id)?.name ?? "Deleted Folder";
}

function useChangeCovers(changes: readonly AssistantChange[]) {
  useSourceCovers(changes.flatMap((change) => change.saveId || []));
}

export function ChangeReview({
  messageId,
  changes,
  disabled = false,
  perform,
}: {
  messageId: string;
  changes: AssistantChange[];
  disabled?: boolean;
  perform?: ReviewPerform;
}) {
  const { working, error } = useReview();
  useChangeCovers(changes);
  const busy = disabled || working.length > 0;
  const purges = changes.filter(isPurgeTrash);
  const rest = changes.filter(
    (change) => !isPurgeTrash(change) || change.status !== "pending",
  );
  return (
    <div className={styles.review}>
      {purges.map((change) => (
        <TrashPrompt
          key={change.id}
          messageId={messageId}
          change={change}
          busy={busy}
          perform={perform}
        />
      ))}
      {rest.length ? (
        <LibraryReview
          messageId={messageId}
          changes={rest}
          busy={busy}
          perform={perform}
        />
      ) : null}
      {error?.messageId === messageId ? (
        <p className={styles.error} role="alert">
          {error.text}
        </p>
      ) : null}
    </div>
  );
}

function LibraryReview({
  messageId,
  changes,
  busy,
  perform,
}: {
  messageId: string;
  changes: AssistantChange[];
  busy: boolean;
  perform?: ReviewPerform;
}) {
  const folderName = useFolderName();
  const { working } = useReview();
  const pending = changes.filter((change) => change.status === "pending");
  const [first] = pending;
  const title = first
    ? reviewQuestion(pending.length)
    : reviewOutcome(changes).text;
  const summary = reviewSummary(first ? pending : changes);
  const all = pending.length > 1;
  return (
    <Prompt.Root aria-label={title}>
      <Prompt.Body>
        <Prompt.Title>
          <Swap value={title}>{title}</Swap>
        </Prompt.Title>
        <Prompt.Description>
          <Swap value={summary}>{summary}</Swap>
        </Prompt.Description>
        <ul className={styles.rows} data-closed={first ? undefined : true}>
          {changes.map((change) => (
            <ChangeRow
              key={change.id}
              change={change}
              busy={busy}
              working={working.includes(change.id)}
              folderName={folderName}
              onAction={(action) =>
                void review.run(messageId, [change], action, perform)
              }
              actions={all}
            />
          ))}
        </ul>
      </Prompt.Body>
      <Reveal visible={Boolean(first)} initial={false}>
        <Prompt.Footer>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() =>
              void review.run(messageId, pending, "dismiss", perform)
            }
          >
            {all ? "Dismiss All" : "Dismiss"}
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              void review.run(messageId, pending, "apply", perform)
            }
          >
            {all ? "Apply All" : "Apply"}
          </Button>
        </Prompt.Footer>
      </Reveal>
    </Prompt.Root>
  );
}

function TrashPrompt({
  messageId,
  change,
  busy,
  perform,
}: {
  messageId: string;
  change: AssistantChange;
  busy: boolean;
  perform?: ReviewPerform;
}) {
  return (
    <Prompt.Root
      tone="destructive"
      aria-label="Empty Trash?"
      visible={change.status === "pending"}
    >
      <Prompt.Body>
        <Prompt.Title>Empty Trash?</Prompt.Title>
        <Prompt.Description>
          Every Save in Trash is deleted for good. You can't undo this.
        </Prompt.Description>
      </Prompt.Body>
      <Prompt.Footer>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() =>
            void review.run(messageId, [change], "dismiss", perform)
          }
        >
          Keep Trash
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={busy}
          onClick={() => void review.run(messageId, [change], "apply", perform)}
        >
          Empty Trash
        </Button>
      </Prompt.Footer>
    </Prompt.Root>
  );
}
