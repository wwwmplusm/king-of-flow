"""Focus audio generator.

Pipeline: source (noise / drone / atmos / groove / your file) -> split into
bands -> rhythmic amplitude modulation of the upper band -> loudness
normalisation -> any format ffmpeg can write (wav, mp3, opus, flac...).
Audio is processed in fixed-size blocks, so memory use does not depend on length.
"""

import argparse
import os
import subprocess
import sys

import numpy as np
from scipy import signal

SR = 44100
BLOCK = SR * 10
TARGET_RMS = 10 ** (-20 / 20)

PRESETS = {
    # rate Hz, depth 0..1
    "focus-low": (16.0, 0.25),
    "focus-medium": (16.0, 0.45),
    "focus-high": (16.0, 0.7),
    "relax": (8.0, 0.3),
    "sleep": (2.0, 0.25),
}

SOURCES = ["brown", "pink", "white", "drone", "atmos", "groove", "file"]

MODES = {
    "dorian": [0, 2, 3, 5, 7, 9, 10],
    "aeolian": [0, 2, 3, 5, 7, 8, 10],
    "lydian": [0, 2, 4, 6, 7, 9, 11],
    "mixolydian": [0, 2, 4, 5, 7, 9, 10],
}
PROGRESSIONS = [[0, 5, 3, 6], [0, 3, 4, 3], [0, 6, 5, 6], [0, 2, 5, 3], [0, 4, 5, 3]]

# Paul Kellet's pink filter; brown is leaky integration of white.
PINK_BA = ([0.049922035, -0.095993537, 0.050612699, -0.004408786], [1, -2.494956002, 2.017265875, -0.522189400])
BROWN_BA = ([1.0], [1.0, -0.997])


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def chord(root, mode, degree, size=4):
    notes = []
    for k in range(size):
        octave, i = divmod(degree + 2 * k, 7)
        notes.append(root + mode[i] + 12 * octave)
    return notes


def envelope(n, attack, release):
    env = np.ones(n)
    a, r = max(int(attack * SR), 1), max(int(release * SR), 1)
    env[:a] = 0.5 - 0.5 * np.cos(np.pi * np.arange(a) / a)
    env[n - r:] *= 0.5 + 0.5 * np.cos(np.pi * np.arange(r) / r)
    return env


def stereo(x, pan=0.5):
    return np.stack([x * np.sqrt(1 - pan), x * np.sqrt(pan)], axis=1).astype(np.float32)


# ---------- instruments ----------

def pad(notes, seconds, attack, release, rng, harmonics=6):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    for note in notes:
        for ch, cents in ((0, -4), (1, 4)):
            f = midi_hz(note) * 2 ** (cents / 1200)
            ph0 = rng.uniform(0, 2 * np.pi)
            for k in range(1, harmonics + 1):
                out[:, ch] += np.sin(2 * np.pi * f * k * t + ph0 * k) * np.exp(-k / 2.5) / k
    return (out * envelope(n, attack, release)[:, None] / len(notes)).astype(np.float32)


def bell(note, pan, seconds=5.0):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    f = midi_hz(note)
    x = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / d) for r, a, d in ((1, 1, 3.5), (2.76, 0.35, 1.5), (5.4, 0.12, 0.7)))
    return stereo(x * np.minimum(1, t / 0.02), pan)


def kick():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = 45 + 70 * np.exp(-t / 0.03)
    return stereo(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.12))


def hat(rng, decay):
    n = int(0.08 * SR)
    t = np.arange(n) / SR
    hp = signal.butter(2, 7000, "highpass", fs=SR, output="sos")
    x = signal.sosfilt(hp, rng.standard_normal(n)) * np.exp(-t / decay)
    return np.stack([x, np.roll(x, 7)], axis=1).astype(np.float32)


def bass(note):
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    ph = 2 * np.pi * midi_hz(note) * t
    x = (np.sin(ph) + 0.25 * np.sin(2 * ph) + 0.08 * np.sin(3 * ph)) * np.exp(-t / 0.22)
    return stereo(x * np.minimum(1, t / 0.004))


def keys(notes):
    n = int(1.6 * SR)
    t = np.arange(n) / SR
    out = np.zeros((n, 2), np.float32)
    for i, note in enumerate(notes):
        ph = 2 * np.pi * midi_hz(note) * t
        x = (np.sin(ph) + 0.25 * np.sin(2 * ph) + 0.05 * np.sin(3 * ph)) * np.exp(-t / 0.9)
        out += stereo(x * np.minimum(1, t / 0.006), 0.35 + 0.3 * (i % 2))
    return out / len(notes)


# ---------- plumbing ----------

def add_at(buf, offset, wav):
    end = offset + len(wav)
    if end > len(buf):
        buf = np.concatenate([buf, np.zeros((end - len(buf), 2), np.float32)])
    buf[offset:end] += wav
    return buf


class Sequencer:
    """Mixes events that may ring past the end of the block they start in."""

    def __init__(self):
        self.pending = np.zeros((0, 2), np.float32)

    def mix(self, n, events):
        buf = self.pending
        if len(buf) < n:
            buf = np.concatenate([buf, np.zeros((n - len(buf), 2), np.float32)])
        for offset, wav in events:
            buf = add_at(buf, offset, wav)
        self.pending = buf[n:].copy()
        return buf[:n].astype(np.float64)


class Reverb:
    def __init__(self, rng, seconds, wet):
        n = int(seconds * SR)
        t = np.arange(n) / SR
        ir = rng.standard_normal((n, 2)) * np.exp(-6.9 * t / seconds)[:, None]
        ir = signal.sosfilt(signal.butter(2, 5000, fs=SR, output="sos"), ir, axis=0)
        predelay = int(0.012 * SR)
        ir[:predelay] = 0
        self.ir = ir / np.sqrt(np.sum(ir ** 2, axis=0))
        self.wet = wet
        self.tail = np.zeros((n - 1, 2))

    def process(self, x):
        y = np.stack([signal.oaconvolve(x[:, c], self.ir[:, c]) for c in range(2)], axis=1)
        y[: len(self.tail)] += self.tail
        self.tail = y[len(x):]
        return x + self.wet * y[: len(x)]


# ---------- sources ----------

class Noise:
    def __init__(self, rng, color):
        self.rng = rng
        self.ba = {"white": None, "pink": PINK_BA, "brown": BROWN_BA}[color]
        self.hp = signal.butter(2, 20, "highpass", fs=SR, output="sos")
        self.hp_zi = np.zeros((self.hp.shape[0], 2, 2))
        self.zi = None if self.ba is None else np.zeros((len(self.ba[1]) - 1, 2))
        self.gain = None

    def block(self, start, n):
        x = self.rng.standard_normal((n, 2))
        if self.ba is not None:
            x, self.zi = signal.lfilter(*self.ba, x, axis=0, zi=self.zi)
        x, self.hp_zi = signal.sosfilt(self.hp, x, axis=0, zi=self.hp_zi)
        if self.gain is None:
            self.gain = TARGET_RMS / np.sqrt(np.mean(x ** 2))
        return x * self.gain


class Drone:
    # sub, root, fifth, octave. Upper partials stay quiet so the tone
    # does not whistle once the modulator grabs everything above 200 Hz.
    PARTIALS = [(0.5, 0.8), (1.0, 1.0), (1.5, 0.22)]

    def __init__(self, rng, root):
        base = midi_hz(root)
        self.voices = [
            (base * ratio * 2 ** (cents / 1200), amp, ch, rng.uniform(0, 2 * np.pi))
            for ratio, amp in self.PARTIALS
            for ch, cents in ((0, -2.0), (1, 2.0))
        ]
        self.breath = (rng.uniform(0.012, 0.02), rng.uniform(0, 2 * np.pi))
        self.wander = (rng.uniform(0.006, 0.01), rng.uniform(0, 2 * np.pi))
        self.body = Noise(rng, "brown")
        self.air = Noise(rng, "pink")
        self.air_lp = signal.butter(2, 1800, "lowpass", fs=SR, output="sos")
        self.air_zi = np.zeros((self.air_lp.shape[0], 2, 2))
        self.gain = None

    def block(self, start, n):
        t = (start + np.arange(n)) / SR
        breath_hz, breath_ph = self.breath
        wander_hz, wander_ph = self.wander
        breath = 1 + 0.04 * np.sin(2 * np.pi * breath_hz * t + breath_ph)
        wander = 1 + 0.0012 * np.sin(2 * np.pi * wander_hz * t + wander_ph)
        out = np.zeros((n, 2))
        for freq, amp, ch, ph in self.voices:
            out[:, ch] += np.sin(2 * np.pi * freq * t * wander + ph) * amp * breath
        if self.gain is None:
            self.gain = TARGET_RMS / np.sqrt(np.mean(out ** 2))
        air, self.air_zi = signal.sosfilt(self.air_lp, self.air.block(start, n), axis=0, zi=self.air_zi)
        return out * self.gain + self.body.block(start, n) * 0.16 + air * 0.05


class Atmos:
    """Slow crossfading pad chords, sparse soft bells, pink-noise air, long reverb."""

    def __init__(self, rng, root=None, chord_s=16.0):
        self.rng = rng
        self.root = root if root is not None else int(rng.integers(45, 53))
        self.mode = MODES[str(rng.choice(list(MODES)))]
        self.prog = PROGRESSIONS[rng.integers(len(PROGRESSIONS))]
        self.chord_s = chord_s
        self.chord_n = int(chord_s * SR)
        self.next_chord = 0
        self.next_bell = int(rng.uniform(4, 10) * SR)
        self.seq = Sequencer()
        self.air = Noise(rng, "pink")
        self.reverb = Reverb(rng, 4.0, 0.5)

    def block(self, start, n):
        end = start + n
        events = []
        while self.next_chord < end:
            degree = self.prog[(self.next_chord // self.chord_n) % 4]
            wav = pad(chord(self.root, self.mode, degree), self.chord_s + 6, 6, 6, self.rng)
            events.append((self.next_chord - start, wav))
            self.next_chord += self.chord_n
        while self.next_bell < end:
            degree = self.prog[(self.next_bell // self.chord_n) % 4]
            note = int(self.rng.choice(chord(self.root + 24, self.mode, degree)))
            level = 0.12 * self.rng.uniform(0.5, 1)
            events.append((self.next_bell - start, bell(note, self.rng.uniform(0.2, 0.8)) * level))
            self.next_bell += int(self.rng.uniform(3, 9) * SR)
        x = self.seq.mix(n, events) + self.air.block(start, n) * 0.4
        return self.reverb.process(x)


class Groove:
    """Soft four-on-the-floor: kick, offbeat hats, bass line, keys stabs and a pad, all in one mode."""

    BASS_PATTERNS = [[0, 3, 6, 8, 11, 14], [0, 6, 8, 14], [0, 2, 8, 10, 11], [0, 3, 8, 11]]
    KEYS_PATTERNS = [[3, 10], [6, 14], [2, 11], [4, 12]]
    TEMPOS = [104, 112, 118, 120, 124]

    def __init__(self, rng, root=None, tempo=None):
        self.rng = rng
        self.tempo = tempo if tempo is not None else float(rng.choice(self.TEMPOS))
        self.step = SR * 60 / self.tempo / 4
        self.root = root if root is not None else int(rng.integers(36, 43))
        self.mode = MODES[str(rng.choice(list(MODES)))]
        self.prog = PROGRESSIONS[rng.integers(len(PROGRESSIONS))]
        self.bass_pat = self.BASS_PATTERNS[rng.integers(len(self.BASS_PATTERNS))]
        self.keys_pat = self.KEYS_PATTERNS[rng.integers(len(self.KEYS_PATTERNS))]
        self.kick = kick()
        self.hats = [hat(rng, d) for d in (0.012, 0.02, 0.035)]
        self.cache = {}
        self.next_step = 0
        self.seq = Sequencer()
        self.reverb = Reverb(rng, 1.8, 0.25)

    def cached(self, key, make):
        if key not in self.cache:
            self.cache[key] = make()
        return self.cache[key]

    def block(self, start, n):
        end = start + n
        events = []
        rng = self.rng
        while (pos := round(self.next_step * self.step)) < end:
            bar, i = divmod(self.next_step, 16)
            degree = self.prog[(bar // 2) % 4]
            off = pos - start
            if i % 4 == 0:
                events.append((off, self.kick * 0.8))
            humanize = int(rng.integers(0, int(0.006 * SR)))
            if i % 4 == 2:
                events.append((off + humanize, self.hats[rng.integers(3)] * 0.3))
            elif i % 2 == 1 and rng.random() < 0.3:
                events.append((off + humanize, self.hats[0] * 0.1))
            if i in self.bass_pat:
                note = chord(self.root, self.mode, degree)[0] + (12 if rng.random() < 0.15 else 0)
                events.append((off, self.cached(("bass", note), lambda: bass(note)) * 0.6))
            if i in self.keys_pat:
                notes = tuple(chord(self.root + 24, self.mode, degree))
                events.append((off + humanize, self.cached(("keys", notes), lambda: keys(notes)) * 0.25))
            if i == 0 and bar % 2 == 0:
                bars2 = 32 * self.step / SR
                events.append((off, pad(chord(self.root + 12, self.mode, degree), bars2 + 2, 1, 2, rng) * 0.2))
            self.next_step += 1
        return self.reverb.process(self.seq.mix(n, events))


class FileSource:
    def __init__(self, path):
        if not os.path.isfile(path):
            raise FileNotFoundError(path)
        self.proc = subprocess.Popen(
            ["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
            stdout=subprocess.PIPE,
        )

    def block(self, start, n):
        raw = self.proc.stdout.read(n * 8)
        return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)


def make_source(kind, rng, minutes=5.0, root=None, tempo=None, path=None):
    """Returns (source, total samples or None for files)."""
    if kind == "file":
        return FileSource(path), None
    total = int(minutes * 60 * SR)
    if kind == "drone":
        return Drone(rng, 45 if root is None else root), total
    if kind == "atmos":
        return Atmos(rng, root), total
    if kind == "groove":
        return Groove(rng, root, tempo), total
    return Noise(rng, kind), total


# ---------- modulation and output ----------

class Modulator:
    def __init__(self, rate, depth, crossover=200.0, sharpness=1.5, stereo_phase=0.0, offset=0.0, ramp_s=10.0):
        self.rate, self.depth, self.sharpness = rate, depth, sharpness
        self.phases = np.array([offset, offset + stereo_phase])
        self.ramp_n = ramp_s * SR
        self.sos = signal.butter(4, crossover, "lowpass", fs=SR, output="sos")
        self.zi = np.zeros((self.sos.shape[0], 2, 2))

    def process(self, x, start):
        low, self.zi = signal.sosfilt(self.sos, x, axis=0, zi=self.zi)
        high = x - low
        idx = start + np.arange(len(x))
        t = idx / SR
        raised = 0.5 - 0.5 * np.cos(2 * np.pi * self.rate * t[:, None] + self.phases)
        m = 1 - self.depth + self.depth * raised ** self.sharpness
        ramp = np.minimum(1.0, idx / self.ramp_n)[:, None]
        return low + high * (1 - ramp * (1 - m))


def make_modulator(src, preset, rate=None, depth=None, **kw):
    """For grooves the preset rate snaps to a whole number of pulses per beat, peaking on the beat."""
    p_rate, p_depth = PRESETS[preset]
    depth = p_depth if depth is None else depth
    if rate is None and isinstance(src, Groove):
        beat_hz = src.tempo / 60
        rate = beat_hz * max(1, round(p_rate / beat_hz))
        kw.setdefault("offset", np.pi)
    return Modulator(p_rate if rate is None else rate, depth, **kw)


def fade(x, start, total, fade_n):
    idx = start + np.arange(len(x))
    env = np.clip(np.minimum(idx, total - idx) / fade_n, 0, 1)
    return x * env[:, None]


def render(src, mod, total, out_path, loudness=-20.0, progress=True):
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-",
           "-af", f"loudnorm=I={loudness}:TP=-1.5:LRA=11", "-ar", str(SR)]
    if out_path.endswith(".mp3"):
        cmd += ["-b:a", "192k"]
    proc = subprocess.Popen(cmd + [out_path], stdin=subprocess.PIPE)
    start = 0
    while total is None or start < total:
        n = BLOCK if total is None else min(BLOCK, total - start)
        x = src.block(start, n)
        if len(x) == 0:
            break
        y = mod.process(x, start)
        if total is not None:
            y = fade(y, start, total, 3 * SR)
        proc.stdin.write(y.astype("<f4").tobytes())
        start += len(x)
        if progress:
            print(f"\r{start / SR / 60:.1f} min", end="", file=sys.stderr, flush=True)
    proc.stdin.close()
    if proc.wait():
        raise RuntimeError(f"ffmpeg failed writing {out_path}")
    return start


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("source", choices=SOURCES)
    p.add_argument("-i", "--input", help="audio file for source=file")
    p.add_argument("-o", "--output", default="out.wav", help="extension picks the format: .wav .mp3 .opus .flac")
    p.add_argument("-t", "--minutes", type=float, default=5.0, help="length for generated sources")
    p.add_argument("-p", "--preset", choices=PRESETS, default="focus-medium")
    p.add_argument("--rate", type=float, help="modulation rate, Hz (overrides preset)")
    p.add_argument("--depth", type=float, help="modulation depth 0..1 (overrides preset)")
    p.add_argument("--crossover", type=float, default=200.0, help="Hz; only content above is modulated")
    p.add_argument("--sharpness", type=float, default=1.5, help="1 = sine, higher = punchier pulses")
    p.add_argument("--stereo-phase", type=float, default=0.0, help="radians between L/R modulators")
    p.add_argument("--root", type=int, help="root MIDI note (45 = A2); random for atmos/groove")
    p.add_argument("--tempo", type=float, help="groove BPM; random by default")
    p.add_argument("--loudness", type=float, default=-20.0, help="target integrated loudness, LUFS")
    p.add_argument("--seed", type=int, default=0)
    a = p.parse_args(argv)

    if a.source == "file" and not a.input:
        sys.exit("для source=file нужен --input путь/к/треку")
    rng = np.random.default_rng(a.seed)
    try:
        src, total = make_source(a.source, rng, a.minutes, a.root, a.tempo, a.input)
    except FileNotFoundError as e:
        sys.exit(f"файл не найден: {e}")
    mod = make_modulator(src, a.preset, a.rate, a.depth,
                         crossover=a.crossover, sharpness=a.sharpness, stereo_phase=a.stereo_phase)
    length = render(src, mod, total, a.output, a.loudness)
    print(f"\n{a.output}: {length / SR / 60:.1f} min, {mod.rate:.2f} Hz @ depth {mod.depth}")


if __name__ == "__main__":
    main()
