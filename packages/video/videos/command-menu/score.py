"""Score for the command menu cut: D major, 100 BPM, cues from timeline.ts."""

from pond_score import Harmony, Score, hz

score = Score(duration=21.9, seed=5)
harmony = Harmony(["D", "D", "Bm", "G", "A", "D", "Bm", "G", "A", "D", "D"], bar=score.bar, grid=0.6)

score.pads(
    harmony,
    range(-1, 9),
    [(0, 0), (1.2, 0.55), (2.8, 0.7), (3.8, 1.0), (15.6, 0.95), (16.9, 0.9), (17.5, 1.15), (18.9, 0.9), (21.9, 0)],
)
score.arpeggio(
    harmony,
    3.0,
    16.9,
    [(0, 0), (3.0, 0), (3.8, 0.5), (5.6, 0.95), (11.9, 0.95), (12.1, 0.6), (14.8, 0.6), (15.4, 0.9), (16.4, 0.8), (16.9, 0), (21.9, 0)],
)
score.drums(5.6, 16.9, shaker_from=8.6, rests=[(12.0, 13.4)])
score.bass(harmony, range(2, 6))

sfx = score.sfx
sfx.add(0.65, score.pluck(hz(74), 1.2, 1.4), gain=0.12, pan=-0.3)
sfx.add(0.85, score.pluck(hz(81), 1.2, 1.4), gain=0.1, pan=0.3)
sfx.add(2.55, score.air(0.6, 2500, 600, rising=False, gain=0.8))
sfx.add(2.95, score.air(1.0, 300, 2400, rising=True, gain=1.1))


def keys(start, count, step=0.095):
    """Soft key ticks, one per typed letter, kept under the music."""
    for index in range(count):
        sfx.add(start + index * step, score.tick(), gain=0.5, pan=float(score.rng.uniform(-0.2, 0.2)))


sfx.add(3.78, score.click(0.9))
sfx.add(3.80, score.pop(hz(86)), pan=0.05)
sfx.add(3.86, score.pluck(hz(90), 0.9, 1.5), gain=0.06, pan=0.15)

keys(5.75, 7)
sfx.add(6.40, score.pluck(hz(81), 1.0, 1.4), gain=0.08, pan=-0.2)

sfx.add(8.65, score.click(0.7))
keys(8.95, 5)
sfx.add(9.45, score.pluck(hz(83), 1.0, 1.4), gain=0.07, pan=-0.25)
sfx.add(9.60, score.pluck(hz(86), 1.0, 1.4), gain=0.07, pan=0.25)

sfx.add(10.90, score.click(0.8))

sfx.add(12.00, score.click(1.1))
sfx.add(12.02, score.pop(hz(88), 0.8), pan=0.1)
keys(12.70, 3)
sfx.add(13.55, score.click(1.0))
sfx.add(13.57, score.pop(hz(90), 0.8), pan=-0.1)
keys(14.05, 3)
sfx.add(14.75, score.click(1.2))
sfx.add(14.80, score.air(0.8, 2200, 600, rising=False, gain=0.45))

sfx.add(15.70, score.bell(hz(86)), pan=-0.15)
sfx.add(15.79, score.bell(hz(93)), gain=0.7, pan=0.15)

score.lockup(17.5, slide=1.3)

score.master()
