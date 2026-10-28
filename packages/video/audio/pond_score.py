"""Pond's synthesized score kit: instruments, musical layers, cue sounds, one shared room, and the master."""

import sys
import wave

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def lowpass(x, cutoff, order=2):
    return sosfilt(butter(order, cutoff, "low", fs=SR, output="sos"), x)


def highpass(x, cutoff, order=2):
    return sosfilt(butter(order, cutoff, "high", fs=SR, output="sos"), x)


def bandpass(x, low, high, order=2):
    return sosfilt(butter(order, [low, high], "band", fs=SR, output="sos"), x)


def env(length, attack, release, sustain_end=None):
    """A squared attack and release envelope, with its time axis."""
    n = int(length * SR)
    t = np.arange(n) / SR
    e = np.ones(n)
    a = max(1, int(attack * SR))
    e[:a] = np.linspace(0, 1, a) ** 2
    end = length - release if sustain_end is None else sustain_end
    r0 = int(end * SR)
    if r0 < n:
        e[r0:] *= np.linspace(1, 0, n - r0) ** 2
    return e, t


D_MAJOR = {
    "chords": {
        "D": [50, 57, 61, 64, 66],
        "Bm": [47, 54, 57, 61, 62],
        "G": [43, 54, 57, 59, 62],
        "A": [45, 52, 59, 62, 66],
    },
    "roots": {"D": 38, "Bm": 35, "G": 43, "A": 45},
}


class Harmony:
    """A chord progression, one chord per bar from `grid`, holding the first and last chords outside it."""

    def __init__(self, progression, bar, grid, chords=D_MAJOR["chords"], roots=D_MAJOR["roots"]):
        self.progression = progression
        self.bar = bar
        self.grid = grid
        self.chords = chords
        self.roots = roots

    def chord_at(self, time):
        index = int(np.floor((time - self.grid) / self.bar)) + 1
        return self.progression[max(0, min(index, len(self.progression) - 1))]

    def notes_at(self, time):
        return self.chords[self.chord_at(time)]

    def root_at(self, time):
        return self.roots[self.chord_at(time)]


class Bus:
    def __init__(self, n):
        self.n = n
        self.l = np.zeros(n)
        self.r = np.zeros(n)

    def add(self, at, signal, gain=1.0, pan=0.0):
        """Mix `signal` in at `at` seconds with a constant-power pan."""
        start = int(at * SR)
        if start >= self.n:
            return
        signal = signal[: self.n - start]
        left = gain * np.cos((pan + 1) * np.pi / 4) * np.sqrt(2)
        right = gain * np.sin((pan + 1) * np.pi / 4) * np.sqrt(2)
        self.l[start : start + len(signal)] += signal * left
        self.r[start : start + len(signal)] += signal * right

    def automate(self, points):
        gain = automation(self.n, points)
        self.l *= gain
        self.r *= gain
        return self


def automation(n, points):
    """Linear gain through `(seconds, gain)` points."""
    times = np.array([p[0] for p in points])
    values = np.array([p[1] for p in points])
    return np.interp(np.arange(n) / SR, times, values)


class Score:
    """One cut's score. Every noise source draws from one seeded generator, so a render is repeatable."""

    def __init__(self, duration, bpm=100, seed=7):
        self.duration = duration
        self.n = int(SR * duration)
        self.rng = np.random.default_rng(seed)
        self.beat = 60 / bpm
        self.bar = self.beat * 4
        self.pad = Bus(self.n)
        self.arp = Bus(self.n)
        self.groove = Bus(self.n)
        self.sfx = Bus(self.n)

    # Instruments.

    def pluck(self, f, length=0.9, brightness=1.0):
        e, t = env(length, 0.003, 0.25)
        out = np.zeros_like(t)
        for h in range(1, 7):
            out += np.sin(2 * np.pi * f * h * t) * np.exp(-t * (3.5 + 5.0 * h / brightness)) / (h**1.25)
        return out * e

    def click(self, strength=1.0):
        t = np.arange(int(0.03 * SR)) / SR
        noise = bandpass(self.rng.standard_normal(len(t)), 1800, 6000) * np.exp(-t * 260)
        tone = np.sin(2 * np.pi * 2349.3 * t) * np.exp(-t * 180)
        return (noise * 0.5 + tone * 0.35) * 0.09 * strength

    def pop(self, f, gain=1.0):
        t = np.arange(int(0.18 * SR)) / SR
        return (
            np.sin(2 * np.pi * f * t) * np.exp(-t * 28) + 0.2 * np.sin(4 * np.pi * f * t) * np.exp(-t * 50)
        ) * 0.05 * gain

    def bell(self, f, length=2.2):
        e, t = env(length, 0.002, 0.6)
        out = np.zeros_like(t)
        for ratio, amp, decay in ((1, 1, 2.2), (2.0, 0.35, 3.5), (2.76, 0.22, 5.0), (5.4, 0.08, 9.0)):
            out += amp * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t * decay)
        return out * e * 0.08

    def air(self, length, low, high, rising=True, gain=1.0):
        """A filtered-noise whoosh sweeping from `low` to `high` Hz, or back down."""
        n = int(length * SR)
        t = np.arange(n) / SR
        noise = self.rng.standard_normal(n)
        swell = np.sin(np.pi * t / length) ** 2
        out = np.zeros(n)
        bands = 6
        for k in range(bands):
            a = k / bands
            b = (k + 1) / bands
            lo = low + (high - low) * (a if rising else 1 - b)
            seg = bandpass(noise, lo, min(lo * 1.6, 15000))
            weight = np.clip(1 - np.abs(t / length - (a + b) / 2) * bands * 0.8, 0, 1)
            out += seg * weight
        return out * swell * 0.09 * gain

    def tick(self):
        t = np.arange(int(0.025 * SR)) / SR
        return bandpass(self.rng.standard_normal(len(t)), 3000, 9000) * np.exp(-t * 300) * 0.02

    def sub(self, at, midi, length=2.55, gain=0.16):
        """A low sine swell under a landing moment."""
        e, t = env(length, 0.02, 1.5)
        self.sfx.add(at, lowpass(np.sin(2 * np.pi * hz(midi) * t) * e * np.exp(-t * 0.9), 300) * gain)

    # Layers.

    def pads(self, harmony, bars, level):
        """Detuned soft saws per bar, crossfaded, doubled wide. `level` is the gain automation."""
        for bar in bars:
            begin = max(0.0, harmony.grid + bar * harmony.bar)
            length = harmony.bar + 1.2 if bar >= 0 else harmony.grid + 1.2
            e, t = env(length, 0.5, 1.1)
            voice = np.zeros_like(t)
            for midi in harmony.notes_at(begin + 0.01):
                f = hz(midi)
                for detune in (-0.004, 0.004):
                    for h in range(1, 6):
                        phase = self.rng.uniform(0, 6.28)
                        voice += np.sin(2 * np.pi * f * (1 + detune) * h * t + phase) / (h**1.6)
            voice = lowpass(voice * e, 1400) * 0.035
            self.pad.add(begin, voice, pan=-0.25)
            self.pad.add(begin + 0.012, voice, pan=0.25)
        self.pad.automate(level)

    def arpeggio(self, harmony, start, end, level, pattern=(0, 2, 4, 3, 1, 3, 2, 4)):
        """Eighth notes through the chord an octave up, accented every half bar."""
        step = 0
        time = start
        while time < end:
            notes = sorted(harmony.notes_at(time + 0.01))
            midi = notes[pattern[step % len(pattern)]] + 12
            accent = 1.0 if step % 4 == 0 else 0.72
            self.arp.add(time, self.pluck(hz(midi), 0.8, 0.9), gain=0.14 * accent, pan=0.3 if step % 2 else -0.3)
            step += 1
            time += self.beat / 2
        self.arp.automate(level)

    def drums(self, start, end, shaker_from, rests=()):
        """A soft kick on 1 and 3 and a shaker on the offbeats, silent inside each `(from, to)` rest."""
        kick_t = np.arange(int(0.45 * SR)) / SR
        kick = np.sin(2 * np.pi * np.cumsum(48 + 70 * np.exp(-kick_t * 30)) / SR) * np.exp(-kick_t * 9)
        kick = lowpass(kick, 900) * 0.32
        shake_t = np.arange(int(0.08 * SR)) / SR
        shaker = highpass(self.rng.standard_normal(len(shake_t)), 7000) * np.exp(-shake_t * 70) * 0.018
        time = start
        beat = 0
        while time < end:
            rest = any(a <= time < b for a, b in rests)
            if beat % 2 == 0 and not rest:
                self.groove.add(time, kick, gain=1.0 if beat % 4 == 0 else 0.75)
            if time >= shaker_from and not rest:
                self.groove.add(time + self.beat / 2, shaker, gain=1.0, pan=0.35)
            time += self.beat
            beat += 1

    def bass(self, harmony, bars):
        """A sine bass on each bar's root."""
        for bar in bars:
            begin = harmony.grid + bar * harmony.bar
            e, t = env(harmony.bar + 0.2, 0.02, 0.5)
            root = harmony.root_at(begin + 0.01)
            f = hz(root + (12 if root < 40 else 0))
            tone = (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)) * e * np.exp(-t * 0.6)
            self.groove.add(begin, lowpass(tone, 400) * 0.11)

    # Standard cues.

    def lockup(self, at, slide):
        """The end card: a falling breath before it, a bell chord as the mark lands, air as it slides aside."""
        self.sfx.add(at - 0.55, self.air(0.6, 2400, 500, rising=False, gain=0.7))
        for index, midi in enumerate([74, 78, 81, 85]):
            self.sfx.add(at + index * 0.06, self.bell(hz(midi + 12), 2.6), gain=0.75, pan=-0.3 + index * 0.2)
        self.sfx.add(at + slide, self.air(0.55, 700, 2600, rising=True, gain=0.55))
        self.sub(at, 38)

    # Master.

    def master(self, path=None, wet=0.3, fade=1.0):
        """Sum the buses through one shared room, fade the tail, soft-clip, and write 16-bit stereo."""
        ir_len = int(2.4 * SR)
        ir_t = np.arange(ir_len) / SR
        ir = []
        for _ in range(2):
            tail = self.rng.standard_normal(ir_len) * np.exp(-ir_t * 2.6)
            spectrum = np.fft.rfft(tail)
            spectrum = spectrum / (np.abs(spectrum) + 1e-9)
            tail = lowpass(np.fft.irfft(spectrum, ir_len) * np.exp(-ir_t * 2.6), 5200)
            ir.append(tail / np.sqrt(np.sum(tail**2)))

        dry_l = self.pad.l + self.arp.l + self.groove.l + self.sfx.l
        dry_r = self.pad.r + self.arp.r + self.groove.r + self.sfx.r
        send_l = self.pad.l * 0.5 + self.arp.l * 0.9 + self.sfx.l * 1.0 + self.groove.l * 0.1
        send_r = self.pad.r * 0.5 + self.arp.r * 0.9 + self.sfx.r * 1.0 + self.groove.r * 0.1
        wet_l = fftconvolve(highpass(send_l, 200), ir[0])[: self.n]
        wet_r = fftconvolve(highpass(send_r, 200), ir[1])[: self.n]

        tail = automation(self.n, [(0, 1), (self.duration - fade, 1), (self.duration, 0)])
        mix_l = (dry_l + wet_l * wet) * tail
        mix_r = (dry_r + wet_r * wet) * tail
        peak = max(np.abs(mix_l).max(), np.abs(mix_r).max())
        mix_l = np.tanh(mix_l / peak * 1.1) * 0.8
        mix_r = np.tanh(mix_r / peak * 1.1) * 0.8

        path = path or (sys.argv[1] if len(sys.argv) > 1 else "score.wav")
        pcm = (np.clip(np.stack([mix_l, mix_r], axis=1), -1, 1) * 32767).astype(np.int16)
        with wave.open(path, "wb") as out:
            out.setnchannels(2)
            out.setsampwidth(2)
            out.setframerate(SR)
            out.writeframes(pcm.tobytes())
        print(f"score: wrote {path} ({self.duration}s)")
