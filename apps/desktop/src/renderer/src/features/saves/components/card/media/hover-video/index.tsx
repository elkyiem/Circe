import { useCallback, useEffect, useRef, useState } from "react";
import { BlurHash } from "@/features/saves/components/card/media/blur-hash";
import { useImageReady } from "@/features/saves/components/card/media/lib/use-image-ready";
import type { MediaUnit } from "@/features/saves/lib/media/units";
import { thumbUrlFor } from "@/features/saves/lib/media/url";
import { aspectCoverKey, recordAspect } from "@/features/saves/state/aspect";
import { rememberCardThumbnail } from "@/features/saves/state/card-thumbnails";
import { usePrefs } from "@/shared/state/prefs";
import styles from "./styles.module.css";

function seekToStart(el: HTMLVideoElement) {
  try {
    el.currentTime = 0;
  } catch {}
}

export function HoverVideo({
  saveId,
  src,
  unit,
  posterUrl,
  posterWidth,
  blurhash,
  label,
  onBroken,
  onReady,
  hasVideoDims = false,
}: {
  saveId: string;
  src: string;
  unit: MediaUnit;
  posterUrl?: string;
  posterWidth?: number;
  blurhash?: string | null;
  label: string;
  onBroken: () => void;
  onReady?: () => void;
  hasVideoDims?: boolean;
}) {
  const [prefs] = usePrefs("viewer");
  const hoverEnabled = prefs.hoverVideo !== false;
  const internalRef = useRef<HTMLVideoElement | null>(null);
  const [hoverPrimed, setHoverPrimed] = useState(false);
  const [active, setActive] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [posterBroken, setPosterBroken] = useState(false);
  const coverKey = aspectCoverKey(unit);
  const effectivePosterUrl = posterBroken
    ? undefined
    : posterUrl && thumbUrlFor(posterUrl, posterWidth);
  const needsRestingVideo = !effectivePosterUrl;
  const primed = hoverPrimed || needsRestingVideo;

  const reportPosterReady = useCallback(
    (image: HTMLImageElement) => {
      /** Platform posters can disagree with the stream (YouTube Shorts 16:9 blur composites). */
      if (!hasVideoDims) {
        recordAspect(saveId, image.naturalWidth, image.naturalHeight, {
          coverKey,
        });
      }
      rememberCardThumbnail(src, image.currentSrc || image.src);
      onReady?.();
    },
    [coverKey, hasVideoDims, onReady, saveId, src],
  );
  const poster = useImageReady(effectivePosterUrl ?? null, reportPosterReady);

  useEffect(() => {
    if (!active || !primed || !hoverEnabled) return;
    const el = internalRef.current;
    if (!el) return;
    /** Autoplay rejections are expected, and some Chromium builds return undefined here. */
    el.play()?.catch(() => {});
    return () => el.pause();
  }, [active, primed, hoverEnabled]);

  const onEnter = useCallback(() => {
    if (!hoverEnabled || document.body.dataset.saveDragging) return;
    setActive(true);
    setHoverPrimed(true);
  }, [hoverEnabled]);

  const onLeave = useCallback(() => {
    setActive(false);
    const el = internalRef.current;
    if (!el) return;
    el.pause();
  }, []);

  const onLoadedMetadata = useCallback(() => {
    const el = internalRef.current;
    if (!el) return;
    if (el.readyState < HTMLMediaElement.HAVE_METADATA) return;
    if (el.videoWidth === 0 && el.videoHeight === 0) {
      onBroken();
      return;
    }
    recordAspect(saveId, el.videoWidth, el.videoHeight, {
      coverKey,
      soft: Boolean(effectivePosterUrl),
    });
    if (needsRestingVideo) {
      seekToStart(el);
      onReady?.();
      setVideoReady(true);
    }
  }, [
    coverKey,
    effectivePosterUrl,
    needsRestingVideo,
    onBroken,
    onReady,
    saveId,
  ]);

  const showHash =
    Boolean(blurhash) && (effectivePosterUrl ? !poster.loaded : !videoReady);

  return (
    <>
      {showHash && blurhash ? <BlurHash hash={blurhash} /> : null}
      {effectivePosterUrl ? (
        <img
          ref={poster.ref}
          src={effectivePosterUrl}
          alt=""
          decoding="async"
          fetchPriority="auto"
          className={styles.poster}
          data-fit={prefs.galleryFit}
          data-loaded={!blurhash || poster.loaded ? "true" : "false"}
          draggable={false}
          onLoad={poster.onLoad}
          onError={() => setPosterBroken(true)}
        />
      ) : null}
      <video
        ref={internalRef}
        {...(primed ? { src } : {})}
        muted
        loop
        playsInline
        preload={primed ? "metadata" : "none"}
        className={styles.media}
        draggable={false}
        data-fit={prefs.galleryFit}
        data-active={active ? "true" : undefined}
        data-ready={videoReady ? "true" : undefined}
        data-resting={needsRestingVideo && videoReady ? "true" : undefined}
        aria-label={label}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onMouseMove={(event) => {
          if (!hoverEnabled || document.body.dataset.saveDragging) return;
          const el = internalRef.current;
          if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
          const rect = event.currentTarget.getBoundingClientRect();
          if (rect.width === 0) return;
          const ratio = Math.min(
            1,
            Math.max(0, (event.clientX - rect.left) / rect.width),
          );
          try {
            el.currentTime = ratio * el.duration;
          } catch {}
        }}
        onFocus={onEnter}
        onBlur={onLeave}
        onError={onBroken}
        onLoadedMetadata={onLoadedMetadata}
        onPlaying={() => setVideoReady(true)}
      >
        <track kind="captions" />
      </video>
    </>
  );
}
