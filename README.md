# quantified-court

**The Analytics Resolution: How Quantifying the NBA Has Changed the Game** — paper and studio
piece (**FADEAWAY**) for "Theories, Methods, and Experiments in Art and AI," Columbia.

FADEAWAY is one monumental halfcourt that never moves while thirty seasons migrate out of its
middle. Each era's marks are drawn at the resolution the public record could actually manage, and
every material property of a mark comes from a measurement of that era's archive — grain is a
measurement, not a mood.

## Running it

```bash
python3 pipeline/acquire.py     # 30 season dumps -> data/shots/ + sha256 manifest
python3 pipeline/aggregate.py   # shares, samples, density grids, resolution regimes
python3 pipeline/qa.py          # acceptance gate: must reproduce plan §1.6 exactly
python3 pipeline/sportvu_probe.py   # verifies the 2015-16 tracking corpus is still there
python3 pipeline/bloom.py       # Act III: ball traces, anchored at their own shot dots

cd site && npm install && npm run dev     # the piece
```

`pipeline/bloom.py` needs one of `py7zr`, `p7zip`, or `bsdtar` to read the corpus archives; GNU
tar cannot. The shot-record stages need none of them.

**Two modes, one codebase** — the whole piece is a pure function of one float, so both modes are
the same work sampled differently:

- **exhibit** (default) — autoplaying ~11 min loop, no chrome, no cursor, no loop seam.
- **talk** (`?talk`) — a rail beside the plate listing every segment (Act 0, all thirty seasons
  under their act headings, the coda) with each season's measured mid-range share; click any of
  them to jump. Transport for start / previous / pause / next, plus a draggable scrub. Keys still
  work: `space` pause · `f` fermata · `1`–`5` acts · `w` the window · `,` `.` step a season.
  `?t=<seconds>` and `?year=<YYYY>` open on any beat; `?nav` adds the rail, `?nav=0` removes it.

The rail is deliberately absent from exhibit mode — the gallery loop shows nothing that looks like
it wants to be touched.

## Structure

```
CLAUDE.md          ground rules, findings, decisions log
docs/              the build plan (reference) + the thesis
pipeline/          acquisition, aggregation, QA gate, corpus probe, Act III traces
site/              FADEAWAY — Vite + TS, Canvas 2D, one rAF loop
data/processed/    committed derived JSON  (raw data is gitignored, never committed)
```

## Provenance

NBA shot data via stats.nba.com, bulk archive [shufinskiy/nba_data](https://github.com/shufinskiy/nba_data).
Tracking from the public 2015-16 SportVU release
([linouk23](https://github.com/linouk23/NBA-Player-Movements) + mirrors, play-by-play via
[sealneaward](https://github.com/sealneaward/nba-movement-data)). Derived data only is committed
here. MIT.
