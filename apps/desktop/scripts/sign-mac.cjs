const { execFileSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { join, resolve } = require("node:path");

const APPEXES = [
  {
    path: "Contents/PlugIns/Pond Extension.appex",
    entitlements: resolve(
      __dirname,
      "../../extension/safari/extension.entitlements",
    ),
  },
  {
    path: "Contents/PlugIns/Pond Share.appex",
    entitlements: resolve(__dirname, "../share-extension/share.entitlements"),
  },
];

function defaultSign() {
  const builder = require.resolve("electron-builder");
  return require(
    require.resolve("app-builder-lib/out/codeSign/macCodeSign.js", {
      paths: [builder],
    }),
  ).sign;
}

/** electron-builder skips Contents/PlugIns, so each appex is signed with its own entitlements before the app seals it. */
exports.default = async function signMac(opts) {
  for (const { path, entitlements } of APPEXES) {
    const appex = join(opts.app, path);
    if (!existsSync(appex) || !opts.identity) continue;
    const args = [
      "--force",
      "--sign",
      opts.identity,
      "--options",
      "runtime",
      "--entitlements",
      entitlements,
    ];
    if (opts.identity !== "-") args.push("--timestamp");
    if (opts.keychain) args.push("--keychain", opts.keychain);
    execFileSync("codesign", [...args, appex], { stdio: "inherit" });
  }
  return defaultSign()(opts);
};
