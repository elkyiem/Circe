import { describe, expect, it } from "vitest";
import {
  hostSetupCommands,
  MCP_HOST_CATALOG,
  mcpHostConfigPath,
  pondLaunchLine,
} from "../../../shared/mcp-hosts";
import {
  configListsPond,
  mcpDeeplinkUrl,
  mcpInstallUrl,
  mcpLaunchDescriptor,
  pondMcpSnippet,
} from "./mcp-hosts";

describe("mcp hosts", () => {
  it("builds Claude Code setup commands from the Pond launch", () => {
    const commands = hostSetupCommands(
      "claude-code",
      "/Applications/Pond.app/Contents/MacOS/Pond",
      ["--mcp"],
    );
    expect(commands[0]?.value).toBe(
      "claude mcp add --scope user pond -- /Applications/Pond.app/Contents/MacOS/Pond --mcp",
    );
    expect(commands[1]?.value).toBe("claude mcp get pond");
  });

  it("quotes launch paths that contain spaces", () => {
    expect(
      pondLaunchLine("/Users/Raphael Salaja/Pond.app/Contents/MacOS/Pond", [
        "--mcp",
      ]),
    ).toBe('"/Users/Raphael Salaja/Pond.app/Contents/MacOS/Pond" --mcp');
  });

  it("shows Windows MCP config paths for desktop clients", () => {
    const claude = MCP_HOST_CATALOG.find(
      (host) => host.id === "claude-desktop",
    );
    const vscode = MCP_HOST_CATALOG.find((host) => host.id === "vscode");
    if (!claude || !vscode) throw new Error("Missing MCP host fixture");
    expect(mcpHostConfigPath(claude, "Win32")).toBe(
      "%APPDATA%\\Claude\\claude_desktop_config.json",
    );
    expect(mcpHostConfigPath(vscode, "Win32")).toBe(
      "%APPDATA%\\Code\\User\\mcp.json",
    );
  });

  it("builds a Cursor install URL from the Pond command", () => {
    const url = mcpInstallUrl("cursor", "/bin/pond", ["--mcp"]);
    expect(url).toContain("name=pond");
    expect(mcpInstallUrl("claude-code", "/bin/pond", ["--mcp"])).toBeNull();
  });

  it("serializes the Pond stdio snippet", () => {
    expect(pondMcpSnippet("/bin/pond", ["--mcp"]).json).toContain("--mcp");
  });

  it("finds Pond in a client config by name or launch path", () => {
    expect(configListsPond(pondMcpSnippet("/bin/pond").json)).toBe(true);
    expect(
      configListsPond(
        JSON.stringify({
          mcpServers: {
            library: {
              command: "/Applications/Pond.app/Contents/MacOS/Pond",
            },
          },
        }),
      ),
    ).toBe(true);
    expect(
      configListsPond(JSON.stringify({ mcpServers: { linear: {} } })),
    ).toBe(false);
    expect(configListsPond("")).toBe(false);
  });
});

it("uses the resident unpackaged Mac app, sandbox and keychain mode for snippets and install links", () => {
  const launch = mcpLaunchDescriptor({
    executable: "/Applications/Electron.app/Contents/MacOS/Electron",
    appPath: "/Fixture/Circé/apps/desktop",
    packaged: false,
    platform: "darwin",
    sandbox: "/Fixture/profile with spaces",
    mockKeychain: true,
  });
  expect(launch).toEqual({
    command: "/usr/bin/env",
    args: [
      "-u",
      "ELECTRON_RUN_AS_NODE",
      "POND_SANDBOX=/Fixture/profile with spaces",
      "CIRCE_WEB=1",
      "/Applications/Electron.app/Contents/MacOS/Electron",
      "/Fixture/Circé/apps/desktop",
      "--mcp",
      "--use-mock-keychain",
    ],
  });
  const snippet = pondMcpSnippet(launch.command, launch.args);
  const url = new URL(
    mcpDeeplinkUrl("cursor", launch.command, launch.args) ?? "",
  );
  expect(
    JSON.parse(
      Buffer.from(url.searchParams.get("config") ?? "", "base64").toString(),
    ),
  ).toEqual({ command: snippet.command, args: snippet.args });
  expect(snippet.json).not.toContain("token");
});
it("keeps a packaged native launch free of unpackaged app paths and sandbox mode", () => {
  expect(
    mcpLaunchDescriptor({
      executable: "C:\\Pond\\Pond.exe",
      appPath: "ignored",
      packaged: true,
      platform: "win32",
      mockKeychain: false,
    }),
  ).toEqual({ command: "C:\\Pond\\Pond.exe", args: ["--mcp"] });
});
