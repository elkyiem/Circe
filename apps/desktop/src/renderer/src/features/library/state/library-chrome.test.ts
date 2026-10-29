import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("library chrome", () => {
  beforeEach(() => {
    vi.resetModules();
    const memory = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
    });
  });

  afterEach(() => {
    delete document.documentElement.dataset.runtime;
    vi.unstubAllGlobals();
  });

  it("opens one narrow browser overlay at a time and retains desktop dual panes", async () => {
    document.documentElement.dataset.runtime = "browser";
    let narrow = true;
    vi.stubGlobal("matchMedia", () => ({ matches: narrow }));
    const { libraryChrome } = await import("./library-chrome");
    libraryChrome.toggleSidebar();
    expect(libraryChrome.getState().sidebarOpen).toBe(false);
    libraryChrome.toggleSidebar();
    expect(libraryChrome.getState()).toMatchObject({
      sidebarOpen: true,
      detailsOpen: false,
    });
    expect(localStorage.getItem("pond.details")).toBe("0");
    libraryChrome.setDetailsOpen(true);
    expect(libraryChrome.getState()).toMatchObject({
      sidebarOpen: false,
      detailsOpen: true,
    });
    expect(localStorage.getItem("pond.sidebar")).toBe("0");
    narrow = false;
    libraryChrome.toggleSidebar();
    expect(libraryChrome.getState()).toMatchObject({
      sidebarOpen: true,
      detailsOpen: true,
    });
  });

  it("raises old sidebar widths to the tab-safe minimum", async () => {
    localStorage.setItem("pond.sidebarWidth", "180");
    const { libraryChrome } = await import("./library-chrome");
    expect(libraryChrome.getState().sidebarWidth).toBe(256);
    libraryChrome.setSidebarWidth(200);
    expect(libraryChrome.getState().sidebarWidth).toBe(256);
    expect(localStorage.getItem("pond.sidebarWidth")).toBe("256");
  });

  it("preserves the saved sidebar width through closing and reopening", async () => {
    const { libraryChrome } = await import("./library-chrome");
    libraryChrome.setSidebarWidth(300);
    libraryChrome.toggleSidebar();
    expect(libraryChrome.getState().sidebarOpen).toBe(false);
    libraryChrome.toggleSidebar();
    expect(libraryChrome.getState().sidebarOpen).toBe(true);
    expect(libraryChrome.getState().sidebarWidth).toBe(300);
    expect(localStorage.getItem("pond.sidebar")).toBe("1");
  });
});
