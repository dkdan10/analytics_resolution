# quantified-court

**The Analytics Resolution: How Quantifying the NBA Has Changed the Game** — paper and studio
piece (**FADEAWAY**) for "Theories, Methods, and Experiments in Art and AI," Columbia.

**Live:** <https://dkdan10.github.io/analytics_resolution/> (exhibit; add `?talk` for the rail).

FADEAWAY is one monumental halfcourt that never moves while thirty seasons migrate out of its
middle. Every material property of a mark comes from a measurement of that era's archive — grain is
a measurement, not a mood.

What that resolution *was* is the piece's own finding, and it is not constant. The record refuses to
place some shots at all, and where it files that refusal moves: the whole rim in the earliest era,
then nothing for four seasons, then dunks, then tip-ins and putbacks. Every one of those refusals is
struck on the plate as **the pin**, at the coordinate the record actually used. The 2015-16 pile is
corroborated against a second instrument — the optical tracking feed puts those shots in as many
places as there are shots, so the coordinate is a filing convention and not a location.

Six hands draw the same record in turn, one per pass of the loop: **the plate** (evidence), **the
field** (the league's own colours), **the ledger** (its words), **the census** (its counts), **the
hand** (paint), and **the measure** — which follows a single published statistic, closest-defender distance, through
its three states. For most of the piece no such measure exists. For 89 days in 2015-16 the
optical feed was public and the number can be *made*, out of all 632 games, in front of you. After
23 January 2016 four figures stay lit above four empty calipers for the rest of the loop: the
league still publishes those categories, and those are the last figures anyone outside could
compute. The enclosure is of the geometry, not of the numbers.

**The hand** is the painting. Its brush strokes are real player trajectories from the window
— one body, five seconds, one possession, every vertex a position the machine recorded — and its
colour is the league's own seven-region map of the floor, so a stroke recolours along its own
length as it crosses the lines the NBA drew. Twenty-nine seasons are splotches and nothing between
them, because that is all the record kept.

**The stack** is a seventh view, and it is not a hand. The six each render the whole record one
way; the stack renders nothing of its own. It composites the others' material over a single shared
base, one named interpretive operation at a time — LOCATE THE ATTEMPT, CLASSIFY THE FLOOR, INSCRIBE
THE SEASON, CONNECT THE BODY, MEASURE THE DEFENDER, NAME THE ACTION, COUNT THE EVENT — and it opens
with all seven switched off, on bare stone. Each control names an act somebody performed on a list
of coordinates rather than a renderer or a visual effect, and each declares the artifact it reads
and the definition that artifact ships. A presenter builds the image live, and ALL RENDERINGS
applies every operation at once until it is released: the plate becomes illegible, which is the
point, because maximal rendering is not maximal access. It is **talk mode only** and is not in the
gallery rotation, which stays six.

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
python3 pipeline/paint.py       # THE HAND: the strokes, from one possession per game
python3 pipeline/paint.py --reduce
python3 pipeline/facts.py       # the residue no dump supplies: cited history + derived schedule
python3 pipeline/palette.py     # measures THE FIELD's seven hues; the gate FAILS if it never ran

cd site && npm install && npm run dev     # the piece
```

## The gate

`pipeline/qa.py` is the project's conscience, and it is an acceptance gate rather than a
file-presence check. Every shipping artifact is mandatory; every binary is decoded and asked what
it means rather than measured; every headline figure in `window.json` and `paint.json` is
reproduced from an independent path instead of read back from itself. A bare run is the full
shipping gate — every check group, plus the mutation suite. The group list is `GROUPS` in
`qa.py` and the run prints how many there are; it has grown every session and is not restated here.

```bash
python3 pipeline/qa.py                 # the full shipping gate (~15 s)
python3 pipeline/qa.py --mutations     # the defect catalogue alone (~8 s)
python3 pipeline/qa.py --no-mutations  # the checks without it
python3 pipeline/qa.py --no-raw        # a public clone with no data/shots/: says REDUCED
python3 pipeline/qa.py --spine-only    # the shot stage alone, while working on it
python3 pipeline/qa.py --only window,paint
python3 pipeline/qa.py --processed DIR # point every read at another artifact root
python3 pipeline/qa.py --slow          # + the recomputations that reopen the raw corpus
python3 pipeline/qa.py --write-deploy-allowlist   # regenerate pipeline/deploy_allowlist.json
```

Anything but a bare run prints `QA GREEN (REDUCED — …)` and says what it did not do. Only the
bare run is the gate.

**The defect catalogue** lives in `pipeline/checks/mutations.py`. Every defect is reintroduced on
a copy of `data/processed/` and each is required to be caught **by the named check
that owns it** — a mutation caught only by some unrelated check is a failure of the suite, not a
pass. It runs two ways, from one list:

```bash
python3 pipeline/qa.py --mutations           # in-process, seconds; part of every gate run
python3 pipeline/checks/mutations.py --list  # what each case is and which check owns it
python3 pipeline/checks/break_gates.py       # the same list, each through a real qa.py
                                             # subprocess on a mutated repo root (~80 s)
```

Add a gate, add its defect. A gate you cannot demonstrate going red is not evidence.

**Zone parity.** The league's seven-region map of the floor exists three times —
`pipeline/common.py:zone_at`, its vectorised twin `zone_at_np`, and `site/src/zone.ts:zoneAt` — and
THE HAND colours a stroke by the region it is crossing, so a drift between them turns a measurement
into a decoration. All three are checked against one committed fixture, and neither toolchain runs
the other's:

```bash
python3 pipeline/qa.py --write-zone-fixture   # regenerate it from common.zone_at
python3 pipeline/qa.py                        # the Python side
cd site && npm run gate                       # the TypeScript side (npm run build calls it)
```

## Probing the piece

Three diagnostics of the renderer, behind `?probe=` — `purity`, `perf` and `shots`. None is
reachable from the exhibit path: `main.ts` imports the probe module dynamically and only when the
parameter is present, so the gallery build never fetches the chunk and a probe run never starts the
loop. The first two write a
machine-readable verdict into the page, the console and the window globals — which are HYPHENATED,
`window["probe-purity"]` and `window["probe-perf"]`, and are not reachable as dotted identifiers.
This line named them `window.probePurity` / `window.probePerf` for two sessions; those read
`undefined`.

They are driven headlessly by a committed runner, which is how a sweep gets run repeatably and its
verdict committed. None is wired into `npm run build`: a purity sweep is minutes and performance
numbers are a property of the machine that took them. `npm run shots` is the third — it renders
exact frames through `renderTo` for a person to look at, and it is **not a gate and must not become
one**; its output is gitignored, because `docs/build/probe/` is where a verdict goes.

```bash
cd site && npm run dev                    # in one shell - the probes need the data synced
cd site && npm run probe:purity           # six hands + THE STACK's configurations, x the
                                          #   schedule-derived beats, two arms
cd site && npm run probe:perf             # one row per view per beat
cd site && npm run shots -- --list hands  # exact frames, for looking at
```

Verdicts land in `docs/build/probe/`. `--mode`, `--beat`, `--ops` and `--out` narrow a run and name its
output; an unmatched name is an error rather than an empty table. Read the RENDERER arm — the
history warms the caches on a scratch surface and the tested frame is drawn on a virgin one, so a
difference there is renderer state; `row.surfaceArm` is a kept second reading and carries no
verdict. THE STACK adds a third axis, the operation mask, so its rows sweep nothing-on, each
operation alone, and everything at once; and a **toggle round-trip** turns each operation on and
off at a held instant and requires the exact same bytes back, compared by hash rather than through
the noise predicate.

- `http://localhost:5173/?probe=purity` — the same instant reached four ways (continuous playback,
  a forward seek, a backward seek, and a cold direct load) and compared by exact pixel hash, at
  the schedule-derived beats (the run's own JSON names them; the count grew when the act
  boundaries were named and is not restated here). Read every verdict against the run's own measured **noise floor**:
  Canvas2D rasterisation is not bit-stable under memory pressure, an uncalibrated run blames the
  piece for the browser, and the floor is a property of the FRAME, so it is measured on the densest
  one in the sweep rather than at startup on a bare plate. Note the floor is not the tolerance:
  `aboveNoise` keeps a hard 1000-channel / delta-2 floor whatever it measures. `&exact=1` pins
  software rasterisation instead — the floor drops to zero and the run takes hours.
  `&playback=<seconds>` lengthens the continuous history.
- `http://localhost:5173/?probe=perf` — mean / p50 / p95 / max and over-budget frames per hand per
  beat, plus the draw calls each frame issues, timed on a fixed 1280×720 surface at DPR 2. It is
  thousands of renders and takes seconds — far quicker than the purity sweep, which is the one that
  costs minutes. `&mode=<id>`, `&t=<seconds>` and `&frames=<n>` narrow it to one answer.

`bloom.py` and `window.py` need one of `py7zr`, `p7zip`, or `bsdtar` to read the corpus archives;
GNU tar cannot. The shot-record stages need none of them.

`window.py` mirrors 3.79 GB and takes roughly 25 minutes. It writes one artifact per game, so a
run resumes where it stopped and one bad archive costs one game rather than the run. Leave `--jobs`
alone: the stage is bound by memory rather than cores, and more workers make it slower.

**Two modes, one codebase** — the whole piece is a pure function of one float, so both modes are
the same work sampled differently:

- **exhibit** (default) — one autoplaying loop, no chrome, no cursor, no loop seam. The schedule is
  declared once, in `site/src/timeline.ts`, and `pipeline/facts.py` derives the runtime from it into
  `facts.json:derived.loop.seconds`; `qa.py` gates every prose statement of it against that key.
  This file deliberately does not restate the number — unlike CLAUDE.md it is gated on the claims
  below rather than on all of them, so a figure written here could go stale unseen.
- **talk** (`?talk`) — a rail beside the plate listing every segment (Act 0, all thirty seasons
  under their act headings, the coda) with each season's measured mid-range share; click any of
  them to jump. Transport for start / previous / pause / next, plus a draggable scrub. Keys still
  work: `space` pause · `f` fermata · `0` start · `1`–`5` acts · `6`–`9` the window's four beats ·
  `w` the window · `,` `.` step a season · `h` cycle the hand. The window is 150 seconds and is the
  only segment with an inside, so the rail lists its four beats and the step buttons stop at each,
  and the rail prints the keys — a shortcut nobody is told about is not one.
  `?t=<seconds>` and `?year=<YYYY>` open on any beat; `?nav` adds the rail, `?nav=0` removes it.
  `?mode=<id>` pins one hand; the rail's hand row and `h` cycle through them and back to rotating.

**THE STACK is talk mode only, and `?mode=stack` is refused without `?talk` or `?nav`.** It opens
on bare stone and is driven entirely from the rail and the keyboard, neither of which exists on a
wall machine, so a gallery pinned to it would show an empty plate with no way out. Its seven
operations take one letter each — `l` `c` `i` `b` `d` `n` `e`, and `a` for ALL RENDERINGS — and the
same letters are the URL token, so `?talk&mode=stack&ops=lci&t=120` reopens an exact configured
frame and the address bar keeps naming the frame on screen as a presenter toggles.

The rail is deliberately absent from exhibit mode — the gallery loop shows nothing that looks like
it wants to be touched.

## Structure

```
CLAUDE.md          ground rules, findings, decisions log — and the seven rules, in full
DEPLOY.md          what has to be true on the day this repo goes public
docs/              the build plan (reference), the thesis, one handoff per session,
                   the typography inventory, the generated scalar disclosure, and
                   docs/build/probe/ — every committed purity and performance verdict
pipeline/          acquisition, aggregation, the QA gate, the corpus probe, traces,
                   the window, the paint, the cited facts, the palette measurement
site/              FADEAWAY — Vite + TS, Canvas 2D, one rAF loop
data/processed/    committed derived JSON  (raw data is gitignored, never committed)
```

## Provenance

NBA shot data via stats.nba.com, bulk archive [shufinskiy/nba_data](https://github.com/shufinskiy/nba_data).
Tracking from the public 2015-16 SportVU release
([linouk23](https://github.com/linouk23/NBA-Player-Movements) + mirrors, play-by-play via
[sealneaward](https://github.com/sealneaward/nba-movement-data)). Derived data only is committed
here. MIT.
