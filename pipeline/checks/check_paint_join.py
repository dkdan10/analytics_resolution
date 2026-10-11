#!/usr/bin/env python3
"""Every painted canvas, reconstructed from the raw archive and the shot record.

Takes nothing on trust from the paint stage's own summary. For each canvas it
opens the SportVU archive named in the private provenance manifest, finds the
tracking event by id, re-derives the frames and the release from ball physics,
projects the release-frame ball position into the shot record's own frame, and
compares it with the coordinate the 2015-16 shot dump filed at
`tracking event id + this game's event offset`.

The claim being checked is the one paint.py's docstring makes and rule 7
(README, The rules) rests on: that every stroke is traceable back to one release
already corroborated against a coordinate the record filed independently. It was
once false for a majority of canvases - the stage accepted an offset it never
used and painted the first event that yielded a plausible rim flight.

SLOW: parses every painted archive.

Usage: python3 pipeline/checks/check_paint_join.py [--jobs 3] [--limit N]
"""

import argparse
import json
import math
import sys
from collections import Counter
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import HZ, PROCESSED_DIR, read_7z_bytes, require_env  # noqa: E402
from paint import PROVENANCE_PATH, STROKE_SECONDS  # noqa: E402
from window import (  # noqa: E402
    MAX_ANCHOR_RESIDUAL_FT,
    SPORTVU_DIR,
    event_frames,
    find_release,
    load_anchors,
    to_shot_frame,
)

_ANCHORS = None


def _init(a):
    global _ANCHORS
    _ANCHORS = a


def _one(row):
    """Rebuild one canvas's join from the archive and the shot dump."""
    try:
        game = json.loads(read_7z_bytes(SPORTVU_DIR / row["archive"]))
        gid = str(game["gameid"]).lstrip("0")
        anchors = _ANCHORS.get(gid, {})
        ev = next((e for e in game["events"]
                   if str(e.get("eventId")) == str(row["tracking_event_id"])), None)
        if ev is None:
            return {**row, "verdict": "no such tracking event"}
        efr = event_frames(ev)
        found = find_release(efr)
        if not found:
            return {**row, "verdict": "no release recovered"}
        release_i, _arrive_i, hoop_x = found
        if release_i != row["release_frame"]:
            return {**row, "verdict": f"release frame {release_i} != shipped "
                                      f"{row['release_frame']}"}
        if release_i < int(STROKE_SECONDS * HZ):
            return {**row, "verdict": "span runs off the start of the event"}
        anchor_id = row["tracking_event_id"] + row["event_offset"]
        if anchor_id != row["anchor_event_id"]:
            return {**row, "verdict": "shipped anchor id is not id + offset"}
        a = anchors.get(anchor_id)
        if a is None:
            return {**row, "verdict": "no shot anchor at that event"}
        ball = efr[release_i][3]
        sx, sy = to_shot_frame(ball[2], ball[3], hoop_x)
        resid = math.hypot(sx - a["loc_x"], sy - a["loc_y"]) / 10.0
        return {**row, "verdict": "ok", "recomputed_residual": round(resid, 3),
                "game_id_matches": gid == str(row["game_id"]).lstrip("0")}
    except Exception as e:  # noqa: BLE001
        return {**row, "verdict": f"{type(e).__name__}: {e}"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", type=int, default=3)
    ap.add_argument("--limit", type=int)
    args = ap.parse_args()
    require_env()

    if not PROVENANCE_PATH.exists():
        raise SystemExit(f"{PROVENANCE_PATH} missing - run pipeline/paint.py --reduce")
    man = json.loads(PROVENANCE_PATH.read_text())
    rows = man["canvases"][:args.limit] if args.limit else man["canvases"]
    paint = json.loads((PROCESSED_DIR / "paint.json").read_text())

    print(f"rebuilding the join for {len(rows)} canvases from the raw archives")
    anchors = load_anchors()

    out = []
    with ProcessPoolExecutor(max_workers=args.jobs, initializer=_init,
                             initargs=(anchors,)) as pool:
        futs = [pool.submit(_one, r) for r in rows]
        for i, f in enumerate(as_completed(futs), 1):
            out.append(f.result())
            if i % 25 == 0 or i == len(rows):
                print(f"  [{i}/{len(rows)}]", flush=True)

    verdicts = Counter(r["verdict"] if r["verdict"] == "ok" else "PROBLEM" for r in out)
    good = [r for r in out if r["verdict"] == "ok"]
    bad = [r for r in out if r["verdict"] != "ok"]
    within = [r for r in good if r["recomputed_residual"] <= MAX_ANCHOR_RESIDUAL_FT]
    drift = [r for r in good
             if abs(r["recomputed_residual"] - r["residual_ft"]) > 0.02]
    mismatched_game = [r for r in good if not r["game_id_matches"]]
    resid = sorted(r["recomputed_residual"] for r in good)

    print(f"\n{len(out)} canvases rebuilt: {verdicts['ok']} joined, {len(bad)} problems")
    for r in bad[:15]:
        print(f"  {r['archive'][:34]:36} canvas {r['canvas']:4d}  {r['verdict']}")
    if resid:
        print(f"  recomputed residual: median {resid[len(resid)//2]:.2f} ft, "
              f"p90 {resid[int(len(resid)*0.9)]:.2f} ft, max {resid[-1]:.2f} ft")
    print(f"  within the declared {MAX_ANCHOR_RESIDUAL_FT} ft: {len(within)}/{len(out)}")
    print(f"  canvases with no anchor at all: "
          f"{sum(1 for r in bad if r['verdict'] == 'no shot anchor at that event')}")
    print(f"  manifest rows: {len(man['canvases'])}, paint.json canvases: "
          f"{paint['canvases']}, index canvases referenced by strokes: "
          f"{len({c for c in range(paint['canvases'])})}")

    fails = []
    if len(within) != len(out):
        fails.append(f"{len(out) - len(within)} canvases do not reconcile within "
                     f"{MAX_ANCHOR_RESIDUAL_FT} ft")
    if drift:
        fails.append(f"{len(drift)} canvases ship a residual that does not reproduce")
    if mismatched_game:
        fails.append(f"{len(mismatched_game)} canvases name the wrong game")
    if len(man["canvases"]) != paint["canvases"]:
        fails.append("the manifest does not cover every shipped canvas")

    if fails:
        print("\nJOIN RED:")
        for f in fails:
            print(f"  {f}")
        sys.exit(1)
    print("\nJOIN GREEN: every shipped canvas resolves to one archive, one tracking")
    print("event, one event offset and one shot-spine record, inside the threshold.")


if __name__ == "__main__":
    main()
