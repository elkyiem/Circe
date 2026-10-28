import { scenes } from "@pond/video";

export const { start, end } = scenes({
  hook: [0, 3100],
  menu: [3100, 5400],
  eagle: [5400, 10400],
  detail: [10400, 13500],
  mymind: [13500, 17900],
  outro: [17900, 22400],
});

export const DURATION = end("outro");

/** Beats inside scenes, in ms. `score.py` cues the same moments in seconds. */
export const CUES = {
  windowRise: 3080,
  plusClick: 4050,
  importHover: 4350,
  eagleClick: 5000,
  folderLand: 5900,
  folderStep: 190,
  smartLand: 7250,
  eagleDone: 8900,
  detailRow: 11100,
  detailStep: 170,
  csvRow: 14700,
  csvStep: 700,
  logo: 18000,
} as const;
