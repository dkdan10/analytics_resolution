# FADEAWAY

Studio piece for the paper **CONTESTED: How Data Is Defined, Gathered, and Owned**.

**Live:** <https://dkdan10.github.io/analytics_resolution/>. A bare visit is the 96-second guided
overview; `?experience=full` opens the canonical 50:00 six-hand work, and `?talk` opens that full
work as a paused presenter instrument.

---

## The piece

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
measure**, and **the hand** (paint). The measure follows a single published statistic,
closest-defender distance, through its three states. For most of the piece no such measure exists.
For 89 days in 2015-16 the
optical feed was public and the number can be *made*, out of all 632 games, in front of you. After
23 January 2016 four figures stay lit above four empty calipers for the rest of the loop: the
league still publishes those categories, and those are the last figures anyone outside could
compute. The enclosure is of the geometry, not of the numbers.

**The hand** is the painting. Its brush strokes are real player trajectories from the window
— one body, five seconds, one possession, every vertex a position the machine recorded — and its
colour is the league's own seven-region map of the floor, so a stroke recolours along its own
length as it crosses the lines the NBA drew. Twenty-nine seasons are splotches and nothing between
them, because that is all the record kept.

**The stack** is a seventh view, and it is not a hand. The six each render the whole record one way;
the stack renders nothing of its own. It composites the others' material over a single shared base,
one named interpretive operation at a time — LOCATE THE ATTEMPT, CLASSIFY THE FLOOR, INSCRIBE THE
SEASON, CONNECT THE BODY, MEASURE THE DEFENDER, NAME THE ACTION, COUNT THE EVENT, JOIN THE
INSTRUMENTS — and it opens with all eight switched off, on bare stone. Each control names an act
somebody performed on a list of coordinates rather than a renderer or a visual effect. A presenter
builds the image live, and ALL RENDERINGS applies every available operation at once until it is
released: the plate becomes illegible, which is the point, because maximal rendering is not maximal
access. It is **talk mode only** and is not in the gallery rotation, which stays six.

---

## Running it

The pipeline pins both its interpreter (`.python-version`, pyenv 3.9.4) and its libraries
(`requirements.txt`: numpy 2.0.2, pandas 2.3.2, colorspacious 1.1.2) — every published number was
produced and verified against exactly those. Each stage checks before it runs and explains itself if
the wrong `python3` won the PATH, which is easy to do: this machine carries four, two without numpy
at all and one with numpy 1.23.1 / pandas 1.4.3 that would otherwise run the acceptance gate to
green on libraries the results were never checked against.

```bash
pyenv install 3.9.4 && python3 -m pip install -r requirements.txt
# or, if python3 does not resolve to the pinned version:
#   $(pyenv root)/versions/$(cat .python-version)/bin/python3 pipeline/qa.py
```

```bash
python3 pipeline/acquire.py         # 30 season dumps -> data/shots/ + sha256 manifest
python3 pipeline/aggregate.py       # shares, samples, density grids, resolution regimes
python3 pipeline/qa.py              # acceptance gate: must reproduce the acceptance table exactly
python3 pipeline/sportvu_probe.py   # verifies the 2015-16 tracking corpus is still there
python3 pipeline/bloom.py           # Act III: ball traces, anchored at their own shot dots
python3 pipeline/window.py --probe-gate   # must reproduce the committed corpus fixture first
python3 pipeline/window.py          # all 632 tracking games -> the caliper, occupancy, the inventory
python3 pipeline/window.py --reduce       # fold the per-game artifacts into what the piece reads
python3 pipeline/paint.py           # THE HAND: the strokes, from one possession per game
python3 pipeline/paint.py --reduce
python3 pipeline/slate.py           # THE NIGHT: the Dec 5 2015 slate, ten games folded
python3 pipeline/game.py            # THE GAME: one full game, all ten bodies and the ball
python3 pipeline/facts.py           # the residue no dump supplies: cited history + derived schedule
python3 pipeline/palette.py         # measures THE FIELD's seven hues; the gate FAILS if it never ran

cd site && npm install && npm run dev     # the piece
```

`bloom.py` and `window.py` need one of `py7zr`, `p7zip`, or `bsdtar` to read the corpus archives;
GNU tar cannot. The shot-record stages need none of them. `window.py` mirrors 3.79 GB and takes
roughly 25 minutes; it writes one artifact per game, so a run resumes where it stopped and one bad
archive costs one game rather than the run. Leave `--jobs` alone — the stage is bound by memory
rather than cores, and more workers make it slower.

---

## The gate

`pipeline/qa.py` is an acceptance gate rather than a file-presence check. Every shipping artifact is
mandatory; every binary is decoded and asked what it means rather than measured; every headline
figure in `window.json` and `paint.json` is reproduced from an independent path instead of read back
from itself. **A bare run is the full shipping gate** — every check group, plus the mutation suite.
Anything else prints `QA GREEN (REDUCED — …)` and says what it did not do.

```bash
python3 pipeline/qa.py                 # the full shipping gate (~15 s)
python3 pipeline/qa.py --mutations     # the defect catalogue alone (~8 s)
python3 pipeline/qa.py --no-raw        # a public clone with no data/shots/: says REDUCED
python3 pipeline/qa.py --slow          # + the recomputations that reopen the raw corpus
python3 pipeline/qa.py --write-deploy-allowlist   # regenerate pipeline/deploy_allowlist.json
```

**The defect catalogue** lives in `pipeline/checks/mutations.py`. Every defect is reintroduced on a
copy of `data/processed/` and each of 120 seeded defects is required to be caught **by the named
check that owns it** — a mutation caught only by some unrelated check is a failure of the suite, not
a pass. The cases that edit the local working notes are skipped on a public clone, and the run
names them.

```bash
python3 pipeline/checks/mutations.py --list  # what each case is and which check owns it
python3 pipeline/checks/break_gates.py       # the same list, each through a real qa.py
                                             # subprocess on a mutated repo root (~80 s)
```

Add a gate, add its defect. A gate you cannot demonstrate going red is not evidence.

**Zone parity.** The league's seven-region map of the floor exists three times —
`pipeline/common.py:zone_at`, its vectorised twin `zone_at_np`, and `site/src/zone.ts:zoneAt` — and
THE HAND colours a stroke by the region it is crossing, so a drift between them turns a measurement
into a decoration. All three are checked against one committed fixture, and neither toolchain runs
the other's: `python3 pipeline/qa.py` for the Python side, `cd site && npm run gate` for the
TypeScript side (`npm run build` calls it).

---

## Probing the piece

Three diagnostics of the renderer, behind `?probe=` — `purity`, `perf` and `shots`. None is
reachable from the exhibit path: `main.ts` imports the probe module dynamically and only when the
parameter is present, so the gallery build never fetches the chunk and a probe run never starts the
loop. None is wired into `npm run build`: a purity sweep is minutes, and performance numbers are a
property of the machine that took them.

```bash
cd site && npm run dev                    # in one shell — the probes need the data synced
cd site && npm run probe:purity           # the same instant reached four ways, compared by hash
cd site && npm run probe:perf -- --assert-presentation
cd site && npm run shots -- --list hands  # exact frames, for looking at
```

Verdicts land in `docs/probe/`. `--mode`, `--beat`, `--ops` and `--out` narrow a run and name its
output; **`--out` is a NAME, not a path**, and an unmatched name is an error rather than an empty
table. Read the **RENDERER** arm — the history warms the caches on a scratch surface and the tested
frame is drawn on a virgin one, so a difference there is renderer state; `row.surfaceArm` is a kept
second reading and carries no verdict.

Read every purity verdict against the run's own measured **noise floor**: Canvas2D rasterisation is
not bit-stable under memory pressure, and an uncalibrated run blames the piece for the browser. The
floor is a property of the FRAME, so it is measured on the densest one in the sweep. The floor is
not the tolerance — `aboveNoise` keeps a hard 1000-channel / delta-2 floor whatever it measures.
`&exact=1` pins software rasterisation instead: the floor drops to zero and the run takes hours.

The window globals are HYPHENATED — `window["probe-purity"]` and `window["probe-perf"]` — and are
not reachable as dotted identifiers. `npm run shots` is **not a gate and must not become one**.

---

## Viewer entry and presenter controls

The renderer reads one deterministic score; these routes decide how it is sampled and whether
working controls are visible.

- A bare `/` plays the **96-second guided overview**: an introduction, one named Window chapter for
  each of the six hands, and a coda. `?experience=overview` requests it explicitly.
- `?experience=full` plays the canonical **50:00 work** without chrome: six complete passes in the
  order plate, field, ledger, census, measure, hand.
- `?talk` opens the full work with the presenter rail and starts **paused**; `&autoplay=1` begins
  moving immediately. `?nav` adds the rail to an autoplaying full view; `?nav=0` removes it.
- Direct addresses — `?t=<seconds>`, `?year=<YYYY>`, `?stop=<semantic-id>`, `?mode=<id>`,
  `?ops=<letters>` — select the full work. `?stop=` is the durable presenter form (`hand.game`,
  `plate.shell`, `ledger.crest`, `census.machine-saw`, `measure.terminal`, `window.crest`).
  **CITE THIS FRAME** uses a semantic stop when the playhead is on one and an exact `t` otherwise.
- `?display=near|room` selects viewer-distance legibility. Talk mode defaults to `room`; other
  entries default to `near`.

Keys: `space` pause · `f` fermata · `0` start · `1`–`5` acts · `6`–`9` the four **shared** Window
beats · `w` Window · `x` the cut · `,` `.` previous/next scored stop · `h` hand. Pinning a hand
changes the Window sub-stops and scrub ticks to that hand's interior; it does not move the shared
`6`–`9` anchors. The 150-second Window's shared score is ONE 0–15, NIGHT 15–42, SEASON 42–121.95,
CLOSE 121.95–150.

**THE STACK is presenter-only** — `?mode=stack` is refused without `?talk` or a visible `?nav`. Its
eight operations take one letter each (`l` `c` `i` `b` `d` `n` `e` `j`, with `a` for ALL
RENDERINGS), and the same letters form the URL token. CONNECT, MEASURE and JOIN are Window-only. A
configured frame such as `?talk&mode=stack&ops=lcij&stop=window.crest` is reopenable without
replaying the button presses.

---

## Deploying

```bash
cd site && npm run deploy:pages   # the seven-step gated build, then publish dist/ to gh-pages
```

That is the whole of a re-deploy. `DEPLOY.md` is the release checklist and the record of what
"public" means here.

## Structure

```
CLAUDE.md          ground rules, the seven rules, gotchas, decisions
DEPLOY.md          the release checklist, the host, and what "public" means
docs/build/        findings.md — the building record, with its gated figures
docs/              the generated scalar disclosure; probe verdicts (gitignored)
pipeline/          acquisition, aggregation, the QA gate, the corpus probe, traces,
                   the window, the paint, the slate, the game, the cited facts,
                   the palette measurement
site/              FADEAWAY — Vite + TS, Canvas 2D, one rAF loop
data/processed/    committed derived JSON  (raw data is gitignored, never committed)
```

## Provenance

NBA shot data via stats.nba.com, bulk archive [shufinskiy/nba_data](https://github.com/shufinskiy/nba_data).
Tracking from the public 2015-16 SportVU release
([linouk23](https://github.com/linouk23/NBA-Player-Movements) + mirrors, play-by-play via
[sealneaward](https://github.com/sealneaward/nba-movement-data)). Derived data only is committed
here; `traces.json` ships player names, game ids, matchups and dates by deliberate decision.

Code is MIT — see `LICENSE`.
