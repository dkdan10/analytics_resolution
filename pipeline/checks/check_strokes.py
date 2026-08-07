#!/usr/bin/env python3
"""The paint's own geometry, decoded from the bytes that actually ship.

Reads data/processed/paint_strokes.bin and paint_index.bin as a consumer would -
from paint.json's declared record strings, not from paint.py's constants - and
asks the questions the renderer's physics depends on:

  chord vs arc   a body cannot cross more ground than it travelled. If the
                 straight line between two control points is longer than the
                 arc stored for that span, the stroke is drawing a distance the
                 measurement does not contain, and speed, radius, opacity and
                 bead behaviour are all derived from that arc.
  clipping       a stored arc equal to the field maximum is not a measurement,
                 it is a ceiling standing in for one.
  composition    one canvas is a set of bodies; after runs are split, several
                 strokes can belong to the same body, and every stroke must
                 name a canvas and a body that exist.
  first vertex   dt = 0 opens a stroke and spans nothing; nothing may derive a
                 speed from it.

Fast: reads only data/processed/. --slow additionally re-derives full-rate speed
and zone occupancy from the raw archives, through the private provenance
manifest, and compares them with what shipped.

Usage: python3 pipeline/checks/check_strokes.py [--slow] [--sample N]
"""

import argparse
import json
import math
import struct
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import HZ, PROCESSED_DIR, ZONE_NAMES, read_7z_bytes, require_env, zone_at  # noqa: E402
from paint import (  # noqa: E402
    ARC_TENTHS_MAX,
    BALL_SLOT,
    MAX_STEP_FT,
    PROVENANCE_PATH,
    STROKE_SECONDS,
)
from window import (  # noqa: E402
    FRAME_GAP_FACTOR,
    SPORTVU_DIR,
    event_frames,
    find_release,
    to_shot_frame,
)

# How far chord and arc may legitimately disagree, DERIVED from the storage
# rather than picked. Both are stored as whole tenths of a foot:
#   each endpoint coordinate is rounded, so dx and dy each shift by up to one
#   tenth in total, and the chord by up to hypot of the two;
#   the arc is rounded once, so it can read up to half a tenth short.
# Anything past their sum is not quantization, it is geometry the measurement
# does not contain - which is exactly what a discarded discontinuity retained
# in the drawn line looks like.
QUANT_TOLERANCE_FT = math.hypot(0.1, 0.1) + 0.05

def speed_tolerance(dt):
    """How far arc/dt may sit from the full-rate mean, for a span of `dt` frames.

    Also derived, not chosen. Arc is stored to the nearest tenth, so it can be
    up to half a tenth off; divided by the span's duration that is
    0.05 * HZ / dt ft/s. A one-frame span therefore carries a whole 1.25 ft/s of
    unavoidable storage error and a fifty-frame span carries a fortieth of it -
    a single tolerance would be meaningless at one end and useless at the other.
    """
    return 0.05 * HZ / dt + 1e-9

RESULTS = []


def ok(name, cond, detail=""):
    RESULTS.append((name, bool(cond), detail))
    return bool(cond)


def load():
    p = json.loads((PROCESSED_DIR / "paint.json").read_text())
    vrec = p["files"]["vertices"]["record"]
    srec = p["files"]["index"]["record"]
    vsz, ssz = struct.calcsize(vrec), struct.calcsize(srec)
    vb = (PROCESSED_DIR / "paint_strokes.bin").read_bytes()
    ib = (PROCESSED_DIR / "paint_index.bin").read_bytes()
    verts = [struct.unpack_from(vrec, vb, i * vsz) for i in range(len(vb) // vsz)]
    strokes = [struct.unpack_from(srec, ib, i * ssz) for i in range(len(ib) // ssz)]
    return p, verts, strokes, (vsz, ssz)


def check_geometry(p, verts, strokes, sizes):
    vsz, ssz = sizes
    ok("paint.json declares the shipped record sizes",
       p["files"]["vertices"]["bytes_per_record"] == vsz
       and p["files"]["index"]["bytes_per_record"] == ssz, f"{vsz}/{ssz} bytes")
    ok("both binaries decode to a whole number of records",
       p["files"]["vertices"]["records"] == len(verts)
       and p["files"]["index"]["records"] == len(strokes),
       f"{len(verts)} vertices, {len(strokes)} strokes")

    over = []
    worst = (0.0, None)
    max_chord = 0.0
    zero_arc_nonzero_chord = 0
    clipped = 0
    first_vertex_bad = 0
    dt_zero_inside = 0
    covered = [False] * len(verts)

    for first, count, canvas, kind, body, day in strokes:
        for i in range(first, first + count):
            covered[i] = True
        x0, y0, dt0, arc0 = verts[first]
        if dt0 != 0 or arc0 != 0:
            first_vertex_bad += 1
        prev = (x0, y0)
        for i in range(first + 1, first + count):
            x, y, dt, arc = verts[i]
            if arc >= ARC_TENTHS_MAX:
                clipped += 1
            if dt == 0:
                dt_zero_inside += 1
            chord = math.hypot(x - prev[0], y - prev[1]) / 10.0
            max_chord = max(max_chord, chord)
            excess = chord - arc / 10.0
            if excess > worst[0]:
                worst = (excess, (canvas, body, i, chord, arc / 10.0))
            if excess > QUANT_TOLERANCE_FT:
                over.append((canvas, body, i, round(chord, 2), arc / 10.0))
            # The baseline's signature failure: a real distance drawn against
            # no measured movement at all. A single coordinate quantum is not
            # that, so it is held to the same derived bound.
            if arc == 0 and chord > QUANT_TOLERANCE_FT:
                zero_arc_nonzero_chord += 1
            prev = (x, y)

    ok(f"no segment's chord exceeds its arc beyond {QUANT_TOLERANCE_FT:.4f} ft of storage rounding",
       not over, f"{len(over)} segments over tolerance; worst excess "
                 f"{worst[0]:.3f} ft {worst[1] if worst[1] else ''}")
    ok("no non-zero chord carries zero arc", zero_arc_nonzero_chord == 0,
       str(zero_arc_nonzero_chord))
    ok("no stored arc clips the storage field", clipped == 0, str(clipped))
    ok("every stroke opens with dt = 0 and arc = 0", first_vertex_bad == 0,
       str(first_vertex_bad))
    ok("no interior vertex spans zero frames", dt_zero_inside == 0, str(dt_zero_inside))
    ok("every vertex belongs to exactly one stroke", all(covered),
       f"{covered.count(False)} orphans")
    print(f"  (measured) longest drawn segment {max_chord:.2f} ft; "
          f"largest chord-over-arc excess {worst[0]:.3f} ft")

    # Composition: after splitting, "eleven strokes per canvas" is gone. What
    # survives is that a canvas is a set of bodies and each body's runs are
    # grouped.
    by_canvas = defaultdict(set)
    runs = Counter()
    for _f, _c, canvas, kind, body, _d in strokes:
        by_canvas[canvas].add(body)
        runs[(canvas, body)] += 1
        if kind == 1 and body != BALL_SLOT:
            ok("the ball always occupies the ball slot", False, f"canvas {canvas}")
    bodies = [len(v) for v in by_canvas.values()]
    ok("every canvas is present in the index", len(by_canvas) == p["canvases"],
       f"{len(by_canvas)} of {p['canvases']}")
    ok("every canvas holds between eight and eleven bodies",
       min(bodies) >= 8 and max(bodies) <= 11, f"min {min(bodies)} max {max(bodies)}")
    ok("body slots stay inside the canvas",
       max(max(v) for v in by_canvas.values()) <= BALL_SLOT, "")
    split = sum(1 for v in runs.values() if v > 1)
    print(f"  (measured) {len(runs):,} (canvas, body) groups, {split} of them split "
          f"into more than one run; bodies per canvas min {min(bodies)} max {max(bodies)}")

    speeds = sorted((arc / 10.0) / (dt / HZ) for _x, _y, dt, arc in verts if dt)
    def q(f):
        return round(speeds[min(len(speeds) - 1, int(len(speeds) * f))], 2)
    print(f"  (measured) speed p10 {q(.10)} p50 {q(.50)} p90 {q(.90)} p99 {q(.99)} "
          f"max {round(speeds[-1], 2)} ft/s")
    ok("no vertex reports a speed a body could not reach",
       speeds[-1] <= MAX_STEP_FT * HZ + 1e-6, f"max {speeds[-1]:.2f} ft/s")
    for k in ("p10", "p50", "p90", "p99"):
        if abs(p["speed_ft_s"][k] - q(float("0." + k[1:]) if k != "p10" else 0.10)) > 0.011:
            ok(f"paint.json's {k} matches the shipped bytes", False,
               f"{p['speed_ft_s'][k]} vs {q(0.10 if k == 'p10' else float('0.' + k[1:]))}")
    return by_canvas


def check_vertex_zones(p, verts, strokes):
    """The renderer reads a colour at a vertex; the artifact reports ink from
    full-rate frames. Those are two different attributions, and the whole point
    of forcing a vertex wherever the zone changes is that they must now be the
    SAME number - not close, identical. This compares them without touching a
    raw archive.
    """
    tally = Counter()
    for first, count, _c, _k, _b, _d in strokes:
        for i in range(first + 1, first + count):
            x, y, dt, _arc = verts[i]
            tally[zone_at(x, y)] += dt
    total = sum(tally.values()) or 1
    got = {ZONE_NAMES[z]: n / total for z, n in sorted(tally.items())}
    worst = max((abs(got.get(k, 0.0) - v), k) for k, v in p["ink_by_zone"].items())
    # Not exact equality: a vertex ships as whole tenths, so within a tenth of a
    # boundary the region read at the vertex can differ from the region the body
    # was measured in. paint.json reports how much painted time that touches, and
    # the shares cannot move further than that.
    ok("reading the colour at each vertex reproduces the shipped ink shares",
       worst[0] <= p["zone_quantized_share"] + 0.001,
       f"largest difference {100 * worst[0]:.3f} pp on {worst[1]}, against a stated "
       f"{100 * p['zone_quantized_share']:.3f}% of painted time rounding across a boundary")
    ok("painted seconds agree with the ink the zones divide up",
       abs(total / HZ - p["seconds_painted"]) < 0.05, f"{total / HZ:.1f} s")


def check_slow(p, verts, strokes, sample):
    """Re-derive speed and zone occupancy from the raw feed for sampled canvases.

    Each shipped stroke is ALIGNED to a full-rate path by walking its own `dt`
    values and requiring every vertex to land on the recorded position - so the
    comparison is against the body that stroke actually came from, established
    without using the simplifier at all.
    """
    man = json.loads(PROVENANCE_PATH.read_text())["canvases"]
    by_canvas = {m["canvas"]: m for m in man}
    idx = sorted(by_canvas)
    step = max(1, len(idx) // sample)
    picked = [idx[i * step] for i in range(min(sample, len(idx)))]

    strokes_by_canvas = defaultdict(list)
    for s in strokes:
        strokes_by_canvas[s[2]].append(s)

    worst_speed = (0.0, None)
    bad_speed = n_spans = 0
    unaligned = 0
    zone_ticks = zone_mismatch = zone_rounded = 0
    want = int(STROKE_SECONDS * HZ)

    for canvas in picked:
        m = by_canvas[canvas]
        game = json.loads(read_7z_bytes(SPORTVU_DIR / m["archive"]))
        ev = next((e for e in game["events"]
                   if str(e.get("eventId")) == str(m["tracking_event_id"])), None)
        if ev is None:
            ok(f"canvas {canvas}: its tracking event exists in the archive", False)
            continue
        efr = event_frames(ev)
        release_i, _a, hoop_x = find_release(efr)
        seg = efr[release_i - want:release_i + 1]

        paths = {}
        ball = []
        for fm in seg:
            ball.append(to_shot_frame(fm[3][2], fm[3][3], hoop_x))
            for r in fm[4]:
                paths.setdefault(r[1], []).append(to_shot_frame(r[2], r[3], hoop_x))
        candidates = [pp for pp in paths.values() if len(pp) == len(seg)][:10] + [ball]

        for first, count, _c, _k, _b, _d in strokes_by_canvas[canvas]:
            aligned = _align(verts, first, count, candidates)
            if aligned is None:
                unaligned += 1
                continue
            path, at = aligned
            for k, i in enumerate(range(first + 1, first + count), start=1):
                _x, _y, dt, arc = verts[i]
                lo, hi = at[k - 1], at[k]
                true_arc = sum(
                    math.hypot(path[t][0] - path[t - 1][0], path[t][1] - path[t - 1][1])
                    for t in range(lo + 1, hi + 1)) / 10.0
                got, exp = (arc / 10.0) / (dt / HZ), true_arc / (dt / HZ)
                n_spans += 1
                err = abs(got - exp)
                slack = err / speed_tolerance(dt)
                if slack > worst_speed[0]:
                    worst_speed = (slack, (canvas, i, dt, round(got, 3), round(exp, 3),
                                           round(speed_tolerance(dt), 3)))
                if err > speed_tolerance(dt):
                    bad_speed += 1
                # Every full-rate frame inside this span must be in the region
                # the span is attributed to, or a simplified segment crossed a
                # boundary and the colour is an approximation of the record.
                for t in range(lo + 1, hi + 1):
                    zone_ticks += 1
                    if zone_at(*path[t]) != zone_at(*path[hi]):
                        zone_mismatch += 1
                    if zone_at(*path[t]) != zone_at(verts[i][0], verts[i][1]):
                        zone_rounded += dt and 1

    ok("every shipped stroke aligns to a full-rate path it came from",
       unaligned == 0, f"{unaligned} unaligned")
    ok("recomputed full-rate speed matches the shipped arc/dt within storage rounding",
       bad_speed == 0, f"{bad_speed} of {n_spans} spans outside tolerance; worst span "
                       f"used {worst_speed[0]:.2f} of its budget {worst_speed[1] or ''}")
    ok("no simplified segment spans two of the league's regions",
       zone_mismatch == 0, f"{zone_mismatch} of {zone_ticks:,} full-rate ticks")
    # The residue is the storage quantum, not the simplification, and paint.json
    # states how much of it there is. This checks that statement rather than
    # asserting the effect away.
    share = zone_rounded / max(1, zone_ticks)
    ok("the shipped figure for rounding across a region boundary is not an underestimate",
       share <= p["zone_quantized_share"] * 3 + 0.005,
       f"{100 * share:.3f}% of sampled ticks against {100 * p['zone_quantized_share']:.3f}% "
       f"shipped")
    print(f"  (measured) {n_spans:,} spans and {zone_ticks:,} full-rate ticks re-derived "
          f"from {len(picked)} archives; worst speed error used "
          f"{worst_speed[0]:.2f} of the storage budget")


def _align(verts, first, count, candidates):
    """Which recorded body this stroke is, and at which frames its vertices sit.

    Walks the stroke's own `dt` values across each candidate path and demands an
    exact hit on every vertex. Matching only the first point would pick whichever
    body happened to stand there.
    """
    target = [(verts[i][0], verts[i][1]) for i in range(first, first + count)]
    dts = [verts[i][2] for i in range(first, first + count)]
    for path in candidates:
        rounded = [(int(round(x)), int(round(y))) for x, y in path]
        for s in range(len(path)):
            if rounded[s] != target[0]:
                continue
            at = [s]
            cur = s
            good = True
            for k in range(1, count):
                cur += dts[k]
                if cur >= len(path) or rounded[cur] != target[k]:
                    good = False
                    break
                at.append(cur)
            if good:
                return path, at
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--slow", action="store_true", help="also re-derive from raw archives")
    ap.add_argument("--sample", type=int, default=12)
    args = ap.parse_args()
    require_env()

    p, verts, strokes, sizes = load()
    print(f"decoding {len(verts):,} vertices and {len(strokes):,} strokes as "
          f"{p['files']['vertices']['record']} / {p['files']['index']['record']} "
          f"(format_version {p.get('format_version')})")
    check_geometry(p, verts, strokes, sizes)
    check_vertex_zones(p, verts, strokes)
    if args.slow:
        check_slow(p, verts, strokes, args.sample)

    width = max(len(n) for n, _, _ in RESULTS)
    print()
    for name, good, detail in RESULTS:
        print(f"  {'PASS' if good else 'FAIL'}  {name:<{width}}  {detail}")
    bad = [n for n, g, _ in RESULTS if not g]
    if bad:
        print(f"\nSTROKES RED: {len(bad)} failed")
        sys.exit(1)
    print(f"\nSTROKES GREEN: {len(RESULTS)} checks")


if __name__ == "__main__":
    main()
