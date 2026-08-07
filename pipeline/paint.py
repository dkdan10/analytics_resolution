#!/usr/bin/env python3
"""Stage 5 - the paint: brush strokes from the bodies the record could not keep.

For twenty-nine of the piece's thirty seasons a shot is a point and there is
nothing between the points. For eleven weeks the optical feed held the motion
too, and this stage lifts a sample of it into strokes.

A stroke is one body over the five seconds before one verified shot. Not a
particle, not a flow field, not a simulation: every vertex is a position the
machine recorded, and the whole stroke is traceable back to one release the
window stage already corroborated against the coordinate the record filed
independently. That is the condition CLAUDE.md sets for this hand existing at
all - "survives only if every stroke stays one traceable record".

THE SHOT IS TAKEN, NOT FOUND. This stage does not go looking for a possession.
It reads the corroborated set the window stage wrote for that game - the shots
whose release, transformed into the record's own frame, landed within
MAX_ANCHOR_RESIDUAL_FT of where a courtside scorer independently filed them -
and paints one of those. A canvas with no such shot is not painted at all. The
previous version accepted an event offset it never used and took the first
event of the game that yielded a plausible rim flight, which meant the claim
this docstring makes was, for most canvases, simply false.

TWO THINGS ARE MEASURED PER VERTEX, and they are what make the paint honest:

  arc   the distance the body actually covered since the last vertex
  dt    how long that took

Both are accumulated from the FULL 25 Hz path before simplification, so speed =
arc/dt stays the true measured mean over the span no matter how few control
points survive. Simplification moves the drawn line by at most a tenth of a
foot and moves the paint by nothing at all.

THAT ONLY HOLDS OVER A CONTINUOUS PATH, so a path is CUT at every
discontinuity rather than stitched across one. Where the feed skips or swaps an
identity, the old code skipped the step in the arc and kept the vertex on the
far side of it - excluding the jump from the measurement and retaining it in
the geometry, which drew a thirty-foot line and told the renderer the body had
crept along it. Now each continuous run becomes its own stroke of the same
body, so `arc >= chord` holds by construction on every segment that ships.

WHAT SHIPS carries no identity: no player, no game, no event, no clock. Control
points in the plate's own folded halfcourt frame, a day index, a canvas index,
a body slot within that canvas, and the two measurements above. A game, a
player, or a possession's timing cannot be reconstructed from it (CLAUDE.md
data rights; plan section 1.7). The join that produced each canvas IS kept, in
full, under data/window/ - which is gitignored and never leaves this machine.

Writes data/processed/paint_strokes.bin, paint_index.bin and paint.json.

Usage: python3 pipeline/paint.py [--games N] [--jobs N] [--reduce]
"""

import argparse
import datetime
import json
import math
import struct
import sys
from collections import Counter
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    HZ,
    PROCESSED_DIR,
    PROVENANCE,
    ZONE_NAMES,
    die,
    read_7z_bytes,
    require_env,
    write_json,
    zone_at,
)
from window import (  # noqa: E402
    FRAME_GAP_FACTOR,
    GAMES_DIR,
    HALFCOURT_X_TENTHS,
    HALFCOURT_Y_TENTHS,
    MAX_ANCHOR_RESIDUAL_FT,
    SPORTVU_DIR,
    WINDOW_DIR,
    corpus_entries,
    event_frames,
    find_release,
    to_shot_frame,
    usable_archives,
)

PAINT_DIR = WINDOW_DIR / "paint"
PROVENANCE_PATH = WINDOW_DIR / "paint_provenance.json"

# --- authored: a span, a selection rule, and a floor -------------------------
# Three things are chosen in this file and nothing else is. Each is named here,
# shipped in paint.json's `definitions`, and reported under a second defensible
# value so the choice can be argued with rather than taken.

# How much of the body's path to paint. Five seconds is the same span the piece
# already treats as one gesture (bloom.py gathers 2.2 s of ball; the caliper's
# approach runs 2.0 s). Longer runs the stroke off the plate; shorter stops it
# reading as a gesture.
STROKE_SECONDS = 5.0

# WHICH corroborated shot of the game gets painted. The window stage may have
# corroborated a hundred; exactly one canvas per game ships. Tightest
# corroboration first, ties broken by ascending tracking event id - so the rule
# is the same one the heroes are chosen by, it is deterministic, and it is not
# an aesthetic preference.
SELECTION = "smallest anchor residual, ties by ascending tracking event id"

# Douglas-Peucker tolerance. A tenth of a foot is the record's own coordinate
# quantum, so simplifying to it discards nothing the record could resolve.
SIMPLIFY_FT = 0.15

# The shortest continuous run that is still a gesture. Chosen from the measured
# run-length distribution, which is sharply bimodal: after cutting at
# discontinuities the runs are either substantial or fragments, with an empty
# band between the two populations, and this sits inside that band. paint.json
# ships the whole distribution under `run_length_frames` and the stroke count
# under the alternate floor, which is the bare geometric minimum - the fewest
# points at which the simplifier has an interior vertex to consider at all.
MIN_RUN_FRAMES = 25
MIN_RUN_FRAMES_ALT = 3

# A vertex may not span more than this, or `arc` and `dt` stop describing a
# single continuous movement. After splitting, a run cannot exceed the frames of
# one span anyway, so this is a continuity guard and no longer a storage cap.
MAX_VERTEX_FRAMES = 250

# A body cannot move this far in 40 ms; beyond it the feed has skipped or
# swapped an identity. This is where a path is CUT.
MAX_STEP_FT = 3.0

# --- what ships --------------------------------------------------------------
# One control point. No identity, no clock.
VERTEX_REC = "<hhHH"      # x, y (tenths, hoop at origin); dt frames; arc tenths
VERTEX_BYTES = 8
ARC_TENTHS_MAX = 0xFFFF

# One stroke. `kind` is 0 for a body and 1 for the ball - the ball is the only
# row the machine gave a third dimension, so it is the only thing that can be
# lit. `canvas` and `body` are load-bearing: after a path is cut at its
# discontinuities, one body's five seconds can be several strokes, so a consumer
# needs to know which runs belong to the same body of the same possession.
STROKE_REC = "<IHHBBB"    # first vertex, count, canvas, kind, body slot, day
STROKE_BYTES = 11
BALL_SLOT = 10
FORMAT_VERSION = 2


def rdp(pts, eps):
    """Douglas-Peucker, iterative - a 125-point path recurses deeper than is
    comfortable and this runs thousands of times."""
    n = len(pts)
    if n < 3:
        return list(range(n))
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        a, b = stack.pop()
        if b - a < 2:
            continue
        x0, y0 = pts[a]
        x1, y1 = pts[b]
        dx, dy = x1 - x0, y1 - y0
        L = math.hypot(dx, dy) or 1e-9
        best, bi = -1.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            d = abs(dy * px - dx * py + x1 * y0 - y1 * x0) / L
            if d > best:
                best, bi = d, i
        if best > eps and bi > 0:
            keep[bi] = True
            stack.append((a, bi))
            stack.append((bi, b))
    return [i for i, k in enumerate(keep) if k]


def runs_of(path, breaks):
    """[(i0, i1)] - the maximal stretches of a path with nothing skipped inside.

    A cut at every step a body could not have taken in one frame, and at every
    frame where the feed itself broke. What comes back are index ranges over
    which arc is a sum along the real path, which is the only condition under
    which `arc` describes the drawn line at all.
    """
    out = []
    start = 0
    for m in range(1, len(path)):
        jumped = math.hypot(path[m][0] - path[m - 1][0],
                            path[m][1] - path[m - 1][1]) > MAX_STEP_FT * 10
        if m in breaks or jumped:
            out.append((start, m - 1))
            start = m
    out.append((start, len(path) - 1))
    return out


def stroke_from(path, eps_tenths):
    """A continuous full-rate run -> control points carrying arc, duration, zone.

    Arc is summed over EVERY measured step between two kept vertices, never over
    the chord. The caller guarantees the run is continuous, so that sum is a sum
    along the path the body took and `arc >= chord` holds up to rounding.

    Two things force a vertex to survive simplification: Douglas-Peucker, and a
    change in which of the league's seven regions the body is standing in. The
    second is what makes the colour exact rather than nearly right - a simplified
    segment can no longer span two zones, so the zone read at a vertex is the
    zone of the whole span that ends there.

    Returns (vertices, {zone: frames}, forced) or None.
    """
    if len(path) < 3:
        return None
    zones = [zone_at(x, y) for x, y in path]
    keep = set(rdp(path, eps_tenths))
    forced = 0
    for m in range(1, len(path)):
        if zones[m] != zones[m - 1]:
            # BOTH sides of the crossing. Keeping only the first frame of the
            # new region is not enough: the span ending there still holds every
            # frame of the old one, and attributing that span to its endpoint
            # then files the approach to a line under the region beyond it.
            for c in (m - 1, m):
                if c not in keep:
                    keep.add(c)
                    forced += 1
    idx = sorted(keep)
    if len(idx) < 2:
        return None

    out = []
    zone_frames = Counter()
    quantized_frames = 0
    for k, i in enumerate(idx):
        x, y = path[i]
        if k == 0:
            # The first vertex opens the stroke and spans nothing. dt = 0 means
            # "no span", and a consumer deriving speed must skip it.
            out.append((x, y, 0, 0))
            continue
        j = idx[k - 1]
        arc = 0.0
        for m in range(j + 1, i + 1):
            arc += math.hypot(path[m][0] - path[m - 1][0], path[m][1] - path[m - 1][1])
            # Ink is deposited per unit TIME, so a zone's share of the paint is
            # its share of the FRAMES, counted where the body actually was in
            # each of them - not where the surviving control point ended up.
            zone_frames[zones[m]] += 1
        dt = i - j
        if dt > MAX_VERTEX_FRAMES:
            return None
        a = int(round(arc))
        if a >= ARC_TENTHS_MAX:
            # Unreachable at 3 ft/frame over one span, and an assertion rather
            # than a clip: a clipped arc is a measurement quietly replaced by a
            # ceiling, which is what the u8 field used to do twenty-four times.
            raise RuntimeError(f"arc {a} would clip the storage field")
        # A vertex ships as whole tenths. Within a tenth of one of the league's
        # boundaries that rounding can move a mark across it, so the colour a
        # consumer reads at the vertex is not always the region the body was
        # measured in. It is a small, bounded quantity and it is counted rather
        # than smoothed away.
        if zone_at(int(round(x)), int(round(y))) != zones[i]:
            quantized_frames += dt
        out.append((x, y, dt, a))
    return out, dict(zone_frames), forced, quantized_frames


def paint_game(archive_name, day_index, window_path):
    """One CORROBORATED possession from one game: ten bodies and the ball."""
    wg = json.loads(Path(window_path).read_text())
    corroborated = wg.get("corroborated") or []
    if not corroborated:
        return None
    gap_max_ms = wg.get("gap_max_ms") or FRAME_GAP_FACTOR * (1000 // HZ)

    game = json.loads(read_7z_bytes(SPORTVU_DIR / archive_name))
    by_event = {}
    for ev in game["events"]:
        try:
            by_event[int(ev["eventId"])] = ev
        except (KeyError, ValueError, TypeError):
            continue

    want = int(STROKE_SECONDS * HZ)
    for c in sorted(corroborated, key=lambda c: (c["residual"], c["event_id"])):
        if c["residual"] > MAX_ANCHOR_RESIDUAL_FT:
            continue
        ev = by_event.get(c["event_id"])
        if ev is None:
            continue
        efr = event_frames(ev)
        found = find_release(efr)
        if not found:
            continue
        release_i, _arrive_i, hoop_x = found
        # The window stage's verdict has to reproduce here exactly, or this is
        # not the shot it corroborated and the join would be a claim about a
        # different instant.
        if release_i != c["release_frame"] or hoop_x != c["hoop_x"]:
            continue
        lo = release_i - want
        if lo < 0:
            continue
        seg = efr[lo:release_i + 1]

        breaks = {
            m for m in range(1, len(seg))
            if seg[m][0] != seg[m - 1][0] or seg[m][1] - seg[m - 1][1] > gap_max_ms
        }

        # Every body present for the whole span, plus the ball.
        paths = {}
        ball = []
        ok = True
        for fm in seg:
            if fm[3] is None:
                ok = False
                break
            ball.append(to_shot_frame(fm[3][2], fm[3][3], hoop_x))
            for r in fm[4]:
                paths.setdefault(r[1], []).append(to_shot_frame(r[2], r[3], hoop_x))
        if not ok:
            continue
        full = [p for p in paths.values() if len(p) == len(seg)]
        if len(full) < 10:
            continue

        strokes = []
        run_lengths = Counter()
        forced_total = quantized_total = 0
        for slot, p in enumerate(list(full[:10]) + [ball]):
            kind = 1 if slot == 10 else 0
            body = BALL_SLOT if kind else slot
            for i0, i1 in runs_of(p, breaks):
                run_lengths[i1 - i0 + 1] += 1
                if i1 - i0 + 1 < MIN_RUN_FRAMES:
                    continue
                s = stroke_from(p[i0:i1 + 1], SIMPLIFY_FT * 10)
                if not s:
                    continue
                verts, zone_frames, forced, quantized = s
                forced_total += forced
                quantized_total += quantized
                strokes.append({"kind": kind, "body": body, "v": verts,
                                "zones": {str(z): n for z, n in sorted(zone_frames.items())}})
        if len({s["body"] for s in strokes}) < 8:
            continue

        return {
            "archive": archive_name,
            "game_id": wg["game_id"],
            "date": wg["date"],
            "day": day_index,
            "event_id": c["event_id"],
            "event_offset": wg.get("event_offset", 0),
            "anchor_event_id": c["anchor_event_id"],
            "residual": c["residual"],
            "release_frame": release_i,
            "seconds": STROKE_SECONDS,
            "strokes": strokes,
            "run_lengths": {str(k): v for k, v in sorted(run_lengths.items())},
            "forced_zone_vertices": forced_total,
            "zone_quantized_frames": quantized_total,
        }
    return None


def _run_one(spec):
    name, day, window_path, out_path = spec
    try:
        rec = paint_game(name, day, window_path)
        if rec is None:
            return name, 0, "no corroborated shot with a complete span"
        write_json(Path(out_path), rec, compact=True)
        return name, len(rec["strokes"]), None
    except Exception as e:  # noqa: BLE001 - one bad archive costs one canvas
        return name, 0, f"{type(e).__name__}: {e}"


def pick_games(n):
    """A deterministic spread across the eleven weeks, over games the window
    stage actually corroborated a shot in."""
    archives = usable_archives(corpus_entries())
    if not archives:
        die("no usable archives - run pipeline/window.py first")
    days = sorted({a["date"] for a in archives})
    day_index = {d: i for i, d in enumerate(days)}

    have = []
    for a in archives:
        wp = GAMES_DIR / f"{Path(a['name']).stem}.json"
        if wp.exists():
            have.append((a, wp))
    if not have:
        die(f"no per-game window artifacts in {GAMES_DIR} - run pipeline/window.py first")

    # Even stride over the calendar-ordered corpus rather than a random draw:
    # the canvas should be the window, not one week of it.
    step = max(1, len(have) // n)
    picked = [have[i * step] for i in range(min(n, len(have)))]
    return [(a["name"], day_index[a["date"]], str(wp)) for a, wp in picked]


def reduce_all():
    """Fold the per-game canvases into the shipped artifacts and the manifest."""
    paths = sorted(PAINT_DIR.glob("*.json"))
    if not paths:
        die(f"no canvases in {PAINT_DIR} - run the paint stage first")

    verts = bytearray()
    index = bytearray()
    n_vertices = n_strokes = 0
    zone_ink = Counter()
    run_lengths = Counter()
    speeds = []
    outside = 0
    forced = 0
    quantized = 0
    days = set()
    residuals = []
    bodies_per_canvas = []
    strokes_per_canvas = []
    manifest = []

    for canvas, p in enumerate(paths):
        g = json.loads(p.read_text())
        days.add(g["day"])
        residuals.append(g["residual"])
        forced += g.get("forced_zone_vertices", 0)
        quantized += g.get("zone_quantized_frames", 0)
        for k, v in g.get("run_lengths", {}).items():
            run_lengths[int(k)] += v
        bodies_per_canvas.append(len({s["body"] for s in g["strokes"]}))
        strokes_per_canvas.append(len(g["strokes"]))
        manifest.append({
            "canvas": canvas,
            "archive": g["archive"],
            "game_id": g["game_id"],
            "date": g["date"],
            "day": g["day"],
            "tracking_event_id": g["event_id"],
            "event_offset": g["event_offset"],
            "anchor_event_id": g["anchor_event_id"],
            "residual_ft": g["residual"],
            "release_frame": g["release_frame"],
            "strokes": len(g["strokes"]),
        })

        for s in g["strokes"]:
            first = n_vertices
            for x, y, dt, arc in s["v"]:
                if abs(x) > HALFCOURT_X_TENTHS or not (-50 <= y <= HALFCOURT_Y_TENTHS):
                    outside += 1
                if arc >= ARC_TENTHS_MAX:
                    die(f"arc {arc} clips the storage field in {p.name}")
                verts += struct.pack(
                    VERTEX_REC,
                    max(-32768, min(32767, int(round(x)))),
                    max(-32768, min(32767, int(round(y)))),
                    dt, arc,
                )
                n_vertices += 1
                if dt:
                    speeds.append((arc / 10.0) / (dt / HZ))
            index += struct.pack(STROKE_REC, first, n_vertices - first, canvas,
                                 s["kind"], s["body"], g["day"])
            n_strokes += 1
            for z, n in s["zones"].items():
                zone_ink[int(z)] += n

    if residuals and max(residuals) > MAX_ANCHOR_RESIDUAL_FT:
        die(f"a canvas ships an anchor residual of {max(residuals)} ft")

    (PROCESSED_DIR / "paint_strokes.bin").write_bytes(bytes(verts))
    (PROCESSED_DIR / "paint_index.bin").write_bytes(bytes(index))

    # The join, in full, kept OFF the public side. Everything in data/processed/
    # is copied wholesale into the build, and this carries game and event
    # identity; data/window/ is gitignored and stays on this machine. It is what
    # makes every shipped stroke group traceable back to the record it came from.
    write_json(PROVENANCE_PATH, {
        "generated_by": "pipeline/paint.py",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "note": (
            "PRIVATE. One row per canvas, in the same order the shipped stroke index refers to "
            "them by its `canvas` field. Never commit this file or copy it into data/processed/"
        ),
        "residual_threshold_ft": MAX_ANCHOR_RESIDUAL_FT,
        "selection_rule": SELECTION,
        "canvases": manifest,
    })

    speeds.sort()

    def pctl(q):
        return round(speeds[min(len(speeds) - 1, int(len(speeds) * q))], 2) if speeds else None

    def rpct(q):
        v = sorted(residuals)
        return round(v[min(len(v) - 1, int(len(v) * q))], 2) if v else None

    ink_total = sum(zone_ink.values()) or 1
    strokes_alt = sum(v for k, v in run_lengths.items() if k >= max(MIN_RUN_FRAMES_ALT, 3))
    out = {
        "generated_by": "pipeline/paint.py",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "format_version": FORMAT_VERSION,
        "provenance": PROVENANCE,
        "definitions": {
            "_authored": (
                f"Three things are chosen in this stage. A span length ({STROKE_SECONDS} s); a "
                f"rule for WHICH corroborated shot of a game is painted ({SELECTION}); and the "
                f"shortest run still counted as a gesture ({MIN_RUN_FRAMES} frames). Every other "
                "property of a stroke is read off the record."
            ),
            "corroboration": (
                "every canvas is one shot the window stage checked against the record: its "
                "release, transformed into the shot record's own frame, landed within "
                f"{MAX_ANCHOR_RESIDUAL_FT} ft of the coordinate a courtside scorer filed "
                "independently, at that game's calibrated event numbering. A game with no such "
                "shot is not painted. The full join for every canvas - archive, tracking event, "
                "offset, anchor, residual, release frame - is retained privately under "
                "data/window/, which is gitignored, so nothing identifying ships and nothing is "
                "unverifiable"
            ),
            "stroke": (
                f"one CONTINUOUS run of one body's measured path over the {STROKE_SECONDS} s "
                "before one corroborated release, in the shot record's own frame (tenths of a "
                "foot, hoop at origin). A path is cut wherever the feed broke or the body moved "
                f"further than {MAX_STEP_FT} ft in one frame, and each run is its own stroke of "
                "the same body, so no drawn segment ever crosses a discarded discontinuity"
            ),
            "vertex": (
                f"a control point kept by Douglas-Peucker at {SIMPLIFY_FT} ft, or forced by a "
                "change of zone, carrying `dt` (frames since the previous vertex) and `arc` "
                "(tenths of a foot the body actually covered over that span, summed at the full "
                "25 Hz before simplification). Speed is arc/dt and is therefore the true measured "
                "mean over the span, unaffected by how few control points survive. The first "
                "vertex of a stroke carries dt = 0 and arc = 0: it opens the stroke and spans "
                "nothing, and a consumer deriving speed must skip it"
            ),
            "simplify_ft": (
                f"two things force a vertex to survive: Douglas-Peucker at {SIMPLIFY_FT} ft, and "
                "a change in which of the league's seven regions the body is standing in. The "
                "second means no simplified segment spans two zones, so the zone read at a vertex "
                "is the zone of the whole span ending there rather than an approximation of it"
            ),
            "zone": (
                "index into the league's own seven SHOT_ZONE_BASIC regions - a partition of the "
                "FLOOR the NBA drew, reconstructed from the geometry the plate draws and gated in "
                "qa.py against the league's own labels at 99.993%. `ink_by_zone` is computed from "
                "EVERY full-rate frame, not from the surviving control points"
            ),
            "kind": "0 = a body, 1 = the ball (the only row the feed gave a third dimension)",
            "body": (
                f"a slot within the canvas, stable across the runs of one body; {BALL_SLOT} is the "
                "ball. After a path is cut at its discontinuities one body can be several strokes, "
                "so this is how a consumer knows which runs are the same body"
            ),
            "identity": (
                "none is shipped. No player, no match, no tracking event, no clock - only a day "
                "index, a canvas index and a body slot. A match, a player, or a possession's "
                "timing cannot be reconstructed from this file"
            ),
        },
        "canvases": len(paths),
        "strokes": n_strokes,
        "strokes_alt_min_run": strokes_alt,
        "vertices": n_vertices,
        "vertices_forced_by_zone": forced,
        # What the tenths-of-a-foot storage costs the colour. `ink_by_zone` is
        # measured from the full-rate positions; a consumer reads the region off
        # the stored vertex, and within a tenth of a boundary those can differ.
        # This is how much of the painted time that affects - measured, bounded
        # and disclosed rather than assumed to be nothing.
        "zone_quantized_frames": quantized,
        "zone_quantized_share": round(quantized / max(1, sum(zone_ink.values())), 5),
        "days_covered": len(days),
        # What was actually painted, not what was available: the frames the
        # shipped strokes span, which is the same total ink_by_zone divides up.
        "seconds_painted": round(sum(zone_ink.values()) / HZ, 1),
        "stroke_seconds": STROKE_SECONDS,
        "simplify_ft": SIMPLIFY_FT,
        "min_run_frames": MIN_RUN_FRAMES,
        "min_run_frames_alt": MIN_RUN_FRAMES_ALT,
        # The distribution the floor was chosen from, so the choice is arguable.
        "run_length_frames": {str(k): v for k, v in sorted(run_lengths.items())},
        "bodies_per_canvas": {
            "min": min(bodies_per_canvas), "max": max(bodies_per_canvas),
            "mean": round(sum(bodies_per_canvas) / len(bodies_per_canvas), 2),
        },
        "strokes_per_canvas": {
            "min": min(strokes_per_canvas), "max": max(strokes_per_canvas),
            "mean": round(sum(strokes_per_canvas) / len(strokes_per_canvas), 2),
        },
        "anchor_residual_ft": {
            "max_allowed": MAX_ANCHOR_RESIDUAL_FT,
            "median": rpct(0.5), "p90": rpct(0.90), "max": round(max(residuals), 2),
        },
        "vertices_outside_plate": outside,
        "speed_ft_s": {
            "p10": pctl(0.10), "p25": pctl(0.25), "p50": pctl(0.50),
            "p75": pctl(0.75), "p90": pctl(0.90), "p99": pctl(0.99),
        },
        # Where the paint goes, against where the record puts shots. Ink is time,
        # so this is the share of painted SECONDS spent in each of the league's
        # regions - the piece's own finding, made visible as colour.
        "ink_by_zone": {
            ZONE_NAMES[z]: round(n / ink_total, 4) for z, n in sorted(zone_ink.items())
        },
        "files": {
            "vertices": {"path": "paint_strokes.bin", "record": VERTEX_REC,
                         "bytes_per_record": VERTEX_BYTES, "records": n_vertices,
                         "bytes": len(verts),
                         "fields": "x, y (tenths, hoop at origin); dt frames; arc tenths"},
            "index": {"path": "paint_index.bin", "record": STROKE_REC,
                      "bytes_per_record": STROKE_BYTES, "records": n_strokes,
                      "bytes": len(index),
                      "fields": "first vertex, count, canvas, kind, body slot, day"},
        },
    }
    write_json(PROCESSED_DIR / "paint.json", out)

    print(f"\nQA: {len(paths)} canvases, {n_strokes:,} strokes, {n_vertices:,} vertices")
    print(f"     {len(verts) / 1024:.0f} KB of paint + {len(index) / 1024:.0f} KB of index")
    print(f"     every canvas joined; residual median {rpct(0.5)} ft, max {max(residuals)} ft "
          f"(threshold {MAX_ANCHOR_RESIDUAL_FT})")
    print(f"     bodies per canvas {out['bodies_per_canvas']}, strokes {out['strokes_per_canvas']}")
    print(f"     {strokes_alt:,} strokes under the alternate run floor "
          f"({MIN_RUN_FRAMES_ALT} frames)")
    print(f"     {forced:,} vertices forced by a zone change; {quantized:,} frames "
          f"({100 * out['zone_quantized_share']:.3f}%) whose stored vertex rounds across "
          f"a region boundary")
    print(f"     speed p10 {pctl(0.10)} p50 {pctl(0.50)} p90 {pctl(0.90)} p99 {pctl(0.99)} ft/s")
    print(f"     {outside} vertices outside the plate box")
    for z, share in out["ink_by_zone"].items():
        print(f"     {z:<22} {100 * share:5.1f}% of painted time")
    print(f"provenance (private) -> {PROVENANCE_PATH}")
    print("paint -> data/processed/paint.json")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--games", type=int, default=250)
    ap.add_argument("--jobs", type=int, default=3,
                    help="parallel games; this stage is memory-bound, see CLAUDE.md")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--reduce", action="store_true",
                    help="fold the per-game canvases into the shipped artifacts and stop")
    args = ap.parse_args()
    require_env()

    if args.reduce:
        reduce_all()
        return

    PAINT_DIR.mkdir(parents=True, exist_ok=True)
    picks = pick_games(args.games)
    print(f"painting {len(picks)} corroborated possessions, one per game, across the window")

    specs = []
    for name, day, window_path in picks:
        out_path = PAINT_DIR / f"{Path(name).stem}.json"
        if out_path.exists() and not args.force:
            continue
        specs.append((name, day, window_path, str(out_path)))
    print(f"  {len(picks) - len(specs)} already done, {len(specs)} to run")

    errors = []
    done = 0
    if specs:
        with ProcessPoolExecutor(max_workers=args.jobs) as pool:
            futures = [pool.submit(_run_one, s) for s in specs]
            for fut in as_completed(futures):
                name, n, err = fut.result()
                done += 1
                if err:
                    errors.append((name, err))
                elif done % 25 == 0 or done == len(specs):
                    print(f"  [{done}/{len(specs)}] {name}: {n} strokes")

    print(f"\nQA: {done} games run, {len(errors)} without a corroborated, complete possession")
    for name, err in errors[:5]:
        print(f"  skipped {name}: {err}")
    print(f"canvases -> {PAINT_DIR}")


if __name__ == "__main__":
    main()
