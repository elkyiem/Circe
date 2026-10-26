import { describe, expect, it } from "vitest";
import { isUnreachable, unreachableFromMessage } from "./native";

describe("unreachableFromMessage", () => {
  it.each([
    [
      "Access to the specified native messaging host is forbidden.",
      "host_forbidden",
    ],
    [
      "This extension does not have permission to use native application so.pond.host (or the application is not installed)",
      "host_forbidden",
    ],
    ["Specified native messaging host not found.", "host_missing"],
    ["No such native application so.pond.host", "host_missing"],
    ["Native host has exited.", "host_failed"],
    ["Error when communicating with the native messaging host.", "host_failed"],
    ["Failed to start native messaging host.", "host_failed"],
    ["Something else", "offline"],
  ])("maps %s", (message, expected) => {
    expect(unreachableFromMessage(message)).toBe(expected);
  });

  it("recognizes every unreachable code and nothing else", () => {
    expect(isUnreachable("host_forbidden")).toBe(true);
    expect(isUnreachable("offline")).toBe(true);
    expect(isUnreachable("unsupported_url")).toBe(false);
  });
});
