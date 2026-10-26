import { describe, expect, it } from "vitest";
import { starredRepoUrl } from "./inject";

const PAGE = "https://github.com/vercel/next.js/tree/canary";

describe("starredRepoUrl", () => {
  it("reads the repo from a star form post", () => {
    expect(starredRepoUrl("/vercel/next.js/star", null, PAGE)).toBe(
      "https://github.com/vercel/next.js",
    );
  });

  it("ignores unstar", () => {
    expect(starredRepoUrl("/vercel/next.js/unstar", null, PAGE)).toBeNull();
  });

  it("uses the page repo for a GraphQL star", () => {
    expect(
      starredRepoUrl(
        "https://github.com/_graphql",
        '{"query":"mutation { addStar(input: {}) { clientMutationId } }"}',
        PAGE,
      ),
    ).toBe("https://github.com/vercel/next.js");
  });

  it("skips other GraphQL calls and non-repo pages", () => {
    expect(
      starredRepoUrl("https://github.com/_graphql", '{"query":"x"}', PAGE),
    ).toBeNull();
    expect(
      starredRepoUrl(
        "https://github.com/_graphql",
        '{"query":"addStar"}',
        "https://github.com/settings/profile",
      ),
    ).toBeNull();
  });
});
