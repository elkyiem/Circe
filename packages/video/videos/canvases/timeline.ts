import { LOCKUP_LENGTH, scenes } from "@pond/video";

const LOGO = 18000;

export const { start, end } = scenes({
  hook: [0, 3000],
  board: [3000, 7400],
  notes: [7400, 12400],
  link: [12400, 15600],
  wide: [15600, 17800],
  outro: [17800, LOGO + LOCKUP_LENGTH],
});

export const DURATION = end("outro");

/** Beats inside scenes, in ms. `score.py` cues the same moments in seconds. */
export const CUES = {
  windowRise: 2980,
  pointerIn: 3900,
  addSaves: 4300,
  savesLand: 4650,
  savesStep: 150,
  noteTool: 7900,
  noteDrop: 8600,
  typing: 8800,
  typed: 10000,
  markerTool: 10300,
  pickRed: 10650,
  drawStart: 11000,
  drawEnd: 11800,
  escape: 12300,
  hoverLook: 12650,
  linkPress: 13000,
  linkDrop: 13700,
  relinkPress: 14200,
  relinkDrop: 14800,
  pullBack: 15600,
  logo: LOGO,
} as const;
