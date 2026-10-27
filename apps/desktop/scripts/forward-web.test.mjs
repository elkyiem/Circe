import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, request } from "node:http";
import { after, test } from "node:test";
import { createCirceForwarder } from "./forward-web.mjs";

const servers = [];
after(async () => {
  await Promise.all(
    servers.map((server) => {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    }),
  );
});
async function listen(server) {
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

function requestAt(port, path, options = {}) {
  return new Promise((resolve, reject) => {
    const outgoing = request(
      { hostname: "127.0.0.1", port, path, ...options },
      async (incoming) => {
        const chunks = [];
        for await (const chunk of incoming) chunks.push(chunk);
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers))
          if (value !== undefined)
            for (const part of Array.isArray(value) ? value : [value])
              headers.append(name, part);
        resolve(
          new Response(Buffer.concat(chunks), {
            status: incoming.statusCode,
            headers,
          }),
        );
      },
    );
    outgoing.on("error", reject);
    outgoing.end(options.body);
  });
}

test("forwards authenticated uploads and media ranges through the exact short address", async () => {
  const seen = [];
  const upstreamPort = await listen(
    createServer(async (incoming, outgoing) => {
      let body = "";
      for await (const chunk of incoming) body += chunk;
      seen.push({ headers: incoming.headers, path: incoming.url, body });
      outgoing.writeHead(206, {
        "content-range": "bytes 0-3/8",
        "set-cookie": "iris=test; HttpOnly; Secure; SameSite=Strict",
      });
      outgoing.end("data");
    }),
  );
  const port = await listen(
    createCirceForwarder({
      address: "https://circe.elkyiem",
      upstream: "https://host.example.ts.net:9443",
      // Exercise the real HTTP stream against a finite offline upstream.
      request: (_url, options, callback) =>
        request(
          {
            ...options,
            hostname: "127.0.0.1",
            port: upstreamPort,
          },
          callback,
        ),
    }),
  );
  const response = await requestAt(port, "/web/media/save/file?test=1", {
    method: "POST",
    headers: {
      host: "circe.elkyiem",
      origin: "https://circe.elkyiem",
      cookie: "iris=test",
      range: "bytes=0-3",
      "x-iris-library": "library-a",
    },
    body: "upload",
  });
  assert.equal(response.status, 206);
  assert.equal(await response.text(), "data");
  assert.equal(response.headers.get("content-range"), "bytes 0-3/8");
  assert.match(response.headers.get("set-cookie"), /HttpOnly; Secure/);
  assert.equal(seen[0].headers.host, "host.example.ts.net:9443");
  assert.equal(seen[0].headers.origin, "https://host.example.ts.net:9443");
  assert.equal(seen[0].headers.cookie, "iris=test");
  assert.equal(seen[0].headers["x-iris-library"], "library-a");
  assert.equal(seen[0].path, "/web/media/save/file?test=1");
  assert.equal(seen[0].body, "upload");

  for (const headers of [
    { host: "attacker.test" },
    { host: "circe.elkyiem", origin: "https://attacker.test" },
    { host: "circe.elkyiem", "sec-fetch-site": "cross-site" },
  ]) {
    assert.equal(
      (await requestAt(port, "/web/session", { headers })).status,
      403,
    );
  }
  assert.equal(seen.length, 1);
});

test("rejects insecure, credential-bearing, and path-based upstream addresses", () => {
  for (const upstream of [
    "http://host.test",
    "https://key@host.test",
    "https://host.test/path",
  ])
    assert.throws(() =>
      createCirceForwarder({ address: "https://circe.elkyiem", upstream }),
    );
});
