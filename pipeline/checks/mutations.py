#!/usr/bin/env python3
"""The defect catalogue: one mutation, one gate that must catch it.

A gate you cannot break is not evidence. Every entry here reintroduces a defect
that once shipped green - or that the 2026-08-08 audit demonstrated could ship
green - on a COPY of data/processed/, and names the exact check that has to go
red. A mutation caught only by some unrelated check is a FAILURE of the suite,
not a pass: that distinction is the whole point.

The catalogue is defined once and consumed twice:

  qa.py --mutations              runs the target groups IN-PROCESS against the
                                 copy. Fast enough to be part of every gate run.
  checks/break_gates.py          runs the WHOLE gate as a subprocess against a
                                 mutated repo root. Slower, end-to-end, and the
                                 stronger demonstration.

The real data/processed/ is never touched.

Usage: python3 pipeline/checks/mutations.py [--case NAME]
       (equivalently: python3 pipeline/qa.py --mutations)
"""

import argparse
import json
import shutil
import struct
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import PROCESSED_DIR, REPO_ROOT, require_env  # noqa: E402


class Case:
    """A defect, the groups that must be run to see it, and the check that owns it.

    `catches` is matched as a SUBSTRING of the printed FAIL line, so a check
    whose name carries a measured detail in parentheses still matches.

    `scope` is which directory `mutate` is handed. Session 2's contract was
    `mutate(processed_dir)` and every defect lived under data/processed/, which
    would have left session 3's two new gates - the deploy allowlist under
    pipeline/, and the memory claims in CLAUDE.md - as the only gates outside
    the catalogue. An unstated exception is how "add a gate, add its defect"
    decays, so the contract widened instead: `scope="repo"` hands `mutate` a
    repo-shaped root holding data/processed/, CLAUDE.md, the allowlist and the
    site source the gates read.
    """

    def __init__(self, name, groups, catches, mutate, why, scope="processed"):
        self.name = name
        self.groups = groups
        self.catches = catches
        self.mutate = mutate
        self.why = why
        self.scope = scope


# --- helpers -----------------------------------------------------------------


def _load(d, name):
    return json.loads((d / name).read_text())


def _save(d, name, obj):
    (d / name).write_text(json.dumps(obj))


def _zero(d, name):
    p = d / name
    p.write_bytes(b"\0" * p.stat().st_size)


def _randomise(d, name, seed):
    """Deterministic pseudo-random bytes of the same length.

    Not `random`: a mutation suite that behaves differently on two runs cannot
    be evidence of anything. A 64-bit LCG is plenty to destroy structure.
    """
    p = d / name
    n = p.stat().st_size
    out = bytearray(n)
    x = seed
    for i in range(n):
        x = (x * 6364136223846793005 + 1442695040888963407) & ((1 << 64) - 1)
        out[i] = (x >> 33) & 0xFF
    p.write_bytes(bytes(out))


def _truncate(d, name, record_bytes):
    p = d / name
    p.write_bytes(p.read_bytes()[:-record_bytes])


def _delete(name):
    def go(d):
        (d / name).unlink()
    return go


# --- the mutations -----------------------------------------------------------
# Numbered as in the session brief; the eight the audit measured surviving the
# old gate are marked (audit).


def m_zero_measures(d):
    _zero(d, "window_measures.bin")


def m_zero_strokes(d):
    _zero(d, "paint_strokes.bin")


def m_zero_index(d):
    _zero(d, "paint_index.bin")


def m_zero_points(d):
    _zero(d, "points/season_2015.bin")


def m_random_measures(d):
    _randomise(d, "window_measures.bin", 20151027)


def m_random_strokes(d):
    _randomise(d, "paint_strokes.bin", 20160123)


def m_random_index(d):
    _randomise(d, "paint_index.bin", 632)


def m_random_points(d):
    _randomise(d, "points/season_2015.bin", 207893)


def m_truncate_measures(d):
    _truncate(d, "window_measures.bin", _load(d, "window.json")["measures_bin"]["bytes_per_record"])


def m_truncate_strokes(d):
    _truncate(d, "paint_strokes.bin",
              _load(d, "paint.json")["files"]["vertices"]["bytes_per_record"])


def m_truncate_index(d):
    _truncate(d, "paint_index.bin",
              _load(d, "paint.json")["files"]["index"]["bytes_per_record"])


def m_truncate_points(d):
    from aggregate import POINT_DTYPE  # noqa: PLC0415

    _truncate(d, "points/season_2015.bin", POINT_DTYPE.itemsize)


def m_approach_999(d):
    """Every approach sample set to 999 ft. (audit)

    The old check asked whether the curve was LONG ENOUGH, which 999 satisfies
    as readily as 4.72 does.
    """
    w = _load(d, "window.json")
    w["contest"]["approach_curve_ft"] = [999.0] * len(w["contest"]["approach_curve_ft"])
    _save(d, "window.json", w)


def m_bucket_bounds(d):
    """Every contest bound replaced with 99-100 ft. (audit)

    Nothing recomputed a record's category from its own distance, so the bounds
    were decorative.
    """
    w = _load(d, "window.json")
    for b in w["contest"]["buckets"]:
        b["lo_ft"], b["hi_ft"] = 99.0, 100.0
    _save(d, "window.json", w)


def m_bias_zero(d):
    """The recovery bias gap replaced with zero. (audit)

    Detection follows the ball back from the rim, so the recovered set CANNOT
    be unbiased; a zero here is the one value the artifact must not be able to
    claim quietly.
    """
    w = _load(d, "window.json")
    w["bias"]["fg_pct_gap"] = 0.0
    _save(d, "window.json", w)


def m_overlap_strokes(d):
    """Two strokes' `first` offsets swapped so their vertex ranges overlap."""
    p = _load(d, "paint.json")
    rec = p["files"]["index"]["record"]
    size = struct.calcsize(rec)
    raw = bytearray((d / "paint_index.bin").read_bytes())
    a = struct.unpack_from(rec, raw, 0)
    b = struct.unpack_from(rec, raw, size)
    struct.pack_into(rec, raw, 0, b[0], *a[1:])
    struct.pack_into(rec, raw, size, a[0], *b[1:])
    (d / "paint_index.bin").write_bytes(bytes(raw))


def m_hero_jump(d):
    """A hero track given a single 20 ft frame-to-frame jump.

    F-09: two of the four shipped 40 ms teleports of 16 and 22 ft, because the
    shooter was re-selected every frame rather than bound at the release.
    """
    w = _load(d, "window.json")
    tr = w["contest"]["heroes"][0]["track"]
    mid = len(tr) // 2
    tr[mid] = [tr[mid][0] + 200, tr[mid][1], tr[mid][2], tr[mid][3]] + tr[mid][4:]
    _save(d, "window.json", w)


def m_season_share(d):
    """One season's mid_share moved by a thousandth.

    The spine is the project's ground truth and it is quoted to one decimal, so
    a change this small has to be visible.
    """
    s = _load(d, "seasons.json")
    for row in s["seasons"]:
        if row["year"] == 2015:
            row["mid_share"] += 0.001
    _save(d, "seasons.json", s)


def m_filing_drop(d):
    """One category loses its place.

    THE CENSUS strikes a word for every category it names, so a missing place is
    a word with nowhere to go - and the renderer would simply not draw it, which
    on a floor of fifty-three ticks nobody would notice.
    """
    s = _load(d, "seasons.json")
    for row in s["seasons"]:
        if row["year"] == 2015:
            row["classification_place"]["ZONE"].pop("Mid-Range")
    _save(d, "seasons.json", s)


def m_filing_zero(d):
    """Every place collapses to the origin.

    The shape a zero-fill takes here: distances to zero, bearings to zero. Every
    word in the filing would then be struck on top of the hoop, in a pile, which
    is exactly the composition the polar mean exists to avoid.
    """
    s = _load(d, "seasons.json")
    for row in s["seasons"]:
        for cats in row["classification_place"].values():
            for e in cats.values():
                if "dist_ft" in e:
                    e["dist_ft"] = 0.0
                    e["bearing_rad"] = 0.0
    _save(d, "seasons.json", s)


def m_filing_mirror(d):
    """The bearings are mirrored: every left category becomes a right one.

    THE defect the cross-field side check exists for. A sign error in the
    circular mean - or a season's places shuffled against their categories -
    puts LEFT CORNER 3 in the right corner, and nothing about the resulting
    picture looks wrong: it is still seven words at seven plausible places.
    """
    s = _load(d, "seasons.json")
    for row in s["seasons"]:
        for cats in row["classification_place"].values():
            for e in cats.values():
                if "bearing_rad" in e:
                    e["bearing_rad"] = -e["bearing_rad"]
    _save(d, "seasons.json", s)


def m_filing_count(d):
    """A place's `n` drifts from the tally it is supposed to be counting.

    The two keys are read by the same hand for the same word - `classification`
    sizes it and `classification_place` puts it somewhere - so a disagreement
    draws one category at another's size.
    """
    s = _load(d, "seasons.json")
    for row in s["seasons"]:
        if row["year"] == 2015:
            row["classification_place"]["TYPE"]["3PT Field Goal"]["n"] += 1
    _save(d, "seasons.json", s)


def m_filing_backcourt(d):
    """The backcourt categories are dragged onto the plate.

    Their landing beyond the halfcourt is measured and is the census's footer
    line. Pulled inside, the plate would silently claim to hold a region the
    record puts off it.
    """
    s = _load(d, "seasons.json")
    for row in s["seasons"]:
        for title, cat in (("ZONE", "Backcourt"), ("RANGE", "Back Court Shot"),
                           ("AREA", "Back Court(BC)")):
            e = row["classification_place"].get(title, {}).get(cat)
            if e and "dist_ft" in e:
                e["dist_ft"] = 20.0
    _save(d, "seasons.json", s)


def m_covering_90_split(d):
    """THE LEDGER's label budget stops being THE CENSUS's DESCRIPTION budget.

    Two hands reading one measurement is the whole reason `covering_90pct`
    generalises `words_covering_90pct` instead of sitting beside it. Split them
    and both hands still draw - at densities that no longer agree.
    """
    s = _load(d, "seasons.json")
    for row in s["seasons"]:
        if row["year"] == 2015:
            row["vocabulary"]["covering_90pct"]["DESCRIPTION"] += 3
    _save(d, "seasons.json", s)


def m_zone_byte(d):
    """One zone byte flipped in a points/*.bin.

    Not any byte: the busiest cell that currently agrees with the geometry, and
    flipped to a region it is nowhere near - which is what distinguishes a
    corrupted label from the 340 boundary-convention coordinates that disagree
    legitimately.
    """
    import numpy as np  # noqa: PLC0415

    from aggregate import POINT_DTYPE  # noqa: PLC0415
    from qa import zone_at_np  # noqa: PLC0415

    p = d / "points/season_2015.bin"
    rec = np.frombuffer(p.read_bytes(), dtype=POINT_DTYPE).copy()
    geom = zone_at_np(rec["x"].astype(float), rec["y"].astype(float))
    ok = np.nonzero(geom == rec["zone"])[0]
    i = int(ok[np.argmax((rec["n_hires"].astype(np.int64) + rec["n_rest"])[ok])])
    rec["zone"][i] = 6 if rec["zone"][i] != 6 else 0   # Backcourt, or away from it
    p.write_bytes(rec.tobytes())


def m_unknown_file(d):
    """An unexpected file under data/processed/.

    A new artifact must be added deliberately - that is the hook session 3's
    deploy allowlist hangs off.
    """
    (d / "leftover_scratch.json").write_text('{"note": "not in the required inventory"}\n')


def m_paint_residual(d):
    """Canvases eighty times past the corroboration threshold. (session 1b, D4)

    The old gate compared paint.json's reported max against paint.json's
    reported max_allowed, so raising both left it green.
    """
    p = _load(d, "paint.json")
    p["anchor_residual_ft"].update({"max": 480.0, "max_allowed": 500.0,
                                    "median": 260.0, "p90": 400.0})
    _save(d, "paint.json", p)


def m_chord(d):
    """Sixty vertices drawing forty-foot chords against a tenth of arc. (D5)"""
    p = _load(d, "paint.json")
    rec = p["files"]["vertices"]["record"]
    size = struct.calcsize(rec)
    path = d / "paint_strokes.bin"
    raw = bytearray(path.read_bytes())
    n = 0
    for i in range(1, len(raw) // size):
        x, y, dt, _arc = struct.unpack_from(rec, raw, i * size)
        if dt == 0:
            continue
        struct.pack_into(rec, raw, i * size, min(32000, x + 400), y, dt, 1)
        n += 1
        if n >= 60:
            break
    path.write_bytes(bytes(raw))


def m_measures_count(d):
    """The binary's declared record count moved away from the recovery figure."""
    w = _load(d, "window.json")
    w["measures_bin"]["records"] += 1
    _save(d, "window.json", w)


def m_clip(d):
    """F-05 itself, put back: the caliper clipped to one byte of tenths.

    This is what shipped through session 2 - 30 records whose stored length was
    25.5 ft while the two coordinates in the same row described up to 51.85 ft,
    and a renderer that read the clipped value as a distance. The endpoint
    cross-check is what has to see it.
    """
    w = _load(d, "window.json")
    mb = w["measures_bin"]
    rec, size = mb["record"], struct.calcsize(mb["record"])
    raw = bytearray((d / "window_measures.bin").read_bytes())
    for i in range(len(raw) // size):
        f = struct.unpack_from(rec, raw, i * size)
        if f[4] > 255:
            struct.pack_into(rec, raw, i * size, *f[:4], 255, *f[5:])
    (d / "window_measures.bin").write_bytes(bytes(raw))


def m_ceiling(d):
    """One caliper filed at the field's own ceiling.

    Under uint16 nothing on a floor can reach it, so a record sitting there is
    an encoding that has stopped being able to say what it measured. The
    endpoints are moved with it, so the row is internally consistent and only
    the ceiling check can object to it on its own terms.
    """
    w = _load(d, "window.json")
    mb = w["measures_bin"]
    rec, size = mb["record"], struct.calcsize(mb["record"])
    raw = bytearray((d / "window_measures.bin").read_bytes())
    f = struct.unpack_from(rec, raw, 0)
    struct.pack_into(rec, raw, 0, -32768, 0, 32767, 0, 0xFFFF, *f[5:])
    (d / "window_measures.bin").write_bytes(bytes(raw))


def m_caliper_p99(d):
    """The reference THE HAND scales every splotch against, moved off the data.

    Rule 3: a mark's material properties derive from a measurement. If p99 can
    drift from the distribution it summarises, the splotch radius has quietly
    stopped being a measurement of anything - which is F-05 in a new costume.
    """
    w = _load(d, "window.json")
    w["contest"]["caliper_ft"]["p99"] = 25.5
    _save(d, "window.json", w)


def m_bias_disclosure(d):
    """The wall text drifting from the measurement it discloses.

    F-12's fix is a templated string the piece draws verbatim. A coverage figure
    edited in the artifact - or left behind by a re-run - puts an unmeasured
    number on a public wall, which is the defect the fix exists to prevent.
    """
    w = _load(d, "window.json")
    w["bias"]["disclosure"][0] = w["bias"]["disclosure"][0].replace("23.2%", "48.0%")
    _save(d, "window.json", w)


def m_trace_anchor(d):
    """A trace moved off the shot it claims to be anchored at."""
    t = _load(d, "traces.json")
    t["traces"][0]["anchor"] = [t["traces"][0]["anchor"][0] + 300,
                                t["traces"][0]["anchor"][1]]
    _save(d, "traces.json", t)


def m_occupancy_share(d):
    """An occupancy band's share detached from its own frame count."""
    w = _load(d, "window.json")
    w["occupancy"]["bands"][0]["share"] = 0.5
    w["occupancy"]["bands"][1]["share"] = \
        round(1.0 - sum(b["share"] for b in w["occupancy"]["bands"][2:]) - 0.5, 4)
    _save(d, "window.json", w)


def m_day_offset_drift(d):
    """A day offset detached from the date it is supposed to measure.

    `day_offsets` is the half a renderer paces on and `day_dates` is the half a
    reader can check, so the one that must not drift silently is the first. A
    stroke paced off this would land on the wrong day of the window with nothing
    on screen to say so.
    """
    p = _load(d, "paint.json")
    p["day_offsets"][40] = p["day_offsets"][40] + 3
    _save(d, "paint.json", p)


def m_day_past_calendar(d):
    """A stroke naming a day the calendar does not have.

    The gate this replaces asked `max(day) < 256` of a uint8 field, which is
    true of every byte that can be stored in it and could not fail. One stroke's
    `day` byte is pushed past the end of `day_dates`: a renderer pacing that
    stroke would look its day up in a calendar that stops short of it.
    """
    p = _load(d, "paint.json")
    rec = p["files"]["index"]["record"]
    size = struct.calcsize(rec)
    raw = bytearray((d / "paint_index.bin").read_bytes())
    s = struct.unpack_from(rec, raw, 0)
    struct.pack_into(rec, raw, 0, *s[:5], len(p["day_dates"]) + 1)
    (d / "paint_index.bin").write_bytes(bytes(raw))


def m_paint_stale_reader(d):
    """The two halves of the project disagreeing about a byte layout.

    Nothing type-checks a record width: site/src/data.ts decoded 6- and 8-byte
    paint records for three sessions after the pipeline moved to 8 and 11, and
    `tsc --noEmit` and `npm run build` both stayed clean while THE HAND drew a
    starburst of garbage. This re-declares the paint records at those old widths
    against the reader session 4 landed.

    It used to prove the REVERSE direction - a dated waiver outliving the
    mismatch it names - which is what it caught while data.ts was still on the
    old widths. With DECODER_WAIVERS empty that direction cannot be staged at
    all, so the case proves the forward one instead. Same one-line mutation,
    different check.
    """
    p = _load(d, "paint.json")
    p["files"]["vertices"]["bytes_per_record"] = 6
    p["files"]["index"]["bytes_per_record"] = 8
    _save(d, "paint.json", p)


def m_d1_votes(d):
    """D1: a non-zero offset accepted on far too few votes.

    Session 1's gate read `votes.games_under_min >= 0 and all(... for k, v in
    event_offsets if abs(k) == 12)`. The first term is a count and cannot be
    negative; the second filters the offset distribution to the search
    boundary, which decide_offset converts to zero before counting, so `all()`
    ran over nothing. Setting games_under_min to 631 left 97 checks passing.
    """
    w = _load(d, "window.json")
    rec = w["recovery"]
    rec["votes"]["all_games_under_min"] = 631
    rec["votes"]["under_min"] = 631
    if rec["accepted_offsets"]:
        rec["accepted_offsets"][0]["votes"] = 3
        rec["min_votes_accepted"] = 3
    _save(d, "window.json", w)


def m_d1_lift(d):
    """D1: an accepted shift with no lift over the straight join."""
    w = _load(d, "window.json")
    a = w["recovery"]["accepted_offsets"]
    a[0]["at_zero"] = a[0]["votes"]
    _save(d, "window.json", w)


def m_d2_boundary(d):
    """D2: four hundred games whose argmax landed on the search boundary.

    The shipped gate read offsets_on_search_boundary, which is zero however
    narrow the search is. The number that reveals it was printed, never gated.
    """
    w = _load(d, "window.json")
    w["recovery"]["offsets_rejected_by_reason"]["argmax on the search boundary"] = 400
    _save(d, "window.json", w)


def m_d3_heldout(d):
    """D3: one testable game, agreeing essentially never.

    The old gate asked only that held_out_agreement was not None and
    held_out_games > 0.
    """
    w = _load(d, "window.json")
    rec = w["recovery"]
    rec["held_out_agreement"] = 0.0001
    rec["held_out_games"] = 1
    for k in rec["held_out_by_outcome"]:
        rec["held_out_by_outcome"][k] = {"games": 0, "agree": 0, "rate": 0.0}
    _save(d, "window.json", w)


def m_d3_aggregate(d):
    """D3: the headline agreement moved without the evidence moving."""
    w = _load(d, "window.json")
    w["recovery"]["held_out_agreement"] = 0.99
    _save(d, "window.json", w)


def m_a1_searched(d):
    """A1: games decided on the anchor-keyed vector, where zero cannot lose."""
    w = _load(d, "window.json")
    total = sum(w["recovery"]["searched"].values())
    w["recovery"]["searched"] = {"full": total - 445, "direct": 445}
    _save(d, "window.json", w)


def m_b_coincident(d):
    """B: two body slots of one canvas that are one detection reported twice.

    A merged track is perfectly continuous, so every check session 1 added -
    including the full-rate realignment in check_strokes - passes on it.
    """
    p = _load(d, "paint.json")
    srec = p["files"]["index"]["record"]
    vrec = p["files"]["vertices"]["record"]
    ssz, vsz = struct.calcsize(srec), struct.calcsize(vrec)
    iraw = (d / "paint_index.bin").read_bytes()
    vraw = bytearray((d / "paint_strokes.bin").read_bytes())
    strokes = [struct.unpack_from(srec, iraw, i * ssz) for i in range(len(iraw) // ssz)]

    first_of = {}
    for s in strokes:
        first_of.setdefault((s[2], s[4]), s)
    canvas0 = strokes[0][2]
    bodies = sorted(k[1] for k in first_of if k[0] == canvas0 and first_of[k][3] == 0)
    src, dst = first_of[(canvas0, bodies[0])], first_of[(canvas0, bodies[1])]
    n = min(src[1], dst[1])
    for k in range(n):
        vraw[(dst[0] + k) * vsz:(dst[0] + k + 1) * vsz] = \
            vraw[(src[0] + k) * vsz:(src[0] + k + 1) * vsz]
    (d / "paint_strokes.bin").write_bytes(bytes(vraw))


def m_b_shipped_min(d):
    """B: a shipped canvas whose two closest bodies sat inside the rule.

    The byte gate works at the storage quantum, because simplification moves
    the drawn line; this is the rule at the precision it was measured at.
    """
    p = _load(d, "paint.json")
    p["coincidence_ft"]["shipped_min"] = 0.0
    _save(d, "paint.json", p)


def m_c1_terminus(d):
    """C1: the paint stops three weeks short of the window's closure."""
    p = _load(d, "paint.json")
    p["date_last"] = "2016-01-03"
    _save(d, "paint.json", p)


def m_memory_figure(d):
    """A quantitative claim in CLAUDE.md drifting from its own artifact.

    Exactly what happened to `recovery.attribution_agreement`, which was written
    into the file as 0.8536 while window.json said 0.8573 - inside one session,
    with nothing able to see it.
    """
    p = d / "CLAUDE.md"
    p.write_text(p.read_text().replace("`recovery.rate` **0.4545**",
                                       "`recovery.rate` **0.5545**", 1))


def m_memory_missing(d):
    """A gated sentence reworded out of the file rather than corrected."""
    p = d / "CLAUDE.md"
    p.write_text(p.read_text().replace("Median **4.82 ft** apart",
                                       "Median a few feet apart", 1))


def m_allowlist_extra(d):
    """A private artifact quietly added to the list the deploy reads.

    F-07 in one line: publishing by editing a file instead of by deciding.
    """
    p = d / "pipeline" / "deploy_allowlist.json"
    a = json.loads(p.read_text())
    a["public"] = sorted(a["public"] + ["acquisition_manifest.json"])
    p.write_text(json.dumps(a, indent=2) + "\n")


def m_allowlist_drop(d):
    """An artifact the piece fetches, dropped from the list the deploy reads."""
    p = d / "pipeline" / "deploy_allowlist.json"
    a = json.loads(p.read_text())
    a["public"] = [f for f in a["public"] if f != "facts.json"]
    p.write_text(json.dumps(a, indent=2) + "\n")


CASES = [
    # --- the three deletions the audit proved survive -------------------------
    Case("delete-window", ["inventory"], "every required artifact is present",
         _delete("window.json"),
         "(audit) the whole window stage could be deleted and the gate stayed green"),
    Case("delete-measures", ["inventory"], "every required artifact is present",
         _delete("window_measures.bin"), "(audit) same, for the caliper binary"),
    Case("delete-paint", ["inventory"], "every required artifact is present",
         _delete("paint.json"), "(audit) same, for the paint"),
    Case("delete-strokes", ["inventory"], "every required artifact is present",
         _delete("paint_strokes.bin"), "(audit) same, for the stroke vertices"),
    Case("delete-index", ["inventory"], "every required artifact is present",
         _delete("paint_index.bin"), "(audit) same, for the stroke index"),
    Case("delete-traces", ["inventory"], "every required artifact is present",
         _delete("traces.json"), "(audit) traces.json appeared nowhere in the gate"),

    # --- zeroed, randomised, truncated ---------------------------------------
    Case("zero-measures", ["window"], "the published attempt counts are the ones in the file",
         m_zero_measures, "(audit) equal-length zeros satisfied a size check exactly"),
    Case("zero-strokes", ["paint"], "the painted seconds are the frames the file actually carries",
         m_zero_strokes, "(audit) the stroke bytes were never opened"),
    Case("zero-index", ["paint"], "the canvas ids are a dense range",
         m_zero_index, "(audit) the index was validated by byte length"),
    Case("zero-points", ["shot_artifacts"], "samples/grids/points consistent with seasons.json",
         m_zero_points, "already caught before this session; kept as a regression"),

    # --- the filing (V-05): places are load-bearing geometry now --------------
    Case("filing-drop", ["filing"],
         "every category the tally counts has a place, and no place has no category",
         m_filing_drop, "a category with no place is a word the census silently does not strike"),
    Case("filing-zero", ["filing"], "every zone's mean distance sits inside its own zone",
         m_filing_zero, "a zero-filled artifact strikes every word on the hoop"),
    Case("filing-mirror", ["filing"],
         "every category naming a side of the floor has its mean on that side",
         m_filing_mirror,
         "a sign error in the circular mean puts LEFT CORNER 3 in the right corner, "
         "and the picture still looks plausible"),
    Case("filing-count", ["filing"], "the filing and the tally count the same shots",
         m_filing_count, "the two keys one word is drawn from drift apart"),
    Case("filing-backcourt", ["filing"],
         "the three backcourt categories land beyond the plate in every season",
         m_filing_backcourt,
         "the plate would claim to hold ground the record puts beyond it"),
    Case("covering-90-split", ["filing"],
         "the ledger's label budget is the census's DESCRIPTION budget",
         m_covering_90_split, "two hands stop reading one measurement"),
    Case("random-measures", ["window"], "every filed bucket is one of the published categories",
         m_random_measures, "structure destroyed, length preserved"),
    Case("random-strokes", ["paint"], "no stroke spans more frames than the possession it was cut from",
         m_random_strokes, "structure destroyed, length preserved"),
    Case("random-index", ["paint"], "the stroke index partitions the vertex array",
         m_random_index, "structure destroyed, length preserved"),
    Case("random-points", ["shot_artifacts"], "samples/grids/points consistent with seasons.json",
         m_random_points, "structure destroyed, length preserved"),
    Case("truncate-measures", ["window"], "measures.bin holds every measured shot",
         m_truncate_measures, "one record short of what the artifact declares"),
    Case("truncate-strokes", ["paint"], "the vertex array ends exactly where the last stroke does",
         m_truncate_strokes, "one vertex short: the index no longer partitions"),
    Case("truncate-index", ["paint"], "index covers every stroke",
         m_truncate_index, "one stroke short of the declared count"),
    Case("truncate-points", ["shot_artifacts"], "samples/grids/points consistent with seasons.json",
         m_truncate_points, "one cell short of the declared count"),

    # --- values that were never compared against anything --------------------
    Case("approach-999", ["window"], "every approach sample is a distance this floor can hold",
         m_approach_999, "(audit) the check asked for length, not for meaning"),
    Case("bucket-bounds", ["window"],
         "every record's category follows from its own distance and the published bounds",
         m_bucket_bounds, "(audit) nothing reclassified a record from its own distance"),
    Case("bias-zero", ["window"], "the gap is the difference between the two figures beside it",
         m_bias_zero, "(audit) the bias could be declared absent, which it cannot be"),
    Case("overlap-strokes", ["paint"], "the stroke index partitions the vertex array",
         m_overlap_strokes, "two strokes sharing vertices, same file length"),
    Case("hero-jump", ["window"], "no hero's bound shooter makes a step no body could make",
         m_hero_jump, "F-09: a 20 ft step inside one 40 ms frame"),
    Case("season-share", ["spine"], "2015-16 mid-range share",
         m_season_share, "the ground truth moved by a thousandth"),
    Case("zone-byte", ["shot_artifacts"],
         "every points cell's league label is its own region or a boundary of it",
         m_zone_byte, "Rule 4: a colour that is no longer a measurement"),
    Case("unknown-file", ["inventory"], "no unknown file has appeared under data/processed/",
         m_unknown_file, "the hook session 3's deploy allowlist hangs off"),

    # --- the defects session 1b closed, kept as regressions ------------------
    Case("paint-residual", ["paint"],
         "no canvas ships an anchor residual over the corroboration threshold",
         m_paint_residual, "D4: a file checked against itself"),
    Case("chord", ["paint"], "no drawn segment exceeds the arc measured for it",
         m_chord, "D5: nothing had ever opened paint_strokes.bin"),

    # --- new invariants this session adds ------------------------------------
    Case("measures-count", ["window"], "measures.bin holds the record count it declares",
         m_measures_count, "the declared count and the file's contents parting company"),
    Case("clip", ["window"], "every caliper is the distance between its own endpoints",
         m_clip, "F-05: the one-byte clip, put back"),
    Case("ceiling", ["window"], "no caliper is filed at the encoding's ceiling",
         m_ceiling, "a caliper the encoding could not say"),
    Case("caliper-p99", ["window"], "every published caliper percentile is the one in the file",
         m_caliper_p99, "the reference a mark's radius is measured against, detached"),
    Case("bias-disclosure", ["window"],
         "the disclosure the piece draws is composed of the figures beside it",
         m_bias_disclosure, "F-12: wall text drifting from its own measurement"),
    Case("trace-anchor", ["traces"], "every trace's release point is the residual it reports",
         m_trace_anchor, "a gesture drawn at a dot it does not belong to"),
    Case("occupancy-share", ["window"], "every band's share is its own count",
         m_occupancy_share, "a published share detached from the count beneath it"),
    Case("stale-reader", ["inventory"], "the site decodes the records the pipeline writes",
         m_paint_stale_reader, "a renderer reading a byte layout the pipeline stopped writing"),
    Case("day-offset-drift", ["paint"],
         "every day offset is its own date's distance from the first",
         m_day_offset_drift, "the calendar a hand paces on, detached from its own dates"),
    Case("day-past-calendar", ["paint"], "every stroke's day names a day the calendar has",
         m_day_past_calendar, "a day index past the end of the calendar it indexes"),

    # --- the four unfailable gates session 1b replaced -----------------------
    # These arrived in break_gates.py, which is where they were first shown to
    # go red. They live here now so the fast in-process suite covers them too,
    # and break_gates runs the same list end to end through a real subprocess.
    Case("D1-votes", ["window"], "no accepted shift falls below the minimum vote count",
         m_d1_votes, "D1: a hard tautology - a count >= 0 and an all() over nothing"),
    Case("D1-lift", ["window"],
         "every accepted shift clears the straight join by the declared factor",
         m_d1_lift, "D1: an accepted shift with no lift over the straight join"),
    Case("D2-boundary", ["window"],
         "no game's argmax was refused for landing on the search boundary",
         m_d2_boundary, "D2: a count that is zero by construction stood in for the real one"),
    Case("D3-heldout", ["window"], "the held-out split is drawn from most of the corpus",
         m_d3_heldout, "D3: 'the figure exists' passed with one game agreeing 0.0001"),
    Case("D3-aggregate", ["window"], "the held-out aggregate is the split it summarises",
         m_d3_aggregate, "D3: the headline moved without the evidence moving"),
    Case("A1-searched", ["window"], "every game's offset was decided on the full release set",
         m_a1_searched, "A1: 445 games decided on a vector where zero could not lose"),
    Case("B-coincident", ["paint"], "no canvas draws two bodies inside one coordinate quantum",
         m_b_coincident, "Rule 7: one detection painted twice, perfectly continuous"),
    Case("B-shipped-min", ["paint"],
         "no shipped canvas holds two bodies closer than the rule allows",
         m_b_shipped_min, "Rule 7 at the precision it was measured at"),
    Case("C1-terminus", ["paint"], "the paint reaches the window's opening and its closure",
         m_c1_terminus, "C1: THE HAND stopping three weeks short of what it is about"),

    # --- session 3's gates, which read outside data/processed/ --------------
    Case("memory-figure", ["memory"], "every gated memory claim is what the artifact says",
         m_memory_figure, "F-16: a figure in CLAUDE.md drifting from its own artifact",
         scope="repo"),
    Case("memory-missing", ["memory"], "every gated memory claim is what the artifact says",
         m_memory_missing, "F-16: a gated claim reworded away instead of corrected",
         scope="repo"),
    Case("allowlist-extra", ["deploy"], "the allowlist the site reads is the table the gate holds",
         m_allowlist_extra, "F-07: publishing by editing a file instead of by deciding",
         scope="repo"),
    Case("allowlist-drop", ["deploy"], "the allowlist the site reads is the table the gate holds",
         m_allowlist_drop, "F-07: an artifact the piece fetches, silently unpublished",
         scope="repo"),
]

BY_NAME = {c.name: c for c in CASES}


def run_mutations(processed=PROCESSED_DIR, only=None, quiet=False):
    """Apply each mutation to a copy and require its own check to go red.

    Returns True when every case is caught by the check that owns it.
    """
    from qa import run_groups  # noqa: PLC0415

    cases = [BY_NAME[only]] if only else CASES
    print(f"\nMutations: {len(cases)} defects, each against the check that owns it")
    results = []
    with tempfile.TemporaryDirectory() as tmp:
        pristine = Path(tmp) / "pristine"
        shutil.copytree(processed, pristine)
        root = Path(tmp) / "work"

        # A repo-shaped root, not a bare processed directory: the `memory` and
        # `deploy` groups read CLAUDE.md, pipeline/deploy_allowlist.json and one
        # site source file, and a gate that cannot be aimed at a copy cannot be
        # mutation-tested at all.
        def stage():
            shutil.rmtree(root, ignore_errors=True)
            (root / "data").mkdir(parents=True)
            shutil.copytree(pristine, root / "data" / "processed")
            (root / "pipeline").mkdir(exist_ok=True)
            for rel in ("CLAUDE.md", "pipeline/deploy_allowlist.json",
                        "site/src/inscription.ts"):
                src = REPO_ROOT / rel
                if src.exists():
                    dst = root / rel
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(src, dst)

        for c in cases:
            stage()
            work = root / "data" / "processed"
            c.mutate(root if c.scope == "repo" else work)
            g = run_groups(c.groups, work, allow_raw=False, quiet=True, repo=root)
            named = any(c.catches in n for n in g.names())
            caught = bool(g.failures) and named
            results.append((c, caught, g))
            flag = "RED (good)" if caught else \
                   ("WRONG CHECK" if g.failures else "STILL GREEN")
            print(f"  {flag:<12} {c.name:<18} -> {c.catches!r}")
            if not caught and not quiet:
                print(f"       instead: {g.names()[:4] or 'nothing failed'}")

    bad = [c.name for c, ok, _ in results if not ok]
    print(f"  {len(results) - len(bad)}/{len(results)} defects are caught by their own check")
    if bad:
        print(f"  MUTATIONS SURVIVED: {', '.join(bad)}")
    return not bad


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--case", choices=sorted(BY_NAME))
    ap.add_argument("--processed", default=str(PROCESSED_DIR))
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()
    require_env()
    if args.list:
        for c in CASES:
            print(f"{c.name:<18} [{','.join(c.groups)}] {c.why}")
            print(f"{'':<18} -> {c.catches}")
        return
    sys.exit(0 if run_mutations(Path(args.processed), only=args.case) else 1)


if __name__ == "__main__":
    main()
