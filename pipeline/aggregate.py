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
    sample = {
        "season": row["season"],
        "seed": SAMPLE_SEED + year,
        "n": take,
        "of_halfcourt_attempts": len(half),
        "backcourt_or_oob_dropped": dropped,
        "units": "tenths of feet, hoop origin",
        "x": s.LOC_X.tolist(),
        "y": s.LOC_Y.tolist(),
        "made": s.SHOT_MADE_FLAG.astype(int).tolist(),
        "three": (s.SHOT_TYPE == "3PT Field Goal").astype(int).tolist(),
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
        print(
            f"  {row['season']}  {row['attempts']:>7,} att  {row['n_games']:>5} games  "
            f"mid {100 * row['mid_share']:4.1f}%  3PT {100 * row['three_share']:4.1f}%  "
            f"FG {100 * row['fg_pct']:4.1f}%  [{row['date_min']}..{row['date_max']}]"
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
        },
        "seasons": rows,
    }
    write_json(PROCESSED_DIR / "seasons.json", out)

    total = sum(r["attempts"] for r in rows)
    print(f"\nQA: {len(rows)} seasons, {total:,} attempts -> data/processed/seasons.json")


if __name__ == "__main__":
    main()
