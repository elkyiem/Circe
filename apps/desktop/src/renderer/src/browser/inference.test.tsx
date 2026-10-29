import { WebInferenceSchema } from "@shared/enrichment-contracts";
import { expect, it, vi } from "vitest";
import { createBrowserInference } from "./inference";

it("uploads a full-resolution photo as binary with a small scoped request", async () => {
  const data = new Uint8ClampedArray(6000 * 4000 * 3);
  let uploaded = 0;
  vi.stubGlobal("fetch", async (path: string, input?: RequestInit) => {
    expect(path).toBe("/web/upload");
    expect(input?.headers).toMatchObject({ "x-iris-library": "library" });
    expect(input?.body).toBeInstanceOf(Blob);
    if (!(input?.body instanceof Blob))
      throw new Error("Missing binary upload");
    uploaded = input.body.size;
    return Response.json({
      token: "iris-upload:00000000-0000-4000-8000-000000000000",
      name: "inference.bin",
      size: uploaded,
    });
  });
  try {
    const infer = createBrowserInference({
      headers: () => ({ "x-iris-library": "library" }),
      request: async (path, body) => {
        expect(path).toBe("inference");
        expect(body.length).toBeLessThan(300);
        const wire = WebInferenceSchema.parse(JSON.parse(body));
        expect(wire).toMatchObject({
          op: "clipImage",
          image: { width: 6000, height: 4000, channels: 3 },
        });
        return [0.25];
      },
    });
    await expect(
      infer({
        op: "clipImage",
        image: { width: 6000, height: 4000, channels: 3, data },
      }),
    ).resolves.toEqual([0.25]);
    expect(uploaded).toBe(data.byteLength);
  } finally {
    vi.unstubAllGlobals();
  }
});

it("sends nine video frames within the host upload admission limit", async () => {
  let active = 0;
  let peak = 0;
  let uploaded = 0;
  vi.stubGlobal("fetch", async () => {
    active++;
    peak = Math.max(peak, active);
    if (active > 8) throw new Error("Host upload allowance exceeded");
    const id = ++uploaded;
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    return Response.json({
      token: `iris-upload:00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
      name: "inference.bin",
      size: 4,
    });
  });
  try {
    const infer = createBrowserInference({
      headers: () => ({}),
      request: async (_path, body) => {
        const wire = WebInferenceSchema.parse(JSON.parse(body));
        if (wire.op !== "embedVideoFrames")
          throw new Error("Unexpected inference");
        expect(wire.frames).toHaveLength(9);
        return [0.5];
      },
    });
    await expect(
      infer({
        op: "embedVideoFrames",
        duration: 9,
        frames: Array.from({ length: 9 }, (_, timestamp) => ({
          timestamp,
          image: {
            width: 1,
            height: 1,
            channels: 4,
            data: new Uint8ClampedArray(4),
          },
        })),
      }),
    ).resolves.toEqual([0.5]);
    expect(uploaded).toBe(9);
    expect(peak).toBeLessThanOrEqual(8);
  } finally {
    vi.unstubAllGlobals();
  }
});

it("cleans up successful staging uploads after another input fails", async () => {
  let attempted = 0;
  const deleted: string[] = [];
  vi.stubGlobal("fetch", async (path: string, init?: RequestInit) => {
    if (init?.method === "DELETE") {
      deleted.push(path);
      return Response.json({ ok: true });
    }
    const id = ++attempted;
    await new Promise((resolve) => setTimeout(resolve, 1));
    if (id === 2) return new Response(null, { status: 422 });
    return Response.json({
      token: `iris-upload:00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
      name: "inference.bin",
      size: 4,
    });
  });
  try {
    const infer = createBrowserInference({
      headers: () => ({}),
      request: async () => {
        throw new Error("Incomplete inputs must not execute");
      },
    });
    await expect(
      infer({
        op: "sensitiveContent",
        images: Array.from({ length: 4 }, () => ({
          width: 1,
          height: 1,
          channels: 4,
          data: new Uint8ClampedArray(4),
        })),
      }),
    ).rejects.toThrow("could not be uploaded");
    expect(attempted).toBe(4);
    expect(deleted).toHaveLength(3);
  } finally {
    vi.unstubAllGlobals();
  }
});
