export function conversationMarkdown(
  title: string | null,
  messages: readonly { role: string; content: string }[],
): string {
  const heading = (title || "New Chat").replace(/[\r\n]+/g, " ");
  return [
    `# ${heading}`,
    ...messages
      .filter(
        (message) => message.role === "user" || message.role === "assistant",
      )
      .map(
        (message) =>
          `## ${message.role === "user" ? "You" : "Fish"}\n\n${message.content}`,
      ),
    "",
  ].join("\n\n");
}
