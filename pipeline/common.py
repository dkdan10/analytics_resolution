"""Shared constants and helpers for the FADEAWAY data pipeline.

Provenance: NBA shot data via stats.nba.com, bulk archive shufinskiy/nba_data;
SportVU public 2015-16 release (linouk23/NBA-Player-Movements + mirrors).
"""

import hashlib
import io
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SHOTS_DIR = REPO_ROOT / "data" / "shots"
RAW_DIR = REPO_ROOT / "data" / "raw"
PROCESSED_DIR = REPO_ROOT / "data" / "processed"

# 30 completed seasons of the public shot-location record: 1996-97 .. 2025-26.
SEASON_START_YEARS = list(range(1996, 2026))

INDEX_URL = "https://raw.githubusercontent.com/shufinskiy/nba_data/main/list_data.txt"

# The shufinskiy index lists github.com/.../raw/ URLs, which 403 from sandboxed
# environments; raw.githubusercontent.com serves the same blobs (plan Appendix A2).
URL_REWRITE = (
    "https://github.com/shufinskiy/nba_data/raw/main/",
    "https://raw.githubusercontent.com/shufinskiy/nba_data/main/",
)

PROVENANCE = {
    "shots_source": "stats.nba.com shotchartdetail, bulk archive github.com/shufinskiy/nba_data",
    "sportvu_source": (
        "NBA/STATS SportVU public 2015-16 release, github.com/linouk23/NBA-Player-Movements "
        "+ mirrors (github.com/sealneaward/nba-movement-data, HF dcayton/nba_tracking_data_15_16)"
    ),
    "license_note": "derived data only; bulk dumps are never committed (see CLAUDE.md data rights)",
}

# Fixed sampling seed: the date the public tracking window opened (2015-10-27).
SAMPLE_SEED = 20151027


def season_label(start_year):
    return f"{start_year}-{str(start_year + 1)[-2:]}"


def dump_path(start_year):
    return SHOTS_DIR / f"shotdetail_{start_year}.tar.xz"


def fetch_text(url, timeout=60, retries=3):
    last_err = None
    for _ in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=timeout) as r:
                return r.read().decode("utf-8")
        except Exception as e:  # noqa: BLE001 - retry any transport error
            last_err = e
    raise RuntimeError(f"failed to fetch {url}: {last_err}")


def download(url, dest, timeout=300, retries=3):
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    last_err = None
    for _ in range(retries):
        try:
            tmp = dest.with_suffix(dest.suffix + ".part")
            with urllib.request.urlopen(url, timeout=timeout) as r, open(tmp, "wb") as f:
                while True:
                    chunk = r.read(1 << 20)
                    if not chunk:
                        break
                    f.write(chunk)
            tmp.rename(dest)
            return dest
        except Exception as e:  # noqa: BLE001
            last_err = e
    raise RuntimeError(f"failed to download {url}: {last_err}")


def sha256_file(path, bufsize=1 << 20):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(bufsize)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def _lzma_available():
    try:
        import lzma  # noqa: F401
        return True
    except ImportError:
        return False


def read_season_csv(start_year, **read_csv_kwargs):
    """Read one season's shotdetail CSV out of its tar.xz dump.

    Python built without _lzma (e.g. some pyenv builds) cannot open tar.xz via
    tarfile, so fall back to streaming through bsdtar, which links liblzma.
    """
    import pandas as pd

    path = dump_path(start_year)
    member = f"shotdetail_{start_year}.csv"
    if not path.exists():
        raise FileNotFoundError(f"{path} missing - run pipeline/acquire.py first")

    if _lzma_available():
        import tarfile

        with tarfile.open(path, "r:xz") as tf:
            fobj = tf.extractfile(member)
            if fobj is None:
                raise RuntimeError(f"{member} not found in {path}")
            return pd.read_csv(io.BytesIO(fobj.read()), **read_csv_kwargs)

    proc = subprocess.run(
        ["tar", "-xOf", str(path), member],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"tar failed on {path}: {proc.stderr.decode()[:500]}")
    return pd.read_csv(io.BytesIO(proc.stdout), **read_csv_kwargs)


def write_json(path, obj, compact=False):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        if compact:
            json.dump(obj, f, separators=(",", ":"))
        else:
            json.dump(obj, f, indent=2)
        f.write("\n")


def die(msg):
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)
