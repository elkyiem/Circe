import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { request } from "node:https";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export function shellQuote(value) {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

export function webOriginsFromServe(hostname, state) {
  return [
    ...new Set([
      `https://${hostname}`,
      ...Object.entries(state.Web ?? {})
        .filter(
          ([address, site]) =>
            site.Handlers?.["/"]?.Proxy === "http://127.0.0.1:4789" &&
            // App-allocated 844x ports can later be reassigned to another app.
            new URL(`https://${address}`).port === "9443",
        )
        .map(([address]) => new URL(`https://${address}`).origin),
    ]),
  ];
}

export function proxyStartCommand(config, cli, user) {
  return [
    "/usr/bin/env",
    `PORTLESS_STATE_DIR=${config.proxyState}`,
    `PORTLESS_TLD=${config.hostname.split(".").slice(1).join(".")}`,
    `SUDO_USER=${user.name}`,
    `SUDO_UID=${user.uid}`,
    `SUDO_GID=${user.gid}`,
    config.node,
    cli,
    "proxy",
    "start",
    "--port",
    "443",
    "--https",
    "--tld",
    config.hostname.split(".").slice(1).join("."),
    "--skip-trust",
  ]
    .map(shellQuote)
    .join(" ");
}

async function proxyReady(config) {
  let ca;
  try {
    ca = await readFile(join(config.proxyState, "ca.pem"));
  } catch {
    return false;
  }
  return new Promise((resolve) => {
    const req = request(
      {
        hostname: "127.0.0.1",
        port: 443,
        servername: config.hostname,
        headers: { host: config.hostname },
        method: "HEAD",
        ca,
        timeout: 2500,
      },
      (response) => {
        response.resume();
        resolve(response.headers["x-portless"] === "1");
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

function execute(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    timeout: 30000,
    ...options,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} did not complete successfully`);
}

async function main() {
  const configPath = process.argv[2];
  assert.ok(configPath, "A Circé launch configuration is required");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  assert.equal(config.version, 1);
  assert.match(config.hostname, /^[a-z0-9-]+\.[a-z0-9.-]+$/);
  execute("/usr/bin/open", ["-gj", "-a", "Tailscale"]);
  const readTailnet = () => {
    const status = spawnSync(config.tailscale, ["status", "--json"], {
      encoding: "utf8",
      timeout: 10000,
    });
    if (status.error) throw status.error;
    assert.equal(status.status, 0, "Tailscale is not available");
    return JSON.parse(status.stdout);
  };
  if (readTailnet().BackendState !== "Running") {
    execute(config.tailscale, ["up"], { timeout: 30000 });
    assert.equal(
      readTailnet().BackendState,
      "Running",
      "Finish signing in to Tailscale, then reopen Circé",
    );
  }
  const cli = join(dirname(configPath), "portless/dist/cli.js");
  if (!(await proxyReady(config))) {
    const { userInfo } = await import("node:os");
    const user = userInfo();
    const command = proxyStartCommand(config, cli, {
      name: user.username,
      uid: user.uid,
      gid: user.gid,
    });
    execute(
      "/usr/bin/osascript",
      [
        "-e",
        `do shell script ${JSON.stringify(command)} with administrator privileges`,
      ],
      { timeout: 120000 },
    );
    assert.ok(
      await proxyReady(config),
      "The trusted HTTPS proxy did not become ready",
    );
  }
  // The existing tailnet HTTPS/DNS services own remote access; no new Serve ports.
  execute(
    config.node,
    [cli, "alias", config.hostname.split(".")[0], "4789", "--force"],
    {
      env: {
        ...process.env,
        PORTLESS_STATE_DIR: config.proxyState,
        PORTLESS_TLD: config.hostname.split(".").slice(1).join("."),
      },
    },
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
