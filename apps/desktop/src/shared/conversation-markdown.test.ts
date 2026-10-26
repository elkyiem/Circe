import { expect, it } from "vitest";
import { conversationMarkdown } from "./conversation-markdown";

it("exports visible conversation in order and preserves Markdown", () => {
  expect(
    conversationMarkdown("Typography\nnotes", [
      { role: "system", content: "Private instructions" },
      { role: "user", content: "Explain **kerning**" },
      { role: "assistant", content: "Adjust spacing.\n\n- Between letters" },
      { role: "tool", content: "Internal result" },
    ]),
  ).toBe(
    "# Typography notes\n\n## You\n\nExplain **kerning**\n\n## Fish\n\nAdjust spacing.\n\n- Between letters\n\n",
  );
});

it("names untitled conversations without inventing messages", () => {
  expect(conversationMarkdown(null, [])).toBe("# New Chat\n\n");
});
