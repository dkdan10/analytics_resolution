#!/usr/bin/env python3
"""Stage 4 - the window: what the raw record held, for eleven weeks.

Twenty-nine of the piece's thirty seasons are the same kind of record - one
point and a handful of categories per shot, filed after the fact. Between
27 Oct 2015 and 23 Jan 2016 the optical feed itself was public: 632 usable
games at 25 Hz, the ball in three dimensions and ten bodies in two.

Everything the league publishes today about how a shot happened - closest
defender, drives, touches, speed and distance, catch-and-shoot - is DERIVED
from a feed like this one, which it no longer releases. So this stage is not
after better numbers. It reconstructs a published statistic from the geometry
that makes it, in the one period where that geometry can be held, which is the
only place in the record where the manufacture of a statistic is visible.

Two disciplines run through all of it:

  THE DEFINITIONS ARE MINE. The league does not publish its rules - which frame
  counts as "the shot", how near is a touch, when a drive begins. So every
  measure here is computed under TWO defensible rules and the disagreement
  ships beside the number. The piece does not merely say the definition is
  private; it measures how much the number moves when the definition does.

  THE JOIN IS CHECKED BY GEOMETRY. A shot's release, transformed into the shot
  record's own frame, must land near where the record filed that shot. That
  residual is reported and gated rather than assumed.

Staged for survivability: every game writes its own artifact under
data/window/games/, so a 632-game run resumes where it stopped and one bad
archive costs one game rather than the run. Nothing here calls die().

Writes data/processed/window.json (derived, committable) and
data/processed/window_measures.bin. Bulk archives stay in data/raw/ and are
never committed; frame-level data never leaves this machine.

Usage: python3 pipeline/window.py [--probe-gate] [--games N] [--jobs N] [--force]
"""

import argparse
import datetime
import json
import math
import os
import statistics
import sys
import tempfile
from collections import Counter
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    CORPUS_API,
    CORPUS_RAW,
    EMPTY_SHELL_BYTES,
    HOOP_LEFT_X,
    HOOP_RIGHT_X,
    HOOP_Y,
    HZ,
    MISNAMED_PREFIX,
    PROCESSED_DIR,
    PROVENANCE,
    RAW_DIR,
    REPO_ROOT,
    RIM_HEIGHT,
    die,
    download,
    extract_7z,
    read_7z_bytes,
    read_season_csv,
    require_env,
    sha256_file,
    write_json,
)

WINDOW_DIR = REPO_ROOT / "data" / "window"
GAMES_DIR = WINDOW_DIR / "games"
SPORTVU_DIR = RAW_DIR / "sportvu"

# The season the public tracking release covers, and therefore the only season
# any measurement in this file describes. Named once: it was written literally
# in the anchor load, the reduce and the corroboration, and a stage that talks
# about one season in three places should say which one in only one of them.
WINDOW_SEASON_YEAR = 2015

# --- the proof fixture -------------------------------------------------------
# The blocking gate for this stage is not its own output, which does not exist
# yet, but a fixture already committed to git: data/processed/sportvu_probe.json.
# If this parse cannot reproduce those numbers exactly, nothing downstream is
# worth looking at.
PROOF_NAME = "10.28.2015.NOP.at.POR.7z"
PROOF_JSON = "0021500015.json"

# --- authored definitions ----------------------------------------------------
# Every constant below is a choice, not an observation. They are named here,
# shipped in window.json's `definitions`, and each measure that depends on one
# is also computed under the ALT value so the disagreement can be published.

# "The shot" - the frame at which closest-defender distance is taken. The ball
# leaving the hand (physics), against the gather 0.4 s earlier. The league says
# "at the time of the shot" and does not say which of these it means.
GATHER_FRAMES = 10

# "A touch" - the ball within this radius of its nearest player, held this long
# WITHOUT the feed breaking underneath it. A touch may not span a period change
# or a dropout: the frames either side of one are not consecutive instants, and
# a chain that crosses one is describing two occasions as though they were one.
TOUCH_RADIUS_FT = 3.5
TOUCH_RADIUS_ALT_FT = 3.0
TOUCH_MIN_FRAMES = 10

# A touch longer than this is a dead ball, not possession: the feed keeps
# running through free throws and stoppages with the ball in someone's hands.
TOUCH_MAX_SECONDS = 12.0

# "A drive" - one touch carrying the handler from outside to inside these radii,
# IN THAT ORDER. Direction is part of the definition and was missing from it: a
# maximum and a minimum taken over the whole touch say nothing about which came
# first, so a player carrying the ball AWAY from the rim satisfied both.
DRIVE_FROM_FT = 20.0
DRIVE_TO_FT = 10.0

# "A pass" - the ball leaving one player and reaching a team-mate, in the same
# period, within this long. Read off the feed rather than picked: the gap
# between consecutive same-team touches is a single-peaked distribution with a
# long flat dead-ball tail, and this is where its ninetieth percentile falls.
# The second reading is further out, where the density has dropped to within an
# order of magnitude of that tail. Both are computed and both ship;
# `pass_gap_ms` in window.json carries the distribution they were drawn from and
# `inventory.passes` beside `passes_alt_gap` carries what each one costs, so
# neither is a number to take on trust.
MAX_PASS_GAP_MS = 1200
MAX_PASS_GAP_ALT_MS = 2000

# Where the feed breaks. Not a constant but a multiple of the feed's OWN modal
# spacing, measured per game, so it follows the instrument rather than assuming
# one. The choice of factor is not delicate: the feed's jitter dies out well
# inside two frames and its real dropouts start well outside, leaving a wide
# band that carries a few hundred of the corpus's fifty million frame pairs.
# `frame_gap_ms` in window.json ships that distribution, so the band can be
# looked at rather than believed.
FRAME_GAP_FACTOR = 2

# A player cannot move this far in 40 ms; anything further is a feed gap or an
# identity swap, and integrating it would invent distance that was never run.
# Also the physical-continuity threshold a hero's geometry must hold to: a
# caliper the piece draws as one confrontation closing must BE one confrontation.
MAX_STEP_FT = 3.0

# The league's own four categories for closest defender, still published today.
DEFENDER_BUCKETS = [
    ("Very Tight", 0.0, 2.0),
    ("Tight", 2.0, 4.0),
    ("Open", 4.0, 6.0),
    ("Wide Open", 6.0, float("inf")),
]

# Release must land near where the record filed the shot, or the trace is not
# describing the dot it claims to describe. Same threshold as bloom.py.
MAX_ANCHOR_RESIDUAL_FT = 6.0
MAX_FLIGHT_SECONDS = 3.0

# The halfcourt box the whole piece is composed in, in tenths of feet.
HALFCOURT_X_TENTHS = 250
HALFCOURT_Y_TENTHS = 420

# Ball-occupancy bands, in feet from the hoop. The same bands the shot record's
# own distance is read in, so dwell and attempts can be set side by side.
OCCUPANCY_BANDS = [(0, 4), (4, 14), (14, 22), (22, 27), (27, 999)]

# How many distinct positions per shot a population must reach before the second
# instrument is said to disperse it.
#
# NOT A TUNED PARAMETER - the three readings it separates span four orders of
# magnitude. Asked of the SAME 2015-16 shots, three different ways:
#
#   the record's own filing of them        1 cell for thousands of shots  ~0.0002
#   the optical feed, sentinel pile                                        ~0.99
#   the optical feed, shots the record placed one by one                    1.00
#
# Anything from about 0.01 to about 0.9 says the same thing. A population the
# feed genuinely saw in one place would sit down at the record's own figure.
DISPERSION_MIN_CELLS_PER_SHOT = 0.5


# --- corpus listing ----------------------------------------------------------

def corpus_entries(cache_ok=True):
    """The 636-archive listing, cached to disk so a 632-game run needs one call."""
    import urllib.request

    cache = WINDOW_DIR / "corpus_listing.json"
    if cache_ok and cache.exists():
        return json.loads(cache.read_text())
    req = urllib.request.Request(CORPUS_API, headers={"Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        entries = json.load(r)
    if not isinstance(entries, list):
        raise RuntimeError(f"unexpected corpus API response: {str(entries)[:200]}")
    slim = [{"name": e["name"], "size": e["size"]} for e in entries]
    cache.parent.mkdir(parents=True, exist_ok=True)
    write_json(cache, slim, compact=True)
    return slim


def archive_date(name):
    """ISO date from an archive name, tolerating the 10 misnamed Dec 5 entries.

    Pattern-filtering on MM.DD.YYYY here is the documented way to silently lose
    the entire Dec 5 2015 slate, so the prefix is stripped rather than matched.
    """
    if name.startswith(MISNAMED_PREFIX):
        name = name[len(MISNAMED_PREFIX):]
    try:
        return datetime.datetime.strptime(name[:10], "%m.%d.%Y").date().isoformat()
    except ValueError:
        return None


def usable_archives(entries):
    """Every archive that holds a game: 636 listed, 4 empty shells, 632 usable."""
    out = []
    for e in entries:
        if not e["name"].endswith(".7z") or e["size"] <= EMPTY_SHELL_BYTES:
            continue
        d = archive_date(e["name"])
        if d is None:
            continue
        out.append({"name": e["name"], "size": e["size"], "date": d})
    return sorted(out, key=lambda x: (x["date"], x["name"]))


# --- parse -------------------------------------------------------------------

def game_frames(game):
    """The game's moments, globally deduplicated and in time order.

    Adjacent events overlap heavily - 2.6x corpus-wide - and the duplication is
    ACROSS events, not within them. Deduplicating per event (as bloom.py does,
    correctly, for its per-event purpose) would double-count every aggregate
    built here: moments, distance run, dwell time, touches. So the dedup is one
    set spanning the whole game.

    Returns (frames, stats) where each frame is
        (period, ts, shot_clock, ball_or_None, [player rows])
    """
    seen = set()
    frames = []
    raw = 0
    row_counts = Counter()
    missing_ball = 0
    null_shot_clock = 0
    ball_z_min, ball_z_max = float("inf"), float("-inf")

    for ev in game["events"]:
        for m in ev["moments"]:
            raw += 1
            period, ts, _gc, sc, _null, pos = m
            if (period, ts) in seen:
                continue
            seen.add((period, ts))
            row_counts[len(pos)] += 1
            if sc is None:
                null_shot_clock += 1
            ball = None
            players = []
            for row in pos:
                if row[0] == -1:
                    ball = row
                else:
                    players.append(row)
            if ball is None:
                missing_ball += 1
            else:
                ball_z_min = min(ball_z_min, ball[4])
                ball_z_max = max(ball_z_max, ball[4])
            frames.append((period, ts, sc, ball, players))

    frames.sort(key=lambda f: (f[0], f[1]))
    diffs = Counter(
        b[1] - a[1] for a, b in zip(frames, frames[1:]) if a[0] == b[0]
    )
    mode_ms = diffs.most_common(1)[0][0] if diffs else None

    # The feed's own spacing, kept rather than reduced to its mode: the
    # discontinuity threshold everything downstream segments on is a multiple of
    # that mode, and a factor is only defensible if the band it lands in can be
    # shown to be empty. So the shape ships and the constant can be argued with.
    gap_hist = Counter()
    for g, n in diffs.items():
        gap_hist[g if g <= 200 else 201] += n

    stats = {
        "events": len(game["events"]),
        "raw_moments": raw,
        "unique_moments": len(seen),
        "duplication_ratio": round(raw / len(seen), 2) if seen else 0.0,
        "rows_per_moment": dict(sorted(row_counts.items())),
        "moments_missing_ball": missing_ball,
        "null_shot_clock": null_shot_clock,
        "ball_z_min": round(ball_z_min, 2) if ball_z_min != float("inf") else None,
        "ball_z_max": round(ball_z_max, 2) if ball_z_max != float("-inf") else None,
        "timestamp_diff_mode_ms": mode_ms,
        "timestamp_diff_hist": {str(k): v for k, v in sorted(gap_hist.items())},
    }
    return frames, stats


def event_frames(event):
    """One event's moments, deduplicated within the event and in time order.

    Per-shot work stays per event on purpose: the eventId IS the join key to the
    shot record, so a shot must be found in the moments the feed filed under it.
    """
    seen = set()
    out = []
    for m in event["moments"]:
        period, ts, _gc, sc, _null, pos = m
        if (period, ts) in seen:
            continue
        seen.add((period, ts))
        ball = None
        players = []
        for row in pos:
            if row[0] == -1:
                ball = row
            else:
                players.append(row)
        out.append((period, ts, sc, ball, players))
    out.sort(key=lambda f: (f[0], f[1]))
    return out


def find_release(frames):
    """Locate rim arrival and release from ball physics alone.

    Arrival: the ball nearest a hoop while up at rim height. Release: walking
    back from there, the last frame the ball was low enough to be in a hand.
    No event label is trusted for the instant - the gesture is read off the
    physics, which is this project's argument stated backwards.

    Same detector as bloom.find_shot, over frames that also carry the bodies.
    """
    best = None
    for i, f in enumerate(frames):
        ball = f[3]
        if ball is None:
            continue
        _pid, _t, x, y, z = ball
        if not (RIM_HEIGHT - 1.5 <= z <= RIM_HEIGHT + 4.0):
            continue
        for hoop_x in (HOOP_RIGHT_X, HOOP_LEFT_X):
            d = math.hypot(x - hoop_x, y - HOOP_Y)
            if d < 2.5 and (best is None or d < best[0]):
                best = (d, i, hoop_x)
    if best is None:
        return None
    _d, arrive_i, hoop_x = best

    lo = max(0, arrive_i - int(MAX_FLIGHT_SECONDS * HZ))
    for i in range(arrive_i, lo, -1):
        ball = frames[i][3]
        if ball is not None and ball[4] < 7.5:
            if i == 0:
                return None
            return i, arrive_i, hoop_x
    return None


def to_shot_frame(x_ft, y_ft, hoop_x):
    """Court feet -> the shot record's own frame: tenths, hoop at the origin.

    Verified against the record rather than assumed: the mirroring between the
    two baskets is correct by a factor of seven (the wrong convention scores
    median 18.7 ft against 2.5 ft), and matched shots carry no systematic
    offset beyond the ball sitting above the shooter's feet (+0.43, +0.68 ft).
    """
    if hoop_x == HOOP_RIGHT_X:
        return (y_ft - HOOP_Y) * 10.0, (HOOP_RIGHT_X - x_ft) * 10.0
    return (HOOP_Y - y_ft) * 10.0, (x_ft - HOOP_LEFT_X) * 10.0


def bucket_of(dist_ft):
    for i, (_name, lo, hi) in enumerate(DEFENDER_BUCKETS):
        if lo <= dist_ft < hi:
            return i
    return len(DEFENDER_BUCKETS) - 1


def hoop_distance(x, y):
    return min(math.hypot(x - HOOP_RIGHT_X, y - HOOP_Y),
               math.hypot(x - HOOP_LEFT_X, y - HOOP_Y))


# --- per-shot derivation -----------------------------------------------------

# How far the tracking event numbering may sit from the shot record's. A narrow
# search is not the conservative choice it looks like: an argmax that lands on
# the edge of the range is the signature of a peak OUTSIDE it, and a narrow
# range hides both the better peak and - worse - its neighbours, which are what
# tell a real offset from a game whose numbering does not correspond at all.
# So the range is wide and the EDGE IS A REJECTION: an offset that wins at the
# boundary is not accepted, it is reported as a search that was still too
# narrow. Widening this therefore cannot quietly launder a bad fit.
MAX_EVENT_OFFSET = 12

# Below this, the record did not really settle the game's event offset and the
# choice is close to a guess. Such games are counted and listed rather than
# quietly folded in with the rest.
WEAK_JOIN_MARGIN = 0.10

# A shifted join must reconcile at least this many times what the straight join
# does, AND beat its own runner-up by this margin. Below either, the shift is
# noise and the game keeps offset 0. A real offset is a spike: one value
# reconciles several times what any other does. Noise is flat across adjacent
# offsets, and accepting its argmax would pair each shot with a NEIGHBOURING
# shot's coordinate - invisible per shot, and `made` is read off the anchor, so
# the field-goal figures would quietly absorb it.
OFFSET_OVER_ZERO = 1.5
OFFSET_MIN_MARGIN = 0.15

# An offset decided by a handful of votes is a guess wearing a ratio's clothes:
# 3 against 1 clears every relative test above and means nothing. So a shift
# must also be carried by an absolute number of shots. Chosen from the measured
# distribution over the population the floor can actually reach - games whose
# argmax is non-zero - rather than rounded to taste. window.json ships that
# distribution under `recovery.votes`, the accepted shifts themselves under
# `recovery.accepted_offsets`, and, crucially, what the second reading COSTS:
# `votes.games_changed_by_alt` re-decides every game from its stored score
# vector at the alternate floor and counts the ones that come out differently.
# If that is zero, the two values are the same rule on this corpus and the
# artifact says so instead of implying a choice was made.
MIN_OFFSET_VOTES = 25
MIN_OFFSET_VOTES_ALT = 40

# Half the game's releases calibrate, the other half validates. A per-game
# integer fitted on ~150 shots and never checked is a fit, not a measurement;
# splitting on the parity of the tracking event id is deterministic, needs no
# seed, and costs one extra scoring pass over releases already in hand.
HELD_OUT_MIN_VOTES = (MIN_OFFSET_VOTES + 1) // 2


OFFSET_SEARCH = tuple(range(-MAX_EVENT_OFFSET, MAX_EVENT_OFFSET + 1))


def reconciles(rec, anchors, off):
    """Does this release land where the record filed the shot `off` events away?"""
    eid, efr, release_i, hoop_x = rec
    a = anchors.get(eid + off)
    if a is None:
        return False
    ball = efr[release_i][3]
    if ball is None:
        return False
    sx, sy = to_shot_frame(ball[2], ball[3], hoop_x)
    return math.hypot(sx - a["loc_x"], sy - a["loc_y"]) / 10.0 <= MAX_ANCHOR_RESIDUAL_FT


def score_offsets(found_shots, anchors):
    """{offset: how many releases it reconciles}, over the whole search range."""
    scores = {off: 0 for off in OFFSET_SEARCH}
    for rec in found_shots:
        for off in OFFSET_SEARCH:
            if reconciles(rec, anchors, off):
                scores[off] += 1
    return scores


def decide_offset(scores, min_votes=MIN_OFFSET_VOTES):
    """Read one integer out of a score vector, or refuse to.

    Returns (offset, detail). Every offset - including zero - faces the same
    four questions, and the answers are reported rather than summarised:

      is the winner on the EDGE of the search?   then the peak is outside it
      is it carried by enough shots?             a 3-to-1 ratio on four shots
                                                 is not evidence
      does it beat the straight join by a real   a shift that barely improves
        factor?                                  on no shift is not a shift
      does it beat its own runner-up?            a flat vector is a game whose
                                                 numbering does not correspond
                                                 at all, not an offset

    A non-zero winner failing any of them is REJECTED, the game keeps offset 0,
    and its shots fail honestly in the recovery ledger rather than being paired
    with a neighbouring shot's coordinate.
    """
    ranked = sorted(scores.items(), key=lambda kv: (-kv[1], abs(kv[0])))
    best, best_n = ranked[0]
    runner_up = ranked[1][1] if len(ranked) > 1 else 0
    at_zero = scores.get(0, 0)
    margin = (best_n - runner_up) / best_n if best_n else 0.0

    reason = None
    if best != 0:
        if abs(best) == MAX_EVENT_OFFSET:
            reason = "argmax on the search boundary"
        elif best_n < min_votes:
            reason = "too few votes"
        elif best_n < OFFSET_OVER_ZERO * max(1, at_zero):
            reason = "no lift over the straight join"
        elif margin < OFFSET_MIN_MARGIN:
            reason = "flat across adjacent offsets"
    if reason:
        best, best_n = 0, at_zero

    return best, {
        "event_offset": best,
        "offset_rejected": reason is not None,
        "reject_reason": reason,
        # WHAT THIS VECTOR NAMED, which is not the same as the offset applied.
        # A rejection names NOTHING: the game keeps the straight join because
        # the evidence for a shift was refused, not because zero was chosen over
        # the alternatives. Collapsing the two - returning `best = 0` and
        # recording it as an answer - let a half that declined to decide be
        # counted as a half that decided, and paired with a genuine straight
        # join as agreement.
        "named": None if reason else best,
        "reconciled_at_best": best_n,
        "reconciled_at_zero": at_zero,
        "argmax": ranked[0][0],
        "argmax_n": ranked[0][1],
        "runner_up": runner_up,
        # How decisively the record settled it. Near 0 means the offset is a
        # guess, and qa.py counts those rather than hiding them.
        "margin": round(margin, 3),
    }


def game_event_offset(found_shots, anchors, searched="wide"):
    """Where this game's event numbering sits relative to the shot record's.

    `tracking eventId == shotdetail GAME_EVENT_ID` holds for most games and
    silently fails for a minority: the two numberings are offset by a small
    constant, so every shot joins to a neighbouring shot's coordinate. It is
    invisible per shot - each anchor is a real coordinate of a real shot, just
    the wrong one - and it destroys the join for those games alone.

    So the offset is CALIBRATED once per game, by letting all of that game's
    detected releases vote for the offset that puts most of them where the
    record independently filed them. That is one small integer per game decided
    by ~150 shots, not a per-shot fit: no shot's release frame is ever chosen
    using the record.

    And a fit that is never checked is not a measurement. Half the releases -
    those at even tracking event ids - calibrate; the other half validates. The
    two halves name the same integer, or different ones, or one of them refuses
    to name anything at all, and which of the three it was ships per game and as
    a corpus rate. The split is only out of sample because `found_shots` is now
    every release in the game: when it was the anchor-selected set, both halves
    inherited the same selection and the straight join reproduced itself 444
    times out of 444.
    """
    scores = score_offsets(found_shots, anchors)
    best, info = decide_offset(scores)

    even = [r for r in found_shots if r[0] % 2 == 0]
    odd = [r for r in found_shots if r[0] % 2 != 0]
    s_even, s_odd = score_offsets(even, anchors), score_offsets(odd, anchors)
    _off_even, d_even = decide_offset(s_even, HELD_OUT_MIN_VOTES)
    _off_odd, d_odd = decide_offset(s_odd, HELD_OUT_MIN_VOTES)
    # The halves are compared on what they NAMED. A half whose argmax was
    # refused named nothing, and nothing cannot agree with an integer; such a
    # game is not testable and is counted as a refusal rather than folded in.
    named_even, named_odd = d_even["named"], d_odd["named"]
    refused = (named_even is None) + (named_odd is None)
    testable = (d_even["reconciled_at_best"] >= HELD_OUT_MIN_VOTES
                and d_odd["reconciled_at_best"] >= HELD_OUT_MIN_VOTES
                and not refused)

    info.update({
        "searched": searched,
        "releases_scored": len(found_shots),
        # The whole vector, not just its winner. A rejection is only legible
        # beside the shape it was rejected for, and this is what the
        # independent rescoring in pipeline/checks/ is checked against.
        "scores": {str(k): v for k, v in sorted(scores.items()) if v},
        "held_out": {
            "calibrated": named_even,
            "validated": named_odd,
            "agree": named_even is not None and named_even == named_odd,
            "testable": testable,
            # How many of the two halves declined to name an offset at all.
            "refused": refused,
            "n_calibrate": d_even["reconciled_at_best"],
            "n_validate": d_odd["reconciled_at_best"],
        },
    })
    return best, info


def measure_shot(frames, release_i, hoop_x):
    """The caliper and its neighbourhood, at one release.

    ONE BODY IS FOLLOWED, and it is chosen once. The shooter is bound at the
    release frame - the player nearest the ball at the instant it leaves the
    hand - and that same player id is then tracked backwards through the gather
    and every frame of the approach. Re-deriving "nearest to the ball" at each
    frame instead, as this did, concatenates fifty-one independent selections
    and calls them one person closing over two seconds: the identity changes
    mid-track, the drawn line teleports, and the gather - the whole point of
    which is to ask whether the SAME measurement moves when the instant moves -
    can end up measuring somebody else. Where the bound body has no row in a
    frame, that frame is None. Nobody is substituted for them.

    The DEFENDER is not bound, and must not be: "closest defender" is a
    relation, and a switch is a real event in it, not an error. So the nearest
    opponent is re-read every frame and each track frame carries an anonymous
    slot index - 0, 1, 2 in order of first appearance - so a change of body is
    visible in the data and the line can be broken at it rather than drawn
    through it.

    Everything is taken at a single frame, which is exactly the thing the league
    leaves undefined: it says "at the time of the shot" and never says which
    instant that is. So the same measure is also taken at the gather, on the
    same bound body, and both ship.
    """
    f0 = frames[release_i]
    if f0[3] is None or not f0[4]:
        return None
    bx, by = f0[3][2], f0[3][3]
    bound = min(f0[4], key=lambda r: (r[2] - bx) ** 2 + (r[3] - by) ** 2)
    shooter_pid, shooter_team = bound[1], bound[0]

    def state(i):
        f = frames[i]
        me = None
        for row in f[4]:
            if row[1] == shooter_pid:
                me = row
                break
        if me is None:
            return None
        opp = [r for r in f[4] if r[0] != shooter_team]
        if not opp:
            return None
        dists = sorted(math.hypot(r[2] - me[2], r[3] - me[3]) for r in opp)
        nearest = min(opp, key=lambda r: math.hypot(r[2] - me[2], r[3] - me[3]))
        return {
            "shooter": (me[2], me[3]),
            "shooter_id": shooter_pid,
            "defender": (nearest[2], nearest[3]),
            "defender_id": nearest[1],
            "dist": dists[0],
            # Spacing: how far the whole defence is from the ball-handler.
            "spacing_mean": sum(dists) / len(dists),
            "n_opponents": len(opp),
        }

    at_release = state(release_i)
    if at_release is None:
        return None
    gather_i = max(0, release_i - GATHER_FRAMES)
    at_gather = state(gather_i)

    # The approach: the same distance sampled backwards at 25 Hz. This is the
    # continuous quantity the four published categories are cut out of.
    #
    # `track` carries the two endpoints as well, not just the length. It is kept
    # only for a handful of hero shots per game and discarded for the rest -
    # enough for the piece to draw ONE caliper closing in real geometry, rather
    # than animating an aggregate curve, which would be inventing motion that
    # no single shot performed. Each frame is
    #   [shooter x, shooter y, defender x, defender y, defender slot]
    # and the fifth element is the whole point: it is how the drawn line knows
    # it is allowed to be continuous.
    approach = []
    track = []
    slots = {}
    switches = 0
    max_shooter_step = max_defender_step = 0.0
    max_gap_ms = 0
    prev = None
    for k in range(int(2.0 * HZ), -1, -1):
        i = release_i - k
        m = state(i) if i >= 0 else None
        if m is None:
            approach.append(None)
            track.append(None)
            prev = None
            continue
        approach.append(round(m["dist"], 2))
        slot = slots.setdefault(m["defender_id"], len(slots))
        sx, sy = to_shot_frame(m["shooter"][0], m["shooter"][1], hoop_x)
        dx, dy = to_shot_frame(m["defender"][0], m["defender"][1], hoop_x)
        track.append([round(sx, 1), round(sy, 1), round(dx, 1), round(dy, 1), slot])
        if prev is not None:
            pm, pslot, pi = prev
            max_shooter_step = max(max_shooter_step, math.hypot(
                m["shooter"][0] - pm["shooter"][0], m["shooter"][1] - pm["shooter"][1]))
            if pslot == slot:
                max_defender_step = max(max_defender_step, math.hypot(
                    m["defender"][0] - pm["defender"][0], m["defender"][1] - pm["defender"][1]))
            else:
                switches += 1
            # Two adjacent rows of `track` are drawn as adjacent instants, so
            # they have to BE adjacent instants. A period change is an infinite
            # gap, not a large one.
            gap = (frames[i][1] - frames[pi][1]) if frames[i][0] == frames[pi][0] else None
            max_gap_ms = 10 ** 9 if gap is None else max(max_gap_ms, gap)
        prev = (m, slot, i)

    return {
        "release": at_release,
        "gather": at_gather,
        "approach": approach,
        "track": track,
        "track_shooter_step": round(max_shooter_step, 2),
        "track_defender_step": round(max_defender_step, 2),
        "track_switches": switches,
        "track_gap_ms": max_gap_ms,
    }


# --- touches, passes, drives -------------------------------------------------

def frame_breaks(frames, gap_max_ms):
    """Indices where the feed is not continuous with the frame before them.

    `game_frames` sorts by (period, timestamp), which makes the list contiguous
    in INDEX and says nothing about whether it is contiguous in TIME. Between
    two adjacent rows there can be a quarter break, a timeout, or a dropout.
    Nothing that integrates over consecutive frames - a touch, a pass, a stride
    - may run across one of these.
    """
    return {
        i for i in range(1, len(frames))
        if frames[i][0] != frames[i - 1][0] or frames[i][1] - frames[i - 1][1] > gap_max_ms
    }


def touch_chains(frames, radius, gap_max_ms):
    """Who had the ball, for how long: [(player_id, team_id, i0, i1), ...].

    AUTHORED. A player has the ball when they are its nearest player and within
    `radius`, sustained for TOUCH_MIN_FRAMES ACROSS UNBROKEN FEED. The league
    publishes "touches" and does not publish this rule; running it at two radii
    is how the piece shows what the rule is worth.

    The chain is cut at every discontinuity. Without that, one "touch" could
    hold the ball through the end of a quarter and out the other side, and
    everything read off touches - passes, drives, seconds per touch - would
    inherit an occasion that never happened.
    """
    breaks = frame_breaks(frames, gap_max_ms)
    out = []
    cur = None

    def close(c):
        if c is not None and c[0] is not None and c[3] - c[2] + 1 >= TOUCH_MIN_FRAMES:
            out.append(tuple(c))

    for i, f in enumerate(frames):
        ball = f[3]
        who = None
        team = None
        if ball is not None and f[4]:
            bx, by = ball[2], ball[3]
            best = min(f[4], key=lambda r: (r[2] - bx) ** 2 + (r[3] - by) ** 2)
            if math.hypot(best[2] - bx, best[3] - by) <= radius:
                who, team = best[1], best[0]
        if cur is not None and cur[0] == who and i not in breaks:
            cur[3] = i
        else:
            close(cur)
            cur = [who, team, i, i]
    close(cur)

    # Drop dead-ball holds: the feed runs through stoppages and free throws with
    # the ball in someone's hands, and counting those as possession would make
    # the mean touch several times what basketball actually looks like.
    max_frames = TOUCH_MAX_SECONDS * HZ
    return [t for t in out if t[3] - t[2] + 1 <= max_frames]


def measure_movement(frames, touches, gap_max_ms):
    """Distance run, passes and drives - the rest of the published suite."""
    breaks = frame_breaks(frames, gap_max_ms)

    # DISTANCE RUN is an integral, and an integral over a discontinuity is
    # fiction. The step filter alone does not catch it: a player who happens to
    # stand within a stride of where they stood one period and five minutes
    # earlier would have that stride counted as running. So the record of where
    # everybody was is dropped at every break, and a stride is only integrated
    # between two frames in which that player was actually recorded, back to
    # back.
    prev = {}
    distance_ft = 0.0
    steps_skipped = 0
    for i, f in enumerate(frames):
        if i in breaks:
            prev.clear()
        for row in f[4]:
            pid, x, y = row[1], row[2], row[3]
            q = prev.get(pid)
            if q is not None and q[2] == i - 1:
                d = math.hypot(x - q[0], y - q[1])
                if d < MAX_STEP_FT:
                    distance_ft += d
                else:
                    steps_skipped += 1
            prev[pid] = (x, y, i)

    # A PASS is the ball leaving one player and reaching a team-mate. Two
    # adjacent touches by team-mates are not that on their own: the feed runs
    # through quarter breaks and dead balls, and the ball can change hands at
    # the scorer's table. Same period, and inside the declared gap.
    passes = passes_alt = 0
    gap_hist = Counter()
    for a, b in zip(touches, touches[1:]):
        if a[1] != b[1] or a[0] == b[0]:
            continue
        fa, fb = frames[a[3]], frames[b[2]]
        if fa[0] != fb[0]:
            continue
        gap = fb[1] - fa[1]
        gap_hist[min(int(gap // 40), 250)] += 1
        if gap <= MAX_PASS_GAP_MS:
            passes += 1
        if gap <= MAX_PASS_GAP_ALT_MS:
            passes_alt += 1

    # A DRIVE is directed. The old reading took the maximum and minimum basket
    # distance over a touch and asked whether one was outside and the other
    # inside, which is true of a player carrying the ball straight out of the
    # paint. Order is the definition: the outside sample has to come FIRST.
    drives = drives_unordered = 0
    for _pid, _team, i0, i1 in touches:
        seen_far = False
        far = near = None
        drove = False
        for i in range(i0, i1 + 1):
            ball = frames[i][3]
            if ball is None:
                continue
            d = hoop_distance(ball[2], ball[3])
            far = d if far is None else max(far, d)
            near = d if near is None else min(near, d)
            if d >= DRIVE_FROM_FT:
                seen_far = True
            elif seen_far and d <= DRIVE_TO_FT:
                drove = True
        if drove:
            drives += 1
        if far is not None and far >= DRIVE_FROM_FT and near <= DRIVE_TO_FT:
            drives_unordered += 1

    durations = sorted((t[3] - t[2] + 1) / HZ for t in touches)
    return {
        "distance_ft": distance_ft,
        "steps_over_max": steps_skipped,
        "passes": passes,
        "passes_alt_gap": passes_alt,
        "pass_gap_hist": {str(k): v for k, v in sorted(gap_hist.items())},
        "drives": drives,
        "drives_unordered": drives_unordered,
        "touches": len(touches),
        "touch_seconds_total": sum(durations),
        "touch_seconds_median": durations[len(durations) // 2] if durations else 0.0,
        "frame_breaks": len(breaks),
    }


def measure_occupancy(frames):
    """Where the ball actually is, against where shots are filed.

    Folded onto the plate's own halfcourt frame, so dwell and attempts can be
    read in the same bands. Available only here, because this is the only
    period with a ball to follow.
    """
    bands = [0] * len(OCCUPANCY_BANDS)
    grid = Counter()
    total = 0
    for f in frames:
        ball = f[3]
        if ball is None:
            continue
        x, y = ball[2], ball[3]
        d = hoop_distance(x, y)
        for bi, (lo, hi) in enumerate(OCCUPANCY_BANDS):
            if lo <= d < hi:
                bands[bi] += 1
                break
        hoop_x = HOOP_RIGHT_X if abs(x - HOOP_RIGHT_X) < abs(x - HOOP_LEFT_X) else HOOP_LEFT_X
        fx, fy = to_shot_frame(x, y, hoop_x)
        if abs(fx) <= HALFCOURT_X_TENTHS and -50 <= fy <= HALFCOURT_Y_TENTHS:
            # 1-ft bins, the same lattice aggregate.py grids attempts on.
            grid[(int(fx // 10), int(fy // 10))] += 1
        total += 1
    return {"bands": bands, "total": total, "grid": grid}


# --- one game ----------------------------------------------------------------

def derive_game(archive_path, anchors_by_game, label):
    """Parse and derive one game. Returns a dict; raises only on real breakage."""
    # Streamed, not unpacked to disk: at 632 games x ~100 MB written and read
    # back, the temp-file route made this stage I/O bound rather than CPU bound.
    blob = read_7z_bytes(archive_path)
    if blob is None:
        with tempfile.TemporaryDirectory() as tmp:
            extract_7z(archive_path, tmp)
            jsons = list(Path(tmp).glob("*.json"))
            if not jsons:
                raise RuntimeError("no JSON in archive")
            blob = jsons[0].read_bytes()
    game = json.loads(blob)
    del blob

    gid = str(game["gameid"])
    frames, stats = game_frames(game)
    anchors = anchors_by_game.get(gid.lstrip("0"), {})

    # The break threshold is read off THIS game's feed, not assumed: a multiple
    # of its own modal spacing, so a game filed at a different rate segments at
    # its own rate rather than at one borrowed from the corpus.
    gap_max_ms = FRAME_GAP_FACTOR * (stats["timestamp_diff_mode_ms"] or (1000 // HZ))

    touches = touch_chains(frames, TOUCH_RADIUS_FT, gap_max_ms)
    touches_alt = touch_chains(frames, TOUCH_RADIUS_ALT_FT, gap_max_ms)
    movement = measure_movement(frames, touches, gap_max_ms)

    measures = []
    corroborated = []
    reasons = Counter()
    disagreement = []
    by_action_total = Counter()
    by_action_agree = Counter()
    joined = 0
    residuals = []
    attribution_agree = attribution_total = 0

    # PASS 1: find the releases. Costed carefully, because this is the most
    # expensive thing the stage does - unpacking every event of every game is
    # roughly as slow as reading the 92 MB of JSON in the first place.
    #
    # The join usually just works, so the usual case pays for the events that
    # already carry a shot and nothing more. Only when that comes out badly is
    # the whole game unpacked to search for an offset, which is the minority
    # of games that need one.
    by_event = {}
    for ev in game["events"]:
        try:
            by_event[int(ev["eventId"])] = ev
        except (KeyError, ValueError, TypeError):
            continue

    def releases_for(eids):
        out = []
        for eid in eids:
            ev = by_event.get(eid)
            if ev is None:
                continue
            efr = event_frames(ev)
            if len(efr) < HZ:
                continue
            found = find_release(efr)
            if found:
                out.append((eid, efr, found[0], found[2]))
        return out

    # EVERY offset is scored on the same evidence, and that evidence is every
    # release the game gives up.
    #
    # This used to be screened by a cheap pass that scored the full range over
    # the releases sitting at ANCHOR event ids, and accepted zero if it won
    # there. Zero cannot lose that comparison. `reconciles` looks up
    # `anchors[eid + off]`, so on a release set BUILT from the anchor keys every
    # member has a candidate anchor at offset 0 by construction, while a rival
    # at +k needs `eid + k` to also be a filed shot. Measured over all 632 anchor
    # sets, that availability is 1.000 at zero against 0.28 at +/-1, 0.45 at
    # +/-2 and 0.29-0.32 elsewhere: the rivals were attenuated two- to fourfold
    # before a single geometric test was applied. 445 games shipped on that
    # vector, and at least one of them - 11.16.2015.BOS.at.HOU, direct
    # {0:38, +1:29, +2:29} - is decided the other way the moment its rivals are
    # allowed to compete ({+1:78, +2:62, +3:47, 0:38}).
    #
    # Unpacking every event of every game costs about a sixth of this stage's
    # parse (measured: 8 games, 42.4 s screened against 49.5 s full), which is
    # not a price worth a comparison that cannot come out any other way. So it
    # is simply always paid, and `join.searched` reads "full" for every game.
    found_shots = releases_for(sorted(by_event))
    offset, join_info = game_event_offset(found_shots, anchors, searched="full")
    occupancy = measure_occupancy(frames)

    # PASS 2: with the join settled, measure.
    # `joined` is every shot the record filed for this game; `detected` is how
    # many of them a release could be found for at the calibrated offset.
    joined = len(anchors)
    detected = 0
    for eid, efr, release_i, hoop_x in found_shots:
        anchor = anchors.get(eid + offset)
        if anchor is None:
            continue
        detected += 1
        ball = efr[release_i][3]
        sx, sy = to_shot_frame(ball[2], ball[3], hoop_x)
        residual = math.hypot(sx - anchor["loc_x"], sy - anchor["loc_y"]) / 10.0

        # THE RECORD DISAGREEING WITH ITSELF - measured, not discarded.
        #
        # These are two NBA records of the same shot, in the same building, on
        # the same night: the coordinate a courtside scorer filed, and where the
        # optical feed says the ball actually left the hand. They part company
        # by a median of several feet, and by much more for shots whose filed
        # location belongs to a body other than the one that last touched the
        # ball - a putback, an alley-oop. That variation is a property of the
        # archive, so it is counted here and shipped rather than thrown away as
        # a failure rate.
        disagreement.append(round(residual, 2))
        by_action_total[anchor["action"]] += 1
        if residual <= MAX_ANCHOR_RESIDUAL_FT:
            by_action_agree[anchor["action"]] += 1

        if residual > MAX_ANCHOR_RESIDUAL_FT:
            reasons["anchor residual too large"] += 1
            continue

        m = measure_shot(efr, release_i, hoop_x)
        if m is None:
            reasons["no bodies at release"] += 1
            continue
        residuals.append(residual)

        # THE CORROBORATED SET, written out rather than thrown away.
        #
        # This is the only place in the pipeline where a tracking event has been
        # checked against the coordinate the record filed independently, and
        # until now that verdict died with the loop. The paint stage then went
        # looking for its own shot - taking the first event of a game that
        # yielded a plausible rim flight and ten complete bodies - and its claim
        # to be painting a corroborated possession was simply untrue. It now
        # reads this list. Private: this file lives under data/window/, which is
        # gitignored, and none of these fields reaches window.json.
        corroborated.append({
            "event_id": eid,
            "release_frame": release_i,
            "hoop_x": hoop_x,
            "anchor_event_id": eid + offset,
            "residual": round(residual, 2),
        })

        # Two independent shooter attributions. The roster join is by name via
        # the shot record; the geometric one is nearest-to-ball. Only their
        # AGREEMENT RATE ships - no identities leave this machine.
        attribution_total += 1
        if anchor.get("player_id") and m["release"]["shooter_id"] == anchor["player_id"]:
            attribution_agree += 1

        rel = m["release"]
        gat = m["gather"]
        fx, fy = to_shot_frame(rel["shooter"][0], rel["shooter"][1], hoop_x)
        dfx, dfy = to_shot_frame(rel["defender"][0], rel["defender"][1], hoop_x)
        measures.append({
            "date": game["gamedate"],
            "x": round(fx, 1), "y": round(fy, 1),
            "dx": round(dfx, 1), "dy": round(dfy, 1),
            "dist": round(rel["dist"], 2),
            "dist_gather": round(gat["dist"], 2) if gat else None,
            "spacing": round(rel["spacing_mean"], 2),
            "bucket": bucket_of(rel["dist"]),
            "bucket_gather": bucket_of(gat["dist"]) if gat else None,
            "made": anchor["made"],
            "shot_clock": efr[release_i][2],
            "approach": m["approach"],
            "residual": round(residual, 2),
            "action": anchor["action"],
            "zone": anchor["zone"],
            "_track": m["track"],
            "_track_shooter_step": m["track_shooter_step"],
            "_track_defender_step": m["track_defender_step"],
            "_track_switches": m["track_switches"],
            "_track_gap_ms": m["track_gap_ms"],
        })

    # Hero candidates: the few whose geometry the record corroborates most
    # tightly, and only those keep their endpoint track. Everything else drops
    # it here, which is what keeps the intermediate from carrying the corpus.
    #
    # Corroboration is necessary and not sufficient. A hero is drawn as ONE
    # confrontation closing over two seconds, so it has to be one: the bound
    # shooter present in every frame and never moving further than a body can
    # in one, the defender continuous wherever the slot does not change, and the
    # frames themselves adjacent in time. Two of the four committed heroes
    # contained jumps no body could make, because nothing was checking.
    def one_confrontation(m):
        return (
            m["_track"] and all(f is not None for f in m["_track"])
            and m["_track_shooter_step"] <= MAX_STEP_FT
            and m["_track_defender_step"] <= MAX_STEP_FT
            and m["_track_gap_ms"] <= gap_max_ms
        )

    complete = [m for m in measures if one_confrontation(m)]
    complete.sort(key=lambda m: m["residual"])
    heroes = complete[:3]
    hero_ids = {id(m) for m in heroes}
    for m in measures:
        if id(m) not in hero_ids:
            for k in ("_track", "_track_shooter_step", "_track_defender_step",
                      "_track_switches", "_track_gap_ms"):
                m.pop(k, None)

    # The failure ledger must account for every shot the record filed, including
    # the ones the tracking feed never gave an event for at all - otherwise the
    # recovery rate quietly measures a smaller denominator than it claims to.
    if joined > detected:
        reasons["no tracking event"] = joined - detected

    residuals.sort()
    return {
        "game_id": gid,
        "label": label,
        "date": game["gamedate"],
        "parse": stats,
        "joined_shots": joined,
        "measured": len(measures),
        "failures": dict(reasons),
        "anchor_residual_median": residuals[len(residuals) // 2] if residuals else None,
        "anchor_residual_p95": residuals[int(len(residuals) * 0.95)] if residuals else None,
        "attribution_agree": attribution_agree,
        "attribution_total": attribution_total,
        "join": join_info,
        "event_offset": offset,
        "gap_max_ms": gap_max_ms,
        # Every shot this game corroborated, for the paint stage to take one
        # FROM rather than go looking for its own. Private to data/window/.
        "corroborated": corroborated,
        "detected": detected,
        "disagreement_ft": disagreement,
        "by_action_total": dict(by_action_total),
        "by_action_agree": dict(by_action_agree),
        "movement": movement,
        "touches_alt": len(touches_alt),
        "occupancy_bands": occupancy["bands"],
        "occupancy_total": occupancy["total"],
        "occupancy_grid": {f"{k[0]},{k[1]}": v for k, v in occupancy["grid"].items()},
        "measures": measures,
    }


# --- the probe gate ----------------------------------------------------------

def probe_gate():
    """Reproduce data/processed/sportvu_probe.json exactly, or stop.

    This is the blocking gate for the whole stage, and it is deliberately not
    this stage's own output: it is a fixture already committed to git, so it can
    only fail if the parse here is genuinely wrong.
    """
    fixture_path = PROCESSED_DIR / "sportvu_probe.json"
    if not fixture_path.exists():
        die(f"{fixture_path} missing - run pipeline/sportvu_probe.py first")
    want = json.loads(fixture_path.read_text())["game_measurements"]

    archive = SPORTVU_DIR / PROOF_NAME
    if not archive.exists() or archive.stat().st_size < 1024:
        download(CORPUS_RAW + PROOF_NAME, archive)

    with tempfile.TemporaryDirectory() as tmp:
        extract_7z(archive, tmp)
        jsons = list(Path(tmp).glob("*.json"))
        if not jsons:
            die("proof archive holds no JSON")
        game = json.loads(jsons[0].read_text())
    _frames, got = game_frames(game)

    failures = []

    def check(name, g, w):
        ok = g == w
        print(f"  {'PASS' if ok else 'FAIL'}  {name}: got {g}, expected {w}")
        if not ok:
            failures.append(name)

    print("Probe gate - window.py's parse vs the committed fixture")
    check("events", got["events"], want["events"])
    check("raw moments", got["raw_moments"], want["raw_moments"])
    check("unique moments (global dedup)", got["unique_moments"], want["unique_moments"])
    check("duplication ratio", got["duplication_ratio"], want["duplication_ratio"])
    check("rows per moment", got["rows_per_moment"],
          {int(k): v for k, v in want["rows_per_moment"].items()})
    check("moments missing ball", got["moments_missing_ball"], want["moments_missing_ball"])
    check("null shot clock", got["null_shot_clock"], want["null_shot_clock"])
    check("ball z min", got["ball_z_min"], want["ball_z_min"])
    check("ball z max", got["ball_z_max"], want["ball_z_max"])
    check("timestamp diff mode (ms)", got["timestamp_diff_mode_ms"], want["timestamp_diff_mode_ms"])

    if failures:
        print(f"\nGATE RED: {len(failures)} mismatch(es). The parse is wrong, not the fixture.")
        sys.exit(1)
    print("\nGATE GREEN: window.py reproduces the probe fixture exactly.")


# --- mirror ------------------------------------------------------------------

def mirror(archives, force=False):
    """Fetch every archive with a sha256, merging into the manifest.

    Merge, never truncate: a subset run must not erase the checksummed
    provenance for the games it did not touch - the same bug already fixed
    once in acquire.py.
    """
    SPORTVU_DIR.mkdir(parents=True, exist_ok=True)
    manifest_path = PROCESSED_DIR / "window_manifest.json"
    files = {}
    if manifest_path.exists():
        files = json.loads(manifest_path.read_text()).get("files", {})

    fetched = 0
    for i, a in enumerate(archives, 1):
        dest = SPORTVU_DIR / a["name"]
        if force or not dest.exists() or dest.stat().st_size < 1024:
            download(CORPUS_RAW + a["name"], dest)
            fetched += 1
        if a["name"] not in files or force:
            files[a["name"]] = {
                "date": a["date"],
                "bytes": dest.stat().st_size,
                "sha256": sha256_file(dest),
            }
        if i % 50 == 0 or i == len(archives):
            print(f"  mirrored {i}/{len(archives)} ({fetched} fetched)")

    write_json(manifest_path, {
        "generated_by": "pipeline/window.py",
        "fetched_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "provenance": PROVENANCE,
        "files": dict(sorted(files.items())),
    })
    return files


# --- worker ------------------------------------------------------------------

_ANCHORS = None


def _init_worker(anchors):
    global _ANCHORS
    _ANCHORS = anchors


def _run_one(spec):
    name, label, out_path = spec
    try:
        rec = derive_game(SPORTVU_DIR / name, _ANCHORS, label)
        rec["archive"] = name
        write_json(Path(out_path), rec, compact=True)
        return name, rec["measured"], rec["joined_shots"], None
    except Exception as e:  # noqa: BLE001 - one bad archive must cost one game
        return name, 0, 0, f"{type(e).__name__}: {e}"


def load_anchors():
    """2015-16 shot record, keyed game -> event, for the geometric join check."""
    cols = ["GAME_ID", "GAME_EVENT_ID", "LOC_X", "LOC_Y", "PLAYER_ID",
            "ACTION_TYPE", "SHOT_ZONE_BASIC", "SHOT_MADE_FLAG"]
    shots = read_season_csv(WINDOW_SEASON_YEAR, usecols=cols)
    shots["gid"] = shots.GAME_ID.astype(str).str.lstrip("0")
    out = {}
    for r in shots.itertuples():
        out.setdefault(r.gid, {})[int(r.GAME_EVENT_ID)] = {
            "loc_x": int(r.LOC_X),
            "loc_y": int(r.LOC_Y),
            "player_id": int(r.PLAYER_ID),
            "action": r.ACTION_TYPE,
            "zone": r.SHOT_ZONE_BASIC,
            "made": int(r.SHOT_MADE_FLAG),
        }
    return out


# --- reduce ------------------------------------------------------------------

# Per-shot record in window_measures.bin. Shooter and defender in the shot
# record's own frame (tenths, hoop at origin), the caliper's length, and the
# category it was filed under. No player identities and no trajectories: the
# frame-level record never leaves this machine (CLAUDE.md data rights).
MEASURE_REC = "<hhhhHBBB"  # x, y, dx, dy, dist_tenths, bucket, made, day
MEASURE_BYTES = 13

# The caliper's field ceiling, in tenths of a foot.
#
# This was one byte - 25.5 ft - under a comment claiming no defender the caliper
# draws is further away than that. The comment was false by 26.35 ft: 30 of
# 48,330 records had endpoint geometries beyond 25.5 ft and all of them collapsed
# onto the same byte, the longest of them 51.85 ft (audit F-05). A uint16 costs
# one byte per record and cannot be reached by anything on a basketball floor -
# the longest diagonal of a 94 x 50 ft court is ~106 ft, or 1,065 tenths - so the
# encoding no longer decides anything. Reaching this ceiling is now a hard stop
# rather than a silent clip, and qa.py gates every stored length against the two
# endpoints stored beside it.
DIST_TENTHS_MAX = 65535


def _pct(sorted_or_not, q):
    """A percentile, or None when there is nothing to take one of."""
    if not sorted_or_not:
        return None
    v = sorted(sorted_or_not)
    return round(v[min(len(v) - 1, int(len(v) * q))], 2)


def _dispersion(rows, label, filed):
    """How many places a second instrument puts a population the record filed."""
    if not rows:
        return {"label": label, "n": 0, "filed": filed}
    xs = [r[0] for r in rows]
    ys = [r[1] for r in rows]
    dist = sorted(math.hypot(x, y) / 10.0 for x, y in rows)
    cells = Counter(rows)
    busiest = cells.most_common(1)[0][1]
    n = len(rows)
    return {
        "label": label,
        # How many of these the record filed across the parsed games, and how
        # many the tracking stage recovered. The recovery rate is here so a
        # population the detector finds harder than average cannot pass itself
        # off as evidence.
        "filed": filed,
        "n": n,
        "recovery": round(n / filed, 4) if filed else None,
        "distinct_cells": len(cells),
        # THE STATISTIC. One position per shot means the feed placed every one
        # of them separately; a population it saw in one place would sit at 1/n.
        "cells_per_shot": round(len(cells) / n, 4),
        "busiest_cell_n": busiest,
        "busiest_cell_share": round(busiest / n, 5),
        "sd_x_ft": round(statistics.pstdev(xs) / 10.0, 3),
        "sd_y_ft": round(statistics.pstdev(ys) / 10.0, 3),
        "median_dist_ft": round(statistics.median(dist), 3),
        "p90_dist_ft": round(dist[int(0.9 * (n - 1))], 3),
    }


def measure_sentinel_corroboration(anchors):
    """Does a SECOND INSTRUMENT see the sentinel pile spread out?

    THE CLAIM THIS EARNS. `seasons.json` says the record refuses to place a
    named category of shot, and files the refusal on one coordinate. Until this
    ran, that rested on a single read of one database - every other source
    available today, including a live stats.nba.com query, is another read of
    the SAME database. The SportVU optical feed is a different instrument, and
    2015-16 is both the window season and one of the six seasons that file a
    displaced pile, so the archive can be asked the question twice.

    THE METHOD, AND ITS ONE LOAD-BEARING SEPARATION. The join between the two
    instruments constrains THE BALL: `reconciles` above tests where the ball was
    at release against the coordinate the record filed, within
    MAX_ANCHOR_RESIDUAL_FT. The evidence here is THE SHOOTER'S FEET - the `x, y`
    of `measures[]`, which the join never looks at. So a dispersed distribution
    of feet cannot be an artefact of the tolerance that admitted the shot.

    THE CONTROL IS LIKE-FOR-LIKE, and it has to be, because the pile is ~99%
    dunks and the dunk family is exactly where this project's own release
    detector is weakest (`disagreement.by_action` puts Alley Oop Dunk at 0.098).
    So the comparison is against restricted-area dunks the record placed
    INDIVIDUALLY - same instrument, same season, same games, same action family,
    same detector. Any weakness in the detector applies equally to both.

    THE SCOPE LIMIT SHIPS WITH THE RESULT rather than being buried: SportVU
    covers ONE of the six affected seasons, and only the part of that season the
    corpus parsed. `filed` beside `filed_season` is that limit in numbers.
    """
    sentinel_coord, season, filed_season = _sentinel_under_test()
    if sentinel_coord is None:
        return None
    sx, sy = sentinel_coord

    sent, ctrl = [], []
    filed_sent = filed_ctrl = 0
    games = 0
    for path in sorted(GAMES_DIR.glob("*.json")):
        d = json.loads(path.read_text())
        ga = anchors.get(str(d["game_id"]).lstrip("0"))
        if ga is None:
            continue
        games += 1
        for a in ga.values():
            if (a["loc_x"], a["loc_y"]) == (sx, sy):
                filed_sent += 1
            elif "Dunk" in a["action"] and a["zone"] == "Restricted Area":
                filed_ctrl += 1

        corr, meas = d["corroborated"], d["measures"]
        if len(corr) != len(meas):
            die(f"{path.name}: corroborated/measures are not index-aligned "
                f"({len(corr)} vs {len(meas)})")
        for c, m in zip(corr, meas):
            a = ga.get(c["anchor_event_id"])
            if a is None:
                continue
            feet = (round(m["x"], 1), round(m["y"], 1))
            if (a["loc_x"], a["loc_y"]) == (sx, sy):
                sent.append(feet)
            elif "Dunk" in a["action"] and a["zone"] == "Restricted Area":
                ctrl.append(feet)

    s = _dispersion(sent, f"the record filed these at ({sx},{sy})", filed_sent)
    c = _dispersion(ctrl, "restricted-area dunks the record placed individually", filed_ctrl)

    # The record's own answer to the same question, over the same shots: one
    # coordinate, however many shots. This is the null the feed is measured
    # against, and it is a measurement rather than an assumption.
    record_cells_per_shot = round(1 / filed_sent, 6) if filed_sent else None

    dispersed = bool(s["n"] and s["cells_per_shot"] >= DISPERSION_MIN_CELLS_PER_SHOT)
    # AND THE FEED AGREES THEY ARE RIM SHOTS. If it did not - if these shots
    # happened somewhere else entirely - the record would not be DECLINING to
    # place them, it would be placing them WRONGLY, which is a different finding
    # and a different mark on the plate. Asked like-for-like rather than against
    # an absolute radius: the pile must sit inside the spread of the dunks the
    # record placed one by one.
    at_the_rim = bool(s["n"] and c["n"] and s["median_dist_ft"] <= c["p90_dist_ft"])

    return {
        "season": season,
        "coord": [sx, sy],
        "games": games,
        "filed_season": filed_season,
        "instrument": "SportVU optical tracking, 2015-16 public release",
        "evidence": "the shooter's feet at release, which the join does not constrain",
        "record_cells_per_shot": record_cells_per_shot,
        "sentinel": s,
        "control": c,
        "dispersed": dispersed,
        "at_the_rim": at_the_rim,
        "corroborated": bool(dispersed and at_the_rim),
    }


def _sentinel_under_test():
    """The coordinate to corroborate, read from the artifact that measured it.

    Never hardcoded here: the stage that finds the sentinel is aggregate.py, and
    a second copy of the coordinate in this file could go stale against it
    without anything noticing. Same pattern facts.py uses on timeline.ts.
    """
    path = PROCESSED_DIR / "seasons.json"
    if not path.exists():
        die("seasons.json missing - run pipeline/aggregate.py before this stage")
    seasons = json.loads(path.read_text())["seasons"]
    row = next((r for r in seasons if r["year"] == WINDOW_SEASON_YEAR), None)
    if row is None:
        die(f"seasons.json has no {WINDOW_SEASON_YEAR} row to corroborate")
    sent = row["resolution"]["rim_sentinel"]
    if not sent or not sent["is_refusal"]:
        return None, row["season"], 0
    return tuple(sent["coord"]), row["season"], int(sent["n"])


def reduce_all():
    """Fold the per-game artifacts into the two shipped artifacts."""
    import struct

    paths = sorted(GAMES_DIR.glob("*.json"))
    if not paths:
        die(f"no per-game artifacts in {GAMES_DIR} - run the derive stage first")

    games = []
    measures = []
    reasons = Counter()
    disagreement = []
    by_action_total = Counter()
    by_action_agree = Counter()
    joined = measured = 0
    attribution_agree = attribution_total = 0
    residuals = []
    offsets = Counter()
    weak_joins = []
    rejected_offsets = 0
    reject_reasons = Counter()
    votes = []
    held_out_agree = held_out_testable = held_out_refused = 0
    held_out_by = {"straight": [0, 0], "shifted": [0, 0], "rejected": [0, 0]}
    accepted_offsets = []
    argmax_votes = []
    alt_changed = []
    searched_kinds = Counter()
    frame_gap_hist = Counter()
    pass_gap_hist = Counter()

    moments = body_positions = 0
    distance_ft = 0.0
    touches = touches_alt = passes = drives = 0
    passes_alt = drives_unordered = steps_over_max = frame_breaks = 0
    touch_seconds = 0.0
    occupancy_bands = [0] * len(OCCUPANCY_BANDS)
    occupancy_total = 0
    occupancy_grid = Counter()
    approach_sum = [0.0] * (int(2.0 * HZ) + 1)
    approach_n = [0] * (int(2.0 * HZ) + 1)
    bucket_counts = [0] * len(DEFENDER_BUCKETS)
    bucket_made = [0] * len(DEFENDER_BUCKETS)
    hero_pool = []
    disagreement = []
    by_action_total = Counter()
    by_action_agree = Counter()
    gather_moved = 0
    gather_n = 0
    gather_delta_sum = 0.0
    dates = set()

    for p in paths:
        g = json.loads(p.read_text())
        games.append({"game_id": g["game_id"], "date": g["date"], "archive": g.get("archive"),
                      "joined": g["joined_shots"], "measured": g["measured"]})
        dates.add(g["date"])
        joined += g["joined_shots"]
        measured += g["measured"]
        for k, v in g["failures"].items():
            reasons[k] += v
        attribution_agree += g["attribution_agree"]
        attribution_total += g["attribution_total"]
        jn = g.get("join")
        if jn:
            offsets[jn["event_offset"]] += 1
            votes.append(jn["reconciled_at_best"])
            searched_kinds[jn.get("searched") or "unstated"] += 1
            if jn.get("offset_rejected"):
                rejected_offsets += 1
                reject_reasons[jn.get("reject_reason") or "unstated"] += 1
            if jn["margin"] < WEAK_JOIN_MARGIN:
                weak_joins.append({"archive": g.get("archive"), "offset": jn["event_offset"],
                                   "margin": jn["margin"]})
            # EVERY accepted shift, with the four numbers its acceptance turned
            # on. qa.py re-applies the rule to these rather than reading a
            # summary of it, so a gate on the vote floor can actually fail.
            if jn["event_offset"] != 0:
                accepted_offsets.append({
                    "archive": g.get("archive"),
                    "offset": jn["event_offset"],
                    "votes": jn["reconciled_at_best"],
                    "at_zero": jn["reconciled_at_zero"],
                    "runner_up": jn["runner_up"],
                    "margin": jn["margin"],
                })
            # The vote floor only ever binds on a game whose argmax is non-zero;
            # over all 632 games the distribution is dominated by the straight
            # joins the rule never touches, which is what made the shipped
            # `games_under_min` unreadable. This is the population it acts on.
            if jn.get("argmax", 0) != 0:
                argmax_votes.append(jn["argmax_n"])
            # What the alternate floor would actually cost, recomputed from the
            # stored vector rather than inferred from a count.
            sc = jn.get("scores") or {}
            if sc:
                vec = {off: 0 for off in OFFSET_SEARCH}
                for k, v in sc.items():
                    if int(k) in vec:
                        vec[int(k)] = v
                alt_off, _alt = decide_offset(vec, MIN_OFFSET_VOTES_ALT)
                if alt_off != jn["event_offset"]:
                    alt_changed.append(g.get("archive"))
            ho = jn.get("held_out") or {}
            held_out_refused += ho.get("refused", 0)
            if ho.get("testable"):
                held_out_testable += 1
                held_out_agree += 1 if ho.get("agree") else 0
                # Split by what the game decided. One aggregate rate would be
                # carried by the games that needed no offset at all, which is
                # the easy half of the question.
                kind = ("rejected" if jn.get("offset_rejected")
                        else "shifted" if jn["event_offset"] else "straight")
                held_out_by[kind][1] += 1
                held_out_by[kind][0] += 1 if ho.get("agree") else 0
        disagreement.extend(g.get("disagreement_ft", []))
        for k, v in g.get("by_action_total", {}).items():
            by_action_total[k] += v
        for k, v in g.get("by_action_agree", {}).items():
            by_action_agree[k] += v

        st = g["parse"]
        moments += st["unique_moments"]
        for rows, n in st["rows_per_moment"].items():
            # A moment holds the ball plus its bodies; the ball is not a body.
            body_positions += (int(rows) - 1) * n
        for k, v in st.get("timestamp_diff_hist", {}).items():
            frame_gap_hist[int(k)] += v
        mv = g["movement"]
        distance_ft += mv["distance_ft"]
        touches += mv["touches"]
        touches_alt += g["touches_alt"]
        passes += mv["passes"]
        passes_alt += mv.get("passes_alt_gap", 0)
        drives += mv["drives"]
        drives_unordered += mv.get("drives_unordered", 0)
        steps_over_max += mv.get("steps_over_max", 0)
        frame_breaks += mv.get("frame_breaks", 0)
        touch_seconds += mv["touch_seconds_total"]
        for k, v in mv.get("pass_gap_hist", {}).items():
            pass_gap_hist[int(k)] += v

        for i, v in enumerate(g["occupancy_bands"]):
            occupancy_bands[i] += v
        occupancy_total += g["occupancy_total"]
        for k, v in g["occupancy_grid"].items():
            occupancy_grid[k] += v

        for m in g["measures"]:
            residuals.append(m["residual"])
            b = m["bucket"]
            bucket_counts[b] += 1
            bucket_made[b] += m["made"]
            for i, v in enumerate(m["approach"]):
                if v is not None:
                    approach_sum[i] += v
                    approach_n[i] += 1
            if m["bucket_gather"] is not None:
                gather_n += 1
                gather_delta_sum += m["dist_gather"] - m["dist"]
                if m["bucket_gather"] != b:
                    gather_moved += 1
            if "_track" in m:
                hero_pool.append(m)
            measures.append(m)

    # Chronological, so the flood on screen runs as the eleven weeks did - and
    # ONLY chronological. Sorting within a day by position made the flood's
    # leading edge a vertical band sweeping across the floor, which is a fact
    # about the sort rather than about the record. Python's sort is stable, so
    # shots inside a day keep the order their games were reduced in, which is
    # spatially arbitrary and therefore honest.
    measures.sort(key=lambda m: m["date"])
    # The measured caliper distribution, at full precision - taken before the
    # pack rounds it into tenths, so the reference the renderer scales against
    # is the measurement and not the storage.
    caliper_ft = [m["dist"] for m in measures]
    day0 = min(dates) if dates else None
    blob = bytearray()
    for m in measures:
        d = datetime.date.fromisoformat(m["date"]) - datetime.date.fromisoformat(day0)
        # No clip. A caliper that cannot fit the field is a measurement this
        # stage does not understand, and the honest response to that is to stop,
        # not to file it at the ceiling and let the renderer read the ceiling as
        # a distance.
        dist_tenths = int(round(m["dist"] * 10))
        if not 0 <= dist_tenths < DIST_TENTHS_MAX:
            die(f"caliper {m['dist']:.2f} ft does not fit {MEASURE_REC} - "
                f"{dist_tenths} tenths against a ceiling of {DIST_TENTHS_MAX}")
        blob += struct.pack(
            MEASURE_REC,
            int(round(m["x"])), int(round(m["y"])), int(round(m["dx"])), int(round(m["dy"])),
            dist_tenths, m["bucket"], m["made"], min(255, d.days),
        )
    bin_path = PROCESSED_DIR / "window_measures.bin"
    bin_path.parent.mkdir(parents=True, exist_ok=True)
    bin_path.write_bytes(bytes(blob))

    residuals.sort()
    n = len(residuals)
    approach = [round(approach_sum[i] / approach_n[i], 2) if approach_n[i] else None
                for i in range(len(approach_sum))]

    # Four hero shots, one per published category, so the piece's opening beat
    # shows the SAME measure landing in each of the four boxes. Chosen by the
    # tightest corroboration with the record, not by how they look.
    #
    # The continuity gate is applied here as well as per game, so a hero cannot
    # arrive through a stale intermediate: the piece draws this as one body
    # closing on another, and a track containing a step no body could take in
    # 40 ms is not that. Where the defender slot changes, the change is marked
    # in the fifth element of each frame rather than smoothed over.
    heroes = []
    for bi in range(len(DEFENDER_BUCKETS)):
        pool = sorted((m for m in hero_pool
                       if m["bucket"] == bi
                       and m.get("_track_shooter_step", 1e9) <= MAX_STEP_FT
                       and m.get("_track_defender_step", 1e9) <= MAX_STEP_FT),
                      key=lambda m: m["residual"])
        if pool:
            h = pool[0]
            heroes.append({
                "bucket": bi,
                "bucket_name": DEFENDER_BUCKETS[bi][0],
                "date": h["date"],
                "action": h["action"],
                "zone": h["zone"],
                "made": h["made"],
                "dist": h["dist"],
                "dist_gather": h["dist_gather"],
                "residual": h["residual"],
                "hz": HZ,
                # [shooter x, shooter y, defender x, defender y, defender slot]
                # per frame, in the shot record's own frame, for the 2 s before
                # release. The shooter is one bound body throughout. The slot is
                # an anonymous counter, 0 upward in order of first appearance:
                # where it changes, the nearest defender is a different person
                # and the line between those two frames is not a movement.
                "track": h["_track"],
                "defender_switches": h["_track_switches"],
                "max_shooter_step_ft": h["_track_shooter_step"],
                "max_defender_step_ft": h["_track_defender_step"],
            })

    entries = corpus_entries()
    listed = [e for e in entries if e["name"].endswith(".7z")]
    shells = sorted(e["name"] for e in entries if e["size"] <= EMPTY_SHELL_BYTES)
    misnamed = sorted(e["name"] for e in entries if e["name"].startswith(MISNAMED_PREFIX))

    seasons = json.loads((PROCESSED_DIR / "seasons.json").read_text())["seasons"]
    season15 = next(s for s in seasons if s["year"] == WINDOW_SEASON_YEAR)

    # WHAT THE INSTRUMENT PREFERS - measured, and not a small effect.
    #
    # A release is only found by following the ball back from the rim, so a shot
    # that reaches the rim is far likelier to be recovered than one that does
    # not. Made shots all reach the rim; airballs and long misses need not. The
    # recovered set therefore shoots better than the league did, and every
    # figure derived from it inherits that. This is exactly the piece's own
    # subject - the instrument decides what can be counted - so it is measured
    # and shipped rather than quietly carried.
    made_total = sum(bucket_made)
    fg_measured = made_total / measured if measured else None
    bias_share = round(measured / season15["attempts"], 4)
    bias_fg_m = round(100 * fg_measured, 1) if fg_measured else None
    bias_fg_s = round(100 * season15["fg_pct"], 1)
    bias = {
        "measured_attempts": measured,
        "season_attempts": season15["attempts"],
        "share_of_season": bias_share,
        "fg_pct_measured": bias_fg_m,
        "fg_pct_season": bias_fg_s,
        "fg_pct_gap": round(100 * (fg_measured - season15["fg_pct"]), 1) if fg_measured else None,
        "why": (
            "a release is recovered by following the ball back from the rim, so shots that "
            "reach the rim are over-represented and made shots all reach it; the recovered set "
            "shoots better than the league did and every figure taken from it inherits that"
        ),
        # DISPLAY-BOUND, and templated the way seasons.json's season notes are:
        # every numeral below is one of the measured values above, formatted, so
        # the wall text cannot drift from the measurement and a re-run updates
        # it. `why` is the full statement and is too long for the plate; these
        # are what THE MEASURE and THE LEDGER actually draw, so the piece
        # discloses the selection in the same frame as any figure taken from it
        # rather than composing a sentence of its own (audit F-12).
        "scope": (
            f"RECOVERED SET · {100 * bias_share:.1f}% OF THE SEASON"
            if measured else None
        ),
        "disclosure": [
            f"{measured:,} RECOVERED SHOTS · {100 * bias_share:.1f}% OF THE SEASON",
            f"FOUND FROM THE RIM · THEY GO IN {bias_fg_m}% AGAINST THE SEASON'S {bias_fg_s}%",
        ] if measured else [],
    }

    out = {
        "generated_by": "pipeline/window.py",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "provenance": PROVENANCE,
        "definitions": {
            "_authored": (
                "The league does not publish its rules for these measures. Every definition below "
                "is authored here, and each is also computed under a second defensible rule so the "
                "disagreement can be read beside the number. These figures are NOT the league's."
            ),
            "closest_defender": (
                "nearest opposing player to the SHOOTER, in 2D, at the frame the ball leaves the "
                "hand. THE SUBJECT IS THE GEOMETRIC SHOOTER, not the player the record filed the "
                "shot under: the body nearest the ball at the release frame is bound there and "
                "then followed backwards through the gather and the whole approach, so both "
                "instants and every frame between them describe one person. Where that body has "
                "no row in a frame the frame is empty rather than filled with somebody else. The "
                "two attributions are independent and their agreement rate ships as "
                "recovery.attribution_agreement; the defender is deliberately NOT bound, because "
                "a switch is a real event in a closing distance, and each track frame carries an "
                "anonymous defender slot so a change of body is visible instead of drawn through. "
                f"Also taken at the gather {GATHER_FRAMES} frames ({GATHER_FRAMES / HZ:.1f} s) "
                "earlier, on that same bound body"
            ),
            "buckets": "the league's own four published categories: 0-2, 2-4, 4-6, 6+ ft",
            "sentinel_corroboration": (
                "the one measurement in this file whose subject is the SHOT RECORD rather than "
                "the tracking feed. seasons.json says the record files a whole category of shot "
                "on a single coordinate; that rested on one read of one database, and every "
                "other source available today - including a live stats.nba.com query - is "
                "another read of the SAME database. This asks a DIFFERENT INSTRUMENT. The join "
                "between the two constrains the BALL (reconciles tests the ball at release "
                f"against the filed coordinate within {MAX_ANCHOR_RESIDUAL_FT:g} ft); the "
                "evidence here is the SHOOTER'S FEET, which the join never looks at, so a "
                "dispersed result cannot be an artefact of the tolerance that admitted the shot. "
                "The control is like-for-like because it has to be - the pile is almost entirely "
                "dunks and the dunk family is where this project's own release detector is "
                "weakest (see disagreement.by_action) - so it is restricted-area dunks the "
                "record placed individually: same instrument, same season, same games, same "
                "action family, same detector. `dispersed` reads `cells_per_shot` against "
                f"{DISPERSION_MIN_CELLS_PER_SHOT:g}, which separates readings four orders of "
                "magnitude apart. `at_the_rim` asks the other half of the question - if the feed "
                "put these shots somewhere else entirely the record would be placing them "
                "WRONGLY rather than declining to place them - and asks it like-for-like, "
                "against the control's own spread rather than an absolute radius. SCOPE, stated "
                "rather than buried: the public tracking release covers ONE of the six seasons "
                "that file a displaced pile, and `sentinel.filed` against `filed_season` is how "
                "much of that season the corpus reaches"
            ),
            "hero": (
                "one of the four shots the opening beat draws, one per published category, "
                "chosen by the tightest corroboration with the record. A hero must BE one "
                "confrontation: a complete track, no frame gap, and no step over "
                f"{MAX_STEP_FT} ft between consecutive frames - for the bound shooter or "
                "within any one defender slot - because 40 ms of feed cannot carry a body "
                "further than that and a track that says otherwise is two bodies spliced. "
                "The same limit governs `distance_run`; it is stated here as well so the "
                "figure the continuity of a drawn track rests on is disclosed where the "
                "track is defined"
            ),
            "touch": (
                f"ball within {TOUCH_RADIUS_FT} ft of its nearest player for at least "
                f"{TOUCH_MIN_FRAMES} frames ({TOUCH_MIN_FRAMES / HZ:.1f} s) and at most "
                f"{TOUCH_MAX_SECONDS} s, across UNBROKEN FEED: the chain is cut at every period "
                f"change and at every gap wider than {FRAME_GAP_FACTOR}x the feed's own modal "
                "frame spacing, so no touch spans a quarter break or a dropout; also computed at "
                f"{TOUCH_RADIUS_ALT_FT} ft"
            ),
            "drive": (
                f"one touch in which the ball is sampled at or beyond {DRIVE_FROM_FT} ft from a "
                f"hoop and then, LATER IN THE SAME TOUCH, at or within {DRIVE_TO_FT} ft. Order is "
                "part of the definition: taking a maximum and a minimum over the touch, as this "
                "did, counts a player carrying the ball away from the rim as driving to it. "
                "`inventory.drives_unordered` is that undirected reading, kept so the difference "
                "can be read"
            ),
            "pass": (
                "two consecutive touches by different players of the same team, in the same "
                f"period, no more than {MAX_PASS_GAP_MS} ms apart. The gap is authored and the "
                "distribution it was drawn from ships as `pass_gap_ms`: it is single-peaked with "
                "a long flat dead-ball tail, and this is that distribution's p90. "
                f"`inventory.passes_alt_gap` counts the same events at {MAX_PASS_GAP_ALT_MS} ms, "
                "where the density falls to within an order of magnitude of the tail"
            ),
            "distance_run": (
                "summed per-player displacement between two frames in which that player was "
                "actually recorded, back to back, within one unbroken stretch of feed. Steps over "
                f"{MAX_STEP_FT} ft are dropped as gaps or identity swaps, and every player's last "
                "position is forgotten at a period change or a dropout - without that, a player "
                "standing near where they stood one period earlier has the difference counted as "
                "running"
            ),
            "occupancy": (
                "where the BALL is, per frame, in the same distance bands the shot record's own "
                "attempts are read in - available only here, because this is the only period "
                "with a ball to follow"
            ),
            "recovery": (
                "a shot is measured only if a release found from physics lands within "
                f"{MAX_ANCHOR_RESIDUAL_FT} ft of where the record independently filed it; the "
                "join is checked by geometry, never asserted"
            ),
            "recovery.failures.no tracking event": (
                "the record filed a shot for which no release could be recovered from the feed "
                "at this game's calibrated event offset - either the feed carries no event for "
                "it, or it carries one in which no ball reached the rim"
            ),
            "recovery.failures.anchor residual too large": (
                f"a release was found but landed more than {MAX_ANCHOR_RESIDUAL_FT} ft from the "
                "filed coordinate; see `disagreement`, which counts these rather than discarding "
                "them - most are the two records genuinely differing, not a detection failure"
            ),
            "event_offset": (
                "tracking eventId == shotdetail GAME_EVENT_ID holds for most games and fails "
                "silently for a minority, where the two numberings differ by a small constant. "
                "Calibrated once per game by letting that game's detected releases vote; one "
                "integer per game from ~150 shots, never a per-shot fit. Searched over "
                f"+/-{MAX_EVENT_OFFSET}, and a winner ON that boundary is REJECTED rather than "
                "shipped, because an argmax at the edge is the signature of a peak outside the "
                "search. A non-zero winner must also be carried by at least "
                f"{MIN_OFFSET_VOTES} reconciled shots, clear the straight join by "
                f"{OFFSET_OVER_ZERO}x, and beat its own runner-up by {OFFSET_MIN_MARGIN}; zero "
                "faces the same comparison and is never accepted without one. The comparison is "
                "made over EVERY release the game gives up, never over the releases sitting at "
                "anchor event ids - on that set offset zero has a candidate anchor for every "
                "member by construction and its rivals do not, so it cannot lose. Then it is "
                "validated: even-numbered tracking events calibrate, odd ones check, and "
                "`held_out_agreement` is how often the two halves named the same integer. A half "
                "whose argmax was refused NAMED NOTHING and is not counted as an answer"
            ),
            "coverage": (
                "632 of the 2015-16 season's 1,230 games - the first half only, and schedule-biased"
            ),
        },
        "corpus": {
            "archives_listed": len(listed),
            "empty_shells": shells,
            "misnamed_archives": misnamed,
            "games_parsed": len(games),
            "date_first": min(dates) if dates else None,
            "date_last": max(dates) if dates else None,
            "season_games": season15["n_games"],
        },
        "recovery": {
            "joined_shots": joined,
            "measured": measured,
            "rate": round(measured / joined, 4) if joined else 0.0,
            "failures": dict(reasons.most_common()),
            "anchor_residual_median_ft": residuals[n // 2] if n else None,
            "anchor_residual_p95_ft": residuals[int(n * 0.95)] if n else None,
            "anchor_residual_over_max": reasons.get("anchor residual too large", 0),
            "attribution_agreement": (
                round(attribution_agree / attribution_total, 4) if attribution_total else None
            ),
            "attribution_disagreements": attribution_total - attribution_agree,
            # The per-game join calibration, in the open: how many games needed
            # their event numbering shifted, and which of those the record only
            # barely settled.
            "event_offsets": {str(k): v for k, v in sorted(offsets.items())},
            "games_offset": sum(v for k, v in offsets.items() if k != 0),
            "offsets_rejected": rejected_offsets,
            "offsets_rejected_by_reason": dict(reject_reasons.most_common()),
            "search_range": MAX_EVENT_OFFSET,
            # Zero of these is the point. A shift accepted at the edge of the
            # search is a peak the search could not see.
            "offsets_on_search_boundary": sum(
                v for k, v in offsets.items() if abs(k) == MAX_EVENT_OFFSET
            ),
            # Every shift that was accepted, and the four numbers it was
            # accepted on. This is the evidence, not a summary of it.
            "accepted_offsets": sorted(accepted_offsets, key=lambda a: a["votes"]),
            "min_votes_accepted": min((a["votes"] for a in accepted_offsets), default=None),
            # Which vector decided each game. One value, "full", is the whole
            # point: a screened game was decided on a vector where the rivals
            # could not compete.
            "searched": dict(searched_kinds),
            # The distribution the minimum-vote cut was drawn from, so the cut
            # is arguable rather than asserted.
            #
            # HONESTLY SCOPED. The floor only ever binds on a game whose argmax
            # is non-zero; there is no test it could apply to a straight join.
            # Counting all 632 games under it - which is what `games_under_min`
            # did - mixed 553 games the rule never reaches into the statistic
            # that was supposed to justify the rule's value, and read as though
            # 84 accepted offsets sat below the minimum. So the population here
            # is the games where the floor is reached at all, and what the
            # alternate value COSTS is recomputed from each game's stored score
            # vector rather than inferred.
            "votes": {
                "min_required": MIN_OFFSET_VOTES,
                "min_required_alt": MIN_OFFSET_VOTES_ALT,
                "population": "games whose argmax is non-zero, i.e. where the floor is reached",
                "games_in_population": len(argmax_votes),
                "p05": _pct(argmax_votes, 0.05), "p10": _pct(argmax_votes, 0.10),
                "p25": _pct(argmax_votes, 0.25), "p50": _pct(argmax_votes, 0.50),
                "p75": _pct(argmax_votes, 0.75), "p95": _pct(argmax_votes, 0.95),
                "min_in_population": min(argmax_votes, default=None),
                "under_min": sum(1 for v in argmax_votes if v < MIN_OFFSET_VOTES),
                "under_min_alt": sum(1 for v in argmax_votes if v < MIN_OFFSET_VOTES_ALT),
                # The only figure that says what the second reading is worth:
                # how many games it decides differently. If this is zero, the
                # two values are the same rule and the artifact says so.
                "games_changed_by_alt": len(alt_changed),
                "changed_by_alt": sorted(alt_changed)[:20],
                # And over all games, for continuity with what shipped before.
                "all_games_under_min": sum(1 for v in votes if v < MIN_OFFSET_VOTES),
                "all_games_under_min_alt": sum(1 for v in votes if v < MIN_OFFSET_VOTES_ALT),
            },
            "held_out_agreement": (
                round(held_out_agree / held_out_testable, 4) if held_out_testable else None
            ),
            "held_out_games": held_out_testable,
            "held_out_disagreements": held_out_testable - held_out_agree,
            # Halves that REFUSED to name an offset. Not disagreements and not
            # agreements: a half whose argmax failed the acceptance rule named
            # nothing, and used to be recorded as having named zero.
            "held_out_refused_halves": held_out_refused,
            # AND THE SPLIT, because the aggregate above is not one finding but
            # three, and the flattering part of it is the easy part. What
            # reproduces perfectly out of sample is the ABSENCE of an offset.
            # An accepted shift reproduces about half the time on half the
            # evidence - the shift is a property of the full sample and is not
            # robustly recoverable from ~35 shots - and a rejected one almost
            # never does, which is what a rejection should look like.
            "held_out_by_outcome": {
                k: {"games": n, "agree": a,
                    "rate": round(a / n, 4) if n else None}
                for k, (a, n) in held_out_by.items()
            },
            "held_out_note": (
                "half a game's releases calibrate and half validate, split on the parity of the "
                "tracking event id, over EVERY release in the game. The aggregate rate is "
                "dominated by games needing no offset; read held_out_by_outcome instead. A half "
                "whose argmax was refused named nothing and is counted under "
                "held_out_refused_halves rather than as an answer"
            ),
            "weak_joins": sorted(weak_joins, key=lambda w: w["margin"])[:20],
            "n_weak_joins": len(weak_joins),
        },
        "bias": bias,
        "contest": {
            "buckets": [
                {
                    "name": DEFENDER_BUCKETS[i][0],
                    "lo_ft": DEFENDER_BUCKETS[i][1],
                    "hi_ft": None if DEFENDER_BUCKETS[i][2] == float("inf") else DEFENDER_BUCKETS[i][2],
                    "attempts": bucket_counts[i],
                    "made": bucket_made[i],
                    "share": round(bucket_counts[i] / measured, 4) if measured else 0.0,
                    "fg_pct": round(100 * bucket_made[i] / bucket_counts[i], 1) if bucket_counts[i] else None,
                }
                for i in range(len(DEFENDER_BUCKETS))
            ],
            # THE CONTINUOUS QUANTITY, before it is cut into the four boxes
            # above. Shipped because the piece needs a MEASURED reference to
            # scale a mark against: THE HAND draws each shot as a splotch whose
            # radius rises with how open the shooter was, and it used to
            # normalise that against 255 - the old one-byte storage ceiling -
            # which was a property of the file format and not of basketball
            # (audit F-05). The renderer now normalises at p99 and draws the
            # 1% beyond it at the maximum radius, so the reference is a measured
            # property of the distribution being drawn.
            "caliper_ft": {
                "n": len(caliper_ft),
                "p50": _pct(caliper_ft, 0.50),
                "p90": _pct(caliper_ft, 0.90),
                "p99": _pct(caliper_ft, 0.99),
                "max": round(max(caliper_ft), 2) if caliper_ft else None,
            },
            "approach_curve_ft": approach,
            "approach_hz": HZ,
            "approach_seconds_before_release": 2.0,
            "heroes": heroes,
            # What the definition is worth: how many shots change category when
            # "the time of the shot" is read as the gather instead of the release.
            "gather_rule": {
                "shots": gather_n,
                "changed_bucket": gather_moved,
                "changed_share": round(gather_moved / gather_n, 4) if gather_n else None,
                "mean_delta_ft": round(gather_delta_sum / gather_n, 2) if gather_n else None,
            },
        },
        # The archive against itself. Both of these are the NBA's own records of
        # the same shot: a coordinate a scorer filed courtside, and where the
        # optical feed says the ball left the hand. They are not the same
        # number, and how far apart they sit depends on WHAT KIND OF SHOT the
        # record says it was - which makes this a property of the archive, not
        # of this pipeline. The piece shows the two disagreeing, once, in public,
        # the way it already does with 1996-97's two mid-range figures.
        "disagreement": {
            "n": len(disagreement),
            "median_ft": _pct(disagreement, 0.5),
            "p25_ft": _pct(disagreement, 0.25),
            "p75_ft": _pct(disagreement, 0.75),
            "p90_ft": _pct(disagreement, 0.90),
            "within_3ft": round(sum(1 for d in disagreement if d <= 3.0) / len(disagreement), 4)
            if disagreement else None,
            "within_6ft": round(sum(1 for d in disagreement if d <= MAX_ANCHOR_RESIDUAL_FT)
                                / len(disagreement), 4) if disagreement else None,
            "beyond_15ft": round(sum(1 for d in disagreement if d > 15.0) / len(disagreement), 4)
            if disagreement else None,
            # Where the two instruments part company hardest: shots whose filed
            # location belongs to a body other than the one that last held the
            # ball - a putback, an alley-oop, a tip.
            "by_action": {
                k: {
                    "n": v,
                    "agree": by_action_agree.get(k, 0),
                    "rate": round(by_action_agree.get(k, 0) / v, 4),
                }
                for k, v in sorted(by_action_total.items(), key=lambda kv: -kv[1])
                if v >= 50
            },
        },
        "occupancy": {
            "bands": [
                {"lo_ft": lo, "hi_ft": None if hi > 900 else hi,
                 "frames": occupancy_bands[i],
                 "share": round(occupancy_bands[i] / occupancy_total, 4) if occupancy_total else 0.0}
                for i, (lo, hi) in enumerate(OCCUPANCY_BANDS)
            ],
            "frames_total": occupancy_total,
            "grid": dict(sorted(occupancy_grid.items())),
        },
        # THE FEED'S OWN TIMING, shipped because a constant derived from it
        # should be checkable against it. Everything downstream segments at
        # FRAME_GAP_FACTOR times the modal spacing, and this is the distribution
        # that factor lands in.
        "frame_gap_ms": {
            "factor": FRAME_GAP_FACTOR,
            "hist": {str(k): v for k, v in sorted(frame_gap_hist.items())},
            "note": (
                "consecutive same-period frame spacings across the corpus, in ms; the last key "
                "is everything over 200 ms. The threshold a touch, a pass or a stride may not "
                f"cross is {FRAME_GAP_FACTOR}x each game's own modal spacing"
            ),
        },
        # And the distribution the pass gap was drawn from.
        "pass_gap_ms": {
            "chosen": MAX_PASS_GAP_MS,
            "alt": MAX_PASS_GAP_ALT_MS,
            "bin_ms": 40,
            "hist": {str(k): v for k, v in sorted(pass_gap_hist.items())},
            "note": (
                "gaps between consecutive same-team, same-period touches, binned to 40 ms; key k "
                "counts gaps in [40k, 40k+40), and the last key is everything above"
            ),
        },
        "inventory": {
            "moments": moments,
            "body_positions": body_positions,
            "miles_run": round(distance_ft / 5280.0, 1),
            "hours_tracked": round(moments / HZ / 3600.0, 1),
            "shots_measured": measured,
            "touches": touches,
            "touches_alt_radius": touches_alt,
            "passes": passes,
            "passes_alt_gap": passes_alt,
            "drives": drives,
            # The same touches read without requiring the outside sample to come
            # first. The difference is the finding, not a regression.
            "drives_unordered": drives_unordered,
            "feed_breaks": frame_breaks,
            "steps_over_max": steps_over_max,
            "mean_seconds_per_touch": round(touch_seconds / touches, 2) if touches else None,
            "per_game": {
                "touches": round(touches / len(games), 1) if games else None,
                "passes": round(passes / len(games), 1) if games else None,
                "drives": round(drives / len(games), 1) if games else None,
            },
        },
        "measures_bin": {
            "path": "window_measures.bin",
            "record": MEASURE_REC,
            "bytes_per_record": MEASURE_BYTES,
            "records": len(measures),
            "bytes": len(blob),
            "fields": ("x, y, dx, dy (int16 tenths, hoop at origin); dist (uint16 tenths ft, "
                       "never clipped); bucket; made; day"),
            "day0": day0,
        },
        # A SECOND INSTRUMENT ON THE RECORD'S OWN REFUSAL. See
        # measure_sentinel_corroboration: everything else in this file measures
        # the tracking feed, and this one thing measures the SHOT RECORD with
        # it. It is here rather than in seasons.json because this is where the
        # evidence is; seasons.json's definition points at it.
        "sentinel_corroboration": measure_sentinel_corroboration(load_anchors()),
    }
    write_json(PROCESSED_DIR / "window.json", out, compact=True)

    print(f"\nQA: {len(games)} games, {measured:,}/{joined:,} shots measured "
          f"({100 * measured / joined:.1f}%)" if joined else "QA: nothing measured")
    for i, b in enumerate(out["contest"]["buckets"]):
        print(f"     {b['name']:<11} {100 * b['share']:5.1f}%   FG {b['fg_pct']}")
    print(f"     gather rule moves {100 * (out['contest']['gather_rule']['changed_share'] or 0):.1f}% "
          f"of shots into a different category")
    r = out["recovery"]
    print(f"     event offsets {r['event_offsets']}; {r['offsets_rejected']} rejected "
          f"{r['offsets_rejected_by_reason']}; {r['offsets_on_search_boundary']} on the boundary")
    print(f"     every game decided on the full release set: {r['searched']}")
    print(f"     held-out validation: {r['held_out_agreement']} over {r['held_out_games']} games "
          f"({r['held_out_disagreements']} halves disagreed, "
          f"{r['held_out_refused_halves']} refused to name one)")
    for k, v in r["held_out_by_outcome"].items():
        print(f"       {k:<9} {v['agree']:4d}/{v['games']:<4d} = {v['rate']}")
    v = r["votes"]
    print(f"     votes where the floor is reached ({v['games_in_population']} games with a "
          f"non-zero argmax): min {v['min_in_population']} p50 {v['p50']} p95 {v['p95']}; "
          f"{v['under_min']} under {v['min_required']}, {v['under_min_alt']} under the alternate "
          f"{v['min_required_alt']}, which decides {v['games_changed_by_alt']} games differently")
    inv = out["inventory"]
    print(f"     {inv['drives']:,} drives ordered against {inv['drives_unordered']:,} unordered; "
          f"{inv['passes']:,} passes ({inv['passes_alt_gap']:,} at the alternate gap)")
    print(f"     {moments:,} moments, {body_positions:,} body positions, "
          f"{out['inventory']['miles_run']:,} miles")
    print(f"window -> data/processed/window.json  ({len(blob):,} B of measures)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe-gate", action="store_true",
                    help="reproduce the committed probe fixture and stop")
    ap.add_argument("--reduce", action="store_true",
                    help="fold per-game artifacts into the shipped artifacts and stop")
    ap.add_argument("--games", type=int, help="limit to the first N usable archives")
    # Deliberately NOT cpu_count: a parsed SportVU game is ~100 MB of JSON that
    # becomes gigabytes of Python objects, so this stage is bound by memory, not
    # cores. Measured on a 16 GB machine, 12 games: 6 workers took 53 s with
    # 101 s of system time (swapping); 3 workers took 20 s with 4 s. More
    # workers here make the stage slower, not faster.
    ap.add_argument("--jobs", type=int, default=3,
                    help="parallel games; raise only if you have RAM to spare")
    ap.add_argument("--force", action="store_true", help="re-parse games already done")
    ap.add_argument("--skip-mirror", action="store_true",
                    help="use archives already on disk; do not fetch")
    args = ap.parse_args()
    require_env()

    if args.probe_gate:
        probe_gate()
        return

    if args.reduce:
        reduce_all()
        return

    GAMES_DIR.mkdir(parents=True, exist_ok=True)
    entries = corpus_entries()
    archives = usable_archives(entries)
    print(f"corpus: {len(entries)} archives listed, {len(archives)} usable")
    if args.games:
        archives = archives[:args.games]

    if not args.skip_mirror:
        print("Mirroring")
        mirror(archives)

    print("Deriving")
    anchors = load_anchors()
    specs = []
    for a in archives:
        out_path = GAMES_DIR / f"{Path(a['name']).stem}.json"
        if out_path.exists() and not args.force:
            continue
        specs.append((a["name"], a["date"], str(out_path)))
    print(f"  {len(archives) - len(specs)} already done, {len(specs)} to run")

    errors = []
    done = 0
    if specs:
        with ProcessPoolExecutor(max_workers=args.jobs,
                                 initializer=_init_worker, initargs=(anchors,)) as pool:
            futures = [pool.submit(_run_one, s) for s in specs]
            for fut in as_completed(futures):
                name, measured, joined, err = fut.result()
                done += 1
                if err:
                    errors.append((name, err))
                    print(f"  [{done}/{len(specs)}] {name}: ERROR {err}")
                elif done % 25 == 0 or done == len(specs):
                    print(f"  [{done}/{len(specs)}] {name}: {measured}/{joined} measured")

    print(f"\nQA: {done} games run, {len(errors)} errors")
    for name, err in errors[:10]:
        print(f"  ERROR {name}: {err}")
    print(f"per-game artifacts -> {GAMES_DIR}")


if __name__ == "__main__":
    main()
