import unittest
import json
import numpy as np
from songloop import SR, candidates, render_loop

class Loops(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        t = np.arange(SR * 40) / SR
        mono = .12 * np.sin(2*np.pi*220*t)
        # Known 120 BPM, with harmonics and a stable bed.
        phase = t % .5
        mono += .3 * np.exp(-phase * 70) * np.sin(2*np.pi*1000*t)
        cls.audio = np.column_stack([mono, mono]).astype(np.float32)

    def test_beat_phrase_length(self):
        rows = candidates(self.audio)
        self.assertTrue(rows)
        json.dumps(rows, allow_nan=False)
        self.assertTrue(rows[0]['beat_aligned'])
        for row in rows:
            self.assertEqual(row['beats'] % 16, 0)
            self.assertGreaterEqual(row['end']-row['start'], 16)
            self.assertLessEqual(row['end']-row['start'], 48)

    def test_vocal_gate(self):
        self.assertEqual(candidates(self.audio, vocals=self.audio, instrumental_only=True), [])
        self.assertTrue(candidates(self.audio, vocals=np.zeros_like(self.audio), instrumental_only=True))

    def test_prefers_stable_region_over_rising_energy(self):
        rising = self.audio * np.linspace(.01, 1, len(self.audio))[:, None]
        mixed = np.concatenate([rising, self.audio])
        row = candidates(mixed)[0]
        self.assertGreaterEqual(row['start'], 38)
        self.assertLess(row['energy_trend_db'], 1)

    def test_silence(self):
        self.assertEqual(candidates(np.zeros_like(self.audio)), [])

    def test_render_duration_and_headroom(self):
        out = render_loop(self.audio, 2, 22)
        self.assertEqual(len(out), SR * 20)
        self.assertTrue(np.isfinite(out).all())
        self.assertLessEqual(float(np.max(abs(out))), .851)
        self.assertLess(float(np.max(abs(out[-1]-out[0]))), .02)

if __name__ == '__main__':
    unittest.main()
