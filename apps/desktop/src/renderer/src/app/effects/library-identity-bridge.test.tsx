import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { LibraryIdentityBridge } from "./library-identity-bridge";

it("refreshes identity in two open clients after a host commit and releases subscriptions", async () => {
  const listeners = new Set<(id: string) => void>();
  let identity = "My Pond";
  vi.stubGlobal("pond", {
    libraryId: () => "active-library",
    onLibraryIdentityChanged: (callback: (id: string) => void) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
  });
  function Identity() {
    const { data } = useQuery({
      queryKey: ["library-info"],
      queryFn: async () => identity,
    });
    return <span>{data}</span>;
  }
  const clients = [new QueryClient(), new QueryClient()];
  const surfaces = clients.map(() => document.createElement("div"));
  const roots = surfaces.map((surface) => {
    document.body.append(surface);
    return createRoot(surface);
  });
  const mounts = roots.map((root, index) => {
    const client = clients[index];
    if (!client) throw new Error("Missing test client");
    return { root, client };
  });
  try {
    await act(async () => {
      for (const { root, client } of mounts)
        root.render(
          <QueryClientProvider client={client}>
            <LibraryIdentityBridge />
            <Identity />
          </QueryClientProvider>,
        );
    });
    await vi.waitFor(() =>
      expect(surfaces.map((surface) => surface.textContent)).toEqual([
        "My Pond",
        "My Pond",
      ]),
    );
    identity = "Twitter";
    await act(async () => {
      for (const listener of listeners) listener("other-library");
    });
    expect(surfaces.map((surface) => surface.textContent)).toEqual([
      "My Pond",
      "My Pond",
    ]);
    await act(async () => {
      for (const listener of listeners) listener("active-library");
    });
    await vi.waitFor(() =>
      expect(surfaces.map((surface) => surface.textContent)).toEqual([
        "Twitter",
        "Twitter",
      ]),
    );
  } finally {
    await act(async () => {
      for (const root of roots) root.unmount();
    });
    for (const surface of surfaces) surface.remove();
    for (const client of clients) client.clear();
    vi.unstubAllGlobals();
  }
  expect(listeners.size).toBe(0);
});
