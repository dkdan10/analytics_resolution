#!/usr/bin/env python3
"""Stage 2 - aggregate the shot record into the piece's per-season exports.

Reads data/shots/shotdetail_YYYY.tar.xz and writes to data/processed/:
  seasons.json               per-season zone shares, counts, FG%, dates
  samples/season_YYYY.json   fixed-seed spatial sample (~2,000 halfcourt dots)
  grids/season_YYYY.json     1-ft binned attempt-density grid (for OT/transitions)

Zone definitions (disclosed in wall text; the acceptance table is TABLE_1_6 in qa.py):
  mid-range  = SHOT_ZONE_BASIC == "Mid-Range"   (the NBA's own zone taxonomy)
  3PT        = SHOT_TYPE == "3PT Field Goal"    (attempt type, not zone)
These diverge in 1996-97: the shortened line (1994-97) put many 3PT attempts
inside the modern Mid-Range polygon. That divergence is content, not a bug.

It also drives FADEAWAY's texture ladder, so this stage measures the record's
own resolution alongside the game's drift ("grain is a measurement, not a mood"):
  origin_snapped   restricted-area shots filed at exactly (0,0) - the record
                   declining to say WHERE at the rim. 95.4% in 1996-97, 0.0%
                   from 2010-11, ~9% from 2020-21 (tip-ins/putbacks only).
  arena resolution which buildings recorded rim coordinates. Through 2009-10
                   only five or six did; it follows the ARENA, not the team.
  contemporaneous  1996-97's mid-range share recomputed under the 22-ft line
                   actually in force, against the modern polygons the taxonomy
                   applies retroactively.

Usage: python3 pipeline/aggregate.py [--years 1996,2015,...]
"""

import argparse
import datetime
import json
import sys
from pathlib import Path

# The interpreter check runs before numpy, so the wrong python3 explains itself
# rather than raising a bare ModuleNotFoundError.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    HALF_X_MAX,
    HALF_Y_MAX,
    HALF_Y_MIN,
    PROCESSED_DIR,
    PROVENANCE,
    SAMPLE_SEED,
    SEASON_START_YEARS,
    die,
    read_season_csv,
    require_env,
    season_label,
    write_json,
)

require_env()

import numpy as np  # noqa: E402

USECOLS = [
    "GAME_ID",
    "GAME_DATE",
    "TEAM_ID",
    "HTM",
    "ACTION_TYPE",
    "LOC_X",
    "LOC_Y",
    "SHOT_DISTANCE",
    "SHOT_ZONE_BASIC",
    # The rest of the machine's classification of a shot, tallied by THE CENSUS.
    "SHOT_ZONE_AREA",
    "SHOT_ZONE_RANGE",
    "EVENT_TYPE",
    "SHOT_TYPE",
    "SHOT_ATTEMPTED_FLAG",
    "SHOT_MADE_FLAG",
]

DTYPES = {
    "GAME_ID": str,
    "GAME_DATE": str,
    "TEAM_ID": np.int64,
    "HTM": str,
    "LOC_X": np.int32,
    "LOC_Y": np.int32,
    "SHOT_DISTANCE": np.int32,
    "SHOT_ATTEMPTED_FLAG": np.int8,
    "SHOT_MADE_FLAG": np.int8,
}

# The six ways the record files a shot, and the column each one is. ONE map,
# read by the vocabulary count, the tally and the filing's places, so a taxonomy
# cannot exist in one of the three and not the others.
TAXONOMIES = {
    "TYPE": "SHOT_TYPE",
    "RESULT": "EVENT_TYPE",
    "ZONE": "SHOT_ZONE_BASIC",
    "RANGE": "SHOT_ZONE_RANGE",
    "AREA": "SHOT_ZONE_AREA",
    "DESCRIPTION": "ACTION_TYPE",
}

ZONES = [
    "Restricted Area",
    "In The Paint (Non-RA)",
    "Mid-Range",
    "Left Corner 3",
    "Right Corner 3",
    "Above the Break 3",
    "Backcourt",
]

SAMPLE_N = 2000

# The halfcourt box, in tenths of feet from the hoop. Defined in common.py since
# the gate has to ask the same question of THE CENSUS's filing; imported rather
# than restated so the two cannot drift.
GRID_X_EDGES = np.arange(-HALF_X_MAX, HALF_X_MAX + 1, 10)  # 50 one-foot bins
GRID_Y_EDGES = np.arange(HALF_Y_MIN, HALF_Y_MAX + 1, 10)   # 47 one-foot bins

# Season notes ship as data so the piece never hand-types a caveat.
# {games} is derived from the dump (games per team, asserted exact); {window}
# comes from the SportVU probe artifact (a script output). The remaining dates
# are external history, not derivable from this dataset: the shortened-line era
# and the BOS@IND cancellation date (Apr 15, 2013 Boston
# Marathon bombing; verified in the dump as BOS/IND at 81 games each).
SEASON_NOTES = {
    1996: "shortened 3PT line era (1994-97); clean baseline starts 1997-98",
    1998: "lockout season ({games} games per team) - short, not sparse",
    2011: "lockout season ({games} games per team) - short, not sparse",
    2012: "{n_games} games, not {schedule}: BOS@IND (Apr 16, 2013) cancelled "
          "after the Boston Marathon bombing, never replayed - the record is complete",
    2015: "THE WINDOW: public SportVU corpus {window}",
    2019: "bubble season - short, not sparse",
    2020: "{games}-game pandemic schedule - short, not sparse",
}

REGULATION_GAMES = 82  # league constant, external to this dataset

# A game is "full-resolution" when almost none of its restricted-area shots were
# filed at the origin. The gap is stark (arenas sit at ~0% or ~75%+), so the
# threshold is a formality rather than a tuned parameter.
FULL_RES_GAME_MAX_SNAP = 0.05
FULL_RES_ARENA_MIN_GAMES = 0.5   # majority of a team's home games

# Whether the record's rim blindness is a property of the BUILDING or a rule
# applied league-wide is decided by the spread across arenas, which is not a
# close call: in the uneven era arenas run 0.1% to 99.8% (spread ~99pp), while
# uniform seasons spread under 40pp. Four regimes fall out, and the renderer
# picks its texture from these rather than from hardcoded year ranges.
UNEVEN_SPREAD_PP = 40.0
MOSTLY_SIGHTED_MAX = 0.02        # league-wide share below which the rim is placed

# The three-point line stood at 22 ft everywhere from 1994-95 through 1996-97.
# SHOT_ZONE_BASIC encodes the modern 23'9" geometry and is applied retroactively,
# so the taxonomy files thousands of that era's threes as "Mid-Range". Only
# 1996-97 is in this dataset; 1997-98 onward needs no correction.
SHORTENED_LINE_YEARS = {1996}
# The radius of that line, in feet. External history, not a measurement: no dump
# records the geometry it was played under. It is declared HERE, beside the years
# it applies to, and emitted into `contemporaneous.line_ft` so that the words the
# plate prints ("UNDER THE 22-FT LINE THEN IN FORCE") and the arc the plate draws
# for 1996-97 both read one key instead of each carrying their own copy of 22.
SHORTENED_LINE_FT = 22.0

# Fallback for the window span if the probe artifact is absent; measured in
# pipeline/sportvu_probe.py, which gates this exact value (plan section 1.1).
WINDOW_FALLBACK = ("2015-10-27", "2016-01-23")


def window_span():
    probe = PROCESSED_DIR / "sportvu_probe.json"
    if probe.exists():
        listing = (json.loads(probe.read_text()).get("corpus_listing") or {})
        dr = listing.get("date_range")
        if dr:
            if tuple(dr) != WINDOW_FALLBACK:
                die(f"sportvu_probe.json date_range {dr} != expected {WINDOW_FALLBACK}")
            return f"{dr[0]} .. {dr[1]}"
    return f"{WINDOW_FALLBACK[0]} .. {WINDOW_FALLBACK[1]}"


def render_note(year, template, n_games, n_teams):
    note = template
    if "{games}" in note:
        if (n_games * 2) % n_teams:
            die(f"{season_label(year)}: games per team not integral ({n_games} games, {n_teams} teams)")
        note = note.replace("{games}", str(n_games * 2 // n_teams))
    if "{n_games}" in note:
        note = note.replace("{n_games}", f"{n_games:,}")
    if "{schedule}" in note:
        note = note.replace("{schedule}", f"{n_teams * REGULATION_GAMES // 2:,}")
    if "{window}" in note:
        note = note.replace("{window}", window_span())
    return note


def measure_resolution(year, df):
    """Measure how finely the record could draw this season.

    Every value here is a measurement of the archive, not of the game.

    MEASURED AT THE SENTINEL, NOT AT THE ORIGIN (changed 2026-08-09). Both the
    regime and the arena spread used to be read off shots filed at EXACTLY
    (0,0), which is one coordinate rather than the phenomenon: six seasons file
    their refusal somewhere else and reported a flawless 0.0% while piling two
    and a half to five per cent of the season onto a single cell beside the rim.
    So the classification now reads `rim_sentinel` - the coordinate the record
    actually piles on - and the exact-origin figures ship beside it, unchanged,
    because they are what every earlier reading of this archive was made from.
    """
    n = len(df)
    at_origin = (df.LOC_X == 0) & (df.LOC_Y == 0)
    ra = df.SHOT_ZONE_BASIC == "Restricted Area"
    ra_n = int(ra.sum())
    ra_origin = int((ra & at_origin).sum())

    sentinel = measure_rim_sentinel(df)

    # Which action types the record declines to place - READ AT THE SENTINEL.
    # Until 2026-08-09 this was read at the exact origin, so in 2017-18 through
    # 2019-20 it named the handful of stragglers still filed at (0,0) - ten
    # Driving Layups against a pile of 3,649 Tip Layups six tenths away - and in
    # 2014-15 through 2016-17 it was empty. THE LEDGER composes the pin's
    # caption out of the first key of this dict, so an origin-derived answer
    # beside a sentinel-drawn pin would have put two different populations in
    # one sentence.
    refused = (
        {k: v["n"] for k, v in list(sentinel["composition"].items())[:6]}
        if sentinel and sentinel["is_refusal"] else {}
    )

    # Resolution by building: a game is full-resolution when its restricted-area
    # shots carry real coordinates. Keyed by home team = the arena.
    per_game = (
        df[ra].assign(_snap=at_origin[ra])
        .groupby("GAME_ID")
        .agg(snap=("_snap", "mean"), arena=("HTM", "first"))
    )
    per_game["full"] = per_game.snap < FULL_RES_GAME_MAX_SNAP
    by_arena = per_game.groupby("arena")["full"].mean()
    full_arenas = sorted(by_arena[by_arena >= FULL_RES_ARENA_MIN_GAMES].index)

    arena_rate = per_game.groupby("arena")["snap"].mean()
    origin_spread_pp = (
        float(100 * (arena_rate.max() - arena_rate.min())) if len(arena_rate) else 0.0
    )

    # The same question asked of the coordinate the record actually uses. In the
    # uneven era the sentinel IS the origin, so this reproduces the old figure;
    # in the six displaced seasons it is the only version that measures anything.
    spread_pp = sentinel_arena_spread_pp(df, ra, sentinel)

    # How much of the rim the refusal swallows. Zero when the busiest rim
    # coordinate is not a refusal at all, because then nothing is being
    # refused - a share read off an ordinary coordinate would classify four
    # seasons on a number that means nothing.
    league_share = float(ra_origin / ra_n) if ra_n else 0.0
    sentinel_share = (
        float(sentinel["share_of_rim"]) if sentinel and sentinel["is_refusal"] else 0.0
    )

    if spread_pp >= UNEVEN_SPREAD_PP:
        # Some buildings recorded rim coordinates and others did not.
        regime = "uneven"
    elif sentinel_share <= MOSTLY_SIGHTED_MAX:
        regime = "uniformly_sighted"
    elif sentinel_share < SENTINEL_WHOLESALE_SHARE:
        # A small, uniform residue confined to specific action types: the
        # taxonomy declining to place shots, not an instrument failing to see.
        regime = "categorical_refusal"
    else:
        regime = "uniformly_blind"

    return {
        "origin_snapped": int(at_origin.sum()),
        "origin_snapped_share": float(at_origin.mean()),
        "ra_attempts": ra_n,
        "ra_origin_snapped": ra_origin,
        "ra_origin_share": league_share,
        "refused_action_types": refused,
        # WHERE the refusal actually is, which is not always the origin. See
        # measure_rim_sentinel: `origin_snapped` above measures one coordinate,
        # this measures the phenomenon, and for six seasons they disagree
        # completely.
        "rim_sentinel": sentinel,
        "regime": regime,
        "arena_spread_pp": spread_pp,
        # The same spread measured at the exact origin - what the regime was
        # classified on until 2026-08-09. Kept so the two readings can be
        # compared rather than one silently replacing the other.
        "origin_arena_spread_pp": origin_spread_pp,
        # Only meaningful where the regime is uneven; elsewhere every arena is
        # alike and naming a subset would imply a distinction that is not there.
        "full_resolution_arenas": full_arenas if regime == "uneven" else [],
        "n_full_resolution_arenas": len(full_arenas) if regime == "uneven" else 0,
        "full_resolution_games": int(per_game["full"].sum()),
        "n_games_with_ra": int(len(per_game)),
    }


def sentinel_arena_spread_pp(df, ra, sentinel):
    """How unevenly the sentinel is used across the league's buildings.

    The uneven era's whole finding is that rim blindness was a property of the
    BUILDING - arenas run 0.1% to 99.8% - and that question has to be asked of
    the coordinate the record actually piles on, or it is asked of an empty cell
    for six seasons. It is also the second, weaker axis of the sentinel's
    corroboration: a convention applied league-wide spreads a few points across
    thirty arenas, a habit of one scorer's table spreads ninety-nine.
    """
    if sentinel is None:
        return 0.0
    x1, y1 = sentinel["coord"]
    on = (df.LOC_X == x1) & (df.LOC_Y == y1)
    per_game = (
        df[ra].assign(_s=on[ra])
        .groupby("GAME_ID")
        .agg(s=("_s", "mean"), arena=("HTM", "first"))
    )
    rate = per_game.groupby("arena")["s"].mean()
    return float(100 * (rate.max() - rate.min())) if len(rate) else 0.0


"""How far a refusal's coordinate must lead the busiest real one.

MEASURED, AND THE DISTRIBUTION IS BIMODAL WITH AN ENORMOUS EMPTY BAND. Across
the thirty seasons the leading rim coordinate beats the runner-up by either
1.9-2.2x or 17.8x-2928x, and NOTHING falls between. Any threshold from about 3
to about 15 classifies every season identically; 8 sits in the middle of that
band. The same footing MIN_RUN_FRAMES stands on in paint.py.
"""
SENTINEL_LEAD = 8.0

"""How much of the rim a refusal must swallow before it is the rim itself.

MEASURED, AND THE BAND IS ENORMOUS. Among the twenty-six seasons whose busiest
rim coordinate is a refusal, `share_of_rim` is either 0.081-0.152 or 0.734-0.954
and NOTHING falls between - a gap of 0.58. Below the band the record is
declining to place a named CATEGORY of shot; above it the record is declining to
place the rim. Any threshold from about 0.2 to about 0.7 classifies every season
identically. This is the same 0.5 the regime already split on, named and
measured rather than written into the branch.
"""
SENTINEL_WHOLESALE_SHARE = 0.5

"""Which of the two categorical refusals a season files, from the record's own
made/missed column.

MEASURED, AND BIMODAL WITH A 0.27 EMPTY BAND. Among the seasons whose sentinel
is a refusal, the pile converts at either 0.552-0.642 or 0.9085-0.9124, with
nothing between. That is not a curiosity: a pile that converts at .91 is a pile
of dunks, and one at .62 is a pile of tip-ins and putbacks. The action-type
composition shipped beside it says the same thing in the record's own words -
2014-15 to 2016-17 are 96.5-98.8% dunk, 2017-18 onward 97.7-99.1% tip or
putback - so the label is a reading of two independent measurements rather than
a claim standing on its own. Any threshold from about 0.65 to about 0.90
classifies every season identically; 0.775 is the middle of the band.
"""
SENTINEL_DUNK_FG = 0.775

"""How much of the pile the shipped composition has to account for.

NOT A FIXED COUNT, and it was one until this was checked. A flat top-eight
covered as little as 89.5% of a pile (2008-09), so a reader of the public
artifact could not reproduce a statement about what the pile IS - the shipped
rows left several per cent unaccounted and any share computed from them was a
lower bound. The rule is now stated as coverage: ship names in descending order
until this much of the pile is named, and ship `composition_covers` beside it so
the shortfall is visible rather than assumed away.
"""
SENTINEL_COMPOSITION_COVERS = 0.99


def measure_rim_sentinel(df):
    """WHERE the record refuses to place a rim shot - which is not always (0,0).

    THE DEFECT THIS EXISTS TO CORRECT (found 2026-08-08). `origin_snapped` counts
    shots filed at EXACTLY the origin, and every claim this project makes about
    the record's rim blindness was read off it - including "2010-11 to 2019-20,
    uniformly_sighted, 0.0%, all thirty arenas, in one step". That figure is
    true and it measures ONE COORDINATE rather than the phenomenon: six of those
    ten seasons pile two and a half to five per cent of the whole season onto a
    single coordinate NEXT TO the rim, and `origin_snapped` reports 0.00% for
    every one of them.

    So the refusal never went away in 2010-11. IT CHANGED ADDRESS, twice, and
    then changed back:

        1996-97 - 2009-10   (0, 0)
        2010-11 - 2013-14   nowhere - the record places every rim shot
        2014-15 - 2016-17   (0, 1)
        2017-18 - 2019-20   (0, -6)
        2020-21 -           (0, 0) again

    Which sharpens the 2010-11 cut rather than weakening it: the exact-origin
    pile really does end there, in one step, and for FOUR seasons the record
    genuinely places everything. The uniformly-sighted era is four seasons long,
    not ten.

    Nothing here is classified by eye. The lead over the runner-up is shipped, so
    a reader can see the separation rather than take the label on trust.

    AND THE PILE IS NOT ONE THING (found 2026-08-09). The three addresses above
    were read as one refusal that wandered. They are three different acts, and
    the record's own columns say so without being asked twice:

        1996-97 - 2009-10   (0, 0)   72-80% ordinary layups, converting at
                                     .55-.63, and it holds 80-99% of every dunk,
                                     layup and tip the season files. The record
                                     is declining to place THE RIM.
        2014-15 - 2016-17   (0, 1)   96.5-98.8% DUNK, converting at .91, holding
                                     94.7-97.2% of the league's whole dunk
                                     population. A dunk convention.
        2017-18 -           (0,-6),  97.7-99.1% tip and putback, converting at
                            then     .61-.64, holding 56-70% of the league's
                            (0, 0)   whole tip and putback population - the same
                                     four names in the same order either side of
                                     the 2020-21 move.

    Two different statements live here and conflating them is easy, so both are
    said plainly. The REGIME `categorical_refusal` - a named category of shot
    the taxonomy declines to place - begins in 2014-15, and `regime` says so.
    The particular category it declines changes once inside that era: dunks
    through 2016-17, tip-ins and putbacks from 2017-18 on. So the TIP-AND-PUTBACK
    refusal this project dated to 2020-21 actually began in 2017-18 at a
    different address, and the era containing it began three seasons earlier
    still on a different category. `rim_sentinel.kind` is that second axis. `composition` ships the record's
    own names and `share_of_type` beside each, which is the measurement the
    reading rests on: a name whose whole season sits on one cell is a name the
    record never placed at all.
    """
    ra = df[df.SHOT_ZONE_BASIC == "Restricted Area"]
    if ra.empty:
        return None
    counts = ra.groupby(["LOC_X", "LOC_Y"]).size().sort_values(ascending=False)
    (x1, y1), n1 = counts.index[0], int(counts.iloc[0])
    second = counts.iloc[1] if len(counts) > 1 else 0
    (x2, y2) = counts.index[1] if len(counts) > 1 else (None, None)
    lead = float(n1 / second) if second else float("inf")
    is_refusal = bool(lead >= SENTINEL_LEAD)

    # The pile itself: every shot the record filed on that coordinate, not only
    # the restricted-area ones the sentinel was found among. For the (0,0)
    # seasons this is exactly `origin_snapped`, which is the check qa.py makes.
    pile = df[(df.LOC_X == x1) & (df.LOC_Y == y1)]
    by_type = pile.ACTION_TYPE.value_counts()
    season_by_type = df.ACTION_TYPE.value_counts()
    composition, covered = {}, 0
    for name, k in by_type.items():
        composition[str(name)] = {
            "n": int(k),
            "share_of_pile": round(float(k) / len(pile), 5),
            # WHAT SHARE OF THE LEAGUE'S WHOLE POPULATION OF THIS NAME SITS
            # HERE. The finding: in 2015-16, 97.7% of every shot the record
            # calls a Dunk Shot is on this one cell.
            "share_of_type": round(float(k) / int(season_by_type[name]), 5),
        }
        covered += int(k)
        if covered / len(pile) >= SENTINEL_COMPOSITION_COVERS:
            break

    off = ra[(ra.LOC_X != x1) | (ra.LOC_Y != y1)]
    fg = float(pile.SHOT_MADE_FLAG.mean())

    return {
        "coord": [int(x1), int(y1)],
        "n": n1,
        "share_of_season": float(n1 / len(df)),
        "share_of_rim": float(n1 / len(ra)),
        "runner_up_coord": [int(x2), int(y2)] if x2 is not None else None,
        "runner_up_n": int(second),
        # How far the leader leads. THE SEPARATION, shipped, so the label below
        # is a reading of a number rather than a claim on its own.
        "lead_ratio": round(lead, 2) if second else None,
        "is_refusal": is_refusal,
        # Only meaningful when it IS a refusal; None otherwise, rather than a
        # zero that would read as "the record refused nothing at (0,0)".
        "at_origin": bool(x1 == 0 and y1 == 0) if is_refusal else None,
        "pile_n": int(len(pile)),
        "composition": composition,
        # How much of the pile the names above account for. Shipped so a share
        # computed from `composition` declares its own completeness instead of
        # silently being a lower bound.
        "composition_covers": round(covered / len(pile), 5),
        "fg_pct": round(fg, 5),
        # The same season's other rim shots. .91 means nothing without it.
        "fg_pct_off_sentinel": (
            round(float(off.SHOT_MADE_FLAG.mean()), 5) if len(off) else None
        ),
        # WHICH refusal this is, read off the two measured bands above. None
        # when the busiest coordinate is not a refusal, because an ordinary
        # coordinate is not a kind of anything.
        "kind": (
            None if not is_refusal
            else "wholesale" if n1 / len(ra) >= SENTINEL_WHOLESALE_SHARE
            else "dunk" if fg >= SENTINEL_DUNK_FG
            else "tip_putback"
        ),
    }


def measure_contemporaneous(year, df):
    """1996-97 only: the mid-range share under the line actually in force.

    SHOT_ZONE_BASIC encodes today's 23'9" arc and is applied retroactively, so
    shots beyond the 22-ft line of 1994-97 are filed as "Mid-Range" although they
    were three-pointers when taken. Reclassify by the record's own SHOT_TYPE,
    which is contemporaneous.
    """
    if year not in SHORTENED_LINE_YEARS:
        return None
    n = len(df)
    is3 = df.SHOT_TYPE == "3PT Field Goal"
    mid = df.SHOT_ZONE_BASIC == "Mid-Range"
    misfiled = mid & is3
    return {
        "line_ft": SHORTENED_LINE_FT,
        "taxonomy_mid_attempts": int(mid.sum()),
        "taxonomy_mid_share": float(mid.mean()),
        "misfiled_threes": int(misfiled.sum()),
        "contemporaneous_mid_attempts": int((mid & ~is3).sum()),
        "contemporaneous_mid_share": float((mid & ~is3).sum() / n),
        "three_attempts_by_type": int(is3.sum()),
        "three_attempts_by_zone": int(
            df.SHOT_ZONE_BASIC.isin(["Left Corner 3", "Right Corner 3", "Above the Break 3"]).sum()
        ),
        "note": (
            "the 3PT line stood at 22 ft in 1994-97; SHOT_ZONE_BASIC applies the modern "
            "23'9\" geometry retroactively, filing these attempts as Mid-Range"
        ),
    }


def measure_schema(year):
    """How wide the record is per shot, measured from the dump's own header.

    CLAUDE.md asserts that the per-shot field count does NOT grow - "same 24
    columns in all 30 seasons" - while the vocabulary does. That was a claim
    nobody had checked, and it is the honest counterweight to the second curve:
    Act V's crowding comes from richer DESCRIPTION, never from more fields. So
    it is measured here and asserted constant across the thirty in main().

    `positions_per_shot` is counted the same way rather than written down: the
    record holds exactly one coordinate pair for a shot, which is the whole of
    what THE CENSUS means by "Points per shot · 1". Counting the LOC_ columns
    means that line would change if the schema ever held a second position.
    """
    import re

    header = read_season_csv(year, nrows=0)
    cols = list(header.columns)
    loc = [c for c in cols if re.fullmatch(r"LOC_[XY]", c)]
    if len(loc) % 2:
        die(f"{season_label(year)}: {len(loc)} coordinate column(s), not whole pairs: {loc}")
    return {
        "fields_per_shot": len(cols),
        "positions_per_shot": len(loc) // 2,
        "fields": cols,
    }


def measure_vocabulary(df):
    """How much the record has to say about what a shot WAS.

    The second curve in this archive, and the mirror of the first: as the record
    stops saying *where* a rim shot happened it learns to say *what* every shot
    was, from nine words in 1996-97 to forty-eight by 2024-25. Measured over the
    whole season, not the sample, so the piece renders the record's vocabulary
    rather than a draw from it.
    """
    a = df.ACTION_TYPE.dropna()
    counts = a.value_counts()
    # Every taxonomy the record applies to a shot, added up: this is the size of
    # the vocabulary the machine has for saying what happened, 31 in 1996-97 and
    # 70 by 2024-25.
    taxonomies = {
        col: int(df[col].dropna().nunique())
        for col in TAXONOMIES.values()
    }
    # How many words are needed to account for 90% of the season's shots - the
    # honest measure of how varied the description actually is, since a long
    # tail of rare words would otherwise overstate it.
    share = counts / counts.sum()
    covering_90 = int((share.cumsum() < 0.9).sum()) + 1

    # The same question asked of all six taxonomies, which is what decides how
    # many words THE CENSUS strikes into the floor for whichever one it is
    # filing. Generalising it means both hands' text density comes from ONE
    # measurement rather than from two that could disagree: `covering_90pct`
    # for DESCRIPTION must equal `words_covering_90pct` above, and qa.py gates
    # that it does.
    covering = {}
    for title, col in TAXONOMIES.items():
        c = df[col].dropna().value_counts()
        if c.empty:
            covering[title] = 0
            continue
        s = c / c.sum()
        covering[title] = int((s.cumsum() < 0.9).sum()) + 1

    return {
        "words": int(counts.size),
        "words_covering_90pct": covering_90,
        "covering_90pct": covering,
        "mean_words_per_shot": float(a.str.split().str.len().mean()),
        "mean_chars_per_shot": float(a.str.len().mean()),
        "longest": max(counts.index, key=len),
        "most_common": counts.index[0],
        "taxonomies": taxonomies,
        "categories_total": int(sum(taxonomies.values())),
        # The season's whole vocabulary, in the record's own order of frequency.
        # Small (at most ~53 strings) and itself display-bound: the piece can
        # show what the archive had words for in any given year.
        "words_list": [str(w) for w in counts.index],
    }


def measure_classification(df):
    """The machine's whole classification of the season, counted in full.

    THE CENSUS used to tally from the 2,000-dot sample, so it reported 41.5%
    for 1996-97's mid-range while the plate struck 39·9 into the floor beside
    it - two numbers on screen contradicting each other. These are the season's
    real counts, and they are what the census now reads.
    """
    out = {}
    for title, col in TAXONOMIES.items():
        counts = df[col].value_counts()
        out[title] = {str(k): int(v) for k, v in counts.items()}
    return out


def measure_classification_place(df, pin_coord):
    """Where on the floor each of the record's own categories actually sits.

    THE MEASUREMENT THE FILING RESTS ON (V-05). THE CENSUS used to be two
    statistical tables flanking the court; it is now struck INTO the court, one
    word per category at the place the record itself put that category's shots.
    Nothing here is a layout: every position on the plate is this measurement,
    and there is no authored coordinate anywhere in the hand.

    POLAR, NOT CARTESIAN, and that is not a stylistic choice. The Cartesian
    centroid of an annular category is pulled toward the hoop by its own
    curvature - `16-24 ft.` lands around 13 ft, outside the band it is named
    for - so the summary would sit somewhere the category is not. Mean radius
    with a circular-mean bearing lands inside the band, and it is also the
    piece's native geometry: hoop origin, distance bands, the numeral annulus.

    PLACED SHOTS ONLY. Shots the record filed on the SENTINEL are excluded,
    exactly as `marks.ts` excludes them and for the same reason - the record
    gave them no place and the pin already carries them. This is the standing
    "grain applies only where it was measured" decision. `n_placed` ships beside
    `n` so a category whose place rests on a small minority of its own shots
    says so: 1996-97's Restricted Area has ~70,000 shots and about three
    thousand places, which is the piece's regime finding appearing inside the
    census.

    THE EXCLUSION FOLLOWS THE PIN, and it has to (2026-08-09). It used to be
    hardcoded to exactly (0,0), which was the same cell as the pin for
    twenty-four seasons and a different one for six: from 2014-15 to 2019-20
    the pin stands on a displaced pile that this measurement was still counting
    as placed, so the same 4.7% of a season would have been drawn twice - once
    under the pin and once inside the mean position of `Dunk Shot`.

    DISTANCE IS THE RECORD'S OWN `SHOT_DISTANCE`, not a radius re-derived from
    the coordinates - one fewer thing this pipeline invents, and it makes the
    category-meaning checks in qa.py genuine cross-field tests rather than
    restatements of their own definitions.

    NOT CLIPPED TO THE PLATE. The three backcourt categories land beyond the
    halfcourt the piece draws, in every season, and that is measured rather than
    hidden: the record names regions this plate cannot hold. The renderer
    refuses to strike them and counts them, which is the honest division - the
    measurement is the record's, the plate's edge is the plate's.
    """
    px, py = pin_coord if pin_coord is not None else (None, None)
    placed = df if pin_coord is None else df[(df.LOC_X != px) | (df.LOC_Y != py)]
    # One angle per placed shot, reused across all six taxonomies.
    ang = np.arctan2(placed.LOC_Y.to_numpy(np.float64), placed.LOC_X.to_numpy(np.float64))
    sin_a, cos_a = np.sin(ang), np.cos(ang)
    dist = placed.SHOT_DISTANCE.to_numpy(np.float64)

    out = {}
    for title, col in TAXONOMIES.items():
        full = df[col].value_counts()
        col_placed = placed[col].to_numpy()
        entries = {}
        for cat in full.index:
            m = col_placed == cat
            n_placed = int(m.sum())
            entry = {"n": int(full[cat]), "n_placed": n_placed}
            if n_placed:
                s, c = float(sin_a[m].mean()), float(cos_a[m].mean())
                entry["dist_ft"] = round(float(dist[m].mean()), 3)
                entry["bearing_rad"] = round(float(np.arctan2(s, c)), 5)
                # The resultant length: 1 is a ray, 0 is a category with no
                # direction at all. Shipped because a category symmetric about
                # the centreline has a MEANINGLESS bearing sitting at ~pi/2, and
                # a reader of this artifact is entitled to know which is which.
                entry["bearing_concentration"] = round(float(np.hypot(s, c)), 4)
            entries[str(cat)] = entry
        out[title] = entries
    return out


# The five that rotate, in the order they come round. DESCRIPTION is not here:
# it is filed exactly when it changes, which is the whole point of it.
ROTATING = ["RESULT", "ZONE", "RANGE", "AREA", "TYPE"]


def assign_active_taxonomy(rows):
    """Which of the six taxonomies THE CENSUS files, season by season.

    DERIVED, NOT CHOSEN, and derived HERE rather than in the renderer. The rule
    reads two measurements the pipeline already makes, so the pipeline is where
    it belongs - and it means there is exactly one implementation for qa.py to
    gate rather than a second copy in TypeScript that could drift from it.

    The rule, and every consequence of it is content:

      contemporaneous != null  -> TYPE. The one season where the taxonomy and
        the floor disagree, so `3PT FIELD GOAL`'s anchor sits INSIDE the modern
        arc: the 19,165 shots that were threes when taken become a position on
        the plate rather than a footnote.
      the vocabulary changed   -> DESCRIPTION. The growing taxonomy appears
        exactly when it grows - INCLUDING the seasons it shrinks, which is the
        archive forgetting words and deserves to be seen.
      otherwise                -> the next of the five that never move.

    A --years subset produces a subset schedule, which is correct: the rule is
    a function of the sequence it is given, and qa.py gates the full thirty.
    """
    rank = 0
    for i, row in enumerate(rows):
        if row["contemporaneous"] is not None:
            row["active_taxonomy"] = "TYPE"
        elif i == 0 or row["vocabulary"]["words"] != rows[i - 1]["vocabulary"]["words"]:
            row["active_taxonomy"] = "DESCRIPTION"
        else:
            row["active_taxonomy"] = ROTATING[rank % len(ROTATING)]
            rank += 1


def aggregate_season(year):
    df = read_season_csv(year, usecols=USECOLS, dtype=DTYPES)
    n = len(df)
    if n == 0:
        die(f"{season_label(year)}: empty dump")

    bad_flag = int((df.SHOT_ATTEMPTED_FLAG != 1).sum())
    if bad_flag:
        print(f"  WARNING {season_label(year)}: {bad_flag} rows with SHOT_ATTEMPTED_FLAG != 1")

    unknown_zones = set(df.SHOT_ZONE_BASIC.dropna().unique()) - set(ZONES)
    if unknown_zones:
        die(f"{season_label(year)}: unknown SHOT_ZONE_BASIC values {unknown_zones}")
    unknown_types = set(df.SHOT_TYPE.dropna().unique()) - {"2PT Field Goal", "3PT Field Goal"}
    if unknown_types:
        die(f"{season_label(year)}: unknown SHOT_TYPE values {unknown_types}")
    # Rare null SHOT_TYPEs exist (one 0-ft tip shot in 1996-97); they stay in
    # the attempt denominator and count as non-3PT.
    type_nulls = int(df.SHOT_TYPE.isna().sum())
    if type_nulls:
        print(f"  note {season_label(year)}: {type_nulls} null SHOT_TYPE row(s), counted as 2PT")

    made = df.SHOT_MADE_FLAG == 1
    is3 = df.SHOT_TYPE == "3PT Field Goal"
    zone_counts = df.SHOT_ZONE_BASIC.value_counts()
    zone_made = df[made].SHOT_ZONE_BASIC.value_counts()

    # WHERE THE PIN STANDS, and therefore which shots every other measurement
    # here must treat as unplaced. One derivation, used by the filing below and
    # by the per-dot `pin` flag in the sample, so a shot cannot be the pin's in
    # one artifact and the floor's in another.
    resolution = measure_resolution(year, df)
    sentinel = resolution["rim_sentinel"]
    pin_coord = (
        tuple(sentinel["coord"]) if sentinel and sentinel["is_refusal"] else None
    )

    row = {
        "year": year,
        "season": season_label(year),
        "attempts": n,
        "made": int(made.sum()),
        "fg_pct": float(made.mean()),
        "efg_pct": float((made.sum() + 0.5 * (made & is3).sum()) / n),
        "mid_attempts": int(zone_counts.get("Mid-Range", 0)),
        "mid_share": float(zone_counts.get("Mid-Range", 0) / n),
        "three_attempts": int(is3.sum()),
        "three_share": float(is3.mean()),
        "three_made": int((made & is3).sum()),
        "zones": {
            z: {"attempts": int(zone_counts.get(z, 0)), "made": int(zone_made.get(z, 0))}
            for z in ZONES
        },
        "mean_distance_ft": float(df.SHOT_DISTANCE.mean()),
        "n_games": int(df.GAME_ID.nunique()),
        "n_teams": int(df.TEAM_ID.nunique()),
        "date_min": str(df.GAME_DATE.min()),
        "date_max": str(df.GAME_DATE.max()),
        "shot_type_nulls": type_nulls,
        "resolution": resolution,
        "schema": measure_schema(year),
        "vocabulary": measure_vocabulary(df),
        "classification": measure_classification(df),
        "classification_place": measure_classification_place(df, pin_coord),
        "contemporaneous": measure_contemporaneous(year, df),
        "note": None,
    }
    if year in SEASON_NOTES:
        row["note"] = render_note(year, SEASON_NOTES[year], row["n_games"], row["n_teams"])

    half = df[(df.LOC_Y >= HALF_Y_MIN) & (df.LOC_Y <= HALF_Y_MAX)
              & (df.LOC_X.abs() <= HALF_X_MAX)]
    dropped = n - len(half)

    rng = np.random.default_rng(SAMPLE_SEED + year)
    take = min(SAMPLE_N, len(half))
    idx = np.sort(rng.choice(len(half), size=take, replace=False))
    s = half.iloc[idx]
    # Per-dot provenance the renderer needs: `pin` marks dots the record filed on
    # the SENTINEL (drawn as the pile, never jittered apart); `hires` marks dots
    # from arenas that recorded rim coordinates that season (the arena inlay).
    hires_arenas = set(row["resolution"]["full_resolution_arenas"])

    # `zone` must be filed here, never re-derived in the renderer from x,y:
    # deriving it would apply today's polygons to the 22-ft era and silently
    # reproduce the exact anachronism the piece exists to expose.
    zone_index = {z: i for i, z in enumerate(ZONES)}
    zones = [zone_index.get(z, -1) for z in s.SHOT_ZONE_BASIC]

    # What the record says each shot WAS. Dictionary-encoded: a season uses at
    # most ~53 of these strings, and the vocabulary's growth (9 words in
    # 1996-97, 48 by 2024-25) is itself a measurement the piece renders.
    vocab = sorted(s.ACTION_TYPE.dropna().unique())
    action_index = {a: i for i, a in enumerate(vocab)}
    actions = [action_index.get(a, -1) for a in s.ACTION_TYPE]

    # The rest of the classification the machine applies to every shot. Six
    # taxonomies in all, and THE CENSUS tallies them live: this is the record
    # deciding what a shot IS, in as many ways as it has to say it.
    ranges = sorted(s.SHOT_ZONE_RANGE.dropna().unique())
    range_index = {r: i for i, r in enumerate(ranges)}
    areas = sorted(s.SHOT_ZONE_AREA.dropna().unique())
    area_index = {a: i for i, a in enumerate(areas)}

    sample = {
        "season": row["season"],
        "seed": SAMPLE_SEED + year,
        "n": take,
        "of_halfcourt_attempts": len(half),
        "backcourt_or_oob_dropped": dropped,
        "units": "tenths of feet, hoop origin",
        "zone_names": ZONES,
        "action_vocab": vocab,
        "range_names": ranges,
        "area_names": areas,
        "x": s.LOC_X.tolist(),
        "y": s.LOC_Y.tolist(),
        "made": s.SHOT_MADE_FLAG.astype(int).tolist(),
        "three": (s.SHOT_TYPE == "3PT Field Goal").astype(int).tolist(),
        "pin": (
            np.zeros(len(s), dtype=int).tolist() if pin_coord is None
            else ((s.LOC_X == pin_coord[0]) & (s.LOC_Y == pin_coord[1])).astype(int).tolist()
        ),
        "hires": s.HTM.isin(hires_arenas).astype(int).tolist(),
        "zone": zones,
        "action": actions,
        "range": [range_index.get(r, -1) for r in s.SHOT_ZONE_RANGE],
        "area": [area_index.get(a, -1) for a in s.SHOT_ZONE_AREA],
    }

    grid_counts, _, _ = np.histogram2d(
        half.LOC_X.to_numpy(), half.LOC_Y.to_numpy(), bins=[GRID_X_EDGES, GRID_Y_EDGES]
    )
    if int(grid_counts.sum()) != len(half):
        die(f"{season_label(year)}: grid total {int(grid_counts.sum())} != halfcourt attempts {len(half)}")
    grid = {
        "season": row["season"],
        "units": "attempt counts per 1ft x 1ft bin, halfcourt, hoop origin",
        "x_edges_tenths": [int(e) for e in GRID_X_EDGES],
        "y_edges_tenths": [int(e) for e in GRID_Y_EDGES],
        "total": int(grid_counts.sum()),
        "counts": grid_counts.astype(int).tolist(),
    }

    points = build_points(year, half, row)
    # The window season also ships its calendar (the third audit's re-clock,
    # ruled 2026-08-10). Identified by the window span's own first year rather
    # than a second 2015 literal.
    window_year = int(WINDOW_FALLBACK[0][:4])
    points_by_day = build_points_by_day(year, half, row, points) if year == window_year else None
    return row, sample, grid, points, points_by_day


# One record per occupied coordinate, little-endian, 14 bytes.
#
# The counts are uint32, not uint16: 1996-97 files 67,351 shots at exactly
# (0,0) - the record declining to say where at the rim - which overflows a
# uint16 and silently loses 65,536 of them. The high bytes are zero for every
# other cell, so gzip gives most of the width back.
POINT_DTYPE = np.dtype([
    ("x", "<i2"), ("y", "<i2"),
    ("n_hires", "<u4"), ("n_rest", "<u4"),
    ("zone", "u1"), ("pad", "u1"),
])


def build_points(year, half, row):
    """Every shot, at its exact recorded coordinate.

    The record's coordinates are already quantised to a tenth of a foot, so a
    per-coordinate count is not an approximation of the shots - it *is* the
    shots. Every attempt contributes one unit at the position the record filed
    it; nothing is sampled, re-binned or dropped. There are only 25k-60k
    occupied coordinates against 188k-219k attempts, which is why this costs a
    sixth of shipping each shot separately.

    The hires split is kept per coordinate because the arena inlay is NOT
    positional - the same spot is shot in Boston and in Los Angeles - and
    collapsing the two would silently kill Acts I-II's strongest content. Zone
    IS positional (verified: no coordinate carries two zones in any season), so
    one byte per cell holds it losslessly. `pin` needs no byte at all: it is
    x == 0 and y == 0.
    """
    x = half.LOC_X.to_numpy(np.int32)
    y = half.LOC_Y.to_numpy(np.int32)
    hires_arenas = set(row["resolution"]["full_resolution_arenas"])
    hires = half.HTM.isin(hires_arenas).to_numpy()

    # Fold the lattice into one key so the counting is a single bincount.
    span_y = HALF_Y_MAX - HALF_Y_MIN + 1
    key = (x + 250) * span_y + (y - HALF_Y_MIN)
    size = (500 + 1) * span_y

    n_hires = np.bincount(key[hires], minlength=size)
    n_rest = np.bincount(key[~hires], minlength=size)
    occupied = np.nonzero(n_hires + n_rest)[0]

    zone_index = {z: i for i, z in enumerate(ZONES)}
    zone_of = np.zeros(size, dtype=np.uint8)
    zone_of[key] = half.SHOT_ZONE_BASIC.map(zone_index).fillna(0).to_numpy(np.uint8)

    rec = np.zeros(len(occupied), dtype=POINT_DTYPE)
    rec["x"] = (occupied // span_y).astype(np.int16) - 250
    rec["y"] = (occupied % span_y).astype(np.int16) + HALF_Y_MIN
    rec["n_hires"] = n_hires[occupied]
    rec["n_rest"] = n_rest[occupied]
    rec["zone"] = zone_of[occupied]

    total = int(rec["n_hires"].sum()) + int(rec["n_rest"].sum())
    if total != len(half):
        die(f"{season_label(year)}: points total {total} != halfcourt attempts {len(half)}")
    return rec


# The window season only. One record per (day, occupied coordinate), 11 bytes,
# little-endian. Commissioned by the third audit and ruled by the artist
# 2026-08-10: the 2015-16 base reveal re-accumulates on the record's own
# measured days instead of the authored emphasis-order arrival, and this is the
# artifact that carries the calendar. `day` is days since the window's first
# date (2015-10-27, the same anchor window.py's three dated binaries share) and
# runs to the season's own end in April - day 88 is the window's last day, days
# beyond it are the enclosure's remainder - which overflows the uint8 idiom
# window.py uses, so uint16.
DAY_POINT_DTYPE = np.dtype([
    ("day", "<u2"),
    ("x", "<i2"), ("y", "<i2"),
    ("n", "<u4"),
    ("zone", "u1"),
])


def build_points_by_day(year, half, row, points):
    """The window season's shots on their own calendar, one delta per day.

    Same lattice, same counts, same zone bytes as `build_points` - the sum over
    days at any coordinate IS that coordinate's `points` record, verified here
    per coordinate and gated again in qa.py. No intra-day chronology ships: the
    record's clock/period columns are not read, so within one day the order is
    the reveal's own emphasis rule (filed count descending, then nearest rim),
    disclosed in the row's `order` sentence. The pin's cells ship like every
    other - the renderer skips them; the pipeline never special-cases what the
    plate decides.
    """
    w0, w1 = WINDOW_FALLBACK
    day0 = datetime.datetime.strptime(w0, "%Y-%m-%d").date()
    window_last = (datetime.datetime.strptime(w1, "%Y-%m-%d").date() - day0).days

    date_strs = half.GAME_DATE.to_numpy()
    uniq_dates, inverse = np.unique(date_strs, return_inverse=True)
    day_of = np.array(
        [(datetime.datetime.strptime(s, "%Y%m%d").date() - day0).days for s in uniq_dates],
        dtype=np.int64,
    )
    day = day_of[inverse]
    if int(day.min()) < 0:
        die(f"{season_label(year)}: a shot precedes the window anchor {w0}")

    x = half.LOC_X.to_numpy(np.int32)
    y = half.LOC_Y.to_numpy(np.int32)
    span_y = HALF_Y_MAX - HALF_Y_MIN + 1
    key = ((x + 250) * span_y + (y - HALF_Y_MIN)).astype(np.int64)
    size = (500 + 1) * span_y

    uniq, cnt = np.unique(day * size + key, return_counts=True)
    day_u = uniq // size
    key_u = uniq % size
    x_u = (key_u // span_y).astype(np.int64) - 250
    y_u = (key_u % span_y).astype(np.int64) + HALF_Y_MIN

    # One zone source: the coordinate's own byte from the points record, so the
    # two artifacts cannot disagree even transiently.
    pkey = (points["x"].astype(np.int64) + 250) * span_y + (points["y"].astype(np.int64) - HALF_Y_MIN)
    zone_table = np.zeros(size, dtype=np.uint8)
    zone_table[pkey] = points["zone"]

    # The fold order ships in the bytes: day ascending, then the reveal's own
    # emphasis rule within the day - that day's filed count descending, nearest
    # rim, y, x (field.ts:revealOrder's tie-breaks, applied per day).
    dist2 = x_u * x_u + y_u * y_u
    order = np.lexsort((x_u, y_u, dist2, -cnt.astype(np.int64), day_u))

    rec = np.zeros(len(uniq), dtype=DAY_POINT_DTYPE)
    rec["day"] = day_u[order].astype(np.uint16)
    rec["x"] = x_u[order].astype(np.int16)
    rec["y"] = y_u[order].astype(np.int16)
    rec["n"] = cnt[order].astype(np.uint32)
    rec["zone"] = zone_table[key_u[order]]

    # The acceptance identity, checked at the source before qa.py re-checks the
    # shipped bytes: the sum over days per coordinate equals the points record.
    per_cell = np.zeros(size, dtype=np.int64)
    np.add.at(per_cell, key_u, cnt)
    ptot = points["n_hires"].astype(np.int64) + points["n_rest"].astype(np.int64)
    if not np.array_equal(per_cell[pkey], ptot) or int(per_cell.sum()) != int(ptot.sum()):
        die(f"{season_label(year)}: points_by_day does not reconcile with points per coordinate")

    row["points_by_day"] = {
        "records": int(len(rec)),
        "bytes": int(rec.nbytes),
        "day0": w0,
        "window_last_day": int(window_last),
        "window_days": int(window_last) + 1,
        "last_day": int(day_u.max()),
        "days_present": int(len(np.unique(day_u))),
        "order": (
            "day ascending; within a day, that day's filed count descending, then "
            "nearest rim - the reveal's emphasis rule per day; no intra-day "
            "chronology is read or shipped"
        ),
    }
    return rec


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", help="comma-separated season start years (default: all 30)")
    args = ap.parse_args()

    years = SEASON_START_YEARS
    if args.years:
        years = sorted({int(y) for y in args.years.split(",")})

    rows = []
    for year in years:
        row, sample, grid, points, points_by_day = aggregate_season(year)
        rows.append(row)
        write_json(PROCESSED_DIR / "samples" / f"season_{year}.json", sample, compact=True)
        write_json(PROCESSED_DIR / "grids" / f"season_{year}.json", grid, compact=True)
        pts_path = PROCESSED_DIR / "points" / f"season_{year}.bin"
        pts_path.parent.mkdir(parents=True, exist_ok=True)
        pts_path.write_bytes(points.tobytes())
        row["points"] = {"cells": int(len(points)), "bytes": int(points.nbytes)}
        if points_by_day is not None:
            pbd_path = PROCESSED_DIR / "points_by_day" / f"season_{year}.bin"
            pbd_path.parent.mkdir(parents=True, exist_ok=True)
            pbd_path.write_bytes(points_by_day.tobytes())
        res = row["resolution"]
        print(
            f"  {row['season']}  {row['attempts']:>7,} att  {row['n_games']:>5} games  "
            f"mid {100 * row['mid_share']:4.1f}%  3PT {100 * row['three_share']:4.1f}%  "
            f"| rim unplaced {100 * (res['rim_sentinel']['share_of_rim'] if res['rim_sentinel']['is_refusal'] else 0.0):5.1f}%"
            f" at {str(tuple(res['rim_sentinel']['coord'])):>8}  "
            f"{res['regime']:<20} {(res['rim_sentinel']['kind'] or ''):<12}"
            f"{res['n_full_resolution_arenas'] or '':>2}"
            f"{'/' + str(row['n_teams']) if res['regime'] == 'uneven' else ''}"
            f"  | {row['vocabulary']['words']:>2} words"
        )

    # THE FIELD COUNT DOES NOT GROW. The record learns adjectives, not columns:
    # if this ever varies, THE LEDGER's whole argument - that Act V's crowding is
    # substitution and never a richer per-shot record - has to be restated rather
    # than asserted. Checked over the seasons actually run, so a --years subset
    # still checks what it can.
    assign_active_taxonomy(rows)

    widths = {r["schema"]["fields_per_shot"] for r in rows}
    positions = {r["schema"]["positions_per_shot"] for r in rows}
    if len(widths) > 1 or len(positions) > 1:
        die(f"the per-shot schema is not constant across {len(rows)} seasons: "
            f"{sorted(widths)} field widths, {sorted(positions)} position counts")

    out = {
        "generated_by": "pipeline/aggregate.py",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "provenance": PROVENANCE,
        # Which database column each of the six taxonomies IS. THE CENSUS
        # strikes the machine's own field name into the floor - `ACTION_TYPE`,
        # not "description" - because this is the machine's field, and a name
        # the record uses is a name the record has to supply.
        "taxonomy_columns": dict(TAXONOMIES),
        "definitions": {
            "mid_share": 'SHOT_ZONE_BASIC == "Mid-Range" (NBA zone taxonomy, disclosed)',
            "three_share": 'SHOT_TYPE == "3PT Field Goal"',
            "sample": f"fixed-seed ({SAMPLE_SEED}+year) uniform sample of halfcourt attempts",
            "grid": "1ft bins over LOC_X [-250,250], LOC_Y [-50,420], tenths of feet",
            "resolution.rim_sentinel": (
                "the single most-filed coordinate among the season's restricted-area "
                "shots, with how far it leads the runner-up. `origin_snapped` beside it "
                "counts EXACTLY (0,0) and is therefore blind to a refusal filed anywhere "
                "else - which is what six seasons do. `is_refusal` reads `lead_ratio` "
                f"against {SENTINEL_LEAD:g}, chosen from the middle of an empty band: "
                "across the corpus the lead is either about 2x or 18x and higher, with "
                "nothing between, so any threshold from roughly 3 to 15 classifies every "
                "season identically. "
                "CORROBORATED AGAINST A SECOND INSTRUMENT, and the piece says these shots "
                "were refused a place only because it is: 2015-16's pile is the one this "
                "archive can be asked about twice, because that season is both one of the "
                "six that file a displaced pile and the season the public SportVU tracking "
                "release covers. The record files the whole pile on one coordinate; the "
                "optical feed puts the shots it can see in very nearly one position each, "
                "no more concentrated than dunks the record placed individually, and at "
                "the same distance from the rim - so the coordinate is a filing convention "
                "and not a location. The evidence is the SHOOTER'S FEET, which the join "
                "between the two instruments never constrains. Read the figures, the "
                "like-for-like control and the method from window.json under "
                "`sentinel_corroboration`. SCOPE, and it is a real limit rather than a "
                "footnote: ONE of the six seasons, and a minority of even that season's "
                "pile. The other five are uncorroborated and no source available today can "
                "corroborate them - every one of them is another read of the same database"
            ),
            "resolution.ra_origin_share": (
                "restricted-area shots filed at exactly (0,0). For twenty-four of the "
                "thirty seasons that IS the record declining to say where at the rim, and "
                "it is the figure every earlier reading of this archive was made from. For "
                "the six seasons that file their refusal elsewhere it reports 0.0% or a "
                "handful of stragglers and measures nothing - read `rim_sentinel`, which "
                "is what the pin, the regime and the arena spread are all taken from now"
            ),
            "resolution.regime": (
                "how the record placed rim shots that season, classified from "
                "`rim_sentinel` rather than from the exact origin: `uneven` when the "
                f"spread across arenas reaches {UNEVEN_SPREAD_PP:g} percentage points (the "
                "refusal is a property of the BUILDING), `uniformly_sighted` when the "
                f"sentinel refuses at most {100 * MOSTLY_SIGHTED_MAX:g}% of rim shots, "
                f"`uniformly_blind` when it swallows {100 * SENTINEL_WHOLESALE_SHARE:g}% "
                "or more of them, and `categorical_refusal` for the band between - a named "
                "category of shot the taxonomy declines to place. `rim_sentinel.kind` "
                "divides that band further, and is measured rather than labelled here"
            ),
            "resolution.rim_sentinel.composition": (
                "the record's own names for what sits on the sentinel, with `share_of_pile` "
                "and - the measurement the reading rests on - `share_of_type`, how much of "
                "the season's WHOLE population of that name the pile holds. A name whose "
                "season sits almost entirely on one cell is a name the record never placed"
            ),
            "resolution.rim_sentinel.kind": (
                "which refusal this is, from two measured bands rather than by eye. "
                f"`wholesale` when the pile is {100 * SENTINEL_WHOLESALE_SHARE:g}% or more "
                "of the rim (measured: either 8-15% or 73-95% of it, nothing between); "
                f"otherwise `dunk` when the pile converts at {SENTINEL_DUNK_FG:g} or better "
                "and `tip_putback` when it does not (measured: either .552-.642 or "
                ".9085-.9124, nothing between). The composition beside it says the same "
                "thing in the record's own words, so the label rests on two independent "
                "readings. null when the busiest rim coordinate is not a refusal at all"
            ),
            "resolution.full_resolution_arenas": (
                "home arenas whose games recorded real rim coordinates that season; through "
                "2009-10 only five or six did, and it follows the building, not the team"
            ),
            "contemporaneous": (
                f"1996-97 only: mid-range recomputed under the {SHORTENED_LINE_FT:g}-ft line "
                "then in force, against the modern polygons SHOT_ZONE_BASIC applies "
                "retroactively. `line_ft` is that line's radius - external history no dump "
                "records - and both the words the piece prints and the arc it draws for "
                "1996-97 read it from here"
            ),
            "schema": (
                "the dump's own header, counted: how many fields the record keeps per shot "
                "and how many positions among them. Asserted constant across all thirty "
                "seasons - the vocabulary grows, the schema does not"
            ),
            "classification_place": (
                "where each of the record's own categories sits on the floor: the mean of "
                "SHOT_DISTANCE and the CIRCULAR mean of atan2(LOC_Y, LOC_X), over that "
                "category's PLACED shots only - shots filed on `rim_sentinel` are the pin's "
                "and are excluded, which for six seasons is NOT the origin. Polar rather than Cartesian because the centroid of an annular "
                "category lands outside the band it is named for. `n` is the category's "
                "whole count and `n_placed` how many of them the record gave a place, so a "
                "summary resting on a minority of its own shots declares it. NOT clipped to "
                "the halfcourt: the three backcourt categories land beyond the plate in "
                "every season, and that is the record naming ground this plate cannot hold"
            ),
            "vocabulary.covering_90pct": (
                "how many categories of each taxonomy account for 90% of the season's "
                "shots. THE CENSUS strikes exactly these into the floor and THE LEDGER's "
                "label budget is the DESCRIPTION entry, so the two hands' text density is "
                "one measurement rather than two"
            ),
        },
        "seasons": rows,
    }
    write_json(PROCESSED_DIR / "seasons.json", out)

    total = sum(r["attempts"] for r in rows)
    print(f"\nQA: {len(rows)} seasons, {total:,} attempts -> data/processed/seasons.json")


if __name__ == "__main__":
    main()
