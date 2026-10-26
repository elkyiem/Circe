import { describe, expect, it } from "vitest";
import { webHostConfig } from "./config";

describe("Iris addresses", () => {
  it("retains loopback access and accepts both exact Portless addresses", () => {
    expect(
      webHostConfig({
        PORT: "4123",
        PORTLESS_URL: "https://iris.elkyiem",
        PORTLESS_TAILSCALE_URL: "https://elkyiem.tailffeb5b.ts.net",
        IRIS_WEB_ORIGINS:
          " https://elkyiem.tailffeb5b.ts.net:9443 ,https://iris.elkyiem",
      }),
    ).toEqual({
      port: 4123,
      origin: "http://127.0.0.1:4123",
      origins: [
        "https://elkyiem.tailffeb5b.ts.net:9443",
        "https://iris.elkyiem",
        "https://elkyiem.tailffeb5b.ts.net",
      ],
    });
  });

  it("keeps explicit listener settings and rejects unsafe origins and ports", () => {
    expect(webHostConfig({ PORT: "4123", IRIS_WEB_PORT: "4789" }).port).toBe(
      4789,
    );
    for (const origin of [
      "http://iris.elkyiem",
      "https://iris.elkyiem/path",
      "https://user:password@iris.elkyiem",
      "https://*.elkyiem",
      "not a URL",
    ]) {
      expect(() => webHostConfig({ PORTLESS_URL: origin })).toThrow();
    }
    for (const port of ["0", "65536", "NaN", "4123.5"])
      expect(() => webHostConfig({ PORT: port })).toThrow();
  });
});
