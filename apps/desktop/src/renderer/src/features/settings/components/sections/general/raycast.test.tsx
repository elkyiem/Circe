import { Tooltip } from "@pond/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { RaycastRow } from "./raycast";

it.each([false, true])(
  "copies the Local API Token without rendering it (browser=%s)",
  async (browser) => {
    if (browser) document.documentElement.dataset.runtime = "browser";
    const copied: string[] = [];
    vi.stubGlobal("pond", {
      async query(name: string, params: { text?: string }) {
        if (name === "settings.ingestToken") return { token: "secret-token" };
        if (name === "clipboard.writeText") {
          copied.push(params.text ?? "");
          return { ok: true };
        }
        throw new Error(`Unexpected query: ${name}`);
      },
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          <Tooltip.Provider>
            <RaycastRow />
          </Tooltip.Provider>,
        ),
      );
      expect(host.textContent).not.toContain("secret-token");
      if (browser)
        expect(host.textContent).toContain("host-wide local API token");
      const button = [
        ...host.querySelectorAll<HTMLButtonElement>("button"),
      ].find((candidate) => candidate.textContent === "Copy Token");
      if (!button) throw new Error("Missing copy token button");
      await act(async () => button.click());
      expect(copied).toEqual(["secret-token"]);
      expect(button.textContent).toBe("Copied");
      expect(host.textContent).not.toContain("secret-token");
    } finally {
      await act(async () => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
      delete document.documentElement.dataset.runtime;
    }
  },
);
