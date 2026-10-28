"""Score for the Eagle and mymind cut: D major, 100 BPM, cues from timeline.ts."""

from pond_score import Harmony, Score, hz

score = Score(duration=22.4)
harmony = Harmony(["D", "D", "Bm", "G", "A", "D", "Bm", "A", "D", "D", "D"], bar=score.bar, grid=0.6)

score.pads(
    harmony,
    range(-1, 10),
    [(0, 0), (1.2, 0.55), (3.0, 0.7), (4.2, 1.0), (10.2, 0.85), (13.4, 0.8), (17.4, 0.9), (18.0, 1.15), (19.4, 0.9), (22.4, 0)],
)
score.arpeggio(
    harmony,
    3.0,
    17.4,
    [(0, 0), (3.0, 0), (4.0, 0.55), (5.4, 1.0), (10.3, 1.0), (10.8, 0.55), (13.3, 0.55), (13.9, 0.95), (16.9, 0.9), (17.4, 0), (22.4, 0)],
)
score.drums(5.4, 17.4, shaker_from=7.8, rests=[(10.2, 12.6)])
score.bass(harmony, range(2, 7))

sfx = score.sfx
sfx.add(0.65, score.pluck(hz(74), 1.2, 1.4), gain=0.12, pan=-0.3)
sfx.add(0.85, score.pluck(hz(81), 1.2, 1.4), gain=0.1, pan=0.3)
sfx.add(2.55, score.air(0.6, 2500, 600, rising=False, gain=0.8))
sfx.add(2.95, score.air(1.0, 300, 2400, rising=True, gain=1.1))
sfx.add(4.05, score.click())
sfx.add(4.09, score.pop(hz(86)), pan=-0.1)
sfx.add(4.41, score.pop(hz(88), 0.8), pan=0.1)
sfx.add(5.00, score.click(1.3))
for index, midi in enumerate([74, 76, 78, 81, 83, 86]):
    sfx.add(5.90 + index * 0.19, score.pluck(hz(midi), 0.9, 1.6), gain=0.11, pan=-0.4 + index * 0.08)
for index, midi in enumerate([88, 90]):
    sfx.add(7.25 + index * 0.22, score.pluck(hz(midi), 0.9, 1.6), gain=0.06, pan=0.3)
for index in range(24):
    sfx.add(5.98 + index * 0.105, score.tick(), gain=0.45, pan=float(score.rng.uniform(-0.6, 0.6)))
sfx.add(8.90, score.bell(hz(86)), pan=-0.15)
sfx.add(8.99, score.bell(hz(93)), gain=0.7, pan=0.15)
sfx.add(10.30, score.air(0.8, 400, 2000, rising=True, gain=0.8))
for index, midi in enumerate([81, 83, 85, 86, 88, 90, 93]):
    sfx.add(11.10 + index * 0.17, score.pluck(hz(midi), 0.6, 1.8), gain=0.07, pan=0.2)
sfx.add(13.00, score.air(0.6, 2400, 500, rising=False, gain=0.7))
sfx.add(13.60, score.air(0.8, 400, 2000, rising=True, gain=0.7))
for index, midi in enumerate([78, 81, 86]):
    sfx.add(14.70 + index * 0.7, score.pluck(hz(midi), 1.0, 1.3), gain=0.08, pan=-0.35)
    sfx.add(15.08 + index * 0.7, score.pop(hz(74), 0.9), pan=0.35)
score.lockup(18.0, slide=1.3)

score.master()
