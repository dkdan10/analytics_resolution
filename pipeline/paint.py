#!/usr/bin/env python3
"""Stage 5 - the paint: brush strokes from the bodies the record could not keep.

For twenty-nine of the piece's thirty seasons a shot is a point and there is
nothing between the points. For eleven weeks the optical feed held the motion
too, and this stage lifts a sample of it into strokes.

A stroke is one body over the five seconds before one verified shot. Not a
particle, not a flow field, not a simulation: every vertex is a position the
machine recorded, and the whole stroke is traceable back to one release the
window stage already corroborated against the coordinate the record filed
independently. That is the condition for this hand existing at all - rule 7
(README, The rules): every stroke stays one traceable record.

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
player, or a possession's timing cannot be reconstructed from it (the paint's
no-identity rule; README, Deploying, and what is public). The join that
produced each canvas IS kept, in full, under data/window/ - which is gitignored
and never leaves this machine.

Writes data/processed/paint_strokes.bin, paint_index.bin and paint.json.

Usage: python3 pipeline/paint.py [--games N] [--jobs N] [--reduce]
"""

import argparse
import datetime
import hashlib
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
# What the current selection chose, written by the paint run and read by the
# reduce. Private, like everything else under data/window/.
SELECTION_PATH = WINDOW_DIR / "paint_selection.json"

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
# corroborated a hundred; exactly one canvas per game ships.
#
# THIS STRING IS THE RULE, not a summary of it. It read "smallest anchor
# residual, ties by ascending tracking event id" and shipped in paint.json and
# in the private provenance under that name, while the loop below also required
# the release to reproduce, the span to fit inside the event, the ball to be
# present throughout, ten bodies to be complete, and eight to survive the run
# floor. Those are a selection on FEED QUALITY - exactly the part that changes
# what a reader would conclude - and 76 of 250 canvases are not their game's
# smallest-residual corroborated shot because of them. `selection_rank` in
# paint.json ships how far down the ordering each canvas actually sat.
SELECTION = (
    "the game's corroborated shots in ascending anchor residual, ties by ascending tracking "
    "event id; the first that also yields a complete canvas is painted. Complete means: the "
    "release frame and hoop re-derive to the ones the window stage corroborated; the whole "
    "span fits inside the event before the release; the ball is present in every frame of it; "
    "at least ten bodies are recorded in every frame of it; no two of those bodies are one "
    "detection reported under two ids; and at least eight distinct bodies survive the run "
    "floor. A game with no such shot is not painted"
)

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

# --- Rule 7: one stroke is one body ------------------------------------------
# The feed sometimes reports ONE detection under TWO player ids. Both paths are
# real rows of the archive and both are perfectly continuous, so nothing that
# looks for jumps can see it - the split above cuts discontinuities and a merged
# track has none. Painting both draws one measurement twice while the index
# calls them two bodies, which is the governing rule of this hand failing:
# "every stroke stays one traceable record". Verified in the raw archives by
# exact coordinate equality between two distinct player ids, on canvas 188 for
# the whole second before the release.
#
# So a canvas holding one is REFUSED, not repaired. Canvases are cheap - there
# are 632 games and 250 are painted - and dropping the duplicate slot would
# leave a possession the piece describes as ten bodies with nine.
#
# The tolerance is not chosen for the look of it, and it is NOT a clean band.
# `coincidence_ft.hist` in paint.json ships the measured distribution of the
# closest SUSTAINED approach between two bodies over every span examined.
# Measured 2026-08-08 over 277 spans: a spike of 17 at EXACTLY 0.0 ft - the feed
# repeating a row, which is the defect itself - then a thin shoulder of 16
# between 0.1 and 0.3 ft, then the rest from 0.4 ft upward. Unlike the run-length
# floor, there is no empty band to sit in. So the tolerance is set ABOVE the
# ambiguous shoulder rather than through it: refusing a canvas costs nothing,
# there are 632 games and 250 are painted, and 0.35 ft refuses all 28. The
# alternate refuses only the spike - the 17 spans that are unarguably one
# detection - and the difference between the two is 11 canvases.
COINCIDENCE_FT = 0.35
COINCIDENCE_FT_ALT = 0.10
COINCIDENCE_SECONDS = 0.5
COINCIDENCE_FRAMES = int(COINCIDENCE_SECONDS * HZ)

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


def sustained_separation(a, b, frames):
    """How close two bodies get and STAY, in feet.

    The per-frame separation, then the smallest maximum over any window of
    `frames` consecutive frames: the distance below which some run that long
    keeps both bodies. Momentary contact in a scrum scores whatever the closest
    instant was and then parts; ONE DETECTION REPORTED TWICE scores exactly 0.0
    for as long as the feed repeats it. Paths are in tenths of a foot.
    """
    n = min(len(a), len(b))
    if n < frames:
        return None
    sep = [math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]) / 10.0 for i in range(n)]
    return min(max(sep[i:i + frames]) for i in range(n - frames + 1))


def closest_sustained(bodies, frames):
    """The tightest sustained approach over every pair, or None."""
    best = None
    for i in range(len(bodies)):
        for j in range(i + 1, len(bodies)):
            s = sustained_separation(bodies[i], bodies[j], frames)
            if s is not None and (best is None or s < best):
                best = s
    return best


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


def stroke_from(path, eps_tenths, split_over=None):
    """A continuous full-rate run -> control points carrying arc, duration, zone.

    Arc is summed over EVERY measured step between two kept vertices, never over
    the chord. The caller guarantees the run is continuous, so that sum is a sum
    along the path the body took and `arc >= chord` holds up to rounding.

    Two things force a vertex to survive simplification: Douglas-Peucker, and a
    change in which of the league's seven regions the body is standing in. The
    second is what makes the colour exact rather than nearly right - a simplified
    segment can no longer span two zones, so the zone read at a vertex is the
    zone of the whole span that ends there.

    `split_over`: with the default None a span longer than
    MAX_VERTEX_FRAMES refuses the whole run - byte-identical to every artifact
    shipped before the kwarg existed. Set to a frame count, an over-long span
    is instead SPLIT at real measured frames of the path itself (a game-length
    stroke may hold a body standing still for minutes, which is a fact about
    the game, not a broken run); arc stays a sum along the measured line
    because every inserted vertex is a frame the feed recorded.

    Returns (vertices, {zone: frames}, forced, quantized_frames) or None.
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
    if split_over is not None:
        widened = []
        for k, i in enumerate(idx):
            if k:
                widened.extend(range(idx[k - 1] + split_over, i, split_over))
            widened.append(i)
        idx = widened

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


def source_digest(window_path):
    """A fingerprint of the corroborated set this canvas can be selected from.

    Stamped into the canvas and re-derived at reduce time, so a canvas produced
    against a superseded window run cannot silently ship beside current ones.
    """
    wg = json.loads(Path(window_path).read_text())
    payload = json.dumps(wg.get("corroborated") or [], sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


def paint_game(archive_name, day_index, window_path):
    """One CORROBORATED possession from one game: ten bodies and the ball.

    Returns (record | None, census). The census counts every span examined and
    every one refused for holding two bodies that are one detection, so the
    refusals are shipped rather than being invisible in a smaller canvas count.
    """
    census = {"spans_examined": 0, "spans_refused_coincident": 0,
              "spans_refused_coincident_alt": 0, "closest_sustained_ft": []}
    wg = json.loads(Path(window_path).read_text())
    corroborated = wg.get("corroborated") or []
    if not corroborated:
        return None, census
    gap_max_ms = wg.get("gap_max_ms") or FRAME_GAP_FACTOR * (1000 // HZ)

    game = json.loads(read_7z_bytes(SPORTVU_DIR / archive_name))
    by_event = {}
    for ev in game["events"]:
        try:
            by_event[int(ev["eventId"])] = ev
        except (KeyError, ValueError, TypeError):
            continue

    want = int(STROKE_SECONDS * HZ)
    ordered = sorted(corroborated, key=lambda c: (c["residual"], c["event_id"]))
    for rank, c in enumerate(ordered):
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

        # RULE 7. Two of these ten may be one detection the feed reported under
        # two ids; that pair is continuous, so only their separation gives them
        # away. Measured over every span examined, refused where it holds.
        bodies = list(full[:10])
        census["spans_examined"] += 1
        closest = closest_sustained(bodies, COINCIDENCE_FRAMES)
        if closest is not None:
            census["closest_sustained_ft"].append(round(closest, 3))
            if closest <= COINCIDENCE_FT_ALT:
                census["spans_refused_coincident_alt"] += 1
            if closest <= COINCIDENCE_FT:
                census["spans_refused_coincident"] += 1
                continue

        strokes = []
        run_lengths = Counter()
        forced_total = quantized_total = 0
        for slot, p in enumerate(bodies + [ball]):
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
            # How far down the residual ordering this canvas actually sat. Zero
            # is the rule as it used to be published; anything above it is the
            # feed-quality clauses doing the selecting.
            "selection_rank": rank,
            "corroborated_available": len(ordered),
            "closest_sustained_ft": round(closest, 3) if closest is not None else None,
            "strokes": strokes,
            "run_lengths": {str(k): v for k, v in sorted(run_lengths.items())},
            "forced_zone_vertices": forced_total,
            "zone_quantized_frames": quantized_total,
            "census": census,
        }, census
    return None, census


def _run_one(spec):
    name, day, window_path, out_path, digest = spec
    try:
        rec, census = paint_game(name, day, window_path)
        if rec is None:
            return name, 0, "no corroborated shot with a complete span", census
        # The window run this canvas was derived from, stamped into the canvas.
        # reduce_all re-derives it and refuses anything that does not match, so
        # an intermediate left over from a superseded run cannot ship.
        rec["source_digest"] = digest
        write_json(Path(out_path), rec, compact=True)
        return name, len(rec["strokes"]), None, census
    except Exception as e:  # noqa: BLE001 - one bad archive costs one canvas
        return name, 0, f"{type(e).__name__}: {e}", None


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
    #
    # `have[i * step]` with an INTEGER step could not do that. At 632 games and
    # 250 canvases the step is 2 and the last index reached is 498 of 631: the
    # painting stopped on 3 January and the last twenty days of the window - up
    # to and including 23 January, the closure the whole act is built toward -
    # were unreachable, along with 131 games that never entered the selection at
    # all. Scaling the index instead spreads the picks across the whole corpus
    # and ends on its last game.
    m = min(n, len(have))
    last = len(have) - 1
    picked = ([have[0]] if m == 1
              else [have[(i * last) // (m - 1)] for i in range(m)])
    return [(a["name"], day_index[a["date"]], str(wp)) for a, wp in picked]


def current_selection():
    """The canvases the CURRENT selection chose, in order, or stop.

    reduce_all used to glob PAINT_DIR and ship whatever was on disk, and the
    paint run skipped canvases that already existed. Nothing stamped a canvas
    with the run that produced it, so a superseded intermediate shipped beside
    current ones and every summary derived from it - including the residual
    maximum qa.py reads - described a canvas the selection had not chosen. In
    one earlier run, two shipped canvases were exactly that.

    So the selection is written out by the paint run and read back here, each
    canvas carries the digest of the corroborated set it was derived from, and
    both must agree with what is on disk now.
    """
    if not SELECTION_PATH.exists():
        die(f"no selection manifest at {SELECTION_PATH} - run pipeline/paint.py first")
    sel = json.loads(SELECTION_PATH.read_text())

    paths, missing, stale = [], [], []
    for row in sel["selection"]:
        p = PAINT_DIR / f"{Path(row['archive']).stem}.json"
        if not p.exists():
            missing.append(row["archive"])       # no complete possession: expected
            continue
        rec = json.loads(p.read_text())
        want = source_digest(GAMES_DIR / f"{Path(row['archive']).stem}.json")
        if rec.get("source_digest") != want or rec.get("archive") != row["archive"]:
            stale.append(row["archive"])
            continue
        paths.append((p, rec))

    if stale:
        die(f"{len(stale)} canvases were derived from a superseded window run "
            f"({', '.join(stale[:4])}...) - re-run pipeline/paint.py --force")
    if not paths:
        die(f"no canvases in {PAINT_DIR} - run the paint stage first")

    on_disk = {p.name for p in PAINT_DIR.glob("*.json")}
    chosen = {p.name for p, _ in paths}
    ignored = sorted(on_disk - chosen)
    if ignored:
        print(f"  ignoring {len(ignored)} canvas file(s) the current selection did not "
              f"choose: {', '.join(ignored[:4])}{'...' if len(ignored) > 4 else ''}")
    return paths, sel, ignored, missing


def reduce_all():
    """Fold the per-game canvases into the shipped artifacts and the manifest."""
    chosen, sel, ignored, missing = current_selection()
    paths = [p for p, _ in chosen]

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
    dates = set()
    # day index -> the date it stands for, collected from the canvases
    # themselves rather than rebuilt from the archive listing, so what ships
    # cannot disagree with what was painted.
    day_dates_by_index = {}
    residuals = []
    bodies_per_canvas = []
    strokes_per_canvas = []
    manifest = []
    ranks = Counter()
    canvas_closest = []

    for canvas, (p, g) in enumerate(chosen):
        days.add(g["day"])
        dates.add(g["date"])
        was = day_dates_by_index.setdefault(g["day"], g["date"])
        if was != g["date"]:
            die(f"day index {g['day']} stands for both {was} and {g['date']}")
        ranks[g.get("selection_rank", 0)] += 1
        if g.get("closest_sustained_ft") is not None:
            canvas_closest.append(g["closest_sustained_ft"])
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
    # A day index is an index, so the mapping must be DENSE from zero or the
    # array that ships cannot be looked up by it. It is dense on this corpus
    # because every one of the 85 game-days carries at least one canvas; a
    # selection that skipped a day would produce a hole, and a hole silently
    # filled with the next date is exactly the class of error this key exists
    # to remove. So refuse instead.
    holes = [i for i in range(max(day_dates_by_index) + 1) if i not in day_dates_by_index]
    if holes:
        die(f"the paint covers no game on day index(es) {holes[:8]} - `day` could not be "
            f"used to look up a date, so the mapping is not shipped rather than shipped wrong")
    day_dates = [day_dates_by_index[i] for i in range(len(day_dates_by_index))]
    if day_dates != sorted(day_dates):
        die("day indices do not ascend with their own dates")
    out = {
        "generated_by": "pipeline/paint.py",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "format_version": FORMAT_VERSION,
        "provenance": PROVENANCE,
        "definitions": {
            "_authored": (
                f"Four things are chosen in this stage. A span length ({STROKE_SECONDS} s); the "
                f"rule for WHICH corroborated shot of a game is painted, in full: {SELECTION}; "
                f"the shortest run still counted as a gesture ({MIN_RUN_FRAMES} frames, "
                f"alternate {MIN_RUN_FRAMES_ALT}); and how close two bodies must stay before "
                f"they are treated as one detection ({COINCIDENCE_FT} ft for "
                f"{COINCIDENCE_SECONDS} s, alternate {COINCIDENCE_FT_ALT} ft). Every other "
                "property of a stroke is read off the record."
            ),
            "one_body_per_stroke": (
                "the feed sometimes reports ONE detection under TWO player ids. Both paths are "
                "real rows and both are perfectly continuous, so no check for jumps can see it - "
                "and painting both draws one measurement twice while the index calls them two "
                "bodies, which is this hand's governing rule failing. A canvas in which any two "
                f"of its ten bodies stay within {COINCIDENCE_FT} ft of each other for "
                f"{COINCIDENCE_SECONDS} s is REFUSED rather than repaired; `coincidence_ft` "
                "carries the measured distribution the tolerance was read off, the number of "
                "spans refused, and the number the alternate tolerance would refuse"
            ),
            "selection_rank": (
                "how far down the residual ordering each shipped canvas sat. Rank 0 is what the "
                "published rule used to claim on its own; anything above it is the feed-quality "
                "clauses of that rule doing the selecting, which is why they are now named in it"
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
        # WHERE THE PAINT REACHES. The stride that picks the games used an
        # integer step, which at 632 games and 250 canvases could not reach
        # past index 498: the painting stopped on 3 January and never touched
        # the last twenty days of the window, including the 23 January closure
        # Act III is built toward. Gated against the corpus's own span rather
        # than a constant, so a shortfall cannot pass by clearing a floor.
        "date_first": min(dates) if dates else None,
        "date_last": max(dates) if dates else None,
        "corpus_date_first": sel.get("corpus_date_first"),
        "corpus_date_last": sel.get("corpus_date_last"),
        # DAYS per month, not canvases: `dates` is a set, so a month holding
        # four canvases painted on one day contributes 1. It shipped as
        # `canvases_by_month` and summed to `days_covered` (85) rather than to
        # `canvases` (249) - a key whose name states what the artifact denies,
        # which is the honesty defect in a different file.
        "days_by_month": {
            k: v for k, v in sorted(Counter(d[:7] for d in dates).items())
        },
        # How far down the residual ordering each canvas sat. Rank 0 is the rule
        # as it used to be published; everything above is the feed-quality
        # clauses that were not published with it.
        "selection_rank": {str(k): v for k, v in sorted(ranks.items())},
        "selection_rank_zero": ranks.get(0, 0),
        # RULE 7, measured. `spans_refused` is possessions dropped because two
        # of their ten bodies were one detection the feed reported twice; the
        # distribution below is what the tolerance was read off.
        "coincidence_ft": {
            "tolerance": COINCIDENCE_FT,
            "tolerance_alt": COINCIDENCE_FT_ALT,
            "seconds": COINCIDENCE_SECONDS,
            "spans_examined": (sel.get("census") or {}).get("spans_examined"),
            "spans_refused": (sel.get("census") or {}).get("spans_refused_coincident"),
            "spans_refused_alt": (sel.get("census") or {}).get("spans_refused_coincident_alt"),
            "shipped_min": round(min(canvas_closest), 3) if canvas_closest else None,
            "shipped_p05": (round(sorted(canvas_closest)[len(canvas_closest) // 20], 3)
                            if canvas_closest else None),
            "hist": {str(b): v for b, v in sorted(Counter(
                min(int(c * 10), 40) / 10 for c in
                ((sel.get("census") or {}).get("closest_sustained_ft") or [])
            ).items())},
        },
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
        # WHAT A `day` BYTE MEANS, shipped rather than left to be inferred.
        #
        # paint_index.bin's `day` is an index into the game-days of the
        # corroborated corpus (0..84), NOT days since the window opened, which
        # is what window_measures.bin's `day` counts (0..88). 632 archives fall
        # on 85 distinct dates spanning 89 calendar days, so the two scales
        # differ by the four days nobody played, and nothing in either file's
        # name said so. A renderer pacing both hands off "day" was therefore
        # pacing them off two different clocks.
        #
        # `day_dates` is the index's own calendar and `day_offsets` is the same
        # thing measured against the corpus's first date, so a consumer can put
        # a stroke on the window's calendar without parsing anything or
        # interpolating a date the artifact does not contain. qa.py re-derives
        # the second from the first.
        "day_dates": day_dates,
        "day_offsets": [
            (datetime.date.fromisoformat(d)
             - datetime.date.fromisoformat(day_dates[0])).days
            for d in day_dates
        ],
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
                    help="parallel games; this stage is memory-bound, see README "
                         "(Running the pipeline)")
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

    # The selection, written down before anything runs. reduce_all ships this
    # and nothing else, and each canvas carries the digest below, so neither a
    # canvas the selection did not choose nor one derived from a superseded
    # window run can reach the artifact.
    selection = [{"archive": name, "day": day,
                  "source_digest": source_digest(Path(window_path))}
                 for name, day, window_path in picks]
    corpus_dates = sorted(a["date"] for a in usable_archives(corpus_entries()))
    prior = json.loads(SELECTION_PATH.read_text()) if SELECTION_PATH.exists() else {}
    manifest = {
        "generated_by": "pipeline/paint.py",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "note": "PRIVATE. The canvases the current selection chose, in order.",
        "games_requested": args.games,
        "selection_rule": SELECTION,
        # The span the canvases are gated against: the corpus's own, not a
        # constant that a shortfall could clear.
        "corpus_date_first": corpus_dates[0],
        "corpus_date_last": corpus_dates[-1],
        "corpus_games": len(corpus_dates),
        "selection": selection,
    }

    specs = []
    fresh = 0
    for (name, day, window_path), row in zip(picks, selection):
        out_path = PAINT_DIR / f"{Path(name).stem}.json"
        if out_path.exists() and not args.force:
            # A canvas is only "already done" if it was derived from the window
            # artifact that is on disk NOW.
            try:
                if json.loads(out_path.read_text()).get("source_digest") == row["source_digest"]:
                    fresh += 1
                    continue
            except (OSError, ValueError):
                pass
        specs.append((name, day, window_path, str(out_path), row["source_digest"]))
    print(f"  {fresh} already done against the current window run, {len(specs)} to run")

    errors = []
    done = 0
    census = Counter()
    closest = []
    if specs:
        with ProcessPoolExecutor(max_workers=args.jobs) as pool:
            futures = [pool.submit(_run_one, s) for s in specs]
            for fut in as_completed(futures):
                name, n, err, cen = fut.result()
                done += 1
                if cen:
                    for k in ("spans_examined", "spans_refused_coincident",
                              "spans_refused_coincident_alt"):
                        census[k] += cen[k]
                    closest.extend(cen["closest_sustained_ft"])
                if err:
                    errors.append((name, err))
                elif done % 25 == 0 or done == len(specs):
                    print(f"  [{done}/{len(specs)}] {name}: {n} strokes")

    if specs or not prior.get("census"):
        manifest["census"] = {
            "spans_examined": census["spans_examined"],
            "spans_refused_coincident": census["spans_refused_coincident"],
            "spans_refused_coincident_alt": census["spans_refused_coincident_alt"],
            "closest_sustained_ft": sorted(closest),
        }
    else:
        # Nothing was re-run, so the standing census still describes this
        # selection; carrying it forward beats replacing it with zeroes.
        manifest["census"] = prior["census"]
        census.update({k: manifest["census"][k] for k in
                       ("spans_examined", "spans_refused_coincident",
                        "spans_refused_coincident_alt")})
    write_json(SELECTION_PATH, manifest)

    print(f"\nQA: {done} games run, {len(errors)} without a corroborated, complete possession")
    print(f"     {census['spans_refused_coincident']} of {census['spans_examined']} spans "
          f"refused: two bodies within {COINCIDENCE_FT} ft for {COINCIDENCE_SECONDS} s are one "
          f"detection reported twice ({census['spans_refused_coincident_alt']} at the alternate "
          f"{COINCIDENCE_FT_ALT} ft)")
    for name, err in errors[:5]:
        print(f"  skipped {name}: {err}")
    print(f"canvases -> {PAINT_DIR}")


if __name__ == "__main__":
    main()
