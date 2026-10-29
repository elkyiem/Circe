import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RouteStore } from "portless";
import { afterEach, expect, it } from "vitest";
import { createReplayRoutes } from "./replay-routes";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

it("adds and removes only its owned replay routes while preserving application and sibling routes", async () => {
  const root = await mkdtemp(join(tmpdir(), "circe-replay-routes-"));
  roots.push(root);
  const store = new RouteStore(root);
  store.ensureDir();
  store.addRoute("circe.example", 4789, process.pid);
  store.addRoute("nono.example", 4820, 0);
  const original = store.loadRoutes();
  const routes = createReplayRoutes({
    appHostname: "circe.example",
    domain: "replay.example",
    port: 4789,
    stateDirectory: root,
  });
  const hostname = await routes.register();
  expect(hostname).toMatch(/^r-[a-f0-9]{36}\.replay\.example$/);
  expect(
    store.loadRoutes().find((route) => route.hostname === hostname)?.pid,
  ).toBe(process.pid);
  routes.remove("nono.example");
  routes.remove(hostname);
  expect(store.loadRoutes()).toEqual(original);
  const second = await routes.register();
  // Another owner adopted this exact hostname; old cleanup cannot remove it.
  store.removeRoute(second, process.pid);
  store.addRoute(second, 4999, 0);
  routes.close();
  expect(
    store.loadRoutes().find((route) => route.hostname === second)?.port,
  ).toBe(4999);
  expect(
    store.loadRoutes().filter((route) => route.hostname !== second),
  ).toEqual(original);
  await expect(routes.register()).rejects.toThrow("stopping");
});

it("rejects a domain that shares the application's cookie ancestry or an unregistered host port", async () => {
  for (const domain of [
    "circe.example",
    "archive.circe.example",
    "example",
    "bad/host",
  ])
    expect(() =>
      createReplayRoutes({ appHostname: "circe.example", domain, port: 4789 }),
    ).toThrow();
  const root = await mkdtemp(join(tmpdir(), "circe-replay-route-missing-"));
  roots.push(root);
  const routes = createReplayRoutes({
    appHostname: "circe.example",
    domain: "replay.example",
    port: 4789,
    stateDirectory: root,
  });
  await expect(routes.register()).rejects.toThrow("Portless address");
  expect(new RouteStore(root).loadRoutes()).toEqual([]);
  routes.close();
});
