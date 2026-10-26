// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { readArticle } from "./sanitize";

const CDN =
  "https://substackcdn.com/image/fetch/w_1456/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fphoto.png";

function document(body: string, meta = ""): string {
  return `<!doctype html><html><head>${meta}</head><body>${body}</body></html>`;
}

describe("readArticle", () => {
  it("reads the header from pond meta tags", () => {
    const { meta } = readArticle(
      document(
        "<p>Body</p>",
        [
          '<meta name="pond:title" content="How to price">',
          '<meta name="pond:author" content="Lenny">',
          '<meta name="pond:author-photo" content="javascript:alert(1)">',
          '<meta name="pond:url" content="https://lenny.substack.com/p/x">',
          '<meta name="pond:preview" content="true">',
        ].join(""),
      ),
    );
    expect(meta).toMatchObject({
      title: "How to price",
      author: "Lenny",
      url: "https://lenny.substack.com/p/x",
      preview: true,
    });
    expect(meta.authorPhoto).toBeUndefined();
  });

  it("strips scripts, handlers, inline styles, and Substack widgets", () => {
    const { html } = readArticle(
      document(
        [
          '<p style="color:red" onclick="steal()">Kept <strong>text</strong></p>',
          "<script>steal()</script>",
          '<img src="https://substackcdn.com/a.png" onerror="steal()">',
          '<div class="subscription-widget-wrap"><form><input></form></div>',
          '<p class="button-wrapper"><a class="button primary" href="https://x.substack.com/subscribe">Subscribe now</a></p>',
          '<div class="youtube-wrap" data-attrs="{&quot;videoId&quot;:&quot;abc&quot;}"><iframe src="https://www.youtube.com/embed/abc"></iframe></div>',
          '<a href="javascript:steal()">Bad link</a>',
        ].join(""),
      ),
    );
    expect(html).not.toMatch(/script|onclick|onerror|style=|iframe|Subscribe/);
    expect(html).toContain("<p>Kept <strong>text</strong></p>");
    expect(html).toContain('<img src="https://substackcdn.com/a.png">');
    expect(html).toContain(
      '<a href="https://www.youtube.com/watch?v=abc">Watch on YouTube</a>',
    );
    expect(html).toContain("<a>Bad link</a>");
  });

  it("keeps figures, captions, links, and footnotes", () => {
    const { html, meta } = readArticle(
      document(
        [
          '<div class="captioned-image-container"><figure><a class="image-link" href="https://substackcdn.com/full.png">',
          `<div class="image2-inset"><picture><source type="image/webp" srcset="https://substackcdn.com/s.webp 424w"><img src="${CDN}" alt="A chart" width="941"></picture>`,
          '<div class="image-link-expand"><button>Expand</button></div></div></a>',
          '<figcaption class="image-caption">The chart</figcaption></figure></div>',
          '<p>See <a href="https://example.com/a">this</a>.<a class="footnote-anchor" id="footnote-anchor-1" href="#footnote-1" target="_self">1</a></p>',
          '<div class="footnote"><a id="footnote-1" href="#footnote-anchor-1" class="footnote-number">1</a><div class="footnote-content"><p>A note.</p></div></div>',
        ].join(""),
        '<meta name="pond:cover" content="https://substack-post-media.s3.amazonaws.com/public/images/photo.png">',
      ),
    );
    expect(html).toContain(
      `<figure><div><img src="${CDN}" alt="A chart" width="941"></div><figcaption>The chart</figcaption></figure>`,
    );
    expect(html).toContain('<a href="https://example.com/a">this</a>');
    expect(html).toContain(
      '<a id="article-footnote-anchor-1" href="#article-footnote-1">1</a>',
    );
    expect(html).toContain('<div data-footnote="">');
    expect(html).not.toMatch(/class=|Expand|<picture|<source/);
    expect(meta.cover).toBeUndefined();
  });

  it("counts the body's words", () => {
    expect(readArticle(document("<p>One two</p><p>three</p>")).words).toBe(3);
  });
});
