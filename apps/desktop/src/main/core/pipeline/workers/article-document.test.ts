import type { Capture } from "@pond/schema/raw";
import { describe, expect, it } from "vitest";
import { splitArticle } from "./article-document";

const POST_URL = "https://lenny.substack.com/p/how-to-price";

function capture(html: string, preview?: boolean): Capture {
  return {
    id: "lenny.substack.com/p/how-to-price",
    source: "substack",
    url: "https://substack.com/home/post/p-1",
    title: 'How to "price"',
    author: { name: "Lenny", avatarUrl: "https://substackcdn.com/lenny.jpg" },
    publishedAt: "2026-10-01T12:00:00.000Z",
    media: [{ url: "https://substackcdn.com/cover.jpg", type: "image" }],
    extras: { publisher: "Lenny's Newsletter" },
    article: { html, subtitle: "A guide", canonicalUrl: POST_URL, preview },
  };
}

function documentOf(input: Capture): string {
  return splitArticle(input).files.newFiles?.[0]?.bytes?.toString("utf8") ?? "";
}

describe("splitArticle", () => {
  it("moves the body into an article file and off the capture", () => {
    const { capture: rest, files } = splitArticle(capture("<p>Body</p>"));

    expect(rest).not.toHaveProperty("article");
    expect(rest.title).toBe('How to "price"');
    expect(files).toMatchObject({
      replaceFilesWithKind: "article",
      newFiles: [
        { kind: "article", filename: "article.html", mimeType: "text/html" },
      ],
    });
  });

  it("writes the header as pond meta tags around the body", () => {
    const html = documentOf(capture("<p>Body</p>"));

    expect(html).toContain("<p>Body</p>");
    expect(html).toContain(
      '<meta name="pond:title" content="How to &quot;price&quot;">',
    );
    expect(html).toContain('<meta name="pond:subtitle" content="A guide">');
    expect(html).toContain('<meta name="pond:author" content="Lenny">');
    expect(html).toContain(
      `<meta name="pond:publication" content="Lenny's Newsletter">`,
    );
    expect(html).toContain(`<meta name="pond:url" content="${POST_URL}">`);
    expect(html).toContain(
      '<meta name="pond:cover" content="https://substackcdn.com/cover.jpg">',
    );
    expect(html).not.toContain("pond:preview");
  });

  it("flags a paywall preview", () => {
    const html = documentOf(capture("<p>Teaser</p>", true));
    expect(html).toContain('<meta name="pond:preview" content="true">');
  });

  it("writes nothing when the capture has no article", () => {
    const { article: _, ...plain } = capture("");
    expect(splitArticle(plain)).toEqual({ capture: plain, files: {} });
  });
});
