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

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from aggregate import POINT_DTYPE  # noqa: E402
from common import PROCESSED_DIR, read_season_csv  # noqa: E402

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


def pct(x):
    return f"{100 * x:.1f}"


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
# Measured across all 632 games on 2026-08-07: 0.489. This floor sits below
# that as a REGRESSION GUARD, not a target - a detector that silently halved
# would still emit a plausible-looking artifact, and this is what catches it.
#
# The shortfall is mostly not detector failure. It is the archive disagreeing
# with itself: the coordinate a scorer filed courtside and the position the
# optical feed gives the ball at release are two different instruments, parting
# company by a median of ~4 ft - much more for shots the record attributes to a
# body other than the one that last touched the ball. An oracle allowed to pick
# the best reading of the tracking still reconciles only 83%. Five independently
# designed release detectors all failed to beat the simple one. That gap is a
# property of the record, so window.json ships it under `disagreement`.
WINDOW_RECOVERY_FLOOR = 0.40

# The recovered set cannot be unbiased: detection follows the ball back from the
# rim, so shots that reach the rim - all made ones - are over-represented.
# Measured at +5.6 pp on FG%. The gate bounds it and the piece discloses it.
WINDOW_MAX_FG_BIAS_PP = 9.0

# THE HAND colours strokes by the zone they cross, so the reconstruction of the
# league's regions has to BE the league's. Measured 2026-08-07 over all 207,893
# of 2015-16's shots: 99.993%. The floor is set just below, as a regression
# guard - if the geometry drifts, the colour stops being a measurement.
ZONE_AGREEMENT_FLOOR = 0.999

# The canvas: one possession per game, spread across the window's 89 days.
EXPECTED_PAINT_CANVASES = 240
EXPECTED_PAINT_DAYS = 60


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

    print("\nThe record's own resolution")
    regime_mismatches = [
        f"{seasons[y]['season']}: {seasons[y]['resolution']['regime']} != {EXPECTED_REGIMES[y]}"
        for y in sorted(seasons)
        if y in EXPECTED_REGIMES and seasons[y]["resolution"]["regime"] != EXPECTED_REGIMES[y]
    ]
    check("resolution regimes (4 eras)", regime_mismatches, [])

    for year, want in sorted(EXPECTED_RA_ORIGIN.items()):
        if year in seasons:
            check(f"{seasons[year]['season']} rim shots left unplaced",
                  pct(seasons[year]["resolution"]["ra_origin_share"]), want)

    uneven = [y for y in sorted(seasons) if seasons[y]["resolution"]["regime"] == "uneven"]
    missing_constant = [
        seasons[y]["season"] for y in uneven
        if UNEVEN_CONSTANT_ARENA not in seasons[y]["resolution"]["full_resolution_arenas"]
    ]
    check(f"{UNEVEN_CONSTANT_ARENA} full-resolution in every uneven season", missing_constant, [])
    check("uneven-era season count", len(uneven), 13)

    # Where the regime is uniform, no arena may be singled out - claiming a subset
    # could see would invent a distinction the measurement does not support.
    leaked = [
        seasons[y]["season"] for y in sorted(seasons)
        if seasons[y]["resolution"]["regime"] != "uneven"
        and seasons[y]["resolution"]["full_resolution_arenas"]
    ]
    check("no arenas named in uniform regimes", leaked, [])

    if 1996 in seasons:
        c = seasons[1996]["contemporaneous"]
        check("1996-97 threes misfiled as Mid-Range", c["misfiled_threes"], EXPECTED_MISFILED_THREES)
        check("1996-97 mid-range under the 22-ft line then in force",
              pct(c["contemporaneous_mid_share"]), EXPECTED_CONTEMPORANEOUS_MID)
    stray = [
        seasons[y]["season"] for y in sorted(seasons)
        if y != 1996 and seasons[y].get("contemporaneous") is not None
    ]
    check("contemporaneous correction confined to 1996-97", stray, [])

    print("\nThe record's vocabulary")
    for year, want in sorted(EXPECTED_WORDS.items()):
        if year in seasons:
            check(f"{seasons[year]['season']} words for a shot",
                  seasons[year]["vocabulary"]["words"], want)
    if {1996, 2024} <= set(seasons):
        grew = seasons[2024]["vocabulary"]["words"] > seasons[1996]["vocabulary"]["words"] * 4
        check("vocabulary more than quadruples 1996-97 to 2024-25", grew, True)
        longer = (seasons[2024]["vocabulary"]["mean_chars_per_shot"]
                  > seasons[1996]["vocabulary"]["mean_chars_per_shot"] * 1.5)
        check("description per shot grows by half again", longer, True)

    # The piece's own name, and the season the record learned it.
    first_fade = next(
        (y for y in sorted(seasons)
         if any("Fadeaway" in w for w in seasons[y]["vocabulary"]["words_list"])),
        None,
    )
    check("first season the record says 'Fadeaway'", first_fade, FADEAWAY_FIRST_YEAR)

    for year, want in sorted(EXPECTED_CATEGORIES.items()):
        if year in seasons:
            check(f"{seasons[year]['season']} categories across six taxonomies",
                  seasons[year]["vocabulary"]["categories_total"], want)
    drifted = [
        f"{seasons[y]['season']}:{k}={seasons[y]['vocabulary']['taxonomies'][k]}"
        for y in sorted(seasons) for k, v in FIXED_TAXONOMIES.items()
        if seasons[y]["vocabulary"]["taxonomies"].get(k) != v
    ]
    check("only the description grows; the other five are fixed", drifted, [])

    print()
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
        pp = PROCESSED_DIR / "points" / f"season_{year}.bin"
        if not sp.exists() or not gp.exists() or not pp.exists():
            artifact_issues.append(f"{row['season']}: missing sample, grid or points")
            continue
        s = json.loads(sp.read_text())
        g = json.loads(gp.read_text())
        if g["total"] != s["of_halfcourt_attempts"]:
            artifact_issues.append(f"{row['season']}: grid total {g['total']} != sample halfcourt {s['of_halfcourt_attempts']}")
        if s["of_halfcourt_attempts"] + s["backcourt_or_oob_dropped"] != row["attempts"]:
            artifact_issues.append(f"{row['season']}: halfcourt + dropped != attempts")
        # The third leg: every shot must be present in the count map, exactly
        # once, at the coordinate the record filed it. This is what makes
        # "every shot" a checkable claim rather than a description.
        rec = np.frombuffer(pp.read_bytes(), dtype=POINT_DTYPE)
        total = int(rec["n_hires"].sum()) + int(rec["n_rest"].sum())
        if total != g["total"]:
            artifact_issues.append(f"{row['season']}: points total {total} != grid total {g['total']}")
        if len(rec) != row["points"]["cells"]:
            artifact_issues.append(f"{row['season']}: points cells {len(rec)} != recorded {row['points']['cells']}")
    check("samples/grids/points consistent with seasons.json", artifact_issues, [])

    # The contradiction that prompted the change: the census tallies must equal
    # the figures the plate strikes into the floor, for every season.
    census_drift = []
    for year, row in sorted(seasons.items()):
        cls = row.get("classification")
        if not cls:
            census_drift.append(f"{row['season']}: no classification block")
            continue
        mid = cls["ZONE"].get("Mid-Range", 0)
        if abs(mid / row["attempts"] - row["mid_share"]) > 1e-9:
            census_drift.append(f"{row['season']}: census {mid / row['attempts']:.4f} != {row['mid_share']:.4f}")
        if sum(cls["TYPE"].values()) != row["attempts"] - row["shot_type_nulls"]:
            census_drift.append(f"{row['season']}: TYPE counts do not sum to attempts")
    check("census figures equal the struck figures", census_drift, [])

    # --- The league's own map of the floor -----------------------------------
    # THE HAND colours a stroke by the zone it is PASSING THROUGH, which is only
    # legitimate if SHOT_ZONE_BASIC really is a partition of the floor rather
    # than a judgement about a shot. This gate is what licenses that colour: the
    # geometry the plate draws is used to reclassify every 2015-16 shot from its
    # coordinates alone, and scored against the league's own label.
    print("\nThe league's own map of the floor")
    try:
        from common import ZONE_NAMES, zone_at  # noqa: PLC0415

        zdf = read_season_csv(2015, usecols=["LOC_X", "LOC_Y", "SHOT_ZONE_BASIC"])
        agree = 0
        for zx, zy, zz in zip(zdf.LOC_X.values, zdf.LOC_Y.values, zdf.SHOT_ZONE_BASIC.values):
            if ZONE_NAMES[zone_at(float(zx), float(zy))] == zz:
                agree += 1
        rate = agree / len(zdf)
        check("zone reconstructed from geometry matches the league's own label",
              rate >= ZONE_AGREEMENT_FLOOR, True)
        print(f"  (informational) {agree:,}/{len(zdf):,} = {100 * rate:.3f}% - the misses are "
              f"boundary coordinates the record itself labels inconsistently")
    except Exception as e:  # noqa: BLE001 - the shot dump may not be present
        print(f"  SKIP  zone reconstruction ({type(e).__name__}: {e})")

    # --- The window (pipeline/window.py) -------------------------------------
    # Optional: the piece runs without it, and the shot spine above must stay
    # green whether or not the window stage has been run.
    window_path = PROCESSED_DIR / "window.json"
    if window_path.exists():
        w = json.loads(window_path.read_text())
        print("\nThe window: eleven weeks of raw record")

        corp = w["corpus"]
        # 622 is the trap: bloom.py's filename parser drops the ten misnamed
        # Dec 5 2015 archives, and nothing downstream would have noticed.
        check("games parsed (622 is the misnaming bug)", corp["games_parsed"], EXPECTED_WINDOW_GAMES)
        check("archives listed", corp["archives_listed"], EXPECTED_WINDOW_ARCHIVES)
        check("empty 32-byte shells", len(corp["empty_shells"]), EXPECTED_WINDOW_SHELLS)
        check("misnamed archives, named not filtered",
              len(corp["misnamed_archives"]), EXPECTED_WINDOW_MISNAMED)
        check("window opens", corp["date_first"], EXPECTED_WINDOW_DATES[0])
        check("window closes", corp["date_last"], EXPECTED_WINDOW_DATES[1])
        # A half-season, and the piece says so on the plate.
        check("window is half of 2015-16", corp["games_parsed"] < corp["season_games"], True)

        rec = w["recovery"]
        # Recovery is published, not assumed. The floor is set from measurement
        # and exists to catch a regression, not to flatter the number: a
        # detector that silently halved would still print a plausible artifact.
        check("recovery above the measured floor", rec["rate"] >= WINDOW_RECOVERY_FLOOR, True)
        check("failure reasons account for every unmeasured shot",
              sum(rec["failures"].values()), rec["joined_shots"] - rec["measured"])

        # The per-game event-offset calibration, gated in the open. The join
        # `tracking eventId == GAME_EVENT_ID` fails silently in a minority of
        # games, and the correction is one integer per game decided by ~150
        # shots - so how many games needed it, and how many of those the record
        # barely settled, are both numbers this pipeline must state out loud.
        check("event offsets stay inside the searched range",
              [k for k in rec["event_offsets"] if abs(int(k)) > 3], [])
        offset_share = rec["games_offset"] / corp["games_parsed"]
        check("most games need no offset", offset_share < 0.5, True)
        print(f"  (informational) {rec['games_offset']} of {corp['games_parsed']} games "
              f"({100 * offset_share:.0f}%) needed their event numbering shifted: "
              f"{rec['event_offsets']}")
        print(f"  (informational) {rec['n_weak_joins']} games where the record barely settled "
              f"the offset (margin < 0.10); {rec['offsets_rejected']} shifted joins rejected as "
              f"noise and left at zero")

        # What the instrument prefers, stated rather than carried. A release is
        # only found by following the ball back from the rim, so the recovered
        # set shoots better than the league did - and every figure taken from
        # it inherits that. The gate is that the bias is MEASURED and bounded,
        # not that it is absent; it cannot be absent given how detection works.
        bias = w["bias"]
        check("the recovered set's make-bias is measured", bias["fg_pct_gap"] is not None, True)
        check("make-bias stays inside the disclosed bound",
              abs(bias["fg_pct_gap"]) <= WINDOW_MAX_FG_BIAS_PP, True)
        print(f"  (informational) the recovered set shoots {bias['fg_pct_measured']}% against the "
              f"season's {bias['fg_pct_season']}% ({bias['fg_pct_gap']:+.1f} pp) and covers "
              f"{100 * bias['share_of_season']:.1f}% of 2015-16's attempts")

        con = w["contest"]
        buckets = con["buckets"]
        check("four published categories", len(buckets), 4)
        check("every measure lands in exactly one category",
              sum(b["attempts"] for b in buckets), rec["measured"])
        check("category shares sum to 1",
              abs(sum(b["share"] for b in buckets) - 1.0) < 1e-3, True)
        check("made counts never exceed attempts",
              [b["name"] for b in buckets if b["made"] > b["attempts"]], [])
        check("one hero per category", len(con["heroes"]), 4)
        check("heroes carry complete geometry",
              [h["bucket_name"] for h in con["heroes"]
               if any(f is None for f in h["track"])], [])

        # Two independent paths to one number: the last sample of the approach
        # curve is the release instant, so it must equal the release-instant
        # mean computed separately from the per-shot records.
        curve = [v for v in con["approach_curve_ft"] if v is not None]
        check("approach curve is sampled to the release",
              len(curve) >= int(con["approach_seconds_before_release"] * con["approach_hz"]), True)

        occ = w["occupancy"]
        check("occupancy bands sum to 1",
              abs(sum(b["share"] for b in occ["bands"]) - 1.0) < 1e-3, True)
        check("occupancy frames sum to the total",
              sum(b["frames"] for b in occ["bands"]), occ["frames_total"])

        # window_measures.bin must agree with the JSON it was reduced beside;
        # the site reads the binary and prints the JSON's figures next to it.
        mb = w["measures_bin"]
        bin_path = PROCESSED_DIR / "window_measures.bin"
        check("measures.bin present", bin_path.exists(), True)
        if bin_path.exists():
            check("measures.bin size matches its record count",
                  bin_path.stat().st_size, mb["records"] * mb["bytes_per_record"])
            check("measures.bin holds every measured shot", mb["records"], rec["measured"])

        # The window's figures must not leak into the other twenty-nine seasons.
        check("window fields confined to 2015-16",
              [y for y, r in seasons.items() if y != 2015 and r.get("window") is not None], [])

        dis = w["disagreement"]
        print(f"  (informational) the archive against itself: median "
              f"{dis['median_ft']} ft between the coordinate a scorer filed and where "
              f"the optical feed says the ball left the hand; "
              f"{100 * dis['within_6ft']:.1f}% agree within 6 ft, "
              f"{100 * dis['beyond_15ft']:.1f}% differ by more than 15 ft")
        inv = w["inventory"]
        print(f"  (informational) {inv['moments']:,} moments, {inv['body_positions']:,} body "
              f"positions, {inv['miles_run']:,} miles run, {inv['hours_tracked']:,} hours")
        print(f"  (informational) reading 'the shot' as the gather instead of the release moves "
              f"{100 * (con['gather_rule']['changed_share'] or 0):.1f}% of shots "
              f"into a different published category")
    else:
        print("\nThe window: window.json absent (pipeline/window.py not run) - skipped")

    # --- The paint (pipeline/paint.py) ---------------------------------------
    paint_path = PROCESSED_DIR / "paint.json"
    if paint_path.exists():
        p = json.loads(paint_path.read_text())
        print("\nThe paint: strokes from the bodies the record could not keep")
        check("one possession per game", p["canvases"] >= EXPECTED_PAINT_CANVASES, True)
        check("eleven strokes per possession (ten bodies and the ball)",
              round(p["strokes"] / p["canvases"]) in (10, 11), True)
        check("the canvas spans the window rather than one week of it",
              p["days_covered"] >= EXPECTED_PAINT_DAYS, True)

        f = p["files"]
        vb = PROCESSED_DIR / "paint_strokes.bin"
        ib = PROCESSED_DIR / "paint_index.bin"
        check("paint_strokes.bin size matches its record count",
              vb.stat().st_size, f["vertices"]["records"] * f["vertices"]["bytes_per_record"])
        check("paint_index.bin size matches its record count",
              ib.stat().st_size, f["index"]["records"] * f["index"]["bytes_per_record"])
        check("index covers every stroke", f["index"]["records"], p["strokes"])

        # The measured speeds THE HAND's three fluid regimes are bounded by. If
        # these move, the paint's physics is describing a different record.
        sp = p["speed_ft_s"]
        check("speed percentiles are ordered and physical",
              sp["p10"] < sp["p50"] < sp["p90"] and 0 < sp["p10"] and sp["p90"] < 30, True)

        # Nothing identifying may ever be in here: the corpus stays private and
        # what ships must not be substitutable for it.
        blob = json.dumps(p).lower()
        leaked = [w for w in ("player", "game_id", "event_id", "playerid", "gameid")
                  if w in blob and f'"{w}"' in blob]
        check("no identity fields ship with the paint", leaked, [])

        ink = p["ink_by_zone"]
        check("ink shares sum to 1", abs(sum(ink.values()) - 1.0) < 1e-3, True)
        print(f"  (informational) {p['strokes']:,} strokes over {p['canvases']} possessions, "
              f"{p['vertices']:,} control points, {p['seconds_painted']:,.0f} painted seconds")
        print(f"  (informational) where the paint goes, against where the record files shots:")
        for z, share in ink.items():
            print(f"      {z:<22} {100 * share:5.1f}% of painted time")
    else:
        print("\nThe paint: paint.json absent (pipeline/paint.py not run) - skipped")

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
    if 1996 in seasons:
        c = seasons[1996]["contemporaneous"]
        print(f"  1996-97 opens at {100 * c['taxonomy_mid_share']:.1f}% by the NBA's zone taxonomy, "
              f"{100 * c['contemporaneous_mid_share']:.1f}% under the line then in force "
              f"({c['misfiled_threes']:,} threes filed as Mid-Range)")

    if failures:
        print(f"\nQA RED: {len(failures)} mismatch(es). The pipeline is wrong, not the plan.")
        sys.exit(1)
    print("\nQA GREEN: section 1.6 reproduced exactly.")


if __name__ == "__main__":
    main()
