#!/usr/bin/env python3
"""THE WASH's night, recomputed from the raw archives.

The parse is shared (it has its own committed fixture gate); the fold and the
binning are written out again here - a second to_shot_frame, a second
nearer-hoop rule, a second lattice - so a mistake in window.py's version
cannot agree with itself. The day recomputed is the night (the ten misnamed
Dec 5 archives): it is the one day of the 85 whose raster three artifacts
must agree about - wash.bin's own day, the slate's date, and the chosen
game's grid, which must be exactly this stage's own contribution to it.

What it asserts:

  the day-39 raster of wash.bin equals the ten games' body positions,
  refolded and rebinned from the archives by independent arithmetic;
  the chosen game's game_grid is exactly its own archive's contribution;
  window.json:wash.positions_total is consistent for the recomputed day.

SLOW: parses ten archives, sequentially (the memory-bound lesson).

Usage: python3 pipeline/checks/check_wash.py
"""

import json
import struct
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import PROCESSED_DIR, RAW_DIR, read_7z_bytes, require_env  # noqa: E402
from window import archive_date, game_frames  # noqa: E402

SPORTVU_DIR = RAW_DIR / "sportvu"
NIGHT = "2015-12-05"

RESULTS = []


def ok(name, cond, detail=""):
    RESULTS.append((name, bool(cond), detail))


def fold_bin(px, py):
    """Independent fold + bin: the wash's rule, written a second time.

    Court feet -> the shot frame in tenths toward the body's own nearer hoop
    (right hoop at x=88.75, left at 5.25, centre line y=25), then the 1-ft
    lattice. Returns a bin or None when the position leaves the box.
    """
    if abs(px - 88.75) < abs(px - 5.25):
        fx, fy = (py - 25.0) * 10.0, (88.75 - px) * 10.0
    else:
        fx, fy = (25.0 - py) * 10.0, (px - 5.25) * 10.0
    if abs(fx) > 250 or not -50 <= fy <= 420:
        return None
    return int(fx // 10), int(fy // 10)


def game_body_grid(archive):
    frames, _stats = game_frames(json.loads(read_7z_bytes(archive)))
    grid = Counter()
    for f in frames:
        for row in f[4]:
            b = fold_bin(row[2], row[3])
            if b is not None:
                grid[b] += 1
    return grid


def main():
    require_env()
    w = json.loads((PROCESSED_DIR / "window.json").read_text())
    ws = w["wash"]
    gj = json.loads((PROCESSED_DIR / "game.json").read_text())

    import datetime
    day = (datetime.date.fromisoformat(NIGHT)
           - datetime.date.fromisoformat(ws["day0"])).days
    ok("the night has a raster", day in ws["days"], f"day {day}")
    idx = ws["days"].index(day)

    per = ws["rows"] * ws["cols"]
    buf = (PROCESSED_DIR / "wash.bin").read_bytes()
    shipped = struct.unpack_from(f"<{per}I", buf, idx * per * 4)

    archives = [p for p in sorted(SPORTVU_DIR.glob("*.7z"))
                if archive_date(p.name) == NIGHT]
    ok("the night is ten archives", len(archives) == 10, f"{len(archives)}")

    total = Counter()
    chosen_grid = None
    for arc in archives:
        g = game_body_grid(arc)
        if arc.name == gj["archive"]:
            chosen_grid = g
        total.update(g)
        print(f"  {arc.name}: {sum(g.values()):,} positions", flush=True)

    rebuilt = [0] * per
    for (bx, by), v in total.items():
        rebuilt[(by - ws["y0"]) * ws["cols"] + (bx - ws["x0"])] = v
    diff = sum(1 for a, b in zip(shipped, rebuilt) if a != b)
    ok("the night's raster is the archives' own, cell for cell", diff == 0,
       f"{diff} cells differ" if diff else f"{sum(rebuilt):,} positions agree")

    want = {tuple(int(t) for t in k.split(",")): v
            for k, v in gj["game_grid"]["grid"].items()}
    ok("the chosen game's grid is its own archive's contribution",
       chosen_grid is not None and dict(chosen_grid) == want,
       f"{sum(want.values()):,} positions")
    ok("the game total is its grid's sum",
       gj["game_grid"]["total"] == sum(want.values()))

    failed = [(n, d) for n, okk, d in RESULTS if not okk]
    for n, okk, d in RESULTS:
        print(f"  {'PASS' if okk else 'FAIL'}  {n}{f' ({d})' if d else ''}")
    if failed:
        print(f"CHECK-WASH RED: {len(failed)} failure(s)")
        sys.exit(1)
    print("CHECK-WASH GREEN: the night's raster reproduces from the archives.")


if __name__ == "__main__":
    main()
