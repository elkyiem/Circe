import { expect, it } from "vitest";
import { z } from "zod";
import { pondOperations } from "./index";

it("describes the production catalog without loading credentials or executing operations", () => {
  const operations = pondOperations();
  expect(new Set(operations.map((entry) => entry.name)).size).toBe(
    operations.length,
  );
  for (const operation of operations) {
    expect(
      () =>
        z.toJSONSchema(operation.inputSchema, {
          io: "input",
          unrepresentable: "any",
        }),
      operation.name,
    ).not.toThrow();
  }
  for (const name of [
    "conversion.start",
    "settings.setPrefs",
    "saves.bulkEdit",
    "sync.runNow",
    "pipeline.setPaused",
    "sources.connect",
    "navigation.library.open",
    "history.undo",
    "agent.send",
  ]) {
    expect(
      operations.some((entry) => entry.name === name),
      name,
    ).toBe(true);
  }
  for (const name of [
    "settings.ingestToken",
    "agent.saveKey",
    "agent.review",
    "agent.deleteChat",
    "library.switchTo",
    "reset.factory",
    "fishMcp.list",
    "fishMcp.save",
    "fishMcp.remove",
    "fishMcp.test",
    "fishMcp.setToolAccess",
  ]) {
    expect(
      operations.some((entry) => entry.name === name),
      name,
    ).toBe(false);
  }
});
