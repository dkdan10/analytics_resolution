#!/usr/bin/env python3
"""Stage 3 - acceptance gate.

Regenerated aggregates must reproduce the measured table in
docs/build-plan-v2.md section 1.6 EXACTLY. If these numbers differ, the
pipeline is wrong, not the plan (CLAUDE.md ground truth).

Usage: python3 pipeline/qa.py            # exits 1 on any mismatch
       python3 pipeline/qa.py --slow     # ... and runs the independent
                                         #     recomputations over the raw
                                         #     corpus (minutes, not seconds)
"""

import json
import sys
from pathlib import Path

# The interpreter check runs before numpy is imported. Reversed, a reader on the
# wrong python3 gets `ModuleNotFoundError: numpy` and goes looking for a missing
# package, when the real problem is that the wrong interpreter won the PATH.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import PROCESSED_DIR, read_season_csv, require_env  # noqa: E402

require_env()

import numpy as np  # noqa: E402

from aggregate import POINT_DTYPE  # noqa: E402

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

# A canvas is ten bodies and the ball. After a path is cut at its
# discontinuities one body can be several strokes, so the stroke COUNT per
# canvas is no longer an invariant - the number of distinct bodies is. paint.py
# refuses a canvas that cannot field this many.
MIN_BODIES_PER_CANVAS = 8
MAX_BODIES_PER_CANVAS = 11

# The offset search window window.py calibrates in. An accepted offset ON this
# boundary means the search was too narrow to see its own peak, so both the
# range and the boundary count are gated.
EXPECTED_MAX_EVENT_OFFSET = 12

# The offset rule's own constants, imported rather than restated: a gate that
# reads its threshold out of the file it is checking is not a gate. Session 1
# shipped four of those, and the paint's residual gate compared paint.py's
# reported maximum against paint.py's reported threshold.
from window import (  # noqa: E402
    MAX_ANCHOR_RESIDUAL_FT,
    MIN_OFFSET_VOTES,
    OFFSET_MIN_MARGIN,
    OFFSET_OVER_ZERO,
)
from paint import (  # noqa: E402
    COINCIDENCE_FRAMES,
    COINCIDENCE_FT,
    COINCIDENCE_SECONDS as COINCIDENCE_SECONDS_QA,
)

# What the same rule can be asked of the SHIPPED BYTES, which is not the same
# question. paint.py refuses on the measured 25 Hz path; the bytes carry the
# simplified line, and Douglas-Peucker can pull two genuinely separated bodies
# closer than their measured separation - the shipped minimum is 0.368 ft on the
# feed and 0.275 ft once drawn. So the byte-level gate is the STORAGE-level one:
# a merged track is the feed repeating a row, which survives simplification as
# literally the same tenths, and two distinct bodies drawn to within one
# coordinate quantum for half a second is that signature. Derived from the
# storage, and it has 2.75x headroom against what ships.
BYTE_COINCIDENCE_FT = 0.1

# The held-out split is only evidence if it is drawn from most of the corpus and
# the straight join actually reproduces on half of it. Both are regression
# guards set below the measured values, not targets. Session 1's gate asked only
# that the figure EXISTED, which one testable game at 0.0001 satisfied.
#
# Measured 2026-08-08, over the FULL release set: 384 of 632 games testable
# (0.608), and within them the straight join reproduces 304/307 = 0.9902. The
# figure this replaces was 444/444 = 1.000, which was the anchor-keyed selection
# reproducing itself rather than anything out of sample.
HELD_OUT_MIN_SHARE = 0.5
HELD_OUT_STRAIGHT_FLOOR = 0.95

# Coordinates round to whole tenths of a foot, so a drawn chord can exceed the
# arc stored for it by up to the diagonal of one quantum plus the arc's own
# rounding. Derived, not chosen - and the bound a decoded vertex must hold to.
CHORD_OVER_ARC_MAX_FT = (0.1 ** 2 + 0.1 ** 2) ** 0.5 + 0.05


def _decode_paint(p):
    """paint_index.bin and paint_strokes.bin, decoded from their own record
    strings. Nothing else in qa.py had ever opened paint_strokes.bin."""
    import struct

    srec, vrec = p["files"]["index"]["record"], p["files"]["vertices"]["record"]
    ssz, vsz = struct.calcsize(srec), struct.calcsize(vrec)
    iraw = (PROCESSED_DIR / "paint_index.bin").read_bytes()
    vraw = (PROCESSED_DIR / "paint_strokes.bin").read_bytes()
    strokes = [struct.unpack_from(srec, iraw, i * ssz) for i in range(len(iraw) // ssz)]
    verts = [struct.unpack_from(vrec, vraw, i * vsz) for i in range(len(vraw) // vsz)]
    return strokes, verts


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
                n = min(len(pi), len(pj))
                if n < COINCIDENCE_FRAMES:
                    continue
                sep = [((pi[k][0] - pj[k][0]) ** 2
                        + (pi[k][1] - pj[k][1]) ** 2) ** 0.5 / 10.0 for k in range(n)]
                # The closest the pair gets and STAYS: the smallest maximum over
                # any window of COINCIDENCE_FRAMES. Momentary contact in a scrum
                # parts again; one detection reported twice does not.
                sustained = min(max(sep[k:k + COINCIDENCE_FRAMES])
                                for k in range(n - COINCIDENCE_FRAMES + 1))
                if closest is None or sustained < closest:
                    closest = sustained
                if sustained <= BYTE_COINCIDENCE_FT:
                    bad.append([canvas, bi, bj])
    return bad, dupes, round(closest, 3) if closest is not None else None


def _chord_over_arc(strokes, verts):
    """Every drawn segment against the arc stored for it.

    The measurement must cover the line: a body that travelled `arc` cannot be
    drawn across a longer chord. Coordinates round to tenths and arc rounds
    once, which is the only slack allowed.
    """
    worst, n_over = 0.0, 0
    for first, count, _canvas, _kind, _body, _day in strokes:
        vs = verts[first:first + count]
        for i in range(1, len(vs)):
            chord = ((vs[i][0] - vs[i - 1][0]) ** 2 + (vs[i][1] - vs[i - 1][1]) ** 2) ** 0.5 / 10.0
            excess = chord - vs[i][3] / 10.0
            worst = max(worst, excess)
            if excess > CHORD_OVER_ARC_MAX_FT:
                n_over += 1
    return worst, n_over


def _paint_join_reconstruction():
    """Rebuild every canvas's join from the private per-game window artifacts.

    Returns (rows, residual mismatches, canvases with no corroborated shot,
    worst residual), or None where data/window/ is not on this machine. This is
    the reconstruction the paint's residual gate was missing: the numbers come
    from the window stage's own corroborated sets, never from paint.json.
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
        check("the offset search is the declared width",
              rec["search_range"], EXPECTED_MAX_EVENT_OFFSET)
        check("event offsets stay inside the searched range",
              [k for k in rec["event_offsets"] if abs(int(k)) > EXPECTED_MAX_EVENT_OFFSET], [])
        # An argmax on the edge is a peak the search could not see, so it is
        # refused rather than shipped - and the count of them is gated at zero
        # instead of being reported.
        check("no accepted offset sits on the search boundary",
              rec["offsets_on_search_boundary"], 0)
        # ... and the number that would actually reveal a search too narrow to
        # see its own peak is how many games had to be REFUSED for landing on
        # the edge. That one was printed and never gated, while the gate above
        # - which is zero by construction, because decide_offset converts a
        # boundary argmax to zero before it is ever counted - carried the claim.
        check("no game's argmax was refused for landing on the search boundary",
              rec["offsets_rejected_by_reason"].get("argmax on the search boundary", 0), 0)

        # EVERY ACCEPTED SHIFT, re-tested here against the rule's own constants.
        # This replaces a gate whose first term was a count >= 0 and whose
        # second filtered the offset distribution to |k| == 12, a value
        # decide_offset converts to zero before counting - so `all()` ran over
        # an empty sequence and the whole check was vacuously true. Setting
        # games_under_min to 631 left it green.
        acc = rec.get("accepted_offsets")
        check("every accepted shift is listed with the evidence for it",
              acc is not None and len(acc) == rec["games_offset"], True)
        if acc is not None:
            check("no accepted shift falls below the minimum vote count",
                  [a["archive"] for a in acc if a["votes"] < MIN_OFFSET_VOTES], [])
            check("every accepted shift clears the straight join by the declared factor",
                  [a["archive"] for a in acc
                   if a["votes"] < OFFSET_OVER_ZERO * max(1, a["at_zero"])], [])
            check("every accepted shift beats its own runner-up by the declared margin",
                  [a["archive"] for a in acc if a["margin"] < OFFSET_MIN_MARGIN], [])
            check("no accepted shift sits on the search boundary",
                  [a["archive"] for a in acc
                   if abs(a["offset"]) >= EXPECTED_MAX_EVENT_OFFSET], [])
        # A1: no game may be decided on a vector where the rivals are
        # structurally attenuated. 445 games shipped on the anchor-keyed release
        # set, where offset zero has a candidate anchor for every member by
        # construction and no rival does.
        check("every game's offset was decided on the full release set",
              rec.get("searched"), {"full": corp["games_parsed"]})

        # The calibration is validated, not merely computed: even-numbered
        # tracking events decide, odd ones check. Session 1 gated only that the
        # figure EXISTED, which one testable game agreeing 0.0001 of the time
        # satisfied. These three ask what it says.
        ho = rec["held_out_by_outcome"]
        check("the held-out split is drawn from most of the corpus",
              rec["held_out_games"] >= HELD_OUT_MIN_SHARE * corp["games_parsed"], True)
        check("the straight join reproduces on half the evidence",
              ho["straight"]["rate"] is not None
              and ho["straight"]["rate"] >= HELD_OUT_STRAIGHT_FLOOR, True)
        # ... and the aggregate must BE the split it summarises, recomputed
        # here, so the headline figure cannot move without the evidence moving.
        agg_games = sum(v["games"] for v in ho.values())
        agg_agree = sum(v["agree"] for v in ho.values())
        check("the held-out aggregate is the split it summarises",
              [rec["held_out_games"], rec["held_out_agreement"]],
              [agg_games, round(agg_agree / agg_games, 4) if agg_games else None])
        offset_share = rec["games_offset"] / corp["games_parsed"]
        check("most games need no offset", offset_share < 0.5, True)
        print(f"  (informational) {rec['games_offset']} of {corp['games_parsed']} games "
              f"({100 * offset_share:.0f}%) needed their event numbering shifted: "
              f"{rec['event_offsets']}")
        print(f"  (informational) {rec['n_weak_joins']} games where the record barely settled "
              f"the offset (margin < 0.10); {rec['offsets_rejected']} shifted joins rejected "
              f"{rec['offsets_rejected_by_reason']}")
        # Read the split, not the aggregate: what validates perfectly out of
        # sample is the absence of an offset, and the piece should not be able
        # to quote one flattering number for three different findings.
        check("the held-out split is reported, not just its aggregate",
              sorted(rec["held_out_by_outcome"]), ["rejected", "shifted", "straight"])
        print(f"  (informational) {rec['held_out_refused_halves']} halves refused to name an "
              f"offset at all and are counted as neither agreement nor disagreement")
        print(f"  (informational) held-out validation over {rec['held_out_games']} testable "
              f"games: the straight join reproduces on half the evidence "
              f"{100 * ho['straight']['rate']:.1f}% of the time ({ho['straight']['games']} "
              f"games), an accepted shift {100 * ho['shifted']['rate']:.1f}% "
              f"({ho['shifted']['games']}), a rejected one {100 * ho['rejected']['rate']:.1f}% "
              f"({ho['rejected']['games']}); aggregate "
              f"{100 * rec['held_out_agreement']:.1f}%")
        # HONESTLY SCOPED. This used to read "the minimum is 25 and 84 games
        # fall under it", which sounds like 84 accepted offsets below the
        # minimum - the opposite of what the rule guarantees. Those 84 were
        # counted over all 632 games including the 553 straight joins the floor
        # never touches. The population below is the games where the floor is
        # reached at all, and the only figure that says what the second reading
        # is worth is how many games it decides differently.
        vt = rec["votes"]
        check("no game where the vote floor is reached went unrecorded",
              vt["games_in_population"] >= len(acc or []), True)
        check("the alternate vote floor's cost is recomputed, not asserted",
              "games_changed_by_alt" in vt, True)
        print(f"  (informational) the vote floor is reached in {vt['games_in_population']} games "
              f"(those with a non-zero argmax), never in the {rec['event_offsets'].get('0', 0)} "
              f"straight joins: min {vt['min_in_population']}, p50 {vt['p50']}, p95 {vt['p95']}; "
              f"{vt['under_min']} fall under the minimum of {vt['min_required']} and are "
              f"refused, {vt['under_min_alt']} under the alternate {vt['min_required_alt']}")
        print(f"  (informational) the smallest vote count carrying an ACCEPTED shift is "
              f"{rec['min_votes_accepted']}; the alternate floor of {vt['min_required_alt']} "
              f"decides {vt['games_changed_by_alt']} games differently"
              + (" - on this corpus the two values are the same rule"
                 if not vt["games_changed_by_alt"] else ""))

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
        print(f"  (informational) {inv['touches']:,} touches, {inv['passes']:,} passes "
              f"({inv['passes_alt_gap']:,} at the alternate gap), {inv['drives']:,} drives - "
              f"against {inv['drives_unordered']:,} read without requiring the outside sample "
              f"to come first; {inv['feed_breaks']:,} feed breaks segmented on")
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
        check("the canvas spans the window rather than one week of it",
              p["days_covered"] >= EXPECTED_PAINT_DAYS, True)
        # ... against the CORPUS's own span, not a constant. The old gate cleared
        # 67 >= 60 while the painting stopped on 3 January and never reached the
        # 23 January closure Act III is built toward: an integer stride could not
        # index past game 498 of 632.
        check("the paint reaches the window's opening and its closure",
              [p["date_first"], p["date_last"]],
              [p["corpus_date_first"], p["corpus_date_last"]])
        print(f"  (informational) canvases by month {p['canvases_by_month']}; "
              f"{p['days_covered']} distinct days")

        f = p["files"]
        vb = PROCESSED_DIR / "paint_strokes.bin"
        ib = PROCESSED_DIR / "paint_index.bin"
        check("paint_strokes.bin size matches its record count",
              vb.stat().st_size, f["vertices"]["records"] * f["vertices"]["bytes_per_record"])
        check("paint_index.bin size matches its record count",
              ib.stat().st_size, f["index"]["records"] * f["index"]["bytes_per_record"])
        check("index covers every stroke", f["index"]["records"], p["strokes"])

        # A canvas is ten bodies and the ball. Once a path is cut at its
        # discontinuities, one body can be several strokes, so counting strokes
        # per canvas no longer says anything - the invariant that survives
        # splitting is the number of distinct bodies, which the index's own
        # canvas and body fields make computable straight from the bytes.
        import struct as _struct
        srec = f["index"]["record"]
        ssz = _struct.calcsize(srec)
        raw = ib.read_bytes()
        groups = {}
        for i in range(len(raw) // ssz):
            _first, _count, canvas, _kind, body, _day = _struct.unpack_from(srec, raw, i * ssz)
            groups.setdefault(canvas, set()).add(body)
        per = [len(v) for v in groups.values()]
        check("the index's record string matches the bytes it describes",
              len(raw) % ssz, 0)
        check("every canvas appears in the index", len(groups), p["canvases"])
        check("ten bodies and the ball per canvas, however many runs they took",
              min(per) >= MIN_BODIES_PER_CANVAS and max(per) <= MAX_BODIES_PER_CANVAS, True)
        check("paint.json's body count agrees with the index",
              [p["bodies_per_canvas"]["min"], p["bodies_per_canvas"]["max"]],
              [min(per), max(per)])

        # Every canvas is one shot the window stage corroborated, and the join
        # is retained privately rather than asserted.
        #
        # AGAINST THE RULE'S OWN CONSTANT, not against the number the file being
        # checked reports as its threshold. `res["max"] <= res["max_allowed"]`
        # took both sides from paint.json, so a canvas at 480 ft against a
        # declared 500 ft threshold passed - and the informational line beneath
        # it printed "residual median 260.0 ft" without a single gate reddening.
        res = p["anchor_residual_ft"]
        check("no canvas ships an anchor residual over the corroboration threshold",
              res["max"] <= MAX_ANCHOR_RESIDUAL_FT, True)
        check("the paint declares the same threshold the window stage joins at",
              res["max_allowed"], MAX_ANCHOR_RESIDUAL_FT)
        check("the shipped binaries declare the format the piece decodes",
              p.get("format_version"), 2)

        # And where the private intermediates are on this machine, the join is
        # RECONSTRUCTED rather than believed: every shipped canvas must be a
        # shot the window stage's own corroborated set holds, at the residual
        # the paint reports for it. This is what makes the gate independent of
        # paint.json's summary of itself.
        prov = _paint_join_reconstruction()
        if prov is None:
            print("  (informational) private intermediates absent - the paint join is gated "
                  "against the threshold only; run pipeline/checks/check_paint_join.py "
                  "where data/window/ exists")
        else:
            n_rows, mismatched, orphaned, worst = prov
            check("the private join carries one row per shipped canvas", n_rows, p["canvases"])
            check("every canvas is a shot the window stage corroborated", orphaned, [])
            check("every canvas's residual is the one the window stage measured",
                  mismatched, [])
            print(f"  (informational) the join reconstructed from data/window/: {n_rows} canvases, "
                  f"worst residual {worst} ft against {MAX_ANCHOR_RESIDUAL_FT}")

        # RULE 7, gated from the bytes. The split cuts jumps; a merged track -
        # the feed reporting one detection under two player ids - has none, so
        # it passes every continuity check and paints one measurement twice.
        # 20 such pairs shipped across 19 of 250 canvases before this existed.
        co = p["coincidence_ft"]
        # The rule at full precision, from the 25 Hz path paint.py measured.
        check("the refusal rule and its tolerance ship with the paint",
              [co["tolerance"], co["seconds"]], [COINCIDENCE_FT, COINCIDENCE_SECONDS_QA])
        check("no shipped canvas holds two bodies closer than the rule allows",
              co["shipped_min"] is not None and co["shipped_min"] > COINCIDENCE_FT, True)
        # ... and independently, from the bytes, at the storage level.
        strokes, verts = _decode_paint(p)
        coincident, exact_dupes, closest = _coincident_bodies(strokes, verts)
        check("no canvas draws two bodies inside one coordinate quantum", coincident, [])
        check("no two body slots ship an identical path", exact_dupes, [])
        print(f"  (informational) closest sustained approach between two painted bodies: "
              f"{co['shipped_min']} ft measured on the feed, {closest} ft once drawn "
              f"(simplification pulls them closer), against a {COINCIDENCE_FT} ft refusal "
              f"over {COINCIDENCE_FRAMES} frames and a {BYTE_COINCIDENCE_FT} ft byte gate")
        print(f"  (informational) paint.py refused {co['spans_refused']} of "
              f"{co['spans_examined']} spans for holding one detection twice "
              f"({co['spans_refused_alt']} at the alternate {co['tolerance_alt']} ft); "
              f"{co['hist'].get('0.0', 0)} of those sat at exactly 0.0 ft, which is the "
              f"feed repeating a row")

        # F-02's criterion, which nothing was checking: paint_strokes.bin was
        # never decoded, so 60 vertices drawing 40-ft chords against 0.1 ft of
        # stored arc left the gate green. A drawn segment may not exceed the arc
        # measured for it by more than the coordinate quantum allows.
        worst_excess, n_over = _chord_over_arc(strokes, verts)
        check("no drawn segment exceeds the arc measured for it",
              n_over, 0)
        print(f"  (informational) worst chord-minus-arc excess {worst_excess:.4f} ft against a "
              f"{CHORD_OVER_ARC_MAX_FT:.4f} ft quantization bound, over {len(verts):,} vertices")

        # The selection rule, as implemented. 76 of 250 canvases are not their
        # game's smallest-residual corroborated shot, so a rule naming only the
        # ordering was describing something the code does not do.
        rk = p["selection_rank"]
        check("every canvas's place in the residual ordering is reported",
              sum(rk.values()), p["canvases"])
        print(f"  (informational) canvases at each rank in their game's residual ordering: "
              f"{dict(list(rk.items())[:8])}; {p['canvases'] - p['selection_rank_zero']} of "
              f"{p['canvases']} are NOT their game's smallest-residual corroborated shot, "
              f"which is the feed-quality half of the selection rule doing the choosing")

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
        print(f"  (informational) every canvas joined to the shot record: residual median "
              f"{res['median']} ft, p90 {res['p90']} ft, max {res['max']} ft against a "
              f"{res['max_allowed']} ft threshold")
        print(f"  (informational) {p['strokes_alt_min_run']:,} strokes under the alternate "
              f"run floor of {p['min_run_frames_alt']} frames against {p['strokes']:,} at "
              f"{p['min_run_frames']}; {p['vertices_forced_by_zone']:,} vertices forced by a "
              f"zone change")
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

    if "--slow" in sys.argv:
        failures += run_slow_checks()

    if failures:
        print(f"\nQA RED: {len(failures)} mismatch(es). The pipeline is wrong, not the plan.")
        sys.exit(1)
    print("\nQA GREEN: section 1.6 reproduced exactly.")


# The independent recomputations that need the raw corpus, reachable from the
# gate rather than orphaned beside it. check_paint_join.py in particular does
# the reconstruction the paint's residual gate could not do from data/processed/
# alone - it reopens every painted archive and rebuilds the join from the
# physics - and until now nothing ran it. Off by default because it parses
# gigabytes; session 2 owns making the DEFAULT gate semantic.
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


if __name__ == "__main__":
    main()
