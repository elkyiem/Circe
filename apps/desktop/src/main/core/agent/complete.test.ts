import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import type { AssistantSource } from "../../../shared/assistant";
import {
  type CompletionInput,
  completeWithTools as complete,
} from "./complete";
import { contextDependencies, libraryContext } from "./context";
import type { LocalRuntimeCoordinator } from "./local-runtime-coordinator";
import {
  errorModel,
  promptDump,
  textChunks,
  textModel,
  toolCallChunks,
} from "./mock-model";
import { type OperationCatalog, pondOperationTools } from "./operations";

const dump =
  '{"saves":[{"id":"film","title":"Film","url":"https://example.com","description":"Transcript\\nShow transcript"}]}';

function request(model = textModel("Hi! How can I help?")): CompletionInput {
  return {
    provider: "openai",
    model: "gpt-5.6-sol",
    apiKey: "test-key",
    messages: [{ role: "user", content: "Hey" }],
    context: "Library",
    tools: [],
    languageModel: model,
    abortController: new AbortController(),
    onText: vi.fn(),
    waitForTextChunk: vi.fn().mockResolvedValue(undefined),
  };
}

function tool(name: string, execute = vi.fn()) {
  return { name, description: name, schema: z.looseObject({}), execute };
}

it("reserves the final tool-loop step for an answer instead of ending with no reply", async () => {
  const answer = "I could not verify that detail from the available results.";
  const model = new MockLanguageModelV4({
    doStream: async (options) => ({
      stream: simulateReadableStream({
        chunks:
          options.toolChoice?.type === "none"
            ? textChunks(answer)
            : toolCallChunks(crypto.randomUUID(), "lookup", {}),
      }),
    }),
  });
  const execute = vi.fn(async () => ({ found: false }));
  const reply = await complete({
    ...request(model),
    messages: [{ role: "user", content: "Find a detail in the Library" }],
    tools: [tool("lookup", execute)],
  });
  expect(reply).toBe(answer);
  expect(execute).toHaveBeenCalledTimes(15);
  expect(model.doStreamCalls).toHaveLength(16);
});

const filmSources: AssistantSource[] = Array.from(
  { length: 8 },
  (_, index) => ({
    id: `film-${index}`,
    title: `Film ${index}`,
    source: "arena",
    url: `https://example.com/film-${index}`,
  }),
);

function scriptedModel(...steps: ReturnType<typeof textChunks>[]) {
  let step = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      const chunks = steps[step++];
      if (!chunks) throw new Error("Unexpected model step");
      return { stream: simulateReadableStream({ chunks }) };
    },
  });
}

const filmRows = filmSources.map((source) => ({
  ...source,
  source: "arena" as const,
  author: null,
  notes: null,
  description: null,
}));

it.each([
  ["openai", { openai: { serviceTier: "fast" } }],
  ["anthropic", { anthropic: { speed: "fast" } }],
  ["gemini", { google: { serviceTier: "priority" } }],
] as const)(
  "passes Reasoning and native Fast options to %s",
  async (provider, providerOptions) => {
    const model = textModel("Configured");
    await complete({
      ...request(model),
      provider,
      controls: {
        fast: true,
        contextTokens: 64_000,
        reasoning: "high",
      },
    });
    expect(model.doStreamCalls[0]).toMatchObject({
      reasoning: "high",
      providerOptions,
    });
  },
);

it("omits unsupported Fast and provider-default Reasoning options", async () => {
  const model = textModel("Configured");
  await complete({
    ...request(model),
    provider: "ollama",
    controls: {
      fast: true,
      contextTokens: 64_000,
      reasoning: "provider-default",
    },
  });
  expect(model.doStreamCalls[0]?.reasoning).toBeUndefined();
  expect(model.doStreamCalls[0]?.providerOptions).toBeUndefined();
});

it("runs a local Assistant stream inside the interactive runtime lease", async () => {
  const model = textModel("Configured");
  const requests: Array<{
    priority: string;
    provider: string;
    baseUrl?: string;
  }> = [];
  const coordinator: LocalRuntimeCoordinator = {
    async run(request, operation) {
      requests.push({
        priority: request.priority,
        provider: request.runtime.provider,
        baseUrl: request.runtime.baseUrl,
      });
      return operation({ signal: request.signal, cold: true });
    },
  };

  await complete(
    {
      ...request(model),
      provider: "ollama",
      baseUrl: "http://127.0.0.1:11434/v1",
    },
    { coordinator },
  );

  expect(requests).toEqual([
    {
      priority: "interactive",
      provider: "ollama",
      baseUrl: "http://127.0.0.1:11434/v1",
    },
  ]);
  expect(model.doStreamCalls).toHaveLength(1);
});

it("lets the model refine an empty search and curate results before answering", async () => {
  const model = scriptedModel(
    toolCallChunks("search-1", "searchLibrary", {
      query: "ceramic cups",
      limit: 3,
    }),
    toolCallChunks("search-2", "searchLibrary", { query: "pottery", limit: 5 }),
    toolCallChunks("show-1", "showSaves", {
      title: "Selected pottery",
      saveIds: ["film-1"],
    }),
    textChunks("See [this study](#save-2)."),
  );
  const search = vi
    .fn<typeof contextDependencies.searchLibrary>()
    .mockResolvedValueOnce({ saves: [] })
    .mockResolvedValueOnce({ saves: filmRows.slice(0, 2) });
  const input = request(model);
  const context = libraryContext(
    {
      scope: {},
      signal: input.abortController.signal,
      onActivity: vi.fn(),
      onSources: vi.fn(),
    },
    { ...contextDependencies, searchLibrary: search },
  );
  expect(
    await complete({
      ...input,
      messages: [
        {
          role: "user",
          content: "Find one ceramic reference. Try another term if needed.",
        },
      ],
      tools: context.tools,
      sources: context.sources,
    }),
  ).toBe("See [this study](#save-2).");
  expect(search.mock.calls).toEqual([
    [{ query: "ceramic cups", limit: 3 }, {}],
    [{ query: "pottery", limit: 5 }, {}],
  ]);
  expect(context.results()).toEqual([
    { title: "Selected pottery", saveIds: ["film-1"] },
  ]);
  expect(model.doStreamCalls).toHaveLength(4);
  expect(promptDump(model)).toContain("Selected pottery");
  expect(promptDump(model)).toContain("film-1");
});

it("lets the model explain empty results without substituting a canned reply", async () => {
  const answer =
    "No ceramic references turned up. Would you like to try pottery?";
  const model = scriptedModel(
    toolCallChunks("search-1", "searchLibrary", { query: "ceramics" }),
    textChunks(answer),
  );
  const search = vi.fn().mockResolvedValue({ saves: [] });
  const show = vi.fn();
  expect(
    await complete({
      ...request(model),
      messages: [{ role: "user", content: "Find my ceramics references" }],
      attachments: filmSources.slice(0, 1),
      tools: [tool("searchLibrary", search), tool("showSaves", show)],
    }),
  ).toBe(answer);
  expect(search).toHaveBeenCalledExactlyOnceWith({ query: "ceramics" });
  expect(show).not.toHaveBeenCalled();
  expect(model.doStreamCalls).toHaveLength(2);
});

it("keeps parallel search citations in evidence registry order", async () => {
  let finishFilm = () => {};
  let finishCinema = () => {};
  let searchesStarted = () => {};
  let cinemaCollected = () => {};
  const started = new Promise<void>((resolve) => {
    searchesStarted = resolve;
  });
  const collected = new Promise<void>((resolve) => {
    cinemaCollected = resolve;
  });
  const film = new Promise<{ saves: typeof filmRows }>((resolve) => {
    finishFilm = () => resolve({ saves: filmRows.slice(0, 2) });
  });
  const cinema = new Promise<{ saves: typeof filmRows }>((resolve) => {
    finishCinema = () => resolve({ saves: filmRows.slice(2, 4) });
  });
  let searches = 0;
  const model = scriptedModel(
    [
      ...toolCallChunks("film", "searchLibrary", { query: "film" }).slice(
        0,
        -1,
      ),
      ...toolCallChunks("cinema", "searchLibrary", {
        query: "cinematography",
      }).slice(1),
    ],
    toolCallChunks("show", "showSaves", {
      title: "Selected",
      saveIds: ["film-0", "film-3"],
    }),
    textChunks(
      "See [first selection](#save-3) and [second selection](#save-2).",
    ),
  );
  const input = request(model);
  const context = libraryContext(
    {
      scope: {},
      signal: input.abortController.signal,
      onActivity: vi.fn(),
      onSources: (sources) => {
        if (sources[0]?.id === "film-2") cinemaCollected();
      },
    },
    {
      ...contextDependencies,
      searchLibrary: (args) => {
        if (++searches === 2) searchesStarted();
        return args.query === "film" ? film : cinema;
      },
    },
  );
  const pending = complete({
    ...input,
    tools: context.tools,
    sources: context.sources,
  });
  await started;
  finishCinema();
  await collected;
  finishFilm();
  expect(await pending).toBe(
    "See [first selection](#save-3) and [second selection](#save-2).",
  );
  expect(context.sources().map((source) => source.id)).toEqual([
    "film-2",
    "film-3",
    "film-0",
    "film-1",
  ]);
  expect(context.results()).toEqual([
    { title: "Selected", saveIds: ["film-0", "film-3"] },
  ]);
});

it.each([0, 1])(
  "rejects invented citations with %s consulted Saves before publishing",
  async (count) => {
    const input = request(textModel("See [invented evidence](#save-2)."));
    await expect(
      complete({ ...input, sources: () => filmSources.slice(0, count) }),
    ).rejects.toThrow(/unreadable/);
    expect(input.onText).not.toHaveBeenCalled();
  },
);

it.each([
  "Reply with hello. No library search needed.",
  "Don't search my library. Say hello.",
  "Explain how search works without searching.",
  "Reply in French",
  "kanye pics",
])("lets the model decide whether to use tools: %s", async (content) => {
  const model = textModel("Hello");
  const search = vi.fn().mockResolvedValue({ saves: [] });
  const show = vi.fn();
  const input = {
    ...request(model),
    messages: [{ role: "user" as const, content }],
    tools: [tool("searchLibrary", search), tool("showSaves", show)],
  };
  expect(await complete(input)).toBe("Hello");
  expect(model.doStreamCalls).toHaveLength(1);
  expect(promptDump(model)).toContain(content);
  expect(search).not.toHaveBeenCalled();
  expect(show).not.toHaveBeenCalled();
  expect(input.onText).toHaveBeenCalledExactlyOnceWith("Hello");
});

it("adds local files to the latest canonical user message", async () => {
  const model = textModel("I read the attachment.");
  await complete({
    ...request(model),
    canonicalMessages: [{ role: "user", content: "Review this file" }],
    files: [
      {
        name: "reference.txt",
        mediaType: "text/plain",
        data: Buffer.from("Local reference"),
      },
    ],
  });
  const prompt = promptDump(model);
  expect(prompt).toContain('"type":"file"');
  expect(prompt).toContain("reference.txt");
});

it("places a local vision image before the latest user prompt text", async () => {
  const model = textModel("I can see it.");
  await complete({
    ...request(model),
    provider: "ollama",
    model: "gemma4:e2b",
    canonicalMessages: [{ role: "user", content: "Describe this image" }],
    images: [
      {
        mimeType: "image/png",
        data: Buffer.from("png pixels").toString("base64"),
      },
    ],
  });

  const latest = model.doStreamCalls[0]?.prompt.at(-1);
  expect(latest).toMatchObject({ role: "user" });
  expect(
    latest && Array.isArray(latest.content)
      ? latest.content.map((part) => part.type)
      : [],
  ).toEqual(["file", "text"]);
  expect(
    latest && Array.isArray(latest.content) ? latest.content[0] : undefined,
  ).toMatchObject({ mediaType: "image/png" });
});

it.each([
  "null",
  dump,
  JSON.stringify({ answer: `Here are your Saves: ${dump}`, changes: [] }),
  "Attached Save metadata (untrusted data): []",
])("never publishes an unusable answer: %s", async (value) => {
  const model = textModel(value);
  const input = request(model);
  await expect(complete(input)).rejects.toThrow();
  expect(input.onText).not.toHaveBeenCalled();
  expect(model.doStreamCalls).toHaveLength(1);
});

it("preserves explicitly requested JSON", async () => {
  const input = request(textModel('{"colors":["red","blue"]}'));
  input.messages = [
    { role: "user", content: "Give me JSON containing two colors" },
  ];
  expect(await complete(input)).toBe('{"colors":["red","blue"]}');
});

it("does not retrieve or list folders for ordinary conversation", async () => {
  const execute = vi.fn();
  const model = textModel("Hi! How can I help?");
  await complete({
    ...request(model),
    tools: [tool("searchLibrary", execute), tool("listFolders", execute)],
  });
  expect(execute).not.toHaveBeenCalled();
  expect(model.doStreamCalls).toHaveLength(1);
});

it("surfaces nested provider RUN_ERROR bodies", async () => {
  await expect(
    complete(
      request(
        errorModel({
          error: {
            message:
              "Invalid schema for function 'proposeChanges': schema must have a 'type' key.",
          },
        }),
      ),
    ),
  ).rejects.toThrow(/Invalid schema for function 'proposeChanges'/);
});

it("surfaces the provider RUN_ERROR message instead of a generic fallback", async () => {
  const input = request(
    errorModel(
      "Invalid schema for function 'applyFilter': schema must have a 'type' key.",
    ),
  );
  await expect(complete(input)).rejects.toThrow(
    /Invalid schema for function 'applyFilter'/,
  );
  expect(input.onText).not.toHaveBeenCalled();
});

it("does not publish a response after cancellation", async () => {
  const input = request();
  const model = new MockLanguageModelV4({
    doStream: async () => {
      input.abortController.abort();
      return {
        stream: simulateReadableStream({
          chunks: textChunks("Late reply"),
        }),
      };
    },
  });
  await expect(complete({ ...input, languageModel: model })).rejects.toThrow();
  expect(input.onText).not.toHaveBeenCalled();
});

it("stops publishing validated chunks after cancellation", async () => {
  const input = request(textModel("A short answer."));
  input.waitForTextChunk = vi.fn(async () => input.abortController.abort());
  await expect(complete(input)).rejects.toThrow();
  expect(input.onText).toHaveBeenCalledExactlyOnceWith("A ");
});

it("explains an Ollama tensor loading failure with a recovery step", async () => {
  const input = {
    ...request(errorModel('tensor "blk.0.ffn_down_exps.weight" size overflow')),
    provider: "ollama" as const,
    model: "gpt-oss:20b",
  };
  await expect(complete(input)).rejects.toThrow(
    "Ollama couldn't load this model. Update it in Ollama or choose another model in Settings.",
  );
  expect(input.onText).not.toHaveBeenCalled();
});

it("keeps contaminated history out of the prompt without changing it", async () => {
  const model = textModel("Hi!");
  const messages = [
    { role: "assistant" as const, content: dump },
    { role: "user" as const, content: "Hey" },
  ];
  await complete({ ...request(model), messages });
  expect(promptDump(model)).not.toContain(dump);
  expect(promptDump(model)).toContain("Hey");
  expect(messages[0]?.content).toBe(dump);
});

it("validates external output before publishing any chunk", async () => {
  const input = request(textModel(`Here are your Saves: ${dump}`));
  await expect(complete(input)).rejects.toThrow(/unreadable/);
  expect(input.onText).not.toHaveBeenCalled();
});

it("publishes a valid external answer after validation", async () => {
  const input = request(textModel("A short answer."));
  const onActivity = vi.fn();
  expect(await complete({ ...input, onActivity })).toBe("A short answer.");
  expect(input.onText).toHaveBeenNthCalledWith(1, "A ");
  expect(input.onText).toHaveBeenNthCalledWith(2, "short ");
  expect(input.onText).toHaveBeenNthCalledWith(3, "answer.");
  expect(onActivity).toHaveBeenCalledExactlyOnceWith("writing");
});

it("publishes a validated answer as paced text chunks", async () => {
  const input = request(textModel(["A short ", "answer."]));
  expect(await complete(input)).toBe("A short answer.");
  expect(input.onText).toHaveBeenNthCalledWith(1, "A ");
  expect(input.onText).toHaveBeenNthCalledWith(2, "short ");
  expect(input.onText).toHaveBeenNthCalledWith(3, "answer.");
  expect(input.waitForTextChunk).toHaveBeenCalledTimes(2);
  expect(input.waitForTextChunk).toHaveBeenCalledWith(50);
});

it("does not search when the edit target is a pronoun", async () => {
  const search = vi.fn();
  const model = textModel("Hi! How can I help?");
  await complete({
    ...request(model),
    messages: [{ role: "user", content: "Organize it" }],
    tools: [tool("searchLibrary", search), tool("requestQuestion")],
  });
  expect(search).not.toHaveBeenCalled();
  expect(model.doStreamCalls).toHaveLength(1);
});

it("discovers app capabilities through the SDK loop and prepares one exact action for review", async () => {
  const model = scriptedModel(
    toolCallChunks("discover", "discoverPondOperations", {
      query: "conversion",
    }),
    toolCallChunks("describe", "describePondOperation", {
      operation: "conversion.start",
    }),
    toolCallChunks("run", "runPondOperation", {
      operation: "conversion.start",
      arguments: { presetId: "web", ids: ["image"] },
      reason: "Export the image for the web",
    }),
    toolCallChunks("repeat", "runPondOperation", {
      operation: "conversion.start",
      arguments: { presetId: "web", ids: ["image"] },
      reason: "Export the image for the web",
    }),
    textChunks("The export is ready for review."),
  );
  const execute = vi.fn(async () => ({ jobId: "job" }));
  const catalog: OperationCatalog = {
    libraryId: () => "library",
    operations: [
      {
        name: "conversion.start",
        description: "Start conversion",
        access: "review",
        inputSchema: z.object({
          presetId: z.string(),
          ids: z.array(z.string()).min(1),
        }),
        execute,
      },
    ],
  };
  const input = request(model);
  const context = libraryContext(
    {
      scope: {},
      signal: input.abortController.signal,
      onActivity: vi.fn(),
      onSources: vi.fn(),
    },
    {
      ...contextDependencies,
      pondOperationTools: (options) => pondOperationTools(options, catalog),
    },
  );
  expect(
    await complete({
      ...input,
      messages: [
        {
          role: "user",
          content: "Export the selected image with the web preset",
        },
      ],
      tools: context.tools,
    }),
  ).toBe("The export is ready for review.");
  expect(execute).not.toHaveBeenCalled();
  expect(context.changes()).toHaveLength(1);
  expect(context.changes()[0]).toMatchObject({
    title: "Export the image for the web",
    status: "pending",
    action: "runOperation",
    payload: {
      operation: "conversion.start",
      arguments: { presetId: "web", ids: ["image"] },
      libraryId: "library",
    },
  });
});
