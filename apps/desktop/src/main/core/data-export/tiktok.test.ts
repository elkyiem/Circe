import { describe, expect, it } from "vitest";
import { tiktokParser } from "./tiktok";

const DATA = JSON.stringify({
  Activity: {
    "Favorite Videos": {
      FavoriteVideoList: [
        {
          Date: "2024-03-01 18:22:10",
          Link: "https://www.tiktokv.com/share/video/7341234567890123456/",
        },
      ],
    },
    "Like List": {
      ItemFavoriteList: [
        {
          date: "2024-02-01 08:00:00",
          link: "https://www.tiktokv.com/share/video/7330000000000000000/",
        },
      ],
    },
    "Video Browsing History": {
      VideoList: [
        {
          Date: "2024-01-01 00:00:00",
          Link: "https://www.tiktokv.com/share/video/7000000000000000000/",
        },
      ],
    },
  },
});

describe("tiktokParser", () => {
  it("matches the user data file", () => {
    expect(tiktokParser.matches("TikTok/user_data_tiktok.json")).toBe(true);
    expect(tiktokParser.matches("user_data.json")).toBe(true);
    expect(tiktokParser.matches("user_data.txt")).toBe(false);
  });

  it("reads favorites as saved and likes as liked, ignoring watch history", () => {
    expect(tiktokParser.parse("user_data_tiktok.json", DATA)).toEqual([
      {
        url: "https://www.tiktok.com/@/video/7341234567890123456",
        listKind: "saved",
        savedAt: new Date("2024-03-01T18:22:10Z"),
      },
      {
        url: "https://www.tiktok.com/@/video/7330000000000000000",
        listKind: "liked",
        savedAt: new Date("2024-02-01T08:00:00Z"),
      },
    ]);
  });
});
