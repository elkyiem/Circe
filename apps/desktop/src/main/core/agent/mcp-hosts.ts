import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { z } from "zod";
import {
  MCP_DETECTED_CLIENTS,
  MCP_HOST_CATALOG,
  type McpClientStatus,
  type McpDeeplinkHost,
  type McpHostId,
} from "../../../shared/mcp-hosts";

const McpConfigSchema = z.object({
  mcpServers: z.record(z.string(), z.unknown()),
});

/** Launch the same native app/profile as the resident host, without inheriting Electron's Node-only mode. */
export function mcpLaunchDescriptor(options: {
  executable: string;
  appPath: string;
  packaged: boolean;
  platform: NodeJS.Platform;
  sandbox?: string;
  mockKeychain: boolean;
}) {
  const args = [
    ...(options.packaged ? [] : [options.appPath]),
    "--mcp",
    ...(options.mockKeychain ? ["--use-mock-keychain"] : []),
  ];
  if (!options.sandbox) return { command: options.executable, args };
  if (options.platform === "win32")
    throw new Error(
      "Sandbox MCP setup is supported on the Mac host. Use a packaged app on Windows.",
    );
  return {
    command: "/usr/bin/env",
    args: [
      "-u",
      "ELECTRON_RUN_AS_NODE",
      `POND_SANDBOX=${options.sandbox}`,
      "CIRCE_WEB=1",
      options.executable,
      ...args,
    ],
  };
}

export function pondMcpSnippet(
  command = process.execPath,
  args: string[] = ["--mcp"],
) {
  return {
    command,
    args,
    json: JSON.stringify({ mcpServers: { pond: { command, args } } }, null, 2),
  };
}

export function mcpInstallUrl(
  id: McpHostId,
  command: string,
  args: string[],
): string | null {
  if (id === "cursor") {
    const config = Buffer.from(JSON.stringify({ command, args })).toString(
      "base64",
    );
    return `cursor://anysphere.cursor-deeplink/mcp/install?name=pond&config=${encodeURIComponent(config)}`;
  }
  if (id === "vscode") {
    return `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: "pond", command, args }))}`;
  }
  return null;
}

export function mcpDeeplinkUrl(
  id: McpDeeplinkHost,
  command = process.execPath,
  args = ["--mcp"],
): string | null {
  return mcpInstallUrl(id, command, args);
}

/** People rename the server, so a launch path pointing at Pond counts as connected too. */
export function configListsPond(text: string): boolean {
  try {
    const config = McpConfigSchema.safeParse(JSON.parse(text));
    if (!config.success) return false;
    return Object.entries(config.data.mcpServers).some(
      ([name, server]) =>
        name.toLowerCase() === "pond" ||
        JSON.stringify(server).toLowerCase().includes("pond"),
    );
  } catch {
    return false;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** A client's config folder exists once it has run, even before any MCP server is added. */
export async function mcpClientStatus(): Promise<McpClientStatus[]> {
  return Promise.all(
    MCP_DETECTED_CLIENTS.map(async (id) => {
      const host = MCP_HOST_CATALOG.find((entry) => entry.id === id);
      if (!host) return { id, installed: false, connected: false };
      const raw =
        process.platform === "win32"
          ? (host.windowsConfigPath ?? host.configPath)
          : host.configPath;
      const path = raw
        .replace(/^~/, homedir())
        .replace("%APPDATA%", process.env.APPDATA ?? "");
      if (!(await exists(dirname(path)))) {
        return { id, installed: false, connected: false };
      }
      const text = await readFile(path, "utf8").catch(() => "");
      return { id, installed: true, connected: configListsPond(text) };
    }),
  );
}
