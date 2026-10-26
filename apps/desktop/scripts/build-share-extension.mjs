#!/usr/bin/env node
/** Compiles the Share extension into `resources/ShareExtension`; `sign-mac.cjs` re-signs it for release. */

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = resolve(desktopRoot, "share-extension");
const workDir = resolve(desktopRoot, ".share-build");
const appex = resolve(desktopRoot, "resources/ShareExtension/Pond Share.appex");
/** Matches the Safari appex in `build-safari-extension.mjs`. */
const DEPLOYMENT_TARGET = "13.5";
const ARCHS = ["arm64", "x86_64"];

function skip(reason) {
  console.log(`[pond share] skipped: ${reason}`);
  process.exit(0);
}

function fail(message) {
  console.error(`[pond share] ${message}`);
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error || result.status !== 0) {
    fail(`${command} ${args.join(" ")} failed`);
  }
}

/** The appex must carry the host app's bundle ID as its prefix, so read it from `appId`. */
function appBundleId() {
  const yml = readFileSync(
    resolve(desktopRoot, "electron-builder.yml"),
    "utf8",
  );
  const match = yml.match(/^appId:\s*(\S+)\s*$/m);
  if (!match) fail("electron-builder.yml has no top-level appId");
  return match[1];
}

if (process.platform !== "darwin") skip("Share extensions are macOS only");
const swiftc = spawnSync("xcrun", ["--find", "swiftc"], { encoding: "utf8" });
if (swiftc.error || swiftc.status !== 0) {
  if (process.env.CI) fail("swiftc is required to build the Share extension");
  skip("swiftc is not installed");
}

const version = JSON.parse(
  readFileSync(resolve(desktopRoot, "package.json"), "utf8"),
).version;
const sources = ["PondSocket.swift", "ShareViewController.swift"].map((f) =>
  join(sourceDir, f),
);

rmSync(workDir, { recursive: true, force: true });
rmSync(appex, { recursive: true, force: true });
mkdirSync(workDir, { recursive: true });
mkdirSync(join(appex, "Contents/MacOS"), { recursive: true });

const slices = ARCHS.map((arch) => {
  const out = join(workDir, `PondShare-${arch}`);
  run("xcrun", [
    "swiftc",
    "-O",
    "-parse-as-library",
    "-application-extension",
    "-module-name",
    "PondShare",
    "-target",
    `${arch}-apple-macos${DEPLOYMENT_TARGET}`,
    "-framework",
    "AppKit",
    "-Xlinker",
    "-e",
    "-Xlinker",
    "_NSExtensionMain",
    ...sources,
    "-o",
    out,
  ]);
  return out;
});
run("xcrun", [
  "lipo",
  "-create",
  ...slices,
  "-output",
  join(appex, "Contents/MacOS/PondShare"),
]);

const plist = readFileSync(join(sourceDir, "Info.plist"), "utf8")
  .replaceAll("__BUNDLE_ID__", `${appBundleId()}.Share`)
  .replaceAll("__VERSION__", version);
writeFileSync(join(appex, "Contents/Info.plist"), plist);

run("codesign", [
  "--force",
  "--sign",
  "-",
  "--options",
  "runtime",
  "--entitlements",
  join(sourceDir, "share.entitlements"),
  appex,
]);
console.log(`[pond share] built ${appex}`);
