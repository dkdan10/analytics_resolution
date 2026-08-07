# quantified-court

**The Analytics Resolution: How Quantifying the NBA Has Changed the Game** — paper and studio
piece (**FADEAWAY**) for "Theories, Methods, and Experiments in Art and AI," Columbia.

FADEAWAY is one monumental halfcourt that never moves while thirty seasons migrate out of its
middle. Each era's marks are drawn at the resolution the public record could actually manage, and
every material property of a mark comes from a measurement of that era's archive — grain is a
measurement, not a mood.

Six hands draw the same record in turn, one per pass of the loop: **the plate** (evidence), **the
field** (the league's own colours), **the ledger** (its words), **the census** (its counts), **the
hand** (paint), and **the measure** — which follows a single published statistic, closest-defender distance, through
its three states. For most of the piece no such measure exists. For eleven weeks in 2015-16 the
optical feed was public and the number can be *made*, out of all 632 games, in front of you. After
23 January 2016 four figures stay lit above four empty calipers for the rest of the loop: the
league still publishes those categories, and those are the last figures anyone outside could
compute. The enclosure is of the geometry, not of the numbers.

**The hand** is the painting. Its brush strokes are real player trajectories from the eleven weeks
— one body, five seconds, one possession, every vertex a position the machine recorded — and its
colour is the league's own seven-region map of the floor, so a stroke recolours along its own
length as it crosses the lines the NBA drew. Twenty-nine seasons are splotches and nothing between
them, because that is all the record kept.

## Running it

The pipeline pins both its interpreter (`.python-version`, pyenv 3.9.4) and its libraries
(`requirements.txt`, numpy 2.0.2 + pandas 2.3.2) — every published number was produced and verified
against exactly those. Each stage checks before it runs and explains itself if the wrong `python3`
won the PATH, which is easy to do: this machine carries four, two without numpy at all and one with
numpy 1.23.1 / pandas 1.4.3 that would otherwise run the acceptance gate to green on libraries the
results were never checked against.

```bash
pyenv install 3.9.4 && python3 -m pip install -r requirements.txt
# or, if python3 does not resolve to the pinned version:
#   $(pyenv root)/versions/$(cat .python-version)/bin/python3 pipeline/qa.py
```

```bash
python3 pipeline/acquire.py     # 30 season dumps -> data/shots/ + sha256 manifest
python3 pipeline/aggregate.py   # shares, samples, density grids, resolution regimes
python3 pipeline/qa.py          # acceptance gate: must reproduce plan §1.6 exactly
python3 pipeline/sportvu_probe.py   # verifies the 2015-16 tracking corpus is still there
python3 pipeline/bloom.py       # Act III: ball traces, anchored at their own shot dots
python3 pipeline/window.py --probe-gate   # must reproduce the committed corpus fixture first
python3 pipeline/window.py      # all 632 tracking games -> the caliper, occupancy, the inventory
python3 pipeline/window.py --reduce       # fold the per-game artifacts into what the piece reads
python3 pipeline/paint.py       # THE HAND: 2,772 strokes from 252 possessions
python3 pipeline/paint.py --reduce

cd site && npm install && npm run dev     # the piece
```

`bloom.py` and `window.py` need one of `py7zr`, `p7zip`, or `bsdtar` to read the corpus archives;
GNU tar cannot. The shot-record stages need none of them.

`window.py` mirrors 3.79 GB and takes roughly 25 minutes. It writes one artifact per game, so a
run resumes where it stopped and one bad archive costs one game rather than the run. Leave `--jobs`
alone: the stage is bound by memory rather than cores, and more workers make it slower.

**Two modes, one codebase** — the whole piece is a pure function of one float, so both modes are
the same work sampled differently:

- **exhibit** (default) — autoplaying ~8.3 min loop, no chrome, no cursor, no loop seam.
- **talk** (`?talk`) — a rail beside the plate listing every segment (Act 0, all thirty seasons
  under their act headings, the coda) with each season's measured mid-range share; click any of
  them to jump. Transport for start / previous / pause / next, plus a draggable scrub. Keys still
  work: `space` pause · `f` fermata · `1`–`5` acts · `w` the window · `,` `.` step a season. The
  window is 150 seconds and is the only segment with an inside, so the rail lists its four beats
  and the step buttons stop at each.
  `?t=<seconds>` and `?year=<YYYY>` open on any beat; `?nav` adds the rail, `?nav=0` removes it.

The rail is deliberately absent from exhibit mode — the gallery loop shows nothing that looks like
it wants to be touched.

## Structure

```
CLAUDE.md          ground rules, findings, decisions log
docs/              the build plan (reference) + the thesis
pipeline/          acquisition, aggregation, QA gate, corpus probe, traces, the window, the paint
site/              FADEAWAY — Vite + TS, Canvas 2D, one rAF loop
data/processed/    committed derived JSON  (raw data is gitignored, never committed)
```

## Provenance

NBA shot data via stats.nba.com, bulk archive [shufinskiy/nba_data](https://github.com/shufinskiy/nba_data).
Tracking from the public 2015-16 SportVU release
([linouk23](https://github.com/linouk23/NBA-Player-Movements) + mirrors, play-by-play via
[sealneaward](https://github.com/sealneaward/nba-movement-data)). Derived data only is committed
here. MIT.
