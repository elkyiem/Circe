import { describe, expect, it } from "vitest";
import { joinMessages, plainPreview, splitMessages } from "./assistant-text";

it("splits a reply into its separate messages in order", () => {
  expect(
    splitMessages("Hey!\n[[next]]\nSecond one.\n[[next]]\nThird."),
  ).toEqual(["Hey!", "Second one.", "Third."]);
});

it("keeps a reply without breaks, including a numbered list, as one message", () => {
  const numbered = "1. First\n2. Second\n3. Third";
  expect(splitMessages(numbered)).toEqual([numbered]);
});

it("ignores empty messages and breaks inside code blocks", () => {
  expect(splitMessages("[[next]]\nOne\n[[next]]\n\n[[next]]\nTwo")).toEqual([
    "One",
    "Two",
  ]);
  const code = "```\n[[next]]\n```";
  expect(splitMessages(code)).toEqual([code]);
});

it("hides a break that is still revealing", () => {
  expect(splitMessages("One\n[[ne")).toEqual(["One"]);
});

it("round-trips messages through the text a model reads", () => {
  const messages = ["One", "Two", "Three"];
  expect(splitMessages(joinMessages(messages))).toEqual(messages);
});

describe("plainPreview", () => {
  it("reads markdown as one plain line", () => {
    expect(
      plainPreview(
        "## Done\n\nTagged **3** posters, see [Dune](#save-1).\n\n```js\nx\n```\n- next",
      ),
    ).toBe("Done Tagged 3 posters, see Dune. next");
  });

  it("reads separate messages as one line", () => {
    expect(plainPreview("Hey!\n[[next]]\nSecond one.")).toBe(
      "Hey! Second one.",
    );
  });

  it("clips long replies", () => {
    const preview = plainPreview("word ".repeat(80));
    expect(preview.length).toBeLessThanOrEqual(140);
    expect(preview.endsWith("…")).toBe(true);
  });
});
