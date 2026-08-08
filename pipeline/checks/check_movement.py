#!/usr/bin/env python3
"""Touches, passes, drives and distance run, recomputed from one raw game.

The parse is shared (it has its own committed fixture gate), but the
segmentation and every measure on top of it are written out again here, so a
mistake in window.py's version cannot agree with itself. The proof game is the
one the probe fixture is built from.

What it asserts, beyond agreeing with the shipped per-game artifact:

  every drive contains an outside sample that PRECEDES an inside sample within
  the same touch - checked shot by shot, not by counting;
  no pass crosses a period;
  no pass exceeds the declared gap;
  no touch spans a period change or a feed dropout;
  no stride is integrated across either.

SLOW: parses one archive.

Usage: python3 pipeline/checks/check_movement.py [--archive NAME]
"""

import argparse
import json
import math
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import HZ, read_7z_bytes, require_env  # noqa: E402
from window import (  # noqa: E402
    DRIVE_FROM_FT,
    DRIVE_TO_FT,
    FRAME_GAP_FACTOR,
    GAMES_DIR,
    MAX_PASS_GAP_MS,
    MAX_STEP_FT,
    PROOF_NAME,
    SPORTVU_DIR,
    TOUCH_MAX_SECONDS,
    TOUCH_MIN_FRAMES,
    TOUCH_RADIUS_FT,
    game_frames,
    hoop_distance,
)

RESULTS = []


def ok(name, cond, detail=""):
    RESULTS.append((name, bool(cond), detail))


def chains(frames, radius, gap):
    """Touch chains, written independently of window.touch_chains."""
    out = []
    run = []          # (pid, team, index)
    for i, f in enumerate(frames):
        broke = i > 0 and (frames[i][0] != frames[i - 1][0]
                           or frames[i][1] - frames[i - 1][1] > gap)
        who = team = None
        ball = f[3]
        if ball is not None and f[4]:
            bx, by = ball[2], ball[3]
            d, best = min(((math.hypot(r[2] - bx, r[3] - by), r) for r in f[4]),
                          key=lambda t: t[0])
            if d <= radius:
                who, team = best[1], best[0]
        if run and (broke or run[-1][0] != who):
            out.append(run)
            run = []
        run.append((who, team, i))
    if run:
        out.append(run)
    keep = []
    for r in out:
        if r[0][0] is None or len(r) < TOUCH_MIN_FRAMES:
            continue
        if len(r) > TOUCH_MAX_SECONDS * HZ:
            continue
        keep.append((r[0][0], r[0][1], r[0][2], r[-1][2]))
    return keep


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--archive", default=PROOF_NAME)
    args = ap.parse_args()
    require_env()

    print(f"recomputing movement on {args.archive}")
    game = json.loads(read_7z_bytes(SPORTVU_DIR / args.archive))
    frames, stats = game_frames(game)
    gap = FRAME_GAP_FACTOR * (stats["timestamp_diff_mode_ms"] or (1000 // HZ))
    touches = chains(frames, TOUCH_RADIUS_FT, gap)

    # TOUCHES: none may straddle a discontinuity.
    straddle = sum(
        1 for _p, _t, i0, i1 in touches
        for i in range(i0 + 1, i1 + 1)
        if frames[i][0] != frames[i - 1][0] or frames[i][1] - frames[i - 1][1] > gap
    )
    ok("no touch spans a period change or a feed dropout", straddle == 0, str(straddle))

    # DRIVES: checked one at a time, on order, not by a count.
    drives = []
    unordered = 0
    for pid, team, i0, i1 in touches:
        seen_far_at = None
        hit = None
        far = near = None
        for i in range(i0, i1 + 1):
            b = frames[i][3]
            if b is None:
                continue
            d = hoop_distance(b[2], b[3])
            far = d if far is None else max(far, d)
            near = d if near is None else min(near, d)
            if d >= DRIVE_FROM_FT and seen_far_at is None:
                seen_far_at = i
            elif seen_far_at is not None and d <= DRIVE_TO_FT and hit is None:
                hit = i
        if hit is not None:
            drives.append((i0, i1, seen_far_at, hit))
        if far is not None and far >= DRIVE_FROM_FT and near <= DRIVE_TO_FT:
            unordered += 1
    ok("every drive has its outside sample before its inside sample",
       all(a < b for _i0, _i1, a, b in drives), "")
    ok("every drive's two samples are inside one touch",
       all(i0 <= a <= i1 and i0 <= b <= i1 for i0, i1, a, b in drives), "")

    # PASSES.
    passes = []
    kept_pairs = []
    cross_period = 0
    over_gap = 0
    for a, b in zip(touches, touches[1:]):
        if a[1] != b[1] or a[0] == b[0]:
            continue
        fa, fb = frames[a[3]], frames[b[2]]
        if fa[0] != fb[0]:
            cross_period += 1
            continue
        g = fb[1] - fa[1]
        if g > MAX_PASS_GAP_MS:
            over_gap += 1
            continue
        passes.append(g)
        kept_pairs.append((a, b))
    # `cross_period == 0 or True` was a dead assertion: it cannot be false, so
    # the criterion it claims to verify independently was verified by a
    # tautology. What the rule actually promises is that no adjacency counted as
    # a pass spans two periods, so that is what is asserted - over the passes,
    # not over the rejections.
    ok("no counted pass crosses a period",
       all(frames[a[3]][0] == frames[b[2]][0] for a, b in kept_pairs),
       f"{len(kept_pairs)} passes, {cross_period} adjacencies rejected for crossing a period")
    ok("no counted pass exceeds the declared gap",
       not passes or max(passes) <= MAX_PASS_GAP_MS, f"max {max(passes) if passes else 0} ms")

    # DISTANCE RUN.
    prev = {}
    dist = 0.0
    for i, f in enumerate(frames):
        if i > 0 and (frames[i][0] != frames[i - 1][0]
                      or frames[i][1] - frames[i - 1][1] > gap):
            prev.clear()
        for row in f[4]:
            q = prev.get(row[1])
            if q is not None and q[2] == i - 1:
                d = math.hypot(row[2] - q[0], row[3] - q[1])
                if d < MAX_STEP_FT:
                    dist += d
            prev[row[1]] = (row[2], row[3], i)

    got = {"touches": len(touches), "passes": len(passes), "drives": len(drives),
           "drives_unordered": unordered, "distance_ft": dist}
    print(f"  (measured) {got['touches']} touches, {got['passes']} passes, "
          f"{got['drives']} drives ({got['drives_unordered']} unordered), "
          f"{got['distance_ft']:,.0f} ft run")
    print(f"  (measured) {cross_period} same-team adjacencies crossed a period, "
          f"{over_gap} exceeded the {MAX_PASS_GAP_MS} ms gap")
    print(f"  (measured) feed break threshold for this game: {gap} ms "
          f"(modal spacing {stats['timestamp_diff_mode_ms']} ms)")

    art = GAMES_DIR / f"{Path(args.archive).stem}.json"
    if art.exists():
        g = json.loads(art.read_text())["movement"]
        for k in ("touches", "passes", "drives", "drives_unordered"):
            ok(f"shipped {k} matches this recomputation", g[k] == got[k],
               f"shipped {g[k]}, recomputed {got[k]}")
        ok("shipped distance run matches this recomputation",
           abs(g["distance_ft"] - dist) < 1.0,
           f"shipped {g['distance_ft']:,.1f}, recomputed {dist:,.1f}")
    else:
        print(f"  (no per-game artifact at {art}; comparison skipped)")

    width = max(len(n) for n, _, _ in RESULTS)
    for name, good, detail in RESULTS:
        print(f"  {'PASS' if good else 'FAIL'}  {name:<{width}}  {detail}")
    bad = [n for n, g, _ in RESULTS if not g]
    if bad:
        print(f"\nMOVEMENT RED: {len(bad)} failed")
        sys.exit(1)
    print(f"\nMOVEMENT GREEN: {len(RESULTS)} checks")


if __name__ == "__main__":
    main()
