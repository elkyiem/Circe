import { describe, expect, it } from "vitest";
import { isAllowedOrigin } from "./server";

describe("local API origin allow-list", () => {
  it("allows browser extension origins", () => {
    for (const origin of [
      "chrome-extension://ihciihlcdkopghlpabpmnodncfdboplb",
      "moz-extension://6e4b8d0a-1111-4c2f-9a5f-1234567890ab",
      "safari-web-extension://AB12CD34-5678-90EF-1234-567890ABCDEF",
    ]) {
      expect(isAllowedOrigin(origin, [])).toBe(true);
    }
  });

  it("rejects any localhost page unless it is named explicitly", () => {
    for (const origin of [
      "http://localhost:3000",
      "http://127.0.0.1:8080",
      "https://localhost",
    ]) {
      expect(isAllowedOrigin(origin, [])).toBe(false);
    }
  });

  it("allows an origin the user named", () => {
    expect(
      isAllowedOrigin("http://localhost:3000", ["http://localhost:3000"]),
    ).toBe(true);
  });

  it("supports a trailing wildcard in a named origin", () => {
    expect(
      isAllowedOrigin("https://app.example.com/", ["https://app.example.com*"]),
    ).toBe(true);
    expect(
      isAllowedOrigin("https://other.example.com", [
        "https://app.example.com*",
      ]),
    ).toBe(false);
  });

  it("rejects missing and null origins", () => {
    expect(isAllowedOrigin(undefined, [])).toBe(false);
    expect(isAllowedOrigin("null", [])).toBe(false);
    expect(isAllowedOrigin("", [])).toBe(false);
  });
});
