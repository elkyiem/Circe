import { useChat } from "@ai-sdk/react";
import { IconArrowsExpandDiagonal, IconXmark } from "@pond/icons";
import type { AgentModelOptions } from "@pond/schema";
import { Button, Tooltip } from "@pond/ui";
import { Thread } from "@pond/ui/thread";
import {
  agentModelOptionsFor,
  agentModelOptionsKey,
  runControlsForOptions,
} from "@shared/agent-model-options";
import {
  ASSISTANT_MODELS,
  type AssistantProvider,
  type AssistantSource,
} from "@shared/assistant";
import { chosenModelId } from "@shared/provider-models";
import { MotionConfig, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";
import {
  type AssistantState,
  assistant,
  useAssistant,
} from "@/features/agent/state/assistant";
import { pondChatSession } from "@/features/agent/state/pond-chat";
import { fromUIMessage } from "@/features/agent/state/pond-messages";
import { libraryChrome } from "@/features/library";
import { getAppRouter } from "@/shared/lib/app-router";
import { usePrefs } from "@/shared/state/prefs";
import type { ComposerEditorHandle } from "../composer";
import { AgentMessage } from "./agent-message";
import { ChatActions } from "./chat-actions";
import { ChatHeader } from "./chat-header";
import { useRememberedChatScroll } from "./chat-scroll";
import { ComposeArea } from "./compose-area";
import styles from "./styles.module.css";

export { AgentMessage } from "./agent-message";

function AgentPaneContent({
  layout,
  state,
  provider,
  modelId,
  modelOptions,
  patchModel,
  patchModelOptions,
  reduceMotion,
}: {
  layout: "page" | "pane";
  state: AssistantState;
  provider: AssistantProvider | "";
  modelId: string;
  modelOptions: AgentModelOptions;
  patchModel: (next: { provider: AssistantProvider; modelId: string }) => void;
  patchModelOptions: (next: AgentModelOptions) => void;
  reduceMotion: boolean;
}) {
  const [renamingChat, setRenamingChat] = useState(false);
  const input = useRef<ComposerEditorHandle>(null);
  const chat = pondChatSession(state.chatId ?? "draft");
  const { messages, status, error: chatError } = useChat({ chat });
  const viewportRef = useRememberedChatScroll(state.chatId ?? "draft");
  const running =
    status === "submitted" || status === "streaming" || state.busy;
  const referenceMessage = state.messages.find(
    (message) => message.id === state.referenceMessageId,
  );
  const referenceSources = referenceMessage?.metadata?.sources;
  const retainedReferenceSources = useRef<AssistantSource[]>([]);
  if (referenceSources?.length)
    retainedReferenceSources.current = referenceSources;
  const attachedIds = state.attachments.map((source) => source.id);
  const conversationSources = [
    ...new Map(
      state.messages
        .flatMap((message) => message.metadata?.attachments ?? [])
        .map((save) => [save.id, save]),
    ).values(),
  ];
  const lastAssistantId = [...messages]
    .reverse()
    .find((message) => message.role === "assistant")?.id;

  const lastResponse = messages.find(
    (message) => message.id === lastAssistantId,
  );
  const lastMetadata = lastResponse
    ? fromUIMessage(lastResponse, state.chatId ?? "pending").metadata
    : undefined;
  const questionAnswered = state.messages.some(
    (message) => message.metadata?.replyToQuestion === lastAssistantId,
  );
  const requiredAction =
    lastMetadata?.question && !questionAnswered
      ? "Assistant needs your answer. Read the latest response to continue."
      : lastMetadata?.changes?.length
        ? "Assistant changes are ready for review. Read the latest response to continue."
        : undefined;

  function focus() {
    input.current?.focus();
  }
  function attach(sources: AssistantSource[]) {
    assistant.attach(sources);
    requestAnimationFrame(focus);
  }
  function submit(content = state.draft) {
    if (!provider || running) return;
    assistant.setDraft(content);
    void assistant.send(provider, {
      modelId,
      controls: runControlsForOptions(modelOptions),
    });
  }
  async function answerQuestion(messageId: string, answer: string) {
    if (!provider || running) return;
    await assistant.answerQuestion(messageId, answer, provider, {
      modelId,
      controls: runControlsForOptions(modelOptions),
    });
  }

  return (
    <MotionConfig
      reducedMotion={reduceMotion ? "always" : "never"}
      transition={{ type: "spring", duration: 0.22, bounce: 0 }}
    >
      <section
        className={styles.assistant}
        data-layout={layout}
        data-reduced-motion={reduceMotion || undefined}
        aria-label="Assistant"
      >
        <ChatHeader
          chatId={state.chatId}
          chats={state.chats}
          disabled={running || state.loading}
          renaming={renamingChat}
          onFinishRenaming={() => setRenamingChat(false)}
          onNewChat={
            layout === "page"
              ? () => {
                  assistant.newChat();
                  requestAnimationFrame(focus);
                }
              : undefined
          }
          onOpenChat={(id) => void assistant.openChat(id)}
        >
          {layout === "page" ? (
            <ChatActions
              chatId={state.chatId}
              title={
                state.chats.find((chat) => chat.id === state.chatId)?.title ??
                null
              }
              messages={state.messages}
              disabled={running || state.loading}
              onRename={() => setRenamingChat(true)}
            />
          ) : (
            <>
              <Tooltip label="Open Assistant Page" side="bottom">
                <Button
                  icon
                  size="sm"
                  variant="ghost"
                  aria-label="Open Assistant Page"
                  onClick={() => getAppRouter()?.history.push("/assistant")}
                >
                  <IconArrowsExpandDiagonal />
                </Button>
              </Tooltip>
              <Tooltip label="Close Assistant" side="bottom">
                <Button
                  icon
                  size="sm"
                  variant="ghost"
                  aria-label="Close Assistant"
                  onClick={() => libraryChrome.setAgentOpen(false)}
                >
                  <IconXmark />
                </Button>
              </Tooltip>
            </>
          )}
        </ChatHeader>
        <div className={styles["assistant-workspace"]}>
          <Thread.Conversation
            key={state.chatId ?? "new"}
            className={styles["assistant-body"]}
            viewportProps={{
              className: styles["chat-viewport"],
              ref: viewportRef,
            }}
            empty={
              state.loading ? <p role="status">Loading conversation</p> : null
            }
            composer={
              <ComposeArea
                state={state}
                provider={provider}
                modelId={modelId}
                modelOptions={modelOptions}
                patchModel={patchModel}
                patchModelOptions={patchModelOptions}
                running={running}
                chatError={chatError}
                lastAssistantId={lastAssistantId}
                lastError={lastMetadata?.error}
                lastStopped={lastMetadata?.stopped}
                requiredAction={requiredAction}
                referencesOpen={Boolean(referenceSources?.length)}
                referenceSources={retainedReferenceSources.current}
                attachedIds={attachedIds}
                conversationSources={conversationSources}
                inputRef={input}
                focus={focus}
                attach={attach}
                submit={submit}
              />
            }
          >
            {messages.map((message) => (
              <article
                key={message.id}
                aria-label={
                  message.role === "assistant"
                    ? "Assistant response"
                    : "Your message"
                }
              >
                <AgentMessage
                  message={message}
                  state={state}
                  provider={provider || ASSISTANT_MODELS[0].id}
                  attachedIds={attachedIds}
                  attach={attach}
                  streaming={
                    status === "streaming" &&
                    message.role === "assistant" &&
                    message.id === messages.at(-1)?.id
                  }
                  latest={message.id === lastAssistantId}
                  onAnswer={answerQuestion}
                />
              </article>
            ))}
          </Thread.Conversation>
        </div>
      </section>
    </MotionConfig>
  );
}

export function AgentPane({ layout = "pane" }: { layout?: "page" | "pane" }) {
  const state = useAssistant();
  const [prefs, patchPrefs] = usePrefs("agent");
  const [preferences] = usePrefs("preferences");
  const systemReducedMotion = useReducedMotion();
  const reduceMotion =
    preferences.reduceMotion === "always" ||
    (preferences.reduceMotion !== "never" && Boolean(systemReducedMotion));
  const provider =
    ASSISTANT_MODELS.find((model) => model.id === prefs.languageModel)?.id ??
    "";
  const modelId = provider ? chosenModelId(provider, prefs) : "";
  const modelOptions = agentModelOptionsFor(
    prefs.modelOptions,
    provider,
    modelId,
  );
  return (
    <AgentPaneContent
      layout={layout}
      state={state}
      provider={provider}
      modelId={modelId}
      modelOptions={modelOptions}
      patchModel={(next) => {
        const update: Partial<typeof prefs> = {
          languageModel: next.provider,
          modelIds: { ...prefs.modelIds, [next.provider]: next.modelId },
        };
        if (next.provider === "ollama") update.ollamaModelId = next.modelId;
        if (next.provider === "lmstudio") update.lmstudioModelId = next.modelId;
        patchPrefs(update);
      }}
      patchModelOptions={(next) => {
        if (!provider || !modelId) return;
        patchPrefs({
          modelOptions: {
            ...prefs.modelOptions,
            [agentModelOptionsKey(provider, modelId)]: next,
          },
        });
      }}
      reduceMotion={reduceMotion}
    />
  );
}
