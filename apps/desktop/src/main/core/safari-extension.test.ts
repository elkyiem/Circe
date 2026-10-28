import { describe, expect, it } from "vitest";
import { parsePluginkit } from "./safari-extension";

/**
 * Verbatim shape from macOS 27: one tab-separated line per plug-in, marker column first,
 * path last, then a trailing count line.
 */
const TABBED = `     so.pond.desktop.Extension(1.0)\t4DF645BD-2409-472F-B617-55E9ECF69E48\t2026-10-27 05:26:11 +0000\t/Applications/Pond.app/Contents/PlugIns/Pond Extension.appex
  (1 plug-in)`;

const TABBED_ENABLED = TABBED.replace("     so.pond", "+    so.pond");

/** Older builds print the properties on their own indented lines. */
const MULTILINE = `+    so.pond.desktop.Extension(1.0)
               Path = /Applications/Pond.app/Contents/PlugIns/Pond Extension.appex
        Parent Bundle = /Applications/Pond.app`;

describe("parsePluginkit", () => {
  it("reads the tab-separated form macOS prints", () => {
    expect(parsePluginkit(TABBED)).toEqual([
      {
        id: "so.pond.desktop.Extension",
        enabled: false,
        path: "/Applications/Pond.app/Contents/PlugIns/Pond Extension.appex",
      },
    ]);
  });

  it("treats a leading + as enabled", () => {
    const [entry] = parsePluginkit(TABBED_ENABLED);
    expect(entry?.enabled).toBe(true);
    expect(entry?.id).toBe("so.pond.desktop.Extension");
  });

  it("ignores the plug-in count trailer", () => {
    expect(parsePluginkit(TABBED)).toHaveLength(1);
  });

  it("reads the indented property form too", () => {
    const [entry] = parsePluginkit(MULTILINE);
    expect(entry?.enabled).toBe(true);
    expect(entry?.path).toBe(
      "/Applications/Pond.app/Contents/PlugIns/Pond Extension.appex",
    );
  });

  it("returns nothing for empty output", () => {
    expect(parsePluginkit("")).toEqual([]);
  });

  it("keeps several extensions apart", () => {
    const both = `${TABBED_ENABLED}\n${TABBED.replace("so.pond.desktop.Extension", "com.example.Other")}`;
    const parsed = parsePluginkit(both);
    expect(parsed.map((entry) => entry.id)).toEqual([
      "so.pond.desktop.Extension",
      "com.example.Other",
    ]);
    expect(parsed.map((entry) => entry.enabled)).toEqual([true, false]);
  });
});
