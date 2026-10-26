import { readFile } from "node:fs/promises";
import type { Capture } from "@pond/schema/raw";
import sharp from "sharp";
import type { z } from "zod";
import type { WebFixtureSchema } from "../../shared/web-contracts";
import { enqueue } from "../core/pipeline/enqueue";
import { resolveMainOut } from "../lib/resolve-preload";

export type WebFixture = z.infer<typeof WebFixtureSchema>;

export function fixtureCapture(kind: WebFixture, assetOrigin: string): Capture {
  const id = {
    quote: "900000000000000001",
    image: "900000000000000002",
    video: "900000000000000003",
  }[kind];
  const capture: Capture = {
    id,
    source: "twitter",
    url: `https://x.com/iris_fixture/status/${id}`,
    title: `Iris fixture: ${kind}`,
    description: `Deterministic ${kind} fixture. This is offline test data, not a live X capture.`,
    author: { name: "Iris fixture", handle: "iris_fixture" },
    publishedAt: "2026-01-01T12:00:00.000Z",
    media: [],
    metrics: { likes: 12, retweets: 2, replies: 1 },
  };
  if (kind === "quote")
    capture.quoted = {
      id: "900000000000000004",
      source: "twitter",
      url: "https://x.com/quoted_fixture/status/900000000000000004",
      description:
        "Quoted fixture: a separate identity preserved inside the parent Capture.",
      author: { name: "Quoted author", handle: "quoted_fixture" },
      media: [],
    };
  if (kind === "image")
    capture.media = [
      {
        url: `${assetOrigin}/_fixtures/original.png`,
        type: "image",
        width: 960,
        height: 640,
      },
    ];
  if (kind === "video")
    capture.media = [
      {
        url: `${assetOrigin}/_fixtures/video.mp4`,
        type: "video",
        width: 640,
        height: 360,
        durationSec: 4,
        posterUrl: `${assetOrigin}/_fixtures/original.png`,
      },
    ];
  return capture;
}

export async function enqueueFixture(kind: WebFixture, assetOrigin: string) {
  const capture = fixtureCapture(kind, assetOrigin);
  return enqueue(capture.url, {
    trigger: "web:fixture",
    seed: {
      rawJson: {
        capture,
        extractorId: "iris-offline-fixture",
        extractedAt: new Date().toISOString(),
      },
      title: capture.title,
      description: capture.description,
      author: capture.author?.name,
      mediaType: kind === "video" ? "video" : "image",
      mediaUrl: capture.media[0]?.url,
      publishedAt: new Date(capture.publishedAt ?? ""),
    },
  });
}

export async function fixtureAsset(name: string): Promise<Response> {
  if (name === "original.png") {
    const bytes = await sharp({
      create: { width: 960, height: 640, channels: 3, background: "#b8c9b1" },
    })
      .composite([
        {
          input: Buffer.from(
            '<svg width="960" height="640"><circle cx="480" cy="320" r="160" fill="#f7eee0"/><circle cx="650" cy="170" r="70" fill="#667969"/></svg>',
          ),
        },
      ])
      .png()
      .toBuffer();
    return new Response(new Uint8Array(bytes), {
      headers: { "content-type": "image/png" },
    });
  }
  if (name === "video.mp4") {
    const bytes = await readFile(
      resolveMainOut("../../test/fixtures/web/video.mp4"),
    );
    return new Response(new Uint8Array(bytes), {
      headers: { "content-type": "video/mp4" },
    });
  }
  return new Response(null, { status: 404 });
}
