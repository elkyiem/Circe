import { describe, expect, it } from "vitest";
import { youtubeParser } from "./youtube";

const NEW =
  "Video ID,Playlist Video Creation Timestamp\nabcDEF12345,2024-05-01T10:00:00+00:00\n";
const OLD =
  "Playlist ID,Channel ID,Title\nPL1,UC1,Refs\n\nVideo ID,Time Added\nxyz98765432,2021-01-02 03:04:05 UTC\n";

describe("youtubeParser", () => {
  it("matches playlist CSVs inside Takeout", () => {
    expect(
      youtubeParser.matches(
        "Takeout/YouTube and YouTube Music/playlists/Refs-videos.csv",
      ),
    ).toBe(true);
    expect(
      youtubeParser.matches(
        "Takeout/YouTube and YouTube Music/history/watch-history.json",
      ),
    ).toBe(false);
  });

  it("reads each playlist into its own folder", () => {
    expect(
      youtubeParser.parse(
        "Takeout/YouTube and YouTube Music/playlists/Type Refs-videos.csv",
        NEW,
      ),
    ).toEqual([
      {
        url: "https://www.youtube.com/watch?v=abcDEF12345",
        listKind: "saved",
        savedAt: new Date("2024-05-01T10:00:00Z"),
        folder: "Type Refs",
      },
    ]);
    expect(
      youtubeParser.parse(
        "Takeout/YouTube and YouTube Music/playlists/Refs.csv",
        OLD,
      ),
    ).toEqual([
      {
        url: "https://www.youtube.com/watch?v=xyz98765432",
        listKind: "saved",
        savedAt: new Date("2021-01-02T03:04:05Z"),
        folder: "Refs",
      },
    ]);
  });

  it("reads Liked videos as likes with no folder, and skips the playlist index", () => {
    expect(
      youtubeParser.parse("Takeout/playlists/Liked videos-videos.csv", NEW)[0],
    ).toEqual({
      url: "https://www.youtube.com/watch?v=abcDEF12345",
      listKind: "liked",
      savedAt: new Date("2024-05-01T10:00:00Z"),
    });
    expect(
      youtubeParser.parse(
        "Takeout/playlists/playlists.csv",
        "Playlist ID,Title\nPL1,Refs\n",
      ),
    ).toEqual([]);
  });
});
