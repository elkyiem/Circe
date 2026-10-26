import { describe, expect, it } from "vitest";
import { substackAction } from "./inject";

const PAGE = "https://lenny.substack.com/p/how-to-price";

describe("substackAction", () => {
  it("reads the post id from a save", () => {
    expect(
      substackAction(
        "POST",
        "/api/v1/posts/saved",
        '{"post_id":151234567}',
        PAGE,
      ),
    ).toEqual({
      url: "https://substack.com/home/post/p-151234567",
      trigger: "substack:save",
    });
  });

  it("reads the post id from a like", () => {
    expect(
      substackAction(
        "POST",
        "https://substack.com/api/v1/post/151234567/reaction",
        '{"reaction":"❤"}',
        PAGE,
      ),
    ).toEqual({
      url: "https://substack.com/home/post/p-151234567",
      trigger: "substack:like",
    });
  });

  it("uses the publication address for the post the page shows", () => {
    const page = {
      id: "151234567",
      url: "https://lenny.substack.com/p/how-to-price",
    };
    expect(
      substackAction(
        "POST",
        "/api/v1/post/151234567/reaction",
        null,
        PAGE,
        page,
      )?.url,
    ).toBe("https://lenny.substack.com/p/how-to-price");
    expect(
      substackAction("POST", "/api/v1/post/999/reaction", null, PAGE, page)
        ?.url,
    ).toBe("https://substack.com/home/post/p-999");
  });

  it("ignores unsave, unlike, and other calls", () => {
    expect(
      substackAction("DELETE", "/api/v1/posts/saved", '{"post_id":1}', PAGE),
    ).toBeNull();
    expect(
      substackAction("DELETE", "/api/v1/post/1/reaction", null, PAGE),
    ).toBeNull();
    expect(
      substackAction("POST", "/api/v1/posts/saved", "{}", PAGE),
    ).toBeNull();
    expect(substackAction("POST", "/api/v1/seen", null, PAGE)).toBeNull();
  });
});
