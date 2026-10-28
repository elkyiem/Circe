"""Starter score: a pad bed, a short arpeggio under the app, and the standard lockup cue. Times match timeline.ts."""

from pond_score import Harmony, Score, hz

score = Score(duration=11.5)
harmony = Harmony(["D", "Bm", "G", "A", "D"], bar=score.bar, grid=0.6)

score.pads(harmony, range(-1, 5), [(0, 0), (1.2, 0.55), (2.6, 0.8), (6.6, 0.9), (7.1, 1.15), (8.5, 0.9), (11.5, 0)])
score.arpeggio(harmony, 2.6, 6.6, [(0, 0), (2.6, 0), (3.4, 0.7), (6.1, 0.7), (6.6, 0), (11.5, 0)])

score.sfx.add(0.65, score.pluck(hz(74), 1.2, 1.4), gain=0.12, pan=-0.3)
score.sfx.add(0.85, score.pluck(hz(81), 1.2, 1.4), gain=0.1, pan=0.3)
score.sfx.add(2.15, score.air(0.6, 2500, 600, rising=False, gain=0.8))
score.sfx.add(2.45, score.air(1.0, 300, 2400, rising=True, gain=1.1))
score.lockup(7.1, slide=1.3)

score.master()
