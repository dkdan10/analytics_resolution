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
    sha256_file,
    write_json,
)

WINDOW_DIR = REPO_ROOT / "data" / "window"
GAMES_DIR = WINDOW_DIR / "games"
SPORTVU_DIR = RAW_DIR / "sportvu"

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

# "A touch" - the ball within this radius of its nearest player, held this long.
TOUCH_RADIUS_FT = 3.5
TOUCH_RADIUS_ALT_FT = 3.0
TOUCH_MIN_FRAMES = 10

# A touch longer than this is a dead ball, not possession: the feed keeps
# running through free throws and stoppages with the ball in someone's hands.
TOUCH_MAX_SECONDS = 12.0

# "A drive" - one touch carrying the handler from outside to inside these radii.
DRIVE_FROM_FT = 20.0
DRIVE_TO_FT = 10.0

# A player cannot move this far in 40 ms; anything further is a feed gap or an
# identity swap, and integrating it would invent distance that was never run.
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

# How far the tracking event numbering may sit from the shot record's. Kept
# small on purpose: a wide search over a symmetric court would start finding
# spurious agreement rather than the real join.
MAX_EVENT_OFFSET = 3

# Below this, the record did not really settle the game's event offset and the
# choice is close to a guess. Such games are counted and listed rather than
# quietly folded in with the rest.
WEAK_JOIN_MARGIN = 0.10

# If the straight join (offset 0) reconciles at least this share of a game's
# filed shots, it is taken as correct and the rest of the game is never
# unpacked. Measured separation is wide: games that need an offset reconcile
# 3-7% at zero, games that do not reconcile 35-84%.
DIRECT_JOIN_OK = 0.25

# A shifted join must reconcile at least this many times what the straight join
# does, AND beat its own runner-up by this margin. Below either, the shift is
# noise and the game keeps offset 0. Measured separation: a real offset lifts
# reconciliation 2.7-4x with a clear peak; a spurious one is flat across five
# adjacent offsets.
OFFSET_OVER_ZERO = 1.5
OFFSET_MIN_MARGIN = 0.15


def game_event_offset(found_shots, anchors, wide=True):
    """Where this game's event numbering sits relative to the shot record's.

    `tracking eventId == shotdetail GAME_EVENT_ID` holds for most games and
    silently fails for a minority: the two numberings are offset by a small
    constant, so every shot joins to a neighbouring shot's coordinate. It is
    invisible per shot - each anchor is a real coordinate of a real shot, just
    the wrong one - and it destroys the join for those games alone. Measured on
    one such game, 10.30.2015.BKN.at.SAS: 6.7% of shots reconcile at offset 0
    and 35.6% at offset +1.

    So the offset is CALIBRATED once per game, by letting all of that game's
    detected releases vote for the offset that puts most of them where the
    record independently filed them. That is one small integer per game decided
    by ~150 shots, not a per-shot fit: no shot's release frame is ever chosen
    using the record, and the runner-up is reported so a game that barely
    decides can be seen instead of assumed.
    """
    offsets = range(-MAX_EVENT_OFFSET, MAX_EVENT_OFFSET + 1) if wide else (0,)
    scores = {}
    for off in offsets:
        ok = 0
        for eid, efr, release_i, hoop_x in found_shots:
            a = anchors.get(eid + off)
            if a is None:
                continue
            ball = efr[release_i][3]
            sx, sy = to_shot_frame(ball[2], ball[3], hoop_x)
            if math.hypot(sx - a["loc_x"], sy - a["loc_y"]) / 10.0 <= MAX_ANCHOR_RESIDUAL_FT:
                ok += 1
        scores[off] = ok
    ranked = sorted(scores.items(), key=lambda kv: (-kv[1], abs(kv[0])))
    best, best_n = ranked[0]
    runner_up = ranked[1][1] if len(ranked) > 1 else 0
    at_zero = scores.get(0, 0)
    margin = (best_n - runner_up) / best_n if best_n else 0.0

    # A shifted join is only accepted when the record actually settles it.
    #
    # A real offset looks like a spike: one value reconciles several times what
    # any other does. Noise looks flat - swept from -12 to +12, the games that
    # were landing on the search boundary scored 43, 41, 38, 28, 26 across five
    # adjacent offsets, which is not an offset, it is a game whose event
    # numbering does not correspond at all. Accepting the argmax there would
    # manufacture pairings: each shot would be matched to a NEIGHBOURING shot's
    # coordinate, and since `made` is read off the anchor, the field-goal
    # figures would quietly absorb the error.
    #
    # So a non-zero offset must both clear the straight join by a real factor
    # and beat its own runner-up. Otherwise the game keeps offset 0 and its
    # shots fail honestly in the recovery ledger.
    rejected = False
    if best != 0 and not (best_n >= OFFSET_OVER_ZERO * max(1, at_zero) and margin >= OFFSET_MIN_MARGIN):
        rejected = True
        best, best_n = 0, at_zero
    return best, {
        "offset_rejected": rejected,
        "event_offset": best,
        "reconciled_at_best": best_n,
        "reconciled_at_zero": at_zero,
        "runner_up": runner_up,
        "searched": "wide" if wide else "direct",
        # How decisively the record settled it. Near 0 means the offset is a
        # guess, and qa.py counts those rather than hiding them.
        "margin": round(margin, 3),
    }


def measure_shot(frames, release_i, hoop_x, shooter_team):
    """The caliper and its neighbourhood, at one release.

    Everything here is taken at a single frame, which is exactly the thing the
    league leaves undefined: it says "at the time of the shot" and never says
    which instant that is. So the same measure is also taken at the gather,
    0.4 s earlier, and both ship.
    """
    def nearest_opponent(i):
        f = frames[i]
        ball = f[3]
        if ball is None:
            return None
        bx, by = ball[2], ball[3]
        # The shooter: nearest player to the ball. Their team fixes who counts
        # as a defender, so no roster join is needed for the measure itself.
        shooter = None
        best_d = float("inf")
        for row in f[4]:
            d = math.hypot(row[2] - bx, row[3] - by)
            if d < best_d:
                best_d, shooter = d, row
        if shooter is None:
            return None
        team = shooter_team if shooter_team is not None else shooter[0]
        opp = [r for r in f[4] if r[0] != team]
        if not opp:
            return None
        dists = sorted(math.hypot(r[2] - shooter[2], r[3] - shooter[3]) for r in opp)
        nearest = min(opp, key=lambda r: math.hypot(r[2] - shooter[2], r[3] - shooter[3]))
        return {
            "shooter": (shooter[2], shooter[3]),
            "shooter_id": shooter[1],
            "defender": (nearest[2], nearest[3]),
            "dist": dists[0],
            # Spacing: how far the whole defence is from the ball-handler.
            "spacing_mean": sum(dists) / len(dists),
            "n_opponents": len(opp),
        }

    at_release = nearest_opponent(release_i)
    if at_release is None:
        return None
    gather_i = max(0, release_i - GATHER_FRAMES)
    at_gather = nearest_opponent(gather_i)

    # The approach: the same distance sampled backwards at 25 Hz. This is the
    # continuous quantity the four published categories are cut out of.
    #
    # `track` carries the two endpoints as well, not just the length. It is kept
    # only for a handful of hero shots per game and discarded for the rest -
    # enough for the piece to draw ONE caliper closing in real geometry, rather
    # than animating an aggregate curve, which would be inventing motion that
    # no single shot performed.
    approach = []
    track = []
    for k in range(int(2.0 * HZ), -1, -1):
        i = release_i - k
        if i < 0:
            approach.append(None)
            track.append(None)
            continue
        m = nearest_opponent(i)
        approach.append(round(m["dist"], 2) if m else None)
        if m is None:
            track.append(None)
        else:
            sx, sy = to_shot_frame(m["shooter"][0], m["shooter"][1], hoop_x)
            dx, dy = to_shot_frame(m["defender"][0], m["defender"][1], hoop_x)
            track.append([round(sx, 1), round(sy, 1), round(dx, 1), round(dy, 1)])

    return {
        "release": at_release,
        "gather": at_gather,
        "approach": approach,
        "track": track,
    }


# --- touches, passes, drives -------------------------------------------------

def touch_chains(frames, radius):
    """Who had the ball, for how long: [(player_id, team_id, i0, i1), ...].

    AUTHORED. A player has the ball when they are its nearest player and within
    `radius`, sustained for TOUCH_MIN_FRAMES. The league publishes "touches" and
    does not publish this rule; running it at two radii is how the piece shows
    what the rule is worth.
    """
    out = []
    cur = None
    for i, f in enumerate(frames):
        ball = f[3]
        who = None
        team = None
        if ball is not None and f[4]:
            bx, by = ball[2], ball[3]
            best = min(f[4], key=lambda r: (r[2] - bx) ** 2 + (r[3] - by) ** 2)
            if math.hypot(best[2] - bx, best[3] - by) <= radius:
                who, team = best[1], best[0]
        if cur is not None and cur[0] == who:
            cur[3] = i
        else:
            if cur is not None and cur[0] is not None and cur[3] - cur[2] + 1 >= TOUCH_MIN_FRAMES:
                out.append(tuple(cur))
            cur = [who, team, i, i]
    if cur is not None and cur[0] is not None and cur[3] - cur[2] + 1 >= TOUCH_MIN_FRAMES:
        out.append(tuple(cur))

    # Drop dead-ball holds: the feed runs through stoppages and free throws with
    # the ball in someone's hands, and counting those as possession would make
    # the mean touch several times what basketball actually looks like.
    max_frames = TOUCH_MAX_SECONDS * HZ
    return [t for t in out if t[3] - t[2] + 1 <= max_frames]


def measure_movement(frames, touches):
    """Distance run, passes and drives - the rest of the published suite."""
    prev = {}
    distance_ft = 0.0
    for f in frames:
        for row in f[4]:
            pid, x, y = row[1], row[2], row[3]
            q = prev.get(pid)
            if q is not None:
                d = math.hypot(x - q[0], y - q[1])
                if d < MAX_STEP_FT:
                    distance_ft += d
            prev[pid] = (x, y)

    passes = 0
    for a, b in zip(touches, touches[1:]):
        if a[1] == b[1] and a[0] != b[0]:
            passes += 1

    drives = 0
    for _pid, _team, i0, i1 in touches:
        far = near = None
        for i in range(i0, i1 + 1):
            ball = frames[i][3]
            if ball is None:
                continue
            d = hoop_distance(ball[2], ball[3])
            far = d if far is None else max(far, d)
            near = d if near is None else min(near, d)
        if far is not None and far >= DRIVE_FROM_FT and near <= DRIVE_TO_FT:
            drives += 1

    durations = sorted((t[3] - t[2] + 1) / HZ for t in touches)
    return {
        "distance_ft": distance_ft,
        "passes": passes,
        "drives": drives,
        "touches": len(touches),
        "touch_seconds_total": sum(durations),
        "touch_seconds_median": durations[len(durations) // 2] if durations else 0.0,
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

    touches = touch_chains(frames, TOUCH_RADIUS_FT)
    touches_alt = touch_chains(frames, TOUCH_RADIUS_ALT_FT)
    movement = measure_movement(frames, touches)

    measures = []
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

    seen_events = {}

    def releases_for(eids):
        out = []
        for eid in eids:
            if eid in seen_events:
                if seen_events[eid] is not None:
                    out.append(seen_events[eid])
                continue
            ev = by_event.get(eid)
            rec = None
            if ev is not None:
                efr = event_frames(ev)
                if len(efr) >= HZ:
                    found = find_release(efr)
                    if found:
                        rec = (eid, efr, found[0], found[2])
            seen_events[eid] = rec
            if rec is not None:
                out.append(rec)
        return out

    direct = releases_for(sorted(anchors))
    offset, join_info = game_event_offset(direct, anchors, wide=False)
    if anchors and join_info["reconciled_at_best"] / len(anchors) < DIRECT_JOIN_OK:
        # The straight join did not hold. Unpack the rest of the game and let
        # every recovered release vote on the offset.
        wide = releases_for([e for e in by_event if e not in seen_events])
        offset, join_info = game_event_offset(direct + wide, anchors, wide=True)

    found_shots = [r for r in seen_events.values() if r is not None]
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

        m = measure_shot(efr, release_i, hoop_x, None)
        if m is None:
            reasons["no bodies at release"] += 1
            continue
        residuals.append(residual)

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
        })

    # Hero candidates: the few whose geometry the record corroborates most
    # tightly, and only those keep their endpoint track. Everything else drops
    # it here, which is what keeps the intermediate from carrying the corpus.
    complete = [m for m in measures if m["_track"] and all(f is not None for f in m["_track"])]
    complete.sort(key=lambda m: m["residual"])
    heroes = complete[:3]
    hero_ids = {id(m) for m in heroes}
    for m in measures:
        if id(m) not in hero_ids:
            m.pop("_track", None)

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
    shots = read_season_csv(2015, usecols=cols)
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
MEASURE_REC = "<hhhhBBBB"  # x, y, dx, dy, dist_tenths, bucket, made, day
MEASURE_BYTES = 12
DIST_TENTHS_MAX = 255  # 25.5 ft; farther than any defender the caliper draws


def _pct(sorted_or_not, q):
    """A percentile, or None when there is nothing to take one of."""
    if not sorted_or_not:
        return None
    v = sorted(sorted_or_not)
    return round(v[min(len(v) - 1, int(len(v) * q))], 2)


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

    moments = body_positions = 0
    distance_ft = 0.0
    touches = touches_alt = passes = drives = 0
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
            if jn.get("offset_rejected"):
                rejected_offsets += 1
            if jn["margin"] < WEAK_JOIN_MARGIN:
                weak_joins.append({"archive": g.get("archive"), "offset": jn["event_offset"],
                                   "margin": jn["margin"]})
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
        mv = g["movement"]
        distance_ft += mv["distance_ft"]
        touches += mv["touches"]
        touches_alt += g["touches_alt"]
        passes += mv["passes"]
        drives += mv["drives"]
        touch_seconds += mv["touch_seconds_total"]

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
    day0 = min(dates) if dates else None
    blob = bytearray()
    for m in measures:
        d = datetime.date.fromisoformat(m["date"]) - datetime.date.fromisoformat(day0)
        blob += struct.pack(
            MEASURE_REC,
            int(round(m["x"])), int(round(m["y"])), int(round(m["dx"])), int(round(m["dy"])),
            min(DIST_TENTHS_MAX, int(round(m["dist"] * 10))),
            m["bucket"], m["made"], min(255, d.days),
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
    heroes = []
    for bi in range(len(DEFENDER_BUCKETS)):
        pool = sorted((m for m in hero_pool if m["bucket"] == bi), key=lambda m: m["residual"])
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
                # [shooter x, shooter y, defender x, defender y] per frame, in
                # the shot record's own frame, for the 2 s before release.
                "track": h["_track"],
            })

    entries = corpus_entries()
    listed = [e for e in entries if e["name"].endswith(".7z")]
    shells = sorted(e["name"] for e in entries if e["size"] <= EMPTY_SHELL_BYTES)
    misnamed = sorted(e["name"] for e in entries if e["name"].startswith(MISNAMED_PREFIX))

    seasons = json.loads((PROCESSED_DIR / "seasons.json").read_text())["seasons"]
    season15 = next(s for s in seasons if s["year"] == 2015)

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
    bias = {
        "measured_attempts": measured,
        "season_attempts": season15["attempts"],
        "share_of_season": round(measured / season15["attempts"], 4),
        "fg_pct_measured": round(100 * fg_measured, 1) if fg_measured else None,
        "fg_pct_season": round(100 * season15["fg_pct"], 1),
        "fg_pct_gap": round(100 * (fg_measured - season15["fg_pct"]), 1) if fg_measured else None,
        "why": (
            "a release is recovered by following the ball back from the rim, so shots that "
            "reach the rim are over-represented and made shots all reach it; the recovered set "
            "shoots better than the league did and every figure taken from it inherits that"
        ),
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
                f"nearest opposing player to the ball-handler, in 2D, at the frame the ball leaves "
                f"the hand; also taken at the gather {GATHER_FRAMES} frames "
                f"({GATHER_FRAMES / HZ:.1f} s) earlier"
            ),
            "buckets": "the league's own four published categories: 0-2, 2-4, 4-6, 6+ ft",
            "touch": (
                f"ball within {TOUCH_RADIUS_FT} ft of its nearest player for at least "
                f"{TOUCH_MIN_FRAMES} frames ({TOUCH_MIN_FRAMES / HZ:.1f} s) and at most "
                f"{TOUCH_MAX_SECONDS} s; also computed at {TOUCH_RADIUS_ALT_FT} ft"
            ),
            "drive": f"one touch carrying the ball from >= {DRIVE_FROM_FT} ft to <= {DRIVE_TO_FT} ft of a hoop",
            "distance_run": (
                f"summed per-player frame-to-frame displacement, discarding steps over "
                f"{MAX_STEP_FT} ft as feed gaps rather than integrating distance never run"
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
                "integer per game from ~150 shots, never a per-shot fit"
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
        "inventory": {
            "moments": moments,
            "body_positions": body_positions,
            "miles_run": round(distance_ft / 5280.0, 1),
            "hours_tracked": round(moments / HZ / 3600.0, 1),
            "shots_measured": measured,
            "touches": touches,
            "touches_alt_radius": touches_alt,
            "passes": passes,
            "drives": drives,
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
            "fields": "x, y, dx, dy (tenths, hoop at origin); dist (tenths ft); bucket; made; day",
            "day0": day0,
        },
    }
    write_json(PROCESSED_DIR / "window.json", out, compact=True)

    print(f"\nQA: {len(games)} games, {measured:,}/{joined:,} shots measured "
          f"({100 * measured / joined:.1f}%)" if joined else "QA: nothing measured")
    for i, b in enumerate(out["contest"]["buckets"]):
        print(f"     {b['name']:<11} {100 * b['share']:5.1f}%   FG {b['fg_pct']}")
    print(f"     gather rule moves {100 * (out['contest']['gather_rule']['changed_share'] or 0):.1f}% "
          f"of shots into a different category")
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
