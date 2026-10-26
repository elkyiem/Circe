// @vitest-environment node

import { runInContext } from "node:vm";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { adapt, buildExpression } from "./item";

const REPO_URL = "https://github.com/vercel/next.js";

function repoPage(opts: { image?: string; repoMeta?: boolean } = {}): string {
  const image =
    opts.image ??
    "https://repository-images.githubusercontent.com/70107786/4602445c";
  const repoMeta =
    opts.repoMeta === false
      ? ""
      : '<meta name="octolytics-dimension-repository_nwo" content="vercel/next.js">';
  return `<!doctype html><html><head>
<meta property="og:title" content="GitHub - vercel/next.js: The React Framework">
<meta property="og:image" content="${image}">
${repoMeta}
</head><body>
<div class="sidebarSection"><h2><span>About</span></h2>
<p class="description">The React Framework</p>
<div class="websiteRow"><a href="https://nextjs.org" target="_blank">nextjs.org</a></div>
<a href="/topics/react">react</a><a href="/topics/ssg">ssg</a>
<a href="#readme-ov-file">Readme</a>
</div>
<article class="markdown-body">
<div class="markdown-heading"><h2 class="heading-element">Getting Started</h2><a id="user-content-getting-started" class="anchor" href="#getting-started"><svg></svg></a></div>
<p>See <a href="#getting-started">the start</a> and <a href="/vercel/next.js/blob/canary/docs.md">the docs</a>.</p>
<p><img src="/vercel/next.js/raw/canary/logo.png" alt="Logo"></p>
<div class="snippet-clipboard-content"><pre><code>npx create-next-app</code></pre><div class="zeroclipboard-container"><clipboard-copy>Copy</clipboard-copy></div></div>
</article>
</body></html>`;
}

async function harvest(html: string) {
  const dom = new JSDOM(html, { url: REPO_URL, runScripts: "outside-only" });
  const raw = await runInContext(
    buildExpression("vercel/next.js"),
    dom.getInternalVMContext(),
  );
  return adapt(raw, {
    source: "github",
    url: REPO_URL,
    sourceId: "vercel/next.js",
  });
}

describe("GitHub repo page", () => {
  it("reads the name, About line, topics, homepage and owner", async () => {
    const capture = await harvest(repoPage());

    expect(capture?.title).toBe("vercel/next.js");
    expect(capture?.description).toContain("The React Framework");
    expect(capture?.description).toContain("Topics: react, ssg");
    expect(capture?.extras?.externalLink).toBe("https://nextjs.org/");
    expect(capture?.author).toMatchObject({
      handle: "vercel",
      profileUrl: "https://github.com/vercel",
      avatarUrl: "https://github.com/vercel.png",
    });
  });

  it("keeps the README as an article with page links resolved", async () => {
    const html = (await harvest(repoPage()))?.article?.html ?? "";

    expect(html).toContain(
      '<h2 class="heading-element" id="user-content-getting-started">',
    );
    expect(html).toContain('href="#user-content-getting-started"');
    expect(html).toContain(
      'href="https://github.com/vercel/next.js/blob/canary/docs.md"',
    );
    expect(html).toContain(
      'src="https://github.com/vercel/next.js/raw/canary/logo.png"',
    );
    expect(html).not.toContain('class="anchor"');
    expect(html).not.toContain("clipboard-copy");
  });

  it("keeps a custom social preview and skips GitHub's generated card", async () => {
    const custom = await harvest(repoPage());
    expect(custom?.media).toEqual([
      {
        url: "https://repository-images.githubusercontent.com/70107786/4602445c",
        type: "image",
      },
    ]);

    const generated = await harvest(
      repoPage({
        image: "https://opengraph.githubassets.com/1/vercel/next.js",
      }),
    );
    expect(generated?.media).toEqual([]);
  });

  it("returns nothing for a page without the repo meta", async () => {
    expect(await harvest(repoPage({ repoMeta: false }))).toBeNull();
  });
});
