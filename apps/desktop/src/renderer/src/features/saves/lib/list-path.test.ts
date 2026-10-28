import { describe, expect, it } from "vitest";
import {
  getLastListPath,
  getLastListSearch,
  isSaveCollectionPath,
  listPathForLocation,
  rememberListPath,
} from "./list-path";

describe("list-path", () => {
  it("remembers library list surfaces and ignores save/other sections", () => {
    rememberListPath("/trash");
    expect(getLastListPath()).toBe("/trash");

    rememberListPath("/save/abc");
    expect(getLastListPath()).toBe("/trash");

    rememberListPath("/sources");
    expect(getLastListPath()).toBe("/trash");

    rememberListPath("/downloads");
    expect(getLastListPath()).toBe("/downloads");

    rememberListPath("/");
    expect(getLastListPath()).toBe("/");
  });

  it("returns to the canvas a save was opened from", () => {
    rememberListPath("/canvas/board");
    expect(getLastListPath()).toBe("/canvas/board");
    expect(listPathForLocation("/save/xyz")).toBe("/canvas/board");
  });

  it("resolves list mode path while a save is open", () => {
    rememberListPath("/trash");
    expect(listPathForLocation("/save/xyz")).toBe("/trash");
    expect(listPathForLocation("/trash")).toBe("/trash");
  });

  it("treats library modes as save-collection surfaces", () => {
    expect(isSaveCollectionPath("/")).toBe(true);
    expect(isSaveCollectionPath("/untagged")).toBe(true);
    expect(isSaveCollectionPath("/recents")).toBe(true);
    expect(isSaveCollectionPath("/trash")).toBe(true);
    expect(isSaveCollectionPath("/save/demo")).toBe(false);
    expect(isSaveCollectionPath("/settings")).toBe(false);
    expect(isSaveCollectionPath("/sources")).toBe(false);
    expect(isSaveCollectionPath("/fish/default")).toBe(false);
  });

  it("remembers list search with the path", () => {
    rememberListPath("/", "?q=pond");
    expect(getLastListPath()).toBe("/");
    expect(getLastListSearch()).toBe("?q=pond");

    rememberListPath("/save/abc", "");
    expect(getLastListSearch()).toBe("?q=pond");
  });
});
