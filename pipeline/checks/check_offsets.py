#!/usr/bin/env python3
"""Independent recomputation of the per-game event-offset calibration.

Rescores every offset in the search range from the RAW archives, using its own
scoring loop and its own copy of the acceptance criteria, and compares the
result with what window.py shipped. Sharing window.py's decision function would
make this a tautology, so only the primitives are imported - the parse, the
release detector, the frame transform - and the arithmetic that decides an
offset is written out again here.

Two modes:

  --survey    print the shape of the evidence: the score vector for each
              sampled game, the distribution of winning vote counts, and how
              many games each candidate minimum-vote cut would change. This is
              what MIN_OFFSET_VOTES was chosen from.
  (default)   verify: for each sampled game, assert that the shipped offset is
              this recomputation's accepted answer, that it is not sitting on
              the search boundary, and that it clears every criterion.

SLOW: parses whole SportVU archives. Not for every qa.py invocation.

Usage:
  python3 pipeline/checks/check_offsets.py [--survey] [--n 40] [--jobs 3]
                                           [--all-nonzero] [--json OUT]
"""

import argparse
import json
import math
import sys
from collections import Counter
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import HZ, read_7z_bytes, require_env  # noqa: E402
from window import (  # noqa: E402
    GAMES_DIR,
    MAX_ANCHOR_RESIDUAL_FT,
    MAX_EVENT_OFFSET,
    MIN_OFFSET_VOTES,
    MIN_OFFSET_VOTES_ALT,
    OFFSET_MIN_MARGIN,
    OFFSET_OVER_ZERO,
    SPORTVU_DIR,
    event_frames,
    find_release,
    load_anchors,
    to_shot_frame,
)

RANGE = list(range(-MAX_EVENT_OFFSET, MAX_EVENT_OFFSET + 1))


def rescore(archive_name, anchors_by_game):
    """Every offset's reconciliation count, from the archive and nothing else."""
    game = json.loads(read_7z_bytes(SPORTVU_DIR / archive_name))
    gid = str(game["gameid"]).lstrip("0")
    anchors = anchors_by_game.get(gid, {})

    releases = []
    for ev in game["events"]:
        try:
            eid = int(ev["eventId"])
        except (KeyError, ValueError, TypeError):
            continue
        if any(r[0] == eid for r in releases):
            continue
        efr = event_frames(ev)
        if len(efr) < HZ:
            continue
        found = find_release(efr)
        if not found:
            continue
        release_i, _arrive_i, hoop_x = found
        ball = efr[release_i][3]
        if ball is None:
            continue
        releases.append((eid, to_shot_frame(ball[2], ball[3], hoop_x)))

    scores = {off: 0 for off in RANGE}
    halves = {0: {off: 0 for off in RANGE}, 1: {off: 0 for off in RANGE}}
    for eid, (sx, sy) in releases:
        for off in RANGE:
            a = anchors.get(eid + off)
            if a is None:
                continue
            if math.hypot(sx - a["loc_x"], sy - a["loc_y"]) / 10.0 <= MAX_ANCHOR_RESIDUAL_FT:
                scores[off] += 1
                halves[eid % 2][off] += 1
    return {
        "archive": archive_name,
        "game_id": gid,
        "anchors": len(anchors),
        "releases": len(releases),
        "scores": scores,
        "half_even": halves[0],
        "half_odd": halves[1],
    }


def accept(scores, min_votes):
    """The acceptance rule, written out again rather than imported."""
    order = sorted(scores.items(), key=lambda kv: (-kv[1], abs(kv[0])))
    argmax, argmax_n = order[0]
    runner_up = order[1][1] if len(order) > 1 else 0
    at_zero = scores.get(0, 0)
    margin = (argmax_n - runner_up) / argmax_n if argmax_n else 0.0
    reason = None
    if argmax != 0:
        if abs(argmax) == MAX_EVENT_OFFSET:
            reason = "argmax on the search boundary"
        elif argmax_n < min_votes:
            reason = "too few votes"
        elif argmax_n < OFFSET_OVER_ZERO * max(1, at_zero):
            reason = "no lift over the straight join"
        elif margin < OFFSET_MIN_MARGIN:
            reason = "flat across adjacent offsets"
    return {
        "offset": 0 if reason else argmax,
        "argmax": argmax, "argmax_n": argmax_n, "runner_up": runner_up,
        "at_zero": at_zero, "margin": round(margin, 3), "reject_reason": reason,
    }


_ANCHORS = None


def _init(anchors):
    global _ANCHORS
    _ANCHORS = anchors


def _one(name):
    try:
        return rescore(name, _ANCHORS)
    except Exception as e:  # noqa: BLE001
        return {"archive": name, "error": f"{type(e).__name__}: {e}"}


def pick(n, all_nonzero):
    """A sample weighted towards the games where the decision was actually made.

    Every accepted non-zero offset and every rejection, plus the games whose
    margin was narrowest, plus an even stride across the rest - so the check
    covers the decisive cases rather than confirming the easy ones.
    """
    shipped = {}
    for p in sorted(GAMES_DIR.glob("*.json")):
        g = json.loads(p.read_text())
        if g.get("archive") and g.get("join"):
            shipped[g["archive"]] = g["join"]
    if not shipped:
        raise SystemExit(f"no per-game artifacts in {GAMES_DIR}")

    nonzero = [a for a, j in shipped.items() if j["event_offset"] != 0]
    rejected = [a for a, j in shipped.items() if j.get("offset_rejected")]
    tight = sorted(shipped, key=lambda a: shipped[a]["margin"])[:20]
    rest = sorted(a for a in shipped if a not in set(nonzero) | set(rejected) | set(tight))

    want = list(nonzero if all_nonzero else nonzero[:max(1, n // 3)])
    want += rejected[:max(1, n // 4)] + tight
    step = max(1, len(rest) // max(1, n // 4))
    want += [rest[i * step] for i in range(min(n // 4, len(rest) // max(1, step)))]

    seen, out = set(), []
    for a in want:
        if a not in seen:
            seen.add(a)
            out.append(a)
    return out, shipped


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--survey", action="store_true")
    ap.add_argument("--n", type=int, default=40)
    ap.add_argument("--jobs", type=int, default=3)
    ap.add_argument("--all-nonzero", action="store_true")
    ap.add_argument("--json", help="write the raw score vectors here")
    args = ap.parse_args()
    require_env()

    names, shipped = pick(args.n, args.all_nonzero)
    print(f"rescoring {len(names)} games over offsets {RANGE[0]}..{RANGE[-1]}")
    anchors = load_anchors()

    got = []
    with ProcessPoolExecutor(max_workers=args.jobs, initializer=_init,
                             initargs=(anchors,)) as pool:
        futs = [pool.submit(_one, nm) for nm in names]
        for i, f in enumerate(as_completed(futs), 1):
            r = f.result()
            got.append(r)
            if i % 10 == 0 or i == len(names):
                print(f"  [{i}/{len(names)}]", flush=True)

    bad = [r for r in got if "error" in r]
    got = [r for r in got if "error" not in r]
    for r in bad:
        print(f"  ERROR {r['archive']}: {r['error']}")

    if args.json:
        Path(args.json).write_text(json.dumps(
            [{**r, "scores": {str(k): v for k, v in r["scores"].items()},
              "half_even": {str(k): v for k, v in r["half_even"].items()},
              "half_odd": {str(k): v for k, v in r["half_odd"].items()}} for r in got], indent=1))

    if args.survey:
        survey(got)
        return
    verify(got, shipped)


def survey(got):
    wins = []
    print("\nSCORE VECTORS (non-zero argmax first)")
    for r in sorted(got, key=lambda r: (accept(r["scores"], MIN_OFFSET_VOTES)["argmax"] == 0,
                                        r["archive"])):
        a = accept(r["scores"], MIN_OFFSET_VOTES)
        wins.append(a)
        top = sorted(r["scores"].items(), key=lambda kv: -kv[1])[:5]
        print(f"  {r['archive'][:34]:36} anchors={r['anchors']:4d} rel={r['releases']:4d} "
              f"-> {a['offset']:+d} (argmax {a['argmax']:+d} n={a['argmax_n']} ru={a['runner_up']} "
              f"m={a['margin']}) {'REJECT: ' + a['reject_reason'] if a['reject_reason'] else ''}"
              f"  top {[(f'{k:+d}', v) for k, v in top]}")

    accepted = [w for w in wins if w["offset"] != 0]
    ns = sorted(w["argmax_n"] for w in accepted)
    zeros = sorted(w["argmax_n"] for w in wins if w["offset"] == 0 and w["argmax"] == 0)
    print(f"\nACCEPTED NON-ZERO OFFSETS: {len(accepted)} of {len(wins)}")
    if ns:
        print(f"  winning vote counts: min {ns[0]} p10 {ns[max(0, len(ns)//10)]} "
              f"p50 {ns[len(ns)//2]} max {ns[-1]}")
        print(f"  full sorted list: {ns}")
    if zeros:
        print(f"  zero-winner vote counts: min {zeros[0]} p05 {zeros[max(0, len(zeros)//20)]} "
              f"p50 {zeros[len(zeros)//2]} max {zeros[-1]}")
    print("\nWHAT A MINIMUM-VOTE CUT WOULD COST (non-zero offsets it would refuse)")
    for k in (0, 5, 10, 15, 20, 25, 30, 35, 40, 50, 60):
        n_acc = sum(1 for r in got if accept(r["scores"], k)["offset"] != 0)
        print(f"  min_votes={k:3d} -> {n_acc:3d} non-zero offsets accepted")
    print(f"  (shipped constants: MIN_OFFSET_VOTES={MIN_OFFSET_VOTES}, "
          f"ALT={MIN_OFFSET_VOTES_ALT})")
    reasons = Counter(w["reject_reason"] for w in wins if w["reject_reason"])
    print(f"\nREJECTION REASONS: {dict(reasons)}")
    boundary = [r["archive"] for r in got
                if abs(accept(r["scores"], MIN_OFFSET_VOTES)["argmax"]) == MAX_EVENT_OFFSET]
    print(f"ARGMAX ON THE BOUNDARY: {len(boundary)} {boundary[:6]}")


def verify(got, shipped):
    fails = []
    dist = Counter()
    held = [0, 0]
    for r in got:
        a = accept(r["scores"], MIN_OFFSET_VOTES)
        j = shipped[r["archive"]]
        dist[a["offset"]] += 1
        if a["offset"] != j["event_offset"]:
            fails.append((r["archive"], f"shipped {j['event_offset']:+d}, recomputed "
                                        f"{a['offset']:+d} (argmax {a['argmax']:+d} "
                                        f"n={a['argmax_n']} ru={a['runner_up']})"))
        if abs(j["event_offset"]) == MAX_EVENT_OFFSET:
            fails.append((r["archive"], f"shipped offset {j['event_offset']:+d} sits on the "
                                        f"search boundary"))
        if j["event_offset"] != 0:
            if j["reconciled_at_best"] < MIN_OFFSET_VOTES:
                fails.append((r["archive"], "accepted below the minimum vote count"))
            if j["reconciled_at_best"] < OFFSET_OVER_ZERO * max(1, j["reconciled_at_zero"]):
                fails.append((r["archive"], "accepted without lift over the straight join"))
            if j["margin"] < OFFSET_MIN_MARGIN:
                fails.append((r["archive"], "accepted on a flat score vector"))
        e = accept(r["half_even"], (MIN_OFFSET_VOTES + 1) // 2)
        o = accept(r["half_odd"], (MIN_OFFSET_VOTES + 1) // 2)
        if e["argmax_n"] >= (MIN_OFFSET_VOTES + 1) // 2 and o["argmax_n"] >= (MIN_OFFSET_VOTES + 1) // 2:
            held[1] += 1
            held[0] += 1 if e["offset"] == o["offset"] else 0

    print(f"\nVERIFIED {len(got)} games independently")
    print(f"  recomputed offset distribution: {dict(sorted(dist.items()))}")
    print(f"  held-out (recomputed): {held[0]}/{held[1]} halves agreed"
          f"{' (' + str(round(held[0]/held[1], 4)) + ')' if held[1] else ''}")
    if fails:
        print(f"\nFAIL: {len(fails)} problems")
        for a, why in fails[:40]:
            print(f"  {a[:36]:38} {why}")
        sys.exit(1)
    print("  PASS  every shipped offset is this recomputation's accepted answer,")
    print("  PASS  none sits on the search boundary,")
    print("  PASS  every non-zero offset clears votes, lift and margin.")


if __name__ == "__main__":
    main()
