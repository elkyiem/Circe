import { describe, expect, it } from "vitest";
import { errorItems, saveItems } from "./items";

const save = {
  id: "01J",
  url: "https://x.com/a",
  title: "Poster",
  siteName: "X",
  source: "twitter",
  tags: ["type", "red"],
};

describe("saveItems", () => {
  it("opens the URL and offers Pond and copy modifiers", () => {
    expect(saveItems([save])).toEqual([
      {
        uid: "01J",
        title: "Poster",
        subtitle: "X · type, red",
        arg: "https://x.com/a",
        quicklookurl: "https://x.com/a",
        mods: {
          cmd: { arg: "pond://item/01J", subtitle: "Open in Pond" },
          alt: { arg: "https://x.com/a", subtitle: "Copy Link" },
        },
      },
    ]);
  });

  it("opens files in Pond when there is no web URL", () => {
    const [item] = saveItems([
      { ...save, url: "pond:local/01J", title: null, siteName: null },
    ]);
    expect(item?.arg).toBe("pond://item/01J");
    expect(item?.title).toBe("Untitled");
    expect(item?.subtitle).toBe("twitter · type, red");
    expect(item?.quicklookurl).toBeUndefined();
    expect(item?.mods?.alt).toBeUndefined();
  });
});

describe("errorItems", () => {
  it("offers to open Pond when it isn't running", () => {
    expect(errorItems("offline")[0]).toMatchObject({
      title: "Pond isn't running",
      arg: "pond://library",
    });
  });

  it("points to Local API settings on a bad token", () => {
    expect(errorItems("unauthorized")[0]).toMatchObject({
      title: "Pond didn't accept the token",
      arg: "pond://settings/local-api",
    });
  });
});
