#!/usr/bin/env python3
"""Adversarial fixtures for the window stage's authored rules.

Pure functions over synthetic inputs: no archives, no shot dumps, no network.
Runs in well under a second, so it is cheap enough to gate on every invocation.

What each family is for:

  offsets    the calibration must refuse the three shapes that look like an
             answer and are not - a peak on the edge of the search, a flat
             vector, and a spike carried by a handful of shots - and must not
             refuse a real one, including the ordinary case of no offset at all.
  touches    a chain, a pass and a stride may not cross a period change or a
             feed dropout, and a drive is directed.
  shooter    the body measured at the release is the body measured at the
             gather and at every frame between them.

Usage: python3 pipeline/checks/fixtures.py
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import HOOP_RIGHT_X, HOOP_Y, HZ  # noqa: E402
from window import (  # noqa: E402
    DRIVE_FROM_FT,
    FRAME_GAP_FACTOR,
    MAX_ANCHOR_RESIDUAL_FT,
    MAX_EVENT_OFFSET,
    MAX_PASS_GAP_MS,
    MIN_OFFSET_VOTES,
    TOUCH_MIN_FRAMES,
    decide_offset,
    frame_breaks,
    measure_movement,
    measure_shot,
    score_offsets,
    to_shot_frame,
)

RESULTS = []


def ok(name, cond, detail=""):
    RESULTS.append((name, bool(cond), detail))


# --- synthetic releases and anchors ------------------------------------------

def _court_from_shot_frame(sx, sy):
    """Inverse of to_shot_frame at the right-hand hoop."""
    return HOOP_RIGHT_X - sy / 10.0, HOOP_Y + sx / 10.0


def anchor_grid(n):
    """n anchors on a lattice coarse enough that a release can only reconcile
    with the one it was built from.

    The spacing is in TENTHS and has to exceed the join threshold, or a release
    matches its neighbours too and the score vector stops being an input. The
    first fixture below asserts exactly that, because getting this wrong makes
    every other offset fixture pass or fail for the wrong reason.
    """
    step = int(MAX_ANCHOR_RESIDUAL_FT * 10) * 3
    out = {}
    for e in range(n):
        out[e] = {"loc_x": (e % 20) * step - 10 * step, "loc_y": (e // 20) * step,
                  "player_id": 1, "action": "Jump Shot", "zone": "Mid-Range", "made": 0}
    return out


def release_at(eid, anchor):
    """A release whose ball sits exactly on `anchor`, filed under event `eid`."""
    x, y = _court_from_shot_frame(anchor["loc_x"], anchor["loc_y"])
    frame = (1, 0, 24.0, (-1, -1, x, y, 6.0), [])
    return (eid, [frame], 0, HOOP_RIGHT_X)


def vector(spec, n_anchors=400):
    """Build (found_shots, anchors) realising a wanted {offset: count} exactly.

    Each release is placed on the anchor `off` events away from its own id, so
    it reconciles at that offset and nowhere else - which makes the score vector
    an input rather than something to be discovered.
    """
    anchors = anchor_grid(n_anchors)
    shots = []
    eid = 20
    for off, count in spec.items():
        for _ in range(count):
            while not (0 <= eid + off < n_anchors) or any(s[0] == eid for s in shots):
                eid += 1
            shots.append(release_at(eid, anchors[eid + off]))
            eid += 1
    return shots, anchors


def check_offsets():
    # The score vector must be exactly what was asked for, or nothing below
    # means anything.
    shots, anchors = vector({0: 5, 1: 9, 2: 3})
    got = {k: v for k, v in score_offsets(shots, anchors).items() if v}
    ok("fixture builds an exact score vector", got == {0: 5, 1: 9, 2: 3}, str(got))
    grid = anchor_grid(60)
    closest = min(
        math.hypot(a["loc_x"] - b["loc_x"], a["loc_y"] - b["loc_y"]) / 10.0
        for i, a in grid.items() for j, b in grid.items() if i < j
    )
    ok("no two fixture anchors are within the join threshold",
       closest > MAX_ANCHOR_RESIDUAL_FT, f"closest pair {closest:.1f} ft")

    # BOUNDARY. A clean spike sitting on the edge of the search is the signature
    # of a peak outside it, and must be refused rather than shipped.
    shots, anchors = vector({0: 8, MAX_EVENT_OFFSET: 80})
    off, d = decide_offset(score_offsets(shots, anchors))
    ok("a peak on the search boundary is rejected",
       off == 0 and d["reject_reason"] == "argmax on the search boundary",
       f"{off:+d} {d['reject_reason']}")
    # ... and the same peak one step inside the search is accepted, so the
    # boundary rule refuses an EDGE and not a large offset.
    shots, anchors = vector({0: 8, MAX_EVENT_OFFSET - 1: 80})
    off, d = decide_offset(score_offsets(shots, anchors))
    ok("the same peak one step inside the boundary is accepted",
       off == MAX_EVENT_OFFSET - 1 and not d["offset_rejected"], f"{off:+d}")

    # FLAT. The shape the old narrow search was accepting the edge of: several
    # adjacent offsets scoring almost the same. Not an offset - a game whose
    # numberings do not correspond at all.
    shots, anchors = vector({0: 10, 3: 43, 4: 41, 5: 38, 6: 28, 7: 26})
    off, d = decide_offset(score_offsets(shots, anchors))
    ok("a flat vector across adjacent offsets is rejected",
       off == 0 and d["reject_reason"] == "flat across adjacent offsets",
       f"{off:+d} margin={d['margin']}")

    # SPARSE. A perfect ratio computed on a handful of shots is arithmetic, not
    # evidence.
    few = max(1, MIN_OFFSET_VOTES - 20)
    shots, anchors = vector({0: 1, 1: few})
    off, d = decide_offset(score_offsets(shots, anchors))
    ok("a spike carried by too few shots is rejected",
       off == 0 and d["reject_reason"] == "too few votes",
       f"{off:+d} n={d['argmax_n']} {d['reject_reason']}")

    # NO LIFT. A shift that barely improves on no shift is not a shift.
    shots, anchors = vector({0: 60, 1: 70})
    off, d = decide_offset(score_offsets(shots, anchors))
    ok("a shift without real lift over the straight join is rejected",
       off == 0 and d["reject_reason"] == "no lift over the straight join",
       f"{off:+d} {d['reject_reason']}")

    # DIRECT ZERO. Zero faces the same comparison and passes it on its merits.
    shots, anchors = vector({0: 90, 1: 20, -1: 18})
    off, d = decide_offset(score_offsets(shots, anchors))
    ok("a genuine straight join is accepted",
       off == 0 and not d["offset_rejected"] and d["argmax"] == 0,
       f"{off:+d} n={d['argmax_n']}")

    # ... and zero does NOT win merely by being zero.
    shots, anchors = vector({0: 20, 1: 85, 2: 30})
    off, d = decide_offset(score_offsets(shots, anchors))
    ok("a real offset beats a weak straight join",
       off == 1 and not d["offset_rejected"], f"{off:+d} n={d['argmax_n']}")

    # An empty game decides nothing and says so.
    off, d = decide_offset(score_offsets([], anchor_grid(50)))
    ok("a game with no releases decides zero with no votes",
       off == 0 and d["reconciled_at_best"] == 0, f"{off:+d}")

    # A REFUSAL IS NOT AN ANSWER. Both of these apply offset zero, and only one
    # of them chose it: a rejected argmax keeps the straight join because the
    # evidence for a shift was refused, not because zero won a comparison. The
    # held-out split reads `named`, so a half that decided nothing can no longer
    # be paired with a genuine straight join and counted as agreement.
    shots, anchors = vector({0: 10, 3: 43, 4: 41, 5: 38})
    off_r, refused = decide_offset(score_offsets(shots, anchors))
    shots, anchors = vector({0: 90, 1: 20, -1: 18})
    off_a, answered = decide_offset(score_offsets(shots, anchors))
    ok("a refusal names nothing where an accepted zero names zero",
       off_r == 0 and off_a == 0
       and refused["named"] is None and answered["named"] == 0,
       f"refused names {refused['named']}, accepted zero names {answered['named']}")


# --- synthetic frames ---------------------------------------------------------

GAP = FRAME_GAP_FACTOR * (1000 // HZ)


def frame(period, ts, ball_xy, players):
    bx, by = ball_xy
    return (period, ts, 20.0, (-1, -1, bx, by, 5.0),
            [(t, p, x, y, 0.0) for t, p, x, y in players])


def hold(period, t0, n, pid, team, ball_xy, others=(), step_ms=40, ball_path=None):
    """`n` frames of one player standing on the ball."""
    out = []
    for k in range(n):
        bx, by = ball_path[k] if ball_path else ball_xy
        rows = [(team, pid, bx, by)] + list(others)
        out.append(frame(period, t0 + k * step_ms, (bx, by), rows))
    return out


def check_touches():
    hold_n = TOUCH_MIN_FRAMES + 5
    far = (HOOP_RIGHT_X - 40.0, HOOP_Y)          # 40 ft out
    near = (HOOP_RIGHT_X - 5.0, HOOP_Y)          # 5 ft out

    # A PERIOD CHANGE splits a chain that would otherwise be one touch, and the
    # two halves are the same player, so they are not a pass either.
    fs = (hold(1, 0, hold_n, 7, 100, near, others=[(200, 8, 0.0, 0.0)])
          + hold(2, 10 ** 6, hold_n, 7, 100, near, others=[(200, 8, 0.0, 0.0)]))
    from window import touch_chains
    t = touch_chains(fs, 3.5, GAP)
    ok("a touch does not span a period change", len(t) == 2, f"{len(t)} touches")
    mv = measure_movement(fs, t, GAP)
    ok("no pass is counted across a period change", mv["passes"] == 0, str(mv["passes"]))

    # A FEED DROPOUT does the same.
    a = hold(1, 0, hold_n, 7, 100, near, others=[(200, 8, 0.0, 0.0)])
    b = hold(1, 0 + hold_n * 40 + 20 * GAP, hold_n, 7, 100, near,
             others=[(200, 8, 0.0, 0.0)])
    t = touch_chains(a + b, 3.5, GAP)
    ok("a touch does not span a feed dropout", len(t) == 2, f"{len(t)} touches")
    ok("the dropout is seen as a break", len(frame_breaks(a + b, GAP)) == 1)
    ok("unbroken feed produces no breaks", len(frame_breaks(a, GAP)) == 0)

    # A PASS inside the declared gap counts; the same pass outside it does not.
    def two_touches(gap_ms):
        p1 = hold(1, 0, hold_n, 7, 100, near, others=[(100, 9, 60.0, 5.0),
                                                     (200, 8, 0.0, 0.0)])
        t0 = hold_n * 40 + gap_ms
        p2 = [frame(1, t0 + k * 40, (60.0, 5.0),
                    [(100, 9, 60.0, 5.0), (100, 7, near[0], near[1]),
                     (200, 8, 0.0, 0.0)]) for k in range(hold_n)]
        return p1 + p2

    fs = two_touches(MAX_PASS_GAP_MS - 200)
    mv = measure_movement(fs, touch_chains(fs, 3.5, GAP), GAP)
    ok("a same-team hand-off inside the gap is a pass", mv["passes"] == 1, str(mv["passes"]))
    fs = two_touches(MAX_PASS_GAP_MS + 400)
    mv = measure_movement(fs, touch_chains(fs, 3.5, GAP), GAP)
    ok("the same hand-off beyond the gap is not a pass", mv["passes"] == 0, str(mv["passes"]))

    # A DRIVE is directed. The case that exposed the undirected reading: a touch
    # that starts near the rim, goes out past the drive radius, and ends in
    # between. Undirected, that is a drive; it is not one.
    n = 30
    path = ([(HOOP_RIGHT_X - 7.7, HOOP_Y)] * 10
            + [(HOOP_RIGHT_X - 42.0, HOOP_Y)] * 10
            + [(HOOP_RIGHT_X - 16.5, HOOP_Y)] * 10)
    fs = hold(1, 0, n, 7, 100, near, others=[(200, 8, 0.0, 0.0)], ball_path=path)
    mv = measure_movement(fs, touch_chains(fs, 3.5, GAP), GAP)
    ok("carrying the ball outwards is not a drive", mv["drives"] == 0, str(mv["drives"]))
    ok("the undirected reading still counts it", mv["drives_unordered"] == 1,
       str(mv["drives_unordered"]))

    # ... and a real drive is still a drive.
    path = [(HOOP_RIGHT_X - 25.0, HOOP_Y)] * 15 + [(HOOP_RIGHT_X - 4.0, HOOP_Y)] * 15
    fs = hold(1, 0, 30, 7, 100, near, others=[(200, 8, 0.0, 0.0)], ball_path=path)
    mv = measure_movement(fs, touch_chains(fs, 3.5, GAP), GAP)
    ok("an inbound drive is counted", mv["drives"] == 1, str(mv["drives"]))
    ok("the drive radii are the ones declared", DRIVE_FROM_FT > 0)

    # MOVEMENT does not integrate across a discontinuity.
    p1 = [frame(1, k * 40, (0.0, 0.0), [(100, 7, 10.0, 10.0), (200, 8, 0.0, 0.0)])
          for k in range(5)]
    p2 = [frame(2, 10 ** 6 + k * 40, (0.0, 0.0),
                [(100, 7, 11.0, 10.0), (200, 8, 0.0, 0.0)]) for k in range(5)]
    mv = measure_movement(p1 + p2, [], GAP)
    ok("a stride is not integrated across a period change",
       mv["distance_ft"] == 0.0, f"{mv['distance_ft']:.3f} ft")
    # ... within one period the same 1 ft IS counted.
    p3 = [frame(1, (5 + k) * 40, (0.0, 0.0), [(100, 7, 11.0, 10.0), (200, 8, 0.0, 0.0)])
          for k in range(5)]
    mv = measure_movement(p1 + p3, [], GAP)
    ok("the same stride inside one period is counted",
       abs(mv["distance_ft"] - 1.0) < 1e-9, f"{mv['distance_ft']:.3f} ft")


def check_shooter_binding():
    """The gather must not change the subject.

    Two team-mates, A and B. B is nearest the ball for the first half of the
    approach and A for the second, so the release binds A. Under the old rule
    the gather measured B. A is guarded from far away and B from close, so if
    the gather has changed the subject the number says so.
    """
    n = 60
    frames = []
    for k in range(n):
        # the ball travels from B to A
        bx = 10.0 + (40.0 - 10.0) * (k / (n - 1))
        rows = [
            (100, 1, 40.0, 25.0),    # A, the eventual shooter
            (100, 2, 10.0, 25.0),    # B
            (200, 3, 40.0, 33.0),    # A's defender, 8 ft away
            (200, 4, 10.0, 26.0),    # B's defender, 1 ft away
        ]
        frames.append(frame(1, k * 40, (bx, 25.0), rows))

    m = measure_shot(frames, n - 1, HOOP_RIGHT_X)
    ok("the shooter is bound at the release", m["release"]["shooter_id"] == 1,
       str(m["release"]["shooter_id"]))
    ok("the gather follows the same body", m["gather"]["shooter_id"] == 1,
       str(m["gather"]["shooter_id"]))
    ok("the gather measures the bound body's defender",
       abs(m["gather"]["dist"] - 8.0) < 0.01, f"{m['gather']['dist']:.2f} ft")
    ok("every track frame carries a defender slot",
       all(f is None or len(f) == 5 for f in m["track"]), "")
    ok("a track with one defender never switches slot", m["track_switches"] == 0,
       str(m["track_switches"]))
    ok("a still shooter has no step", m["track_shooter_step"] == 0.0,
       str(m["track_shooter_step"]))

    # A defender SWITCH is marked rather than drawn through: the nearest
    # opponent changes body halfway, and the slot index says so.
    frames = []
    for k in range(n):
        d1 = (200, 3, 40.0, 25.0 + (2.0 if k < n // 2 else 40.0))
        d2 = (200, 4, 40.0, 25.0 + (40.0 if k < n // 2 else 3.0))
        frames.append(frame(1, k * 40, (40.0, 25.0),
                            [(100, 1, 40.0, 25.0), d1, d2]))
    m = measure_shot(frames, n - 1, HOOP_RIGHT_X)
    slots = [f[4] for f in m["track"] if f is not None]
    ok("a change of defender changes the slot", len(set(slots)) == 2, str(set(slots)))
    ok("the switch is counted once", m["track_switches"] == 1, str(m["track_switches"]))
    ok("the shooter is still continuous across the switch",
       m["track_shooter_step"] == 0.0, str(m["track_shooter_step"]))

    # A body that leaves the feed leaves a hole, and nobody is substituted.
    frames = []
    for k in range(n):
        rows = [(200, 3, 40.0, 30.0), (100, 2, 5.0, 5.0)]
        if k != n - 20:
            rows.append((100, 1, 40.0, 25.0))
        frames.append(frame(1, k * 40, (40.0, 25.0), rows))
    m = measure_shot(frames, n - 1, HOOP_RIGHT_X)
    ok("a missing bound body leaves an empty frame",
       m["track"][len(m["track"]) - 1 - 19] is None
       and m["approach"][len(m["approach"]) - 1 - 19] is None, "")


def main():
    check_offsets()
    check_touches()
    check_shooter_binding()
    width = max(len(n) for n, _, _ in RESULTS)
    for name, good, detail in RESULTS:
        print(f"  {'PASS' if good else 'FAIL'}  {name:<{width}}  {detail}")
    bad = [n for n, g, _ in RESULTS if not g]
    print(f"\n{len(RESULTS) - len(bad)}/{len(RESULTS)} fixtures pass")
    if bad:
        print("FIXTURES RED: " + "; ".join(bad))
        sys.exit(1)
    print("FIXTURES GREEN")


if __name__ == "__main__":
    main()
