import { describe, expect, it, vi } from "vitest";

type MenuLike = {
  create: ReturnType<typeof vi.fn>;
  removeAll: ReturnType<typeof vi.fn>;
};

type BrowserLike = {
  contextMenus?: MenuLike;
  menus?: MenuLike;
};

/**
 * `menus-api` resolves the namespace at import time, so each case re-imports the module
 * against a fresh `browser` global rather than reusing one.
 */
async function resolveWith(browserValue: BrowserLike) {
  vi.resetModules();
  vi.stubGlobal("browser", browserValue);
  return import("./menus-api");
}

describe("menus API resolution", () => {
  it("uses contextMenus on engines that expose it", async () => {
    const contextMenus = { create: vi.fn(), removeAll: vi.fn() };
    const mod = await resolveWith({
      contextMenus,
      menus: { create: vi.fn(), removeAll: vi.fn() },
    });
    expect(mod.contextMenus).toBe(contextMenus);
  });

  it("falls back to Safari's menus namespace", async () => {
    const menus = { create: vi.fn(), removeAll: vi.fn() };
    const mod = await resolveWith({ menus });
    expect(mod.contextMenus).toBe(menus);
  });

  it("throws when the browser has neither namespace", async () => {
    vi.resetModules();
    vi.stubGlobal("browser", {});
    await expect(import("./menus-api")).rejects.toThrow(
      "No context-menu API in this browser.",
    );
  });
});
