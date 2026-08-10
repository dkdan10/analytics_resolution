#!/usr/bin/env python3
"""THE SLATE — one night of the league at the record's own simultaneity.

The Dec 5, 2015 slate: the ten misnamed archives, the night the archive itself
nearly lost. What selects the night is a measured property of the corpus
(`window.json:corpus.misnamed_archives`), not taste. This stage finds the one
15-second wall-clock span of maximum simultaneous play across those ten games
and ships every trackable body's folded path over it, treated exactly as the
paint treats a possession: cut at discontinuities, Douglas-Peucker at the
record's own coordinate quantum, folded to one halfcourt, no player, no game,
no event, no clock.

WHAT "NO CLOCK" MEANS HERE, precisely: no wall clock, no game clock, no date
per path. Each path does carry a span-local START OFFSET in frames, because
simultaneity is the artifact's whole subject — the bodies must move together —
and an offset inside one anonymous 15-second span orders nothing outside it
and identifies nothing. The paint's stricter form (no time base at all beyond
per-vertex dt) cannot state simultaneity; this is the minimum addition that
can, and it is declared in the shipped layout so the gate can refuse anything
more.

THE SPAN IS FOUND, NOT CHOSEN. A second of a game is live when the game clock
is strictly decreasing across adjacent moments at normal spacing (a frozen
clock is a timeout or a held ball; a pair straddling a feed dropout says
nothing about the seconds inside the gap). The span maximizes, in order: the
count of games live for every second of it, then the total live seconds across
all ten. Its length is the one authored quantity, from the accepted proposal
(`docs/audits/second-audit-claude.md` 3A); everything else is argmax.

A MEASURED CORRECTION the kill-test made to the proposal's premise: the ten
games tip off across the whole evening, so all ten are never live at once. At
the found instant five games are fully live and a sixth holds partial feed —
the artifact's `span` block states what was found, and the piece's caption
material comes from there, never from the proposal's prose.
"""
import argparse
import datetime
import gc
import json
import statistics
import struct
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from common import (  # noqa: E402
    HOOP_LEFT_X,
    HOOP_RIGHT_X,
    HZ,
    MISNAMED_PREFIX,
    PROCESSED_DIR,
    RAW_DIR,
    read_7z_bytes,
    write_json,
)
from paint import (  # noqa: E402
    MIN_RUN_FRAMES,
    SIMPLIFY_FT,
    runs_of,
    stroke_from,
)
from window import FRAME_GAP_FACTOR, archive_date, to_shot_frame  # noqa: E402

SPORTVU_DIR = RAW_DIR / "sportvu"

# The night. Not a filter pattern — the date is derived by the same
# prefix-stripping discipline the corpus stage uses, so the misnamed ten are
# exactly the ones found.
SLATE_DATE = "2015-12-05"

# The span's length in seconds — the one authored quantity (audit 3A's spec).
SPAN_SECONDS = 15

# A liveness pair must be adjacent moments at normal spacing. Beyond this the
# pair straddles a feed dropout and says nothing about the seconds inside it.
LIVE_MAX_STEP_MS = 1000

# What ships. The vertex is the paint's own record; the index drops the
# paint's canvas/body/day identity and carries the span-local start instead.
VERTEX_REC = "<hhHH"      # x, y (tenths, hoop at origin); dt frames; arc tenths
VERTEX_BYTES = 8
INDEX_REC = "<IHHB"       # first vertex, count, start (frames from span open), kind
INDEX_BYTES = 9

# The fold needs a hoop and a shotless span names none, so it is fixed per
# game: the hoop nearer the ball's median position over the span. Fixed, not
# per-frame, so a body crossing midcourt stays one continuous path (off the
# plate's edge) rather than reflecting at the halfcourt line.
FOLD_RULE = (
    "each game's positions fold to one halfcourt through the corpus's own "
    "frame (window.py:to_shot_frame), toward the hoop nearer the ball's "
    "median position over the span - fixed per game, so a body crossing "
    "midcourt stays one continuous path off the plate's edge rather than "
    "reflecting at the line"
)

SELECTION = (
    f"the {SPAN_SECONDS} s wall-clock span, slid at one-second steps over the "
    "ten archives' union, maximizing first the count of games live for every "
    "second of it and then the total live seconds across all games; a second "
    "is live when the game clock strictly decreases across adjacent moments "
    f"no more than {LIVE_MAX_STEP_MS} ms apart"
)


def slate_archives():
    out = [p for p in sorted(SPORTVU_DIR.glob("*.7z"))
           if archive_date(p.name) == SLATE_DATE]
    if len(out) != 10:
        raise SystemExit(f"expected the ten misnamed archives, found {len(out)}")
    return out


def parse_frames(archive):
    """Deduped (ts, game_clock, ball(x,y) | None, [(pid, x, y)]) sorted by ts."""
    raw = read_7z_bytes(archive)
    game = json.loads(raw)
    del raw
    seen = set()
    frames = []
    for ev in game.get("events", []):
        for m in ev.get("moments", []):
            key = (m[0], m[1])
            if key in seen:
                continue
            seen.add(key)
            ball = None
            players = []
            for row in m[5]:
                if row[0] == -1:
                    ball = (row[2], row[3])
                else:
                    players.append((row[1], row[2], row[3]))
            frames.append((m[1], m[2], ball, players))
    del game
    gc.collect()
    frames.sort(key=lambda f: f[0])
    return frames


def live_seconds(frames):
    """The seconds of wall clock during which this game was in play, and the
    game's own modal frame spacing in ms."""
    live = set()
    diffs = Counter()
    for i in range(1, len(frames)):
        ts0, gc0 = frames[i - 1][0], frames[i - 1][1]
        ts1, gc1 = frames[i][0], frames[i][1]
        diffs[ts1 - ts0] += 1
        if (ts1 - ts0 <= LIVE_MAX_STEP_MS and gc0 is not None
                and gc1 is not None and gc1 < gc0 - 1e-9):
            for s in range(int(ts0 // 1000), int(ts1 // 1000) + 1):
                live.add(s)
    mode_ms = diffs.most_common(1)[0][0]
    return live, mode_ms


def find_span(per_game_live):
    lo = min(min(s) for s in per_game_live.values())
    hi = max(max(s) for s in per_game_live.values())
    best = None
    for s in range(lo, hi - SPAN_SECONDS + 2):
        window = range(s, s + SPAN_SECONDS)
        full = sum(1 for g in per_game_live
                   if all(x in per_game_live[g] for x in window))
        partial = sum(sum(1 for x in window if x in per_game_live[g])
                      for g in per_game_live)
        key = (full, partial)
        if best is None or key > best[0]:
            best = (key, s)
    (full, partial), start = best
    return start, full, partial


def main():
    argparse.ArgumentParser(description=__doc__).parse_args()
    archives = slate_archives()

    # Pass 1: liveness. Games parse one at a time; a parsed game is ~100 MB of
    # JSON that becomes gigabytes of objects, the window stage's own lesson.
    per_live = {}
    modes = {}
    frame_counts = {}
    for arc in archives:
        frames = parse_frames(arc)
        live, mode_ms = live_seconds(frames)
        per_live[arc.name] = live
        modes[arc.name] = mode_ms
        frame_counts[arc.name] = len(frames)
        print(f"  {arc.name}: {len(frames)} frames, mode {mode_ms} ms, "
              f"{len(live)} live s", flush=True)
        del frames
        gc.collect()

    s0, games_live, live_sum = find_span(per_live)
    t0_ms, t1_ms = s0 * 1000, (s0 + SPAN_SECONDS) * 1000
    span_utc = datetime.datetime.fromtimestamp(
        s0, tz=datetime.timezone.utc).isoformat()
    print(f"found span: {span_utc} ({SPAN_SECONDS} s), {games_live} games "
          f"fully live, live-second sum {live_sum}", flush=True)

    # Pass 2: extraction, the paint's treatment.
    verts = []       # (x, y, dt, arc)
    index = []       # (first, count, start, kind)
    games_present = 0
    ball_paths = 0
    off_plate = 0
    painted_frames = 0
    arc_total = 0
    for arc in archives:
        frames = [f for f in parse_frames(arc) if t0_ms <= f[0] < t1_ms]
        gc.collect()
        if not frames:
            continue
        games_present += 1
        mode_ms = modes[arc.name]
        gap_max = FRAME_GAP_FACTOR * mode_ms
        ball_xs = [f[2][0] for f in frames if f[2] is not None]
        med = statistics.median(ball_xs) if ball_xs else HOOP_LEFT_X
        hoop_x = (HOOP_RIGHT_X if abs(med - HOOP_RIGHT_X) < abs(med - HOOP_LEFT_X)
                  else HOOP_LEFT_X)

        series = {}
        for ts, _clock, ball, players in frames:
            if ball is not None:
                series.setdefault("ball", []).append((ts, ball[0], ball[1]))
            for pid, x, y in players:
                series.setdefault(pid, []).append((ts, x, y))

        for key, rows in series.items():
            rows.sort(key=lambda r: r[0])
            pts = [to_shot_frame(x, y, hoop_x) for _, x, y in rows]
            ts_list = [r[0] for r in rows]
            breaks = {m for m in range(1, len(rows))
                      if ts_list[m] - ts_list[m - 1] > gap_max}
            for a, b in runs_of(pts, breaks):
                if b - a + 1 < MIN_RUN_FRAMES:
                    continue
                made = stroke_from(pts[a:b + 1], SIMPLIFY_FT * 10)
                if made is None:
                    continue
                path = made[0]
                start = int(round((ts_list[a] - t0_ms) / mode_ms))
                first = len(verts)
                for x, y, dt, arc_t in path:
                    xi, yi = int(round(x)), int(round(y))
                    if not (-250 <= xi <= 250 and -50 <= yi <= 420):
                        off_plate += 1
                    painted_frames += dt
                    arc_total += arc_t
                    verts.append((xi, yi, dt, arc_t))
                index.append((first, len(path), start, 1 if key == "ball" else 0))
                if key == "ball":
                    ball_paths += 1
        del frames, series
        gc.collect()

    # Deterministic shipped order that carries no derive-order structure: by
    # span-local start, then geometry.
    order = sorted(range(len(index)), key=lambda i: (index[i][2], verts[index[i][0]][:2]))
    v2, i2 = [], []
    for i in order:
        first, count, start, kind = index[i]
        i2.append((len(v2), count, start, kind))
        v2.extend(verts[first:first + count])
    verts, index = v2, i2

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    (PROCESSED_DIR / "slate_strokes.bin").write_bytes(
        b"".join(struct.pack(VERTEX_REC, *v) for v in verts))
    (PROCESSED_DIR / "slate_index.bin").write_bytes(
        b"".join(struct.pack(INDEX_REC, *r) for r in index))

    window = json.loads((PROCESSED_DIR / "window.json").read_text())
    day0 = window["corpus"]["date_first"]
    day = (datetime.date.fromisoformat(SLATE_DATE)
           - datetime.date.fromisoformat(day0)).days

    out = {
        "generated_by": "pipeline/slate.py",
        "generated_at": datetime.datetime.now(datetime.timezone.utc)
                        .isoformat(timespec="seconds"),
        "date": SLATE_DATE,
        "day": day,
        "day0": day0,
        "span": {
            "seconds": SPAN_SECONDS,
            "hz": HZ,
            "start_utc": span_utc,
            "games_fully_live": games_live,
            "games_present": games_present,
            "live_second_sum": live_sum,
            "archives": len(archives),
        },
        "paths": len(index),
        "ball_paths": ball_paths,
        "vertices": len(verts),
        "painted_frames": painted_frames,
        "arc_tenths_total": arc_total,
        "off_plate_vertices": off_plate,
        "selection": SELECTION,
        "fold": FOLD_RULE,
        "treatment": (
            "cut at every step over paint.py:MAX_STEP_FT and every feed gap "
            "over the game's own modal spacing times window.py:"
            "FRAME_GAP_FACTOR; runs under paint.py:MIN_RUN_FRAMES dropped; "
            "Douglas-Peucker at paint.py:SIMPLIFY_FT with zone crossings "
            "forced, exactly as the paint"
        ),
        "identity": (
            "none: nothing names a body, a game, an event or a clock. A path "
            "carries a start offset inside the one anonymous span, because "
            "simultaneity is the subject; the pinned index layout is the gate "
            "that keeps everything else out"
        ),
        "files": {
            "slate_strokes": {
                "path": "slate_strokes.bin",
                "record": VERTEX_REC,
                "bytes_per_record": VERTEX_BYTES,
                "records": len(verts),
                "bytes": len(verts) * VERTEX_BYTES,
                "fields": "x, y (int16 tenths, hoop at origin); dt (uint16 "
                          "frames); arc (uint16 tenths)",
            },
            "slate_index": {
                "path": "slate_index.bin",
                "record": INDEX_REC,
                "bytes_per_record": INDEX_BYTES,
                "records": len(index),
                "bytes": len(index) * INDEX_BYTES,
                "fields": "first vertex (uint32); count (uint16); start "
                          "(uint16 frames from the span's open); kind (uint8, "
                          "1 = ball)",
            },
        },
        "provenance": {
            "source": "SportVU public 2015-16 release (linouk23 + mirrors)",
            "misnamed_prefix": MISNAMED_PREFIX,
        },
    }
    write_json(PROCESSED_DIR / "slate.json", out)
    print(f"slate: {len(index)} paths, {len(verts)} vertices, "
          f"{games_present} games present, {ball_paths} ball paths, "
          f"{off_plate} off-plate vertices")


if __name__ == "__main__":
    main()
