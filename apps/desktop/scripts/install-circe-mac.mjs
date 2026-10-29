import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cp,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { webOriginsFromServe } from "./prepare-circe-address.mjs";

const appRoot = resolve(import.meta.dirname, "..");
const require = createRequire(join(appRoot, "package.json"));
const applicationId = "dev.elkyiem.circe";

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} failed`);
}

async function main() {
  assert.equal(process.platform, "darwin", "The Dock installer requires macOS");
  const destination = resolve(
    process.argv[2] ?? join(homedir(), "Applications/Circé.app"),
  );
  const staging = `${destination}.install-${process.pid}`;
  const processes = spawnSync("/bin/ps", ["-axo", "comm="], {
    encoding: "utf8",
  });
  assert.equal(processes.status, 0, "Could not check running applications");
  assert.ok(
    !processes.stdout.split("\n").some((command) =>
      command
        .trim()
        .normalize("NFC")
        .startsWith(`${destination.normalize("NFC")}/Contents/MacOS/`),
    ),
    "Quit Circé before updating its Dock launcher",
  );
  const runtime = require("electron");
  const source = resolve(runtime, "../../..");
  assert.ok(source.endsWith(".app"));
  await stat(join(appRoot, "out/main/index.js"));
  await stat(join(appRoot, "out/browser/browser.html"));
  const tailscale = "/usr/local/bin/tailscale";
  const serve = spawnSync(tailscale, ["serve", "status", "--json"], {
    encoding: "utf8",
    timeout: 10000,
  });
  if (serve.error) throw serve.error;
  assert.equal(
    serve.status,
    0,
    "Tailscale must be configured before installing the Dock launcher",
  );
  const config = {
    version: 1,
    appRoot,
    sandbox: resolve(appRoot, "../../.artifacts/iris-web-sandbox"),
    node: process.execPath,
    hostname: "circe.elkyiem",
    origins: webOriginsFromServe("circe.elkyiem", JSON.parse(serve.stdout)),
    tailscale,
    proxyState: join(homedir(), ".portless"),
    logDirectory: join(homedir(), "Library/Logs/Circé"),
  };
  await mkdir(dirname(destination), { recursive: true });
  try {
    const installed = JSON.parse(
      await readFile(
        join(destination, "Contents/Resources/circe-launch.json"),
        "utf8",
      ),
    );
    assert.equal(
      installed.version,
      1,
      "Refusing to replace an unrecognized Circé installation",
    );
    assert.equal(
      installed.appRoot,
      appRoot,
      "The existing launcher belongs to another checkout",
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    try {
      await stat(destination);
      throw new Error(
        "Refusing to replace an app without a Circé launcher manifest",
      );
    } catch (missing) {
      if (missing.code !== "ENOENT") throw missing;
    }
  }
  try {
    run("/usr/bin/ditto", [source, staging]);
    const contents = join(staging, "Contents");
    const resources = join(contents, "Resources");
    const executable = join(contents, "MacOS/Circe");
    await rename(
      join(contents, "MacOS/Electron"),
      join(contents, "MacOS/CirceRuntime"),
    );
    run("/usr/bin/xcrun", [
      "swiftc",
      join(import.meta.dirname, "circe-launcher.swift"),
      "-o",
      executable,
      "-O",
    ]);
    const plist = join(contents, "Info.plist");
    for (const [key, value] of Object.entries({
      CFBundleName: "Circé",
      CFBundleDisplayName: "Circé",
      CFBundleIdentifier: applicationId,
      CFBundleExecutable: "Circe",
    }))
      run("/usr/libexec/PlistBuddy", ["-c", `Set :${key} ${value}`, plist]);
    await writeFile(
      join(resources, "circe-launch.json"),
      `${JSON.stringify(config, null, 2)}\n`,
    );
    await cp(
      join(import.meta.dirname, "prepare-circe-address.mjs"),
      join(resources, "prepare-circe-address.mjs"),
    );
    const portless = dirname(
      dirname(fileURLToPath(import.meta.resolve("portless"))),
    );
    await cp(portless, join(resources, "portless"), { recursive: true });
    await cp(
      join(appRoot, "build/icon.icns"),
      join(resources, "electron.icns"),
    );
    run("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", staging]);
    run("/usr/bin/codesign", ["--verify", "--deep", "--strict", staging]);
    let previous;
    try {
      await stat(destination);
      previous = `${destination}.previous-${Date.now()}`;
      await rename(destination, previous);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    try {
      await rename(staging, destination);
    } catch (error) {
      if (previous) await rename(previous, destination);
      throw error;
    }
    run(
      "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister",
      ["-f", destination],
    );
    if (previous) {
      run("/usr/bin/ditto", [
        "-c",
        "-k",
        "--sequesterRsrc",
        "--keepParent",
        previous,
        `${previous}.zip`,
      ]);
      run(
        "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister",
        ["-u", previous],
      );
      await rm(previous, { recursive: true });
    }
    run("/usr/bin/xcrun", [
      "swift",
      join(import.meta.dirname, "pin-circe-dock.swift"),
      destination,
      applicationId,
      source,
    ]);
    console.log(`Installed ${destination}`);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
