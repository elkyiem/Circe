import type { Capture, CaptureMedia } from "@pond/schema/raw";
import type { ListEntry } from "../list-types";
import { type BlueskyEmbed, type BlueskyPost, rkeyOf } from "./atproto";

const WEB = "https://bsky.app";

interface PostMedia {
  url: string;
  type: "image" | "video";
  poster?: string;
}

function postUrl(post: BlueskyPost): string {
  return `${WEB}/profile/${post.author.handle}/post/${rkeyOf(post.uri) ?? ""}`;
}

/** A quote with media nests the media one level down; the quoted post's own media stays with the quote. */
export function postMedia(
  embed: (BlueskyEmbed & { media?: BlueskyEmbed }) | undefined,
): PostMedia[] {
  if (!embed) return [];
  switch (embed.$type) {
    case "app.bsky.embed.images#view":
      return (embed.images ?? []).map((i) => ({
        url: i.fullsize,
        type: "image",
      }));
    case "app.bsky.embed.gallery#view":
      return (embed.items ?? []).map((i) => ({
        url: i.fullsize,
        type: "image",
      }));
    case "app.bsky.embed.video#view":
      if (!embed.playlist) return [];
      return [
        embed.thumbnail
          ? { url: embed.playlist, type: "video", poster: embed.thumbnail }
          : { url: embed.playlist, type: "video" },
      ];
    case "app.bsky.embed.recordWithMedia#view":
      return postMedia(embed.media);
    case "app.bsky.embed.external#view":
      return embed.external?.thumb
        ? [{ url: embed.external.thumb, type: "image" }]
        : [];
    default:
      return [];
  }
}

export function postEntry(
  post: BlueskyPost,
  likedAt: string | undefined,
): ListEntry {
  const entry: ListEntry = {
    sourceId: rkeyOf(post.uri) ?? post.uri,
    url: postUrl(post),
    author: `@${post.author.handle}`,
    listKinds: ["liked"],
  };
  if (likedAt) entry.savedAt = likedAt;
  if (post.record.text) entry.description = post.record.text;
  const media = postMedia(post.embed);
  const [first] = media;
  if (first) {
    entry.mediaUrl = first.url;
    entry.mediaUrls = media;
    entry.mediaType = media.some((m) => m.type === "video") ? "video" : "image";
  } else {
    entry.mediaType = "text";
  }
  return entry;
}

/** A video's media is its HLS playlist, so yt-dlp downloads it from the post URL instead of the blob fetcher. */
export function captureFromPost(post: BlueskyPost): Capture {
  const { author } = post;
  const capture: Capture = {
    id: rkeyOf(post.uri) ?? post.uri,
    source: "bluesky",
    url: postUrl(post),
    author: {
      name: author.displayName || author.handle,
      handle: author.handle,
      profileUrl: `${WEB}/profile/${author.handle}`,
    },
    media: postMedia(post.embed).map((m) => {
      const media: CaptureMedia = { url: m.url, type: m.type };
      if (m.poster) media.posterUrl = m.poster;
      return media;
    }),
  };
  if (author.avatar && capture.author) capture.author.avatarUrl = author.avatar;
  if (post.record.text) capture.description = post.record.text;
  if (post.record.createdAt) capture.publishedAt = post.record.createdAt;
  const metrics: NonNullable<Capture["metrics"]> = {};
  if (post.likeCount !== undefined) metrics.likes = post.likeCount;
  if (post.replyCount !== undefined) metrics.replies = post.replyCount;
  if (post.repostCount !== undefined) metrics.retweets = post.repostCount;
  if (Object.keys(metrics).length > 0) capture.metrics = metrics;
  return capture;
}
