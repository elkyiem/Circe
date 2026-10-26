import { describe, expect, it } from "vitest";
import { captureFromItem, itemEntry, parseItems } from "./normalize";

const USER = {
  _id: "63a5a71af85a8c84e82abb4c",
  name: "Pierre Odendaal",
  url: "https://savee.com/podendaal/",
  username: "podendaal",
  avatarURL:
    "https://dm.savee-cdn.com/user-avatar/original/63a5a71af85a8c84e82abb4c-347727.avif",
};

const IMAGE = {
  _id: "6adf26bf3c9caf4477b549fe",
  shortID: "h4W8146",
  url: "https://savee.com/i/h4W8146/",
  createdAt: "2026-10-26T10:09:03.888Z",
  name: "De4Sw6NjBpF 11",
  pageURL: "https://www.instagram.com/p/De4Sw6NjBpF/?img_index=11",
  sourceDisplayURL: "instagram.com",
  isPrivate: false,
  user: USER,
  asset: {
    _id: "6adf1a9c3c9caf447726b9da",
    image: {
      thumbnail:
        "https://dm.savee-cdn.com/asset-image/w420/6adf1a9c3c9caf447726b9da.avif",
      preview: null,
      original:
        "https://dm.savee-cdn.com/asset-image/original/6adf1a9c3c9caf447726b9da.avif",
      ratio: 1.3277777777777777,
      width: 1080,
      height: 1434,
    },
    type: "image",
  },
};

const VIDEO = {
  _id: "6adda8b53c9caf4463e37296",
  shortID: "lZN8UIZ",
  url: "https://savee.com/i/lZN8UIZ/",
  createdAt: "2026-10-25T06:58:43.534Z",
  name: "RODEO 9",
  pageURL: "",
  sourceDisplayURL: null,
  user: USER,
  asset: {
    _id: "6adda8a83c9caf4463e30ea7",
    image: {
      thumbnail:
        "https://dm.savee-cdn.com/asset-video/w420/6adda8a83c9caf4463e30ea7.avif",
      preview:
        "https://dm.savee-cdn.com/asset-video/w640/6adda8a83c9caf4463e30ea7.mp4",
      original:
        "https://dm.savee-cdn.com/asset-video/original/6adda8a83c9caf4463e30ea7.mp4",
      ratio: 1.25,
      width: 864,
      height: 1080,
    },
    type: "video",
  },
};

describe("savee normalize", () => {
  it("drops rows without a short id", () => {
    expect(parseItems([IMAGE, { name: "orphan" }, VIDEO])).toHaveLength(2);
  });

  it("turns an image save into an entry with its save time", () => {
    const [item] = parseItems([IMAGE]);
    expect(item && itemEntry(item)).toEqual({
      sourceId: "h4W8146",
      url: "https://savee.com/i/h4W8146/",
      savedAt: "2026-10-26T10:09:03.888Z",
      title: "De4Sw6NjBpF 11",
      mediaUrl:
        "https://dm.savee-cdn.com/asset-image/original/6adf1a9c3c9caf447726b9da.avif",
      mediaUrls: [
        {
          url: "https://dm.savee-cdn.com/asset-image/original/6adf1a9c3c9caf447726b9da.avif",
          type: "image",
        },
      ],
      mediaType: "image",
    });
  });

  it("keeps the video original and its thumbnail as the poster", () => {
    const [item] = parseItems([VIDEO]);
    const entry = item && itemEntry(item);
    expect(entry?.mediaType).toBe("video");
    expect(entry?.mediaUrls).toEqual([
      {
        url: "https://dm.savee-cdn.com/asset-video/original/6adda8a83c9caf4463e30ea7.mp4",
        type: "video",
        poster:
          "https://dm.savee-cdn.com/asset-video/w420/6adda8a83c9caf4463e30ea7.avif",
      },
    ]);
  });

  it("builds a capture with the saver and the original page", () => {
    const [item] = parseItems([IMAGE]);
    const capture = item && captureFromItem(item);
    expect(capture?.author).toEqual({
      name: "Pierre Odendaal",
      handle: "podendaal",
      profileUrl: "https://savee.com/podendaal/",
      avatarUrl: USER.avatarURL,
    });
    expect(capture?.upstream?.host).toBe("www.instagram.com");
    expect(capture?.media[0]).toMatchObject({ width: 1080, height: 1434 });
  });

  it("leaves upstream unset when the item has no source page", () => {
    const [item] = parseItems([VIDEO]);
    expect(item && captureFromItem(item).upstream).toBeUndefined();
  });
});
