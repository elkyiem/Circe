import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Load the dependency graph during test setup, as static imports normally do.
// Each case still resets modules and reloads the store against fresh storage.
import "./view-store";

describe("filter persistence", () => {
  beforeEach(() => {
    vi.resetModules();
    const memory = new Map<string, string>();
    const localStorage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
    };
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("window", { localStorage });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("restores ad-hoc filters after a reload", async () => {
    const first = await import("./view-store");
    first.updateLocalFilters([
      { field: "type", operator: "eq", value: "video" },
    ]);
    first.setSemanticQuery("a black cat");

    vi.resetModules();
    const second = await import("./view-store");
    const state = second.getViewState();
    expect(state.rows).toEqual([
      { field: "type", operator: "eq", value: "video" },
    ]);
    expect(state.query.rules).toEqual([
      { field: "type", operator: "eq", value: "video" },
    ]);
    expect(state.semanticQuery).toBe("a black cat");
  });

  it("does not carry a saved view's rules into the next session", async () => {
    const first = await import("./view-store");
    first.applySavedView({
      id: "view-1",
      query: {
        combinator: "and",
        rules: [{ field: "rating", operator: "gte", value: 4 }],
      },
    });

    vi.resetModules();
    const second = await import("./view-store");
    expect(second.getViewState().rows).toEqual([]);
  });

  it("ignores stored filters that no longer parse", async () => {
    localStorage.setItem("pond.filterRules", '{"rows":[{"field":"nope"}]}');
    const { getViewState } = await import("./view-store");
    expect(getViewState().rows).toEqual([]);
  });
});
