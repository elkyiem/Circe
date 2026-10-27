import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export async function connectWebHost() {
  const sandbox = resolve(
    process.env.POND_SANDBOX ?? "../../.artifacts/iris-web-sandbox",
  );
  const origin = process.env.CIRCE_WEB_ORIGIN ?? "http://127.0.0.1:4789";
  const key = (await readFile(join(sandbox, "web-access-key"), "utf8")).trim();
  const login = await fetch(`${origin}/web/session`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ key }),
  });
  assert.equal(login.status, 200);
  const { libraryId } = await login.json();
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const headers = {
    origin,
    cookie,
    "content-type": "application/json",
    "x-iris-library": libraryId,
  };
  const request = (path, body, extra = {}) =>
    fetch(`${origin}/web/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(180000),
      ...extra,
    });
  const call = async (path, body) => {
    const response = await request(path, body);
    assert.equal(
      response.status,
      200,
      `${path}: ${await response.clone().text()}`,
    );
    return response.json();
  };
  const query = (name, params = {}) => call("query", { name, params });
  return { sandbox, origin, libraryId, headers, request, call, query };
}
