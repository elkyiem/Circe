import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const css = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "styles.module.css"),
  "utf8",
);

it("keeps portaled popups clickable when an ancestor disables pointer events", () => {
  const start = css.indexOf(".positioner {");
  expect(start).toBeGreaterThanOrEqual(0);
  const block = css.slice(start, css.indexOf("}", start));
  expect(block).toContain("pointer-events: auto;");
});
