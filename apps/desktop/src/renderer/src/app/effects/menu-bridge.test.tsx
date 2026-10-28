import { PrefsSchema } from "@pond/schema";
import type { MenuActionEvent } from "@shared/constants";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { libraryChrome } from "@/features/library/state/library-chrome";
import { selectOnlySave } from "@/features/saves";
import { setAppRouter } from "@/shared/lib/app-router";
import { MenuBridge } from "./menu-bridge";

describe("menu bridge inspector", () => {
  let host: HTMLDivElement;
  let root: Root;
  let menuAction: ((action: MenuActionEvent) => void) | undefined;

  beforeEach(() => {
    vi.stubGlobal("pond", {
      query: async (name: string) =>
        name === "settings.getPrefs" ? PrefsSchema.parse({}) : [],
      onOpenFiles: () => () => {},
      onMenuAction: (callback: (action: MenuActionEvent) => void) => {
        menuAction = callback;
        return () => {
          menuAction = undefined;
        };
      },
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it("toggles details on the library without opening a save", async () => {
    const rootRoute = createRootRoute({ component: () => null });
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: () => null,
    });
    const saveRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/save/$saveId",
      component: () => null,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, saveRoute]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    setAppRouter(router);
    selectOnlySave("demo");
    libraryChrome.setDetailsOpen(true);
    await act(async () => {
      root.render(<MenuBridge />);
    });
    const open = libraryChrome.getState().detailsOpen;
    await act(async () => {
      menuAction?.({ id: "view.inspector.toggle", source: "menu" });
    });
    expect(libraryChrome.getState().detailsOpen).toBe(!open);
    expect(router.state.location.pathname).toBe("/");
  });
});
