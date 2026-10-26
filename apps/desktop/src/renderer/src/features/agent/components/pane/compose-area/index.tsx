import type { AgentModelOptions } from "@pond/schema";
import { Button } from "@pond/ui";
import { ComposerView } from "@pond/ui/composer";
import { ErrorNotice } from "@pond/ui/error-notice";
import type { AssistantProvider, AssistantSource } from "@shared/assistant";
import { type RefObject, useRef, useState } from "react";
import {
  type AssistantState,
  assistant,
} from "@/features/agent/state/assistant";
import { isLibrarySaveDrag, saveDropIds } from "@/features/saves";
import { openSettings } from "@/shared/lib/open-settings";
import { ComposerEditor, type ComposerEditorHandle } from "../../composer";
import { AttachFilesButton } from "../attach-files";
import { ChatContext } from "../chat-context";
import { ReferencedSavesPopover } from "../consulted-saves";
import { FileAttachments } from "../file-attachments";
import { ModelPicker } from "../model-picker";
import { ResponseAnnouncement } from "../response-announcement";
import styles from "./styles.module.css";

interface ComposeAreaProps {
  state: AssistantState;
  provider: AssistantProvider | "";
  modelId: string;
  modelOptions: AgentModelOptions;
  patchModel: (next: { provider: AssistantProvider; modelId: string }) => void;
  patchModelOptions: (next: AgentModelOptions) => void;
  running: boolean;
  chatError: Error | undefined;
  lastAssistantId: string | undefined;
  lastError: string | undefined;
  lastStopped?: boolean;
  requiredAction: string | undefined;
  referencesOpen: boolean;
  referenceSources: AssistantSource[];
  attachedIds: string[];
  conversationSources: AssistantSource[];
  inputRef: RefObject<ComposerEditorHandle | null>;
  focus: () => void;
  attach: (sources: AssistantSource[]) => void;
  submit: (content?: string) => void;
}

export function ComposeArea({
  state,
  provider,
  modelId,
  modelOptions,
  patchModel,
  patchModelOptions,
  running,
  chatError,
  lastAssistantId,
  lastError,
  lastStopped,
  requiredAction,
  referencesOpen,
  referenceSources,
  attachedIds,
  conversationSources,
  inputRef,
  focus,
  attach,
  submit,
}: ComposeAreaProps) {
  const [dropping, setDropping] = useState(false);
  const composer = useRef<HTMLDivElement>(null);
  return (
    <div className={styles["compose-area"]}>
      <ResponseAnnouncement
        key={state.chatId ?? "draft"}
        running={running}
        responseId={lastAssistantId}
        requiredAction={requiredAction}
        error={state.error ?? chatError?.message ?? lastError}
        stopped={lastStopped}
      />
      <div className={styles.notices}>
        {!provider ? (
          <ErrorNotice
            title="Connect a provider in Settings before you can send."
            actions={
              <Button size="sm" onClick={() => openSettings("models")}>
                Open Settings
              </Button>
            }
          />
        ) : null}
        {state.error || chatError ? (
          <ErrorNotice
            title={
              state.error ??
              chatError?.message ??
              "Could not send this message."
            }
            onRetry={state.failed ? () => void assistant.retry() : undefined}
            actions={
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => openSettings("agent-models")}
                >
                  Open Models
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={assistant.clearError}
                >
                  Dismiss
                </Button>
              </>
            }
          />
        ) : null}
      </div>
      <ReferencedSavesPopover
        open={referencesOpen}
        sources={referenceSources}
        attachedIds={attachedIds}
        anchorRef={composer}
        onAttach={attach}
        onClose={() => assistant.closeReferences()}
      />
      <div
        ref={composer}
        onDragEnterCapture={(event) => {
          if (!isLibrarySaveDrag(event.dataTransfer)) return;
          event.preventDefault();
          setDropping(true);
        }}
        onDragOverCapture={(event) => {
          if (!isLibrarySaveDrag(event.dataTransfer)) return;
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
          setDropping(true);
        }}
        onDragLeaveCapture={(event) => {
          if (
            event.relatedTarget instanceof Node &&
            event.currentTarget.contains(event.relatedTarget)
          )
            return;
          setDropping(false);
        }}
        onDropCapture={(event) => {
          const ids = saveDropIds(event.dataTransfer);
          if (!ids.length) return;
          event.preventDefault();
          setDropping(false);
          void assistant.attachIds(ids);
          requestAnimationFrame(focus);
        }}
      >
        <ComposerView
          placeholder={
            running ? "Draft your next message" : "Ask about your Saves"
          }
          running={running}
          data-dragging={dropping || undefined}
          onSend={() => submit()}
          onStop={assistant.stop}
          toolbar={
            <>
              <AttachFilesButton
                disabled={state.loading}
                onAttach={(files) => {
                  assistant.attachFiles(files);
                  requestAnimationFrame(focus);
                }}
              />
              <ChatContext
                attached={state.attachments}
                previous={conversationSources}
              />
              <ModelPicker
                provider={provider}
                modelId={modelId}
                options={modelOptions}
                disabled={running}
                onChange={patchModel}
                onOptionsChange={patchModelOptions}
              />
            </>
          }
          editor={
            <ComposerEditor
              key={state.chatId ?? "draft"}
              ref={inputRef}
              value={state.draft}
              disabled={state.loading || !provider}
              running={running}
              placeholder={
                running ? "Draft your next message" : "Ask about your Saves"
              }
              attachments={state.attachments}
              anchorRef={composer}
              onChange={(value) => assistant.setDraft(value)}
              onSend={submit}
              onAttach={attach}
              onRemove={(id) => assistant.removeAttachment(id)}
              onDropIds={(ids) => {
                void assistant.attachIds(ids);
                requestAnimationFrame(focus);
              }}
            />
          }
        >
          <FileAttachments
            files={state.files}
            onRemove={assistant.removeFile}
          />
        </ComposerView>
      </div>
    </div>
  );
}
