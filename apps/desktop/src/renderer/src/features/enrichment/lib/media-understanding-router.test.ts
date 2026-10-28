import { PrefsSchema } from "@pond/schema";
import type {
  MediaUnderstandOperationalMetric,
  MediaUnderstandResult,
} from "@shared/query-contracts-system";
import { describe, expect, it, vi } from "vitest";
import { createMediaUnderstandingRouter } from "./media-understanding-router";

describe("media understanding preferences", () => {
  it("keeps Florence as the backwards-compatible default", () => {
    const prefs = PrefsSchema.parse({});

    expect(prefs.ai.mediaUnderstandingMode).toBe("florence");
    expect(prefs.ai.mediaUnderstandingProvider).toBe("ollama");
    expect(prefs.ai.mediaUnderstandingModelId).toBe("gemma4:e2b");
    expect(prefs.ai.mediaUnderstandingFallbackToFlorence).toBe(false);
  });

  it("reads the removed comparison mode as Florence", () => {
    const prefs = PrefsSchema.parse({
      ai: { mediaUnderstandingMode: "shadow" },
    });

    expect(prefs.ai.mediaUnderstandingMode).toBe("florence");
  });

  it("falls back field-by-field when stored values are invalid", () => {
    const prefs = PrefsSchema.parse({
      ai: {
        enableCaption: true,
        mediaUnderstandingMode: "removed-mode",
        mediaUnderstandingProvider: "cloud",
        mediaUnderstandingModelId: 42,
        mediaUnderstandingFallbackToFlorence: "yes",
      },
    });

    expect(prefs.ai.enableCaption).toBe(true);
    expect(prefs.ai.mediaUnderstandingMode).toBe("florence");
    expect(prefs.ai.mediaUnderstandingProvider).toBe("ollama");
    expect(prefs.ai.mediaUnderstandingModelId).toBe("gemma4:e2b");
    expect(prefs.ai.mediaUnderstandingFallbackToFlorence).toBe(false);
  });
});

function ai(
  mode: "florence" | "gemma4",
): ReturnType<typeof PrefsSchema.parse>["ai"] {
  return {
    ...PrefsSchema.parse({}).ai,
    mediaUnderstandingMode: mode,
    mediaUnderstandingProvider: "ollama",
    mediaUnderstandingModelId: "gemma4:e2b",
  };
}

function setup(
  result: MediaUnderstandResult = {
    ok: true,
    text: "Gemma caption",
    model: "ollama/gemma4:e2b:caption:v1",
  },
) {
  const operationalRecords: MediaUnderstandOperationalMetric[] = [];
  const runFlorence = vi.fn(async () => "Florence caption");
  const understandMedia = vi.fn(async () => result);
  const router = createMediaUnderstandingRouter({
    florenceModelVersion: () => "florence:v2",
    runFlorence,
    understandMedia,
    operationalSink: {
      record: (record) => operationalRecords.push(record),
    },
  });
  return {
    router,
    runFlorence,
    understandMedia,
    operationalRecords,
  };
}

describe("media-understanding router", () => {
  it("uses Florence as the sole primary in Florence mode", async () => {
    const { router, runFlorence, understandMedia } = setup();

    await expect(
      router.run({
        saveId: "save-1",
        imageUrl: "pond://save-1/image.png",
        task: "caption",
        prefs: ai("florence"),
      }),
    ).resolves.toEqual({ text: "Florence caption", model: "florence:v2" });
    expect(runFlorence).toHaveBeenCalledExactlyOnceWith(
      "caption",
      "pond://save-1/image.png",
    );
    expect(understandMedia).not.toHaveBeenCalled();
  });

  it("uses and returns Gemma output in Gemma mode", async () => {
    const { router, runFlorence, understandMedia } = setup();

    await expect(
      router.run({
        saveId: "save-1",
        imageUrl: "pond://save-1/image.png",
        task: "caption",
        prefs: ai("gemma4"),
      }),
    ).resolves.toEqual({
      text: "Gemma caption",
      model: "ollama/gemma4:e2b:caption:v1",
    });
    expect(understandMedia).toHaveBeenCalledExactlyOnceWith(
      "save-1",
      "caption",
    );
    expect(runFlorence).not.toHaveBeenCalled();
  });

  it("surfaces a primary Gemma query failure", async () => {
    const { router } = setup({ ok: false, reason: "model_unavailable" });

    await expect(
      router.run({
        saveId: "save-1",
        imageUrl: "pond://save-1/image.png",
        task: "caption",
        prefs: ai("gemma4"),
      }),
    ).rejects.toThrow("model_unavailable");
  });

  it("falls back to Florence only when the user enabled it", async () => {
    const { router, runFlorence, operationalRecords } = setup({
      ok: false,
      reason: "generation_failed",
      operation: {
        modelId: "gemma4:e2b",
        task: "caption",
        temperature: "warm",
        durationMs: 120,
        imageBytes: 512,
        outcome: "generation_failed",
        fallbackUsed: false,
      },
    });

    await expect(
      router.run({
        saveId: "save-1",
        imageUrl: "pond://save-1/image.png",
        task: "caption",
        prefs: {
          ...ai("gemma4"),
          mediaUnderstandingFallbackToFlorence: true,
        },
      }),
    ).resolves.toEqual({
      text: "Florence caption",
      model: "ollama/gemma4:e2b:caption:v1",
    });
    expect(runFlorence).toHaveBeenCalledOnce();
    expect(operationalRecords).toEqual([
      {
        modelId: "gemma4:e2b",
        task: "caption",
        temperature: "warm",
        durationMs: 120,
        imageBytes: 512,
        outcome: "generation_failed",
        fallbackUsed: true,
      },
    ]);
  });

  it("never falls back after cancellation", async () => {
    const { router, runFlorence } = setup({ ok: false, reason: "aborted" });

    await expect(
      router.run({
        saveId: "save-1",
        imageUrl: "pond://save-1/image.png",
        task: "caption",
        prefs: {
          ...ai("gemma4"),
          mediaUnderstandingFallbackToFlorence: true,
        },
      }),
    ).rejects.toThrow("aborted");
    expect(runFlorence).not.toHaveBeenCalled();
  });

  it("does not record fallback use when Florence also fails", async () => {
    const operationalRecords: MediaUnderstandOperationalMetric[] = [];
    const router = createMediaUnderstandingRouter({
      florenceModelVersion: () => "florence:v2",
      runFlorence: async () => {
        throw new Error("Florence failed");
      },
      understandMedia: async () => ({
        ok: false,
        reason: "generation_failed",
        operation: {
          modelId: "gemma4:e2b",
          task: "caption",
          temperature: "cold",
          durationMs: 100,
          imageBytes: 512,
          outcome: "generation_failed",
          fallbackUsed: false,
        },
      }),
      operationalSink: {
        record: (record) => operationalRecords.push(record),
      },
    });

    await expect(
      router.run({
        saveId: "save-1",
        imageUrl: "pond://save-1/image.png",
        task: "caption",
        prefs: {
          ...ai("gemma4"),
          mediaUnderstandingFallbackToFlorence: true,
        },
      }),
    ).rejects.toThrow("Florence failed");
    expect(operationalRecords).toEqual([]);
  });

  it("finishes unreadable media so the sweep does not retry it", async () => {
    const { router, runFlorence } = setup({
      ok: false,
      reason: "unsupported_media",
    });

    await expect(
      router.run({
        saveId: "save-1",
        imageUrl: "pond://save-1/clip.mp4",
        task: "caption",
        prefs: ai("gemma4"),
      }),
    ).resolves.toEqual({ text: "", model: "ollama/gemma4:e2b:caption:v1" });
    expect(runFlorence).not.toHaveBeenCalled();
  });

  it("uses Florence for unreadable media when fallback is on", async () => {
    const { router, runFlorence } = setup({
      ok: false,
      reason: "too_large",
    });

    await expect(
      router.run({
        saveId: "save-1",
        imageUrl: "pond://save-1/image.png",
        task: "ocr",
        prefs: {
          ...ai("gemma4"),
          mediaUnderstandingFallbackToFlorence: true,
        },
      }),
    ).resolves.toEqual({
      text: "Florence caption",
      model: "ollama/gemma4:e2b:ocr:v1",
    });
    expect(runFlorence).toHaveBeenCalledOnce();
  });

  it("stamps eligibility with the active primary model", () => {
    const { router } = setup();

    expect(router.primaryModel("ocr", ai("florence"))).toBe("florence:v2");
    expect(router.primaryModel("ocr", ai("gemma4"))).toBe(
      "ollama/gemma4:e2b:ocr:v1",
    );
  });
});
