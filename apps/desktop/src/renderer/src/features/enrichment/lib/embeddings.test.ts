import { describe, expect, it } from "vitest";
import {
  SAVE_EMBEDDING_CHAR_LIMIT,
  saveEmbeddingBody,
  saveEmbeddingText,
} from "./embeddings";

describe("save embedding text", () => {
  it("caps caption, OCR, and transcript the same way as the body", () => {
    const ocrText = "word ".repeat(SAVE_EMBEDDING_CHAR_LIMIT);
    const save = {
      description: "a bowl",
      notes: null,
      author: null,
      tags: ["ceramic"],
    };
    const body = saveEmbeddingBody(save);
    const text = saveEmbeddingText({ ...save, ocrText });
    const extra = text.slice(body.length + " \u2014 ".length);
    expect(body.length).toBeLessThanOrEqual(SAVE_EMBEDDING_CHAR_LIMIT);
    expect(extra.length).toBe(SAVE_EMBEDDING_CHAR_LIMIT);
    expect(extra.length).toBeLessThan(ocrText.length);
  });
});
