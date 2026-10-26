import { createMemoryHistory } from "@tanstack/react-router";
import { expect, it } from "vitest";
import type { LibraryNav } from "@/shared/lib/library-nav";
import { bindBrowserLibraryHistory } from "./library-history";

function browser(entry = "/") {
  let nav: LibraryNav = { kind: "all" };
  const history = createMemoryHistory({ initialEntries: [entry] });
  const state = {
    getNav: () => nav,
    setNav: (value: LibraryNav) => {
      nav = value;
    },
  };
  const detach = bindBrowserLibraryHistory(history, state);
  return { history, state, detach };
}
it("restores folder navigation on reload, Back and Forward", () => {
  const { history, state, detach } = browser("/?folder=first");
  expect(state.getNav()).toEqual({ kind: "folder", id: "first" });
  state.setNav({ kind: "folder", id: "second" });
  history.push("/");
  expect(history.location.href).toBe("/?folder=second");
  history.back();
  expect(state.getNav()).toEqual({ kind: "folder", id: "first" });
  history.forward();
  expect(state.getNav()).toEqual({ kind: "folder", id: "second" });
  const reloaded = browser(history.location.href);
  expect(reloaded.state.getNav()).toEqual(state.getNav());
  detach();
  reloaded.detach();
});
it("retains the originating scope through Save deep links and search changes", () => {
  const { history, state, detach } = browser("/?tag=C%2B%2B");
  expect(state.getNav()).toEqual({ kind: "tag", name: "C++" });
  history.push("/?q=notes#results");
  expect(history.location.href).toBe("/?q=notes&tag=C%2B%2B#results");
  history.push("/save/fixture");
  expect(history.location.href).toBe("/save/fixture?tag=C%2B%2B");
  const reloaded = browser(history.location.href);
  reloaded.history.push("/");
  expect(reloaded.history.location.href).toBe("/?tag=C%2B%2B");
  history.push("/assistant");
  expect(state.getNav()).toEqual({ kind: "tag", name: "C++" });
  detach();
  reloaded.detach();
});
it("uses explicit navigation and rejects ambiguous or invalid scope parameters", () => {
  const { history, state, detach } = browser("/?scope=random");
  expect(state.getNav()).toEqual({ kind: "random" });
  history.push("/?folder=one&tag=two");
  expect(state.getNav()).toEqual({ kind: "all" });
  history.push("/?folder=one&folder=two");
  expect(state.getNav()).toEqual({ kind: "all" });
  history.push("/?scope=invalid");
  expect(state.getNav()).toEqual({ kind: "all" });
  history.push("/trash");
  expect(state.getNav()).toEqual({ kind: "trash" });
  state.setNav({ kind: "uncategorized" });
  history.replace("/");
  expect(history.location.href).toBe("/?scope=uncategorized");
  detach();
  history.push("/");
  expect(history.location.href).toBe("/");
});
