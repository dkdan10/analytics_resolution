#!/usr/bin/env python3
"""THE GAME — one full game of tracked bodies, the second of the four scales.

Session 15's ladder is one possession → one game → one night → the window, each
level literally containing the last. This stage ships the game: every tracked
body and the ball across one archive, treated exactly as the paint treats a
possession — cut at discontinuities, Douglas-Peucker at the record's own
coordinate quantum, zone crossings forced — with one addition the scale forces:
a span longer than paint.py:MAX_VERTEX_FRAMES is SPLIT at real measured frames
(paint.py:stroke_from's split_over kwarg) rather than refused, because a body
standing still for minutes is a fact about a game and not a broken run.

THE GAME IS FOUND, NOT CHOSEN. Among the ten archives of the Dec 5, 2015 slate
(the night the piece already draws), the one whose record corroborates the most
shots — the count of releases the tracking feed and the shot record agree on,
exactly as window.py filed them per game. The rule and every count it compared
ship in `game.json:selection`; the argmax must be unique or this stage stops.

WHERE THE IDENTITY LINE SITS (flagged for ratification, not decided here): the
game is nameable — ten public archive names ship in the selection block, and
the winner is re-derivable from the disclosed rule — which sits between the
slate's anonymity and traces.json's named-on-purpose. Bodies are NOT named:
a stroke carries a per-period anonymous slot (first appearance order inside
that period, ball = 255). Game-scoped slots were REJECTED: a slot that holds
across periods carries a minutes-pattern that can be read against the public
box score, which is identity by another name. Per-period scoping is the
disclosed compromise.

THE FOLD is per ball-half segment with hysteresis. A game's play alternates
ends; folding every body toward one fixed hoop would draw half the game as a
mirror artifact, and folding per frame would reflect bodies at midcourt. So
the floor folds as ONE SCENE: toward the hoop of the half the ball is in,
flipping only when the ball crosses beyond midcourt by FOLD_HYSTERESIS_FT
(authored; the ALT segment count ships beside it), and every path is CUT at a
fold boundary — a body never smears across the flip. Off-plate vertices are
counted and shipped, never clipped.

Timing: a stroke's start is PERIOD-RELATIVE (uint16 frames from the period's
first tracked moment). A whole game of wall clock does not fit uint16 at 25 Hz
(the ceiling is 43.7 minutes); one period always does, and the period byte
beside it recovers the game's order through `game.json:periods`.
"""
import argparse
import datetime
import gc
import json
import struct
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from common import (  # noqa: E402
    HOOP_LEFT_X,
    HOOP_RIGHT_X,
    HZ,
    PROCESSED_DIR,
    RAW_DIR,
    read_7z_bytes,
    write_json,
)
from paint import (  # noqa: E402
    MAX_VERTEX_FRAMES,
    MIN_RUN_FRAMES,
    SIMPLIFY_FT,
    runs_of,
    stroke_from,
)
from window import (  # noqa: E402
    FRAME_GAP_FACTOR,
    GAMES_DIR,
    MAX_PASS_GAP_MS,
    TOUCH_RADIUS_FT,
    event_frames,
    frame_breaks,
    game_frames,
    load_anchors,
    measure_movement,
    measure_occupancy,
    to_shot_frame,
    touch_chains,
)

SPORTVU_DIR = RAW_DIR / "sportvu"

# The night whose games compete. The same measured selector as the slate.
NIGHT_DATE = "2015-12-05"

# Midcourt, court feet. The fold flips only when the ball is this far past it.
MID_X = 47.0
FOLD_HYSTERESIS_FT = 4.0
FOLD_HYSTERESIS_ALT_FT = 2.0

# The nested possession: the paint's own five seconds, ending at the release.
POSSESSION_FRAMES = int(5 * HZ)

# What ships. The vertex is the paint's own record; the index carries
# period-relative timing and the per-period anonymous body slot.
VERTEX_REC = "<hhHH"      # x, y (tenths, hoop at origin); dt frames; arc tenths
VERTEX_BYTES = 8
INDEX_REC = "<IHHBBB"     # first vertex, count, start (period-relative), period, kind, body
INDEX_BYTES = 11
BALL_BODY = 255

SELECTION_RULE = (
    "of the ten Dec 5, 2015 archives, the game with the most corroborated "
    "shots in the window stage's own per-game filing (window.py's Pass 2: a "
    "detected release whose anchor residual passes the gate); every count "
    "compared ships below, and the argmax must be unique"
)

FOLD_RULE = (
    "one scene per ball-half segment: every body folds toward the hoop of the "
    "half the ball is in (window.py:to_shot_frame), the segment flipping only "
    f"when the ball crosses {FOLD_HYSTERESIS_FT} ft past midcourt "
    f"(FOLD_HYSTERESIS_FT, authored; the {FOLD_HYSTERESIS_ALT_FT} ft alternate's "
    "segment count ships beside it); every path is cut at a fold boundary"
)


def pick_game():
    """The measured selection: corroborated-shot counts over the night's ten."""
    counts = {}
    for p in sorted(GAMES_DIR.glob("*.json")):
        g = json.loads(p.read_text())
        if g["date"] != NIGHT_DATE:
            continue
        counts[g["archive"]] = len(g["corroborated"])
    if len(counts) != 10:
        raise SystemExit(f"expected the night's ten per-game filings, found {len(counts)}")
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    (best, best_n), (_, second_n) = ranked[0], ranked[1]
    if best_n == second_n:
        raise SystemExit(f"selection argmax is not unique: {ranked[:2]}")
    return best, counts, best_n - second_n


def fold_segments(frames, hysteresis_ft):
    """Per-frame fold hoop and the segment count, from the ball's half.

    A forward pass with hysteresis; frames before the period's first ball
    sighting take the first decided state, so the fold never guesses.
    """
    hoop_of = [None] * len(frames)
    segments = 0
    state = None
    cur_period = None
    pending = []  # frames of this period before the first ball sighting
    for i, f in enumerate(frames):
        if f[0] != cur_period:
            cur_period = f[0]
            state = None
            for j in pending:
                hoop_of[j] = HOOP_LEFT_X  # unreachable when a period has a ball
            pending = []
        ball = f[3]
        if ball is not None:
            x = ball[2]
            if state is None:
                state = HOOP_LEFT_X if x < MID_X else HOOP_RIGHT_X
                segments += 1
                for j in pending:
                    hoop_of[j] = state
                pending = []
            elif state == HOOP_LEFT_X and x > MID_X + hysteresis_ft:
                state = HOOP_RIGHT_X
                segments += 1
            elif state == HOOP_RIGHT_X and x < MID_X - hysteresis_ft:
                state = HOOP_LEFT_X
                segments += 1
        if state is None:
            pending.append(i)
        else:
            hoop_of[i] = state
    for j in pending:
        hoop_of[j] = HOOP_LEFT_X
    return hoop_of, segments


def main():
    argparse.ArgumentParser(description=__doc__).parse_args()

    archive_name, counts, margin = pick_game()
    print(f"selected {archive_name}: {counts[archive_name]} corroborated, "
          f"margin {margin} over the runner-up", flush=True)

    raw = read_7z_bytes(SPORTVU_DIR / archive_name)
    game = json.loads(raw)
    del raw
    gid = str(game["gameid"])
    gamedate = game["gamedate"]
    frames, stats = game_frames(game)
    mode_ms = stats["timestamp_diff_mode_ms"] or (1000 // HZ)
    gap_max = FRAME_GAP_FACTOR * mode_ms

    # Period bases: period-relative frame = round((ts - t0_p) / mode_ms).
    periods = []
    t0_of = {}
    for f in frames:
        if f[0] not in t0_of:
            t0_of[f[0]] = f[1]
            periods.append(f[0])
    pframe_cache = {}

    def pframe(i):
        if i not in pframe_cache:
            f = frames[i]
            pf = int(round((f[1] - t0_of[f[0]]) / mode_ms))
            if not 0 <= pf <= 0xFFFF:
                raise SystemExit(f"period-relative frame {pf} does not fit uint16")
            pframe_cache[i] = pf
        return pframe_cache[i]

    period_frames = {p: 0 for p in periods}
    for i in range(len(frames)):
        p = frames[i][0]
        period_frames[p] = max(period_frames[p], pframe(i) + 1)

    breaks = frame_breaks(frames, gap_max)
    hoop_of, n_segments = fold_segments(frames, FOLD_HYSTERESIS_FT)
    _, n_segments_alt = fold_segments(frames, FOLD_HYSTERESIS_ALT_FT)

    # --- the strokes: every body and the ball, the paint's treatment ---------
    # Series keyed by (period, body key); the slot map is per period, first
    # appearance, and the ball is its own key.
    slot_of = {}          # (period, pid) -> slot
    slots_per_period = Counter()
    series = {}           # (period, key) -> [(global_i, fx, fy)]
    for i, f in enumerate(frames):
        p = f[0]
        hoop = hoop_of[i]
        if f[3] is not None:
            fx, fy = to_shot_frame(f[3][2], f[3][3], hoop)
            series.setdefault((p, "ball"), []).append((i, fx, fy))
        for row in f[4]:
            pid = row[1]
            if (p, pid) not in slot_of:
                slot_of[(p, pid)] = slots_per_period[p]
                slots_per_period[p] += 1
            px, py = to_shot_frame(row[2], row[3], hoop)
            series.setdefault((p, pid), []).append((i, px, py))

    verts = []
    index = []
    off_plate = 0
    painted_frames = 0
    arc_total = 0
    dt_max_seen = 0
    for (p, key), rows in series.items():
        pts = [(r[1], r[2]) for r in rows]
        # A cut at every feed gap, every global break between the two rows,
        # and every fold boundary. A body off the floor for a stretch returns
        # as a new run, not a chord across the bench.
        cut = set()
        for m in range(1, len(rows)):
            i0, i1 = rows[m - 1][0], rows[m][0]
            if (frames[i1][1] - frames[i0][1] > gap_max or i1 != i0 + 1
                    or hoop_of[i1] != hoop_of[i0]
                    or any(j in breaks for j in range(i0 + 1, i1 + 1))):
                cut.add(m)
        for a, b in runs_of(pts, cut):
            if b - a + 1 < MIN_RUN_FRAMES:
                continue
            made = stroke_from(pts[a:b + 1], SIMPLIFY_FT * 10,
                               split_over=MAX_VERTEX_FRAMES)
            if made is None:
                continue
            path = made[0]
            first = len(verts)
            for x, y, dt, arc_t in path:
                xi, yi = int(round(x)), int(round(y))
                if not (-250 <= xi <= 250 and -50 <= yi <= 420):
                    off_plate += 1
                painted_frames += dt
                arc_total += arc_t
                dt_max_seen = max(dt_max_seen, dt)
                verts.append((xi, yi, dt, arc_t))
            body = BALL_BODY if key == "ball" else slot_of[(p, key)]
            kind = 1 if key == "ball" else 0
            index.append((first, len(path), pframe(rows[a][0]), p, kind, body))

    # Deterministic shipped order that carries no derive-order structure.
    order = sorted(range(len(index)),
                   key=lambda i: (index[i][3], index[i][2], verts[index[i][0]][:2],
                                  index[i][4], index[i][5]))
    v2, i2 = [], []
    for i in order:
        first, count, start, p, kind, body = index[i]
        i2.append((len(v2), count, start, p, kind, body))
        v2.extend(verts[first:first + count])
    verts, index = v2, i2

    # --- the events: measured, never invented --------------------------------
    touches = touch_chains(frames, TOUCH_RADIUS_FT, gap_max)
    movement = measure_movement(frames, touches, gap_max)

    # Carrier spans: "the ball was held" is identity-free. Exactly the touch
    # chain, spans period-relative; the count is gated against n_touch.
    carriers = []
    for _pid, _team, i0, i1 in touches:
        if frames[i0][0] != frames[i1][0]:
            raise SystemExit("a touch spans a period boundary; the chain rule is broken")
        carriers.append({"p": frames[i0][0], "f0": pframe(i0), "f1": pframe(i1)})

    # Passes: exactly measure_movement's rule over the same chain, re-walked
    # here because that function ships counts and the piece needs instants.
    # The bead sits where the ball reached the receiver.
    passes = []
    for a, b in zip(touches, touches[1:]):
        if a[1] != b[1] or a[0] == b[0]:
            continue
        fa, fb = frames[a[3]], frames[b[2]]
        if fa[0] != fb[0]:
            continue
        if fb[1] - fa[1] <= MAX_PASS_GAP_MS:
            i = b[2]
            ball = frames[i][3]
            fx, fy = to_shot_frame(ball[2], ball[3], hoop_of[i])
            passes.append({"p": frames[i][0], "f": pframe(i),
                           "x": int(round(fx)), "y": int(round(fy))})
    if len(passes) != movement["passes"]:
        raise SystemExit(f"pass walk found {len(passes)} against "
                         f"measure_movement's {movement['passes']}")

    # Shots: the corroborated releases, re-anchored onto this artifact's own
    # timeline from the filing window.py already made.
    filing = None
    for p in GAMES_DIR.glob("*.json"):
        g = json.loads(p.read_text())
        if g.get("archive") == archive_name:
            filing = g
            break
    if filing is None:
        raise SystemExit(f"no per-game filing for {archive_name}")
    anchors = load_anchors().get(gid.lstrip("0"), {})

    by_event = {}
    for ev in game["events"]:
        try:
            by_event[int(ev["eventId"])] = ev
        except (KeyError, ValueError, TypeError):
            continue

    frame_index = {(f[0], f[1]): i for i, f in enumerate(frames)}
    shots = []
    shot_globals = []
    for c in filing["corroborated"]:
        efr = event_frames(by_event[c["event_id"]])
        rf = efr[c["release_frame"]]
        gi = frame_index.get((rf[0], rf[1]))
        if gi is None:
            raise SystemExit(f"release moment of event {c['event_id']} not in the "
                             "deduplicated game frames")
        ball = frames[gi][3]
        fx, fy = to_shot_frame(ball[2], ball[3], hoop_of[gi])
        made = anchors.get(c["anchor_event_id"], {}).get("made")
        shots.append({"p": frames[gi][0], "f": pframe(gi),
                      "x": int(round(fx)), "y": int(round(fy)),
                      "made": made, "residual": c["residual"]})
        shot_globals.append((c["residual"], c["event_id"], gi, len(shots) - 1))
    if len(shots) != len(filing["corroborated"]):
        raise SystemExit("a corroborated release failed to re-anchor")

    # --- the nested possession ----------------------------------------------
    # The smallest-residual corroborated shot whose five seconds sit inside
    # one period, one fold segment, and unbroken feed. "One" is a time-clip
    # of this artifact; nothing is re-derived for it.
    possession = None
    for residual, eid, gi, si in sorted(shot_globals):
        g0 = gi - (POSSESSION_FRAMES - 1)
        if g0 < 0:
            continue
        if frames[g0][0] != frames[gi][0]:
            continue
        if any(j in breaks for j in range(g0 + 1, gi + 1)):
            continue
        if any(hoop_of[j] != hoop_of[gi] for j in range(g0, gi + 1)):
            continue
        possession = {"p": frames[gi][0], "f0": pframe(g0), "f1": pframe(gi),
                      "frames": POSSESSION_FRAMES, "residual": residual,
                      "shot": si,
                      "rule": ("smallest-residual corroborated shot whose "
                               f"{POSSESSION_FRAMES}-frame span ends at the release "
                               "inside one period, one fold segment and unbroken feed")}
        break
    if possession is None:
        raise SystemExit("no corroborated shot satisfies the possession rule")

    # --- the game's own occupancy, the wash's fold ---------------------------
    occ = measure_occupancy(frames)

    del game, by_event
    gc.collect()

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    (PROCESSED_DIR / "game_strokes.bin").write_bytes(
        b"".join(struct.pack(VERTEX_REC, *v) for v in verts))
    (PROCESSED_DIR / "game_index.bin").write_bytes(
        b"".join(struct.pack(INDEX_REC, *r) for r in index))

    window = json.loads((PROCESSED_DIR / "window.json").read_text())
    day0 = window["corpus"]["date_first"]
    day = (datetime.date.fromisoformat(gamedate)
           - datetime.date.fromisoformat(day0)).days

    out = {
        "generated_by": "pipeline/game.py",
        "generated_at": datetime.datetime.now(datetime.timezone.utc)
                        .isoformat(timespec="seconds"),
        "date": gamedate,
        "day": day,
        "day0": day0,
        "archive": archive_name,
        "hz": HZ,
        "mode_ms": mode_ms,
        "selection": {
            "rule": SELECTION_RULE,
            "counts": dict(sorted(counts.items())),
            "chosen": archive_name,
            "corroborated": counts[archive_name],
            "margin": margin,
        },
        "periods": [{"period": p, "frames": period_frames[p]} for p in periods],
        "paths": len(index),
        "vertices": len(verts),
        "painted_frames": painted_frames,
        "arc_tenths_total": arc_total,
        "off_plate_vertices": off_plate,
        "off_plate_share": round(off_plate / len(verts), 4) if verts else 0.0,
        "dt_max": dt_max_seen,
        "bodies_per_period": {str(p): slots_per_period[p] for p in periods},
        "fold": {
            "rule": FOLD_RULE,
            "hysteresis_ft": FOLD_HYSTERESIS_FT,
            "segments": n_segments,
            "hysteresis_alt_ft": FOLD_HYSTERESIS_ALT_FT,
            "segments_alt": n_segments_alt,
        },
        "events": {
            "shots": shots,
            "passes": passes,
            "n_shots": len(shots),
            "n_passes": len(passes),
            "pass_rule": ("measure_movement's own: consecutive same-team "
                          "different-carrier touches in one period within "
                          f"{MAX_PASS_GAP_MS} ms; the bead sits at the frame "
                          "the ball reached its receiver"),
        },
        "carriers": {
            "spans": carriers,
            "n_touch": movement["touches"],
            "note": ("the ball was held - anonymous period-relative spans, "
                     "exactly window.py's touch chain, no body named"),
        },
        "possession": possession,
        "game_grid": {
            "grid": {f"{k[0]},{k[1]}": v for k, v in occ["body_grid"].items()},
            "total": occ["body_total"],
            "fold": ("each body toward its own nearer hoop - the wash's own "
                     "rule, so this game's cells are a subset of its night's"),
        },
        "treatment": (
            "cut at every step over paint.py:MAX_STEP_FT, every feed gap over "
            "the game's own modal spacing times window.py:FRAME_GAP_FACTOR, "
            "and every fold boundary; runs under paint.py:MIN_RUN_FRAMES "
            "dropped; Douglas-Peucker at paint.py:SIMPLIFY_FT with zone "
            "crossings forced, exactly as the paint; spans over "
            "paint.py:MAX_VERTEX_FRAMES split at real measured frames "
            "(stroke_from's split_over), never refused and never interpolated"
        ),
        "identity": (
            "the matchup is re-derivable from the disclosed selection rule and "
            "ships in it - between the slate's anonymity and the traces' "
            "named-on-purpose, flagged for ratification. No body is named: a "
            "stroke carries a per-period first-appearance slot (ball = 255); "
            "game-scoped slots were rejected because a slot held across "
            "periods reads against the public box score as a minutes pattern"
        ),
        "files": {
            "game_strokes": {
                "path": "game_strokes.bin",
                "record": VERTEX_REC,
                "bytes_per_record": VERTEX_BYTES,
                "records": len(verts),
                "bytes": len(verts) * VERTEX_BYTES,
                "fields": "x, y (int16 tenths, hoop at origin); dt (uint16 "
                          "frames); arc (uint16 tenths)",
            },
            "game_index": {
                "path": "game_index.bin",
                "record": INDEX_REC,
                "bytes_per_record": INDEX_BYTES,
                "records": len(index),
                "bytes": len(index) * INDEX_BYTES,
                "fields": "first vertex (uint32); count (uint16); start "
                          "(uint16 frames, period-relative); period (uint8); "
                          "kind (uint8, 1 = ball); body (uint8 per-period "
                          "slot, 255 = ball)",
            },
        },
        "provenance": {
            "source": "SportVU public 2015-16 release (linouk23 + mirrors)",
        },
    }
    write_json(PROCESSED_DIR / "game.json", out)
    print(f"game: {len(index)} paths, {len(verts)} vertices, "
          f"{len(shots)} shots, {len(passes)} passes, {len(carriers)} carrier "
          f"spans, {n_segments} fold segments ({n_segments_alt} at the "
          f"alternate), {off_plate} off-plate vertices, dt max {dt_max_seen}")


if __name__ == "__main__":
    main()
