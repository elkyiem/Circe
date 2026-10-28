import { describe, expect, it } from "vitest";
import {
  clipEmbeddingVersion,
  EMBEDDING_TOKEN_MAX_LENGTH,
  EMBEDDING_TOKENIZER_OPTIONS,
  embeddingClassificationLabel,
  embeddingClusterText,
  embeddingCodeQuery,
  embeddingDimensions,
  embeddingDocument,
  embeddingFactClaim,
  embeddingSearchQuery,
  embeddingSimilarityText,
  mediaEmbeddingVersion,
  normalizedEmbeddingVector,
  textEmbeddingVersion,
  tokenizeEmbeddingTexts,
} from "./embeddings";
import { EMBEDDING_MODEL } from "./on-device-models";

describe("EmbeddingGemma 2 input contracts", () => {
  it("formats asymmetric search inputs", () => {
    expect(embeddingSearchQuery("  black   cats  ")).toBe(
      "task: search result | query: black cats",
    );
    expect(embeddingDocument("  A title ", " Body   copy ")).toBe(
      "title: A title | text: Body copy",
    );
    expect(embeddingDocument(null, "Body")).toBe("title: none | text: Body");
  });

  it("formats classification labels", () => {
    expect(embeddingClassificationLabel("  screen shot ")).toBe(
      "task: classification | query: screen shot",
    );
    expect(embeddingSimilarityText("  black   cats ")).toBe(
      "task: sentence similarity | query: black cats",
    );
  });

  it("formats discovery tasks", () => {
    expect(embeddingCodeQuery("  parse   a URL ")).toBe(
      "task: code retrieval | query: parse a URL",
    );
    expect(embeddingFactClaim(" The file was  edited yesterday ")).toBe(
      "task: fact checking | query: The file was edited yesterday",
    );
    expect(embeddingClusterText("  Design   systems ")).toBe(
      "task: clustering | query: Design systems",
    );
  });

  it("identifies persisted vectors by task, dimension, and preprocessing", () => {
    expect(embeddingDimensions()).toBe(768);
    expect(textEmbeddingVersion()).toContain(":document:768:");
    expect(mediaEmbeddingVersion()).toContain(":media:768:");
    expect(mediaEmbeddingVersion()).toContain(
      "audio-mono16k-30s+video-1fps-32f-32s+normalized-mean-v1",
    );
    expect(clipEmbeddingVersion()).toBe(mediaEmbeddingVersion());
  });

  it("versions text and image preprocessing independently", () => {
    expect(textEmbeddingVersion()).not.toBe(clipEmbeddingVersion());
    expect(textEmbeddingVersion()).toContain(EMBEDDING_MODEL.revision);
    expect(clipEmbeddingVersion()).toContain(EMBEDDING_MODEL.revision);
  });

  it("passes an explicit Gemma context length so truncation can apply", () => {
    let options: unknown;
    tokenizeEmbeddingTexts(
      (texts, tokenizerOptions) => {
        options = tokenizerOptions;
        return texts;
      },
      ["long query"],
    );
    expect(options).toEqual({
      padding: true,
      truncation: true,
      max_length: EMBEDDING_TOKEN_MAX_LENGTH,
    });
    expect(EMBEDDING_TOKENIZER_OPTIONS.max_length).toBe(2048);
  });

  it("accepts only finite, non-zero 768-dimensional model output", () => {
    const normalized = normalizedEmbeddingVector(
      Float32Array.from({ length: 768 }, (_, index) => (index === 0 ? 3 : 0)),
    );
    expect(normalized).toHaveLength(768);
    expect(normalized[0]).toBe(1);

    expect(() => normalizedEmbeddingVector([1, 0])).toThrow(
      "expected 768 dimensions",
    );
    expect(() => normalizedEmbeddingVector(new Float32Array(768))).toThrow(
      "zero magnitude",
    );
    const invalid = new Float32Array(768);
    invalid[0] = Number.NaN;
    expect(() => normalizedEmbeddingVector(invalid)).toThrow(
      "non-finite value",
    );
  });
});
