import { LOCKUP_LENGTH, scenes } from "@pond/video";

const LOGO = 7100;

export const { start, end } = scenes({
  hook: [0, 2600],
  app: [2600, 7000],
  outro: [7000, LOGO + LOCKUP_LENGTH],
});

export const DURATION = end("outro");

/** Beats inside scenes, in ms. `score.py` cues the same moments in seconds. */
export const CUES = {
  windowRise: 2580,
  logo: LOGO,
} as const;
