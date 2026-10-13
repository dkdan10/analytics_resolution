# How FADEAWAY is verified

## The rules the code enforces

1. **Honesty.** Every displayed or quoted number comes from a script output and is regenerable.
   The few typed by hand, the README's figures, are gated claims: each is checked against the
   artifact it came from.
2. **Acceptance.** The pipeline must reproduce a fixed acceptance table (`TABLE_1_6` in
   `pipeline/qa.py`) exactly. If the numbers differ, the pipeline is wrong.
3. **Grain is a measurement, not a mood.** A material property of a mark that cannot be measured
   is named, isolated and disclosed in [material-scalars.md](material-scalars.md).
4. **Colour is measured, never chosen.** Hue exposes the NBA's own zone partition and never adds a
   classification of ours; `pipeline/palette.py` measures the seven hues the site draws.
5. **Determinism.** A frame depends only on `(mode, t)` and the loaded data. Caches are rebuilt,
   never accumulated, and the purity probe compares the same instant reached by different seek
   paths.
6. **Data rights.** Bulk NBA data is never committed; derived data is.
7. **Every stroke stays one traceable record.** No particle systems, no synthesised motion.

## The gate

A bare `python pipeline/qa.py`, run from the Python 3.9 environment in the README's Quick
start, is the full shipping gate: every check group plus the fault
catalogue. It needs the raw dumps that `pipeline/acquire.py` mirrors, which are gitignored, so a
public clone runs `--no-raw`, prints `QA GREEN (REDUCED ...)` and names what it did not check.

Two jobs. First, regenerated aggregates must reproduce the acceptance table exactly. Second,
every artifact the piece ships must be present and semantically whole: every binary is decoded,
every headline figure is recomputed from an independent path, and every quantitative sentence in
the README is held to the artifact it came from.

Each defect in `pipeline/checks/mutations.py` is reintroduced on a copy of the artifacts and
documents and must be caught by the named check that owns it; a catch by an unrelated check is a
failure of the suite, and a mutation nothing catches is reported as STILL GREEN.

The league's seven-region map of the floor exists in Python and in TypeScript, and both are held
to one committed fixture (`npm run gate`). Each binary format declares its byte layout once, and
the Python writer and the TypeScript decoder are checked against it in both directions.
`site/scripts/check-numbers.mjs` scans the mark-drawing source files for material numbers
written inline instead of declared in the scalar register, and `npm run disclose` regenerates
the disclosure, which the build checks.

```bash
python3 pipeline/qa.py                       # the full gate (raw dumps present)
python3 pipeline/qa.py --no-raw              # a public clone
python3 pipeline/qa.py --only window,paint   # one or more check groups
python3 pipeline/checks/mutations.py --list  # every seeded defect and the check that owns it
python3 pipeline/checks/break_gates.py       # the same catalogue through real subprocesses (needs raw dumps)
python3 pipeline/checks/fixtures.py          # the offset decision on synthetic score vectors
python3 pipeline/checks/check_heroes.py      # release detection on synthetic trajectories
cd site && npm test && npm run build         # the source checks, then the gated seven-step build
```

## Running the pipeline from the raw archives

```bash
python3 pipeline/acquire.py         # 30 season dumps -> data/shots/ + sha256 manifest
python3 pipeline/aggregate.py       # shares, samples, density grids, resolution regimes
python3 pipeline/qa.py              # acceptance gate: must reproduce the acceptance table exactly
python3 pipeline/sportvu_probe.py   # verifies the 2015-16 tracking corpus is still there
python3 pipeline/bloom.py           # the curated ball traces, anchored at their own shot dots
python3 pipeline/window.py --probe-gate   # must reproduce the committed corpus fixture first
python3 pipeline/window.py          # every tracking game -> the caliper, occupancy, the inventory
python3 pipeline/window.py --reduce       # fold the per-game artifacts into what the piece reads
python3 pipeline/paint.py           # THE HAND: the strokes, from one possession per game
python3 pipeline/paint.py --reduce
python3 pipeline/slate.py           # THE SLATE: one night's games, folded
python3 pipeline/game.py            # THE GAME: one full game, all ten bodies and the ball
python3 pipeline/facts.py           # the residue no dump supplies: cited history + derived schedule
python3 pipeline/palette.py         # measures THE FIELD's seven hues; the gate FAILS if it never ran
```

`acquire.py` mirrors tens of megabytes and unlocks the full gate; the tracking corpus is several
gigabytes and unlocks the window, paint, slate and game stages. `bloom.py` and `window.py` need
one of `py7zr`, `p7zip` or `bsdtar` to read the archives. `window.py` writes one artifact per
game, so a run resumes where it stopped; leave `--jobs` alone, the stage is bound by memory. The
pins in `.python-version` and `requirements.txt` are the interpreter and libraries every
published number was produced with.

## Probing the piece

Three diagnostics sit behind `?probe=`: `purity`, `perf` and `shots`. None is reachable from the
exhibit path and none is wired into the build. They drive an installed Google Chrome through
Playwright against `npm run dev`; verdicts land in the gitignored `docs/probe/`.

```bash
cd site && npm run probe:purity           # the same instant reached four ways, compared by hash
cd site && npm run probe:perf -- --assert-presentation
cd site && npm run shots -- --list hands  # exact frames, for looking at
```

Read a purity verdict on the **RENDERER** arm against the run's own measured noise floor:
Canvas2D rasterisation is not bit-stable under memory pressure, and `aboveNoise` keeps a hard
floor of its own. `--out` is a NAME, not a path. `npm run shots` is not a gate and must not
become one.

## Deploying, and what is public

`cd site && npm run deploy:pages` runs the gated build and publishes `dist/` to `gh-pages`. CI
verifies and never publishes. The site serves exactly one list: the `public` column of
`REQUIRED_ARTIFACTS` in `pipeline/qa.py`, written to `pipeline/deploy_allowlist.json`, copied by
`sync-data.mjs` and graded on the real `dist/` by `check-public-data.mjs`. The repository carries
all of `data/processed/`, served or not, so the pipeline stays reproducible; no raw data is
tracked. Published by decision: `points/*.bin` whole, `traces.json` with player names, game ids,
matchups and dates, and anonymised paint scenes with no player, game, event or clock.
