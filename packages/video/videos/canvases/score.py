"""Score for the Canvases cut: D major, 100 BPM, cues from timeline.ts."""

from pond_score import Harmony, Score, hz

score = Score(duration=22.4, seed=11)
harmony = Harmony(["D", "D", "Bm", "G", "A", "D", "Bm", "G", "A", "D", "D"], bar=score.bar, grid=0.6)

score.pads(
    harmony,
    range(-1, 10),
    [(0, 0), (1.2, 0.55), (3.0, 0.7), (4.2, 1.0), (15.6, 0.95), (17.4, 0.9), (18.0, 1.15), (19.4, 0.9), (22.4, 0)],
)
score.arpeggio(
    harmony,
    3.0,
    17.4,
    [(0, 0), (3.0, 0), (4.0, 0.55), (5.4, 1.0), (8.6, 0.8), (10.0, 0.8), (10.6, 1.0), (16.9, 0.85), (17.4, 0), (22.4, 0)],
)
score.drums(5.4, 17.4, shaker_from=7.8, rests=[(8.6, 10.2)])
score.bass(harmony, range(2, 7))

sfx = score.sfx
sfx.add(0.65, score.pluck(hz(74), 1.2, 1.4), gain=0.12, pan=-0.3)
sfx.add(0.85, score.pluck(hz(81), 1.2, 1.4), gain=0.1, pan=0.3)
sfx.add(2.55, score.air(0.6, 2500, 600, rising=False, gain=0.8))
sfx.add(2.95, score.air(1.0, 300, 2400, rising=True, gain=1.1))

sfx.add(4.30, score.click())
for index, midi in enumerate([74, 78, 81, 83, 86, 90]):
    at = 4.65 + index * 0.15
    sfx.add(at, score.pluck(hz(midi), 0.9, 1.6), gain=0.09, pan=-0.45 + index * 0.18)
    sfx.add(at + 0.02, score.pop(hz(midi - 12), 0.5), pan=-0.45 + index * 0.18)

sfx.add(7.90, score.click())
sfx.add(8.60, score.click(1.2))
sfx.add(8.62, score.pop(hz(86)), pan=0.05)
for index in range(18):
    sfx.add(8.80 + index * 0.066, score.tick(), gain=0.35, pan=float(score.rng.uniform(-0.25, 0.25)))

sfx.add(10.30, score.click())
sfx.add(10.65, score.click(0.9))
sfx.add(10.67, score.pop(hz(88), 0.7), pan=0.2)
sfx.add(11.00, score.air(0.85, 1800, 4200, rising=True, gain=0.35), pan=0.15)

sfx.add(13.00, score.click(0.9))
sfx.add(13.70, score.pop(hz(81)), pan=-0.1)
sfx.add(13.72, score.pluck(hz(86), 0.9, 1.5), gain=0.08, pan=-0.1)
sfx.add(14.20, score.click(0.9))
sfx.add(14.80, score.pop(hz(85)), pan=0.2)
sfx.add(14.82, score.pluck(hz(90), 0.9, 1.5), gain=0.08, pan=0.2)

sfx.add(15.60, score.air(0.9, 2200, 500, rising=False, gain=0.6))
score.lockup(18.0, slide=1.3)

score.master()
