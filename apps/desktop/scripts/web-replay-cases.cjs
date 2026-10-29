const assert = require("node:assert/strict");
const { createHash, randomUUID } = require("node:crypto");
const { lookup } = require("node:dns/promises");
const {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const { isIP } = require("node:net");
const { homedir } = require("node:os");
const { basename, join, relative, sep } = require("node:path");
const { setTimeout: pause } = require("node:timers/promises");
const { gunzipSync, gzipSync } = require("node:zlib");
const { app } = require("electron");
const sharp = require("sharp");

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const frames = (frame) => [frame, ...frame.frames.flatMap(frames)];
const quote = (value) => JSON.stringify(value).replaceAll("<", "\\u003c");
const archiveRoot = "[data-browser-archive]";
const archiveIframe = `${archiveRoot} iframe[title="Archived page"]`;
const archiveHud =
  '[data-viewer-root]:has([data-browser-archive]) [aria-label="Web archive"]';
const credentialCanaries = [
  "CIRCE_REPLAY_FAKE_HTTPONLY_RESPONSE_COOKIE",
  "CIRCE_REPLAY_FAKE_SET_COOKIE2",
  "CIRCE_REPLAY_FAKE_REQUEST_COOKIE",
  "CIRCE_REPLAY_FAKE_REQUEST_AUTHORIZATION",
  "CIRCE_REPLAY_FAKE_PROXY_AUTHORIZATION",
];

function warcRecord(url, type, value, headers = "") {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const payload = Buffer.concat([
    Buffer.from(
      `HTTP/1.1 200 OK\r\nContent-Type: ${type}\r\n${headers}Content-Length: ${bytes.length}\r\n\r\n`,
    ),
    bytes,
  ]);
  return Buffer.concat([
    Buffer.from(
      `WARC/1.0\r\nWARC-Type: response\r\nWARC-Target-URI: ${url}\r\nWARC-Date: 2026-10-29T09:00:00Z\r\nWARC-Record-ID: <urn:uuid:${randomUUID()}>\r\nContent-Type: application/http; msgtype=response\r\nContent-Length: ${payload.length}\r\n\r\n`,
    ),
    payload,
    Buffer.from("\r\n\r\n"),
  ]);
}

function credentialRequestRecord(url) {
  const request = Buffer.from(
    `GET ${new URL(url).pathname} HTTP/1.1\r\nHost: circe-replay-fixture.invalid\r\nCookie: source_session=${credentialCanaries[2]}\r\nAuthorization: Bearer ${credentialCanaries[3]}\r\nProxy-Authorization: Basic ${credentialCanaries[4]}\r\nContent-Length: 0\r\n\r\n`,
  );
  return Buffer.concat([
    Buffer.from(
      `WARC/1.0\r\nWARC-Type: request\r\nWARC-Target-URI: ${url}\r\nWARC-Date: 2026-10-29T09:00:00Z\r\nWARC-Record-ID: <urn:uuid:${randomUUID()}>\r\nContent-Type: application/http; msgtype=request\r\nContent-Length: ${request.length}\r\n\r\n`,
    ),
    request,
    Buffer.from("\r\n\r\n"),
  ]);
}

function hostileScript(collector, worker = false) {
  return `async function attacks(){
    const result={fetch:'pending',xhr:'unavailable',beacon:'unavailable',ws:'pending'};
    result.fetch=await fetch(${quote(`${collector}/${worker ? "worker" : "page"}-fetch`)}).then(()=> 'escaped',error=>error.name);
    if(typeof XMLHttpRequest!=='undefined')result.xhr=await new Promise(resolve=>{try{const xhr=new XMLHttpRequest();xhr.open('GET',${quote(`${collector}/${worker ? "worker" : "page"}-xhr`)});xhr.onload=()=>resolve('escaped');xhr.onerror=()=>resolve('blocked');xhr.timeout=2000;xhr.ontimeout=()=>resolve('timeout');xhr.send()}catch(error){resolve(error.name)}});
    if(typeof navigator.sendBeacon==='function'){try{result.beacon=navigator.sendBeacon(${quote(`${collector}/page-beacon`)},'OWNED_FIXTURE_BYTES')}catch(error){result.beacon=error.name}}
    result.ws=await new Promise(resolve=>{try{const socket=new WebSocket(${quote(`${collector.replace("http:", "ws:")}/${worker ? "worker" : "page"}-ws`)});socket.onopen=()=>{socket.close();resolve('escaped')};socket.onerror=()=>resolve('blocked');setTimeout(()=>{socket.close();resolve('timeout')},2000)}catch(error){resolve(error.name)}});
    return result;
  }`;
}

function archiveFixture({ label, collector, gif, revision = 1 }) {
  const base = `https://circe-replay-fixture.invalid/${label}/`;
  const page = `<!doctype html><html><head><title>Owned replay ${label}</title><link rel="stylesheet" href="style.css"></head><body><h1 id="replay-title">Owned replay ${label} revision ${revision}</h1><img id="animation" src="animation.gif" alt="Animated red and blue fixture"><button id="counter">Count: 0</button><a id="next" href="next.html">Internal archived page</a><a id="outside" href="${collector}/external-click" target="_blank">External fixture page</a><iframe src="nested.html" title="Nested archive fixture"></iframe><script src="app.js"></script></body></html>`;
  const script =
    "window.__replayScript=true;let count=0;document.getElementById('counter').onclick=()=>document.getElementById('counter').textContent='Count: '+(++count);const worker=new Worker('worker.js');worker.onmessage=event=>window.__replayWorker=event.data;";
  const hostile = `<!doctype html><html><body><h1 id="hostile-title">Raw owned hostile archive</h1><script>
    window.__replayViolations=[];addEventListener('securitypolicyviolation',event=>__replayViolations.push({directive:event.effectiveDirective,blocked:event.blockedURI}));
    ${hostileScript(collector)};attacks().then(result=>window.__replayAttacks=result,error=>window.__replayAttackError=error.message);
    try{window.__appRead=top.document.documentElement.dataset.runtime}catch(error){window.__appRead=error.name}
    const collection=location.pathname.split('/')[3];const worker=new Worker(location.origin+'/replay/w/'+collection+'/id_/'+${quote(`${base}hostile-worker.js`)});worker.onmessage=event=>window.__replayWorkerAttacks=event.data;worker.onerror=event=>window.__replayWorkerError=event.message;
    top.postMessage({type:'circe-replay:external',generation:'00000000-0000-4000-8000-000000000001',url:${quote(`${collector}/forged-inner`)}},'*');
    try{window.__automaticPopup=Boolean(open(${quote(`${collector}/automatic-popup`)},'_blank'))}catch(error){window.__automaticPopup=error.name}
    try{top.location.href=${quote(`${collector}/top-navigation`)}}catch(error){window.__topNavigation=error.name}
  </script></body></html>`;
  const records = [
    ["index.html", "text/html", page],
    [
      "next.html",
      "text/html",
      '<!doctype html><h1 id="next-page">Internal navigation worked</h1><a id="home" href="index.html">Back to archived home</a>',
    ],
    [
      "nested.html",
      "text/html",
      '<!doctype html><span id="nested-page">Nested archived frame</span><script>window.__nestedReplay=true</script>',
    ],
    [
      "style.css",
      "text/css",
      "#replay-title{color:rgb(19,83,151)}body{font-family:sans-serif}img{width:32px;height:32px}iframe{height:70px;width:180px}",
    ],
    ["app.js", "application/javascript", script],
    [
      "worker.js",
      "application/javascript",
      "postMessage('owned-archive-worker-ready')",
    ],
    ["animation.gif", "image/gif", gif],
    ["hostile.html", "text/html", hostile],
    [
      "hostile-worker.js",
      "application/javascript",
      `${hostileScript(collector, true)};attacks().then(result=>postMessage(result));`,
    ],
  ];
  const bytes = gzipSync(
    Buffer.concat([
      credentialRequestRecord(`${base}index.html`),
      ...records.map(([name, type, body]) =>
        warcRecord(
          base + name,
          type,
          body,
          name === "index.html"
            ? `Set-Cookie: source_session=${credentialCanaries[0]}; HttpOnly; Secure; Path=/\r\nSet-Cookie2: legacy_session=${credentialCanaries[1]}\r\n`
            : "",
        ),
      ),
    ]),
  );
  const manifest = {
    version: 9,
    rootUrl: `${base}index.html`,
    archivedAt: new Date(Date.UTC(2026, 9, 29, 9, 0, revision)).toISOString(),
    scope: "site",
    pages: [
      { url: `${base}index.html`, title: `Owned ${label} home` },
      { url: `${base}next.html`, title: `Owned ${label} next` },
    ],
  };
  return {
    base,
    bytes,
    manifest,
    manifestBytes: Buffer.from(JSON.stringify(manifest)),
  };
}

/** Finite acceptance against the already-running host; owns only its fixture Saves and replay tickets. */
exports.verifyBrowserReplay = async function verifyBrowserReplay({
  win,
  run,
  click,
  waitFor,
  snapshot,
  query,
  origin,
  evidence,
  sandbox,
}) {
  const started = Date.now();
  const deadline = started + 255000;
  assert.equal(
    new URL(origin).protocol,
    "https:",
    "Production replay acceptance requires real HTTPS.",
  );
  assert.match(
    win.webContents.session.getStoragePath() ?? "",
    /iris-browser-smoke-/,
    "Use the harness disposable profile.",
  );
  const initial = await query("library.info");
  const libraryId = readJson(join(initial.path, "metadata.json")).id;
  const originalViewer = (await query("settings.getPrefs")).viewer;
  const pointers = [
    join(sandbox, "app-data", "library-location.json"),
    join(sandbox, "library-location.json"),
  ]
    .filter(existsSync)
    .map((path) => ({ path, bytes: readFileSync(path, "utf8") }));
  const directory = join(evidence, `replay-${Date.now()}`);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const recordPath = join(directory, "ownership-and-results.json");
  const prefix = `circereplay${randomUUID().replaceAll("-", "")}`;
  const secrets = new Set();
  const tickets = new Map();
  const collectorHits = [];
  const popupWindows = [];
  const capturePopup = (child) => popupWindows.push(child);
  const routeFile = join(
    process.env.PORTLESS_STATE_DIR ?? join(homedir(), ".portless"),
    "routes.json",
  );
  const originalRoutes = readJson(routeFile);
  const resolverRules =
    process.argv
      .find((argument) => argument.startsWith("--host-resolver-rules="))
      ?.slice("--host-resolver-rules=".length) ?? "";
  const mappedReplayAddress = resolverRules.match(
    /(?:^|,)\s*MAP\s+\*\.replay\.elkyiem\s+([^,\s]+)/i,
  )?.[1];
  const record = {
    prefix,
    original: { ...initial, libraryId, viewer: originalViewer },
    fixtures: [],
    tickets: [],
    checks: [],
    dns: [],
    browserResolverRules: resolverRules,
    collector: [],
    cleanup: { completed: false, purged: [], errors: [] },
  };
  const redact = (text) => {
    let result = String(text ?? "");
    for (const secret of secrets)
      result = result.replaceAll(secret, "[REDACTED_REPLAY_CAPABILITY]");
    return result;
  };
  const saveRecord = () => {
    writeFileSync(recordPath, redact(JSON.stringify(record, null, 2)), {
      mode: 0o600,
    });
    chmodSync(recordPath, 0o600);
  };
  const checked = (name, detail = true) => {
    record.checks.push({ name, passed: true, detail });
    saveRecord();
  };
  saveRecord();
  assert.equal(statSync(recordPath).mode & 0o777, 0o600);
  const waitUntil = async (probe, label, timeout = 20000) => {
    const end = Math.min(deadline, Date.now() + timeout);
    let cause;
    while (Date.now() < end) {
      try {
        const value = await probe();
        if (value) return value;
      } catch (error) {
        cause = error;
      }
      await pause(100);
    }
    throw new Error(`Replay acceptance timed out: ${label}`, { cause });
  };
  const headers = async () => {
    const cookies = await win.webContents.session.cookies.get({
      url: origin,
      name: "iris_session",
    });
    assert.equal(cookies.length, 1);
    return {
      cookie: `iris_session=${cookies[0].value}`,
      origin,
      "x-iris-library": libraryId,
    };
  };
  const request = async (path, options = {}) => {
    const response = await fetch(`${origin}${path}`, {
      ...options,
      headers: { ...(await headers()), ...options.headers },
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(
      response.status,
      200,
      `Replay fixture request failed: ${path} (${response.status}).`,
    );
    return response;
  };
  const jsonRequest = async (path, value) =>
    (
      await request(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(value),
      })
    ).json();
  const filesRequest = (name, params) =>
    jsonRequest("/web/files", { name, params });
  const ownRoutes = () =>
    readJson(routeFile).filter((route) =>
      [...tickets.values()].some(
        (ticket) => new URL(ticket.origin).hostname === route.hostname,
      ),
    );
  const assertOwned = async (fixture) => {
    const save = await query("saves.get", { id: fixture.id });
    assert.equal(save?.id, fixture.id);
    assert.equal(save.title, fixture.title);
    assert.equal(save.source, "local");
    assert.equal(save.sourceId, fixture.sourceId);
    return save;
  };
  const safeItem = async (fixture) => {
    await assertOwned(fixture);
    const path = join(initial.path, "items", `${fixture.id}.info`);
    assert.equal(lstatSync(path).isSymbolicLink(), false);
    const inside = relative(realpathSync(initial.path), realpathSync(path));
    assert(inside && !inside.startsWith(`..${sep}`) && !inside.startsWith(sep));
    return path;
  };
  const addTicket = (ticket, saveId) => {
    assert.match(
      new URL(ticket.origin).hostname,
      /^r-[a-f0-9]{36}\.replay\.elkyiem$/,
    );
    assert.equal(new URL(ticket.origin).protocol, "https:");
    assert.equal(new URL(ticket.url).origin, ticket.origin);
    tickets.set(ticket.id, ticket);
    if (!record.tickets.some((value) => value.id === ticket.id)) {
      record.tickets.push({ ...ticket, saveId });
      saveRecord();
    }
    return ticket;
  };
  const allFrames = () => frames(win.webContents.mainFrame);
  const outer = (ticket) =>
    allFrames().find(
      (frame) => frame.url.split(/[?#]/)[0] === `${ticket.origin}/viewer`,
    );
  const controlled = (ticket) =>
    allFrames().find((frame) =>
      frame.url.startsWith(`${ticket.origin}/replay/?`),
    );
  const leaf = (ticket, name) =>
    allFrames().find(
      (frame) =>
        (frame.url.startsWith(`${ticket.origin}/replay/w/`) &&
          frame.url.split(/[?#]/)[0].endsWith(name)) ||
        (name === "hostile.html" &&
          frame.name === "owned-hostile-replay" &&
          frame.parent?.url.startsWith(`${ticket.origin}/viewer`)),
    );
  const previewPin = async (ticket) => {
    const pin = await outer(ticket).executeJavaScript(
      "window.__CIRCE_REPLAY_PIN",
    );
    assert(pin?.collection && pin.source && pin.authorization);
    assert.equal(new URL(pin.source).origin, ticket.origin);
    secrets.add(pin.authorization);
    secrets.add(pin.authorization.replace(/^Bearer /, ""));
    return pin;
  };
  const pinFromBootstrap = (bytes) => {
    const html = bytes.toString();
    for (const match of html.matchAll(/Bearer [A-Za-z0-9_-]{43}/g)) {
      secrets.add(match[0]);
      secrets.add(match[0].slice("Bearer ".length));
    }
    const match = html.match(/__CIRCE_REPLAY_PIN\s*=\s*(\{[^\n]*\})\s*;/);
    assert(match, "Bootstrap must expose its deliberate archive-only pin.");
    return JSON.parse(match[1]);
  };
  const ticketApi = async (ticket, path, method = "GET", body) =>
    controlled(ticket).executeJavaScript(
      `fetch('/replay/w/api/'+${quote(path)},{method:${quote(method)},headers:{'Content-Type':'application/json'},body:${body === undefined ? "undefined" : quote(JSON.stringify(body))}}).then(async response=>({status:response.status,text:await response.text()}))`,
    );
  const sourceRequest = async (url, authorization, options = {}) =>
    new Promise((resolveRequest, reject) => {
      const target = new URL(url);
      const requestHeaders = { ...options.headers };
      if (authorization) requestHeaders.Authorization = authorization;
      const configuration = {
        method: options.method ?? "GET",
        headers: requestHeaders,
      };
      if (options.address) {
        // A pooled socket for this hostname may already point at the OS-local
        // address. A routing assertion needs a fresh TLS connection.
        configuration.agent = false;
        configuration.autoSelectFamily = false;
        configuration.lookup = (_hostname, _options, callback) =>
          callback(null, options.address.address, options.address.family);
      }
      const req = https.request(target, configuration, (response) => {
        const chunks = [];
        const tls = {
          authorized: response.socket.authorized,
          servername: target.hostname,
          remoteAddress: response.socket.remoteAddress,
        };
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () =>
          resolveRequest({
            status: response.statusCode,
            headers: response.headers,
            bytes: Buffer.concat(chunks),
            tls,
          }),
        );
      });
      req.setTimeout(6000, () =>
        req.destroy(new Error("Replay source request timeout")),
      );
      req.on("error", reject);
      req.end();
    });
  const selectText = async (selector, text) => {
    const marker = `replay-${randomUUID()}`;
    const found = await run(
      `(()=>{const target=Array.from(document.querySelectorAll(${quote(selector)})).find(node=>node.getBoundingClientRect().width>0&&node.textContent.trim()===${quote(text)});if(!target)return false;target.setAttribute('data-replay-test',${quote(marker)});return true})()`,
    );
    assert(found, `Rendered control is missing: ${text}`);
    await click(`[data-replay-test="${marker}"]`);
  };
  const focus = async () => {
    app.focus({ steal: true });
    win.focus();
    win.webContents.focus();
    await waitFor("document.hasFocus()");
  };
  const pressEscape = async () => {
    await focus();
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  };
  const openSave = async (fixture) => {
    await assertOwned(fixture);
    await win.loadURL(origin);
    await waitFor('document.querySelector("[data-library-search]")');
    await click("[data-library-search]");
    win.webContents.sendInputEvent({
      type: "keyDown",
      keyCode: "A",
      modifiers: ["meta"],
    });
    win.webContents.sendInputEvent({
      type: "keyUp",
      keyCode: "A",
      modifiers: ["meta"],
    });
    await win.webContents.insertText(prefix);
    await waitFor(
      `document.querySelector('[data-save-id="${fixture.id}"] [role="option"]')`,
    );
    await click(`[data-save-id="${fixture.id}"] [role="option"]`, 2);
    await waitFor(`Boolean(document.querySelector(${quote(archiveIframe)}))`);
    const url = await run(
      `document.querySelector(${quote(archiveIframe)}).src`,
    );
    const ticket = await waitUntil(
      () =>
        record.tickets.find(
          (value) => value.saveId === fixture.id && value.url === url,
        ),
      "UI-issued replay ticket captured",
    );
    return tickets.get(ticket.id);
  };
  const pointInLeaf = async (ticket, frame, selector) => {
    const point = await frame.executeJavaScript(
      `(()=>{const node=document.querySelector(${quote(selector)});if(!node)throw new Error('Archived control missing');node.scrollIntoView({block:'nearest'});const rect=node.getBoundingClientRect();const hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);if(!hit||!node.contains(hit))throw new Error('Archived control is occluded');return{x:rect.x+rect.width/2,y:rect.y+rect.height/2}})()`,
    );
    const chain = [];
    // Wombat deliberately rewrites window.parent/top. Traverse Electron's real
    // frame tree and the owning open shadow roots rather than those proxies.
    for (let child = frame; child.parent; child = child.parent) {
      const box = await child.parent.executeJavaScript(
        `(()=>{const candidates=[];const find=root=>{for(const node of root.querySelectorAll('*')){if(node.tagName==='IFRAME'){let current='';try{current=node.contentWindow.location.href}catch{}if(node.src===${quote(child.url)}||current===${quote(child.url)})return node;candidates.push(new URL(node.src,location.href).pathname)}if(node.shadowRoot){const found=find(node.shadowRoot);if(found)return found}}return null};const node=find(document);if(!node)throw new Error('Owning replay iframe was not found for '+${quote(new URL(child.url).pathname)}+'; candidates: '+candidates.join(','));const rect=node.getBoundingClientRect();return{x:rect.x+node.clientLeft,y:rect.y+node.clientTop,width:rect.width,height:rect.height}})()`,
      );
      point.x += box.x;
      point.y += box.y;
      chain.push({ path: new URL(child.url).pathname, box });
    }
    record.lastPointer = {
      selector,
      point,
      chain,
      zoom: win.webContents.getZoomFactor(),
      origin: ticket.origin,
    };
    record.lastPointer.mainHit = await run(
      `(()=>{const node=document.elementFromPoint(${point.x},${point.y});return {tag:node?.tagName,label:node?.getAttribute('aria-label'),className:node?.className,iframe:node?.tagName==='IFRAME',pointerEvents:node?getComputedStyle(node).pointerEvents:null}})()`,
    );
    saveRecord();
    return point;
  };
  const clickLeaf = async (ticket, name, selector) => {
    await focus();
    const frame = leaf(ticket, name);
    assert(frame);
    const point = await pointInLeaf(ticket, frame, selector);
    await debuggerApi.sendCommand("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      ...point,
    });
    await debuggerApi.sendCommand("Input.dispatchMouseEvent", {
      type: "mousePressed",
      button: "left",
      clickCount: 1,
      ...point,
    });
    await debuggerApi.sendCommand("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      button: "left",
      clickCount: 1,
      ...point,
    });
  };
  const getRow = async (ticket, collection) =>
    outer(ticket).executeJavaScript(
      `new Promise((resolve,reject)=>{const request=indexedDB.open('collDB',3);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result;const tx=db.transaction('colls','readonly');const read=tx.objectStore('colls').get(${quote(collection)});read.onsuccess=()=>resolve(read.result);tx.oncomplete=()=>db.close();tx.onerror=()=>reject(tx.error)}})`,
    );
  const putRow = async (ticket, value) =>
    outer(ticket).executeJavaScript(
      `new Promise((resolve,reject)=>{const request=indexedDB.open('collDB',3);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result;const tx=db.transaction('colls','readwrite');tx.objectStore('colls').put(${quote(value)});tx.oncomplete=()=>{db.close();resolve(true)};tx.onerror=()=>reject(tx.error)}})`,
    );
  const rescan = async () => {
    const result = await query("library.rescan", {});
    assert(result !== null);
  };
  let collector, collectorOrigin, gif, failure, originalPopupHandler;
  let allowHandoff = false;
  const debuggerApi = win.webContents.debugger;
  assert.equal(
    debuggerApi.isAttached(),
    false,
    "Release the previous UI probe first.",
  );
  const requestIds = new Map();
  const network = (_event, method, data) => {
    if (
      method === "Network.requestWillBeSent" &&
      data.request.url === `${origin}/web/replay` &&
      data.request.postData
    ) {
      const input = JSON.parse(data.request.postData);
      if (input.action === "open") requestIds.set(data.requestId, input.saveId);
    }
    if (
      method === "Network.loadingFinished" &&
      requestIds.has(data.requestId)
    ) {
      const saveId = requestIds.get(data.requestId);
      requestIds.delete(data.requestId);
      void debuggerApi
        .sendCommand("Network.getResponseBody", { requestId: data.requestId })
        .then((value) => {
          const parsed = JSON.parse(
            value.base64Encoded
              ? Buffer.from(value.body, "base64").toString()
              : value.body,
          );
          if (parsed.id && parsed.origin) addTicket(parsed, saveId);
        })
        .catch(() => {});
    }
  };
  const createSave = async (label) => {
    const fixture = {
      label,
      title: `${prefix} ${label}`,
      tokens: [],
      removedTokens: [],
    };
    record.fixtures.push(fixture);
    saveRecord();
    const built = archiveFixture({ label, collector: collectorOrigin, gif });
    fixture.nativeArchiveSha256 = sha256(built.bytes);
    const png = await sharp({
      create: { width: 32, height: 32, channels: 3, background: "#2c659a" },
    })
      .png()
      .toBuffer();
    for (const [filename, bytes] of [
      ["owned-cover.png", png],
      ["archive.warc.gz", built.bytes],
      ["archive-manifest.json", built.manifestBytes],
    ]) {
      const upload = await (
        await request("/web/upload", {
          method: "PUT",
          headers: {
            "content-type": "application/octet-stream",
            "x-iris-filename": encodeURIComponent(filename),
          },
          body: bytes,
        })
      ).json();
      fixture.tokens.push(upload.token);
      fixture.sourceId = `web-upload:${fixture.tokens[0].slice("iris-upload:".length)}`;
      saveRecord();
    }
    const created = await filesRequest("saves.createManual", {
      title: fixture.title,
      filePaths: fixture.tokens,
    });
    assert.equal(created.ok, true);
    fixture.id = created.id;
    saveRecord();
    await assertOwned(fixture);
    const item = await safeItem(fixture);
    const info = readJson(join(item, "info.json"));
    assert.equal(lstatSync(join(item, "info.json")).isSymbolicLink(), false);
    assert.equal(info.id, fixture.id);
    assert.equal(info.name ?? info.title, fixture.title);
    for (const [name, kind, mimeType] of [
      ["archive.warc.gz", "archive", "application/warc"],
      ["archive-manifest.json", "archive_manifest", "application/json"],
    ]) {
      const file = info.files.find((value) => basename(value.path) === name);
      assert(file, `Uploaded archive member missing: ${name}`);
      file.kind = kind;
      file.mimeType = mimeType;
    }
    writeFileSync(join(item, "info.json"), JSON.stringify(info, null, 2));
    fixture.base = built.base;
    fixture.archiveFile = info.files.find(
      (value) => value.kind === "archive",
    ).path;
    fixture.manifestFile = info.files.find(
      (value) => value.kind === "archive_manifest",
    ).path;
    saveRecord();
    for (const token of fixture.tokens) {
      await request(`/web/upload/${encodeURIComponent(token)}`, {
        method: "DELETE",
      });
      fixture.removedTokens.push(token);
      saveRecord();
    }
    return fixture;
  };
  try {
    collector = http.createServer((req, response) => {
      collectorHits.push({ method: req.method, path: req.url });
      record.collector = collectorHits;
      saveRecord();
      response.writeHead(200, {
        "Content-Type": "text/html",
        "Cache-Control": "no-store",
      });
      response.end(
        "<!doctype html><title>Deliberate replay handoff</title>Only a trusted parent click should reach this collector.",
      );
    });
    collector.on("upgrade", (req, socket) => {
      collectorHits.push({ method: "UPGRADE", path: req.url });
      socket.destroy();
    });
    await new Promise((resolveListen) =>
      collector.listen(0, "127.0.0.1", resolveListen),
    );
    collectorOrigin = `http://127.0.0.1:${collector.address().port}`;
    const pixels = Buffer.alloc(16 * 16 * 2 * 3);
    for (let index = 0; index < 512; index++)
      pixels[index * 3 + (index < 256 ? 0 : 2)] = 255;
    gif = await sharp(pixels, {
      raw: { width: 16, height: 32, channels: 3, pageHeight: 16 },
    })
      .gif({ delay: [350, 350], loop: 0 })
      .toBuffer();
    debuggerApi.attach("1.3");
    await debuggerApi.sendCommand("Network.enable");
    await debuggerApi.sendCommand("ServiceWorker.enable");
    debuggerApi.on("message", network);
    win.webContents.setWindowOpenHandler((details) => {
      record.unexpectedPopup = details.url;
      return { action: "deny" };
    });
    originalPopupHandler = true;
    win.webContents.on("did-create-window", capturePopup);
    await run(
      `window.pond.query('settings.setPrefs',{viewer:{doubleClickAction:'open'}})`,
    );
    const first = await createSave("a");
    const second = await createSave("b");
    await rescan();
    for (const fixture of record.fixtures)
      await waitUntil(async () => {
        const save = await assertOwned(fixture);
        return (
          save.files.some((file) => file.kind === "archive") &&
          save.files.some((file) => file.kind === "archive_manifest")
        );
      }, "real Rescan hydrates native archive file kinds");
    checked("Two owned native archive fixtures hydrated through real Rescan");
    const firstTicket = await openSave(first);
    const hostname = new URL(firstTicket.origin).hostname;
    const address = await Promise.race([
      lookup(hostname, { all: true }),
      pause(5000).then(() => {
        throw new Error("Mac OS replay DNS lookup exceeded five seconds.");
      }),
    ]).catch((error) => {
      record.dns.push({ hostname, error: error.code ?? error.message });
      saveRecord();
      throw error;
    });
    assert(address.length > 0);
    record.dns.push({
      hostname: new URL(firstTicket.origin).hostname,
      addresses: address,
      method: "Node OS dns.lookup, independent of Chromium resolver flags",
    });
    saveRecord();
    checked(
      "New random replay hostname resolves through the Mac OS resolver",
      address,
    );
    assert(
      ownRoutes().some(
        (route) => route.hostname === new URL(firstTicket.origin).hostname,
      ),
    );
    checked("Production ticket registered its exact owned Portless hostname");
    const firstPin = await waitUntil(
      () => previewPin(firstTicket),
      "production replay bootstrap and pinned capability",
    );
    const source = await sourceRequest(firstPin.source, firstPin.authorization);
    assert.equal(source.status, 200);
    assert.equal(source.tls.authorized, true);
    const nativeArchive = readFileSync(
      join(await safeItem(first), first.archiveFile),
    );
    assert.equal(sha256(nativeArchive), first.nativeArchiveSha256);
    const nativeRecords = gunzipSync(nativeArchive).toString();
    const safeRecords = gunzipSync(source.bytes).toString();
    for (const canary of credentialCanaries) {
      assert(nativeRecords.includes(canary));
      assert.equal(safeRecords.includes(canary), false);
    }
    assert(safeRecords.includes("Owned replay a revision 1"));
    assert.notEqual(sha256(source.bytes), first.nativeArchiveSha256);
    checked(
      "Real HTTPS replay derivative strips captured HttpOnly cookies and request credentials while preserving native WARC bytes",
    );
    if (mappedReplayAddress) {
      const family = isIP(mappedReplayAddress);
      assert(family === 4 || family === 6);
      const tailnet = await sourceRequest(
        firstPin.source,
        firstPin.authorization,
        {
          address: { address: mappedReplayAddress, family },
        },
      );
      assert.equal(tailnet.status, 200);
      assert.equal(tailnet.tls.authorized, true);
      assert.equal(
        tailnet.tls.remoteAddress?.replace(/^::ffff:/, ""),
        mappedReplayAddress,
      );
      assert.equal(sha256(tailnet.bytes), sha256(source.bytes));
      checked(
        "Archive HTTPS source reaches the mapped Tailnet IP with exact Host SNI and certificate verification",
        {
          servername: tailnet.tls.servername,
          remoteAddress: tailnet.tls.remoteAddress,
        },
      );
    }
    const head = await sourceRequest(firstPin.source, firstPin.authorization, {
      method: "HEAD",
    });
    assert.equal(head.status, 200);
    assert.equal(Number(head.headers["content-length"]), source.bytes.length);
    const partial = await sourceRequest(
      firstPin.source,
      firstPin.authorization,
      {
        headers: { Range: "bytes=0-15" },
      },
    );
    assert.equal(partial.status, 206);
    assert.deepEqual(partial.bytes, source.bytes.subarray(0, 16));
    assert.equal(
      (await sourceRequest(firstPin.source, undefined, { method: "HEAD" }))
        .status,
      403,
    );
    checked("Replay GET HEAD and Range require the exact narrow grant");
    assert.equal(
      (await sourceRequest(`${firstTicket.origin}/web/capabilities`)).status,
      404,
    );
    assert.equal((await sourceRequest(firstPin.source)).status, 403);
    const cookieNames = (
      await win.webContents.session.cookies.get({ url: firstTicket.origin })
    ).map((cookie) => cookie.name);
    assert(!cookieNames.includes("iris_session"));
    checked(
      "Replay origin cannot serve app endpoints or inherit the private app cookie",
      cookieNames,
    );
    const unknownHost = await sourceRequest(
      `${firstTicket.origin}/viewer`,
      undefined,
      {
        headers: { Host: `unknown-${randomUUID()}.replay.elkyiem` },
        address: address[0],
      },
    );
    assert([403, 404, 421].includes(unknownHost.status));
    checked("Unknown Host cannot borrow a known TLS replay origin");
    await waitUntil(async () => {
      const frame = leaf(firstTicket, "index.html");
      return frame?.executeJavaScript(
        "window.__replayScript&&window.__replayWorker==='owned-archive-worker-ready'&&document.getElementById('animation').naturalWidth===16",
      );
    }, "actual cold archived HTML CSS JS image and worker");
    assert.equal(
      await leaf(firstTicket, "index.html").executeJavaScript(
        "getComputedStyle(document.getElementById('replay-title')).color",
      ),
      "rgb(19, 83, 151)",
    );
    await clickLeaf(firstTicket, "index.html", "#counter");
    await waitUntil(
      () =>
        leaf(firstTicket, "index.html").executeJavaScript(
          "document.getElementById('counter').textContent==='Count: 1'",
        ),
      "physical archive counter event dispatch",
    );
    assert.equal(
      await leaf(firstTicket, "index.html").executeJavaScript(
        "document.getElementById('counter').textContent",
      ),
      "Count: 1",
    );
    await waitUntil(async () => {
      const nested = leaf(firstTicket, "nested.html");
      return nested?.executeJavaScript(
        "window.__nestedReplay&&Boolean(document.getElementById('nested-page'))",
      );
    }, "nested archive iframe");
    checked(
      "Cold real UI archive preserves CSS JS nested frames worker and physical counter interaction",
    );
    const colors = [];
    const animation = await pointInLeaf(
      firstTicket,
      leaf(firstTicket, "index.html"),
      "#animation",
    );
    for (let index = 0; index < 12; index++) {
      const image = await win.webContents.capturePage({
        x: Math.round(animation.x),
        y: Math.round(animation.y),
        width: 1,
        height: 1,
      });
      colors.push(
        Array.from(await sharp(image.toPNG()).removeAlpha().raw().toBuffer()),
      );
      await pause(90);
    }
    assert(colors.some((color) => color[0] > 200));
    assert(colors.some((color) => color[2] > 200));
    checked("Actual rendered archive GIF alternates red and blue", colors);
    await clickLeaf(firstTicket, "index.html", "#next");
    await waitUntil(
      () => leaf(firstTicket, "next.html"),
      "internal archived link",
    );
    checked(
      "Physical archived internal link navigates without leaving isolated origin",
    );
    await waitFor(
      `document.querySelector(${quote(`${archiveHud} [aria-label="Back"]`)})?.disabled===false`,
    );
    await click(`${archiveHud} [aria-label="Back"]`);
    await waitUntil(
      () => leaf(firstTicket, "index.html"),
      "native shared Back HUD",
    );
    await waitFor(
      `document.querySelector(${quote(`${archiveHud} [aria-label="Forward"]`)})?.disabled===false`,
    );
    await click(`${archiveHud} [aria-label="Forward"]`);
    await waitUntil(
      () => leaf(firstTicket, "next.html"),
      "native shared Forward HUD",
    );
    await click(`${archiveHud} [aria-label="Back"]`);
    await waitUntil(
      () => leaf(firstTicket, "index.html"),
      "return home before reload",
    );
    await outer(firstTicket).executeJavaScript(
      "window.__replayAcceptanceOldDocument=true",
    );
    await click(`${archiveHud} [aria-label="Reload"]`);
    await waitUntil(async () => {
      const bootstrap = outer(firstTicket);
      if (
        !bootstrap ||
        !(await bootstrap.executeJavaScript(
          "window.__replayAcceptanceOldDocument===undefined&&Boolean(window.__CIRCE_REPLAY_PIN)",
        ))
      )
        return false;
      const frame = leaf(firstTicket, "index.html");
      return frame?.executeJavaScript(
        "window.__replayScript&&document.getElementById('counter').textContent==='Count: 0'",
      );
    }, "real HUD Reload and cached collection reconstruction");
    checked(
      "Shared Archive HUD Back Forward and Reload work through browser transport",
    );
    await outer(firstTicket).executeJavaScript(
      `(()=>{const frame=document.createElement('iframe');frame.id='owned-hostile-replay';frame.name='owned-hostile-replay';frame.src='/replay/w/'+${quote(firstPin.collection)}+'/id_/'+${quote(`${first.base}hostile.html`)};document.body.appendChild(frame)})()`,
    );
    await waitUntil(async () => {
      const frame = leaf(firstTicket, "hostile.html");
      if (!frame) {
        record.rawFrames = allFrames().map((item) => ({
          name: item.name,
          path: new URL(item.url || "about:blank").pathname,
        }));
        saveRecord();
        return false;
      }
      const progress = await frame.executeJavaScript(
        "({origin:location.origin,page:window.__replayAttacks??null,worker:window.__replayWorkerAttacks??null,error:window.__replayAttackError??window.__replayWorkerError??null,ready:document.readyState,violations:window.__replayViolations})",
      );
      record.hostileProgress = progress;
      saveRecord();
      if (progress.origin !== firstTicket.origin) return false;
      return progress.page && progress.worker;
    }, "raw actual archived hostile document and worker");
    const attacks = await leaf(firstTicket, "hostile.html").executeJavaScript(
      "({page:window.__replayAttacks,worker:window.__replayWorkerAttacks,violations:window.__replayViolations,appRead:window.__appRead})",
    );
    for (const target of [attacks.page, attacks.worker]) {
      assert.equal(target.fetch, "TypeError");
      assert.equal(target.xhr, "blocked");
      assert.notEqual(target.ws, "escaped");
      assert.notEqual(target.ws, "timeout");
    }
    assert.equal(attacks.appRead, "SecurityError");
    assert(
      attacks.violations.some(
        (value) =>
          value.directive === "connect-src" &&
          value.blocked === `${collectorOrigin}/page-beacon`,
      ),
    );
    assert.equal(collectorHits.length, 0);
    assert.equal(record.unexpectedPopup, undefined);
    assert.equal(new URL(win.webContents.getURL()).origin, origin);
    checked(
      "Actual raw archived page and worker CSP block fetch XHR beacon and WebSocket without network interception",
      attacks,
    );
    const synthesized = await leaf(
      firstTicket,
      "hostile.html",
    ).executeJavaScript(
      `Promise.all(['hostile.html','hostile-worker.js'].map(name=>fetch('/replay/w/'+${quote(firstPin.collection)}+'/id_/'+${quote(first.base)}+name).then(async response=>({status:response.status,csp:response.headers.get('Content-Security-Policy'),body:await response.text()}))))`,
    );
    for (const response of synthesized) {
      assert.equal(response.status, 200);
      assert.equal(response.csp, firstPin.csp);
      assert(response.body.includes("attacks()"));
    }
    const workerHttp = await sourceRequest(
      `${firstTicket.origin}/replay/sw.js?serveIndex=1`,
    );
    assert.equal(workerHttp.status, 200);
    assert.equal(
      workerHttp.headers["content-security-policy"],
      "default-src 'none'; script-src 'self'; connect-src 'self'; worker-src 'none'; object-src 'none'",
    );
    assert(!workerHttp.bytes.toString().includes("prototype:worker-egress"));
    assert(!workerHttp.bytes.toString().includes("prototype:state"));
    checked(
      "Production synthesized HTML and worker responses have forced CSP; SW HTTP CSP has no diagnostic capability",
    );
    assert.equal(
      (await ticketApi(firstTicket, `c/${firstPin.collection}?all=1`)).status,
      200,
    );
    for (const [path, method, body] of [
      [
        "c/create",
        "POST",
        { extraConfig: { type: "live", prefix: collectorOrigin } },
      ],
      [`c/${firstPin.collection}`, "DELETE"],
      [
        `c/${firstPin.collection}/updateAuth`,
        "POST",
        { headers: { Authorization: "invalid" } },
      ],
    ])
      assert.equal(
        (await ticketApi(firstTicket, path, method, body)).status,
        403,
      );
    await outer(firstTicket).executeJavaScript(
      `navigator.serviceWorker.getRegistration('/replay/').then(reg=>reg.active.postMessage({msg_type:'addColl',name:${quote(firstPin.collection)},file:{sourceUrl:${quote(`${collectorOrigin}/malicious-import.warc.gz`)}},type:'live'}))`,
    );
    await pause(600);
    assert.equal(collectorHits.length, 0);
    assert.equal(
      (
        await sourceRequest(
          `${firstTicket.origin}/replay/sw.js?serveIndex=1&allowProxyPassthrough=1`,
        )
      ).status,
      403,
    );
    checked(
      "Actual production SW read-only API and pinned addColl reject malicious source and worker options",
    );
    const originalRow = await getRow(firstTicket, firstPin.collection);
    assert(originalRow);
    await outer(firstTicket).executeJavaScript(
      `navigator.serviceWorker.getRegistration('/replay/').then(reg=>reg.active.postMessage({msg_type:'addColl',name:${quote(firstPin.collection)},skipExisting:false,file:{sourceUrl:${quote(firstPin.source)},headers:{Authorization:'invalid'}},extraConfig:{csp:"default-src *",headers:{Authorization:'invalid'}}}))`,
    );
    await pause(350);
    assert.deepEqual(
      await getRow(firstTicket, firstPin.collection),
      originalRow,
      "Untrusted canonical addColl must not replace its existing collection or authorization.",
    );
    checked(
      "Canonical addColl remains idempotent despite malicious replacement flags and configuration",
    );
    await putRow(firstTicket, {
      ...originalRow,
      type: "live",
      config: {
        ...originalRow.config,
        sourceUrl: `${collectorOrigin}/poisoned-source`,
        loadUrl: `${collectorOrigin}/poisoned-source`,
        extraConfig: {
          type: "live",
          prefix: collectorOrigin,
          csp: "default-src * 'unsafe-inline' 'unsafe-eval'",
        },
      },
    });
    try {
      await debuggerApi.sendCommand("ServiceWorker.stopAllWorkers");
      const rejected = await ticketApi(firstTicket, `c/${firstPin.collection}`);
      assert([403, 404, 409].includes(rejected.status));
      assert.equal(collectorHits.length, 0);
      checked(
        "Hostile replay IndexedDB fails closed after actual production SW stop and restart",
        { status: rejected.status },
      );
    } finally {
      await putRow(firstTicket, originalRow);
      await outer(firstTicket).executeJavaScript(
        "navigator.serviceWorker.getRegistration('/replay/').then(reg=>reg.active.postMessage({msg_type:'reload_all'}))",
      );
      await waitUntil(
        async () =>
          (await ticketApi(firstTicket, `c/${firstPin.collection}`)).status ===
          200,
        "recover owned valid cached collection",
      );
    }
    await leaf(firstTicket, "hostile.html").executeJavaScript(
      `top.postMessage({type:'circe-replay:external',generation:${quote(firstTicket.generation)},url:${quote(`${collectorOrigin}/forged-correct-generation`)}},${quote(origin)})`,
    );
    await outer(firstTicket).executeJavaScript(
      `parent.postMessage({type:'circe-replay:external',generation:'00000000-0000-4000-8000-000000000001',url:${quote(`${collectorOrigin}/wrong-generation`)}},${quote(origin)});parent.postMessage({type:'circe-replay:external',generation:${quote(firstTicket.generation)},url:'javascript:alert(1)'},${quote(origin)})`,
    );
    await run(
      `dispatchEvent(new MessageEvent('message', {
        source: document.querySelector(${quote(archiveIframe)}).contentWindow,
        origin: ${quote(collectorOrigin)},
        data: {
          type: 'circe-replay:external',
          generation: ${quote(firstTicket.generation)},
          url: ${quote(`${collectorOrigin}/wrong-origin`)}
        }
      }))`,
    );
    await pause(200);
    assert.equal(
      await run(
        "Array.from(document.querySelectorAll('[role=dialog]')).some(node=>node.innerText.includes('Open this link?'))",
      ),
      false,
    );
    assert.equal(collectorHits.length, 0);
    checked(
      "Parent rejects wrong source origin generation and malformed URL proposals",
    );
    win.webContents.setWindowOpenHandler((details) => {
      if (
        allowHandoff &&
        popupWindows.length === 0 &&
        ["about:blank", `${collectorOrigin}/external-click`].includes(
          details.url,
        )
      )
        return {
          action: "allow",
          overrideBrowserWindowOptions: {
            show: false,
            webPreferences: {
              nodeIntegration: false,
              contextIsolation: true,
              sandbox: true,
            },
          },
        };
      record.unexpectedPopup = details.url;
      return { action: "deny" };
    });
    originalPopupHandler = true;
    await clickLeaf(firstTicket, "index.html", "#outside");
    await waitFor(
      "Array.from(document.querySelectorAll('[role=dialog]')).some(node=>node.innerText.includes('Open this link?'))",
    );
    assert.equal(collectorHits.length, 0);
    assert.equal(popupWindows.length, 0);
    await snapshot(`replay-${prefix}-external-proposal`);
    await pressEscape();
    await waitFor(
      "!Array.from(document.querySelectorAll('[role=dialog]')).some(node=>node.innerText.includes('Open this link?'))",
    );
    assert.equal(collectorHits.length, 0);
    await clickLeaf(firstTicket, "index.html", "#outside");
    await waitFor(
      "Array.from(document.querySelectorAll('[role=dialog]')).some(node=>node.innerText.includes('Open this link?'))",
    );
    assert.equal(record.unexpectedPopup, undefined);
    allowHandoff = true;
    await selectText('[role="dialog"] button', "Open Link");
    await waitUntil(
      () => collectorHits.some((hit) => hit.path === "/external-click"),
      "physical trusted Circé external handoff",
    );
    assert.deepEqual(
      collectorHits.map((hit) => hit.path),
      ["/external-click"],
    );
    assert.equal(popupWindows.length, 1);
    await waitUntil(
      () =>
        popupWindows[0].webContents.getURL() ===
        `${collectorOrigin}/external-click`,
      "confirmed external popup navigation commits",
    );
    assert.equal(
      popupWindows[0].webContents.getURL(),
      `${collectorOrigin}/external-click`,
    );
    assert.equal(record.unexpectedPopup, undefined);
    checked(
      "Real archived link waits for physical trusted Circé Open Link button before its only collector request",
    );
    const secondTicket = addTicket(
      await jsonRequest("/web/replay", {
        action: "open",
        saveId: second.id,
        pageUrl: `${second.base}index.html`,
      }),
      second.id,
    );
    const secondBootstrap = await sourceRequest(
      `${secondTicket.origin}/bootstrap.js`,
    );
    assert.equal(secondBootstrap.status, 200);
    const secondPin = pinFromBootstrap(secondBootstrap.bytes);
    assert.notEqual(firstTicket.origin, secondTicket.origin);
    assert.equal(
      (await sourceRequest(secondPin.source, firstPin.authorization)).status,
      403,
    );
    assert.equal(
      (await sourceRequest(firstPin.source, secondPin.authorization)).status,
      403,
    );
    checked("Two Save origins cannot exchange their read-only source grants");
    const oldTicket = addTicket(
      await jsonRequest("/web/replay", {
        action: "open",
        saveId: second.id,
        pageUrl: `${second.base}index.html`,
      }),
      second.id,
    );
    const oldBootstrap = await sourceRequest(
      `${oldTicket.origin}/bootstrap.js`,
    );
    const oldPin = pinFromBootstrap(oldBootstrap.bytes);
    const item = await safeItem(second);
    const revision = archiveFixture({
      label: "b",
      collector: collectorOrigin,
      gif,
      revision: 2,
    });
    writeFileSync(join(item, second.archiveFile), revision.bytes);
    second.nativeArchiveSha256 = sha256(revision.bytes);
    writeFileSync(join(item, second.manifestFile), revision.manifestBytes);
    const info = readJson(join(item, "info.json"));
    for (const [path, bytes] of [
      [second.archiveFile, revision.bytes],
      [second.manifestFile, revision.manifestBytes],
    ]) {
      const file = info.files.find((value) => value.path === path);
      file.sha256 = sha256(bytes);
      file.size = bytes.length;
    }
    writeFileSync(join(item, "info.json"), JSON.stringify(info, null, 2));
    await rescan();
    await waitUntil(
      async () =>
        (await assertOwned(second)).files.some(
          (file) =>
            file.path === second.archiveFile &&
            file.sha256 === sha256(revision.bytes),
        ),
      "owned revision rescan",
    );
    const nextTicket = addTicket(
      await jsonRequest("/web/replay", {
        action: "open",
        saveId: second.id,
        pageUrl: `${second.base}index.html`,
      }),
      second.id,
    );
    const nextBootstrap = await sourceRequest(
      `${nextTicket.origin}/bootstrap.js`,
    );
    const nextPin = pinFromBootstrap(nextBootstrap.bytes);
    assert.notEqual(oldTicket.origin, nextTicket.origin);
    assert.equal(
      (await sourceRequest(nextPin.source, oldPin.authorization)).status,
      403,
    );
    assert.equal(
      (await sourceRequest(nextPin.source, nextPin.authorization)).status,
      200,
    );
    const staleSource = await sourceRequest(
      oldPin.source,
      oldPin.authorization,
    ).then(
      (response) => response.status,
      (error) => error.code,
    );
    assert.notEqual(staleSource, 200);
    checked(
      "New archive revision receives fresh origin and cannot reuse old revision grant",
      { oldSource: staleSource },
    );
    await jsonRequest("/web/replay", { action: "close", id: firstTicket.id });
    const deniedFresh = await sourceRequest(
      firstPin.source,
      firstPin.authorization,
      { address: address[0] },
    ).then(
      (response) => response.status,
      (error) => error.code,
    );
    assert.notEqual(deniedFresh, 200);
    const deniedViewer = await sourceRequest(firstTicket.url, undefined, {
      address: address[0],
    }).then(
      (response) => response.status,
      (error) => error.code,
    );
    assert.notEqual(deniedViewer, 200);
    assert(
      await leaf(firstTicket, "index.html").executeJavaScript(
        "Boolean(document.getElementById('replay-title'))",
      ),
    );
    checked(
      "Closing replay revokes fresh source and viewer access while cached bytes can remain",
      { source: deniedFresh, viewer: deniedViewer },
    );
    await snapshot(`replay-${prefix}-complete`);
  } catch (error) {
    failure = error;
    record.failure = {
      message: error.message ?? String(error),
      stack: error.stack ?? String(error),
    };
    saveRecord();
    await snapshot(`replay-${prefix}-failure`).catch(() => {});
  } finally {
    for (const child of popupWindows) {
      if (!child.isDestroyed()) child.destroy();
    }
    if (originalPopupHandler)
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    for (const ticket of tickets.values()) {
      try {
        const response = await fetch(`${origin}/web/replay`, {
          method: "POST",
          headers: { ...(await headers()), "content-type": "application/json" },
          body: JSON.stringify({ action: "close", id: ticket.id }),
          signal: AbortSignal.timeout(6000),
        });
        assert([200, 404, 410].includes(response.status));
      } catch (error) {
        record.cleanup.errors.push(`Replay close: ${error.message}`);
      }
    }
    for (const fixture of record.fixtures) {
      try {
        if (!fixture.id && fixture.sourceId) {
          const page = await query("saves.listPage", { limit: 500 });
          const matches = page.rows.filter(
            (save) =>
              save.title === fixture.title &&
              save.sourceId === fixture.sourceId &&
              save.source === "local",
          );
          assert(matches.length <= 1);
          fixture.id = matches[0]?.id;
          saveRecord();
        }
        if (fixture.id) {
          await assertOwned(fixture);
          if (fixture.archiveFile) {
            try {
              assert.equal(
                sha256(
                  readFileSync(
                    join(await safeItem(fixture), fixture.archiveFile),
                  ),
                ),
                fixture.nativeArchiveSha256,
                "Replay must never mutate the owned native WARC.",
              );
            } catch (error) {
              // The exact identity tuple still proves this is our disposable Save.
              record.cleanup.errors.push(
                `${fixture.label} native WARC changed: ${error.message}`,
              );
            }
          }
          const result = await query("saves.bulkEdit", {
            ids: [fixture.id],
            operation: { kind: "purge" },
            actorReason: "test:web-replay-cleanup",
          });
          assert.equal(result.changed, 1);
          assert.equal(await query("saves.get", { id: fixture.id }), null);
          record.cleanup.purged.push(fixture.id);
        }
        for (const token of fixture.tokens)
          if (!fixture.removedTokens.includes(token)) {
            await request(`/web/upload/${encodeURIComponent(token)}`, {
              method: "DELETE",
            });
            fixture.removedTokens.push(token);
          }
      } catch (error) {
        record.cleanup.errors.push(`${fixture.label}: ${error.message}`);
      }
    }
    try {
      await run(
        `window.pond.query('settings.setPrefs',{viewer:${quote(originalViewer)}})`,
      );
      const active = await query("library.info");
      assert.equal(active.path, initial.path);
      assert.equal(active.name, initial.name);
      assert.equal(active.icon, initial.icon);
      assert.deepEqual(active.mark, initial.mark);
      assert.equal(active.accent, initial.accent);
      assert.equal(readJson(join(active.path, "metadata.json")).id, libraryId);
      for (const pointer of pointers)
        assert.equal(readFileSync(pointer.path, "utf8"), pointer.bytes);
      const remaining = readJson(routeFile);
      for (const route of originalRoutes)
        assert.deepEqual(
          remaining.find((value) => value.hostname === route.hostname),
          route,
        );
      assert.equal(ownRoutes().length, 0);
      assert.equal(
        remaining.filter(
          (route) =>
            /^r-[a-f0-9]{36}\.replay\.elkyiem$/.test(route.hostname) &&
            !originalRoutes.some(
              (original) => original.hostname === route.hostname,
            ),
        ).length,
        0,
        "A new replay route remains; do not delete an unproven route.",
      );
    } catch (error) {
      record.cleanup.errors.push(
        `Original Library/routes verification: ${error.message}`,
      );
    }
    debuggerApi.removeListener("message", network);
    win.webContents.removeListener("did-create-window", capturePopup);
    if (debuggerApi.isAttached()) debuggerApi.detach();
    try {
      collector?.closeAllConnections();
      await new Promise((resolveClose) =>
        collector ? collector.close(resolveClose) : resolveClose(),
      );
    } catch (error) {
      record.cleanup.errors.push(`Collector close: ${error.message}`);
    }
    record.elapsedMs = Date.now() - started;
    record.cleanup.completed = record.cleanup.errors.length === 0;
    saveRecord();
  }
  assert.equal(
    record.cleanup.completed,
    true,
    redact(record.cleanup.errors.join("\n")),
  );
  if (failure) {
    const safeFailure = new Error(redact(failure.message ?? String(failure)));
    safeFailure.stack = redact(failure.stack ?? safeFailure.stack);
    throw safeFailure;
  }
  console.log(
    "WEB_REPLAY_PASSED",
    JSON.stringify({ checks: record.checks.length, record: recordPath }),
  );
  return record;
};
