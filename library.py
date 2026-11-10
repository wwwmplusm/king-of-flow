"""Build a focus-music library.

  generate  render N generated tracks per genre (atmos, groove, drone, noise)
  process   run a folder of CC-licensed (or your own) music through the modulator

Every run updates <out>/manifest.json; `process` also writes <out>/CREDITS.md.
Tracks without a credits.csv row, or under a NoDerivatives license, are not
publishable: the first go to <out>/personal/, the second are skipped.
"""

import argparse
import csv
import json
import re
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import numpy as np

import focusgen as fg

AUDIO_EXT = {".mp3", ".flac", ".wav", ".ogg", ".opus", ".m4a", ".aac"}
GENRES = ["atmos", "groove", "drone", "brown", "pink"]


def render_job(job):
    rng = np.random.default_rng(job.get("seed", 0))
    src, total = fg.make_source(job["source"], rng, job.get("minutes", 0), path=job.get("input"))
    mod = fg.make_modulator(src, job["preset"])
    samples = fg.render(src, mod, total, job["output"], progress=False)
    job.update(rate_hz=round(mod.rate, 3), depth=mod.depth, minutes=round(samples / fg.SR / 60, 2))
    if isinstance(src, (fg.Atmos, fg.Groove)):
        job.update(root_midi=src.root, mode=next(k for k, v in fg.MODES.items() if v == src.mode))
    if isinstance(src, fg.Groove):
        job["tempo"] = src.tempo
    return job


def run(jobs, workers):
    done = []
    with ProcessPoolExecutor(workers) as pool:
        futures = {pool.submit(render_job, j): j for j in jobs}
        for f in as_completed(futures):
            try:
                done.append(f.result())
                print(f"ok   {futures[f]['output']}")
            except Exception as e:
                print(f"FAIL {futures[f]['output']}: {e}", file=sys.stderr)
    return done


def update_manifest(out, jobs):
    path = out / "manifest.json"
    entries = {e["file"]: e for e in json.loads(path.read_text())} if path.exists() else {}
    for j in jobs:
        entry = {k: v for k, v in j.items() if k not in ("output", "input")}
        entry["file"] = str(Path(j["output"]).relative_to(out))
        entries[entry["file"]] = entry
    path.write_text(json.dumps(sorted(entries.values(), key=lambda e: e["file"]), ensure_ascii=False, indent=2))


def generate(a):
    out = Path(a.out)
    jobs = []
    for genre in a.genres:
        (out / genre).mkdir(parents=True, exist_ok=True)
        for seed in range(a.seed_start, a.seed_start + a.count):
            jobs.append(dict(
                source=genre, seed=seed, minutes=a.minutes, preset=a.preset, publishable=True,
                license="generated", output=str(out / genre / f"{genre}-{seed:03d}-{a.preset}.{a.format}"),
            ))
    update_manifest(out, run(jobs, a.workers))


def read_credits(path):
    if not path or not Path(path).exists():
        return {}
    with open(path, newline="", encoding="utf-8") as f:
        return {row["file"]: row for row in csv.DictReader(f)}


def process(a):
    src_dir, out = Path(a.input), Path(a.out)
    credits = read_credits(a.credits or src_dir / "credits.csv")
    jobs = []
    for path in sorted(p for p in src_dir.iterdir() if p.suffix.lower() in AUDIO_EXT):
        row = credits.get(path.name)
        if row and re.search(r"\bND\b", row.get("license", "").upper()):
            print(f"skip {path.name}: {row['license']} запрещает изменения", file=sys.stderr)
            continue
        folder = out / ("cc" if row else "personal")
        folder.mkdir(parents=True, exist_ok=True)
        job = dict(source="file", input=str(path), preset=a.preset, publishable=bool(row),
                   output=str(folder / f"{path.stem}-{a.preset}.{a.format}"))
        if row:
            job.update({k: row.get(k, "") for k in ("title", "artist", "license", "url")})
        jobs.append(job)
    done = run(jobs, a.workers)
    update_manifest(out, done)
    write_credits(out)


def write_credits(out):
    entries = [e for e in json.loads((out / "manifest.json").read_text()) if e.get("source") == "file" and e["publishable"]]
    lines = ["# Credits", "", "Modified: rhythmic amplitude modulation added above 200 Hz (rate and depth per track below).", ""]
    for e in entries:
        lines.append(f"- `{e['file']}` — “{e['title']}” by {e['artist']}, {e['license']}, {e['url']} "
                     f"(modulated at {e['rate_hz']} Hz, depth {e['depth']})")
    (out / "CREDITS.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    g = sub.add_parser("generate")
    g.add_argument("--genres", nargs="+", choices=GENRES, default=["atmos", "groove"])
    g.add_argument("--count", type=int, default=5)
    g.add_argument("--seed-start", type=int, default=1)
    g.add_argument("--minutes", type=float, default=20.0)

    c = sub.add_parser("process", help="input folder may contain credits.csv: file,title,artist,license,url")
    c.add_argument("--input", required=True)
    c.add_argument("--credits")

    for s in (g, c):
        s.add_argument("--out", default="library")
        s.add_argument("--preset", choices=fg.PRESETS, default="focus-medium")
        s.add_argument("--format", default="mp3")
        s.add_argument("--workers", type=int, default=2)

    a = p.parse_args()
    generate(a) if a.cmd == "generate" else process(a)


if __name__ == "__main__":
    main()
