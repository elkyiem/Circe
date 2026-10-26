import type { AgentStreamRequest } from "../../shared/assistant";
import { stopMessage } from "../core/agent/chat";
import { streamAgentTurn } from "../core/agent/stream";

/** Keep the existing AI SDK stream intact and stop the exact turn on disconnect. */
export async function webAgentStream(
  input: AgentStreamRequest,
  signal: AbortSignal,
) {
  const response = await streamAgentTurn(input);
  const reader = response.body?.getReader();
  if (!reader) return response;
  const stop = () => {
    void reader.cancel().catch(() => {});
    void stopMessage(input.chatId, input.requestId);
  };
  signal.addEventListener("abort", stop, { once: true });
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          signal.removeEventListener("abort", stop);
          controller.close();
        } else controller.enqueue(chunk.value);
      } catch (error) {
        signal.removeEventListener("abort", stop);
        controller.error(error);
      }
    },
    cancel() {
      signal.removeEventListener("abort", stop);
      stop();
    },
  });
  if (signal.aborted) stop();
  return new Response(body, {
    status: response.status,
    headers: response.headers,
  });
}
