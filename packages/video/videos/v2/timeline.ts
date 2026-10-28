import { LOCKUP_LENGTH, scenes } from "@pond/video";

const LOGO = 45730;

export const { start, end } = scenes({
  meet: [0, 6000],
  ask: [6000, 11000],
  routine: [11000, 14200],
  review: [14200, 18400],
  model: [18400, 23100],
  library: [23100, 27300],
  preview: [27300, 31900],
  sources: [31900, 35400],
  substack: [35400, 40900],
  more: [40900, 43130],
  release: [43130, LOGO],
  outro: [LOGO, LOGO + LOCKUP_LENGTH],
});

export const DURATION = end("outro");

/** Beats inside scenes, in ms. `score.py` cues the same moments in seconds. */
export const CUES = {
  schoolIn: 200,
  schoolOut: 2600,
  introLine: 3200,
  introOut: 4650,
  chatRise: 5200,
  askSend: 6500,
  thinking: 7000,
  answer: 7900,
  consulted: 8700,
  routineEvent: 11400,
  routineReply: 12100,
  reviewCard: 13000,
  applyClick: 16300,
  chatAway: 18300,
  modelRoll: 19500,
  modelStep: 600,
  windowRise: 23100,
  tileClick: 27700,
  paneOpen: 27850,
  burst: 32050,
  burstStep: 70,
  substackFly: 34900,
  substackRise: 34800,
  read: 36600,
  logo: LOGO,
} as const;
