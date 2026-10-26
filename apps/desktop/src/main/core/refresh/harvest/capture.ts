import type { Source } from "@pond/schema/db";
import type { Capture } from "@pond/schema/raw";
import { sourceLabel } from "@pond/schema/sources";
import type { ReportDownloadActivity } from "@shared/download-activity";
import {
  AuthRequiredError,
  TerminalError,
  TransientError,
} from "../../pipeline/extractors/errors";
import { harvestUrl } from "../harvest-window/harvest";

interface CaptureArgs {
  url: string;
  source: Source;
  sourceId?: string;
  accountId?: string | null;
  reportActivity?: ReportDownloadActivity;
  isSignedIn?: (source: Source, partition: string) => Promise<boolean>;
}

export async function captureFromSource(args: CaptureArgs): Promise<Capture> {
  if (args.source === "web" || args.source === "local") {
    throw new TerminalError(
      `${args.source} does not harvest via captureFromSource`,
    );
  }

  let removedAtSource = false;
  if (args.source === "pinterest" && args.sourceId) {
    const { fetchPinterestCapture } = await import("./pinterest/api");
    const result = await fetchPinterestCapture({ sourceId: args.sourceId });
    if (result.ok) return result.capture;
    removedAtSource = result.reason === "not_found";
  }

  if (args.source === "arena" && args.sourceId) {
    const { fetchArenaCapture } = await import("./arena/api");
    const result = await fetchArenaCapture({ sourceId: args.sourceId });
    if (result.ok) return result.capture;
  }

  if (args.source === "substack" && args.sourceId) {
    const { fetchSubstackCapture } = await import("./substack/api");
    const result = await fetchSubstackCapture({
      sourceId: args.sourceId,
      accountId: args.accountId ?? null,
    });
    if (result.ok) return result.capture;
  }

  if (args.source === "tumblr" && args.sourceId) {
    const { fetchTumblrCapture } = await import("./tumblr/api");
    const result = await fetchTumblrCapture({
      sourceId: args.sourceId,
      url: args.url,
      accountId: args.accountId ?? null,
    });
    if (result.ok) return result.capture;
  }

  if (args.source === "savee" && args.sourceId) {
    const { fetchSaveeCapture } = await import("./savee/api");
    const result = await fetchSaveeCapture({
      sourceId: args.sourceId,
      accountId: args.accountId ?? null,
    });
    if (result.ok) return result.capture;
  }

  if (args.source === "vimeo" && args.sourceId) {
    const { fetchVimeoCapture } = await import("./vimeo/api");
    const result = await fetchVimeoCapture({
      sourceId: args.sourceId,
      accountId: args.accountId ?? null,
    });
    if (result.ok) return result.capture;
    if (result.reason === "not_found") {
      throw new TerminalError("vimeo video is gone or blocked in your region");
    }
    throw new TransientError("vimeo api unavailable");
  }

  if (args.source === "bluesky" && args.sourceId) {
    const { fetchBlueskyCapture } = await import("./bluesky/api");
    const result = await fetchBlueskyCapture({
      sourceId: args.sourceId,
      url: args.url,
    });
    if (result.ok) return result.capture;
    if (result.reason === "not_found") {
      throw new TerminalError("bluesky post was deleted or hidden");
    }
  }

  const result = await harvestUrl(args);
  /** A signed-in session can still open a secret-board pin, but an empty page shell means the pin is gone. */
  if (removedAtSource && (result.capture?.media.length ?? 0) === 0) {
    throw new TerminalError(`${args.source} item no longer exists`);
  }
  if (result.ok && result.capture) return result.capture;
  switch (result.reason) {
    case "auth_required":
      throw new AuthRequiredError(
        `Connect ${sourceLabel(args.source)} with the Pond extension`,
        args.source,
      );
    case "navigate_failed":
      throw new TransientError("navigate failed");
    case "timeout":
      throw new TransientError("scrape timeout");
    default:
      throw new TerminalError("scrape returned no data");
  }
}
