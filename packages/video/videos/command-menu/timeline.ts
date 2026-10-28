import { LOCKUP_LENGTH, scenes } from "@pond/video";

const LOGO = 17500;

export const { start, end } = scenes({
  hook: [0, 2800],
  reveal: [2800, 5600],
  typo: [5600, 8600],
  list: [8600, 12000],
  actions: [12000, 14800],
  added: [14800, 17300],
  outro: [17300, LOGO + LOCKUP_LENGTH],
});

export const DURATION = end("outro");

/** Beats inside scenes, in ms. `score.py` cues the same moments in seconds. */
export const CUES = {
  windowRise: 2780,
  menuOpen: 3800,
  pushIn: 4900,
  letter: 95,
  typoType: 5750,
  selectAll: 8650,
  chairType: 8950,
  down: 10900,
  tab: 12000,
  filterType: 12700,
  enterFolder: 13550,
  folderType: 14050,
  enterChairs: 14750,
  folderFocus: 15650,
  added: 15700,
  logo: LOGO,
} as const;
