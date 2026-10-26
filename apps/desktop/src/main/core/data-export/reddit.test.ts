import { describe, expect, it } from "vitest";
import { redditParser } from "./reddit";

describe("redditParser", () => {
  it("reads saved posts and upvotes, skipping downvotes", () => {
    expect(
      redditParser.parse(
        "saved_posts.csv",
        "id,permalink\nabc12,https://www.reddit.com/r/design/comments/abc12/a_post/\n",
      ),
    ).toEqual([
      {
        url: "https://www.reddit.com/r/design/comments/abc12/a_post/",
        listKind: "saved",
        savedAt: null,
      },
    ]);
    expect(
      redditParser.parse(
        "post_votes.csv",
        "id,permalink,direction\nd1,/r/x/comments/d1/up/,up\nd2,/r/x/comments/d2/down/,down\n",
      ),
    ).toEqual([
      {
        url: "https://www.reddit.com/r/x/comments/d1/up/",
        listKind: "liked",
        savedAt: null,
      },
    ]);
  });

  it("matches saved posts and votes, ignoring saved comments", () => {
    expect(redditParser.matches("export/saved_posts.csv")).toBe(true);
    expect(redditParser.matches("post_votes.csv")).toBe(true);
    expect(redditParser.matches("saved_comments.csv")).toBe(false);
  });
});
