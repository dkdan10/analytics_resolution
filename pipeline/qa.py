#!/usr/bin/env python3
"""Stage 3 - acceptance gate.

Regenerated aggregates must reproduce the measured table in
docs/build-plan-v2.md section 1.6 EXACTLY. If these numbers differ, the
pipeline is wrong, not the plan (CLAUDE.md ground truth).

Usage: python3 pipeline/qa.py            # exits 1 on any mismatch
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import PROCESSED_DIR  # noqa: E402

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


def pct(x):
    return f"{100 * x:.1f}"


def main():
    path = PROCESSED_DIR / "seasons.json"
    if not path.exists():
        print(f"FAIL: {path} missing - run aggregate.py first", file=sys.stderr)
        sys.exit(1)
    data = json.loads(path.read_text())
    seasons = {row["year"]: row for row in data["seasons"]}
    failures = []

    def check(name, got, want):
        ok = got == want
        print(f"  {'PASS' if ok else 'FAIL'}  {name}: got {got}, expected {want}")
        if not ok:
            failures.append(name)

    print("Acceptance vs build-plan section 1.6")
    check("season count", len(seasons), EXPECTED_SEASONS)
    check("total attempts", sum(r["attempts"] for r in seasons.values()), EXPECTED_TOTAL_ATTEMPTS)

    for year, (mid, three) in sorted(TABLE_1_6.items()):
        label = seasons[year]["season"] if year in seasons else year
        if year not in seasons:
            failures.append(f"missing season {year}")
            print(f"  FAIL  season {year} missing")
            continue
        check(f"{label} mid-range share", pct(seasons[year]["mid_share"]), mid)
        check(f"{label} 3PT share", pct(seasons[year]["three_share"]), three)

    if 2025 in seasons:
        check("2025-26 attempts", seasons[2025]["attempts"], EXPECTED_2025_ATTEMPTS)
        check("2025-26 mid-range share", pct(seasons[2025]["mid_share"]), EXPECTED_2025_MID)
    if 1997 in seasons:
        check("1997-98 3PT share (line retreat)", pct(seasons[1997]["three_share"]), EXPECTED_1997_THREE)
    if 2022 in seasons:
        check("2022-23 mid-range share (Act IV endpoint)", pct(seasons[2022]["mid_share"]), EXPECTED_2022_MID)
    for year, k in SHORT_SEASON_KATTEMPTS.items():
        if year in seasons:
            check(f"{seasons[year]['season']} attempts (~{k}k, short season)",
                  round(seasons[year]["attempts"] / 1000), k)

    game_mismatches = [
        f"{seasons[y]['season']}: {seasons[y]['n_games']} != {EXPECTED_N_GAMES[y]}"
        for y in sorted(seasons) if y in EXPECTED_N_GAMES and seasons[y]["n_games"] != EXPECTED_N_GAMES[y]
    ]
    check("per-season game counts vs schedule", game_mismatches, [])

    # Cross-artifact gates: the manifest, samples, and grids must belong to the
    # same generation as seasons.json (subset or interrupted runs turn RED here).
    manifest_path = PROCESSED_DIR / "acquisition_manifest.json"
    n_manifest = (len(json.loads(manifest_path.read_text()).get("files", {}))
                  if manifest_path.exists() else "missing")
    check("acquisition manifest entries", n_manifest, EXPECTED_SEASONS)

    artifact_issues = []
    for year, row in sorted(seasons.items()):
        sp = PROCESSED_DIR / "samples" / f"season_{year}.json"
        gp = PROCESSED_DIR / "grids" / f"season_{year}.json"
        if not sp.exists() or not gp.exists():
            artifact_issues.append(f"{row['season']}: missing sample or grid")
            continue
        s = json.loads(sp.read_text())
        g = json.loads(gp.read_text())
        if g["total"] != s["of_halfcourt_attempts"]:
            artifact_issues.append(f"{row['season']}: grid total {g['total']} != sample halfcourt {s['of_halfcourt_attempts']}")
        if s["of_halfcourt_attempts"] + s["backcourt_or_oob_dropped"] != row["attempts"]:
            artifact_issues.append(f"{row['season']}: halfcourt + dropped != attempts")
    check("samples/grids consistent with seasons.json", artifact_issues, [])

    # Context lines the piece quotes; printed for the record, not gated.
    if {1996, 2012, 2019, 2024, 2015} <= set(seasons):
        m96 = 100 * seasons[1996]["mid_share"]
        m12 = 100 * seasons[2012]["mid_share"]
        m19 = 100 * seasons[2019]["mid_share"]
        m24 = 100 * seasons[2024]["mid_share"]
        m15 = 100 * seasons[2015]["mid_share"]
        print("\nMeasured narrative beats (informational):")
        print(f"  pre-camera slope 1996-97..2012-13: {(m96 - m12) / 16:.2f} pp/season (plan: ~0.7)")
        print(f"  camera-era slope 2012-13..2019-20: {(m12 - m19) / 7:.2f} pp/season (plan: ~2.1)")
        print(f"  collapse midpoint (39.9+9.7)/2 = {(m96 + m24) / 2:.1f}; the window season sits at {m15:.1f}")

    if failures:
        print(f"\nQA RED: {len(failures)} mismatch(es). The pipeline is wrong, not the plan.")
        sys.exit(1)
    print("\nQA GREEN: section 1.6 reproduced exactly.")


if __name__ == "__main__":
    main()
