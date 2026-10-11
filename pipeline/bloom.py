#!/usr/bin/env python3
"""Act III - the bloom: gestures recovered from the eleven weeks the record moved.

For most of the piece a shot is a dot, because a dot is all the public record
holds. For 89 days it held the whole gesture, and this stage recovers a curated
handful of them from the 2015-16 SportVU release.

Three sources join on one key, verified 179/179 on the proof game:
    tracking eventId == play-by-play EVENTNUM == shotdetail GAME_EVENT_ID
so every trace is anchored at the exact dot it produced - the same dot the plate
has been drawing all along.

The join is checked by geometry, not asserted: the ball's position at release,
transformed into the shot record's own frame, must land within a few feet of
where the record filed that shot. That residual is reported per trace and gated.

Writes data/processed/traces.json (derived, small, committable). Bulk archives
stay in data/raw/ and are never committed.

Usage: python3 pipeline/bloom.py [--games 12] [--traces 32]
"""

import argparse
import datetime
import json
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    PROCESSED_DIR,
    PROVENANCE,
    RAW_DIR,
    die,
    download,
    read_season_csv,
    require_env,
    write_json,
)

CORPUS_API = (
    "https://api.github.com/repos/linouk23/NBA-Player-Movements/contents/"
    "data/2016.NBA.Raw.SportVU.Game.Logs"
)
CORPUS_RAW = (
    "https://raw.githubusercontent.com/linouk23/NBA-Player-Movements/master/"
    "data/2016.NBA.Raw.SportVU.Game.Logs/"
)
PBP_RAW = (
    "https://raw.githubusercontent.com/sealneaward/nba-movement-data/master/data/events/"
)

# Court frame of the tracking feed: feet, 94 x 50, origin at a corner.
HOOP_RIGHT_X, HOOP_LEFT_X, HOOP_Y = 88.75, 5.25, 25.0
RIM_HEIGHT = 10.0

# Made and missed field goals - the events that own a shot.
SHOT_MSG_TYPES = {1, 2}

HZ = 25
# How much gesture to keep before the ball leaves the hand. Five seconds turned
# out to be the whole transition up the floor - a run-on sentence that spills
# off the plate and reads as noise. A chance is a single gesture: the catch, the
# move, the release.
GATHER_SECONDS = 2.2
MAX_FLIGHT_SECONDS = 3.0  # release to rim
# The plate is one halfcourt. A trace is trimmed where the ball entered it, so
# nothing is ever drawn outside the frame the whole piece is composed in.
# The halfcourt line is 47 ft from the baseline and the hoop stands 5.25 ft in
# front of it, so it is 41.75 ft out - the same box the samples are clipped to.
HALFCOURT_Y_TENTHS = 420
HALFCOURT_X_TENTHS = 250
# Sampling must be contiguous, or the polyline draws a straight line across the
# court between two moments the feed never connected.
MAX_GAP_MS = 120
# Release must land near where the record filed the shot, or the trace is not
# describing the dot it claims to describe.
MAX_ANCHOR_RESIDUAL_FT = 6.0


def api_listing():
    req = urllib.request.Request(CORPUS_API, headers={"Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def pick_games(n):
    """A deterministic spread across the whole window, not a favourite handful.

    Act III is a portrait of eleven weeks; sampling them evenly is the honest
    curation. The four empty 32-byte shells and the ten upstream-misnamed
    archives are excluded here (the misnamed ones are the entire Dec 5 slate -
    see MISNAMED_PREFIX in common.py; they are skipped for tidiness, never
    pattern-filtered away silently).
    """
    entries = [e for e in api_listing() if e["name"].endswith(".7z") and e["size"] > 1024]
    usable = sorted(e for e in (x["name"] for x in entries) if _parse_name(e))
    if not usable:
        die("no usable archives in corpus listing")
    step = max(1, len(usable) // n)
    return [usable[i * step] for i in range(min(n, len(usable)))]


def _parse_name(name):
    """MM.DD.YYYY.VIS.at.HOME.7z -> (iso date, vis, home), or None if misnamed."""
    parts = name[:-3].split(".")
    if len(parts) != 6 or parts[4] != "at":
        return None
    mm, dd, yyyy, vis, _at, home = parts
    if not (mm.isdigit() and dd.isdigit() and yyyy.isdigit()):
        return None
    return f"{yyyy}-{mm}-{dd}", vis, home


def extract_7z(archive, dest_dir):
    if shutil.which("bsdtar"):
        cmd = ["bsdtar", "-xf", str(archive), "-C", str(dest_dir)]
    else:
        exe = next((e for e in ("7z", "7za", "7zz") if shutil.which(e)), None)
        if exe:
            cmd = [exe, "x", "-y", f"-o{dest_dir}", str(archive)]
        else:
            cmd = ["tar", "-xf", str(archive), "-C", str(dest_dir)]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if proc.returncode != 0:
        die(f"7z extraction failed: {proc.stderr.decode()[:400]}")


def ball_track(event):
    """Deduplicated ball path for one tracking event: [(ts, x, y, z), ...].

    Adjacent events overlap heavily (2.6x corpus-wide), so dedup on
    (period, unix_ms) comes before anything else.
    """
    seen = set()
    out = []
    for m in event["moments"]:
        period, ts, _gc, _sc, _null, positions = m
        if (period, ts) in seen:
            continue
        seen.add((period, ts))
        for row in positions:
            if row[0] == -1:
                out.append((ts, row[2], row[3], row[4]))
                break
    out.sort(key=lambda r: r[0])
    return out


def find_shot(track):
    """Locate release and rim arrival in a ball path.

    Arrival: the ball nearest a hoop while up at rim height. Release: walking
    back from there, the last moment the ball was low enough to be in a hand.
    No event label is used - the gesture is read off the physics, which is the
    piece's argument stated backwards.
    """
    best = None
    for i, (_ts, x, y, z) in enumerate(track):
        if not (RIM_HEIGHT - 1.5 <= z <= RIM_HEIGHT + 4.0):
            continue
        for hoop_x in (HOOP_RIGHT_X, HOOP_LEFT_X):
            d = ((x - hoop_x) ** 2 + (y - HOOP_Y) ** 2) ** 0.5
            if d < 2.5 and (best is None or d < best[0]):
                best = (d, i, hoop_x)
    if best is None:
        return None
    _d, arrive_i, hoop_x = best

    release_i = None
    lo = max(0, arrive_i - int(MAX_FLIGHT_SECONDS * HZ))
    for i in range(arrive_i, lo, -1):
        if track[i][3] < 7.5:
            release_i = i
            break
    if release_i is None or release_i == 0:
        return None
    return release_i, arrive_i, hoop_x


def to_shot_frame(x_ft, y_ft, hoop_x):
    """Court feet -> the shot record's own frame: tenths, hoop at the origin."""
    if hoop_x == HOOP_RIGHT_X:
        return (y_ft - HOOP_Y) * 10.0, (HOOP_RIGHT_X - x_ft) * 10.0
    return (HOOP_Y - y_ft) * 10.0, (x_ft - HOOP_LEFT_X) * 10.0


def build_traces(game_json, pbp_rows, shots_by_event, game_label):
    """One candidate trace per shot event whose geometry checks out."""
    game = json.loads(Path(game_json).read_text())
    out = []
    for event in game["events"]:
        try:
            eid = int(event["eventId"])
        except (KeyError, ValueError):
            continue
        if eid not in pbp_rows or eid not in shots_by_event:
            continue
        track = ball_track(event)
        if len(track) < HZ:
            continue
        found = find_shot(track)
        if not found:
            continue
        release_i, arrive_i, hoop_x = found

        anchor = shots_by_event[eid]
        rx, ry, _rz = track[release_i][1:]
        sx, sy = to_shot_frame(rx, ry, hoop_x)
        residual = (((sx - anchor["loc_x"]) ** 2 + (sy - anchor["loc_y"]) ** 2) ** 0.5) / 10.0
        if residual > MAX_ANCHOR_RESIDUAL_FT:
            continue

        # Walk back from the release only as far as the gesture actually runs:
        # stop at the halfcourt line, at a break in the feed, or at the cap.
        floor = max(0, release_i - int(GATHER_SECONDS * HZ))
        start = release_i
        for i in range(release_i, floor, -1):
            fx, fy = to_shot_frame(track[i][1], track[i][2], hoop_x)
            if fy > HALFCOURT_Y_TENTHS or abs(fx) > HALFCOURT_X_TENTHS:
                break
            if i > 0 and (track[i][0] - track[i - 1][0]) > MAX_GAP_MS:
                break
            start = i
        if release_i - start < HZ // 2:
            continue

        pts = []
        for i in range(start, arrive_i + 1):
            _ts, x, y, z = track[i]
            fx, fy = to_shot_frame(x, y, hoop_x)
            pts.append([round(fx, 1), round(fy, 1), round(z, 2)])
        if len(pts) < HZ:
            continue

        out.append({
            "game": game_label,
            "game_id": game["gameid"],
            "date": game["gamedate"],
            "event_id": eid,
            "player": anchor["player"],
            "action": anchor["action"],
            "made": anchor["made"],
            "zone": anchor["zone"],
            "anchor": [anchor["loc_x"], anchor["loc_y"]],
            "anchor_residual_ft": round(residual, 2),
            "release_index": release_i - start,
            "hz": HZ,
            "points": pts,
        })
    return out


def legibility(trace):
    """Curation, not statistics: prefer gestures that read as gestures.

    Act III's claim is "this is what the public could see through the window",
    not "these are representative", so the score rewards formal clarity - a
    complete arc, real travel before the release, a clean anchor.
    """
    pts = trace["points"]
    rel = trace["release_index"]
    travel = sum(
        ((pts[i][0] - pts[i - 1][0]) ** 2 + (pts[i][1] - pts[i - 1][1]) ** 2) ** 0.5
        for i in range(1, rel + 1)
    ) / 10.0
    apex = max(p[2] for p in pts[rel:]) if rel < len(pts) else 0.0
    flight = len(pts) - rel
    # Travel is scored as a band, not a maximum. A gesture moves; a transition
    # up the floor is a run-on sentence that crosses the whole plate and reads
    # as noise, so long paths are penalised rather than rewarded.
    ideal_ft = 24.0
    travel_score = max(0.0, 1.0 - abs(travel - ideal_ft) / 26.0)
    return (
        travel_score * 2.0
        + min(apex, 18.0) / 18.0
        + min(flight / (HZ * 1.2), 1.0)
        - trace["anchor_residual_ft"] / MAX_ANCHOR_RESIDUAL_FT
    )


def curate(candidates, want):
    """Spread the selection across games and zones so the window is portrayed,
    not one night of it."""
    ranked = sorted(candidates, key=legibility, reverse=True)
    chosen, per_game, per_zone = [], {}, {}
    for cap_game, cap_zone in ((2, 6), (3, 10), (99, 99)):
        for t in ranked:
            if len(chosen) >= want:
                break
            if t in chosen:
                continue
            g, z = t["game"], t["zone"]
            if per_game.get(g, 0) >= cap_game or per_zone.get(z, 0) >= cap_zone:
                continue
            chosen.append(t)
            per_game[g] = per_game.get(g, 0) + 1
            per_zone[z] = per_zone.get(z, 0) + 1
        if len(chosen) >= want:
            break
    return chosen


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--games", type=int, default=12)
    ap.add_argument("--traces", type=int, default=32)
    args = ap.parse_args()
    require_env()

    shots = read_season_csv(
        2015,
        usecols=["GAME_ID", "GAME_EVENT_ID", "LOC_X", "LOC_Y", "PLAYER_NAME",
                 "ACTION_TYPE", "SHOT_ZONE_BASIC", "SHOT_MADE_FLAG"],
    )
    shots["gid"] = shots.GAME_ID.astype(str).str.lstrip("0")

    sportvu = RAW_DIR / "sportvu"
    sportvu.mkdir(parents=True, exist_ok=True)
    names = pick_games(args.games)
    print(f"corpus sample: {len(names)} games across the window")

    candidates = []
    for name in names:
        parsed = _parse_name(name)
        date, vis, home = parsed
        label = f"{date} {vis}@{home}"
        archive = sportvu / name
        if not archive.exists() or archive.stat().st_size < 1024:
            download(CORPUS_RAW + name, archive)

        with tempfile.TemporaryDirectory() as tmp:
            extract_7z(archive, tmp)
            jsons = list(Path(tmp).glob("*.json"))
            if not jsons:
                print(f"  {label}: no JSON in archive, skipped")
                continue
            game_json = jsons[0]
            gid = game_json.stem

            pbp_path = sportvu / f"pbp_{gid}.csv"
            if not pbp_path.exists():
                try:
                    download(PBP_RAW + f"{gid}.csv", pbp_path)
                except RuntimeError:
                    print(f"  {label}: no play-by-play, skipped")
                    continue

            import pandas as pd
            pbp = pd.read_csv(pbp_path)
            pbp_shots = set(pbp[pbp.EVENTMSGTYPE.isin(SHOT_MSG_TYPES)].EVENTNUM.astype(int))

            g = shots[shots.gid == gid.lstrip("0")]
            by_event = {
                int(r.GAME_EVENT_ID): {
                    "loc_x": int(r.LOC_X), "loc_y": int(r.LOC_Y),
                    "player": r.PLAYER_NAME, "action": r.ACTION_TYPE,
                    "zone": r.SHOT_ZONE_BASIC, "made": int(r.SHOT_MADE_FLAG),
                }
                for r in g.itertuples()
            }
            found = build_traces(game_json, pbp_shots, by_event, label)
            candidates.extend(found)
            print(f"  {label}: {len(by_event)} shots, {len(pbp_shots)} in pbp -> "
                  f"{len(found)} traces recovered")

    if not candidates:
        die("no traces recovered - the join or the geometry is wrong")

    chosen = curate(candidates, args.traces)
    residuals = sorted(t["anchor_residual_ft"] for t in chosen)
    median = residuals[len(residuals) // 2]

    out = {
        "generated_by": "pipeline/bloom.py",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "provenance": PROVENANCE,
        "join": "tracking eventId == pbp EVENTNUM == shotdetail GAME_EVENT_ID",
        "frame": "tenths of feet, hoop at origin - the shot record's own frame",
        "candidates": len(candidates),
        "median_anchor_residual_ft": median,
        "traces": chosen,
    }
    write_json(PROCESSED_DIR / "traces.json", out, compact=True)
    print(f"\nQA: {len(candidates)} candidates -> {len(chosen)} curated; "
          f"median anchor residual {median} ft")
    print(f"     zones: {sorted({t['zone'] for t in chosen})}")
    print(f"traces -> data/processed/traces.json")


if __name__ == "__main__":
    main()
