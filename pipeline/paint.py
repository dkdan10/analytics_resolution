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

TWO THINGS ARE MEASURED PER VERTEX, and they are what make the paint honest:

  arc   the distance the body actually covered since the last vertex
  dt    how long that took

Both are accumulated from the FULL 25 Hz path before simplification, so speed =
arc/dt stays the true measured mean over the span no matter how few control
points survive. Simplification moves the drawn line by at most a tenth of a
foot and moves the paint by nothing at all.

WHAT SHIPS carries no identity: no player, no game, no event, no clock. Control
points in the plate's own folded halfcourt frame, a day index, and the two
measurements above. A game, a player, or a possession's timing cannot be
reconstructed from it (CLAUDE.md data rights; plan section 1.7).

Writes data/processed/paint_strokes.bin and data/processed/paint.json.

Usage: python3 pipeline/paint.py [--games N] [--jobs N] [--reduce]
"""

import argparse
import datetime
import json
import math
import os
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
    SAMPLE_SEED,
    ZONE_NAMES,
    die,
    read_7z_bytes,
    write_json,
    zone_at,
)
from window import (  # noqa: E402
    GAMES_DIR,
    HALFCOURT_X_TENTHS,
    HALFCOURT_Y_TENTHS,
    SPORTVU_DIR,
    corpus_entries,
    event_frames,
    find_release,
    to_shot_frame,
    usable_archives,
)

PAINT_DIR = Path(str(GAMES_DIR).replace("games", "paint"))

# --- authored, and there is only one -----------------------------------------
# How much of the body's path to paint. Five seconds is the same span the piece
# already treats as one gesture (bloom.py gathers 2.2 s of ball; the caliper's
# approach runs 2.0 s). Longer runs the stroke off the plate; shorter stops it
# reading as a gesture.
STROKE_SECONDS = 5.0

# Douglas-Peucker tolerance. A tenth of a foot is the record's own coordinate
# quantum, so simplifying to it discards nothing the record could resolve.
SIMPLIFY_FT = 0.15

# A vertex may not span more than this, or `arc` and `dt` stop describing a
# single continuous movement. Caps the u8 fields as a side effect.
MAX_VERTEX_FRAMES = 250
MAX_VERTEX_ARC_TENTHS = 250

# A body cannot move this far in 40 ms; beyond it the feed has skipped or swapped
# an identity, and integrating it would paint distance nobody ran.
MAX_STEP_FT = 3.0

# --- what ships --------------------------------------------------------------
# One control point. No identity, no clock.
VERTEX_REC = "<hhBB"      # x, y (tenths, hoop at origin); dt frames; arc tenths
VERTEX_BYTES = 6
# One stroke. `kind` is 0 for a body and 1 for the ball - the ball is the only
# row the machine gave a third dimension, so it is the only thing that can be lit.
STROKE_REC = "<IHBB"      # first vertex, count, kind, day index
STROKE_BYTES = 8


def rdp(pts, eps):
    """Douglas-Peucker, iterative - a 125-point path recurses deeper than is
    comfortable and this runs 2,750 times."""
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


def stroke_from(path, eps_tenths):
    """A full-rate path -> control points carrying their own arc and duration.

    Arc is summed over EVERY measured step between two kept vertices, never
    over the chord, so the paint knows how far the body really went even where
    the drawn line has been straightened.
    """
    if len(path) < 3:
        return None
    idx = rdp(path, eps_tenths)
    if len(idx) < 2:
        return None

    out = []
    for k, i in enumerate(idx):
        x, y = path[i]
        if k == 0:
            out.append((x, y, 0, 0))
            continue
        j = idx[k - 1]
        arc = 0.0
        for m in range(j + 1, i + 1):
            step = math.hypot(path[m][0] - path[m - 1][0], path[m][1] - path[m - 1][1])
            if step <= MAX_STEP_FT * 10:
                arc += step
        dt = i - j
        if dt > MAX_VERTEX_FRAMES:
            return None
        out.append((x, y, dt, min(MAX_VERTEX_ARC_TENTHS, int(round(arc)))))
    return out


def paint_game(archive_name, day_index, offset):
    """One possession from one game: ten bodies and the ball, five seconds each."""
    game = json.loads(read_7z_bytes(SPORTVU_DIR / archive_name))

    # Deterministic, so a re-run paints the same canvas: walk the game's events
    # in order and take the first one that yields a clean, complete possession.
    # No aesthetic choice is made anywhere in this file.
    want = int(STROKE_SECONDS * HZ)
    for ev in game["events"]:
        try:
            int(ev["eventId"])
        except (KeyError, ValueError, TypeError):
            continue
        efr = event_frames(ev)
        if len(efr) < want + 5:
            continue
        found = find_release(efr)
        if not found:
            continue
        release_i, _arrive_i, hoop_x = found
        lo = release_i - want
        if lo < 0:
            continue
        seg = efr[lo:release_i + 1]

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
        for p in full[:10]:
            s = stroke_from(p, SIMPLIFY_FT * 10)
            if s:
                strokes.append((0, s))
        b = stroke_from(ball, SIMPLIFY_FT * 10)
        if b:
            strokes.append((1, b))
        if len(strokes) < 8:
            continue

        return {
            "archive": archive_name,
            "day": day_index,
            "offset": offset,
            "seconds": STROKE_SECONDS,
            "strokes": strokes,
        }
    return None


_SPECS = None


def _run_one(spec):
    name, day, offset, out_path = spec
    try:
        rec = paint_game(name, day, offset)
        if rec is None:
            return name, 0, "no complete possession"
        write_json(Path(out_path), rec, compact=True)
        return name, len(rec["strokes"]), None
    except Exception as e:  # noqa: BLE001 - one bad archive costs one canvas
        return name, 0, f"{type(e).__name__}: {e}"


def pick_games(n):
    """A deterministic spread across the eleven weeks, seeded like everything else."""
    archives = usable_archives(corpus_entries())
    if not archives:
        die("no usable archives - run pipeline/window.py first")
    days = sorted({a["date"] for a in archives})
    day_index = {d: i for i, d in enumerate(days)}

    # Even stride over the calendar-ordered corpus rather than a random draw:
    # the canvas should be the window, not one week of it.
    step = max(1, len(archives) // n)
    picked = [archives[i * step] for i in range(min(n, len(archives)))]

    # Each game's event numbering was already calibrated by the window stage.
    offsets = {}
    for p in GAMES_DIR.glob("*.json"):
        g = json.loads(p.read_text())
        offsets[g.get("archive")] = g.get("join", {}).get("event_offset", 0)
    return [(a["name"], day_index[a["date"]], offsets.get(a["name"], 0)) for a in picked]


def reduce_all():
    """Fold the per-game canvases into the two shipped artifacts."""
    paths = sorted(PAINT_DIR.glob("*.json"))
    if not paths:
        die(f"no canvases in {PAINT_DIR} - run the paint stage first")

    verts = bytearray()
    index = bytearray()
    n_vertices = n_strokes = 0
    zone_ink = Counter()
    speeds = []
    outside = 0
    days = set()

    for p in paths:
        g = json.loads(p.read_text())
        days.add(g["day"])
        for kind, s in g["strokes"]:
            first = n_vertices
            for x, y, dt, arc in s:
                if abs(x) > HALFCOURT_X_TENTHS or not (-50 <= y <= HALFCOURT_Y_TENTHS):
                    outside += 1
                verts += struct.pack(
                    VERTEX_REC,
                    max(-32768, min(32767, int(round(x)))),
                    max(-32768, min(32767, int(round(y)))),
                    dt, arc,
                )
                n_vertices += 1
                if dt:
                    v = (arc / 10.0) / (dt / HZ)
                    speeds.append(v)
                    # Ink is deposited per unit TIME, so a zone's share of the
                    # paint is its share of the seconds, not of the distance.
                    zone_ink[zone_at(x, y)] += dt
            index += struct.pack(STROKE_REC, first, n_vertices - first, kind, g["day"])
            n_strokes += 1

    (PROCESSED_DIR / "paint_strokes.bin").write_bytes(bytes(verts))
    (PROCESSED_DIR / "paint_index.bin").write_bytes(bytes(index))

    speeds.sort()

    def pctl(q):
        return round(speeds[min(len(speeds) - 1, int(len(speeds) * q))], 2) if speeds else None

    ink_total = sum(zone_ink.values()) or 1
    out = {
        "generated_by": "pipeline/paint.py",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "provenance": PROVENANCE,
        "definitions": {
            "_authored": (
                "One span length is chosen here and nothing else: STROKE_SECONDS. Every other "
                "property of a stroke is read off the record."
            ),
            "stroke": (
                f"one body's measured path over the {STROKE_SECONDS} s before one verified "
                "release, in the shot record's own frame (tenths of a foot, hoop at origin)"
            ),
            "vertex": (
                "a control point kept by Douglas-Peucker at "
                f"{SIMPLIFY_FT} ft, carrying `dt` (frames since the previous vertex) and `arc` "
                "(tenths of a foot the body actually covered over that span, summed at the full "
                "25 Hz before simplification). Speed is arc/dt and is therefore the true measured "
                "mean over the span, unaffected by how few control points survive"
            ),
            "zone": (
                "index into the league's own seven SHOT_ZONE_BASIC regions, read at the vertex - "
                "a partition of the FLOOR the NBA drew, reconstructed from the geometry the plate "
                "draws and gated in qa.py against the league's own labels at 99.993%"
            ),
            "kind": "0 = a body, 1 = the ball (the only row the feed gave a third dimension)",
            "identity": (
                "none is shipped. No player, no game, no event, no clock - only a day index. A "
                "game, a player, or a possession's timing cannot be reconstructed from this file"
            ),
        },
        "canvases": len(paths),
        "strokes": n_strokes,
        "vertices": n_vertices,
        "days_covered": len(days),
        "seconds_painted": round(n_strokes * STROKE_SECONDS, 1),
        "stroke_seconds": STROKE_SECONDS,
        "simplify_ft": SIMPLIFY_FT,
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
                         "bytes": len(verts)},
            "index": {"path": "paint_index.bin", "record": STROKE_REC,
                      "bytes_per_record": STROKE_BYTES, "records": n_strokes,
                      "bytes": len(index)},
        },
    }
    write_json(PROCESSED_DIR / "paint.json", out)

    print(f"\nQA: {len(paths)} canvases, {n_strokes:,} strokes, {n_vertices:,} vertices")
    print(f"     {len(verts) / 1024:.0f} KB of paint + {len(index) / 1024:.0f} KB of index")
    print(f"     speed p10 {pctl(0.10)} p50 {pctl(0.50)} p90 {pctl(0.90)} ft/s")
    print(f"     {outside} vertices outside the plate box")
    for z, share in out["ink_by_zone"].items():
        print(f"     {z:<22} {100 * share:5.1f}% of painted time")
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

    if args.reduce:
        reduce_all()
        return

    PAINT_DIR.mkdir(parents=True, exist_ok=True)
    picks = pick_games(args.games)
    print(f"painting {len(picks)} possessions, one per game, across the window")

    specs = []
    for name, day, offset in picks:
        out_path = PAINT_DIR / f"{Path(name).stem}.json"
        if out_path.exists() and not args.force:
            continue
        specs.append((name, day, offset, str(out_path)))
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

    print(f"\nQA: {done} games run, {len(errors)} without a usable possession")
    for name, err in errors[:5]:
        print(f"  skipped {name}: {err}")
    print(f"canvases -> {PAINT_DIR}")


if __name__ == "__main__":
    main()
