import { expect, it } from "vitest";
import { WebQueryRequestSchema } from "./web-contracts";

it("admits authenticated browser split and Are.na operations without opening native-only controls", () => {
  for (const name of [
    "saves.split",
    "saves.splittableCount",
    "saves.splitAll",
    "saves.splitAllStatus",
    "arenaLinks.status",
    "arenaLinks.convert",
  ]) {
    expect(WebQueryRequestSchema.safeParse({ name, params: {} }).success).toBe(
      true,
    );
  }
  expect(
    WebQueryRequestSchema.safeParse({ name: "saves.openWith" }).success,
  ).toBe(false);
  expect(
    WebQueryRequestSchema.safeParse({ name: "webConnections.createCode" })
      .success,
  ).toBe(false);
});
