#!/usr/bin/env python3
"""Stage 3 - the acceptance gate.

Two jobs, and the second one is newer than the first.

ONE. Regenerated aggregates must reproduce the measured table in
docs/build-plan-v2.md section 1.6 EXACTLY. If those numbers differ, the pipeline
is wrong, not the plan (CLAUDE.md ground truth).

TWO. Every artifact the piece ships must be PRESENT and SEMANTICALLY WHOLE. The
gate used to certify the work with the window and paint stages deleted from
disk, with binaries replaced by equal-length runs of zeros, with every approach
sample set to 999 ft and every contest bound to 99-100 ft. It validated files by
their byte length and read headline figures back out of the file that wrote
them. It does not do any of that now: every binary is decoded, every headline
figure is recomputed from an independent path, and `--mutations` reintroduces
each historic defect on a copy and requires the check that owns it to go red.

A note on the constants below. Several are test fixtures - numbers measured from
a real run and pinned so a regression cannot pass quietly. Each says what
measured it and when. None of them is a display figure; nothing here is quoted
on screen (CLAUDE.md honesty rule).

Usage: python3 pipeline/qa.py                  # the full shipping gate
       python3 pipeline/qa.py --no-mutations   # ... without the mutation suite
       python3 pipeline/qa.py --no-raw         # data/shots/ absent: REDUCED
       python3 pipeline/qa.py --spine-only     # the shot stage alone
       python3 pipeline/qa.py --only window,paint
       python3 pipeline/qa.py --processed DIR  # point every read at DIR
       python3 pipeline/qa.py --mutations      # the mutation suite alone
       python3 pipeline/qa.py --slow           # + the raw-corpus recomputations
       python3 pipeline/qa.py --write-zone-fixture   # regenerate the parity fixture
       python3 pipeline/qa.py --write-deploy-allowlist   # regenerate the deploy list
"""

import argparse
import json
import math
import struct
import sys
from datetime import date as _date
from pathlib import Path

# The interpreter check runs before numpy is imported. Reversed, a reader on the
# wrong python3 gets `ModuleNotFoundError: numpy` and goes looking for a missing
# package, when the real problem is that the wrong interpreter won the PATH.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    CORNER_X,
    CORNER_Y,
    FREE_THROW_Y,
    HALF_Y_MAX,
    HALFCOURT_Y,
    LANE_HALF_W,
    PROCESSED_DIR,
    REPO_ROOT,
    RESTRICTED_R,
    THREE_R,
    ZONE_NAMES,
    read_season_csv,
    require_env,
    zone_at,
)

require_env()

import numpy as np  # noqa: E402

from aggregate import POINT_DTYPE, SENTINEL_LEAD  # noqa: E402

# The rules' own constants, imported rather than restated: a gate that reads its
# threshold out of the file it is checking is not a gate. Session 1 shipped four
# of those, and the paint's residual gate compared paint.py's reported maximum
# against paint.py's reported threshold.
from window import (  # noqa: E402
    MAX_ANCHOR_RESIDUAL_FT,
    MAX_EVENT_OFFSET,
    MAX_STEP_FT,
    MIN_OFFSET_VOTES,
    OFFSET_MIN_MARGIN,
    OFFSET_OVER_ZERO,
)
from paint import (  # noqa: E402
    COINCIDENCE_FRAMES,
    COINCIDENCE_FT,
    COINCIDENCE_SECONDS as COINCIDENCE_SECONDS_QA,
)

# Plan section 1.6, measured 2026-08-04 (test fixture, not display copy).
EXPECTED_TOTAL_ATTEMPTS = 5_933_691
EXPECTED_SEASONS = 30

# start_year -> (mid-range share %, 3PT share %), 1 decimal.
TABLE_1_6 = {
    1996: ("39.9", "21.2"),
    2003: ("35.6", "18.7"),
    2012: ("28.3", "24.3"),
    2015: ("24.6", "28.4"),
    2019: ("13.3", "38.4"),
    2024: ("9.7", "42.1"),
}

# Supporting measured claims stated elsewhere in the plan.
EXPECTED_2025_ATTEMPTS = 219_160          # Appendix C
EXPECTED_2025_MID = "10.0"                # section 1.6 note: "the floor"
EXPECTED_1997_THREE = "16.0"              # section 3.1 Act I: the line's retreat
EXPECTED_2022_MID = "11.9"                # section 3.1 Act IV: the collapse completes
SHORT_SEASON_KATTEMPTS = {1998: 113, 2011: 161, 2019: 188}  # section 3.1

# Schedule math: 29 teams x 82 / 2 = 1189 through 2003-04; 30 teams -> 1230.
# Overrides: 1998 lockout, 2011 lockout, 2012 BOS@IND cancellation (Boston
# Marathon bombing), 2019 COVID/bubble, 2020 72-game pandemic schedule.
EXPECTED_N_GAMES = {y: (1189 if y < 2004 else 1230) for y in range(1996, 2026)}
EXPECTED_N_GAMES.update({1998: 725, 2011: 990, 2012: 1229, 2019: 1059, 2020: 1080})

# --- The record's own resolution (FADEAWAY's texture ladder) -----------------
# Four regimes, measured 2026-08-06 from the bulk mirror and confirmed live
# against stats.nba.com (2009-10, 2010-11, 2024-25 rates and action types).
# Classification is derived in aggregate.py from the spread across arenas; these
# gates pin the result so a re-acquisition cannot move it silently.
EXPECTED_REGIMES = {}
for _y in range(1996, 2026):
    if _y == 1996:
        EXPECTED_REGIMES[_y] = "uniformly_blind"
    elif _y <= 2009:
        EXPECTED_REGIMES[_y] = "uneven"
    elif _y <= 2019:
        EXPECTED_REGIMES[_y] = "uniformly_sighted"
    else:
        EXPECTED_REGIMES[_y] = "categorical_refusal"

# Restricted-area shots the record filed at the origin, as a percentage.
EXPECTED_RA_ORIGIN = {1996: "95.4", 2009: "74.8", 2010: "0.0", 2015: "0.0", 2024: "9.3"}

# Cleveland is the one arena present in every season of the uneven era.
UNEVEN_CONSTANT_ARENA = "CLE"

# 1996-97 taxonomy anachronism: the 22-ft line of 1994-97 against modern polygons.
EXPECTED_MISFILED_THREES = 19_165
EXPECTED_CONTEMPORANEOUS_MID = "29.8"

# --- The record's vocabulary (the second curve; drives THE LEDGER) -----------
# How many words the record has for what a shot was. Measured 2026-08-06.
EXPECTED_WORDS = {1996: 9, 2000: 25, 2007: 50, 2015: 53, 2024: 48}
# "Fadeaway" is not in the record until 2001-02 - the piece is named for a word
# the archive had to learn, and that is content, so it is gated.
FADEAWAY_FIRST_YEAR = 2001

# Every taxonomy the record applies to a shot, added up: shot type, made/missed,
# zone, range, area, and the description. This is the size of the machine's
# whole vocabulary for saying what happened, and THE CENSUS tallies it live.
EXPECTED_CATEGORIES = {1996: 31, 2000: 47, 2007: 72, 2015: 75, 2024: 70}
# The five taxonomies that never move; only the description grows.
FIXED_TAXONOMIES = {
    "SHOT_TYPE": 2, "EVENT_TYPE": 2, "SHOT_ZONE_BASIC": 7,
    "SHOT_ZONE_RANGE": 5, "SHOT_ZONE_AREA": 6,
}

# The halfcourt box every shot artifact is clipped to, in tenths of a foot.
# Widened two tenths each way from plan section 3.2 so grid bins are whole feet
# and sample/grid totals assert equal (CLAUDE.md decisions log).
PLATE_X, PLATE_Y = (-250, 250), (-50, 420)

# --- The window (pipeline/window.py) ----------------------------------------
# The 2015-16 SportVU public release, measured 2026-08-06 and re-verified live.
# 636 archives, four of them 32-byte shells, ten misnamed upstream: 632 games.
# 622 is the number a filename filter produces, and it is the bug these gates
# exist to catch (CLAUDE.md gotcha, and bloom.py still has it).
EXPECTED_WINDOW_GAMES = 632
EXPECTED_WINDOW_ARCHIVES = 636
EXPECTED_WINDOW_SHELLS = 4
EXPECTED_WINDOW_MISNAMED = 10
EXPECTED_WINDOW_DATES = ("2015-10-27", "2016-01-23")

# How many of the record's filed shots survive the geometric join check.
# Measured across all 632 games on 2026-08-08: 0.4545. This floor sits below
# that as a REGRESSION GUARD, not a target - a detector that silently halved
# would still emit a plausible-looking artifact, and this is what catches it.
#
# The shortfall is mostly not detector failure. It is the archive disagreeing
# with itself: the coordinate a scorer filed courtside and the position the
# optical feed gives the ball at release are two different instruments, parting
# company by a median of ~4.8 ft. An oracle allowed to pick the best reading of
# the tracking still reconciles only 83%. Five independently designed release
# detectors all failed to beat the simple one. That gap is a property of the
# record, so window.json ships it under `disagreement`.
WINDOW_RECOVERY_FLOOR = 0.40

# The recovered set cannot be unbiased: detection follows the ball back from the
# rim, so shots that reach the rim - all made ones - are over-represented.
# Measured at +5.6 pp on FG%. The gate bounds it and the piece discloses it.
WINDOW_MAX_FG_BIAS_PP = 9.0

# A court is 94 x 50 ft, so its longest diagonal is ~106 ft and no closest
# defender can be further away than that. Derived from the floor, not chosen:
# it is the bound that makes "every approach sample set to 999 ft" impossible
# to ship, which is what the audit demonstrated the gate could not see.
MAX_ON_COURT_FT = math.hypot(94.0, 50.0)

# Two independent paths to the release instant: the last sample of the approach
# curve, and the mean of the per-shot caliper recomputed from window_measures.bin.
# The curve is rounded to 2 dp and the endpoints to tenths, so they cannot be
# bit-identical. Measured 2026-08-08: 4.72 against 4.724, a gap of 0.004 ft.
# The bound is a tenth - one coordinate quantum - which is two orders of
# magnitude below the 999 ft mutation and an order above the observed gap.
APPROACH_RELEASE_TOL_FT = 0.10

# Coordinates round to whole tenths of a foot, so a recomputed length can differ
# from a stored one by up to the diagonal of one quantum plus the stored value's
# own rounding. Derived, not chosen; used for both the caliper endpoints and the
# paint's chord-against-arc.
QUANTUM_FT = math.hypot(0.1, 0.1) + 0.05

# window_measures.bin used to store the caliper in ONE BYTE of tenths, so
# anything at or beyond 25.5 ft was filed at the ceiling: 30 of 48,330 records,
# the longest of them 51.85 ft, all collapsed onto the same value while the
# renderer read that value as a distance (audit F-05). Session 3 widened the
# field to uint16, which nothing on a basketball floor can reach, and window.py
# now stops rather than clips. So the count is ZERO and stays zero.
#
# The encoding's adequacy is enforced where the bytes are written - window.py
# dies on a caliper that does not fit - rather than by a check here that no
# mutation of the artifact could ever fail.
#
# MEASURES_MAX_RECOMPUTED_FT reads the ENDPOINTS, not the stored length, which is
# why it is unchanged by the re-encoding: 51.85 ft was always what the two
# coordinates described, and it is now also what the file says.
MEASURES_CEILING_RECORDS = 0
MEASURES_MAX_RECOMPUTED_FT = 51.85

# window_measures.bin is NOT clipped to the plate box the renderer draws. It
# carries the coordinate the record filed, and the record files shots taken from
# outside the sideline - a shot is where the shooter was, not where the drawing
# stops. Measured 2026-08-08: 12 of 48,330 shooters sit off the plate box, and
# the furthest coordinate of any kind - shooter or defender - sits 3.4 ft
# outside the 94 x 50 court, which is a body standing in the apron.
MEASURES_OFF_PLATE_RECORDS = 12
MEASURES_MAX_OFF_COURT_FT = 3.4

# The tracking court in the plate's own frame, derived from the hoop positions
# rather than restated: 94 x 50 ft, the hoop 5.25 ft in from the baseline and
# centred between the sidelines, coordinates in tenths.
from common import HOOP_LEFT_X, HOOP_RIGHT_X, HOOP_Y  # noqa: E402

#   x: half the 50 ft width either side of the hoop's own centre line
#   y: the near baseline 5.25 ft behind the hoop, the far one 88.75 ft in front
COURT_BOX_X = (-10 * HOOP_Y, 10 * HOOP_Y)
COURT_BOX_Y = (-10 * HOOP_LEFT_X, 10 * HOOP_RIGHT_X)

# A hero's track ships coordinates rounded to a hundredth of a foot, so a step
# recomputed from what shipped cannot reproduce the full-precision figure the
# artifact reports. Derived from that storage, not chosen.
TRACK_QUANTUM_FT = math.hypot(0.01, 0.01) + 0.005

# THE HAND colours strokes by the zone they cross, so the reconstruction of the
# league's regions has to BE the league's. Measured 2026-08-07 over all 207,893
# of 2015-16's shots: 99.993%. The floor is set just below, as a regression
# guard - if the geometry drifts, the colour stops being a measurement.
ZONE_AGREEMENT_FLOOR = 0.999
# How many checks the raw-dump group runs. Declared so `--no-raw` can say what
# it did not do, and asserted when the group runs so it cannot drift.
ZONE_VS_LEAGUE_CHECKS = 4

# points/*.bin files the league's OWN SHOT_ZONE_BASIC label per cell, not the
# geometric reconstruction - the two are different claims and the piece needs
# both (Rule 4: colour exposes the league's classification, it does not add
# one). Where they disagree, the disagreement must be a BOUNDARY CONVENTION and
# nothing else: the cell must sit within this distance of the region the league
# filed it in. Measured 2026-08-08 over all 30 seasons - 340 distinct
# coordinates disagree, every one of them within 1.5 tenths, and the bound is
# set by the two boundaries that do not fall on the coordinate lattice
# (CORNER_Y = 89.48 tenths, and HALFCOURT_Y = 417.5 against cells at 419).
POINTS_ZONE_BOUNDARY_MAX_TENTHS = 1.5
POINTS_ZONE_DISAGREEING_COORDS = 340

# The canvas: one possession per game, spread across the window's 89 days. Both
# are floors; the terminus is gated against the corpus's own dates instead.
EXPECTED_PAINT_CANVASES = 240
EXPECTED_PAINT_DAYS = 60

# A canvas is ten bodies and the ball. After a path is cut at its
# discontinuities one body can be several strokes, so the stroke COUNT per
# canvas is no longer an invariant - the number of distinct bodies is. paint.py
# refuses a canvas that cannot field this many.
MIN_BODIES_PER_CANVAS = 8
MAX_BODIES_PER_CANVAS = 11

# paint.py counts a vertex off the plate box from the FLOAT coordinate, before
# it is rounded into int16; the shipped bytes carry the rounded one, and 27 of
# them round back onto the plate. Both figures are right about different things.
# Measured from the bytes 2026-08-08: 1,971 against paint.json's 1,998.
PAINT_OFF_PLATE_VERTICES = 1971

# What the coincidence rule can be asked of the SHIPPED BYTES, which is not the
# same question. paint.py refuses on the measured 25 Hz path; the bytes carry the
# simplified line, and Douglas-Peucker can pull two genuinely separated bodies
# closer than their measured separation - the shipped minimum is 0.368 ft on the
# feed and 0.275 ft once drawn. So the byte-level gate is the STORAGE-level one:
# a merged track is the feed repeating a row, which survives simplification as
# literally the same tenths, and two distinct bodies drawn to within one
# coordinate quantum for half a second is that signature.
BYTE_COINCIDENCE_FT = 0.1

# No body or ball may be drawn faster than this. Derived from the corpus rather
# than chosen: paint.json publishes p99 speeds of 18.3 ft/s for bodies and 45
# ft/s for the ball, and the splitter already cuts any step over MAX_STEP_FT per
# frame. A shot ball leaves the hand at ~30 mph, so 75 ft/s is past anything a
# basketball does and far below the 30-ft teleports F-02 was shipping.
MAX_PAINT_SPEED_FT_S = 75.0

# The held-out split is only evidence if it is drawn from most of the corpus and
# the straight join actually reproduces on half of it. Both are regression
# guards set below the measured values, not targets. Session 1's gate asked only
# that the figure EXISTED, which one testable game at 0.0001 satisfied.
#
# Measured 2026-08-08, over the FULL release set: 384 of 632 games testable
# (0.608), and within them the straight join reproduces 304/307 = 0.9902.
HELD_OUT_MIN_SHARE = 0.5
HELD_OUT_STRAIGHT_FLOOR = 0.95

# --- traces.json (pipeline/bloom.py) -----------------------------------------
# 32 curated gestures. bloom.py hits the GitHub API live and re-derives from the
# tracking archives, so this artifact is gated as committed rather than
# regenerated. Measured from it 2026-08-08: 32 traces, residual median 1.22 ft,
# max 2.70, every release point within 2.71 ft of its anchor, largest
# frame-to-frame ball displacement 2.27 ft in three dimensions.
EXPECTED_TRACES = 32
# A ball travels at most ~75 ft/s (see MAX_PAINT_SPEED_FT_S) and the feed runs at
# 25 Hz, so 3 ft between consecutive frames is already past anything physical.
MAX_TRACE_STEP_FT = 3.0

# --- the site's decoders -----------------------------------------------------
# Nothing type-checks a byte layout. `npx tsc --noEmit` and `npm run build` both
# pass while site/src/data.ts decodes a record width the pipeline stopped
# writing, so this is the only automated detector that the two halves of the
# project disagree about a format. It reads the site's own constants out of the
# TypeScript source and the pipeline's out of the artifacts - never the format
# from the artifact on both sides, which would defeat it.
DECODER_SOURCES = {
    "vertex": ("site/src/data.ts", r"VERTEX_REC"),
    "stroke": ("site/src/data.ts", r"STROKE_REC"),
    "measure": ("site/src/data.ts", r"MEASURE_REC"),
    "point": ("site/src/field.ts", r"REC"),
}
# A WAIVER names a mismatch that is known, owned and dated. It keeps the check
# real in BOTH directions: an un-waived mismatch fails, and a waiver whose
# mismatch has gone also fails, so whoever fixes it has to delete the waiver
# rather than leave a dead exemption behind.
#
# THE TABLE IS EMPTY, and that is the finished state, not an oversight. Session
# 1 re-encoded the paint binaries to fix F-02 and left site/src/data.ts on the
# old widths deliberately - session 1 was pipeline-only - so `vertex` (6 vs 8)
# and `stroke` (8 vs 11) sat here waived for three sessions. Session 4 landed
# the reader and deleted them, which is what the reverse direction exists to
# force. One consequence, stated rather than left to be discovered: while this
# table is empty the reverse direction cannot be exercised by any mutation, so
# the catalogue's decoder case now proves the FORWARD one - see
# checks/mutations.py:m_paint_stale_reader.
DECODER_WAIVERS = {}

# The parity fixture both zone implementations are checked against. Python
# writes it, python re-derives it, and site/scripts/zone-gate.mjs checks the
# TypeScript copy against the same file - so neither toolchain has to run the
# other's.
ZONE_FIXTURE = Path(__file__).resolve().parent / "checks" / "zone_fixture.json"


def pct(x):
    return f"{100 * x:.1f}"


def _brief(v, width=110):
    """A value short enough to read on one line, without changing the comparison."""
    s = repr(v)
    if len(s) <= width:
        return s
    if isinstance(v, list):
        return f"{repr(v[:3])[:-1]}, ... +{len(v) - 3} more]"
    return s[:width] + "..."


# --- the gate ----------------------------------------------------------------


class Gate:
    """Records failures rather than exiting inside a check.

    The printed shape is unchanged - PASS/FAIL per line, informational lines,
    one verdict - because that is how this project reads its own conscience, and
    because the mutation suite asserts on the check NAMES.
    """

    def __init__(self, quiet=False):
        self.failures = []
        self.n_checks = 0
        self.group = "-"
        self.quiet = quiet

    def say(self, line=""):
        if not self.quiet:
            print(line)

    def section(self, title):
        self.say(f"\n{title}")

    def check(self, name, got, want):
        ok = got == want
        self.n_checks += 1
        self.say(f"  {'PASS' if ok else 'FAIL'}  {name}: got {_brief(got)}, "
                 f"expected {_brief(want)}")
        if not ok:
            self.failures.append((self.group, name, got, want))
        return ok

    def holds(self, name, cond, detail=""):
        """A check whose interesting half is a condition, not a value."""
        return self.check(f"{name}{f' ({detail})' if detail else ''}", bool(cond), True)

    def fail(self, name, why):
        self.n_checks += 1
        self.say(f"  FAIL  {name}: {why}")
        self.failures.append((self.group, name, why, "no failure"))
        return False

    def waived(self, name, why):
        self.say(f"  WAIVED  {name}: {why}")

    def info(self, msg):
        self.say(f"  (informational) {msg}")

    def names(self):
        return [n for _g, n, _got, _want in self.failures]


class Ctx:
    """Everything a group reads, resolved against one processed root.

    A missing required artifact is a FAILURE recorded by the `inventory` group;
    the group that needed it returns early rather than raising, so one deletion
    produces one clear red line instead of a traceback.
    """

    def __init__(self, root, allow_raw=True, repo=None):
        self.root = Path(root)
        self.allow_raw = allow_raw
        # Two groups read files OUTSIDE data/processed/ - the deploy allowlist
        # under pipeline/, and CLAUDE.md. Both must be aimable at a copy, or
        # the mutation suite cannot test the gates that read them.
        self.repo = Path(repo) if repo else REPO_ROOT
        self._json = {}
        self._bytes = {}

    def json(self, g, name):
        if name in self._json:
            return self._json[name]
        p = self.root / name
        if not p.exists():
            g.fail(f"required artifact present: {name}", f"{p} missing")
            self._json[name] = None
            return None
        try:
            self._json[name] = json.loads(p.read_text())
        except Exception as e:  # noqa: BLE001 - a corrupt artifact is a failure, not a crash
            g.fail(f"required artifact parses: {name}", f"{type(e).__name__}: {e}")
            self._json[name] = None
        return self._json[name]

    def raw(self, g, name):
        if name in self._bytes:
            return self._bytes[name]
        p = self.root / name
        if not p.exists():
            g.fail(f"required artifact present: {name}", f"{p} missing")
            self._bytes[name] = None
            return None
        self._bytes[name] = p.read_bytes()
        return self._bytes[name]

    def seasons(self, g):
        f = self.json(g, "seasons.json")
        return {row["year"]: row for row in f["seasons"]} if f else None


# --- the required inventory --------------------------------------------------
# Held HERE, not in a manifest inside data/processed/: the gate must not take its
# expectations from the thing it is checking. `public` is what session 3's deploy
# allowlist (F-07) hangs off - flip a value, do not restructure the table.

class Artifact:
    def __init__(self, path, kind, public=True, stamp="generated_at", per_season=False):
        self.path = path
        self.kind = kind              # "json" | "bin"
        self.public = public          # does the shipping build serve it? (session 3)
        self.stamp = stamp            # the header key carrying its generation time
        self.per_season = per_season

    def paths(self, years):
        if not self.per_season:
            return [self.path]
        return [self.path.format(year=y) for y in years]


# THE DEPLOY SERVES THE ARTWORK. `public` is reviewed, one row at a time, and
# the rule it was reviewed under is stated so a later session can apply it
# rather than guess: an artifact ships if the piece FETCHES it, or if it is
# provenance the piece cites on screen. Everything else stays in the repo -
# which is public from deploy day - without being served to every visitor.
#
# Before session 3 there was no such list. site/scripts/sync-data.mjs was 22
# lines of `rm -rf` then `cp -r`, so any file that appeared under
# data/processed/ - a future private intermediate, a scratch export, a debug
# dump - was published the moment it existed, and nobody decided that (F-07).
REQUIRED_ARTIFACTS = [
    Artifact("seasons.json", "json"),
    Artifact("facts.json", "json"),
    # Operational metadata. Nothing fetches it, and the provenance the piece
    # actually cites ships inside seasons.json:provenance, so the deploy does
    # not serve the workshop's own paperwork.
    Artifact("acquisition_manifest.json", "json", public=False, stamp="fetched_at"),
    # Fetched: data.ts reads `corpus_listing` out of it for Act III.
    Artifact("sportvu_probe.json", "json", stamp="probed_at"),
    Artifact("window.json", "json"),
    # Archive names, hashes and sizes that nothing renders.
    Artifact("window_manifest.json", "json", public=False, stamp="fetched_at"),
    Artifact("window_measures.bin", "bin"),
    Artifact("paint.json", "json"),
    Artifact("paint_strokes.bin", "bin"),
    Artifact("paint_index.bin", "bin"),
    # Ships identity on purpose - names, games, matchups - and that is the
    # accepted tracking-publication decision recorded in CLAUDE.md, not an
    # oversight. group_traces gates it as shipped.
    Artifact("traces.json", "json"),
    Artifact("samples/season_{year}.json", "json", stamp=None, per_season=True),
    # Complete one-foot density grids. Superseded on screen by points/*.bin,
    # which THE FIELD bakes every shot from; no renderer fetches these.
    Artifact("grids/season_{year}.json", "json", public=False, stamp=None,
             per_season=True),
    # The near-complete native-coordinate multiset. PUBLICATION ACCEPTED by the
    # artist, 2026-08-08: "points/*.bin does satisfy the project's standard."
    # It is a per-coordinate COUNT, not a per-shot row carrying identities,
    # dates or teams; the shot record is already public via stats.nba.com and
    # the shufinskiy mirror; and the work's argument - every shot renders -
    # cannot be made from a residue of itself. Reviewed, not defaulted.
    Artifact("points/season_{year}.bin", "bin", per_season=True),
    # THE FIELD's hues and what they measurably separate by (audit V-03). NOT
    # served: nothing fetches it, and the piece cites no figure from it on
    # screen, which is the whole of the publish rule. The hues themselves live
    # in site/src/palette.ts, where an authored scalar belongs; this is the
    # CLAIM about them, and the palette group binds the two.
    Artifact("palette.json", "json", public=False),
]

# Where the Node half reads the same decision. Written by
# `python3 pipeline/qa.py --write-deploy-allowlist`, committed, and gated below
# against the table above so the two cannot drift. It lives under pipeline/ and
# NOT at the repo root: checks/break_gates.py assembles its mutation root from
# pipeline/, data/processed/, site/src/ and two dotfiles, so a repo-root file
# would be absent there and the unmutated baseline would go red.
DEPLOY_ALLOWLIST = Path(__file__).resolve().parent / "deploy_allowlist.json"


# --- decoders ----------------------------------------------------------------
# Every layout is read from the artifact's OWN declaration so the gate follows a
# re-encoding instead of contradicting it. What the gate never takes from the
# artifact is the THRESHOLD it is judged against.


def decode_points(buf):
    return np.frombuffer(buf, dtype=POINT_DTYPE)


def _field_ceiling(rec, index):
    """The largest value the `index`-th field of a struct format can hold.

    Read from the layout the artifact declares, so a check about clipping
    follows a re-encoding rather than asking after a sentinel that has stopped
    meaning anything. Signed fields return None: nothing clips onto them.
    """
    codes = rec.lstrip("<>=!@")
    return {"B": 0xFF, "H": 0xFFFF, "I": 0xFFFFFFFF,
            "L": 0xFFFFFFFF, "Q": (1 << 64) - 1}.get(codes[index])


def decode_measures(buf, spec):
    rec, size = spec["record"], struct.calcsize(spec["record"])
    n = len(buf) // size
    cols = list(zip(*(struct.unpack_from(rec, buf, i * size) for i in range(n)))) if n else []
    keys = ("x", "y", "dx", "dy", "dist", "bucket", "made", "day")
    out = {k: np.array(c) for k, c in zip(keys, cols)}
    out["n"] = n
    out["ragged"] = len(buf) % size
    return out


def decode_paint(vbuf, ibuf, files):
    srec, vrec = files["index"]["record"], files["vertices"]["record"]
    ssz, vsz = struct.calcsize(srec), struct.calcsize(vrec)
    strokes = [struct.unpack_from(srec, ibuf, i * ssz) for i in range(len(ibuf) // ssz)]
    verts = [struct.unpack_from(vrec, vbuf, i * vsz) for i in range(len(vbuf) // vsz)]
    return strokes, verts, (len(ibuf) % ssz, len(vbuf) % vsz)


def zone_at_np(x, y):
    """The vector twin of common.zone_at, in the same precedence order.

    A second implementation is a liability unless something proves it is the
    same one, so it is checked against the shared parity fixture like the
    TypeScript copy is - see group_zone_parity.
    """
    r = np.hypot(x, y)
    z = np.full(np.shape(x), 2, np.uint8)
    z[(np.abs(x) <= LANE_HALF_W) & (y <= FREE_THROW_Y)] = 1
    z[r <= RESTRICTED_R] = 0
    z[r >= THREE_R] = 5
    corner = (np.abs(x) >= CORNER_X) & (y <= CORNER_Y)
    z[corner & (x < 0)] = 3
    z[corner & (x >= 0)] = 4
    z[y > HALFCOURT_Y] = 6
    return z


# --- group: the shot spine ---------------------------------------------------


def group_spine(g, ctx):
    seasons = ctx.seasons(g)
    if not seasons:
        return
    g.section("Acceptance vs build-plan section 1.6")
    g.check("season count", len(seasons), EXPECTED_SEASONS)
    g.check("total attempts", sum(r["attempts"] for r in seasons.values()),
            EXPECTED_TOTAL_ATTEMPTS)

    for year, (mid, three) in sorted(TABLE_1_6.items()):
        if year not in seasons:
            g.fail(f"season {year} present", "missing from seasons.json")
            continue
        label = seasons[year]["season"]
        g.check(f"{label} mid-range share", pct(seasons[year]["mid_share"]), mid)
        g.check(f"{label} 3PT share", pct(seasons[year]["three_share"]), three)

    if 2025 in seasons:
        g.check("2025-26 attempts", seasons[2025]["attempts"], EXPECTED_2025_ATTEMPTS)
        g.check("2025-26 mid-range share", pct(seasons[2025]["mid_share"]), EXPECTED_2025_MID)
    if 1997 in seasons:
        g.check("1997-98 3PT share (line retreat)",
                pct(seasons[1997]["three_share"]), EXPECTED_1997_THREE)
    if 2022 in seasons:
        g.check("2022-23 mid-range share (Act IV endpoint)",
                pct(seasons[2022]["mid_share"]), EXPECTED_2022_MID)
    for year, k in SHORT_SEASON_KATTEMPTS.items():
        if year in seasons:
            g.check(f"{seasons[year]['season']} attempts (~{k}k, short season)",
                    round(seasons[year]["attempts"] / 1000), k)

    g.check("per-season game counts vs schedule", [
        f"{seasons[y]['season']}: {seasons[y]['n_games']} != {EXPECTED_N_GAMES[y]}"
        for y in sorted(seasons)
        if y in EXPECTED_N_GAMES and seasons[y]["n_games"] != EXPECTED_N_GAMES[y]
    ], [])


def group_resolution(g, ctx):
    seasons = ctx.seasons(g)
    if not seasons:
        return
    g.section("The record's own resolution")
    g.check("resolution regimes (4 eras)", [
        f"{seasons[y]['season']}: {seasons[y]['resolution']['regime']} != {EXPECTED_REGIMES[y]}"
        for y in sorted(seasons)
        if y in EXPECTED_REGIMES and seasons[y]["resolution"]["regime"] != EXPECTED_REGIMES[y]
    ], [])

    for year, want in sorted(EXPECTED_RA_ORIGIN.items()):
        if year in seasons:
            g.check(f"{seasons[year]['season']} rim shots left unplaced",
                    pct(seasons[year]["resolution"]["ra_origin_share"]), want)

    uneven = [y for y in sorted(seasons) if seasons[y]["resolution"]["regime"] == "uneven"]
    g.check(f"{UNEVEN_CONSTANT_ARENA} full-resolution in every uneven season", [
        seasons[y]["season"] for y in uneven
        if UNEVEN_CONSTANT_ARENA not in seasons[y]["resolution"]["full_resolution_arenas"]
    ], [])
    g.check("uneven-era season count", len(uneven), 13)

    # Where the regime is uniform, no arena may be singled out - claiming a subset
    # could see would invent a distinction the measurement does not support.
    g.check("no arenas named in uniform regimes", [
        seasons[y]["season"] for y in sorted(seasons)
        if seasons[y]["resolution"]["regime"] != "uneven"
        and seasons[y]["resolution"]["full_resolution_arenas"]
    ], [])

    if 1996 in seasons:
        c = seasons[1996]["contemporaneous"]
        g.check("1996-97 threes misfiled as Mid-Range",
                c["misfiled_threes"], EXPECTED_MISFILED_THREES)
        g.check("1996-97 mid-range under the 22-ft line then in force",
                pct(c["contemporaneous_mid_share"]), EXPECTED_CONTEMPORANEOUS_MID)
    g.check("contemporaneous correction confined to 1996-97", [
        seasons[y]["season"] for y in sorted(seasons)
        if y != 1996 and seasons[y].get("contemporaneous") is not None
    ], [])


def group_vocabulary(g, ctx):
    seasons = ctx.seasons(g)
    if not seasons:
        return
    g.section("The record's vocabulary")
    for year, want in sorted(EXPECTED_WORDS.items()):
        if year in seasons:
            g.check(f"{seasons[year]['season']} words for a shot",
                    seasons[year]["vocabulary"]["words"], want)
    if {1996, 2024} <= set(seasons):
        g.check("vocabulary more than quadruples 1996-97 to 2024-25",
                seasons[2024]["vocabulary"]["words"]
                > seasons[1996]["vocabulary"]["words"] * 4, True)
        g.check("description per shot grows by half again",
                seasons[2024]["vocabulary"]["mean_chars_per_shot"]
                > seasons[1996]["vocabulary"]["mean_chars_per_shot"] * 1.5, True)

    # The piece's own name, and the season the record learned it.
    g.check("first season the record says 'Fadeaway'", next(
        (y for y in sorted(seasons)
         if any("Fadeaway" in w for w in seasons[y]["vocabulary"]["words_list"])), None,
    ), FADEAWAY_FIRST_YEAR)

    for year, want in sorted(EXPECTED_CATEGORIES.items()):
        if year in seasons:
            g.check(f"{seasons[year]['season']} categories across six taxonomies",
                    seasons[year]["vocabulary"]["categories_total"], want)
    g.check("only the description grows; the other five are fixed", [
        f"{seasons[y]['season']}:{k}={seasons[y]['vocabulary']['taxonomies'][k]}"
        for y in sorted(seasons) for k, v in FIXED_TAXONOMIES.items()
        if seasons[y]["vocabulary"]["taxonomies"].get(k) != v
    ], [])


# --- group: the filing -------------------------------------------------------
#
# THE CENSUS strikes one word per category into the floor at the place the
# record put that category's shots, so `classification_place` is now LOAD-BEARING
# GEOMETRY: a wrong entry does not print a wrong number, it puts a word somewhere
# the category is not, and nothing on screen would look broken.
#
# WHICH OF THESE CHECKS ARE EVIDENCE AND WHICH ARE STRUCTURE, said out loud
# because "a gate you cannot break is not evidence" is this project's rule.
# `dist_ft` for a RANGE band is the mean of SHOT_DISTANCE over shots the record
# assigned to that band BY SHOT_DISTANCE, so `Less Than 8 ft. < 8` is true by
# construction of the artifact and can only fail if the artifact is corrupt or
# stale - which is exactly what the mutation catalogue stages. The checks that
# carry real content are the CROSS-FIELD ones: they take the category from one
# column of the record and the position from another, so they can genuinely
# disagree. Those are marked below.

# Bands whose own name states a distance. Structural (see above), kept because
# corruption is a real failure mode and this is what catches it.
RANGE_BOUNDS_FT = {
    "Less Than 8 ft.": (0.0, 8.0),
    "8-16 ft.": (8.0, 16.0),
    "16-24 ft.": (16.0, 24.0),
    "24+ ft.": (24.0, None),
}

# CROSS-FIELD. The category comes from SHOT_ZONE_BASIC / SHOT_ZONE_AREA and the
# distance from SHOT_DISTANCE, so these two columns of the record have to agree
# about the same shots for the check to pass at all.
ZONE_BOUNDS_FT = {
    "Restricted Area": (0.0, RESTRICTED_R / 10.0),
    "Left Corner 3": (CORNER_X / 10.0, None),
    "Right Corner 3": (CORNER_X / 10.0, None),
    "Above the Break 3": (CORNER_X / 10.0, None),
    "Backcourt": (HALFCOURT_Y / 10.0, None),
}

# CROSS-FIELD, and the sharpest of the lot: the SIDE of the floor a category
# names, against the circular mean of atan2(LOC_Y, LOC_X). A bearing above pi/2
# is the left half of the plate and below it the right. This is what would break
# first if the polar mean were wrong, if the sign convention were flipped, or if
# a season's categories were shuffled against their places.
LEFT_OF_CENTRE = ("Left Corner 3", "Left Side(L)", "Left Side Center(LC)")
RIGHT_OF_CENTRE = ("Right Corner 3", "Right Side(R)", "Right Side Center(RC)")
# CROSS-FIELD. A category that names the CENTRE of the floor must have its mean
# on the centre of the floor.
#
# THIS WAS FIRST WRITTEN AS A SYMMETRY CLAIM IN RADIANS AND THE DATA REFUSED IT.
# `Center(C)` leans right in twenty-six of the thirty seasons - worst 8.1 deg,
# in 2012-13 - and that is not an error in the polar mean, it is right-handed
# basketball: the centre column's layups favour one side. The record never
# promised symmetry and the gate should not have asked for it.
#
# So the claim is made in FEET, where it is the one that actually matters: the
# mean's distance FROM the centreline, which is what decides whether a word
# struck there reads as centred. The worst season measures 0.79 ft. Two feet is
# a regression guard with headroom, not a target - the same footing
# WINDOW_RECOVERY_FLOOR stands on.
ON_THE_CENTRELINE = ("Center(C)",)
CENTRELINE_MAX_FT = 2.0

# The empty band the sentinel threshold was chosen from the middle of. Across
# the corpus a season's leading rim coordinate beats the runner-up by either
# about 2x or 18x and up, and NOTHING falls between. These bracket that gap
# generously, so the gate below fails long before the classification could
# become a judgement call rather than a reading of a hole in the data.
SENTINEL_BAND_LO = 3.0
SENTINEL_BAND_HI = 15.0

# The three categories the record names and this plate cannot hold. Measured,
# not assumed: every season files backcourt shots beyond the halfcourt line, so
# their mean lands off the plate and THE CENSUS refuses to strike them.
BEYOND_THE_PLATE = {"ZONE": "Backcourt", "RANGE": "Back Court Shot", "AREA": "Back Court(BC)"}


def group_filing(g, ctx):
    seasons = ctx.seasons(g)
    if not seasons:
        return
    g.section("The filing: where the record's own categories sit on the floor")

    missing, extra, counts, bounds, sides, centre, ranges, degenerate = [], [], [], [], [], [], [], []
    beyond, on_plate, lean = [], [], []
    for year, row in sorted(seasons.items()):
        label = row["season"]
        cls = row.get("classification", {})
        place = row.get("classification_place")
        if not isinstance(place, dict):
            g.fail(f"{label} carries a filing", f"classification_place is {type(place).__name__}")
            continue

        for title, cats in cls.items():
            got = place.get(title)
            if not isinstance(got, dict):
                missing.append(f"{label}:{title}")
                continue
            missing += [f"{label}:{title}:{c}" for c in cats if c not in got]
            extra += [f"{label}:{title}:{c}" for c in got if c not in cats]
            for cat, e in got.items():
                if cat not in cats:
                    continue
                # The two artifacts must be counting the same shots. THE CENSUS
                # sizes a word by its share out of `classification` and places it
                # from here, so a disagreement would draw a word at one
                # category's size in another's position.
                if e.get("n") != cats[cat]:
                    counts.append(f"{label}:{title}:{cat} {e.get('n')} != {cats[cat]}")
                n_placed = e.get("n_placed")
                if not isinstance(n_placed, int) or not 0 <= n_placed <= cats[cat]:
                    counts.append(f"{label}:{title}:{cat} n_placed={n_placed} of {cats[cat]}")
                if not n_placed:
                    # Nothing to place. Allowed, and it must then carry no
                    # position at all rather than a default one.
                    if "dist_ft" in e or "bearing_rad" in e:
                        degenerate.append(f"{label}:{title}:{cat} has a place with no placed shots")
                    continue
                d, b = e.get("dist_ft"), e.get("bearing_rad")
                r = e.get("bearing_concentration")
                if not isinstance(d, (int, float)) or d < 0:
                    degenerate.append(f"{label}:{title}:{cat} dist_ft={d}")
                    continue
                if not isinstance(b, (int, float)) or not -math.pi <= b <= math.pi:
                    degenerate.append(f"{label}:{title}:{cat} bearing_rad={b}")
                    continue
                if not isinstance(r, (int, float)) or not 0 <= r <= 1:
                    degenerate.append(f"{label}:{title}:{cat} concentration={r}")
                    continue

                if title == "RANGE" and cat in RANGE_BOUNDS_FT:
                    lo, hi = RANGE_BOUNDS_FT[cat]
                    if d < lo or (hi is not None and d >= hi):
                        ranges.append(f"{label}:{cat} {d} outside [{lo},{hi})")
                if title == "ZONE" and cat in ZONE_BOUNDS_FT:
                    lo, hi = ZONE_BOUNDS_FT[cat]
                    if d < lo or (hi is not None and d > hi):
                        bounds.append(f"{label}:{cat} {d} outside [{lo},{hi}]")
                if cat in LEFT_OF_CENTRE and b <= math.pi / 2:
                    sides.append(f"{label}:{title}:{cat} bearing {b} is not left of centre")
                if cat in RIGHT_OF_CENTRE and b >= math.pi / 2:
                    sides.append(f"{label}:{title}:{cat} bearing {b} is not right of centre")
                if cat in ON_THE_CENTRELINE:
                    off = abs(d * math.cos(b))
                    lean.append(off)
                    if off > CENTRELINE_MAX_FT:
                        centre.append(f"{label}:{title}:{cat} sits {off:.2f} ft off the centreline")

                # Does the plate hold it? The three backcourt categories must
                # not, in any season, and everything else must.
                fits = d * 10 <= HALF_Y_MAX
                if BEYOND_THE_PLATE.get(title) == cat:
                    if fits:
                        beyond.append(f"{label}:{title}:{cat} at {d} ft is ON the plate")
                elif not fits:
                    on_plate.append(f"{label}:{title}:{cat} at {d} ft is off the plate")

    g.check("every category the tally counts has a place, and no place has no category",
            missing + extra, [])
    g.check("the filing and the tally count the same shots", counts, [])
    g.check("no category carries a degenerate place", degenerate, [])
    g.check("every distance band's mean sits inside its own band", ranges, [])
    g.check("every zone's mean distance sits inside its own zone", bounds, [])
    # THE cross-field check. See the note above.
    g.check("every category naming a side of the floor has its mean on that side", sides, [])
    g.check(f"every category naming the centre sits within {CENTRELINE_MAX_FT:g} ft of it",
            centre, [])
    if lean:
        g.info(f"the centre column leans {max(lean):.2f} ft off the centreline at worst "
               f"({sum(lean) / len(lean):.2f} ft mean) - right-handed basketball, not an error")
    g.check("the three backcourt categories land beyond the plate in every season", beyond, [])
    g.check("every other category lands on the plate", on_plate, [])

    # The measured driver both THE CENSUS and THE LEDGER read. One number, so
    # the two hands' text density cannot disagree.
    identity, sums = [], []
    for year, row in sorted(seasons.items()):
        v = row.get("vocabulary", {})
        cov = v.get("covering_90pct")
        if not isinstance(cov, dict):
            identity.append(f"{row['season']}: covering_90pct is {type(cov).__name__}")
            continue
        if cov.get("DESCRIPTION") != v.get("words_covering_90pct"):
            identity.append(f"{row['season']}: DESCRIPTION {cov.get('DESCRIPTION')} "
                            f"!= words_covering_90pct {v.get('words_covering_90pct')}")
        for title, cats in row.get("classification", {}).items():
            k = cov.get(title)
            if not isinstance(k, int) or not 1 <= k <= len(cats):
                sums.append(f"{row['season']}:{title} covering_90pct={k} of {len(cats)}")
    g.check("the ledger's label budget is the census's DESCRIPTION budget", identity, [])
    g.check("every taxonomy's ninety-per-cent set fits inside that taxonomy", sums, [])

    # --- which taxonomy THE CENSUS files, and when -------------------------
    #
    # RE-DERIVED HERE, not read back. It is a six-line rule and this is a second
    # implementation of it on purpose - the same footing pipeline/checks/ stands
    # on, where the arithmetic that decides something is written out twice so a
    # mistake cannot agree with itself.
    cols = (ctx.json(g, "seasons.json") or {}).get("taxonomy_columns")
    titles = set(next(iter(seasons.values())).get("classification", {}))
    g.check("every taxonomy names the database column it is",
            sorted(cols or {}), sorted(titles))
    g.check("those columns are the ones the vocabulary counts",
            sorted((cols or {}).values()),
            sorted(next(iter(seasons.values())).get("vocabulary", {}).get("taxonomies", {})))

    order = ["RESULT", "ZONE", "RANGE", "AREA", "TYPE"]
    ordered = [seasons[y] for y in sorted(seasons)]
    wrong, rank = [], 0
    for i, row in enumerate(ordered):
        if row.get("contemporaneous") is not None:
            want = "TYPE"
        elif i == 0 or row["vocabulary"]["words"] != ordered[i - 1]["vocabulary"]["words"]:
            want = "DESCRIPTION"
        else:
            want = order[rank % len(order)]
            rank += 1
        if row.get("active_taxonomy") != want:
            wrong.append(f"{row['season']}: {row.get('active_taxonomy')} != {want}")
    g.check("the filing schedule is the rule it says it is", wrong, [])

    filed = {row.get("active_taxonomy") for row in ordered}
    g.check("the schedule shows all six taxonomies across the corpus",
            sorted(filed), sorted(titles))
    forced = {row["season"] for row in ordered if row.get("contemporaneous") is not None}
    g.check("the one season the taxonomy disagrees with its own era files by TYPE",
            sorted(row["season"] for row in ordered
                   if row.get("active_taxonomy") == "TYPE"
                   and row.get("contemporaneous") is not None),
            sorted(forced))
    changed = sorted(
        row["season"] for i, row in enumerate(ordered)
        if row.get("contemporaneous") is None
        and (i == 0 or row["vocabulary"]["words"] != ordered[i - 1]["vocabulary"]["words"])
    )
    g.check("DESCRIPTION is filed in exactly the seasons the vocabulary moved",
            sorted(row["season"] for row in ordered
                   if row.get("active_taxonomy") == "DESCRIPTION"), changed)

    # --- where the record's refusal actually is ----------------------------
    #
    # `origin_snapped` counts EXACTLY (0,0) and every rim-blindness claim in this
    # project was read off it. Six seasons pile several per cent of the whole
    # season onto a coordinate NEXT TO the rim, and it reports 0.00% for all six:
    # the refusal changed address twice and then changed back. These gates hold
    # the corrected reading.
    sentinels, band, agree = [], [], []
    for year, row in sorted(seasons.items()):
        s = (row.get("resolution") or {}).get("rim_sentinel")
        if not isinstance(s, dict) or not isinstance(s.get("coord"), list):
            sentinels.append(f"{row['season']}: no rim sentinel")
            continue
        lead = s.get("lead_ratio")
        if not isinstance(lead, (int, float)) or lead < 1:
            sentinels.append(f"{row['season']}: lead_ratio {lead}")
            continue
        # THE SEPARATION IS THE EVIDENCE, so the gate asks for it directly: no
        # season may land inside the empty band the threshold was chosen from.
        # If one ever does, the classification has stopped being a reading of a
        # gap and become a judgement call, and this is what says so.
        if SENTINEL_BAND_LO < lead < SENTINEL_BAND_HI:
            band.append(f"{row['season']}: lead {lead} is inside the empty band")
        if s.get("is_refusal") != (lead >= SENTINEL_LEAD):
            sentinels.append(f"{row['season']}: is_refusal disagrees with its own lead")
        # WHAT `origin_snapped` IS ACTUALLY MEASURING, asked as a question the
        # artifact can fail. A refusal AT the origin is the one it counted, so
        # the two must agree. A refusal ANYWHERE ELSE is one it missed, and the
        # test for "missed" is not that the exact-origin count is zero — three
        # seasons file a handful of shots at (0,0) while piling thousands on
        # (0,-6), which is the first version of this check going red and being
        # right to. It is that the exact-origin count is not itself a
        # refusal-sized pile.
        at_origin = s.get("at_origin")
        origin = row["resolution"].get("origin_snapped") or 0
        if s.get("is_refusal") and at_origin is True and origin != s.get("n"):
            agree.append(f"{row['season']}: sentinel is the origin but counts "
                         f"{s.get('n')} against origin_snapped {origin}")
        if s.get("is_refusal") and at_origin is False and origin * SENTINEL_LEAD >= s.get("n", 0):
            agree.append(f"{row['season']}: origin_snapped {origin} is comparable to the "
                         f"refusal it is supposed to be blind to ({s.get('n')})")

    g.check("every season names the coordinate its rim shots pile on", sentinels, [])
    g.check("no season's lead over the runner-up falls in the empty band", band, [])
    g.check("origin_snapped is the refusal only when the refusal is at the origin", agree, [])

    refusing = [row["season"] for _y, row in sorted(seasons.items())
                if (row["resolution"].get("rim_sentinel") or {}).get("is_refusal")]
    placing = [row["season"] for _y, row in sorted(seasons.items())
               if not (row["resolution"].get("rim_sentinel") or {}).get("is_refusal")]
    # The uniformly-sighted era is FOUR seasons, not the ten `origin_snapped`
    # implies. Gated because it is now a claim the piece makes.
    g.check("the seasons in which the record refuses no rim shot at all",
            placing, ["2010-11", "2011-12", "2012-13", "2013-14"])
    missed = [row["season"] for _y, row in sorted(seasons.items())
              if (row["resolution"].get("rim_sentinel") or {}).get("is_refusal")
              and not (row["resolution"].get("origin_snapped") or 0)]
    g.check("the refusals origin_snapped cannot see",
            missed, ["2014-15", "2015-16", "2016-17"])
    g.info(f"{len(refusing)} of {len(seasons)} seasons file a rim refusal somewhere; "
           f"the address moves (0,0) -> nowhere -> (0,1) -> (0,-6) -> (0,0)")

    ex = seasons.get(1996) or next(iter(seasons.values()))
    zone = ex.get("classification_place", {}).get("ZONE", {})
    ra = zone.get("Restricted Area", {})
    if ra.get("n"):
        g.info(f"{ex['season']} Restricted Area: {ra.get('n_placed'):,} of {ra['n']:,} shots "
               f"carry a place, mean {ra.get('dist_ft')} ft")


# --- group: the per-season artifacts -----------------------------------------


def group_shot_artifacts(g, ctx):
    seasons = ctx.seasons(g)
    if not seasons:
        return
    g.section("The per-season artifacts, decoded")

    man = ctx.json(g, "acquisition_manifest.json")
    g.check("acquisition manifest entries",
            len(man.get("files", {})) if man else "missing", EXPECTED_SEASONS)

    issues = []
    cells_total = shots_total = 0
    disagreeing_shots = 0
    off_x, off_y, off_filed, off_geom, off_season = [], [], [], [], []

    for year, row in sorted(seasons.items()):
        sj = ctx.json(g, f"samples/season_{year}.json")
        gj = ctx.json(g, f"grids/season_{year}.json")
        pb = ctx.raw(g, f"points/season_{year}.bin")
        if sj is None or gj is None or pb is None:
            continue

        if gj["total"] != sj["of_halfcourt_attempts"]:
            issues.append(f"{row['season']}: grid {gj['total']} != sample halfcourt "
                          f"{sj['of_halfcourt_attempts']}")
        if sj["of_halfcourt_attempts"] + sj["backcourt_or_oob_dropped"] != row["attempts"]:
            issues.append(f"{row['season']}: halfcourt + dropped != attempts")

        if len(pb) % POINT_DTYPE.itemsize:
            issues.append(f"{row['season']}: points file is not a whole number of records")
            continue
        rec = decode_points(pb)
        cells_total += len(rec)

        # Every shot present in the count map, exactly once, at the coordinate
        # the record filed it. This is what makes "every shot" checkable.
        total = int(rec["n_hires"].sum()) + int(rec["n_rest"].sum())
        shots_total += total
        if total != gj["total"]:
            issues.append(f"{row['season']}: points total {total} != grid {gj['total']}")
        if len(rec) != row["points"]["cells"]:
            issues.append(f"{row['season']}: points cells {len(rec)} != recorded "
                          f"{row['points']['cells']}")

        x, y = rec["x"].astype(np.int32), rec["y"].astype(np.int32)
        if x.size:
            if x.min() < PLATE_X[0] or x.max() > PLATE_X[1] \
                    or y.min() < PLATE_Y[0] or y.max() > PLATE_Y[1]:
                issues.append(f"{row['season']}: a cell sits outside the plate box")
            # A zero-filled file collapses to one repeated cell and dies here.
            if len(np.unique(x.astype(np.int64) * 100000 + y)) != len(rec):
                issues.append(f"{row['season']}: the same coordinate is filed twice")
            if (rec["n_hires"].astype(np.int64) + rec["n_rest"]).min() == 0:
                issues.append(f"{row['season']}: a cell is occupied by no shots")
        if int(rec["pad"].max(initial=0)) != 0:
            issues.append(f"{row['season']}: padding byte is not zero")
        if int(rec["zone"].max(initial=0)) >= len(ZONE_NAMES):
            issues.append(f"{row['season']}: a zone byte is outside the taxonomy")
            continue

        # The zone byte is the LEAGUE's own SHOT_ZONE_BASIC, not the geometric
        # reconstruction; they are different claims and the piece needs both.
        # So the check is not equality - it is that every disagreement is a
        # boundary convention and nothing else.
        geom = zone_at_np(x.astype(float), y.astype(float))
        off = np.nonzero(geom != rec["zone"])[0]
        if off.size:
            disagreeing_shots += int(
                (rec["n_hires"].astype(np.int64) + rec["n_rest"])[off].sum())
            off_x.append(x[off])
            off_y.append(y[off])
            off_filed.append(rec["zone"][off])
            off_geom.append(geom[off])
            off_season += [row["season"]] * off.size

    g.check("samples/grids/points consistent with seasons.json", issues, [])

    # THE ZONE BYTE. points/*.bin files the LEAGUE's own SHOT_ZONE_BASIC label
    # per cell, not the geometric reconstruction - two different claims, and the
    # piece needs both. So the check is not equality (3,061 cells would fail it)
    # but that every disagreement is a BOUNDARY CONVENTION and nothing else: the
    # cell sits within a tenth and a half of the region the league filed it in.
    # A flipped byte is nowhere near the region it then claims, and dies here.
    if off_x:
        ax, ay = np.concatenate(off_x).astype(float), np.concatenate(off_y).astype(float)
        af, ag = np.concatenate(off_filed), np.concatenate(off_geom)
        far, worst_boundary = _zone_boundary_probe(ax, ay, af)
        coords = {(int(a), int(b), int(c)) for a, b, c in zip(ax, ay, af)}
        g.check("every points cell's league label is its own region or a boundary of it", [
            f"{off_season[i]}: ({int(ax[i])},{int(ay[i])}) filed {ZONE_NAMES[af[i]]!r}, "
            f"geometry says {ZONE_NAMES[ag[i]]!r}, and it is not a boundary"
            for i in np.nonzero(far)[0]
        ], [])
        g.check("the set of coordinates where the two zone readings differ",
                len(coords), POINTS_ZONE_DISAGREEING_COORDS)
        g.holds("no disagreement sits further from its boundary than measured",
                worst_boundary <= POINTS_ZONE_BOUNDARY_MAX_TENTHS,
                f"{worst_boundary:.2f} <= {POINTS_ZONE_BOUNDARY_MAX_TENTHS} tenths")
        g.info(f"{cells_total:,} occupied coordinates over {shots_total:,} shots; "
               f"{len(coords)} coordinates ({disagreeing_shots:,} shots, "
               f"{100 * disagreeing_shots / max(1, shots_total):.4f}%) carry a league label "
               f"the geometry would draw differently, all of them within "
               f"{worst_boundary:.2f} tenths of that region's edge")
    else:
        g.check("the set of coordinates where the two zone readings differ",
                0, POINTS_ZONE_DISAGREEING_COORDS)

    # The contradiction that prompted THE CENSUS: the tallies must equal the
    # figures the plate strikes into the floor, for every season.
    drift = []
    for year, row in sorted(seasons.items()):
        cls = row.get("classification")
        if not cls:
            drift.append(f"{row['season']}: no classification block")
            continue
        mid = cls["ZONE"].get("Mid-Range", 0)
        if abs(mid / row["attempts"] - row["mid_share"]) > 1e-9:
            drift.append(f"{row['season']}: census {mid / row['attempts']:.4f} "
                         f"!= {row['mid_share']:.4f}")
        if sum(cls["TYPE"].values()) != row["attempts"] - row["shot_type_nulls"]:
            drift.append(f"{row['season']}: TYPE counts do not sum to attempts")
    g.check("census figures equal the struck figures", drift, [])


def _zone_boundary_probe(xs, ys, filed):
    """How far each disagreeing cell is from the region the league filed it in.

    Returns (per-cell "not a boundary" flags, the worst distance found). A
    genuine misclassification - a flipped byte, say - is nowhere near the region
    it claims, so it never resolves and comes back flagged.
    """
    step = 0.05
    n = len(xs)
    found = np.zeros(n, bool)
    dist = np.full(n, np.inf)
    r = step
    while r <= POINTS_ZONE_BOUNDARY_MAX_TENTHS + 1e-9 and not found.all():
        steps = max(8, int(2 * math.pi * r / step))
        for k in range(steps):
            a = 2 * math.pi * k / steps
            hit = (zone_at_np(xs + r * math.cos(a), ys + r * math.sin(a)) == filed) & ~found
            if hit.any():
                dist[hit] = r
                found |= hit
        # Rounded, or thirty additions of 0.05 drift past the bound they are
        # being compared with and the last ring is never walked.
        r = round(r + step, 4)
    return ~found, float(dist[np.isfinite(dist)].max(initial=0.0))


# --- group: the league's own map of the floor --------------------------------


def group_zone_vs_league(g, ctx):
    """THE HAND colours a stroke by the zone it is PASSING THROUGH, which is only
    legitimate if SHOT_ZONE_BASIC really is a partition of the floor rather than
    a judgement about a shot. This is the gate that licenses that colour: the
    geometry the plate draws reclassifies every 2015-16 shot from its
    coordinates alone, and is scored against the league's own label."""
    g.section("The league's own map of the floor")
    if not ctx.allow_raw:
        g.info(f"--no-raw: data/shots/ not consulted, {ZONE_VS_LEAGUE_CHECKS} checks not run")
        return
    before = g.n_checks
    try:
        zdf = read_season_csv(2015, usecols=["LOC_X", "LOC_Y", "SHOT_ZONE_BASIC"])
    except Exception as e:  # noqa: BLE001
        g.fail("the 2015-16 shot dump is readable",
               f"{type(e).__name__}: {e} - pass --no-raw for a public clone without dumps")
        return

    names = np.array(ZONE_NAMES)
    got = names[zone_at_np(zdf.LOC_X.to_numpy(float), zdf.LOC_Y.to_numpy(float))]
    match = got == zdf.SHOT_ZONE_BASIC.to_numpy()
    rate = float(match.mean())
    g.holds("zone reconstructed from geometry matches the league's own label",
            rate >= ZONE_AGREEMENT_FLOOR, f"{100 * rate:.3f}%")

    # The misses are not "duplicate rows the record labels inconsistently",
    # which is what this file used to say. They are a small set of boundary
    # coordinates the record labels CONSISTENTLY, under a convention that
    # rounds differently from the polygons - a convention mismatch, not noise.
    miss = np.nonzero(~match)[0]
    labels = zdf.SHOT_ZONE_BASIC.to_numpy()
    filed = {}
    for i in miss:
        filed.setdefault((int(zdf.LOC_X.values[i]), int(zdf.LOC_Y.values[i])),
                         set()).add(labels[i])
    coords = sorted(filed)
    g.holds("every miss is one of a handful of boundary coordinates",
            len(coords) <= 8, f"{len(coords)} distinct")
    g.check("the record labels each of them consistently",
            [c for c in coords if len(filed[c]) != 1], [])
    far, worst = _zone_boundary_probe(
        np.array([c[0] for c in coords], float),
        np.array([c[1] for c in coords], float),
        np.array([ZONE_NAMES.index(next(iter(filed[c]))) for c in coords]),
    ) if coords else (np.zeros(0, bool), 0.0)
    g.check("no miss is anything but a boundary convention", int(far.sum()), 0)
    g.info(f"{int(match.sum()):,}/{len(match):,} = {100 * rate:.3f}% - the "
           f"{len(miss)} misses are {len(coords)} boundary coordinates "
           f"{coords}, each within {worst:.2f} tenths of the region the league "
           f"files it in; the record labels them consistently and the polygons "
           f"round the other way")
    g.check("the raw-dump group ran the number of checks it declares",
            g.n_checks - before, ZONE_VS_LEAGUE_CHECKS)


# --- group: python <-> typescript zone parity --------------------------------


def zone_fixture_cases():
    """A coarse grid over the plate box, plus every boundary the geometry has.

    Boundaries are where two implementations of the same rule drift apart, so
    they are enumerated rather than sampled: the arc, the corner line, the
    corner cut, halfcourt, the restricted circle, the lane, the free-throw line,
    and the coordinates where the league's own label and these polygons are
    known to disagree.
    """
    xs = list(range(PLATE_X[0], PLATE_X[1] + 1, 10))
    ys = list(range(PLATE_Y[0], PLATE_Y[1] + 1, 10))
    grid = "".join(str(zone_at(float(x), float(y))) for y in ys for x in xs)

    edge = []

    def add(x, y):
        for dx in (-0.1, 0.0, 0.1):
            for dy in (-0.1, 0.0, 0.1):
                edge.append((round(x + dx, 6), round(y + dy, 6)))

    for k in range(73):                                   # the arc, every 2.5 degrees
        a = math.pi * k / 72
        add(THREE_R * math.cos(a), THREE_R * math.sin(a))
    for y in (0.0, 40.0, CORNER_Y, 88.0, 89.0, 120.0):    # the corner line
        add(CORNER_X, y)
        add(-CORNER_X, y)
    for x in (-240.0, -220.0, -100.0, 0.0, 100.0, 220.0, 240.0):
        add(x, CORNER_Y)                                  # the corner cut
        add(x, HALFCOURT_Y)                               # halfcourt
        add(x, FREE_THROW_Y)                              # the free-throw line
    for k in range(37):                                   # the restricted circle
        a = math.pi * k / 36
        add(RESTRICTED_R * math.cos(a), RESTRICTED_R * math.sin(a))
    for y in (-50.0, 0.0, 40.0, 137.5, 200.0):            # the lane
        add(LANE_HALF_W, y)
        add(-LANE_HALF_W, y)
    # The five coordinates where the league's own label and these polygons
    # disagree, identified in the 2026-08-08 audit. A convention mismatch, and
    # both implementations must make it identically.
    for x, y in ((-32, 24), (40, 0), (-40, 138), (-1, 138), (61, 138)):
        add(float(x), float(y))
    # ... and the two lattice rows the 30-season points corpus disagrees on.
    for x in (-248.0, -230.0, -222.0, 222.0, 236.0, 248.0):
        add(x, 88.0)
        add(x, 89.0)
    for x in (-18.0, -2.0, 1.0, 62.0, 92.0):
        add(x, 418.0)
        add(x, 419.0)

    seen, cases = set(), []
    for x, y in edge:
        if (x, y) in seen:
            continue
        seen.add((x, y))
        cases.append([x, y, zone_at(x, y)])
    return xs, ys, grid, cases


def deploy_allowlist(years):
    """The public artifact list, from REQUIRED_ARTIFACTS and nowhere else."""
    files = []
    for art in REQUIRED_ARTIFACTS:
        if art.public:
            files += art.paths(years)
    return {
        "generated_by": "pipeline/qa.py --write-deploy-allowlist",
        "_why": (
            "The explicit, reviewed list of artifacts the site deploy may serve. "
            "site/scripts/sync-data.mjs copies ONLY these and fails loudly on "
            "anything else under data/processed/, so a new artifact is published "
            "by decision rather than by appearing. The source of truth is "
            "REQUIRED_ARTIFACTS in pipeline/qa.py, whose `public` column carries "
            "the rationale per row; this file is generated from it and gated "
            "against it, so the Python and Node halves cannot drift. "
            "Regenerate with: python3 pipeline/qa.py --write-deploy-allowlist"
        ),
        "public": sorted(files),
        "private": sorted(
            p for art in REQUIRED_ARTIFACTS if not art.public for p in art.paths(years)
        ),
    }


def write_deploy_allowlist():
    seasons = json.loads((PROCESSED_DIR / "seasons.json").read_text())["seasons"]
    years = sorted(row["year"] for row in seasons)
    out = deploy_allowlist(years)
    DEPLOY_ALLOWLIST.write_text(json.dumps(out, indent=2) + "\n")
    print(f"wrote {DEPLOY_ALLOWLIST.relative_to(REPO_ROOT)}: "
          f"{len(out['public'])} public, {len(out['private'])} private")


def write_zone_fixture():
    import datetime  # noqa: PLC0415

    xs, ys, grid, cases = zone_fixture_cases()
    ZONE_FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    ZONE_FIXTURE.write_text(json.dumps({
        "generated_by": "pipeline/qa.py --write-zone-fixture",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "what": ("the league's seven SHOT_ZONE_BASIC regions read as a partition of the "
                 "FLOOR. Both implementations of that partition - pipeline/common.py:zone_at "
                 "and site/src/zone.ts:zoneAt - are checked against this file, so neither "
                 "toolchain has to run the other's. Required agreement is 100%: this is "
                 "parity between two copies of one rule, which is a different claim from "
                 "the reconstruction's agreement with the league's own labels."),
        "units": "tenths of a foot, hoop at origin",
        "zone_names": ZONE_NAMES,
        "constants": {
            "RESTRICTED_R": RESTRICTED_R, "LANE_HALF_W": LANE_HALF_W,
            "FREE_THROW_Y": FREE_THROW_Y, "THREE_R": THREE_R,
            "CORNER_X": CORNER_X, "CORNER_Y": CORNER_Y, "HALFCOURT_Y": HALFCOURT_Y,
        },
        "grid": {"x": xs, "y": ys, "zones": grid,
                 "order": "row-major over y, x fastest"},
        "boundary_cases": cases,
    }, indent=1) + "\n")
    print(f"wrote {ZONE_FIXTURE} - {len(xs) * len(ys)} grid cells, "
          f"{len(cases)} boundary cases")


def group_zone_parity(g, ctx):
    g.section("One rule, three implementations")
    if not ZONE_FIXTURE.exists():
        g.fail("the zone parity fixture is committed",
               f"{ZONE_FIXTURE} missing - run qa.py --write-zone-fixture")
        return
    fx = json.loads(ZONE_FIXTURE.read_text())

    # The constants the fixture was cut against must still be the ones in force.
    g.check("the fixture's geometry is the geometry in force", fx["constants"], {
        "RESTRICTED_R": RESTRICTED_R, "LANE_HALF_W": LANE_HALF_W,
        "FREE_THROW_Y": FREE_THROW_Y, "THREE_R": THREE_R,
        "CORNER_X": CORNER_X, "CORNER_Y": CORNER_Y, "HALFCOURT_Y": HALFCOURT_Y,
    })
    g.check("the fixture names the league's seven regions", fx["zone_names"], ZONE_NAMES)

    xs, ys, grid, cases = zone_fixture_cases()
    g.check("the committed grid is what common.zone_at produces today",
            [fx["grid"]["x"], fx["grid"]["y"], fx["grid"]["zones"]] == [xs, ys, grid], True)
    g.check("the committed boundary cases are what common.zone_at produces today",
            sum(1 for a, b in zip(fx["boundary_cases"], cases) if a != b)
            + abs(len(fx["boundary_cases"]) - len(cases)), 0)

    # The vector twin used by the artifact groups, against the same fixture -
    # so a second implementation cannot quietly diverge from the first.
    gx = np.array([x for _y in ys for x in xs], float)
    gy = np.array([y for y in ys for _x in xs], float)
    g.check("the vectorised zone_at agrees with the fixture over the grid",
            int((zone_at_np(gx, gy) != np.array([int(c) for c in grid])).sum()), 0)
    bx = np.array([c[0] for c in cases], float)
    by = np.array([c[1] for c in cases], float)
    g.check("the vectorised zone_at agrees with the fixture on every boundary",
            int((zone_at_np(bx, by) != np.array([c[2] for c in cases])).sum()), 0)
    g.info(f"{len(xs) * len(ys):,} grid cells and {len(cases):,} boundary cases; the "
           f"TypeScript copy is checked against this same file by `npm run gate`, "
           f"which `npm run build` calls")


# --- group: the window -------------------------------------------------------


def group_window(g, ctx):
    w = ctx.json(g, "window.json")
    if w is None:
        return
    seasons = ctx.seasons(g) or {}
    g.section("The window: eleven weeks of raw record")

    # SCHEMA FIRST. Every key the site's WindowFile interface reads must be
    # here, with its type: a missing key is a gate failure, not a runtime
    # `undefined` in the gallery.
    g.check("window.json carries every field the site's WindowFile declares",
            _schema_gaps(w, WINDOW_SCHEMA), [])

    corp = w["corpus"]
    # 622 is the trap: bloom.py's filename parser drops the ten misnamed
    # Dec 5 2015 archives, and nothing downstream would have noticed.
    g.check("games parsed (622 is the misnaming bug)",
            corp["games_parsed"], EXPECTED_WINDOW_GAMES)
    g.check("archives listed", corp["archives_listed"], EXPECTED_WINDOW_ARCHIVES)
    g.check("empty 32-byte shells", len(corp["empty_shells"]), EXPECTED_WINDOW_SHELLS)
    g.check("misnamed archives, named not filtered",
            len(corp["misnamed_archives"]), EXPECTED_WINDOW_MISNAMED)
    g.check("window opens", corp["date_first"], EXPECTED_WINDOW_DATES[0])
    g.check("window closes", corp["date_last"], EXPECTED_WINDOW_DATES[1])
    g.check("window is half of 2015-16", corp["games_parsed"] < corp["season_games"], True)

    _window_recovery(g, w, corp)
    m = _window_measures(g, ctx, w)
    _window_bias(g, w, seasons, m)
    _window_contest(g, w, m)
    _window_occupancy(g, w)

    # The window's figures must not leak into the other twenty-nine seasons.
    g.check("window fields confined to 2015-16",
            [y for y, r in seasons.items() if y != 2015 and r.get("window") is not None], [])

    dis = w["disagreement"]
    # by_action ships only actions with 50 or more shots, so it is a subset by
    # construction; what must hold is that it cannot exceed the whole.
    named = sum(v["n"] for v in dis["by_action"].values())
    g.holds("the per-action census is a subset of the shots it is drawn from",
            0 < named <= dis["n"], f"{named:,} of {dis['n']:,}")
    g.check("every per-action rate is its own two counts", [
        k for k, v in dis["by_action"].items()
        if v["n"] <= 0 or abs(v["rate"] - v["agree"] / v["n"]) > 5e-5 or v["agree"] > v["n"]
    ], [])
    g.holds("the disagreement percentiles are ordered",
            dis["p25_ft"] <= dis["median_ft"] <= dis["p75_ft"] <= dis["p90_ft"],
            f"{dis['p25_ft']} <= {dis['median_ft']} <= {dis['p75_ft']} <= {dis['p90_ft']}")
    g.holds("the disagreement shares are ordered and bounded",
            0 <= dis["within_3ft"] <= dis["within_6ft"] <= 1 and 0 <= dis["beyond_15ft"] <= 1)
    g.info(f"the archive against itself: median {dis['median_ft']} ft between the "
           f"coordinate a scorer filed and where the optical feed says the ball left "
           f"the hand; {100 * dis['within_6ft']:.1f}% agree within 6 ft, "
           f"{100 * dis['beyond_15ft']:.1f}% differ by more than 15 ft")

    inv = w["inventory"]
    g.check("the per-game inventory is the totals over the games parsed", [
        k for k in ("touches", "passes", "drives")
        if inv["per_game"][k] != round(inv[k] / corp["games_parsed"], 1)
    ], [])
    g.holds("a drive is directed, so fewer are counted than read either way",
            inv["drives"] < inv["drives_unordered"],
            f"{inv['drives']:,} of {inv['drives_unordered']:,}")
    g.info(f"{inv['moments']:,} moments, {inv['body_positions']:,} body positions, "
           f"{inv['miles_run']:,} miles run, {inv['hours_tracked']:,} hours")
    g.info(f"{inv['touches']:,} touches, {inv['passes']:,} passes "
           f"({inv['passes_alt_gap']:,} at the alternate gap), {inv['drives']:,} drives - "
           f"against {inv['drives_unordered']:,} read without requiring the outside sample "
           f"to come first; {inv['feed_breaks']:,} feed breaks segmented on")


def _window_recovery(g, w, corp):
    rec = w["recovery"]
    # Recovery is published, not assumed. The floor is set from measurement and
    # exists to catch a regression, not to flatter the number.
    g.holds("recovery above the measured floor", rec["rate"] >= WINDOW_RECOVERY_FLOOR,
            f"{rec['rate']} >= {WINDOW_RECOVERY_FLOOR}")
    g.check("failure reasons account for every unmeasured shot",
            sum(rec["failures"].values()), rec["joined_shots"] - rec["measured"])
    g.check("the published rate is the two counts it summarises",
            rec["rate"], round(rec["measured"] / rec["joined_shots"], 4))

    # The per-game event-offset calibration, gated in the open.
    g.check("the offset search is the declared width", rec["search_range"], MAX_EVENT_OFFSET)
    g.check("event offsets stay inside the searched range",
            [k for k in rec["event_offsets"] if abs(int(k)) > MAX_EVENT_OFFSET], [])
    g.check("every game parsed is accounted for in the offset distribution",
            sum(rec["event_offsets"].values()), corp["games_parsed"])
    g.check("games_offset is the count of games carrying a shift",
            rec["games_offset"],
            sum(v for k, v in rec["event_offsets"].items() if int(k) != 0))
    # An argmax on the edge is a peak the search could not see, so it is refused
    # rather than shipped - and the count that would actually reveal a search too
    # narrow to see its own peak is how many were refused for it, not how many
    # were accepted on it (which decide_offset makes zero by construction).
    g.check("no accepted offset sits on the search boundary",
            rec["offsets_on_search_boundary"], 0)
    g.check("no game's argmax was refused for landing on the search boundary",
            rec["offsets_rejected_by_reason"].get("argmax on the search boundary", 0), 0)

    # EVERY ACCEPTED SHIFT, re-tested against the rule's own constants.
    acc = rec.get("accepted_offsets")
    g.check("every accepted shift is listed with the evidence for it",
            acc is not None and len(acc) == rec["games_offset"], True)
    if acc is not None:
        g.check("no accepted shift falls below the minimum vote count",
                [a["archive"] for a in acc if a["votes"] < MIN_OFFSET_VOTES], [])
        g.check("every accepted shift clears the straight join by the declared factor",
                [a["archive"] for a in acc
                 if a["votes"] < OFFSET_OVER_ZERO * max(1, a["at_zero"])], [])
        g.check("every accepted shift beats its own runner-up by the declared margin",
                [a["archive"] for a in acc if a["margin"] < OFFSET_MIN_MARGIN], [])
        g.check("no accepted shift sits on the search boundary",
                [a["archive"] for a in acc if abs(a["offset"]) >= MAX_EVENT_OFFSET], [])
        g.check("the smallest accepted vote count is the one reported",
                rec["min_votes_accepted"], min(a["votes"] for a in acc) if acc else None)
    # No game may be decided on a vector where the rivals are structurally
    # attenuated: on a release set built from the anchor keys, offset zero has a
    # candidate anchor for every member by construction and no rival does.
    g.check("every game's offset was decided on the full release set",
            rec.get("searched"), {"full": corp["games_parsed"]})

    ho = rec["held_out_by_outcome"]
    g.holds("the held-out split is drawn from most of the corpus",
            rec["held_out_games"] >= HELD_OUT_MIN_SHARE * corp["games_parsed"],
            f"{rec['held_out_games']} of {corp['games_parsed']}")
    g.holds("the straight join reproduces on half the evidence",
            ho["straight"]["rate"] is not None
            and ho["straight"]["rate"] >= HELD_OUT_STRAIGHT_FLOOR,
            f"{ho['straight']['rate']}")
    agg_games = sum(v["games"] for v in ho.values())
    agg_agree = sum(v["agree"] for v in ho.values())
    g.check("the held-out aggregate is the split it summarises",
            [rec["held_out_games"], rec["held_out_agreement"]],
            [agg_games, round(agg_agree / agg_games, 4) if agg_games else None])
    g.check("the held-out split is reported, not just its aggregate",
            sorted(ho), ["rejected", "shifted", "straight"])
    g.holds("most games need no offset", rec["games_offset"] / corp["games_parsed"] < 0.5)

    g.info(f"{rec['games_offset']} of {corp['games_parsed']} games "
           f"({100 * rec['games_offset'] / corp['games_parsed']:.0f}%) needed their event "
           f"numbering shifted: {rec['event_offsets']}")
    g.info(f"{rec['n_weak_joins']} games where the record barely settled the offset "
           f"(margin < 0.10); {rec['offsets_rejected']} shifted joins rejected "
           f"{rec['offsets_rejected_by_reason']}")
    g.info(f"{rec['held_out_refused_halves']} halves refused to name an offset at all and "
           f"are counted as neither agreement nor disagreement")
    g.info(f"held-out validation over {rec['held_out_games']} testable games: the straight "
           f"join reproduces on half the evidence {100 * ho['straight']['rate']:.1f}% of the "
           f"time ({ho['straight']['games']} games), an accepted shift "
           f"{100 * ho['shifted']['rate']:.1f}% ({ho['shifted']['games']}), a rejected one "
           f"{100 * ho['rejected']['rate']:.1f}% ({ho['rejected']['games']}); aggregate "
           f"{100 * rec['held_out_agreement']:.1f}%")

    vt = rec["votes"]
    g.holds("no game where the vote floor is reached went unrecorded",
            vt["games_in_population"] >= len(acc or []))
    g.check("the alternate vote floor's cost is recomputed, not asserted",
            "games_changed_by_alt" in vt, True)
    g.info(f"the vote floor is reached in {vt['games_in_population']} games (those with a "
           f"non-zero argmax), never in the {rec['event_offsets'].get('0', 0)} straight "
           f"joins: min {vt['min_in_population']}, p50 {vt['p50']}, p95 {vt['p95']}; "
           f"{vt['under_min']} fall under the minimum of {vt['min_required']} and are "
           f"refused, {vt['under_min_alt']} under the alternate {vt['min_required_alt']}")
    g.info(f"the smallest vote count carrying an ACCEPTED shift is "
           f"{rec['min_votes_accepted']}; the alternate floor of {vt['min_required_alt']} "
           f"decides {vt['games_changed_by_alt']} games differently"
           + (" - on this corpus the two values are the same rule"
              if not vt["games_changed_by_alt"] else ""))


def _window_measures(g, ctx, w):
    """window_measures.bin, decoded and asked what it means.

    The old gate compared the file's LENGTH against a record count it read out
    of the same file, which an equal-length run of zeros satisfies exactly.
    """
    mb = w["measures_bin"]
    buf = ctx.raw(g, "window_measures.bin")
    if buf is None:
        return None
    m = decode_measures(buf, mb)
    g.check("measures.bin is a whole number of records", m["ragged"], 0)
    g.check("measures.bin holds every measured shot", m["n"], w["recovery"]["measured"])
    g.check("measures.bin holds the record count it declares", m["n"], mb["records"])
    if not m["n"]:
        return m

    buckets = w["contest"]["buckets"]
    g.check("every filed bucket is one of the published categories",
            int((m["bucket"] >= len(buckets)).sum()), 0)
    g.check("made is a flag", sorted(set(map(int, np.unique(m["made"])))), [0, 1])
    span = _span_days(w["corpus"]["date_first"], w["corpus"]["date_last"])
    g.check("no shot is filed outside the window's own span",
            int(((m["day"] < 0) | (m["day"] >= span)).sum()), 0)
    # NOT clipped to the plate box: the record files a shot where the shooter
    # was, and the plate box is where the drawing stops. So the count off the
    # plate is pinned as a measurement, and the physical bound is the court.
    off_plate = ((m["x"] < PLATE_X[0]) | (m["x"] > PLATE_X[1])
                 | (m["y"] < PLATE_Y[0]) | (m["y"] > PLATE_Y[1]))
    g.check("shots the record files from outside the plate box",
            int(off_plate.sum()), MEASURES_OFF_PLATE_RECORDS)
    off_court = 0.0
    for cx, cy in ((m["x"], m["y"]), (m["dx"], m["dy"])):
        off_court = max(off_court, float(np.maximum(
            np.maximum(COURT_BOX_X[0] - cx, cx - COURT_BOX_X[1]),
            np.maximum(COURT_BOX_Y[0] - cy, cy - COURT_BOX_Y[1])).max()) / 10.0)
    g.holds("no body stands further off the court than the apron it is filed in",
            off_court <= MEASURES_MAX_OFF_COURT_FT,
            f"{off_court:.2f} <= {MEASURES_MAX_OFF_COURT_FT} ft")

    # THE BUCKET RECOMPUTATION. Each record's category is re-derived from its
    # own encoded distance and the bounds the artifact publishes, and the
    # per-bucket tallies are rebuilt from the bytes. This is what kills "every
    # contest bound replaced with 99-100 ft": those bounds no longer classify
    # the distances the file actually holds.
    # The stored distance is rounded to a tenth while the category was decided
    # on the full-precision one, so a shot at 1.96 ft is filed under 0-2 and
    # ships as 2.0. The category must therefore be one whose interval reaches
    # the stored distance to within half a quantum - which 1,091 records need
    # and which 99-100 ft satisfies for nothing at all.
    lo = np.array([b["lo_ft"] for b in buckets], float)
    hi = np.array([1e9 if b["hi_ft"] is None else b["hi_ft"] for b in buckets], float)
    d = m["dist"] / 10.0
    reach = np.zeros(m["n"], bool)
    exact = np.full(m["n"], -1, int)
    for i in range(len(buckets)):
        exact[(d >= lo[i]) & (d < hi[i])] = i
        here = m["bucket"] == i
        reach |= here & (d + 0.05 >= lo[i]) & (d - 0.05 < hi[i])
    g.check("every record's category follows from its own distance and the published bounds",
            int((~reach).sum()), 0)
    g.info(f"{int((exact != m['bucket']).sum()):,} of {m['n']:,} records sit on a category "
           f"bound once their distance is rounded into a byte, and are read as reaching it")
    g.check("the published attempt counts are the ones in the file",
            [int((m["bucket"] == i).sum()) for i in range(len(buckets))],
            [b["attempts"] for b in buckets])
    g.check("the published made counts are the ones in the file",
            [int(m["made"][m["bucket"] == i].sum()) for i in range(len(buckets))],
            [b["made"] for b in buckets])

    # ENDPOINT GEOMETRY. The caliper is stored twice - as two endpoints and as a
    # length - so the two must agree, and now they must agree for EVERY record.
    # There is no clipped set to exempt: the exemption is what let 30 records
    # ship a length 26 ft short of the distance printed beside it in the same
    # row (F-05). Reintroducing the one-byte clip is a mutation, and this is the
    # check that owns it.
    geom = np.hypot(m["x"].astype(float) - m["dx"], m["y"].astype(float) - m["dy"]) / 10.0
    off = np.abs(geom - d) > QUANTUM_FT
    g.check("every caliper is the distance between its own endpoints", int(off.sum()), 0)

    # The field's own ceiling, read from the layout the artifact declares rather
    # than from a sentinel written here - so this follows a re-encoding instead
    # of quietly asking a false question of real records. Under the old byte,
    # 255 meant "at least 25.5 ft"; under uint16 it would be a legitimate
    # 6,553.5 ft reading, which is why the value cannot be hardcoded.
    cap = _field_ceiling(mb["record"], 4)
    ceiling = m["dist"] == cap if cap is not None else np.zeros(m["n"], bool)
    g.check("no caliper is filed at the encoding's ceiling",
            int(ceiling.sum()), MEASURES_CEILING_RECORDS)
    g.check("the longest caliper the endpoints describe",
            round(float(geom.max()), 2), MEASURES_MAX_RECOMPUTED_FT)
    g.holds("no caliper is longer than the floor it was measured on",
            float(geom.max()) <= MAX_ON_COURT_FT,
            f"{geom.max():.2f} <= {MAX_ON_COURT_FT:.2f} ft")
    g.info(f"the caliper is stored in {mb['record']!r} field 5, ceiling {cap:,} tenths; the "
           f"longest of {m['n']:,} recomputes to {geom.max():.2f} ft and the file agrees with "
           f"its own endpoints on every record (worst {float(np.abs(geom - d).max()):.3f} ft "
           f"against a {QUANTUM_FT:.3f} ft storage quantum)")
    m["geom"] = geom
    return m


def _window_bias(g, w, seasons, m):
    """What the instrument prefers, stated rather than carried.

    A release is only found by following the ball back from the rim, so the
    recovered set shoots better than the league did. The gate is that the bias
    is MEASURED and bounded, not that it is absent; it cannot be absent given
    how detection works - which is exactly why "gap set to zero" had to fail.
    """
    bias = w["bias"]
    g.check("the bias counts the shots the binary holds",
            bias["measured_attempts"], w["recovery"]["measured"])
    if 2015 in seasons:
        s = seasons[2015]
        g.check("the season it is compared against is the one on the plate",
                bias["season_attempts"], s["attempts"])
        g.check("the coverage share is the ratio it summarises",
                bias["share_of_season"],
                round(bias["measured_attempts"] / s["attempts"], 4))
        g.check("the season's FG% is recomputed from seasons.json",
                bias["fg_pct_season"], round(100 * s["made"] / s["attempts"], 1))
    if m is not None and m["n"]:
        g.check("the recovered set's FG% is recomputed from the binary",
                bias["fg_pct_measured"], round(100 * float(m["made"].mean()), 1))
    # Three figures each rounded to a tenth independently, so the difference of
    # two of them can sit a tenth from the third. Derived slack, not a fudge -
    # and two orders of magnitude below "the gap replaced with zero".
    g.holds("the gap is the difference between the two figures beside it",
            abs(bias["fg_pct_gap"]
                - (bias["fg_pct_measured"] - bias["fg_pct_season"])) <= 0.1 + 1e-9,
            f"{bias['fg_pct_gap']} against "
            f"{bias['fg_pct_measured'] - bias['fg_pct_season']:.1f}")
    g.holds("make-bias stays inside the disclosed bound",
            abs(bias["fg_pct_gap"]) <= WINDOW_MAX_FG_BIAS_PP,
            f"{bias['fg_pct_gap']:+.1f} pp")

    # THE WALL TEXT IS TEMPLATED, so it can be recomposed here from the figures
    # it quotes rather than read back. THE MEASURE and THE LEDGER draw these two
    # strings verbatim, so a disclosure whose numerals have drifted from the
    # measurement it discloses would be the F-12 defect wearing a fix's clothes -
    # a sentence about selection bias that is itself no longer measured.
    g.check("the scope tag is the coverage it reports",
            bias["scope"],
            f"RECOVERED SET · {100 * bias['share_of_season']:.1f}% OF THE SEASON")
    g.check("the disclosure the piece draws is composed of the figures beside it",
            bias["disclosure"], [
                f"{bias['measured_attempts']:,} RECOVERED SHOTS · "
                f"{100 * bias['share_of_season']:.1f}% OF THE SEASON",
                f"FOUND FROM THE RIM · THEY GO IN {bias['fg_pct_measured']}% AGAINST "
                f"THE SEASON'S {bias['fg_pct_season']}%",
            ])
    g.info(f"the recovered set shoots {bias['fg_pct_measured']}% against the season's "
           f"{bias['fg_pct_season']}% ({bias['fg_pct_gap']:+.1f} pp) and covers "
           f"{100 * bias['share_of_season']:.1f}% of 2015-16's attempts")


def _window_contest(g, w, m):
    con = w["contest"]
    buckets = con["buckets"]
    g.check("four published categories", len(buckets), 4)

    # THE CONTINUOUS QUANTITY the four boxes are cut out of, recomputed from the
    # bytes rather than read back. THE HAND scales every splotch it draws against
    # `p99`, so this is a MATERIAL property of a mark and Rule 3 applies to it:
    # if the reference is not the measurement, the mark is not a measurement.
    # The artifact takes its percentiles at full precision and the file stores
    # tenths, so they agree to within the storage quantum, not exactly.
    cal = con["caliper_ft"]
    g.check("the caliper distribution counts the shots the binary holds", cal["n"], m["n"])
    if m["n"]:
        d = np.sort(m["dist"] / 10.0)
        drift = {
            k: round(abs(cal[k] - float(d[min(m["n"] - 1, int(m["n"] * q))])), 3)
            for k, q in (("p50", 0.50), ("p90", 0.90), ("p99", 0.99))
        }
        drift["max"] = round(abs(cal["max"] - float(d[-1])), 3)
        g.check("every published caliper percentile is the one in the file",
                sorted(k for k, v in drift.items() if v > QUANTUM_FT), [])
        g.info(f"the caliper runs p50 {cal['p50']} p90 {cal['p90']} p99 {cal['p99']} "
               f"max {cal['max']} ft; recomputed from the bytes it drifts by at most "
               f"{max(drift.values()):.3f} ft, and THE HAND normalises its splotch radius "
               f"at p99 rather than against any storage ceiling")
    g.check("the categories start at the rim and end open",
            [buckets[0]["lo_ft"], buckets[-1]["hi_ft"]], [0.0, None])
    g.check("the category bounds are contiguous and ordered", [
        i for i in range(len(buckets))
        if (buckets[i]["hi_ft"] is not None
            and (buckets[i]["hi_ft"] <= buckets[i]["lo_ft"]
                 or buckets[i]["hi_ft"] != buckets[i + 1]["lo_ft"]))
    ], [])
    g.check("every measure lands in exactly one category",
            sum(b["attempts"] for b in buckets), w["recovery"]["measured"])
    g.check("every category share is its own two counts", [
        b["name"] for b in buckets
        if abs(b["share"] - b["attempts"] / w["recovery"]["measured"]) > 5e-5
    ], [])
    g.check("every category FG% is its own two counts", [
        b["name"] for b in buckets
        if b["attempts"] and abs(b["fg_pct"] - 100 * b["made"] / b["attempts"]) > 0.05
    ], [])
    g.check("made counts never exceed attempts",
            [b["name"] for b in buckets if b["made"] > b["attempts"]], [])

    # THE APPROACH CURVE. The old check asked whether the curve was long enough,
    # which every value being 999 ft satisfies. Three questions instead: is it
    # exactly as long as the sampling it declares, is every sample a distance a
    # basketball court can hold, and does its LAST sample - the release instant -
    # equal the release-instant mean recomputed from the per-shot records.
    curve = con["approach_curve_ft"]
    want_len = int(round(con["approach_seconds_before_release"] * con["approach_hz"])) + 1
    g.check("the approach curve is sampled exactly to the release", len(curve), want_len)
    g.check("no approach sample is missing", [i for i, v in enumerate(curve) if v is None], [])
    vals = [v for v in curve if v is not None]
    g.holds("every approach sample is a distance this floor can hold",
            vals and 0 < min(vals) and max(vals) <= MAX_ON_COURT_FT,
            f"{min(vals)}..{max(vals)} ft within {MAX_ON_COURT_FT:.1f}")
    if m is not None and m["n"]:
        mean_release = float(m["geom"].mean())
        g.holds("the curve's release sample is the mean the binary gives independently",
                abs(curve[-1] - mean_release) <= APPROACH_RELEASE_TOL_FT,
                f"{curve[-1]} against {mean_release:.3f} ft, "
                f"tolerance {APPROACH_RELEASE_TOL_FT}")
        g.info(f"the approach closes from {curve[0]} ft to {curve[-1]} ft; the same instant "
               f"recomputed from {m['n']:,} per-shot endpoint pairs is "
               f"{mean_release:.3f} ft")

    # HEROES. F-09's criterion: no unmarked frame jump past the documented
    # physical-continuity threshold. Two of the four shipped 40 ms teleports of
    # 16 and 22 ft before the shooter was bound at the release and followed.
    g.check("one hero per category", len(con["heroes"]), 4)
    g.check("the heroes cover the four categories",
            sorted(h["bucket"] for h in con["heroes"]), [0, 1, 2, 3])
    g.check("heroes carry complete geometry",
            [h["bucket_name"] for h in con["heroes"] if any(f is None for f in h["track"])], [])
    g.check("the artifact discloses the per-frame step limit it was built to",
            _stated_step_limits(w), [MAX_STEP_FT])
    bad_shooter, bad_defender, switches, worst_s, worst_d = [], [], [], 0.0, 0.0
    for h in con["heroes"]:
        tr = [f for f in h["track"] if f is not None]
        if len(tr) != len(h["track"]):
            continue
        for i in range(1, len(tr)):
            step = math.hypot(tr[i][0] - tr[i - 1][0], tr[i][1] - tr[i - 1][1]) / 10.0
            worst_s = max(worst_s, step)
            if step > MAX_STEP_FT:
                bad_shooter.append(h["bucket_name"])
                break
        # The defender is deliberately NOT bound - a switch is a real event in a
        # closing distance - so continuity is asked WITHIN a slot, and a change
        # of slot is allowed to be discontinuous because it is a different body.
        for i in range(1, len(tr)):
            if len(tr[i]) > 4 and tr[i][4] != tr[i - 1][4]:
                continue
            step = math.hypot(tr[i][2] - tr[i - 1][2], tr[i][3] - tr[i - 1][3]) / 10.0
            worst_d = max(worst_d, step)
            if step > MAX_STEP_FT:
                bad_defender.append(h["bucket_name"])
                break
        switches.append(len({f[4] for f in tr if len(f) > 4}) - 1 if tr else 0)
    g.check("no hero's bound shooter makes a step no body could make", bad_shooter, [])
    g.check("no hero's defender jumps inside one slot", bad_defender, [])
    g.check("every hero's reported switch count is the one in its track",
            [h["defender_switches"] for h in con["heroes"]], switches)
    # The reported figures were measured at full precision; the track ships
    # hundredths, so recomputing from what shipped agrees only to that quantum.
    g.holds("every hero's reported worst step is the one in its track",
            abs(worst_s - max(h["max_shooter_step_ft"] for h in con["heroes"]))
            <= TRACK_QUANTUM_FT
            and abs(worst_d - max(h["max_defender_step_ft"] for h in con["heroes"]))
            <= TRACK_QUANTUM_FT,
            f"{worst_s:.4f}/{worst_d:.4f} recomputed against "
            f"{max(h['max_shooter_step_ft'] for h in con['heroes'])}/"
            f"{max(h['max_defender_step_ft'] for h in con['heroes'])} reported")
    g.info(f"hero continuity against the rule's own {MAX_STEP_FT} ft/frame limit: worst "
           f"shooter step {worst_s:.2f} ft, worst within-slot defender step "
           f"{worst_d:.2f} ft, switches {[h['defender_switches'] for h in con['heroes']]}")

    # F-09's third criterion: the artifact must SAY whose body the gather follows.
    d = w["definitions"].get("closest_defender", "")
    g.holds("the artifact states whose body the gather variant follows",
            bool(d) and "SHOOTER" in d.upper(), f"{len(d)} chars")
    gr = con["gather_rule"]
    g.holds("the gather reading is measured against the release, not asserted",
            gr["shots"] > 0 and gr["changed_share"] is not None
            and abs(gr["changed_share"] - gr["changed_bucket"] / gr["shots"]) < 5e-4)
    g.info(f"reading 'the shot' as the gather instead of the release moves "
           f"{100 * gr['changed_share']:.1f}% of shots into a different published category")


def _window_occupancy(g, w):
    occ = w["occupancy"]
    g.holds("occupancy bands sum to 1", abs(sum(b["share"] for b in occ["bands"]) - 1.0) < 1e-3)
    g.check("occupancy frames sum to the total",
            sum(b["frames"] for b in occ["bands"]), occ["frames_total"])
    g.check("every band's share is its own count", [
        b["lo_ft"] for b in occ["bands"]
        if abs(b["share"] - b["frames"] / occ["frames_total"]) > 5e-5
    ], [])
    # The grid is the ball's position per frame in whole feet, folded onto one
    # halfcourt. Its keys must parse and land on the plate; its total is BELOW
    # frames_total because a frame with no ball row contributes nothing, so the
    # relation gated is containment, not identity.
    bad, total = [], 0
    for k, v in occ["grid"].items():
        try:
            gx, gy = (int(p) for p in k.split(","))
        except ValueError:
            bad.append(k)
            continue
        if not (PLATE_X[0] // 10 <= gx <= PLATE_X[1] // 10
                and PLATE_Y[0] // 10 <= gy <= PLATE_Y[1] // 10) or v <= 0:
            bad.append(k)
        total += v
    g.check("every occupancy cell is a whole-foot square on the plate", bad, [])
    g.holds("the grid holds no more frames than the feed gave",
            0 < total <= occ["frames_total"], f"{total:,} of {occ['frames_total']:,}")
    g.info(f"the ball is placed in {len(occ['grid']):,} whole-foot squares over "
           f"{total:,} of {occ['frames_total']:,} frames "
           f"({100 * total / occ['frames_total']:.1f}%); the rest are frames the feed "
           f"gave no ball row for, or the ball past the halfcourt fold")


def _stated_step_limits(w):
    """Every per-frame step limit the artifact discloses, in feet.

    The continuity check itself runs against MAX_STEP_FT imported from
    window.py - the rule's own constant, because a gate that reads its
    threshold out of the file it is checking is not a gate. This is the other
    half: the artifact must SAY, in public, what limit it was built to, and it
    must be the same number. Today that disclosure lives inside the
    `distance_run` definition rather than in one of its own; a dedicated hero
    definition would read better and is noted in the session handoff.
    """
    import re  # noqa: PLC0415

    found = set()
    for text in w["definitions"].values():
        for m in re.finditer(r"[Ss]teps?\s+over\s+(\d+(?:\.\d+)?)\s*ft", text):
            found.add(float(m.group(1)))
        for m in re.finditer(r"(\d+(?:\.\d+)?)\s*ft\s*(?:/|per\s+)frame", text):
            found.add(float(m.group(1)))
    return sorted(found)


def _span_days(first, last):
    import datetime  # noqa: PLC0415

    a = datetime.date(*(int(p) for p in first.split("-")))
    b = datetime.date(*(int(p) for p in last.split("-")))
    return (b - a).days + 1


# Every key site/src/data.ts's WindowFile interface reads, with its type. A
# missing key here is a gate failure rather than a runtime `undefined` in the
# gallery. Nested dicts describe nested objects; a list means "a list, and this
# is the shape of its members".
WINDOW_SCHEMA = {
    "definitions": dict,
    "corpus": {"archives_listed": int, "empty_shells": list, "misnamed_archives": list,
               "games_parsed": int, "date_first": str, "date_last": str, "season_games": int},
    "recovery": {"joined_shots": int, "measured": int, "rate": float, "failures": dict,
                 "anchor_residual_median_ft": float, "anchor_residual_p95_ft": float,
                 "anchor_residual_over_max": int, "attribution_agreement": float,
                 "attribution_disagreements": int, "event_offsets": dict,
                 "games_offset": int, "weak_joins": list, "n_weak_joins": int},
    "contest": {"buckets": [{"name": str, "lo_ft": float, "hi_ft": (float, type(None)),
                             "attempts": int, "made": int, "share": float, "fg_pct": float}],
                "caliper_ft": {"n": int, "p50": float, "p90": float, "p99": float,
                               "max": float},
                "approach_curve_ft": list, "approach_hz": int,
                "approach_seconds_before_release": float,
                "heroes": [{"bucket": int, "bucket_name": str, "date": str, "action": str,
                            "zone": str, "made": int, "dist": float,
                            "dist_gather": (float, type(None)), "residual": float,
                            "hz": int, "track": list}],
                "gather_rule": {"shots": int, "changed_bucket": int,
                                "changed_share": float, "mean_delta_ft": float}},
    "disagreement": {"n": int, "median_ft": float, "p25_ft": float, "p75_ft": float,
                     "p90_ft": float, "within_3ft": float, "within_6ft": float,
                     "beyond_15ft": float, "by_action": dict},
    "occupancy": {"bands": [{"lo_ft": (int, float), "hi_ft": (int, float, type(None)),
                             "frames": int, "share": float}],
                  "frames_total": int, "grid": dict},
    "inventory": {"moments": int, "body_positions": int, "miles_run": float,
                  "hours_tracked": float, "shots_measured": int, "touches": int,
                  "touches_alt_radius": int, "passes": int, "drives": int,
                  "mean_seconds_per_touch": float,
                  "per_game": {"touches": float, "passes": float, "drives": float}},
    "bias": {"measured_attempts": int, "season_attempts": int, "share_of_season": float,
             "fg_pct_measured": float, "fg_pct_season": float, "fg_pct_gap": float,
             "why": str, "scope": str, "disclosure": list},
    "measures_bin": {"records": int, "bytes": int, "bytes_per_record": int, "day0": str,
                     "record": str, "path": str},
}

PAINT_SCHEMA = {
    "definitions": dict, "format_version": int,
    "canvases": int, "strokes": int, "vertices": int,
    "days_covered": int, "days_by_month": dict,
    "day_dates": list, "day_offsets": list,
    "seconds_painted": float, "stroke_seconds": float,
    "simplify_ft": float, "vertices_outside_plate": int,
    "speed_ft_s": {"p10": float, "p25": float, "p50": float, "p75": float,
                   "p90": float, "p99": float},
    "ink_by_zone": dict,
    "files": {"vertices": {"records": int, "bytes": int, "bytes_per_record": int,
                           "record": str, "path": str},
              "index": {"records": int, "bytes": int, "bytes_per_record": int,
                        "record": str, "path": str}},
}


def _schema_gaps(obj, schema, prefix=""):
    """Which declared keys are missing or the wrong type. Extra keys are fine -
    the artifact may say more than the site reads."""
    gaps = []
    for key, want in schema.items():
        here = f"{prefix}{key}"
        if not isinstance(obj, dict) or key not in obj:
            gaps.append(f"{here}: missing")
            continue
        val = obj[key]
        if isinstance(want, dict):
            gaps += _schema_gaps(val, want, f"{here}.")
        elif isinstance(want, list):
            if not isinstance(val, list):
                gaps.append(f"{here}: not a list")
            elif val:
                gaps += _schema_gaps(val[0], want[0], f"{here}[0].")
        else:
            types = want if isinstance(want, tuple) else (want,)
            if float in types and int not in types:
                types = types + (int,)
            if not isinstance(val, types) or isinstance(val, bool) and bool not in types:
                gaps.append(f"{here}: {type(val).__name__} not {want}")
    return gaps


# --- group: the paint --------------------------------------------------------


def group_paint(g, ctx):
    p = ctx.json(g, "paint.json")
    if p is None:
        return
    g.section("The paint: strokes from the bodies the record could not keep")

    g.check("paint.json carries every field the site's PaintFile declares",
            _schema_gaps(p, PAINT_SCHEMA), [])
    g.check("the shipped binaries declare the format the piece decodes",
            p.get("format_version"), 2)
    g.holds("one possession per game", p["canvases"] >= EXPECTED_PAINT_CANVASES,
            f"{p['canvases']} >= {EXPECTED_PAINT_CANVASES}")
    g.holds("the canvas spans the window rather than one week of it",
            p["days_covered"] >= EXPECTED_PAINT_DAYS,
            f"{p['days_covered']} >= {EXPECTED_PAINT_DAYS}")
    # ... against the CORPUS's own span, not a constant. The old gate cleared
    # 67 >= 60 while the painting stopped on 3 January and never reached the
    # 23 January closure Act III is built toward.
    g.check("the paint reaches the window's opening and its closure",
            [p["date_first"], p["date_last"]],
            [p["corpus_date_first"], p["corpus_date_last"]])
    # `days_by_month` counts the DAYS the paint reaches in each month - paint.py
    # builds it from the set of distinct dates, so it sums to `days_covered` and
    # not to `canvases`. It shipped as `canvases_by_month` through session 2 and
    # was renamed here, because a key whose name states what its own value
    # denies is exactly the defect F-16 is about.
    g.check("every painted day is counted in exactly one month",
            sum(p["days_by_month"].values()), p["days_covered"])
    g.info(f"painted days by month {p['days_by_month']} - {p['days_covered']} distinct "
           f"days carrying {p['canvases']} canvases")

    # WHAT A `day` BYTE MEANS. paint_index.bin's `day` indexes the corroborated
    # corpus's own game-days; window_measures.bin's `day` counts days since the
    # window opened. The two scales differ by the days nobody played, and until
    # this key shipped nothing in either file said so - a renderer pacing both
    # hands off "day" was pacing them off two different clocks, and the mapping
    # back to a date existed only in the gitignored provenance manifest.
    dates = p["day_dates"]
    offsets = p["day_offsets"]
    g.check("the day index has an entry for every day the paint covers",
            len(dates), p["days_covered"])
    g.check("the day index ascends with its own calendar", dates, sorted(dates))
    g.check("no date is filed under two day indices", len(set(dates)), len(dates))
    g.check("the day index opens and closes on the paint's own span",
            [dates[0], dates[-1]] if dates else [],
            [p["date_first"], p["date_last"]])
    # Re-derived here rather than read back: the offsets are the one half a
    # renderer paces on, so they are recomputed from the dates beside them.
    day0 = _date.fromisoformat(dates[0]) if dates else None
    g.check("every day offset is its own date's distance from the first",
            offsets,
            [(_date.fromisoformat(d) - day0).days for d in dates] if day0 else [])
    w = ctx.json(g, "window.json")
    if w is not None and offsets:
        # The paint's calendar against the window's. `days_inclusive` is derived
        # from window.json's corpus span, so a paint that ended early - the
        # session-1b defect - would show here as a short span rather than only
        # as a date comparison.
        g.check("the paint's calendar spans the window the corpus defines",
                offsets[-1] + 1,
                (_date.fromisoformat(w["corpus"]["date_last"])
                 - _date.fromisoformat(w["corpus"]["date_first"])).days + 1)
        g.info(f"the paint's {len(dates)} game-days span {offsets[-1] + 1} calendar days; "
               f"{offsets[-1] + 1 - len(dates)} days in the window carry no game")

    vbuf = ctx.raw(g, "paint_strokes.bin")
    ibuf = ctx.raw(g, "paint_index.bin")
    if vbuf is None or ibuf is None:
        return
    strokes, verts, (iragged, vragged) = decode_paint(vbuf, ibuf, p["files"])
    g.check("paint_index.bin is a whole number of records", iragged, 0)
    g.check("paint_strokes.bin is a whole number of records", vragged, 0)
    g.check("index covers every stroke", len(strokes), p["strokes"])
    g.check("the vertex file holds every control point", len(verts), p["vertices"])
    g.check("paint.json's own record counts are the ones on disk",
            [p["files"]["index"]["records"], p["files"]["vertices"]["records"]],
            [len(strokes), len(verts)])
    if not strokes or not verts:
        return

    # Structure first, and the expensive semantic passes only if it holds. Not
    # an optimisation: a randomised index describes strokes of sixty thousand
    # frames, and walking one back out to full rate is unbounded work. A gate
    # that hangs on a corrupt file has not failed, which is worse than failing.
    _paint_join(g, p)
    if _paint_index(g, p, strokes, verts):
        _paint_geometry(g, p, strokes, verts)
        _paint_coincidence(g, p, strokes, verts)
    else:
        g.info("the index does not describe this vertex array, so the geometry and "
               "coincidence passes are not run - there is nothing coherent to ask them of")

    # Nothing identifying may ever be in here: the corpus stays private and what
    # ships must not be substitutable for it. (traces.json ships identity on
    # purpose and is deliberately not subject to this.)
    blob = json.dumps(p).lower()
    g.check("no identity fields ship with the paint", [
        k for k in ("player", "game_id", "event_id", "playerid", "gameid")
        if k in blob and f'"{k}"' in blob
    ], [])

    rk = p["selection_rank"]
    g.check("every canvas's place in the residual ordering is reported",
            sum(rk.values()), p["canvases"])
    g.info(f"canvases at each rank in their game's residual ordering: "
           f"{dict(list(rk.items())[:8])}; {p['canvases'] - p['selection_rank_zero']} of "
           f"{p['canvases']} are NOT their game's smallest-residual corroborated shot, "
           f"which is the feed-quality half of the selection rule doing the choosing")
    g.info(f"{p['strokes']:,} strokes over {p['canvases']} possessions, "
           f"{p['vertices']:,} control points, {p['seconds_painted']:,.0f} painted seconds")
    g.info(f"{p['strokes_alt_min_run']:,} strokes under the alternate run floor of "
           f"{p['min_run_frames_alt']} frames against {p['strokes']:,} at "
           f"{p['min_run_frames']}; {p['vertices_forced_by_zone']:,} vertices forced by a "
           f"zone change")


def _paint_index(g, p, strokes, verts):
    """The index must PARTITION the vertex array - no overlaps, no orphans.

    The old composition check was `round(strokes / canvases) in (10, 11)`, an
    average, which passes with one canvas at three strokes and another at
    nineteen.
    """
    order = sorted(strokes, key=lambda s: s[0])
    cursor, gaps, shorts = 0, [], 0
    for first, count, canvas, _kind, _body, _day in order:
        if first != cursor:
            gaps.append((cursor, first))
        if count < 2:
            shorts += 1
        cursor = first + count
    partitions = not gaps and cursor == len(verts)
    g.check("the stroke index partitions the vertex array", gaps, [])
    g.check("the vertex array ends exactly where the last stroke does",
            cursor, len(verts))
    g.check("no stroke is shorter than a line", shorts, 0)
    g.check("the index starts at the first vertex", order[0][0], 0)

    # A stroke is one continuous run inside the span the paint was cut from, so
    # its frames cannot add up to more than that span holds. This is also what
    # bounds every pass below: a stroke cannot be walked back out to full rate
    # until its own clock is known to be finite.
    budget = int(round(p["stroke_seconds"] * 25))
    overrun = sum(1 for first, count, *_ in order
                  if sum(verts[first + i][2] for i in range(1, count)) > budget)
    g.check("no stroke spans more frames than the possession it was cut from", overrun, 0)

    kinds = {s[3] for s in strokes}
    g.check("a stroke is a body or the ball", sorted(kinds), [0, 1])
    span = p["days_covered"]
    days = {s[5] for s in strokes}
    # `day` is a uint8, so the gate this replaces - `max(days) < 256 and
    # min(days) >= 0` - was true of every byte that can be stored in the field
    # and could not fail. It is now an index into `day_dates`, which is a claim
    # that can be wrong: a stroke naming a day the calendar does not have is a
    # stroke a renderer would pace off nothing.
    calendar = len(p["day_dates"])
    g.check("every stroke's day names a day the calendar has",
            sorted(d for d in days if d >= calendar), [])
    g.check("the painted days are the ones counted", len(days), span)
    g.check("every day in the calendar carries at least one stroke",
            sorted(set(range(calendar)) - days), [])

    # PER CANVAS, not as a rounded average. The old check was
    # `round(strokes / canvases) in (10, 11)`, which one canvas at three strokes
    # and another at nineteen satisfies exactly.
    slots, bodies, balls, per_canvas = {}, {}, {}, {}
    for _first, _count, canvas, kind, body, _day in strokes:
        per_canvas[canvas] = per_canvas.get(canvas, 0) + 1
        slots.setdefault(canvas, set()).add(body)
        (bodies if kind == 0 else balls).setdefault(canvas, set()).add(body)
    g.check("every canvas appears in the index", len(per_canvas), p["canvases"])
    g.check("the canvas ids are a dense range",
            [min(per_canvas), max(per_canvas)], [0, p["canvases"] - 1])
    g.check("no canvas fields fewer bodies than the rule requires",
            [c for c, v in bodies.items() if len(v) + 1 < MIN_BODIES_PER_CANVAS], [])
    g.check("no canvas fields more slots than a team, its opponent and the ball",
            [c for c, v in slots.items() if len(v) > MAX_BODIES_PER_CANVAS], [])
    g.check("every canvas carries exactly one ball",
            [c for c in per_canvas if len(balls.get(c, ())) != 1], [])
    g.check("no body slot is drawn as both a body and the ball",
            [c for c in per_canvas if bodies.get(c, set()) & balls.get(c, set())], [])
    g.check("paint.json's slot count agrees with the index",
            [p["bodies_per_canvas"]["min"], p["bodies_per_canvas"]["max"]],
            [min(len(v) for v in slots.values()), max(len(v) for v in slots.values())])
    g.check("paint.json's stroke count per canvas agrees with the index",
            [p["strokes_per_canvas"]["min"], p["strokes_per_canvas"]["max"]],
            [min(per_canvas.values()), max(per_canvas.values())])
    return partitions and not overrun


def _paint_geometry(g, p, strokes, verts):
    """F-02's invariants, asked of the bytes.

    A drawn segment may not exceed the arc measured for it; no arc may sit at
    the storage ceiling; the speeds the renderer's three regimes are bounded by
    must be reproducible from the file; and the ink map must be recomputable
    from the vertices rather than merely summing to one.
    """
    vfmt = p["files"]["vertices"]["record"]
    arc_bits = {"B": 8, "H": 16, "I": 32}[vfmt[-1]]
    arc_ceiling = (1 << arc_bits) - 1

    worst, n_over, at_ceiling, first_dt, fastest = 0.0, 0, 0, 0, 0.0
    speeds, zone_time = [], {}
    frames, off_plate = 0, 0
    for first, count, _canvas, _kind, _body, _day in strokes:
        vs = verts[first:first + count]
        if vs[0][2] != 0 or vs[0][3] != 0:
            first_dt += 1
        for vx, vy, _d, _a in vs:
            if not (PLATE_X[0] <= vx <= PLATE_X[1] and PLATE_Y[0] <= vy <= PLATE_Y[1]):
                off_plate += 1
        for i in range(1, len(vs)):
            dt, arc = vs[i][2], vs[i][3]
            frames += dt
            if arc >= arc_ceiling:
                at_ceiling += 1
            chord = math.hypot(vs[i][0] - vs[i - 1][0], vs[i][1] - vs[i - 1][1]) / 10.0
            excess = chord - arc / 10.0
            worst = max(worst, excess)
            if excess > QUANTUM_FT:
                n_over += 1
            if dt > 0:
                v = (arc / 10.0) / (dt / 25.0)
                speeds.append(v)
                fastest = max(fastest, v)
                # Ink is deposited per unit TIME, so the map is weighted by
                # frames, in the region the paint is landing in.
                z = zone_at(float(vs[i][0]), float(vs[i][1]))
                zone_time[z] = zone_time.get(z, 0) + dt

    g.check("no drawn segment exceeds the arc measured for it", n_over, 0)
    g.check("no arc value sits at the storage ceiling", at_ceiling, 0)
    g.check("every stroke opens with a vertex that measures nothing", first_dt, 0)
    g.holds("no body or ball is painted faster than physics allows",
            fastest <= MAX_PAINT_SPEED_FT_S,
            f"{fastest:.1f} <= {MAX_PAINT_SPEED_FT_S} ft/s")
    # The painted duration, recomputed: every span's frames at the feed's own
    # rate. A file of zeros has no duration and dies here.
    g.check("the painted seconds are the frames the file actually carries",
            round(frames / 25.0, 1), p["seconds_painted"])
    # paint.py counts this BEFORE rounding the coordinates into int16; the bytes
    # carry them after, and 27 vertices round back onto the plate. Both figures
    # are right about different things, so the byte-side one is pinned too.
    # Measured 2026-08-08 from the current artifact.
    g.check("the vertices the bytes place off the plate", off_plate, PAINT_OFF_PLATE_VERTICES)
    g.holds("rounding only ever pulls a vertex back onto the plate",
            off_plate <= p["vertices_outside_plate"],
            f"{off_plate} drawn against {p['vertices_outside_plate']} measured")

    if not speeds:
        g.fail("the paint carries a measurable speed anywhere",
               "no span in the file advances a single frame")
        return
    g.info(f"worst chord-minus-arc excess {worst:.4f} ft against a {QUANTUM_FT:.4f} ft "
           f"quantization bound, over {len(verts):,} vertices; fastest painted span "
           f"{fastest:.1f} ft/s")

    # The percentiles the three fluid regimes are bounded by, RECOMPUTED from
    # the decoded records rather than believed from the JSON beside them.
    speeds.sort()
    def q(f):
        return round(speeds[min(len(speeds) - 1, int(f * len(speeds)))], 2)
    sp = p["speed_ft_s"]
    g.holds("the speed percentiles are ordered and physical",
            sp["p10"] < sp["p50"] < sp["p90"] and 0 < sp["p10"] and sp["p90"] < 30)
    # `arc` is summed at the full 25 Hz BEFORE Douglas-Peucker, so the shipped
    # bytes carry the measurement and not the drawn line: the percentiles come
    # back to the storage quantum. Measured 2026-08-08: identical to 2 dp.
    g.check("the speed percentiles are reproducible from the binary", [
        k for k in ("p10", "p25", "p50", "p75", "p90", "p99")
        if abs(sp[k] - q(float(k[1:]) / 100)) > 0.05
    ], [])
    g.info(f"speeds recomputed from the bytes: p10 {q(0.10)}, p50 {q(0.50)}, "
           f"p90 {q(0.90)}, p99 {q(0.99)} against the artifact's {sp['p10']}, "
           f"{sp['p50']}, {sp['p90']}, {sp['p99']}")

    # ink_by_zone, recomputed. paint.py measures it over every full-rate frame;
    # the bytes carry the simplified line, so the two agree to within what
    # storage costs, which the artifact itself publishes as zone_quantized_share.
    total = max(1, sum(zone_time.values()))
    got = {ZONE_NAMES[z]: t / total for z, t in zone_time.items()}
    ink = p["ink_by_zone"]
    tol = max(0.005, 2 * p["zone_quantized_share"])
    g.holds("ink shares sum to 1", abs(sum(ink.values()) - 1.0) < 1e-3)
    g.check("the ink map is reproducible from the vertices", [
        z for z in ink if abs(ink[z] - got.get(z, 0.0)) > tol
    ], [])
    g.info("where the paint goes, against where the record files shots:")
    for z, share in ink.items():
        g.say(f"      {z:<22} {100 * share:5.1f}% of painted time "
              f"({100 * got.get(z, 0.0):5.1f}% recomputed from the bytes)")


def _paint_join(g, p):
    """Every canvas is one shot the window stage corroborated.

    AGAINST THE RULE'S OWN CONSTANT, not against the number the file being
    checked reports as its threshold: `res["max"] <= res["max_allowed"]` took
    both sides from paint.json, so 480 ft against a declared 500 ft passed.
    """
    res = p["anchor_residual_ft"]
    g.holds("no canvas ships an anchor residual over the corroboration threshold",
            res["max"] <= MAX_ANCHOR_RESIDUAL_FT,
            f"{res['max']} <= {MAX_ANCHOR_RESIDUAL_FT} ft")
    g.check("the paint declares the same threshold the window stage joins at",
            res["max_allowed"], MAX_ANCHOR_RESIDUAL_FT)
    g.holds("the residual quantiles are ordered",
            res["median"] <= res["p90"] <= res["max"])

    prov = _paint_join_reconstruction()
    if prov is None:
        g.info("private intermediates absent - the paint join is gated against the "
               "threshold only; run pipeline/checks/check_paint_join.py where "
               "data/window/ exists")
        return
    n_rows, mismatched, orphaned, worst = prov
    g.check("the private join carries one row per shipped canvas", n_rows, p["canvases"])
    g.check("every canvas is a shot the window stage corroborated", orphaned, [])
    g.check("every canvas's residual is the one the window stage measured", mismatched, [])
    g.holds("the reconstructed worst residual clears the threshold too",
            worst <= MAX_ANCHOR_RESIDUAL_FT, f"{worst} ft")
    g.info(f"the join reconstructed from data/window/: {n_rows} canvases, worst residual "
           f"{worst} ft against {MAX_ANCHOR_RESIDUAL_FT}")


def _paint_coincidence(g, p, strokes, verts):
    """RULE 7, gated from the bytes.

    The split cuts jumps; a merged track - the feed reporting one detection
    under two player ids - has none, so it passes every continuity check and
    paints one measurement twice. 20 such pairs shipped across 19 of 250
    canvases before this existed.
    """
    co = p["coincidence_ft"]
    g.check("the refusal rule and its tolerance ship with the paint",
            [co["tolerance"], co["seconds"]], [COINCIDENCE_FT, COINCIDENCE_SECONDS_QA])
    g.holds("no shipped canvas holds two bodies closer than the rule allows",
            co["shipped_min"] is not None and co["shipped_min"] > COINCIDENCE_FT,
            f"{co['shipped_min']} > {COINCIDENCE_FT} ft")
    g.check("the census of separations counts every span examined",
            sum(co["hist"].values()), co["spans_examined"])
    g.holds("the stricter tolerance refuses at least as much as the looser one",
            co["spans_refused"] >= co["spans_refused_alt"]
            and co["tolerance"] > co["tolerance_alt"],
            f"{co['spans_refused']} at {co['tolerance']} ft, "
            f"{co['spans_refused_alt']} at {co['tolerance_alt']} ft")

    coincident, dupes, closest = _coincident_bodies(strokes, verts)
    g.check("no canvas draws two bodies inside one coordinate quantum", coincident, [])
    g.check("no two body slots ship an identical path", dupes, [])
    g.info(f"closest sustained approach between two painted bodies: {co['shipped_min']} ft "
           f"measured on the feed, {closest} ft once drawn (simplification pulls them "
           f"closer), against a {COINCIDENCE_FT} ft refusal over {COINCIDENCE_FRAMES} "
           f"frames and a {BYTE_COINCIDENCE_FT} ft byte gate")
    g.info(f"paint.py refused {co['spans_refused']} of {co['spans_examined']} spans for "
           f"holding one detection twice ({co['spans_refused_alt']} at the alternate "
           f"{co['tolerance_alt']} ft); {co['hist'].get('0.0', 0)} of those sat at exactly "
           f"0.0 ft, which is the feed repeating a row")


def _full_rate(vs):
    """A stroke's control points walked back out to one point per frame.

    The drawn line, which is what a consumer sees: straight between control
    points, dt frames apart. The first vertex opens the stroke with dt = 0.
    """
    out = [(vs[0][0], vs[0][1])]
    for i in range(1, len(vs)):
        x0, y0 = vs[i - 1][0], vs[i - 1][1]
        x1, y1, dt = vs[i][0], vs[i][1], vs[i][2]
        for k in range(1, dt + 1):
            out.append((x0 + (x1 - x0) * k / dt, y0 + (y1 - y0) * k / dt))
    return out


def _sustained_min(pi, pj, window):
    """The closest two full-rate paths get AND STAY, over any run of `window`
    frames. Momentary contact in a scrum parts again; one detection reported
    twice does not."""
    n = min(len(pi), len(pj))
    if n < window:
        return None
    a = np.asarray(pi[:n], float)
    b = np.asarray(pj[:n], float)
    sep = np.hypot(a[:, 0] - b[:, 0], a[:, 1] - b[:, 1]) / 10.0
    rolling = np.lib.stride_tricks.sliding_window_view(sep, window).max(axis=1)
    return float(rolling.min())


def _coincident_bodies(strokes, verts):
    """Two body slots of one canvas that are one detection reported twice.

    Each body's FIRST stroke is the run that begins at frame 0 of the span, so
    two bodies can be compared without any clock shipping. A merged track gives
    identical coordinates, hence identical control points, hence separation 0
    for as long as the feed repeated it.
    """
    first_run = {}
    for first, count, canvas, kind, body, _day in strokes:
        if kind != 0 or (canvas, body) in first_run:
            continue
        first_run[(canvas, body)] = verts[first:first + count]

    by_canvas = {}
    for (canvas, body), vs in first_run.items():
        by_canvas.setdefault(canvas, []).append((body, vs))

    bad, dupes = [], []
    closest = None
    for canvas, bodies in sorted(by_canvas.items()):
        paths = [(b, _full_rate(vs), tuple(vs)) for b, vs in sorted(bodies)]
        for i in range(len(paths)):
            for j in range(i + 1, len(paths)):
                (bi, pi, ti), (bj, pj, tj) = paths[i], paths[j]
                if ti == tj:
                    dupes.append([canvas, bi, bj])
                sustained = _sustained_min(pi, pj, COINCIDENCE_FRAMES)
                if sustained is None:
                    continue
                if closest is None or sustained < closest:
                    closest = sustained
                if sustained <= BYTE_COINCIDENCE_FT:
                    bad.append([canvas, bi, bj])
    return bad, dupes, round(closest, 3) if closest is not None else None


def _paint_join_reconstruction():
    """Rebuild every canvas's join from the private per-game window artifacts.

    Returns (rows, residual mismatches, canvases with no corroborated shot,
    worst residual), or None where data/window/ is not on this machine. The
    numbers come from the window stage's own corroborated sets, never from
    paint.json's summary of itself.
    """
    from window import GAMES_DIR  # noqa: PLC0415

    prov_path = GAMES_DIR.parent / "paint_provenance.json"
    if not prov_path.exists() or not GAMES_DIR.exists():
        return None
    rows = json.loads(prov_path.read_text())["canvases"]

    mismatched, orphaned, worst = [], [], 0.0
    for r in rows:
        gp = GAMES_DIR / f"{Path(r['archive']).stem}.json"
        if not gp.exists():
            orphaned.append(r["archive"])
            continue
        corr = {c["event_id"]: c for c in (json.loads(gp.read_text()).get("corroborated") or [])}
        c = corr.get(r["tracking_event_id"])
        if c is None:
            orphaned.append(r["archive"])
            continue
        if (abs(c["residual"] - r["residual_ft"]) > 1e-9
                or c["anchor_event_id"] != r["anchor_event_id"]
                or c["release_frame"] != r["release_frame"]):
            mismatched.append(r["archive"])
        worst = max(worst, c["residual"])
    return len(rows), mismatched, orphaned, round(worst, 2)


# --- group: traces -----------------------------------------------------------


def group_traces(g, ctx):
    """Act III's thirty-two curated gestures, which nothing gated at all.

    traces.json deliberately ships identity - the game, the player, the event -
    and that is an accepted artist decision, so the paint's no-identity rule is
    NOT extended here. bloom.py hits the GitHub API live and re-derives from the
    tracking archives, so this gates the committed artifact as it stands.
    """
    t = ctx.json(g, "traces.json")
    w = ctx.json(g, "window.json")
    if t is None:
        return
    g.section("Act III's traces")

    tr = t.get("traces")
    g.check("traces.json carries the gestures it declares",
            isinstance(tr, list) and len(tr), EXPECTED_TRACES)
    if not tr:
        return

    required = {"game": str, "game_id": str, "date": str, "event_id": int, "player": str,
                "action": str, "made": int, "zone": str, "anchor": list,
                "anchor_residual_ft": float, "release_index": int, "hz": int, "points": list}
    g.check("every trace carries the fields the piece reads",
            sorted({gap for x in tr for gap in _schema_gaps(x, required)}), [])

    first, last = (w["corpus"]["date_first"], w["corpus"]["date_last"]) if w \
        else EXPECTED_WINDOW_DATES
    g.check("every trace falls inside the window",
            [x["game"] for x in tr if not first <= x["date"] <= last], [])
    g.check("every trace is sampled at the corpus rate",
            sorted({x["hz"] for x in tr}), [25])
    g.check("every trace's zone is what the geometry says of its own anchor",
            [x["game"] for x in tr
             if ZONE_NAMES[zone_at(float(x["anchor"][0]), float(x["anchor"][1]))] != x["zone"]],
            [])

    res = sorted(x["anchor_residual_ft"] for x in tr)
    g.check("the declared median residual is the traces' own",
            t["median_anchor_residual_ft"],
            round((res[len(res) // 2] if len(res) % 2 else
                   (res[len(res) // 2 - 1] + res[len(res) // 2]) / 2), 2))
    g.holds("no trace is anchored further out than the window stage joins at",
            max(res) <= MAX_ANCHOR_RESIDUAL_FT, f"{max(res)} <= {MAX_ANCHOR_RESIDUAL_FT} ft")

    bad_idx, bad_z, bad_step, bad_anchor, worst_step, worst_anchor = [], 0, [], [], 0.0, 0.0
    for x in tr:
        pts, ri = x["points"], x["release_index"]
        if not (0 <= ri < len(pts)):
            bad_idx.append(x["game"])
            continue
        bad_z += sum(1 for pt in pts if pt[2] < 0)
        for i in range(1, len(pts)):
            step = math.hypot(math.hypot(pts[i][0] - pts[i - 1][0],
                                         pts[i][1] - pts[i - 1][1]) / 10.0,
                              pts[i][2] - pts[i - 1][2])
            worst_step = max(worst_step, step)
            if step > MAX_TRACE_STEP_FT:
                bad_step.append(x["game"])
                break
        gap = math.hypot(pts[ri][0] - x["anchor"][0], pts[ri][1] - x["anchor"][1]) / 10.0
        worst_anchor = max(worst_anchor, gap)
        # The residual IS this distance: the trace is anchored at its own dot,
        # so the release point and the coordinate the record filed must be the
        # same measurement read twice.
        if abs(gap - x["anchor_residual_ft"]) > 0.05:
            bad_anchor.append(x["game"])
    g.check("every release index points inside its own trace", bad_idx, [])
    g.check("no ball goes through the floor", bad_z, 0)
    g.check("no ball jumps further between frames than a ball can", bad_step, [])
    g.check("every trace's release point is the residual it reports", bad_anchor, [])
    g.info(f"{len(tr)} gestures from {t['candidates']:,} candidates: residual median "
           f"{t['median_anchor_residual_ft']} ft, max {max(res)} ft; largest "
           f"frame-to-frame ball displacement {worst_step:.2f} ft in three dimensions, "
           f"largest release-to-anchor gap {worst_anchor:.2f} ft")


# --- group: the inventory ----------------------------------------------------


def group_inventory(g, ctx):
    """Every shipping artifact is mandatory, and nothing unexpected has appeared.

    The required list lives HERE rather than in a manifest inside
    data/processed/, because a gate that takes its expectations from the thing
    it is checking is not a gate. Session 3's deploy allowlist (F-07) hangs off
    Artifact.public.
    """
    g.section("The processed inventory")
    seasons = ctx.seasons(g)
    years = sorted(seasons) if seasons else []
    g.check("the per-season artifact count comes from seasons.json, not a second 30",
            len(years), EXPECTED_SEASONS)

    missing, empty, headerless, expected = [], [], [], set()
    for art in REQUIRED_ARTIFACTS:
        for rel in art.paths(years):
            expected.add(rel)
            p = ctx.root / rel
            if not p.exists():
                missing.append(rel)
                continue
            if p.stat().st_size == 0:
                empty.append(rel)
                continue
            if art.kind == "json":
                try:
                    d = json.loads(p.read_text())
                except Exception as e:  # noqa: BLE001
                    headerless.append(f"{rel}: unparseable ({type(e).__name__})")
                    continue
                if art.stamp and not (d.get("generated_by") and d.get(art.stamp)):
                    headerless.append(f"{rel}: no generated_by/{art.stamp}")
    g.check("every required artifact is present", missing, [])
    g.check("no required artifact is empty", empty, [])
    g.check("every top-level artifact says what wrote it and when", headerless, [])

    # A new artifact must be added DELIBERATELY - which is precisely the hook
    # session 3's deploy allowlist needs. Dotfiles are ignored and said so.
    found = {str(p.relative_to(ctx.root)) for p in ctx.root.rglob("*")
             if p.is_file() and not any(part.startswith(".") for part in p.parts)}
    g.check("no unknown file has appeared under data/processed/",
            sorted(found - expected), [])
    g.info(f"{len(expected)} required artifacts, {sum(1 for a in REQUIRED_ARTIFACTS if a.public)} "
           f"of {len(REQUIRED_ARTIFACTS)} kinds marked public; session 3 hangs the deploy "
           f"allowlist and the dist/data test off this table")

    _decoder_parity(g, ctx)


def _decoder_parity(g, ctx):
    """The site's decoders against the layouts the pipeline actually writes.

    Nothing type-checks a byte layout, so this is the only automated detector
    that the two halves of the project disagree about a format. A mismatch fails
    unless a dated WAIVER names it; a waiver whose mismatch has gone also fails,
    so the session that fixes one has to remove it.
    """
    p = ctx.json(g, "paint.json")
    w = ctx.json(g, "window.json")
    if p is None or w is None:
        return
    want = {
        "vertex": p["files"]["vertices"]["bytes_per_record"],
        "stroke": p["files"]["index"]["bytes_per_record"],
        "measure": w["measures_bin"]["bytes_per_record"],
        "point": POINT_DTYPE.itemsize,
    }
    import re  # noqa: PLC0415

    unread, mismatched, stale = [], [], []
    for key, (rel, ident) in DECODER_SOURCES.items():
        src = REPO_ROOT / rel
        if not src.exists():
            unread.append(rel)
            continue
        m = re.search(rf"^const {ident} = (\d+);", src.read_text(), re.M)
        if not m:
            unread.append(f"{rel}:{ident}")
            continue
        got = int(m.group(1))
        waiver = DECODER_WAIVERS.get(key)
        if got == want[key]:
            if waiver:
                stale.append(f"{key}: {rel} now agrees at {got} - delete the waiver")
        elif waiver and (got, want[key]) == waiver[:2]:
            g.waived(f"the site decodes the {key} record the pipeline writes",
                     f"{rel} reads {got} B, the pipeline writes {want[key]} B - {waiver[2]}")
        else:
            mismatched.append(f"{key}: {rel} reads {got} B, the pipeline writes {want[key]} B")
    g.check("every decoder constant is readable from the site's source", unread, [])
    g.check("the site decodes the records the pipeline writes", mismatched, [])
    g.check("no decoder waiver outlives the mismatch it names", stale, [])


# --- group: the memory ------------------------------------------------------
# CLAUDE.md is a working memory file and its prose is why it works, so this does
# not try to generate it. What it does is make the QUANTITATIVE half checkable:
# each claim below is an exact substring of the file with one hole in it, and
# the hole is filled from an artifact. A claim fails if the sentence has been
# reworded away from the gate OR if the artifact has moved underneath it.
#
# That second half is the one that matters. `attribution_agreement` was written
# into CLAUDE.md as 0.8536 while window.json said 0.8573 - a hand-typed figure
# that drifted from its own artifact inside a single session, which is the F-16
# defect in miniature. Nothing could have caught it.
#
# The same idiom TABLE_1_6 uses: a fixture in the gate, not display copy.


class Claim:
    """One quantitative sentence in CLAUDE.md, and where its number lives."""

    def __init__(self, template, source, path, fmt="raw"):
        self.template = template   # exact text, with a single {} for the value
        self.source = source       # "window" | "paint" | "facts" | "season:YYYY" | "code"
        self.path = path
        self.fmt = fmt

    def render(self, value):
        return self.template.format(self._format(value))

    def _format(self, v):
        if self.fmt == "raw":
            return v
        if self.fmt == "comma":
            return f"{int(v):,}"
        if self.fmt == "pct1":
            return f"{100 * v:.1f}"
        if self.fmt == "f2":
            return f"{v:.2f}"
        if self.fmt == "f4":
            return f"{v:.4f}"
        raise ValueError(self.fmt)


MEMORY_CLAIMS = [
    # --- the window's headline figures, all of which moved in session 1b ----
    Claim("corpus recovery is `recovery.rate` **{}**", "window", "recovery.rate", "f4"),
    Claim("recovery **{}**", "window", "recovery.rate", "f4"),
    Claim("measured **{}** shots", "window", "recovery.measured", "comma"),
    Claim("`disagreement.median_ft`); {}% within 6 ft", "window",
          "disagreement.within_6ft", "pct1"),
    Claim("Median **{} ft** apart", "window", "disagreement.median_ft", "f2"),
    Claim("{}% differ by more than 15 ft", "window", "disagreement.beyond_15ft", "pct1"),
    Claim("**{}%** of detected shots at 6 ft", "window", "disagreement.within_6ft", "pct1"),
    # The figure that was already adrift when session 3 opened.
    Claim("`recovery.attribution_agreement` **{}**", "window",
          "recovery.attribution_agreement", "f4"),
    Claim("`recovery.event_offsets` is `{}`", "window", "recovery.event_offsets", "offsets"),
    Claim("`WINDOW_RECOVERY_FLOOR` in qa.py (**{}**)", "code", "WINDOW_RECOVERY_FLOOR", "f2"),
    Claim("`pipeline/checks/mutations.py` holds **{} defects**", "code", "MUTATION_CASES"),

    # --- the paint ----------------------------------------------------------
    Claim("lifts **{} strokes**", "paint", "strokes", "comma"),
    Claim("**{}** corroborated possessions", "paint", "canvases", "comma"),
    Claim("**Mid-Range {}% of painted time**", "paint", "ink_by_zone.Mid-Range", "pct1"),
    Claim("**p10 {},", "paint", "speed_ft_s.p10", "f2"),
    Claim("p90 {}** as of", "paint", "speed_ft_s.p90", "f2"),
    Claim("{} of its 89 days", "paint", "days_covered", "comma"),

    # --- the record's own resolution and vocabulary -------------------------
    Claim("**{}** shots that were threes when taken", "season:1996",
          "contemporaneous.misfiled_threes", "comma"),
    Claim("under the line then in force it is **{}%**", "season:1996",
          "contemporaneous.contemporaneous_mid_share", "pct1"),
    Claim("{}% of rim shots unplaced", "season:1996", "resolution.ra_origin_share", "pct1"),
    Claim("**{}** in 1996-97 (four cover 90% of shots)", "season:1996",
          "vocabulary.words", "comma"),
    Claim("**{}**\n(2007-08)", "season:2007", "vocabulary.words", "comma"),
    Claim("**{} categories in 1996-97", "season:1996", "vocabulary.categories_total", "comma"),
    Claim("{} in 2015-16", "season:2015", "vocabulary.categories_total", "comma"),
    Claim("{} in 2024-25**", "season:2024", "vocabulary.categories_total", "comma"),

    # --- the schedule, and the ring the numerals settle on ------------------
    Claim("for **{} seconds**", "facts", "loop.seconds"),
    Claim("(**{}**)", "facts", "loop.clock"),
    Claim("**{} inclusive days**", "facts", "window.days_inclusive"),
    Claim("{} weeks", "facts", "window.weeks"),
    Claim("**{}-ft annulus**", "code", "RING_FT"),
]


def _memory_value(g, ctx, claim):
    """Resolve one claim's value out of the artifact that owns it."""
    if claim.source == "code":
        if claim.path == "WINDOW_RECOVERY_FLOOR":
            return WINDOW_RECOVERY_FLOOR
        if claim.path == "MUTATION_CASES":
            # The size of the defect catalogue, read from the catalogue. This
            # sentence said 42 for a session after the catalogue reached 49 -
            # the same drift F-16 exists to stop, in the section that explains
            # how a gate earns belief.
            from checks.mutations import CASES  # noqa: PLC0415

            return len(CASES)
        if claim.path == "RING_FT":
            # The annulus the season numerals settle on, from the renderer that
            # draws it. CLAUDE.md called it "the 16-ft annulus" for three
            # sessions while inscription.ts drew it somewhere else.
            import re  # noqa: PLC0415

            src = (ctx.repo / "site" / "src" / "inscription.ts")
            if not src.exists():
                return None
            m = re.search(r"^const RING_R = (\d+);", src.read_text(), re.M)
            return round(int(m.group(1)) / 10, 1) if m else None
        return None

    if claim.source.startswith("season:"):
        seasons = ctx.seasons(g)
        if not seasons:
            return None
        obj = seasons.get(int(claim.source.split(":")[1]))
    elif claim.source == "facts":
        f = ctx.json(g, "facts.json")
        obj = (f or {}).get("derived", {})
        e = obj.get(claim.path)
        return e["value"] if e else None
    else:
        obj = ctx.json(g, {"window": "window.json", "paint": "paint.json"}[claim.source])

    for part in claim.path.split("."):
        if not isinstance(obj, dict) or part not in obj:
            return None
        obj = obj[part]
    return obj


def _offsets_text(d):
    """`{-2: 7, -1: 1, 0: 531, ...}` - the histogram as CLAUDE.md writes it."""
    items = sorted(((int(k), v) for k, v in d.items()), key=lambda kv: kv[0])
    return "{" + ", ".join(f"{'+' if k > 0 else ''}{k}: {v}" for k, v in items) + "}"


def group_memory(g, ctx):
    """The machine-verifiable subset of CLAUDE.md, against the artifacts.

    Not every sentence - most of the file is reasoning and belongs to a reader.
    These are the ones that carry a number an artifact can settle.
    """
    g.section("Project memory")
    path = ctx.repo / "CLAUDE.md"
    if not path.exists():
        g.fail("project memory is present", f"{path} missing")
        return
    # Whitespace-normalised on both sides. CLAUDE.md is hard-wrapped prose and
    # gets re-wrapped constantly; a gate that broke every time a sentence moved
    # across a line boundary would be re-worded around rather than fixed.
    text = " ".join(path.read_text().split())

    unresolved, wrong = [], []
    for claim in MEMORY_CLAIMS:
        value = _memory_value(g, ctx, claim)
        if value is None:
            unresolved.append(f"{claim.source}:{claim.path}")
            continue
        if claim.fmt == "offsets":
            want = claim.template.format(_offsets_text(value))
        else:
            want = claim.render(value)
        if " ".join(want.split()) not in text:
            wrong.append(f"{claim.source}:{claim.path} -> {want!r}")
    g.check("every gated memory claim resolves to an artifact", unresolved, [])
    g.check("every gated memory claim is what the artifact says", wrong, [])
    g.info(f"{len(MEMORY_CLAIMS)} quantitative claims in CLAUDE.md are gated against "
           f"window.json, paint.json, seasons.json, facts.json and the code; the rest "
           f"of the file is reasoning and carries its artifact key inline")


# --- group: the palette ------------------------------------------------------


def group_palette(g, ctx):
    """THE FIELD's hues, and whether the site is still drawing the ones measured.

    The finding this gate closes (audit V-03) is not that the palette is bad -
    it is that `palette.ts` ASSERTED a separation nobody had measured. So the
    two things worth gating are that the claim is a real computation, and that
    the values the claim is about are the values the piece draws.

    RECOMPUTED, NOT READ BACK - but with the same library the stage used, and
    that limit is stated rather than dressed up. Two independent implementations
    of CIECAM02 would be checking a published appearance model against a
    hand-rolled version of itself; the failure mode that actually threatens this
    project is a stale or corrupt artifact and a source that has drifted from
    it, and those are what this catches.
    """
    p = ctx.json(g, "palette.json")
    if p is None:
        return
    g.section("THE FIELD's palette, measured")

    g.check("the palette names the league's seven regions", p.get("zones"), list(ZONE_NAMES))

    # The hues the SITE draws, out of the site's own source. The artifact is a
    # claim about this file; if they have parted, the claim describes a palette
    # nobody is looking at.
    import re  # noqa: PLC0415

    src = ctx.repo / "site" / "src" / "palette.ts"
    if not src.exists():
        g.fail("site/src/palette.ts is readable", f"{src} missing")
        return
    m = re.search(r"export const ZONE_RGB:\s*string\[\]\s*=\s*\[(.*?)\];", src.read_text(), re.S)
    site_rgb = [[int(v) for v in t] for t in
                re.findall(r'"\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*"', m.group(1))] if m else None
    g.check("the measured palette is the palette the site draws", site_rgb, p.get("rgb"))

    floor = (p.get("threshold") or {}).get("floor")
    target = (p.get("threshold") or {}).get("target")
    g.holds("the palette declares a floor and a target",
            isinstance(floor, (int, float)) and isinstance(target, (int, float))
            and 0 < floor <= target)
    if not isinstance(floor, (int, float)):
        return

    try:
        from colorspacious import cspace_convert  # noqa: PLC0415
    except ImportError:
        # NOT a silent skip. A gate that quietly stops checking when a library
        # is absent is the F-11 defect, so this is a failure with the fix in it.
        g.fail("the palette's separation can be recomputed",
               "colorspacious is not installed; it is pinned in requirements.txt")
        return

    import itertools  # noqa: PLC0415

    from palette import CONDITIONS  # noqa: PLC0415

    rgb01 = np.array(p["rgb"], dtype=float) / 255.0
    drift, under = [], []
    for cond, block in (p.get("separation") or {}).items():
        if cond not in CONDITIONS:
            drift.append(f"{cond} is not a condition palette.py knows")
            continue
        j = cspace_convert(rgb01, CONDITIONS[cond] or "sRGB1", "CAM02-UCS")
        want = {
            tuple(sorted((ZONE_NAMES[a], ZONE_NAMES[b]))): float(np.linalg.norm(j[a] - j[b]))
            for a, b in itertools.combinations(range(len(ZONE_NAMES)), 2)
        }
        for row in block.get("pairs", []):
            k = tuple(sorted((row.get("a"), row.get("b"))))
            if k not in want or abs(want[k] - row.get("distance", -1)) > 5e-3:
                drift.append(f"{cond}: {k} filed {row.get('distance')} vs {want.get(k)}")
        if abs(min(want.values()) - block.get("min", -1)) > 5e-3:
            drift.append(f"{cond}: min filed {block.get('min')} vs {min(want.values())}")
        if min(want.values()) < floor:
            under.append(f"{cond}: {min(want.values()):.3f} < {floor}")

    g.check("every filed separation is what the metric gives", drift, [])
    g.check(f"every condition clears the declared floor of {floor:g}", under, [])
    g.check("the artifact's own floor verdict is the recomputation's",
            p.get("meets_floor"), not under)

    # THE PALETTE DOES NOT MEET ITS TARGET, AND THE GATE ASSERTS THAT IT SAYS SO.
    # This is not a gate that the palette is good; it is a gate that the artifact
    # is HONEST about not being. Fixing the hues is separate, open work, and if
    # it ever lands this check is what forces the flag to move with them.
    below = p.get("below_target")
    g.check("the artifact's target verdict is its own list of failures",
            p.get("meets_target"), isinstance(below, list) and not below)
    if isinstance(below, list) and below:
        g.info(f"{len(below)} pair-condition(s) below the target of {target:g}: "
               f"{below[0]}" + (f" (+{len(below) - 1} more)" if len(below) > 1 else ""))

    # Which regions actually touch, so nobody argues a pair apart without it.
    touching = {tuple(sorted(pair)) for pair in p.get("adjacent_on_the_floor") or []}
    g.holds("the adjacency list is a set of real region pairs",
            all(len(t) == 2 and set(t) <= set(ZONE_NAMES) for t in touching) and touching)
    # LEFT CORNER 3 and RIGHT CORNER 3 are separated by the whole width of the
    # paint. That is why they may be close in hue; it is measured here so the
    # argument cannot be made without it.
    g.holds("the two corner threes never meet on the floor",
            tuple(sorted(("Left Corner 3", "Right Corner 3"))) not in touching)

    comp = (p.get("composite") or {}).get("below_floor")
    if isinstance(comp, list) and comp:
        g.info(f"the DRAWN mark falls below the floor at {len(comp)} level-condition(s) - "
               f"e.g. {comp[0]} - because `lighter` over a near-black ground carries every "
               f"hue toward the ground as density falls")


# --- group: the deploy allowlist ---------------------------------------------


def group_deploy(g, ctx):
    """What the site may publish, decided rather than defaulted.

    The defect this closes is not the payload, it is PUBLISH-BY-DEFAULT:
    sync-data.mjs copied data/processed/ wholesale, so anything that appeared
    there shipped. The list is now explicit, reviewed per row in
    REQUIRED_ARTIFACTS, and read by the Node side from a committed file - the
    same cross-toolchain shape the zone fixture already uses.

    This group gates the FILE against the table. The `dist/data` test belongs to
    the toolchain that builds dist and lives in site/scripts/check-public-data.mjs,
    which `npm run build` runs after vite; putting it here would mean a check
    that silently does nothing on a repo nobody has built, and session 2 removed
    the last of those.
    """
    g.section("The deploy allowlist")
    seasons = ctx.seasons(g)
    if not seasons:
        return
    years = sorted(seasons)
    path = ctx.repo / "pipeline" / "deploy_allowlist.json"
    if not path.exists():
        g.fail("the deploy allowlist exists",
               f"{path} missing - run python3 pipeline/qa.py --write-deploy-allowlist")
        return
    try:
        got = json.loads(path.read_text())
    except Exception as e:  # noqa: BLE001
        g.fail("the deploy allowlist parses", f"{type(e).__name__}: {e}")
        return

    want = deploy_allowlist(years)
    g.check("the allowlist the site reads is the table the gate holds",
            got.get("public"), want["public"])
    g.check("the artifacts held back are the ones the table holds back",
            got.get("private"), want["private"])
    g.check("every allowlisted path is a required artifact",
            sorted(set(got.get("public", [])) - set(want["public"] + want["private"])), [])
    # A file cannot be both served and withheld, and between them the two lists
    # must account for every required artifact - otherwise a new one could be
    # added to the table and reach neither, which is publish-by-default again
    # wearing a list.
    g.check("no artifact is both served and withheld",
            sorted(set(got.get("public", [])) & set(got.get("private", []))), [])
    expected = {rel for art in REQUIRED_ARTIFACTS for rel in art.paths(years)}
    g.check("the two lists account for every required artifact",
            sorted(expected - set(want["public"]) - set(want["private"])), [])
    g.info(f"{len(want['public'])} of {len(expected)} artifacts are served; "
           f"{len(want['private'])} are held back "
           f"({', '.join(sorted({a.path for a in REQUIRED_ARTIFACTS if not a.public}))})")


# --- the groups, in the order they print -------------------------------------

GROUPS = {
    "spine": group_spine,
    "resolution": group_resolution,
    "vocabulary": group_vocabulary,
    "filing": group_filing,
    "shot_artifacts": group_shot_artifacts,
    "zone_vs_league": group_zone_vs_league,
    "zone_parity": group_zone_parity,
    "window": group_window,
    "paint": group_paint,
    "traces": group_traces,
    "palette": group_palette,
    "inventory": group_inventory,
    "deploy": group_deploy,
    "memory": group_memory,
}
SPINE_ONLY = ["spine", "resolution", "vocabulary", "shot_artifacts", "inventory"]
# Everything except the one group that reads the raw season dumps. This is also
# what the mutation suite runs, so it never pays for the CSVs.
FAST_GROUPS = [k for k in GROUPS if k != "zone_vs_league"]


def run_groups(names, root, allow_raw=True, quiet=False, repo=None):
    g = Gate(quiet=quiet)
    ctx = Ctx(root, allow_raw=allow_raw, repo=repo)
    for name in names:
        g.group = name
        try:
            GROUPS[name](g, ctx)
        except Exception as e:  # noqa: BLE001 - a crashing group is a failed group
            import traceback  # noqa: PLC0415

            g.fail(f"the {name} group completes", f"{type(e).__name__}: {e}")
            if not quiet:
                traceback.print_exc()
    return g


# --- the narrative beats the piece quotes ------------------------------------


def narrative(root):
    """Context lines the piece quotes. Printed for the record, never gated."""
    path = Path(root) / "seasons.json"
    if not path.exists():
        return
    seasons = {r["year"]: r for r in json.loads(path.read_text())["seasons"]}
    if not {1996, 2012, 2019, 2024, 2015} <= set(seasons):
        return
    m96 = 100 * seasons[1996]["mid_share"]
    m12 = 100 * seasons[2012]["mid_share"]
    m19 = 100 * seasons[2019]["mid_share"]
    m24 = 100 * seasons[2024]["mid_share"]
    m15 = 100 * seasons[2015]["mid_share"]
    print("\nMeasured narrative beats (informational):")
    print(f"  pre-camera slope 1996-97..2012-13: {(m96 - m12) / 16:.2f} pp/season (plan: ~0.7)")
    print(f"  camera-era slope 2012-13..2019-20: {(m12 - m19) / 7:.2f} pp/season (plan: ~2.1)")
    print(f"  collapse midpoint (39.9+9.7)/2 = {(m96 + m24) / 2:.1f}; "
          f"the window season sits at {m15:.1f}")
    c = seasons[1996]["contemporaneous"]
    print(f"  1996-97 opens at {100 * c['taxonomy_mid_share']:.1f}% by the NBA's zone taxonomy, "
          f"{100 * c['contemporaneous_mid_share']:.1f}% under the line then in force "
          f"({c['misfiled_threes']:,} threes filed as Mid-Range)")


# --- the slow, raw-corpus recomputations -------------------------------------
# Independent recomputations that reopen the archives. Off by default because
# they parse gigabytes; the DEFAULT gate is semantic without them.
SLOW_CHECKS = [
    ["checks/check_paint_join.py"],
    ["checks/check_offsets.py"],
    ["checks/check_strokes.py", "--slow"],
    ["checks/check_movement.py"],
]


def run_slow_checks():
    import subprocess  # noqa: PLC0415

    here = Path(__file__).resolve().parent
    failed = []
    print("\n--slow: the independent recomputations, from the raw corpus")
    for cmd in SLOW_CHECKS:
        script = here / cmd[0]
        if not script.exists():
            failed.append(f"{cmd[0]} missing")
            continue
        print(f"\n  $ {' '.join(['python3', cmd[0]] + cmd[1:])}")
        r = subprocess.run([sys.executable, str(script)] + cmd[1:],
                           cwd=here.parent, capture_output=True, text=True)
        tail = [ln for ln in r.stdout.splitlines() if ln.strip()][-6:]
        for ln in tail:
            print(f"    {ln}")
        if r.returncode != 0:
            print(f"    FAIL  exit {r.returncode}")
            if r.stderr.strip():
                print(f"    {r.stderr.strip().splitlines()[-1]}")
            failed.append(f"{cmd[0]} exit {r.returncode}")
    print(f"\n  {len(SLOW_CHECKS) - len(failed)}/{len(SLOW_CHECKS)} independent "
          f"recomputations agree with what shipped")
    return failed


# --- main --------------------------------------------------------------------


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--processed", default=str(PROCESSED_DIR),
                    help="the artifact root every read goes through")
    ap.add_argument("--only", help="comma-separated group names")
    ap.add_argument("--spine-only", action="store_true",
                    help="the shot stage alone; NOT the shipping gate")
    ap.add_argument("--no-raw", action="store_true",
                    help="data/shots/ is absent (a fresh public clone); NOT the shipping gate")
    ap.add_argument("--mutations", action="store_true",
                    help="the mutation suite alone")
    ap.add_argument("--no-mutations", action="store_true",
                    help="skip the mutation suite; NOT the shipping gate")
    ap.add_argument("--slow", action="store_true",
                    help="also run the recomputations that reopen the raw corpus")
    ap.add_argument("--write-zone-fixture", action="store_true",
                    help="regenerate pipeline/checks/zone_fixture.json from common.zone_at")
    ap.add_argument("--write-deploy-allowlist", action="store_true",
                    help="regenerate pipeline/deploy_allowlist.json from REQUIRED_ARTIFACTS")
    args = ap.parse_args()

    if args.write_zone_fixture:
        write_zone_fixture()
        return

    if args.write_deploy_allowlist:
        write_deploy_allowlist()
        return

    from checks.mutations import run_mutations  # noqa: PLC0415

    if args.mutations:
        sys.exit(0 if run_mutations(Path(args.processed)) else 1)

    if args.only:
        unknown = [n for n in args.only.split(",") if n not in GROUPS]
        if unknown:
            sys.exit(f"unknown group(s): {', '.join(unknown)}; "
                     f"known: {', '.join(GROUPS)}")
        names = [n for n in GROUPS if n in args.only.split(",")]
    elif args.spine_only:
        names = SPINE_ONLY
    elif args.no_raw:
        names = list(GROUPS)
    else:
        names = list(GROUPS)

    reduced = []
    if args.no_raw:
        reduced.append(f"raw dumps absent, {ZONE_VS_LEAGUE_CHECKS} checks not run")
    if args.spine_only:
        reduced.append(f"--spine-only, {len(GROUPS) - len(SPINE_ONLY)} groups not run")
    if args.only:
        reduced.append(f"--only {args.only}")
    if args.processed != str(PROCESSED_DIR):
        reduced.append(f"--processed {args.processed}")

    print(f"FADEAWAY acceptance gate - {len(names)} of {len(GROUPS)} groups"
          + (f"\n  REDUCED: {'; '.join(reduced)}" if reduced else ""))

    g = run_groups(names, Path(args.processed), allow_raw=not args.no_raw)
    narrative(Path(args.processed))

    failures = list(g.failures)
    if args.slow:
        failures += [(("--slow"), f, None, None) for f in run_slow_checks()]

    run_muts = not (args.no_mutations or args.spine_only or args.only)
    if run_muts:
        if not run_mutations(Path(args.processed)):
            failures.append(("mutations", "the mutation suite catches every defect",
                             "a mutation survived", "all red"))
    elif not args.only:
        reduced.append("--no-mutations")

    if failures:
        print(f"\nQA RED: {len(failures)} mismatch(es). The pipeline is wrong, not the plan.")
        for grp, name, _got, _want in failures:
            print(f"  [{grp}] {name}")
        sys.exit(1)
    if reduced:
        print(f"\nQA GREEN (REDUCED - {'; '.join(reduced)}): "
              f"{g.n_checks} checks, section 1.6 reproduced exactly.")
    else:
        print(f"\nQA GREEN: {g.n_checks} checks, section 1.6 reproduced exactly.")


if __name__ == "__main__":
    main()
