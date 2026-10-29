import { DEFAULT_PREFS, type Prefs } from "@pond/schema/db";
import { describe, expect, it } from "vitest";
import {
  createRuntimeControls,
  localApiLaunchPolicy,
} from "./runtime-controls";

function setup(
  isPackaged = false,
  httpPolicy?: { enabled: boolean; port?: number },
) {
  const events: string[] = [];
  let prefs = structuredClone(DEFAULT_PREFS);
  let readError: Error | null = null;
  let closeError: Error | null = null;
  let startError: Error | null = null;
  const controls = createRuntimeControls({
    httpPolicy,
    async getPrefs() {
      events.push("read");
      if (readError) throw readError;
      return prefs;
    },
    invalidatePrefs() {
      events.push("invalidate");
    },
    async startHttpServer(port, bind) {
      events.push(`start:${port}:${bind}`);
      if (startError) throw startError;
      return {
        port,
        host: bind === "lan" ? "0.0.0.0" : "127.0.0.1",
        async close() {
          events.push("close");
          if (closeError) throw closeError;
        },
      };
    },
    async setTrayVisible(visible) {
      events.push(`tray:${visible}`);
    },
    isPackaged,
    setLoginItemSettings(settings) {
      events.push(`login:${settings.openAtLogin}`);
    },
    setCloseToTray(enabled) {
      events.push(`close-to-tray:${enabled}`);
    },
    async applyAppIcon(icon) {
      events.push(`icon:${icon}`);
    },
    warn() {
      events.push("warning");
    },
  });
  return {
    controls,
    events,
    setPrefs(next: Prefs) {
      prefs = next;
    },
    failStart() {
      startError = new Error("Address already in use");
    },
    failRead() {
      readError = new Error("unavailable preferences");
    },
    failClose() {
      closeError = new Error("close failed");
    },
  };
}

describe("runtime controls", () => {
  it("restarts with refreshed preferences after closing the current server", async () => {
    const run = setup();
    await run.controls.startHttpServer();
    run.events.length = 0;
    run.setPrefs({
      ...DEFAULT_PREFS,
      api: { ...DEFAULT_PREFS.api, port: 4567, bindAddress: "lan" },
    });
    await expect(run.controls.restartHttpServer()).resolves.toEqual({
      port: 4567,
      host: "0.0.0.0",
    });
    expect(run.events).toEqual([
      "invalidate",
      "read",
      "close",
      "start:4567:lan",
    ]);
    await run.controls.closeHttpServer();
    expect(run.events.at(-1)).toBe("close");
  });

  it("keeps the current server running when preferences cannot be read", async () => {
    const run = setup();
    await run.controls.startHttpServer();
    run.events.length = 0;
    run.failRead();
    await expect(run.controls.restartHttpServer()).rejects.toThrow(
      "unavailable preferences",
    );
    expect(run.events).toEqual(["invalidate", "read"]);
  });

  it("still attempts restart when closing the old server fails", async () => {
    const run = setup();
    await run.controls.startHttpServer();
    run.events.length = 0;
    run.failClose();
    await run.controls.restartHttpServer();
    expect(run.events.slice(0, 4)).toEqual([
      "invalidate",
      "read",
      "close",
      "warning",
    ]);
    expect(run.events.at(-1)).toMatch(/^start:/);
  });

  it.each([false, true])(
    "applies runtime preferences with packaged=%s",
    async (packaged) => {
      const run = setup(packaged);
      await run.controls.applyPrefsAtRuntime();
      expect(run.events).toEqual([
        "invalidate",
        "read",
        `tray:${DEFAULT_PREFS.quickCapture.menuBarIcon}`,
        ...(packaged
          ? [`login:${DEFAULT_PREFS.quickCapture.launchAtLogin}`]
          : []),
        `close-to-tray:${DEFAULT_PREFS.window.closeToTray === true}`,
        `icon:${DEFAULT_PREFS.window.appIcon}`,
      ]);
    },
  );

  it("applies window preferences without applying unrelated runtime settings", async () => {
    const run = setup();
    await run.controls.applyWindowPrefsAtRuntime();
    expect(run.events).toEqual([
      "invalidate",
      "read",
      `close-to-tray:${DEFAULT_PREFS.window.closeToTray === true}`,
    ]);
  });
});

it("keeps sandbox listeners disabled without an explicit resident host launch policy", async () => {
  expect(localApiLaunchPolicy({ POND_SANDBOX: "/fixture" })).toEqual({
    enabled: false,
  });
  expect(
    localApiLaunchPolicy({
      POND_SANDBOX: "/fixture",
      CIRCE_LOCAL_API_PORT: "4788",
    }),
  ).toEqual({ enabled: false });
  const run = setup(false, { enabled: false });
  await run.controls.startHttpServer();
  await run.controls.restartHttpServer();
  expect(run.events).toEqual([]);
  expect(run.controls.httpStatus()).toEqual({
    state: "disabled",
    url: null,
    error: null,
  });
});
it("preserves the opt-in loopback port across restart without changing preferences", async () => {
  const policy = localApiLaunchPolicy({
    POND_SANDBOX: "/fixture",
    CIRCE_WEB: "1",
    CIRCE_LOCAL_API_PORT: "4788",
  });
  const run = setup(false, policy);
  run.setPrefs({
    ...DEFAULT_PREFS,
    api: { ...DEFAULT_PREFS.api, port: 41610, bindAddress: "lan" },
  });
  await run.controls.startHttpServer();
  await run.controls.restartHttpServer();
  expect(run.events.filter((event) => event.startsWith("start:"))).toEqual([
    "start:4788:loopback",
    "start:4788:loopback",
  ]);
  expect(run.controls.httpStatus()).toEqual({
    state: "listening",
    url: "http://127.0.0.1:4788/api/v2",
    error: null,
  });
  await run.controls.closeHttpServer();
  expect(run.controls.httpStatus()).toEqual({
    state: "stopped",
    url: null,
    error: null,
  });
});
it("reports a failed restart rather than retaining the closed listener", async () => {
  const run = setup(false, { enabled: true, port: 4788 });
  await run.controls.startHttpServer();
  run.failStart();
  await expect(run.controls.restartHttpServer()).rejects.toThrow(
    "Address already in use",
  );
  expect(run.controls.httpStatus()).toEqual({
    state: "failed",
    url: "http://127.0.0.1:4788/api/v2",
    error: "Address already in use",
  });
  run.events.length = 0;
  await run.controls.closeHttpServer();
  expect(run.events).toEqual([]);
});
it.each(["0", "1023", "65536", "oops", "4788.5"])(
  "rejects invalid local API launch port %s",
  (port) => {
    expect(() =>
      localApiLaunchPolicy({
        POND_SANDBOX: "/fixture",
        CIRCE_WEB: "1",
        CIRCE_LOCAL_API_PORT: port,
      }),
    ).toThrow("CIRCE_LOCAL_API_PORT");
  },
);
