import { describe, expect, it } from "vitest";
import { webHostConfig } from "./config";

describe("Circé addresses", () => {
  it("retains loopback access and accepts both exact Portless addresses", () => {
    expect(
      webHostConfig({
        PORT: "4123",
        PORTLESS_URL: "https://circe.elkyiem",
        PORTLESS_TAILSCALE_URL: "https://elkyiem.tailffeb5b.ts.net",
        CIRCE_WEB_ORIGINS:
          " https://elkyiem.tailffeb5b.ts.net:9443 ,https://circe.elkyiem",
      }),
    ).toEqual({
      port: 4123,
      origin: "http://127.0.0.1:4123",
      origins: [
        "https://elkyiem.tailffeb5b.ts.net:9443",
        "https://circe.elkyiem",
        "https://elkyiem.tailffeb5b.ts.net",
      ],
    });
  });

  it("retains older host settings while preferring the Circé names", () => {
    expect(
      webHostConfig({
        IRIS_WEB_PORT: "4789",
        IRIS_WEB_ORIGINS: "https://old.tail.ts.net",
      }),
    ).toMatchObject({ port: 4789, origins: ["https://old.tail.ts.net"] });
    expect(
      webHostConfig({ IRIS_WEB_PORT: "4789", CIRCE_WEB_PORT: "4790" }).port,
    ).toBe(4790);
  });

  it("keeps explicit listener settings and rejects unsafe origins and ports", () => {
    expect(webHostConfig({ PORT: "4123", CIRCE_WEB_PORT: "4789" }).port).toBe(
      4789,
    );
    for (const origin of [
      "http://circe.elkyiem",
      "https://circe.elkyiem/path",
      "https://user:password@circe.elkyiem",
      "https://*.elkyiem",
      "not a URL",
    ]) {
      expect(() => webHostConfig({ PORTLESS_URL: origin })).toThrow();
    }
    for (const port of ["0", "65536", "NaN", "4123.5"])
      expect(() => webHostConfig({ PORT: port })).toThrow();
  });
});
