import { randomUUID } from "node:crypto";
import type { Source } from "@pond/schema/db";
import { extensionCookieSchema } from "@pond/schema/session";
import { BrowserWindow, session } from "electron";
import { IPC } from "../../shared/constants";
import {
  isAuthCookieName,
  primaryDomainForSource,
} from "../core/refresh/harvest-window";
import { browserUserAgent } from "../core/refresh/harvest-window/constants";
import { homeUrlForSource } from "../core/refresh/sources";
import { importSessionCookies } from "../core/session-import";
import { broadcast } from "../lib/broadcast";
import { libraryId } from "../paths";

const connections = new Map<Source, BrowserWindow>();

export function closeWebSourceConnection(source?: Source) {
  for (const [key, window] of connections)
    if (!source || key === source) window.close();
}

/** Only credentials entered in this isolated window are imported. No browser-profile access. */
export async function openWebSourceConnection(source: Source) {
  const existing = connections.get(source);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return { ok: true, mode: "external" as const };
  }
  const url = homeUrlForSource(source);
  const domain = primaryDomainForSource(source)?.replace(/^\./, "");
  if (!url || !domain) return { ok: false, mode: "external" as const };
  const expected = libraryId();
  const partition = session.fromPartition(`iris-signin-${randomUUID()}`);
  partition.setUserAgent(browserUserAgent());
  partition.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  const window = new BrowserWindow({
    title: `Circé isolated sign-in — ${source}`,
    width: 1000,
    height: 780,
    show: true,
    webPreferences: {
      session: partition,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false,
    },
  });
  connections.set(source, window);
  let pending: ReturnType<typeof setTimeout> | undefined;
  let busy = false;
  let connected = false;
  const check = async () => {
    if (busy || window.isDestroyed()) return;
    if (libraryId() !== expected) {
      window.close();
      return;
    }
    busy = true;
    try {
      const cookies = (await partition.cookies.get({})).filter((cookie) => {
        const host = (cookie.domain ?? "").replace(/^\./, "").toLowerCase();
        return host === domain || host.endsWith(`.${domain}`);
      });
      if (
        !cookies.some((cookie) =>
          isAuthCookieName(source, cookie.name, cookie.value),
        )
      )
        return;
      const result = await importSessionCookies(
        source,
        cookies.map((cookie) => extensionCookieSchema.parse(cookie)),
      );
      if (result.ok && !window.isDestroyed()) {
        connected = true;
        window.close();
      }
    } finally {
      busy = false;
    }
  };
  const changed = () => {
    clearTimeout(pending);
    pending = setTimeout(() => {
      void check().catch(() =>
        broadcast(IPC.sessionImportFailed, {
          source,
          reason: "session_not_authenticated",
        }),
      );
    }, 1000);
  };
  partition.cookies.on("changed", changed);
  window.webContents.on("will-navigate", (event, target) => {
    if (new URL(target).protocol !== "https:") event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(({ url: target }) => {
    if (new URL(target).protocol === "https:")
      void window.loadURL(target).catch(() => {});
    return { action: "deny" };
  });
  window.once("closed", () => {
    connections.delete(source);
    if (!connected)
      broadcast(IPC.sessionImportFailed, {
        source,
        reason: "session_not_authenticated",
      });
    clearTimeout(pending);
    partition.cookies.removeListener("changed", changed);
    void partition.clearStorageData();
  });
  try {
    await window.loadURL(url);
    return { ok: true, mode: "external" as const };
  } catch {
    if (!window.isDestroyed()) window.close();
    return { ok: false, mode: "external" as const };
  }
}
