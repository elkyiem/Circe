import { cssVars } from "@pond/ui";
import type {
  FishColor,
  FishPresence,
  FishSpecies,
  FishSummary,
} from "@shared/fish-contracts";
import { clsx as cn } from "clsx";
import { useEffect, useId, useRef, useState } from "react";
import { EYE_PATHS, type FishFace, HEART_PATH, SPECIES_ART } from "./art";
import { watchOffscreen } from "./offscreen";
import styles from "./styles.module.css";

export { SPECIES_LABELS } from "./art";

export type FishMood = "calm" | "busy" | "worried" | "pleased";

export function fishMood(
  fish: Pick<FishSummary, "activity" | "lastRun">,
): FishMood {
  if (fish.activity) return "busy";
  if (!fish.lastRun || fish.lastRun.seen) return "calm";
  return fish.lastRun.status === "failed" ? "worried" : "pleased";
}

export function fishColorCss(color: FishColor): string {
  return `var(--ds-${color}-9)`;
}

function faceOf(activity: FishPresence, mood: FishMood): FishFace {
  if (mood === "worried") return "sad";
  if (mood === "pleased") return "happy";
  if (activity === "thinking") return "think";
  if (activity === "writing" || !activity) return "neutral";
  return "scan";
}

/** Sibling `useId`s differ by one character, so the final mix spreads them across the whole range. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (const char of text)
    value = Math.imul(value ^ char.charCodeAt(0), 0x01000193);
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  return (value ^ (value >>> 16)) >>> 0;
}

const AXIS = 12;
/** Eyes ride a sphere this wide as the fish turns, so they slide and foreshorten instead of flattening. */
const SPHERE = 6;

function longitude(x: number): number {
  const offset = Math.max(-0.9, Math.min(0.9, (x - AXIS) / SPHERE));
  return Number(((Math.asin(offset) * 180) / Math.PI).toFixed(2));
}

interface FishMarkProps extends React.ComponentPropsWithoutRef<"span"> {
  color: FishColor;
  species: FishSpecies;
  activity?: FishPresence;
  mood?: FishMood;
  size?: number;
}

export function FishMark({
  color,
  species,
  activity = null,
  mood = "calm",
  size = 16,
  className,
  style,
  ...props
}: FishMarkProps) {
  const markRef = useRef<HTMLSpanElement>(null);
  const [offscreen, setOffscreen] = useState(false);
  const id = useId();
  useEffect(() => {
    const node = markRef.current;
    if (!node) return;
    return watchOffscreen(node, setOffscreen);
  }, []);
  const clipId = `fish-${id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const shadeId = `${clipId}-shade`;
  const art = SPECIES_ART[species];
  const face = faceOf(activity, mood);
  const seed = hash(id);
  const lobes = art.lobes.map(([cx, cy, r], index) => (
    <circle
      key={`${cx}-${cy}`}
      className={styles.lobe}
      cx={cx}
      cy={cy}
      r={r}
      style={cssVars({ "--lobe": index, "--x": cx - AXIS })}
    />
  ));

  return (
    <span
      ref={markRef}
      className={cn(styles.mark, className)}
      data-offscreen={offscreen || undefined}
      data-species={species}
      data-activity={activity ?? undefined}
      data-mood={mood}
      data-face={face}
      data-compact={size < 24 || undefined}
      style={{
        ...cssVars({
          "--fish-color": fishColorCss(color),
          "--fish-size": `${size}px`,
          "--fish-sphere": SPHERE,
          "--fish-eye": `path("${EYE_PATHS[face]}")`,
          "--fish-blink-delay": `${-(seed % 9600)}ms`,
          "--fish-drift-delay": `${-(seed % 10000)}ms`,
        }),
        ...style,
      }}
      aria-hidden="true"
      {...props}
    >
      <svg
        className={styles.stage}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <defs>
          <clipPath id={clipId}>{lobes}</clipPath>
          <radialGradient id={shadeId} cx="0.42" cy="0.34" r="0.62">
            <stop className={styles.highlight} offset="0" />
            <stop className={styles.midtone} offset="0.55" />
            <stop className={styles.rim} offset="1" />
          </radialGradient>
        </defs>
        <g className={styles.fish}>
          <g className={styles.squash}>
            <g className={styles.body} fill="currentColor">
              {lobes}
              {"fins" in art ? (
                <path className={styles.plane} d={art.fins} />
              ) : null}
            </g>
            <g clipPath={`url(#${clipId})`}>
              <rect width="24" height="24" fill={`url(#${shadeId})`} />
            </g>
            {"strokes" in art ? (
              <path
                className={styles.plane}
                d={art.strokes}
                stroke="currentColor"
                strokeWidth="0.9"
                strokeLinecap="round"
              />
            ) : null}
            {"bulb" in art ? (
              <circle
                className={styles.bulb}
                cx={art.bulb[0]}
                cy={art.bulb[1]}
                r="1.3"
                fill="currentColor"
                style={{
                  ...cssVars({ "--x": art.bulb[0] - AXIS }),
                  transformOrigin: `${art.bulb[0]}px ${art.bulb[1]}px`,
                }}
              />
            ) : null}
            <g className={styles.face}>
              {art.eyes.map(([x, y], index) => (
                <g
                  key={`${x}-${y}`}
                  className={styles.orbit}
                  style={cssVars({ "--lon": `${longitude(x)}deg` })}
                >
                  <g transform={`translate(${x} ${y}) scale(${art.eyeScale})`}>
                    <g className={styles.lid}>
                      <path
                        className={styles.eye}
                        data-side={index === 0 ? "back" : "front"}
                        d={EYE_PATHS.neutral}
                        fill="#fff"
                      />
                    </g>
                  </g>
                </g>
              ))}
            </g>
          </g>
        </g>
        <circle className={styles.bubble} cx="22.6" cy="4.4" r="0.9" />
        <circle className={styles.bubble} cx="23.8" cy="1.8" r="0.6" />
        <g transform="translate(19.6 4.2)">
          <path className={styles.heart} d={HEART_PATH} />
        </g>
        <g transform="translate(22.4 7.4) scale(0.75)">
          <path className={styles.heart} d={HEART_PATH} data-trailing />
        </g>
      </svg>
    </span>
  );
}
