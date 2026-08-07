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

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    PROCESSED_DIR,
    PROVENANCE,
    SAMPLE_SEED,
    SEASON_START_YEARS,
    die,
    read_season_csv,
    season_label,
    write_json,
)

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

# Halfcourt frame in tenths of feet, hoop origin (plan section 3.2 clips
# LOC_Y to [-52, 418]; we use the same box for samples and grids so their
# totals agree: x in [-250, 250], y in [-50, 420]).
HALF_Y_MIN = -50
HALF_Y_MAX = 420
GRID_X_EDGES = np.arange(-250, 251, 10)  # 50 one-foot bins
GRID_Y_EDGES = np.arange(-50, 421, 10)   # 47 one-foot bins

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
    # How many words are needed to account for 90% of the season's shots - the
    # honest measure of how varied the description actually is, since a long
    # tail of rare words would otherwise overstate it.
    share = counts / counts.sum()
    covering_90 = int((share.cumsum() < 0.9).sum()) + 1
    return {
        "words": int(counts.size),
        "words_covering_90pct": covering_90,
        "mean_words_per_shot": float(a.str.split().str.len().mean()),
        "mean_chars_per_shot": float(a.str.len().mean()),
        "longest": max(counts.index, key=len),
        "most_common": counts.index[0],
        # The season's whole vocabulary, in the record's own order of frequency.
        # Small (at most ~53 strings) and itself display-bound: the piece can
        # show what the archive had words for in any given year.
        "words_list": [str(w) for w in counts.index],
    }


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
        "vocabulary": measure_vocabulary(df),
        "contemporaneous": measure_contemporaneous(year, df),
        "note": None,
    }
    if year in SEASON_NOTES:
        row["note"] = render_note(year, SEASON_NOTES[year], row["n_games"], row["n_teams"])

    half = df[(df.LOC_Y >= HALF_Y_MIN) & (df.LOC_Y <= HALF_Y_MAX) & (df.LOC_X.abs() <= 250)]
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

    sample = {
        "season": row["season"],
        "seed": SAMPLE_SEED + year,
        "n": take,
        "of_halfcourt_attempts": len(half),
        "backcourt_or_oob_dropped": dropped,
        "units": "tenths of feet, hoop origin",
        "zone_names": ZONES,
        "action_vocab": vocab,
        "x": s.LOC_X.tolist(),
        "y": s.LOC_Y.tolist(),
        "made": s.SHOT_MADE_FLAG.astype(int).tolist(),
        "three": (s.SHOT_TYPE == "3PT Field Goal").astype(int).tolist(),
        "pin": ((s.LOC_X == 0) & (s.LOC_Y == 0)).astype(int).tolist(),
        "hires": s.HTM.isin(hires_arenas).astype(int).tolist(),
        "zone": zones,
        "action": actions,
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

    return row, sample, grid


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", help="comma-separated season start years (default: all 30)")
    args = ap.parse_args()

    years = SEASON_START_YEARS
    if args.years:
        years = sorted({int(y) for y in args.years.split(",")})

    rows = []
    for year in years:
        row, sample, grid = aggregate_season(year)
        rows.append(row)
        write_json(PROCESSED_DIR / "samples" / f"season_{year}.json", sample, compact=True)
        write_json(PROCESSED_DIR / "grids" / f"season_{year}.json", grid, compact=True)
        res = row["resolution"]
        print(
            f"  {row['season']}  {row['attempts']:>7,} att  {row['n_games']:>5} games  "
            f"mid {100 * row['mid_share']:4.1f}%  3PT {100 * row['three_share']:4.1f}%  "
            f"| rim unplaced {100 * res['ra_origin_share']:5.1f}%  "
            f"{res['regime']:<20} {res['n_full_resolution_arenas'] or '':>2}"
            f"{'/' + str(row['n_teams']) if res['regime'] == 'uneven' else ''}"
            f"  | {row['vocabulary']['words']:>2} words"
        )

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
                "1996-97 only: mid-range recomputed under the 22-ft line then in force, "
                "against the modern polygons SHOT_ZONE_BASIC applies retroactively"
            ),
        },
        "seasons": rows,
    }
    write_json(PROCESSED_DIR / "seasons.json", out)

    total = sum(r["attempts"] for r in rows)
    print(f"\nQA: {len(rows)} seasons, {total:,} attempts -> data/processed/seasons.json")


if __name__ == "__main__":
    main()
