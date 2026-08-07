#!/usr/bin/env python3
"""The four hero calipers, checked as geometry rather than as metadata.

Each hero is drawn by the piece as ONE confrontation closing over two seconds.
This decodes the tracks straight out of window.json and asks whether they are
that: the shooter one continuous body, and every defender jump either inside
what a body can do in one frame or coinciding with a marked change of slot.

Two of the four committed heroes previously contained jumps no body could make -
a defender crossing sixteen feet in forty milliseconds, a shooter crossing
twenty-two - because the track re-derived "nearest to the ball" on every frame
and concatenated fifty-one independent selections.

Fast: reads only data/processed/window.json.

Usage: python3 pipeline/checks/check_heroes.py
"""

import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import PROCESSED_DIR, require_env  # noqa: E402
from window import MAX_STEP_FT  # noqa: E402

RESULTS = []


def ok(name, cond, detail=""):
    RESULTS.append((name, bool(cond), detail))


def main():
    require_env()
    w = json.loads((PROCESSED_DIR / "window.json").read_text())
    heroes = w["contest"]["heroes"]
    defs = w["definitions"]

    ok("one hero per published category", len(heroes) == 4, str(len(heroes)))
    ok("the gather's subject is stated in the definitions",
       "closest_defender" in defs
       and ("geometric shooter" in defs["closest_defender"].lower()
            or "filed" in defs["closest_defender"].lower()),
       "")

    worst_s = (0.0, None)
    worst_d = (0.0, None)
    unmarked = 0
    for h in heroes:
        track = h["track"]
        ok(f"{h['bucket_name']}: the track is complete",
           all(f is not None for f in track), f"{len(track)} frames")
        ok(f"{h['bucket_name']}: every frame carries a defender slot",
           all(len(f) == 5 for f in track), "")
        slots = [f[4] for f in track]
        for a, b in zip(track, track[1:]):
            ds = math.hypot(b[0] - a[0], b[1] - a[1]) / 10.0
            dd = math.hypot(b[2] - a[2], b[3] - a[3]) / 10.0
            if ds > worst_s[0]:
                worst_s = (ds, h["bucket_name"])
            if a[4] == b[4]:
                if dd > worst_d[0]:
                    worst_d = (dd, h["bucket_name"])
                if dd > MAX_STEP_FT:
                    unmarked += 1
        switches = sum(1 for a, b in zip(slots, slots[1:]) if a != b)
        ok(f"{h['bucket_name']}: the reported switch count matches the track",
           switches == h["defender_switches"], f"{switches} vs {h['defender_switches']}")
        ok(f"{h['bucket_name']}: the reported shooter step matches the track",
           abs(max(math.hypot(b[0] - a[0], b[1] - a[1]) / 10.0
                   for a, b in zip(track, track[1:])) - h["max_shooter_step_ft"]) < 0.06,
           f"{h['max_shooter_step_ft']} ft")
        # The caliper the renderer draws must be the distance the artifact
        # reports for the release instant, which is the last frame of the track.
        last = track[-1]
        ok(f"{h['bucket_name']}: the last track frame is the reported caliper",
           abs(math.hypot(last[2] - last[0], last[3] - last[1]) / 10.0 - h["dist"]) < 0.06,
           f"{h['dist']} ft")
        ok(f"{h['bucket_name']}: the caliper lands in the category it is filed under",
           _bucket(h["dist"]) == h["bucket"], f"{h['dist']} ft -> bucket {h['bucket']}")

    ok(f"no shooter step exceeds {MAX_STEP_FT} ft in one frame",
       worst_s[0] <= MAX_STEP_FT, f"worst {worst_s[0]:.2f} ft ({worst_s[1]})")
    ok(f"no unmarked defender step exceeds {MAX_STEP_FT} ft in one frame",
       unmarked == 0 and worst_d[0] <= MAX_STEP_FT,
       f"{unmarked} unmarked, worst within-slot {worst_d[0]:.2f} ft ({worst_d[1]})")

    print(f"  (measured) worst shooter step {worst_s[0]:.2f} ft/frame; worst "
          f"within-slot defender step {worst_d[0]:.2f} ft/frame")
    print(f"  (measured) defender switches per hero: "
          f"{[h['defender_switches'] for h in heroes]}")

    width = max(len(n) for n, _, _ in RESULTS)
    for name, good, detail in RESULTS:
        print(f"  {'PASS' if good else 'FAIL'}  {name:<{width}}  {detail}")
    bad = [n for n, g, _ in RESULTS if not g]
    if bad:
        print(f"\nHEROES RED: {len(bad)} failed")
        sys.exit(1)
    print(f"\nHEROES GREEN: {len(RESULTS)} checks")


def _bucket(d):
    for i, (lo, hi) in enumerate(((0.0, 2.0), (2.0, 4.0), (4.0, 6.0), (6.0, 1e9))):
        if lo <= d < hi:
            return i
    return 3


if __name__ == "__main__":
    main()
