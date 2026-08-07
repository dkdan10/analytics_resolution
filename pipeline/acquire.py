#!/usr/bin/env python3
"""Stage 1 - acquire the 30-season shot-location record.

Downloads shotdetail_{1996..2025}.tar.xz from the shufinskiy/nba_data bulk
archive into data/shots/ (gitignored) and writes a sha256 manifest to
data/processed/acquisition_manifest.json.

Usage: python3 pipeline/acquire.py [--force] [--years 1996,2015,...]
"""

import argparse
import datetime
import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    INDEX_URL,
    PROCESSED_DIR,
    PROVENANCE,
    SEASON_START_YEARS,
    URL_REWRITE,
    die,
    download,
    dump_path,
    fetch_text,
    require_env,
    season_label,
    sha256_file,
    write_json,
)


def resolve_urls():
    """Parse the upstream index and return {start_year: rewritten_url}."""
    index = fetch_text(INDEX_URL)
    entries = {}
    for line in index.splitlines():
        if "=" not in line:
            continue
        key, url = line.split("=", 1)
        entries[key.strip()] = url.strip()

    urls = {}
    missing = []
    for year in SEASON_START_YEARS:
        key = f"shotdetail_{year}"
        if key not in entries:
            missing.append(key)
            continue
        urls[year] = entries[key].replace(*URL_REWRITE)
    if missing:
        die(f"index at {INDEX_URL} is missing entries: {missing}")
    return urls


def acquire_one(year, url, force):
    dest = dump_path(year)
    fetched = False
    if force or not dest.exists() or dest.stat().st_size == 0:
        download(url, dest)
        fetched = True
    return year, {
        "file": dest.name,
        "url": url,
        "bytes": dest.stat().st_size,
        "sha256": sha256_file(dest),
        "fetched": fetched,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="re-download even if present")
    ap.add_argument("--years", help="comma-separated season start years (default: all 30)")
    args = ap.parse_args()
    require_env()

    years = SEASON_START_YEARS
    if args.years:
        years = sorted({int(y) for y in args.years.split(",")})

    urls = resolve_urls()
    results = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(acquire_one, y, urls[y], args.force) for y in years]
        for fut in as_completed(futures):
            year, info = fut.result()
            results[year] = info
            status = "fetched" if info["fetched"] else "cached"
            print(f"  {season_label(year)}  {info['bytes']:>9,} B  {status}  {info['sha256'][:12]}")

    total = sum(r["bytes"] for r in results.values())
    print(f"\nQA: {len(results)} dumps present, {total:,} bytes total")
    if len(results) != len(years):
        die(f"expected {len(years)} dumps, have {len(results)}")

    # Merge into the existing manifest: a --years refresh must never erase the
    # checksummed provenance record for the seasons it didn't touch.
    out = PROCESSED_DIR / "acquisition_manifest.json"
    files = {}
    if out.exists():
        files = json.loads(out.read_text()).get("files", {})
    for y in sorted(results):
        label = season_label(y)
        prev = files.get(label)
        if prev and prev.get("sha256") != results[y]["sha256"]:
            print(f"  WARNING {label}: sha256 changed {prev['sha256'][:12]} -> "
                  f"{results[y]['sha256'][:12]} (upstream dump replaced?)")
        files[label] = results[y]
    if len(files) < len(SEASON_START_YEARS):
        print(f"  note: manifest covers {len(files)}/{len(SEASON_START_YEARS)} seasons so far")

    manifest = {
        "generated_by": "pipeline/acquire.py",
        "fetched_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "index_url": INDEX_URL,
        "provenance": PROVENANCE,
        "files": dict(sorted(files.items())),
    }
    write_json(out, manifest)
    print(f"manifest -> {out.relative_to(Path.cwd()) if out.is_relative_to(Path.cwd()) else out}")


if __name__ == "__main__":
    main()
