#!/usr/bin/env python3
"""Stage 2 - aggregate the shot record into the piece's per-season exports.

Reads data/shots/shotdetail_YYYY.tar.xz and writes to data/processed/:
  seasons.json               per-season zone shares, counts, FG%, dates
  samples/season_YYYY.json   fixed-seed spatial sample (~2,000 halfcourt dots)
  grids/season_YYYY.json     1-ft binned attempt-density grid (for OT/transitions)

Zone definitions (disclosed in wall text, plan section 1.6 / Appendix D):
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

# Season notes ship as data so the piece never hand-types a caveat (Appendix D).
# {games} is derived from the dump (games per team, asserted exact); {window}
# comes from the SportVU probe artifact (a script output). The remaining dates
# are external history, not derivable from this dataset: the shortened-line era
# (plan section 1.6) and the BOS@IND cancellation date (Apr 15, 2013 Boston
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

    Drives FADEAWAY's texture ladder. Every value here is a measurement of the
    archive, not of the game.
    """
    n = len(df)
    at_origin = (df.LOC_X == 0) & (df.LOC_Y == 0)
    ra = df.SHOT_ZONE_BASIC == "Restricted Area"
    ra_n = int(ra.sum())
    ra_origin = int((ra & at_origin).sum())

    # Which action types the record declines to place. Through 2009-10 this is
    # ordinary layups and dunks; from 2020-21 it is only tip-ins and putbacks.
    refused = (
        df.loc[at_origin, "ACTION_TYPE"].value_counts().head(6).astype(int).to_dict()
        if int(at_origin.sum()) else {}
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
    spread_pp = float(100 * (arena_rate.max() - arena_rate.min())) if len(arena_rate) else 0.0
    league_share = float(ra_origin / ra_n) if ra_n else 0.0

    if spread_pp >= UNEVEN_SPREAD_PP:
        # Some buildings recorded rim coordinates and others did not.
        regime = "uneven"
    elif league_share <= MOSTLY_SIGHTED_MAX:
        regime = "uniformly_sighted"
    elif league_share < 0.5:
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
        "regime": regime,
        "arena_spread_pp": spread_pp,
        # Only meaningful where the regime is uneven; elsewhere every arena is
        # alike and naming a subset would imply a distinction that is not there.
        "full_resolution_arenas": full_arenas if regime == "uneven" else [],
        "n_full_resolution_arenas": len(full_arenas) if regime == "uneven" else 0,
        "full_resolution_games": int(per_game["full"].sum()),
        "n_games_with_ra": int(len(per_game)),
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


def measure_classification_place(df):
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

    PLACED SHOTS ONLY. Shots the record filed at exactly the origin are
    excluded, exactly as `marks.ts` excludes them and for the same reason - the
    record gave them no place and the pin already carries them. This is the
    standing "grain applies only where it was measured" decision. `n_placed`
    ships beside `n` so a category whose place rests on a small minority of its
    own shots says so: 1996-97's Restricted Area has ~70,000 shots and about
    three thousand places, which is the piece's four-regime finding appearing
    inside the census.

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
    placed = df[(df.LOC_X != 0) | (df.LOC_Y != 0)]
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
        "resolution": measure_resolution(year, df),
        "schema": measure_schema(year),
        "vocabulary": measure_vocabulary(df),
        "classification": measure_classification(df),
        "classification_place": measure_classification_place(df),
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
    # Per-dot provenance the renderer needs: `pin` marks dots the record filed at
    # the origin (drawn as the pile, never jittered apart); `hires` marks dots
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
        "pin": ((s.LOC_X == 0) & (s.LOC_Y == 0)).astype(int).tolist(),
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
    return row, sample, grid, points


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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", help="comma-separated season start years (default: all 30)")
    args = ap.parse_args()

    years = SEASON_START_YEARS
    if args.years:
        years = sorted({int(y) for y in args.years.split(",")})

    rows = []
    for year in years:
        row, sample, grid, points = aggregate_season(year)
        rows.append(row)
        write_json(PROCESSED_DIR / "samples" / f"season_{year}.json", sample, compact=True)
        write_json(PROCESSED_DIR / "grids" / f"season_{year}.json", grid, compact=True)
        pts_path = PROCESSED_DIR / "points" / f"season_{year}.bin"
        pts_path.parent.mkdir(parents=True, exist_ok=True)
        pts_path.write_bytes(points.tobytes())
        row["points"] = {"cells": int(len(points)), "bytes": int(points.nbytes)}
        res = row["resolution"]
        print(
            f"  {row['season']}  {row['attempts']:>7,} att  {row['n_games']:>5} games  "
            f"mid {100 * row['mid_share']:4.1f}%  3PT {100 * row['three_share']:4.1f}%  "
            f"| rim unplaced {100 * res['ra_origin_share']:5.1f}%  "
            f"{res['regime']:<20} {res['n_full_resolution_arenas'] or '':>2}"
            f"{'/' + str(row['n_teams']) if res['regime'] == 'uneven' else ''}"
            f"  | {row['vocabulary']['words']:>2} words"
        )

    # THE FIELD COUNT DOES NOT GROW. The record learns adjectives, not columns:
    # if this ever varies, THE LEDGER's whole argument - that Act V's crowding is
    # substitution and never a richer per-shot record - has to be restated rather
    # than asserted. Checked over the seasons actually run, so a --years subset
    # still checks what it can.
    widths = {r["schema"]["fields_per_shot"] for r in rows}
    positions = {r["schema"]["positions_per_shot"] for r in rows}
    if len(widths) > 1 or len(positions) > 1:
        die(f"the per-shot schema is not constant across {len(rows)} seasons: "
            f"{sorted(widths)} field widths, {sorted(positions)} position counts")

    out = {
        "generated_by": "pipeline/aggregate.py",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "provenance": PROVENANCE,
        "definitions": {
            "mid_share": 'SHOT_ZONE_BASIC == "Mid-Range" (NBA zone taxonomy, disclosed)',
            "three_share": 'SHOT_TYPE == "3PT Field Goal"',
            "sample": f"fixed-seed ({SAMPLE_SEED}+year) uniform sample of halfcourt attempts",
            "grid": "1ft bins over LOC_X [-250,250], LOC_Y [-50,420], tenths of feet",
            "resolution.ra_origin_share": (
                "restricted-area shots filed at exactly (0,0) - the record declining to say "
                "where at the rim; drives the pin and the texture ladder"
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
                "category's PLACED shots only - origin-filed shots are the pin's and are "
                "excluded. Polar rather than Cartesian because the centroid of an annular "
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
