import type { Prefs } from "@pond/schema/db";
import type {
  MediaUnderstandInput,
  MediaUnderstandOperationalMetric,
  MediaUnderstandResult,
} from "@shared/query-contracts-system";
import { florenceModelVersion, runFlorence } from "./florence";
import { loadImage } from "./image";

export type MediaUnderstandingTask = MediaUnderstandInput["task"];

type MediaUnderstandingRouterDependencies = {
  florenceModelVersion: () => string;
  runFlorence: (
    task: MediaUnderstandingTask,
    imageUrl: string,
  ) => Promise<string>;
  understandMedia: (
    saveId: string,
    task: MediaUnderstandingTask,
  ) => Promise<MediaUnderstandResult>;
  operationalSink: {
    record(metric: MediaUnderstandOperationalMetric): void;
  };
};

type MediaUnderstandingRunInput = {
  saveId: string;
  imageUrl: string;
  task: MediaUnderstandingTask;
  prefs: Prefs["ai"];
};

type MediaUnderstandingText = { text: string; model: string };

class GemmaMediaUnderstandingError extends Error {
  readonly reason: Extract<MediaUnderstandResult, { ok: false }>["reason"];
  readonly operation?: MediaUnderstandOperationalMetric;

  constructor(result: Extract<MediaUnderstandResult, { ok: false }>) {
    super(`Local media understanding failed: ${result.reason}`);
    this.name = "GemmaMediaUnderstandingError";
    this.reason = result.reason;
    this.operation = result.operation;
  }
}

const FLORENCE_TASK = {
  caption: "<CAPTION>",
  ocr: "<OCR>",
} as const;

const defaultDependencies: MediaUnderstandingRouterDependencies = {
  florenceModelVersion,
  async runFlorence(task, imageUrl) {
    const image = await loadImage(imageUrl);
    return runFlorence(image, FLORENCE_TASK[task]);
  },
  understandMedia(saveId, task) {
    return window.pond.query("saves.understandMedia", { saveId, task });
  },
  operationalSink: {
    record(metric) {
      console.info("[pond media] local understanding fallback", metric);
    },
  },
};

function gemmaModelVersion(
  task: MediaUnderstandingTask,
  prefs: Prefs["ai"],
): string {
  return `${prefs.mediaUnderstandingProvider}/${prefs.mediaUnderstandingModelId.trim()}:${task}:v1`;
}

function gemmaFailure(result: Extract<MediaUnderstandResult, { ok: false }>) {
  return new GemmaMediaUnderstandingError(result);
}

const FALLBACK_FAILURES = new Set<
  Extract<MediaUnderstandResult, { ok: false }>["reason"]
>([
  "model_unavailable",
  "model_not_vision",
  "timeout",
  "generation_failed",
  "empty_output",
  "model_chatter",
  "output_too_long",
  "internal_error",
  "unsupported_media",
  "too_large",
]);

/** These files cannot be sent to the local model, so a failed attempt must not stay eligible. */
const UNREADABLE_MEDIA = new Set<
  Extract<MediaUnderstandResult, { ok: false }>["reason"]
>(["unsupported_media", "too_large"]);

export function createMediaUnderstandingRouter(
  dependencies: Partial<MediaUnderstandingRouterDependencies> = {},
) {
  const resolved = { ...defaultDependencies, ...dependencies };

  async function runGemma(
    saveId: string,
    task: MediaUnderstandingTask,
  ): Promise<MediaUnderstandingText> {
    const result = await resolved.understandMedia(saveId, task);
    if (!result.ok) throw gemmaFailure(result);
    return { text: result.text, model: result.model };
  }

  async function runFlorencePrimary(
    input: MediaUnderstandingRunInput,
  ): Promise<MediaUnderstandingText> {
    return {
      text: await resolved.runFlorence(input.task, input.imageUrl),
      model: resolved.florenceModelVersion(),
    };
  }

  return {
    primaryModel(task: MediaUnderstandingTask, prefs: Prefs["ai"]): string {
      return prefs.mediaUnderstandingMode === "gemma4"
        ? gemmaModelVersion(task, prefs)
        : resolved.florenceModelVersion();
    },
    async run(
      input: MediaUnderstandingRunInput,
    ): Promise<MediaUnderstandingText> {
      if (input.prefs.mediaUnderstandingMode === "gemma4") {
        try {
          return await runGemma(input.saveId, input.task);
        } catch (error) {
          if (!(error instanceof GemmaMediaUnderstandingError)) throw error;
          if (
            input.prefs.mediaUnderstandingFallbackToFlorence &&
            FALLBACK_FAILURES.has(error.reason)
          ) {
            const fallback = await runFlorencePrimary(input);
            if (error.operation) {
              try {
                resolved.operationalSink.record({
                  ...error.operation,
                  fallbackUsed: true,
                });
              } catch {
                /** Operational metrics must never affect enrichment. */
              }
            }
            /** The sweep compares this stamp with the selected model, so a fallback must not stay eligible. */
            return {
              text: fallback.text,
              model: gemmaModelVersion(input.task, input.prefs),
            };
          }
          if (UNREADABLE_MEDIA.has(error.reason)) {
            return {
              text: "",
              model: gemmaModelVersion(input.task, input.prefs),
            };
          }
          throw error;
        }
      }

      return await runFlorencePrimary(input);
    },
  };
}

export type MediaUnderstandingRouter = ReturnType<
  typeof createMediaUnderstandingRouter
>;

export const mediaUnderstandingRouter = createMediaUnderstandingRouter();
