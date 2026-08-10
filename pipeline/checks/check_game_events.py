#!/usr/bin/env python3
"""THE GAME's events and index, recomputed from the raw archive.

The parse is shared (it has its own committed fixture gate); the touch
segmentation, the pass rule, the fold hysteresis and the slot arithmetic are
written out again here so a mistake in game.py's version cannot agree with
itself. The archive checked is the one game.json names.

What it asserts, beyond agreeing with the shipped artifact:

  the carrier spans are exactly an independent chain walk's, span for span;
  the passes are exactly an independent rule walk's, bead for bead;
  every shot's bead sits on a real deduplicated moment, at the ball, folded
  by an independently recomputed fold state;
  the possession's five seconds hold one period, one fold segment and
  unbroken feed, re-verified;
  no period's slot holds two strokes over the same frames, from the bytes.

SLOW: parses one archive.

Usage: python3 pipeline/checks/check_game_events.py
"""

import json
import math
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import HZ, PROCESSED_DIR, RAW_DIR, read_7z_bytes, require_env  # noqa: E402
from window import game_frames  # noqa: E402

SPORTVU_DIR = RAW_DIR / "sportvu"

# The rules' constants, restated from their owners so a drift is loud here.
TOUCH_RADIUS_FT = 3.5
TOUCH_MIN_FRAMES = 10
TOUCH_MAX_SECONDS = 12.0
MAX_PASS_GAP_MS = 1200
GAP_FACTOR = 2

RESULTS = []


def ok(name, cond, detail=""):
    RESULTS.append((name, bool(cond), detail))


def independent_chains(frames, gap):
    """Touch runs, written independently of window.touch_chains."""
    out = []
    run = []
    for i, f in enumerate(frames):
        broke = i > 0 and (f[0] != frames[i - 1][0]
                           or f[1] - frames[i - 1][1] > gap)
        who = team = None
        if f[3] is not None and f[4]:
            bx, by = f[3][2], f[3][3]
            d, best = min(((math.hypot(r[2] - bx, r[3] - by), r) for r in f[4]),
                          key=lambda t: t[0])
            if d <= TOUCH_RADIUS_FT:
                who, team = best[1], best[0]
        if run and (broke or run[-1][0] != who):
            out.append(run)
            run = []
        run.append((who, team, i))
    if run:
        out.append(run)
    return [r for r in out
            if r[0][0] is not None
            and TOUCH_MIN_FRAMES <= len(r) <= TOUCH_MAX_SECONDS * HZ]


def independent_fold(frames, hyst_ft):
    """Per-frame fold hoop, written independently of game.fold_segments."""
    hoop = [None] * len(frames)
    state = None
    period = None
    for i, f in enumerate(frames):
        if f[0] != period:
            period, state = f[0], None
        if f[3] is not None:
            x = f[3][2]
            if state is None:
                state = "L" if x < 47.0 else "R"
            elif state == "L" and x > 47.0 + hyst_ft:
                state = "R"
            elif state == "R" and x < 47.0 - hyst_ft:
                state = "L"
        hoop[i] = state
    # Backfill each period's opening None stretch with its first decided state.
    for i in range(len(hoop) - 2, -1, -1):
        if hoop[i] is None and frames[i][0] == frames[i + 1][0]:
            hoop[i] = hoop[i + 1]
    return hoop


def fold_at(px, py, state):
    if state == "R":
        return (py - 25.0) * 10.0, (88.75 - px) * 10.0
    return (25.0 - py) * 10.0, (px - 5.25) * 10.0


def main():
    require_env()
    gj = json.loads((PROCESSED_DIR / "game.json").read_text())

    frames, stats = game_frames(json.loads(read_7z_bytes(SPORTVU_DIR / gj["archive"])))
    mode_ms = stats["timestamp_diff_mode_ms"]
    ok("the artifact's own mode matches", gj["mode_ms"] == mode_ms, f"{mode_ms} ms")
    gap = GAP_FACTOR * mode_ms

    t0 = {}
    for f in frames:
        t0.setdefault(f[0], f[1])

    def pf(i):
        return int(round((frames[i][1] - t0[frames[i][0]]) / mode_ms))

    # Carriers, span for span.
    runs = independent_chains(frames, gap)
    mine = [(frames[r[0][2]][0], pf(r[0][2]), pf(r[-1][2])) for r in runs]
    theirs = [(s["p"], s["f0"], s["f1"]) for s in gj["carriers"]["spans"]]
    ok("the carrier spans are the independent walk's, span for span",
       sorted(mine) == sorted(theirs),
       f"{len(mine)} against {len(theirs)}")

    # Passes, bead for bead: consecutive same-team different-carrier runs in
    # one period within the gap; the bead at the receiver's first frame.
    beads = []
    hoop = independent_fold(frames, gj["fold"]["hysteresis_ft"])
    for a, b in zip(runs, runs[1:]):
        if a[0][1] != b[0][1] or a[0][0] == b[0][0]:
            continue
        ia, ib = a[-1][2], b[0][2]
        if frames[ia][0] != frames[ib][0]:
            continue
        if frames[ib][1] - frames[ia][1] <= MAX_PASS_GAP_MS:
            ball = frames[ib][3]
            fx, fy = fold_at(ball[2], ball[3], hoop[ib])
            beads.append((frames[ib][0], pf(ib), int(round(fx)), int(round(fy))))
    theirs_p = [(e["p"], e["f"], e["x"], e["y"]) for e in gj["events"]["passes"]]
    ok("the passes are the independent walk's, bead for bead",
       sorted(beads) == sorted(theirs_p),
       f"{len(beads)} against {len(theirs_p)}")

    # Shots: every bead on a real moment, at the ball, under the recomputed fold.
    by_time = {}
    for i, f in enumerate(frames):
        by_time.setdefault((f[0], pf(i)), i)
    bad = 0
    for e in gj["events"]["shots"]:
        i = by_time.get((e["p"], e["f"]))
        if i is None or frames[i][3] is None:
            bad += 1
            continue
        fx, fy = fold_at(frames[i][3][2], frames[i][3][3], hoop[i])
        if abs(int(round(fx)) - e["x"]) > 1 or abs(int(round(fy)) - e["y"]) > 1:
            bad += 1
    ok("every shot bead sits on a real moment at the folded ball",
       bad == 0, f"{bad} of {gj['events']['n_shots']} astray" if bad
       else f"{gj['events']['n_shots']} shots")

    # The possession, re-verified.
    po = gj["possession"]
    i1 = by_time.get((po["p"], po["f1"]))
    i0 = i1 - (po["frames"] - 1) if i1 is not None else None
    good = i1 is not None and i0 is not None and i0 >= 0
    if good:
        seg = frames[i0:i1 + 1]
        good = (all(f[0] == po["p"] for f in seg)
                and all(seg[m][1] - seg[m - 1][1] <= gap for m in range(1, len(seg)))
                and len({hoop[j] for j in range(i0, i1 + 1)}) == 1
                and pf(i0) == po["f0"])
    ok("the possession holds one period, one fold segment, unbroken feed", good)

    # Slot honesty, from the shipped bytes.
    ibuf = (PROCESSED_DIR / "game_index.bin").read_bytes()
    vbuf = (PROCESSED_DIR / "game_strokes.bin").read_bytes()
    dts = [struct.unpack_from("<hhHH", vbuf, i * 8)[2]
           for i in range(len(vbuf) // 8)]
    spans = {}
    for i in range(len(ibuf) // 11):
        first, count, start, period, kind, body = struct.unpack_from("<IHHBBB", ibuf, i * 11)
        if body == 255:
            continue
        spans.setdefault((period, body), []).append(
            (start, start + sum(dts[first:first + count])))
    clashes = 0
    for key, ss in spans.items():
        ss.sort()
        clashes += sum(1 for (a0, a1), (b0, _b1) in zip(ss, ss[1:]) if b0 < a1)
    ok("no period's slot holds two strokes over the same frames", clashes == 0)

    failed = [(n, d) for n, okk, d in RESULTS if not okk]
    for n, okk, d in RESULTS:
        print(f"  {'PASS' if okk else 'FAIL'}  {n}{f' ({d})' if d else ''}")
    if failed:
        print(f"CHECK-GAME RED: {len(failed)} failure(s)")
        sys.exit(1)
    print("CHECK-GAME GREEN: the game's events reproduce from the archive.")


if __name__ == "__main__":
    main()
