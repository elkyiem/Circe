const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { createServer } = require("node:net");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { app } = require("electron");

const sandbox = mkdtempSync(join(tmpdir(), "circe-network-smoke-"));
const image = join(sandbox, "network.png");
writeFileSync(
  image,
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
);
process.env.POND_SANDBOX = sandbox;
process.env.CIRCE_WEB = "1";
process.env.CIRCE_WEB_FIXTURES = "0";
app.commandLine.appendSwitch("use-mock-keychain");
process.once("exit", () => {
  try {
    rmSync(sandbox, { recursive: true, force: true, maxRetries: 5 });
  } catch {
    // Windows can retain the temporary Library's open files until process exit.
  }
});
const timer = setTimeout(() => {
  console.error("WEB_NETWORK_FAILED: renderer did not become ready");
  app.exit(1);
}, 30_000);
let checked = false;
app.on("web-contents-created", (_, contents) => {
  contents.on("did-finish-load", async () => {
    if (checked || !contents.getURL().includes("index.html")) return;
    checked = true;
    try {
      assert.equal(app.getName(), "Circé");
      const result = await contents.executeJavaScript(`(async () => {
        const created = await window.pond.query("saves.createManual", { title: "Network smoke", filePaths: [${JSON.stringify(image)}] });
        if (!created.ok) throw new Error("Could not create the isolated media fixture.");
        const save = await window.pond.query("saves.get", { id: created.id });
        const file = save.files.find(file => file.mimeType?.startsWith("image/"));
        if (!file) throw new Error("The media fixture has no image.");
        const response = await fetch('pond://' + save.id + '/' + file.path);
        return { agent: navigator.userAgent, status: response.status, bytes: (await response.arrayBuffer()).byteLength };
      })()`);
      assert.match(result.agent, /Circe\//);
      assert.doesNotMatch(result.agent, /[^\x20-\x7e]/);
      assert.equal(result.status, 200);
      assert.ok(result.bytes > 0);
      clearTimeout(timer);
      console.log(
        "WEB_NETWORK_PASSED: Circé keeps its display name and fetches protocol media with ASCII headers",
      );
      app.exit(0);
    } catch (error) {
      clearTimeout(timer);
      console.error("WEB_NETWORK_FAILED", error.message);
      app.exit(1);
    }
  });
});

const listener = createServer();
listener.listen(0, "127.0.0.1", () => {
  process.env.CIRCE_WEB_PORT = String(listener.address().port);
  listener.close(() => {
    import("../out/main/index.js").catch((error) => {
      clearTimeout(timer);
      console.error("WEB_NETWORK_FAILED", error.message);
      app.exit(1);
    });
  });
});
