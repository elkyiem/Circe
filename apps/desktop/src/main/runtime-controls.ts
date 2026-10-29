import type { Prefs } from "@pond/schema/db";
import { DEFAULT_INGEST_PORT } from "../shared/constants";
import type { LocalApiStatus } from "../shared/local-api-contracts";

interface RuntimeServer {
  port: number;
  host: string;
  close(): Promise<void>;
}

interface RuntimeDependencies {
  httpPolicy?: { enabled: boolean; port?: number };
  getPrefs(): Promise<Prefs>;
  invalidatePrefs(): void;
  startHttpServer(
    port: number,
    bind: Prefs["api"]["bindAddress"],
  ): Promise<RuntimeServer>;
  setTrayVisible(visible: boolean): Promise<void>;
  isPackaged: boolean;
  setLoginItemSettings(settings: { openAtLogin: boolean }): void;
  setCloseToTray(enabled: boolean): void;
  applyAppIcon(icon: Prefs["window"]["appIcon"]): Promise<void>;
  warn(message: string, error: Error): void;
}

/** A sandbox has no native listener unless its resident web launcher opts in. */
export function localApiLaunchPolicy(env: NodeJS.ProcessEnv) {
  if (!env.POND_SANDBOX) return { enabled: true };
  if (env.CIRCE_WEB !== "1" || !env.CIRCE_LOCAL_API_PORT)
    return { enabled: false };
  const port = Number(env.CIRCE_LOCAL_API_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("CIRCE_LOCAL_API_PORT must be a port from 1024 to 65535.");
  return { enabled: true, port };
}

export function createRuntimeControls(deps: RuntimeDependencies) {
  let httpServer: RuntimeServer | null = null;
  const policy = deps.httpPolicy ?? { enabled: true };
  let status: LocalApiStatus = {
    state: policy.enabled ? "stopped" : "disabled",
    url: null,
    error: null,
  };
  let operations = Promise.resolve();
  function serialize<T>(operation: () => Promise<T>) {
    const next = operations.then(operation);
    operations = next.then(
      () => {},
      () => {},
    );
    return next;
  }
  async function listen(prefs: Prefs) {
    if (!policy.enabled) return {};
    const port = policy.port ?? (prefs.api.port || DEFAULT_INGEST_PORT);
    const bind = policy.port ? "loopback" : prefs.api.bindAddress;
    const url = `http://${bind === "lan" ? "0.0.0.0" : "127.0.0.1"}:${port}/api/v2`;
    try {
      httpServer = await deps.startHttpServer(port, bind);
      status = {
        state: "listening",
        url: `http://${httpServer.host}:${httpServer.port}/api/v2`,
        error: null,
      };
      return { port: httpServer.port, host: httpServer.host };
    } catch (cause) {
      httpServer = null;
      status = {
        state: "failed",
        url,
        error:
          cause instanceof Error
            ? cause.message
            : "Could not start the Local API.",
      };
      throw cause;
    }
  }
  function startHttpServer() {
    return serialize(async () => {
      if (httpServer) return { port: httpServer.port, host: httpServer.host };
      if (!policy.enabled) return {};
      return listen(await deps.getPrefs());
    });
  }
  async function closeHttpServer() {
    const previous = httpServer;
    httpServer = null;
    status = {
      state: policy.enabled ? "stopped" : "disabled",
      url: null,
      error: null,
    };
    await previous?.close();
  }

  return {
    startHttpServer,
    httpStatus: (): LocalApiStatus => ({ ...status }),
    closeHttpServer: () => serialize(closeHttpServer),
    restartHttpServer() {
      return serialize(async () => {
        if (!policy.enabled) return {};
        deps.invalidatePrefs();
        const prefs = await deps.getPrefs();
        try {
          await closeHttpServer();
        } catch (cause) {
          deps.warn(
            "[pond] http close failed",
            cause instanceof Error ? cause : new Error(String(cause)),
          );
        }
        return listen(prefs);
      });
    },
    async applyPrefsAtRuntime() {
      deps.invalidatePrefs();
      const prefs = await deps.getPrefs();
      await deps.setTrayVisible(prefs.quickCapture.menuBarIcon);
      if (deps.isPackaged) {
        deps.setLoginItemSettings({
          openAtLogin: prefs.quickCapture.launchAtLogin,
        });
      }
      deps.setCloseToTray(prefs.window.closeToTray === true);
      await deps.applyAppIcon(prefs.window.appIcon);
    },
    async applyWindowPrefsAtRuntime() {
      deps.invalidatePrefs();
      const prefs = await deps.getPrefs();
      deps.setCloseToTray(prefs.window.closeToTray === true);
    },
  };
}
