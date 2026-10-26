import { describe, expect, it } from "vitest";
import { parseCsvRows } from "./csv";

describe("parseCsvRows", () => {
  it("reads quoted cells, escaped quotes, CRLF, and a BOM", () => {
    const text =
      '\uFEFFid,permalink\r\n"a1","https://x.test/?q=""hi"""\r\n\r\nb2,/r/x\n';
    expect(parseCsvRows(text)).toEqual([
      ["id", "permalink"],
      ["a1", 'https://x.test/?q="hi"'],
      ["b2", "/r/x"],
    ]);
  });

  it("keeps commas and newlines inside quotes", () => {
    expect(parseCsvRows('a,"b,c\nd"\n')).toEqual([["a", "b,c\nd"]]);
  });
});
