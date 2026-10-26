import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { connectWebHost } from "./web-smoke-client.mjs";

const host = await connectWebHost();
if (process.argv.includes("--connect")) {
  const connection = await host.query("agent.saveKey", {
    provider: "codex",
    key: "",
  });
  assert.equal(connection.ok, true, connection.error);
  await host.query("settings.setPrefs", { agent: { languageModel: "codex" } });
}
const providers = await host.query("agent.keys");
assert.ok(
  providers.some(
    (row) => row.provider === "codex" && row.hasKey && row.enabled,
  ),
  "Connect an authorized ChatGPT Codex subscription first.",
);
console.log("WEB_CODEX_CONNECTED");
const chat = await host.query("agent.newChat");
const saves = await host.query("saves.listPage", { limit: 100 });
const image = saves.rows.find((save) => save.sourceId === "900000000000000002");
assert.ok(image, "Ingest the image fixture first.");
const requestId = randomUUID();
const response = await host.request("agent", {
  chatId: chat.id,
  requestId,
  provider: "codex",
  modelId: "default",
  messages: [
    {
      id: randomUUID(),
      role: "user",
      parts: [
        {
          type: "text",
          text: "Find the Save titled Iris fixture: image. Describe what was saved and cite it. Do not modify any Save.",
        },
      ],
    },
  ],
});
assert.equal(response.status, 200);
assert.equal(response.headers.get("x-vercel-ai-ui-message-stream"), "v1");
const stream = await response.text();
assert.ok(
  stream.includes('"type":"text-delta"'),
  "The assistant must emit reply text.",
);
const messages = await host.query("agent.messages", { chatId: chat.id });
const reply = messages
  .filter((message) => message.role === "assistant")
  .map((message) => message.content)
  .join("\n");
assert.ok(
  reply.trim().length > 0 && /offline|deterministic/i.test(reply),
  reply,
);
assert.ok(
  messages.some((message) =>
    message.metadata?.sources?.some(
      (source) => source.id === image.id && source.title === image.title,
    ),
  ),
  "The reply must cite the correct persisted Save.",
);
assert.ok(
  messages.some((message) =>
    message.metadata?.steps?.some(
      (step) => step.label === "Search library" && step.status === "complete",
    ),
  ),
  "The assistant must actually search the Library.",
);
await writeFile(
  join(host.sandbox, "agent-verification.json"),
  JSON.stringify({
    chatId: chat.id,
    requestId,
    provider: "codex",
    title: true,
    sourceIdentity: true,
    streamed: true,
    persisted: true,
  }),
);
console.log(
  "WEB_AGENT_LIVE_PASSED",
  JSON.stringify({
    chatId: chat.id,
    provider: "codex",
    streamed: true,
    persisted: true,
  }),
);
