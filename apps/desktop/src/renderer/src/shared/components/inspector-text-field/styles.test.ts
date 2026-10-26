import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const css = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "styles.module.css"),
  "utf8",
);

it("grows multiline inspector fields with their content without manual resize", () => {
  expect(css).toContain("field-sizing: content;");
  expect(css).toContain("resize: none;");
});
