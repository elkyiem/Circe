import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const css = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "styles.module.css"),
  "utf8",
);

it("lets portaled pickers receive clicks on the overlay layer", () => {
  expect(css).toContain("pointer-events: none;");
  expect(css).toContain(".layer [data-type] {");
  expect(css).toContain("pointer-events: auto;");
});
