import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const appPath = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sandbox = resolve(
  process.env.POND_SANDBOX ??
    join(appPath, "../../.artifacts/iris-web-sandbox"),
);
const origin = process.env.CIRCE_WEB_ORIGIN ?? "http://127.0.0.1:4789";
const evidence = resolve(appPath, "../../.artifacts/web-verification");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const writeJson = (path, value) =>
  writeFile(path, JSON.stringify(value, null, 2), { flag: "wx", mode: 0o600 });
const envelope = (data) => ({ schemaVersion: 1, updatedAt: Date.now(), data });
const directory = join(evidence, `mcp-context-${Date.now()}`);
await mkdir(directory, { recursive: true, mode: 0o700 });
const recordPath = join(directory, "ownership-and-results.json");
const record = {
  checks: [],
  cleanup: { childExited: false, temporarySandboxRemoved: false, errors: [] },
  authority:
    "One temporary authenticated host session, revoked afterward. No token reads or rotations; MCP uses only its owned temporary profile.",
};
const saveRecord = async () => {
  await writeFile(recordPath, JSON.stringify(record, null, 2), { mode: 0o600 });
  await chmod(recordPath, 0o600);
};
await saveRecord();
let cookie;
let activeLibrary;
let temporary;
let owner;
let child;
let childExit;
let failure;
let stdout = "";
let stderr = "";
let framingFailure;
let buffered = "";
let messages = 0;
let nextId = 1;
const pending = new Map();
const protectedFiles = new Map();
const missing = (error) => error instanceof Error && error.code === "ENOENT";
const snapshotFile = async (path) => {
  try {
    return digest(await readFile(path));
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
};
const protect = async (path) =>
  protectedFiles.set(path, await snapshotFile(path));
const request = (path, body, method = "POST") => {
  const headers = { origin, "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  if (activeLibrary) headers["x-iris-library"] = activeLibrary;
  const options = {
    method,
    headers,
    signal: AbortSignal.timeout(15000),
  };
  if (body !== undefined) options.body = JSON.stringify(body);
  return fetch(`${origin}/web/${path}`, options);
};
const query = async (name, params = {}) => {
  const response = await request("query", { name, params });
  assert.equal(response.status, 200, `Host query failed: ${name}`);
  return response.json();
};
const failPending = (error) => {
  framingFailure ??= error;
  for (const entry of pending.values()) {
    clearTimeout(entry.timer);
    entry.reject(error);
  }
  pending.clear();
};
const receive = (line) => {
  try {
    const message = JSON.parse(line);
    assert.equal(message?.jsonrpc, "2.0", "stdout must contain only JSON-RPC.");
    messages++;
    if (message.id === undefined) {
      assert.match(message.method, /^[\w/.-]+$/);
      return;
    }
    const entry = pending.get(message.id);
    assert.ok(entry, "Every response must match an outstanding request.");
    pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.error)
      entry.reject(new Error(`MCP ${entry.method} returned JSON-RPC error.`));
    else entry.resolve(message.result);
  } catch (error) {
    failPending(error);
  }
};
const send = (message) => {
  if (framingFailure) throw framingFailure;
  assert.ok(child && child.exitCode === null && !child.stdin.destroyed);
  child.stdin.write(`${JSON.stringify(message)}\n`);
};
const rpc = (method, params) =>
  new Promise((resolveResponse, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`MCP request timed out: ${method}`));
    }, 20000);
    pending.set(id, { method, timer, resolve: resolveResponse, reject });
    try {
      send({ jsonrpc: "2.0", id, method, params });
    } catch (error) {
      pending.delete(id);
      clearTimeout(timer);
      reject(error);
    }
  });
const tool = async (name, args = {}) => {
  const result = await rpc("tools/call", { name, arguments: args });
  assert.equal(result.isError ?? false, false, `MCP tool failed: ${name}`);
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, "text");
  return JSON.parse(result.content[0].text);
};
const stopChild = async () => {
  if (!child) return;
  child.stdin.end();
  let exit = await Promise.race([childExit, pause(5000).then(() => null)]);
  if (!exit) {
    record.termination = "EOF followed by exact owned PID SIGTERM";
    child.kill("SIGTERM");
    exit = await Promise.race([childExit, pause(5000).then(() => null)]);
  }
  if (!exit) {
    record.termination = "EOF/SIGTERM followed by exact owned PID SIGKILL";
    child.kill("SIGKILL");
    exit = await Promise.race([childExit, pause(5000).then(() => null)]);
  }
  assert.ok(exit, "The exact owned MCP process must settle before cleanup.");
  record.childExit = exit;
  record.cleanup.childExited = true;
};
const deadline = setTimeout(() => {
  failPending(new Error("The finite MCP context smoke budget expired."));
  if (child && child.exitCode === null) child.kill("SIGTERM");
}, 75000);
try {
  // Reading metadata/pointers/settings/keychain bytes for hashes never exports their contents.
  await protect(join(sandbox, "app-data", "library-location.json"));
  await protect(join(sandbox, "app-data", "secrets.json"));
  await protect(join(sandbox, "app-data", "config.json"));
  await protect(join(sandbox, "web-access-key"));
  const accessKey = (
    await readFile(join(sandbox, "web-access-key"), "utf8")
  ).trim();
  const login = await request("session", { key: accessKey });
  assert.equal(login.status, 200);
  activeLibrary = (await login.json()).libraryId;
  cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie, "The host must issue a normal private session.");
  const original = await query("library.info");
  assert.equal(
    (await json(join(original.path, "metadata.json"))).id,
    activeLibrary,
  );
  await protect(join(original.path, "metadata.json"));
  await protect(join(original.path, "settings.json"));
  record.original = {
    libraryId: activeLibrary,
    protectedFileCount: protectedFiles.size,
  };
  const snippet = await query("agent.mcpSnippet");
  const expectedArgs = [
    "-u",
    "ELECTRON_RUN_AS_NODE",
    `POND_SANDBOX=${sandbox}`,
    "CIRCE_WEB=1",
    require("electron"),
    appPath,
    "--mcp",
    "--use-mock-keychain",
  ];
  assert.equal(snippet.command, "/usr/bin/env");
  assert.deepEqual(snippet.args, expectedArgs);
  assert.deepEqual(JSON.parse(snippet.json).mcpServers.pond, {
    command: snippet.command,
    args: snippet.args,
  });
  assert.equal(
    await realpath(snippet.args[4]),
    await realpath(require("electron")),
  );
  record.descriptor = {
    matchesResidentExecutableAppSandboxAndMockMode: true,
    clearsInheritedElectronRunAsNode: true,
    sha256: digest(
      JSON.stringify({ command: snippet.command, args: snippet.args }),
    ),
  };
  record.checks.push("authenticated-resident-launch-context");
  await saveRecord();

  temporary = await mkdtemp(join(tmpdir(), "circe-mcp-context-"));
  const metadata = await lstat(temporary);
  const nonce = randomUUID();
  owner = {
    nonce,
    pid: process.pid,
    device: metadata.dev,
    inode: metadata.ino,
  };
  await writeJson(join(temporary, "mcp-smoke-owner.json"), owner);
  const libraryId = randomBytes(16).toString("hex");
  const folderId = `mcp-${nonce}`;
  const folderName = `MCP portable folder ${nonce}`;
  const library = join(temporary, "home", "Pond", "MCP Context.pond");
  const appData = join(temporary, "app-data");
  await mkdir(join(library, "items"), { recursive: true, mode: 0o700 });
  await mkdir(join(library, "trash"), { mode: 0o700 });
  await mkdir(appData, { mode: 0o700 });
  await writeJson(join(library, "metadata.json"), {
    id: libraryId,
    name: `MCP Context ${nonce}`,
    createdAt: Date.now(),
    schemaVersion: 1,
    appVersion: "2.0.1",
  });
  await writeJson(join(appData, "library-location.json"), {
    path: library,
    updatedAt: Date.now(),
    schemaVersion: 1,
  });
  const ai = {
    semanticSearch: false,
    enableCaption: false,
    enableOcr: false,
    enableTranscript: false,
    enableClip: false,
    enableAesthetic: false,
    enableSensitiveContent: false,
    blurSensitiveThumbnails: false,
    enableAutoTitle: false,
    enableSuggestedTags: false,
    mediaUnderstandingFallbackToFlorence: false,
  };
  await writeJson(join(library, "settings.json"), envelope({ ai }));
  await writeJson(
    join(library, "organization.json"),
    envelope({
      folders: [
        {
          id: folderId,
          parent_id: null,
          name: folderName,
          color: null,
          sort_order: 0,
          created_at: Date.now(),
        },
      ],
      folderMetadata: [],
      views: [],
    }),
  );
  record.owned = {
    ...owner,
    sandbox: temporary,
    libraryId,
    folderId,
    folderName,
  };
  await saveRecord();
  const args = snippet.args.map((arg) =>
    arg === `POND_SANDBOX=${sandbox}` ? `POND_SANDBOX=${temporary}` : arg,
  );
  assert.equal(
    args.filter((arg, index) => arg !== snippet.args[index]).length,
    1,
  );
  child = spawn(snippet.command, args, {
    cwd: appPath,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  record.childPid = child.pid;
  childExit = new Promise((resolveExit) => {
    child.once("error", (error) => {
      failPending(error);
      resolveExit({ error: error.message });
    });
    child.once("close", (code, signal) => {
      if (buffered.trim()) receive(buffered);
      buffered = "";
      if (pending.size)
        failPending(new Error("MCP exited with requests outstanding."));
      resolveExit({ code, signal });
    });
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    if (stdout.length > 4 * 1024 * 1024) {
      failPending(new Error("MCP stdout exceeded the finite smoke allowance."));
      child.kill("SIGTERM");
      return;
    }
    buffered += chunk;
    let newline = buffered.indexOf("\n");
    while (newline !== -1) {
      const line = buffered.slice(0, newline).trim();
      buffered = buffered.slice(newline + 1);
      if (line) receive(line);
      newline = buffered.indexOf("\n");
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  await saveRecord();
  const initialized = await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "circe-mcp-context-smoke", version: "1.0.0" },
  });
  assert.equal(initialized.serverInfo.name, "pond");
  assert.match(initialized.protocolVersion, /^\d{4}-\d{2}-\d{2}$/);
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  const tools = await rpc("tools/list", {});
  const names = tools.tools.map((entry) => entry.name);
  assert.ok(names.includes("query_library"));
  assert.ok(names.includes("list_folders"));
  record.checks.push(
    "clean-stdio-initialize-tools-list-with-inherited-node-mode",
  );
  const page = await tool("query_library", { libraryId, limit: 10 });
  assert.equal(page.libraryId, libraryId);
  assert.deepEqual(page.ids, []);
  assert.equal(page.total, 0);
  const folders = await tool("list_folders");
  assert.deepEqual(folders, {
    folders: [{ id: folderId, name: folderName, parentId: null }],
  });
  const indexes = await readdir(join(appData, "indexes"));
  assert.deepEqual(
    indexes.filter((file) => file.endsWith(".db")),
    [`${libraryId}.db`],
  );
  assert.equal(
    (await lstat(join(appData, "indexes", `${libraryId}.db`))).isFile(),
    true,
  );
  assert.equal((await json(join(library, "metadata.json"))).id, libraryId);
  assert.equal(
    (await json(join(appData, "library-location.json"))).path,
    library,
  );
  assert.deepEqual((await json(join(library, "settings.json"))).data.ai, ai);
  record.protocol = {
    version: initialized.protocolVersion,
    tools: names,
    queryLibraryId: page.libraryId,
    queryTotal: page.total,
    portableFolder: folders.folders[0],
    nativeIndexFile: `${libraryId}.db`,
    mcpSearchEnabled:
      "Native default enabled; real query and folder tools succeeded.",
  };
  record.checks.push("nonce-library-portable-folder-and-native-index");
  await saveRecord();
} catch (error) {
  failure = error;
  record.failure = { message: error.message, stack: error.stack };
} finally {
  clearTimeout(deadline);
  try {
    await stopChild();
    assert.ifError(framingFailure);
    assert.equal(pending.size, 0);
    record.stdout = {
      messages,
      bytes: Buffer.byteLength(stdout),
      sha256: digest(stdout),
      cleanJsonRpc: true,
    };
    record.stderr = {
      bytes: Buffer.byteLength(stderr),
      sha256: digest(stderr),
    };
  } catch (error) {
    record.cleanup.errors.push(`MCP process/protocol: ${error.message}`);
  }
  try {
    for (const [path, before] of protectedFiles)
      assert.equal(
        await snapshotFile(path),
        before,
        "The original profile/Library file changed.",
      );
    record.cleanup.originalProtectedFilesUnchanged = true;
  } catch (error) {
    record.cleanup.errors.push(`Original profile: ${error.message}`);
  }
  try {
    if (cookie) {
      const logout = await request("session", undefined, "DELETE");
      assert.equal(logout.status, 200);
      const revoked = await request("session", undefined, "GET");
      assert.equal(revoked.status, 401);
      record.cleanup.temporaryHostSessionRevoked = true;
    }
  } catch (error) {
    record.cleanup.errors.push(`Temporary host session: ${error.message}`);
  }
  try {
    if (temporary) {
      assert.ok(
        !child || record.cleanup.childExited,
        "Never remove an active process's profile.",
      );
      const current = await lstat(temporary);
      assert.equal(current.isSymbolicLink(), false);
      assert.equal(current.dev, owner.device);
      assert.equal(current.ino, owner.inode);
      assert.deepEqual(
        await json(join(temporary, "mcp-smoke-owner.json")),
        owner,
      );
      await rm(temporary, { recursive: true, force: true });
      record.cleanup.temporarySandboxRemoved = true;
    }
  } catch (error) {
    record.cleanup.errors.push(`Owned sandbox cleanup: ${error.message}`);
  }
  await saveRecord();
}
assert.deepEqual(record.cleanup.errors, []);
if (failure) throw failure;
console.log(
  "MCP_CONTEXT_PASSED",
  JSON.stringify({ record: recordPath, checks: record.checks }),
);
