import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  proxyStartCommand,
  shellQuote,
  webOriginsFromServe,
} from "./prepare-circe-address.mjs";

test("quotes literal launcher paths without executing shell substitutions", () => {
  const path = "/Users/a'b/Documents/Circé $USER `id` $(id)/node";
  const result = execFileSync(
    "/bin/sh",
    ["-c", `printf %s ${shellQuote(path)}`],
    { encoding: "utf8" },
  );
  assert.equal(result, path);
});

test("keeps existing Circé HTTPS origins without admitting another app's origin", () => {
  assert.deepEqual(
    webOriginsFromServe("circe.elkyiem", {
      Web: {
        "host.tailnet.ts.net:9443": {
          Handlers: { "/": { Proxy: "http://127.0.0.1:4789" } },
        },
        "host.tailnet.ts.net:9444": {
          Handlers: { "/": { Proxy: "http://127.0.0.1:4820" } },
        },
        "host.tailnet.ts.net:8444": {
          Handlers: { "/": { Proxy: "http://127.0.0.1:4789" } },
        },
      },
    }),
    ["https://circe.elkyiem", "https://host.tailnet.ts.net:9443"],
  );
});

test("passes exact proxy arguments and owner environment through the administrator shell boundary", () => {
  const temporary = mkdtempSync(join(tmpdir(), "circe-launch-test-"));
  try {
    const cli = join(temporary, "Circé's `runtime` $(id).cjs");
    writeFileSync(
      cli,
      "console.log(JSON.stringify({args:process.argv.slice(2),state:process.env.PORTLESS_STATE_DIR,tld:process.env.PORTLESS_TLD,user:process.env.SUDO_USER,uid:process.env.SUDO_UID,gid:process.env.SUDO_GID}))",
    );
    const state = join(temporary, "User's $state $(id)");
    const command = proxyStartCommand(
      { node: process.execPath, proxyState: state, hostname: "circe.elkyiem" },
      cli,
      { name: "test", uid: 501, gid: 20 },
    );
    const result = JSON.parse(
      execFileSync("/bin/sh", ["-c", command], { encoding: "utf8" }),
    );
    assert.deepEqual(result, {
      args: [
        "proxy",
        "start",
        "--port",
        "443",
        "--https",
        "--tld",
        "elkyiem",
        "--skip-trust",
      ],
      state,
      tld: "elkyiem",
      user: "test",
      uid: "501",
      gid: "20",
    });
  } finally {
    rmSync(temporary, { recursive: true });
  }
});
