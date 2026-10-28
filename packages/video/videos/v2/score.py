"""UI sound for the Pond 2.0 cut; the music comes from music.mp3, in C major.

The samples in sfx/ are rendered from earshot's sound bank, tuned to the music's key.
"""

import wave
from pathlib import Path

import numpy as np
from pond_score import SR, Score

SFX = Path(__file__).parent / "sfx"
DURATION = 50.13
LOGO = 45.73


def sample(name):
    with wave.open(str(SFX / f"{name}.wav")) as file:
        assert file.getframerate() == SR
        width, channels = file.getsampwidth(), file.getnchannels()
        raw = np.frombuffer(file.readframes(file.getnframes()), dtype=np.uint8)
    if width == 3:
        padded = np.zeros((len(raw) // 3, 4), dtype=np.uint8)
        padded[:, 1:] = raw.reshape(-1, 3)
        pcm = padded.view("<i4").ravel() / 2**31
    else:
        pcm = np.frombuffer(raw.tobytes(), dtype=f"<i{width}") / 2 ** (8 * width - 1)
    return pcm.reshape(-1, channels).mean(axis=1)


score = Score(duration=DURATION)
sfx = score.sfx

sfx.add(3.45, sample("tile-6"), gain=0.35, pan=0.1)
sfx.add(4.85, sample("swish"), gain=0.3, pan=0.2)

for index in range(9):
    sfx.add(5.58 + index * 0.085, sample(f"key-{index % 3 + 1}"), gain=0.45, pan=0.25)
sfx.add(6.5, sample("click"), gain=0.6, pan=0.3)
sfx.add(6.52, sample("send"), gain=0.3, pan=0.3)
sfx.add(8.75, sample("ding-e"), gain=0.22, pan=-0.2)

sfx.add(11.4, sample("ding-g"), gain=0.25, pan=-0.1)
sfx.add(13.0, sample("card"), gain=0.45, pan=0.1)
sfx.add(16.3, sample("click"), gain=0.6, pan=0.2)
sfx.add(16.4, sample("ding-c"), gain=0.22, pan=0.15)
sfx.add(18.15, sample("swish"), gain=0.3, pan=-0.2)

for index in range(4):
    sfx.add(19.69 + index * 0.6, sample("click"), gain=0.4)

sfx.add(22.85, sample("swish"), gain=0.3)
sfx.add(27.7, sample("click"), gain=0.85, pan=0.2)
sfx.add(27.85, sample("card"), gain=0.35, pan=0.3)

for index in range(9):
    sfx.add(32.05 + index * 0.07, sample(f"tile-{index + 1}"), gain=0.3, pan=-0.6 + index * 0.15)
sfx.add(34.75, sample("swish"), gain=0.3, pan=0.1)

sfx.add(43.2, sample("ding-g"), gain=0.22)
sfx.add(LOGO, sample("logo"), gain=0.55)

score.master(wet=0.15)
