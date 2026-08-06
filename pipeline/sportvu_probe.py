#!/usr/bin/env python3
"""SportVU corpus verification probe (Act III feasibility, plan sections 1.1-1.2).

Three checks, each a live measurement, none load-bearing for the shot spine:
  1. Corpus listing: the 636-archive directory on linouk23/NBA-Player-Movements,
     including the four 32-byte empty shells and the total compressed size.
  2. Proof archive: download 10.28.2015.NOP.at.POR.7z (skipped if mirrored
     locally), byte-exact size check against the plan's measurement.
  3. Parse: extract and parse the game JSON; assert the schema facts the
     Act III parser will be built on (dedup ratio, 25 Hz, ball-z-only 3D).

Writes data/processed/sportvu_probe.json. Exits 1 if any hard check fails.

Usage: python3 pipeline/sportvu_probe.py [--skip-listing]
"""

import argparse
import datetime
import json
import re
import shutil
import subprocess
import sys
import urllib.request
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    PROCESSED_DIR,
    PROVENANCE,
    RAW_DIR,
    die,
    download,
    sha256_file,
    write_json,
)

CORPUS_API = (
    "https://api.github.com/repos/linouk23/NBA-Player-Movements/contents/"
    "data/2016.NBA.Raw.SportVU.Game.Logs"
)
PROOF_NAME = "10.28.2015.NOP.at.POR.7z"
PROOF_URL = (
    "https://raw.githubusercontent.com/linouk23/NBA-Player-Movements/master/"
    "data/2016.NBA.Raw.SportVU.Game.Logs/" + PROOF_NAME
)
PROOF_JSON = "0021500015.json"

# 10 archives (the entire Dec 5, 2015 slate) are misnamed upstream with this
# literal prefix glued onto the normal MM.DD.YYYY.VIS.at.HOME.7z name. The
# Act III mirror must strip it, never pattern-filter names (found 2026-08-06;
# falsifies the plan section 1.1 naming claim for those 10 games).
MISNAMED_PREFIX = "2016.NBA.Raw.SportVU.Game.Logs"

# The size of an archive that exists and holds nothing. The piece names this
# number in its terminal beat, so it ships as a measurement rather than as a
# literal typed into the renderer.
EMPTY_SHELL_BYTES = 32

# Plan section 1.1 / 1.2, measured 2026-08-04 (misnamed count measured 2026-08-06).
EXPECTED = {
    "archive_count": 636,
    "empty_shell_count": 4,
    "misnamed_count": 10,
    "date_range": ["2015-10-27", "2016-01-23"],
    "corpus_bytes": 3_793_503_906,
    "proof_bytes": 6_077_973,
    "json_bytes": 103_483_510,
    "events": 447,
    "raw_moments": 210_514,
    "unique_moments": 80_951,
    "ball_z_min": 0.01,
    "ball_z_max": 17.11,
    "hz_mode_ms": 40,
}

failures = []


def check(name, got, want):
    ok = got == want
    print(f"  {'PASS' if ok else 'FAIL'}  {name}: got {got}, expected {want}")
    if not ok:
        failures.append(name)


def list_corpus():
    req = urllib.request.Request(CORPUS_API, headers={"Accept": "application/vnd.github+json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            entries = json.load(r)
    except Exception as e:  # noqa: BLE001 - listing is best-effort (API rate limits)
        print(f"  WARNING: corpus listing unavailable ({e}); size/count checks skipped")
        return None
    if not isinstance(entries, list):
        print(f"  WARNING: unexpected API response: {entries}")
        return None
    sizes = [e["size"] for e in entries]
    shells = sorted(e["name"] for e in entries if e["size"] == EMPTY_SHELL_BYTES)
    misnamed = sorted(
        e["name"] for e in entries if not re.match(r"^\d{2}\.\d{2}\.\d{4}\.", e["name"])
    )

    def entry_date(name):
        if name.startswith(MISNAMED_PREFIX):
            name = name[len(MISNAMED_PREFIX):]
        try:
            return datetime.datetime.strptime(name[:10], "%m.%d.%Y").date()
        except ValueError:
            return None

    dates = sorted(d for d in (entry_date(e["name"]) for e in entries) if d is not None)
    undated = len(entries) - len(dates)
    listing = {
        "archive_count": len(entries),
        "total_bytes": sum(sizes),
        "empty_32B_shells": shells,
        "empty_shell_bytes": EMPTY_SHELL_BYTES,
        "misnamed_archives": misnamed,
        "date_range": [dates[0].isoformat(), dates[-1].isoformat()] if dates else None,
    }
    check("archive count", listing["archive_count"], EXPECTED["archive_count"])
    check("corpus compressed bytes", listing["total_bytes"], EXPECTED["corpus_bytes"])
    check("empty 32-byte shells", len(shells), EXPECTED["empty_shell_count"])
    check("misnamed archives (Dec 5, 2015 slate)", len(misnamed), EXPECTED["misnamed_count"])
    check("corpus date range", listing["date_range"], EXPECTED["date_range"])
    if undated:
        print(f"  WARNING: {undated} entries had unparseable dates")
    return listing


def extract_7z(archive, dest_dir):
    try:
        import py7zr

        with py7zr.SevenZipFile(archive) as z:
            z.extractall(dest_dir)
        return
    except ImportError:
        pass
    # bsdtar/libarchive reads 7z natively; GNU tar cannot, so probe for a real extractor.
    cmd = None
    if shutil.which("bsdtar"):
        cmd = ["bsdtar", "-xf", str(archive), "-C", str(dest_dir)]
    else:
        for exe in ("7z", "7za", "7zz"):
            if shutil.which(exe):
                cmd = [exe, "x", "-y", f"-o{dest_dir}", str(archive)]
                break
    if cmd is None and shutil.which("tar"):
        ver = subprocess.run(["tar", "--version"], stdout=subprocess.PIPE,
                             stderr=subprocess.STDOUT, check=False)
        if b"bsdtar" in ver.stdout:
            cmd = ["tar", "-xf", str(archive), "-C", str(dest_dir)]
    if cmd is None:
        die("no 7z extractor found: install py7zr, p7zip (7z), or libarchive bsdtar "
            "- GNU tar cannot read .7z")
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if proc.returncode != 0:
        die(f"7z extraction failed ({cmd[0]}): {proc.stderr.decode()[:500]}")


def parse_game(path):
    game = json.loads(Path(path).read_text())
    raw = 0
    seen = set()
    ordered = []
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
            ordered.append((period, ts))
            row_counts[len(pos)] += 1
            if sc is None:
                null_shot_clock += 1
            ball = next((r for r in pos if r[0] == -1), None)
            if ball is None:
                missing_ball += 1
            else:
                ball_z_min = min(ball_z_min, ball[4])
                ball_z_max = max(ball_z_max, ball[4])

    ordered.sort()
    diffs = Counter(
        b[1] - a[1] for a, b in zip(ordered, ordered[1:]) if a[0] == b[0]
    )
    mode_ms = diffs.most_common(1)[0][0]

    return {
        "gameid": game["gameid"],
        "gamedate": game["gamedate"],
        "events": len(game["events"]),
        "raw_moments": raw,
        "unique_moments": len(seen),
        "duplication_ratio": round(raw / len(seen), 2),
        "rows_per_moment": dict(sorted(row_counts.items())),
        "moments_missing_ball": missing_ball,
        "null_shot_clock": null_shot_clock,
        "ball_z_min": round(ball_z_min, 2),
        "ball_z_max": round(ball_z_max, 2),
        "timestamp_diff_mode_ms": mode_ms,
        "tracked_minutes": round(len(seen) * mode_ms / 1000 / 60, 1),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-listing", action="store_true", help="skip the GitHub API corpus listing")
    args = ap.parse_args()

    print("1. Corpus listing")
    listing = None if args.skip_listing else list_corpus()

    print("2. Proof archive")
    sportvu_dir = RAW_DIR / "sportvu"
    archive = sportvu_dir / PROOF_NAME
    if not archive.exists() or archive.stat().st_size == 0:
        download(PROOF_URL, archive)
    check("proof archive bytes", archive.stat().st_size, EXPECTED["proof_bytes"])
    archive_sha = sha256_file(archive)
    print(f"        sha256 {archive_sha}")

    game_json = sportvu_dir / PROOF_JSON
    if not game_json.exists():
        extract_7z(archive, sportvu_dir)
    check("game JSON bytes", game_json.stat().st_size, EXPECTED["json_bytes"])

    print("3. Parse")
    m = parse_game(game_json)
    check("events", m["events"], EXPECTED["events"])
    check("raw moments", m["raw_moments"], EXPECTED["raw_moments"])
    check("unique moments after (period,unix_ms) dedup", m["unique_moments"], EXPECTED["unique_moments"])
    check("ball z min (ft)", m["ball_z_min"], EXPECTED["ball_z_min"])
    check("ball z max (ft)", m["ball_z_max"], EXPECTED["ball_z_max"])
    check("timestamp diff mode (ms)", m["timestamp_diff_mode_ms"], EXPECTED["hz_mode_ms"])
    print(f"        duplication {m['duplication_ratio']}x, tracked {m['tracked_minutes']} min, "
          f"rows/moment {m['rows_per_moment']}, missing-ball {m['moments_missing_ball']}, "
          f"null shot clock {m['null_shot_clock']}")

    record = {
        "generated_by": "pipeline/sportvu_probe.py",
        "probed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "provenance": PROVENANCE,
        "corpus_listing": listing,
        "proof_archive": {"name": PROOF_NAME, "url": PROOF_URL,
                          "bytes": archive.stat().st_size, "sha256": archive_sha},
        "game_measurements": m,
        "expected_from_plan": EXPECTED,
    }
    write_json(PROCESSED_DIR / "sportvu_probe.json", record)

    if failures:
        print(f"\nPROBE RED: {len(failures)} mismatch(es) vs plan sections 1.1-1.2.")
        sys.exit(1)
    print("\nPROBE GREEN: corpus live, schema as measured in the plan.")


if __name__ == "__main__":
    main()
