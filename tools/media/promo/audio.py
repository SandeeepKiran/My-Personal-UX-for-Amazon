"""Synthesize the 22 s soundtrack: 120 BPM, C major, soft mix. Writes build/media/audio.wav."""
import wave
from pathlib import Path

import numpy as np

SR = 44100
DUR = 22.0
BEAT = 0.5
N = int(SR * DUR)
t_all = np.arange(N) / SR
mix = np.zeros((N, 2))
rng = np.random.default_rng(7)


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def add(start, sig, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i >= N:
        return
    sig = sig[: N - i] * gain
    mix[i:i + len(sig), 0] += sig * (1 - pan) / 2 ** 0.5
    mix[i:i + len(sig), 1] += sig * (1 + pan) / 2 ** 0.5


def env(n, a, r):
    e = np.ones(n)
    ai, ri = int(a * SR), int(r * SR)
    e[:ai] = np.linspace(0, 1, ai)
    e[-ri:] *= np.linspace(1, 0, ri)
    return e


def tone(f, d, harmonics=(1, .35, .12), a=.01, r=.3):
    t = np.arange(int(d * SR)) / SR
    s = sum(h * np.sin(2 * np.pi * f * (k + 1) * t) for k, h in enumerate(harmonics))
    return s * env(len(t), a, r)


# C - Am - F - G, two bars (4 s) each, repeated.
CHORDS = [[48, 55, 60, 64, 67], [45, 52, 57, 60, 64], [41, 48, 53, 57, 60], [43, 50, 55, 59, 62]]

for bar in range(int(DUR / 4) + 1):
    start = bar * 4.0
    chord = CHORDS[bar % 4]
    for note in chord:
        pad = tone(hz(note), 4.2, harmonics=(1, .2, .05), a=.8, r=1.2)
        add(start, pad, gain=.045, pan=rng.uniform(-.4, .4))
    # Arpeggio in eighth notes, from the hook onwards it gets busier.
    for step in range(8 if start < 3.5 else 16):
        when = start + step * (BEAT if start < 3.5 else BEAT / 2)
        note = chord[2:][step % 3] + 12
        add(when, tone(hz(note), .35, harmonics=(1, .3, .1), a=.005, r=.3), gain=.05, pan=(-.3 if step % 2 else .3))
    # Bass on every beat.
    for beat in range(8):
        add(start + beat * BEAT, tone(hz(chord[0] - 12), .45, harmonics=(1, .5, .2), a=.01, r=.35), gain=.09)

# Soft kick on every beat after the reveal click.
kt = np.arange(int(.25 * SR)) / SR
kick = np.sin(2 * np.pi * (50 + 90 * np.exp(-kt * 30)) * kt) * np.exp(-kt * 14)
for i in range(int(4.0 / BEAT), int(18.0 / BEAT)):
    add(i * BEAT, kick, gain=.22)


def whoosh(d=.6):
    n = int(d * SR)
    noise = rng.standard_normal(n)
    # A moving low-pass filter: smooth more at the start and end.
    out = np.zeros(n)
    y = 0.0
    for i in range(n):
        k = .02 + .25 * np.sin(np.pi * i / n)
        y += k * (noise[i] - y)
        out[i] = y
    return out * np.sin(np.pi * np.arange(n) / n) ** 2


def click():
    ct = np.arange(int(.05 * SR)) / SR
    return np.sin(2 * np.pi * 1800 * ct) * np.exp(-ct * 120)


def blip(note):
    return tone(hz(note), .25, harmonics=(1, .15), a=.003, r=.22)


for when in (3.3, 5.15, 10.75, 11.9, 14.3, 17.7):
    add(when, whoosh(), gain=.35)
for when in (4.4, 5.2):
    add(when, click(), gain=.35)
for when, note in ((0.8, 76), (1.25, 79), (1.7, 83), (8.4, 72), (8.95, 76), (9.5, 79),
                   (11.45, 76), (12.9, 72), (13.35, 76), (15.2, 72), (15.8, 76)):
    add(when, blip(note), gain=.12)
# Outro chord swell.
for note in (60, 64, 67, 72):
    add(18.0, tone(hz(note), 4.0, harmonics=(1, .25, .08), a=.4, r=2.5), gain=.06)

fade = np.ones(N)
fade[-int(1.8 * SR):] = np.linspace(1, 0, int(1.8 * SR))
fade[:int(.05 * SR)] = np.linspace(0, 1, int(.05 * SR))
mix *= fade[:, None]
mix *= .7 / np.abs(mix).max()

OUT = Path(__file__).resolve().parents[3] / "build" / "media" / "audio.wav"
OUT.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(OUT), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
