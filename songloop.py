"""Local instrumental extraction and ranked long-loop candidates (not a quality guarantee)."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import html

import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 22050
HOP = 512


def decode(path):
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(path), '-f',
                                   'f32le', '-ac', '2', '-ar', str(SR), '-'])
    audio = np.frombuffer(raw, dtype='<f4').reshape(-1, 2).copy()
    if len(audio) < SR * 16 or not np.isfinite(audio).all():
        raise ValueError('Нужен корректный аудиофайл длиной хотя бы 16 секунд.')
    return audio


def candidates(audio, minimum=16, maximum=48, vocals=None, instrumental_only=False, meter=4):
    import librosa
    if audio.ndim != 2 or audio.shape[1] not in (1, 2) or not np.isfinite(audio).all():
        raise ValueError('Expected finite mono/stereo samples')
    if len(audio) < minimum * SR or np.max(abs(audio), initial=0) < 1e-7:
        return []
    mono = audio.mean(axis=1)
    onset = librosa.onset.onset_strength(y=mono, sr=SR, hop_length=HOP)
    tempo, beats = librosa.beat.beat_track(onset_envelope=onset, sr=SR, hop_length=HOP)
    tempo = float(np.asarray(tempo).reshape(-1)[0])
    # A beat tracker does not detect downbeats: explore all metrical phases.
    beat_aligned = bool(len(beats) >= 16 and np.std(onset) > 0.01)

    f, times, z = signal.stft(mono, SR, nperseg=2048, noverlap=1536)
    power = abs(z) ** 2
    energy = 10 * np.log10(power.sum(axis=0) + 1e-12)
    # Pitch-class and timbre profiles, without learned models.
    chroma = np.zeros((12, len(times)))
    valid = (f > 60) & (f < 5000)
    notes = np.round(69 + 12 * np.log2(f[valid] / 440)).astype(int) % 12
    for k in range(12):
        chroma[k] = power[valid][notes == k].sum(axis=0)
    harmonic_profile = np.sqrt(chroma)
    harmonic_profile /= np.linalg.norm(harmonic_profile, axis=0) + 1e-12
    bands = np.array([power[(f >= lo) & (f < hi)].sum(axis=0)
                      for lo, hi in zip([0, 150, 400, 1000, 2500], [150, 400, 1000, 2500, 11026])])
    feature = np.vstack([chroma, bands]) ** 0.5
    feature /= np.linalg.norm(feature, axis=0) + 1e-12
    flux = np.maximum(np.diff(abs(z), axis=1), 0).sum(axis=0)
    peaks, _ = signal.find_peaks(flux, distance=int(.3 * SR / HOP), prominence=np.std(flux) * .25)
    # Steady pads may have no attacks: allow a coarse grid as fallback.
    grid = np.arange(0, len(times), max(1, round(2 * SR / HOP))) if len(peaks) < 8 else []
    points = np.unique(np.r_[0, peaks + 1, grid, len(times) - 1]).astype(int)
    if beat_aligned:
        points = beats.astype(int)
    vocal_db = None
    if vocals is not None:
        if len(vocals) != len(audio):
            raise ValueError('Vocal and accompaniment stems must have equal lengths')
        _, _, vz = signal.stft(vocals.mean(axis=1), SR, nperseg=2048, noverlap=1536)
        vocal_db = 10 * np.log10((abs(vz) ** 2).sum(axis=0) + 1e-12) - energy
    ranked = []
    context = max(2, int(.25 * SR / HOP))
    for ai, a in enumerate(points):
        for bi in range(ai + 1, len(points)):
            b = points[bi]
            beat_count = bi - ai
            if beat_aligned and beat_count % (meter * 4) != 0:
                continue
            if b >= len(times) or a >= len(times):
                continue
            duration = times[b] - times[a]
            if duration > maximum:
                break
            if not minimum <= duration <= maximum or b + context >= len(times):
                continue
            section = energy[a:b]
            if np.median(section) < -65:
                continue
            seam = float(np.mean(np.sum(feature[:, a:a+context] * feature[:, b:b+context], axis=0)))
            spread = float(np.percentile(section, 90) - np.percentile(section, 10))
            trend = float(abs(np.polyfit(np.linspace(0, 1, len(section)), section, 1)[0]))
            mismatch = float(abs(np.mean(energy[a:a+context]) - np.mean(energy[b:b+context])))
            # Compare a full beat of harmonic context, not just one transient.
            harmonic_context = max(context, round(SR / HOP * 60 / max(tempo, 40)))
            hc = min(harmonic_context, len(times) - b)
            harmonic = float(np.mean(np.sum(harmonic_profile[:, a:a+hc] * harmonic_profile[:, b:b+hc], axis=0)))
            # Reject a long quiet hole even if the median level seems fine.
            quiet_fraction = float(np.mean(section < np.median(section) - 18))
            vocal_activity = float(np.mean(vocal_db[a:b] > -18)) if vocal_db is not None else None
            if instrumental_only and (vocal_activity is None or vocal_activity > .05):
                continue
            if quiet_fraction > .15:
                continue
            score = .65 * seam + .35 * harmonic - .025 * spread - .04 * trend - .035 * mismatch
            if vocal_activity is not None:
                score -= .15 * vocal_activity
            ranked.append(dict(start=float(times[a]), end=float(times[b]), score=score,
                               spectral_match=seam, energy_trend_db=trend, energy_range_db=spread,
                               beat_aligned=beat_aligned, estimated_bpm=tempo if beat_aligned else None,
                               beats=beat_count if beat_aligned else None,
                               assumed_meter=meter if beat_aligned else None,
                               vocal_activity_fraction=vocal_activity,
                               warnings=(['Слабое сходство границ'] if seam < .8 else []) +
                                        (['Заметное развитие громкости'] if trend > 3 else []) +
                                        ([] if beat_aligned else ['Ритм не определён; свободная петля'])))
    ranked.sort(key=lambda x: x['score'], reverse=True)
    chosen = []
    for row in ranked:
        if all(abs(row['start'] - old['start']) > 4 for old in chosen):
            chosen.append(row)
        if len(chosen) == 3:
            break
    return chosen


def render_loop(audio, start, end):
    a, b = round(start * SR), round(end * SR)
    # Blend pre-roll into the end: keep the selected phrase's exact duration.
    out = audio[a:b].copy()
    fade = min(round(.08 * SR), a, len(out) // 8)
    if fade:
        w = np.linspace(0, 1, fade)[:, None]
        out[-fade:] = out[-fade:] * (1 - w) + audio[a-fade:a] * w
    out -= out.mean(axis=0)
    rms = np.sqrt(np.mean(out ** 2))
    gain = min(.85 / max(float(abs(out).max()), 1e-9), .09 / max(float(rms), 1e-9))
    return (out * gain).astype(np.float32)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('input', type=Path)
    p.add_argument('--instrumental', action='store_true', help='Input already has no vocals; skip Demucs')
    p.add_argument('--out', type=Path, default=Path('personal/loops'))
    p.add_argument('--vocals', type=Path, help='Aligned vocal stem for selection/scoring')
    p.add_argument('--instrumental-only', action='store_true', help='Select regions with little estimated vocal activity')
    p.add_argument('--meter', type=int, choices=[3, 4], default=4, help='Assumed beats per bar (not detected)')
    p.add_argument('--demucs-python', default=sys.executable, help='Python interpreter with Demucs installed')
    p.add_argument('--device', choices=['cpu', 'cuda'], default='cpu')
    p.add_argument('--min-seconds', type=float, default=16)
    p.add_argument('--max-seconds', type=float, default=48)
    args = p.parse_args()
    if not args.input.is_file():
        p.error('Input file does not exist')
    if not 8 <= args.min_seconds <= args.max_seconds <= 120:
        p.error('Require 8 <= min-seconds <= max-seconds <= 120')
    # Each run has its own directory, never overwriting earlier results.
    args.out.mkdir(parents=True, exist_ok=True)
    destination = Path(tempfile.mkdtemp(prefix='song-', dir=args.out))
    source = args.input.resolve()
    if not args.instrumental:
        subprocess.run([args.demucs_python, '-m', 'demucs', '-n', 'htdemucs', '--two-stems',
                        'vocals', '-d', args.device, '-o', str(destination / 'stems'), str(source)], check=True)
        source = destination / 'stems' / 'htdemucs' / source.stem / 'no_vocals.wav'
        if args.vocals is None:
            args.vocals = source.with_name('vocals.wav')
    if args.instrumental_only and args.vocals is None:
        p.error('--instrumental-only requires --vocals or automatic separation')
    audio = decode(source)
    vocals = decode(args.vocals) if args.vocals else None
    rows = candidates(audio, args.min_seconds, args.max_seconds, vocals, args.instrumental_only, args.meter)
    if not rows:
        raise ValueError('Не найдено подходящих длинных участков. Попробуйте другую композицию или меньшую длину.')
    for i, row in enumerate(rows, 1):
        row['file'] = f'loop-{i}.wav'
        wavfile.write(destination / row['file'], SR, render_loop(audio, row['start'], row['end']))
    cards = []
    for i, row in enumerate(rows, 1):
        loop = render_loop(audio, row['start'], row['end'])
        preview = f'preview-{i}.wav'
        wavfile.write(destination / preview, SR, np.tile(loop, (3, 1)))
        warning = '; '.join(row['warnings']) or 'Проверьте переходы на слух'
        cards.append(f'<article><h2>Вариант {i} · {row["start"]:.1f}–{row["end"]:.1f} с</h2>'
                     f'<p>{html.escape(warning)}</p><audio controls src="{preview}"></audio>'
                     f'<p>Три повтора подряд · <a download href="{row["file"]}">Скачать петлю</a></p></article>')
    (destination / 'index.html').write_text('<!doctype html><html lang="ru"><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Варианты фона</title>'
        '<style>body{max-width:760px;margin:40px auto;padding:20px;font:18px system-ui;background:#f5f2eb;color:#252c26}'
        'article{padding:20px 0;border-top:1px solid #bbb}audio{width:100%}</style>'
        '<h1>Выберите спокойный фон</h1><p>Сравните повторы. Резкий возврат, обрыв мелодии или остатки голоса — повод выбрать другой вариант.</p>'
        + ''.join(cards) + '</html>')
    report = dict(input=str(args.input.resolve()), vocal_separation=not args.instrumental,
                  note='Heuristic candidates: audition multiple repetitions; scores are not calibrated quality probabilities.', candidates=rows)
    (destination / 'analysis.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(f'Готово: {destination}. Прослушайте варианты; в плеере выберите «Готовая петля».')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, subprocess.CalledProcessError, FileNotFoundError, ModuleNotFoundError) as exc:
        sys.exit(f'Ошибка: {exc}')
