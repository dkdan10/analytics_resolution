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

# --- the interpreter --------------------------------------------------------
# Every number this project publishes was produced with these versions. A
# different numpy or pandas can import cleanly and still run the gate to green
# on libraries the results were never verified against, so this checks
# versions, not just importability.
REQUIRED = {"numpy": "2.0.2", "pandas": "2.3.2"}


def require_env(strict=True):
    """Fail early and legibly if the interpreter is not the verified one.

    Called from each stage's main(). Raising a bare ModuleNotFoundError here
    sends the reader looking for a missing package when the real problem is
    that the wrong python3 won the PATH.
    """
    found, missing, wrong = {}, [], []
    for mod, want in REQUIRED.items():
        try:
            m = __import__(mod)
        except ImportError:
            missing.append(mod)
            continue
        got = getattr(m, "__version__", "unknown")
        found[mod] = got
        if got != want:
            wrong.append(f"{mod} {got} (verified against {want})")

    if not missing and not wrong:
        return found

    print(f"\nThis interpreter cannot reproduce the project's numbers.\n", file=sys.stderr)
    print(f"  running: {sys.executable}", file=sys.stderr)
    print(f"           Python {sys.version.split()[0]}", file=sys.stderr)
    if missing:
        print(f"  missing: {', '.join(missing)}", file=sys.stderr)
    if wrong:
        print(f"  version: {'; '.join(wrong)}", file=sys.stderr)
    print(
        "\n  This repo pins its interpreter in .python-version and its libraries in\n"
        "  requirements.txt. Run the pipeline from a Python 3.9 virtualenv with\n"
        "  requirements.txt installed (see the README's Quick start).\n",
        file=sys.stderr,
    )
    if strict and missing:
        sys.exit(1)
    if strict and wrong:
        sys.exit(1)
    return found

# 30 completed seasons of the public shot-location record: 1996-97 .. 2025-26.
SEASON_START_YEARS = list(range(1996, 2026))

INDEX_URL = "https://raw.githubusercontent.com/shufinskiy/nba_data/main/list_data.txt"

# The shufinskiy index lists github.com/.../raw/ URLs, which 403 from sandboxed
# environments; raw.githubusercontent.com serves the same blobs.
URL_REWRITE = (
    "https://github.com/shufinskiy/nba_data/raw/main/",
    "https://raw.githubusercontent.com/shufinskiy/nba_data/main/",
)

# The 2015-16 SportVU public release: 636 archives, 27 Oct 2015 - 23 Jan 2016.
CORPUS_API = (
    "https://api.github.com/repos/linouk23/NBA-Player-Movements/contents/"
    "data/2016.NBA.Raw.SportVU.Game.Logs"
)
CORPUS_RAW = (
    "https://raw.githubusercontent.com/linouk23/NBA-Player-Movements/master/"
    "data/2016.NBA.Raw.SportVU.Game.Logs/"
)

# 10 archives (the entire Dec 5, 2015 slate) are misnamed upstream with this
# literal prefix glued onto the normal MM.DD.YYYY.VIS.at.HOME.7z name. Strip it;
# never pattern-filter on the date, or those 10 games vanish silently
# (found 2026-08-06: the corpus's usual naming convention does not hold for
# those games).
MISNAMED_PREFIX = "2016.NBA.Raw.SportVU.Game.Logs"

# The size of an archive that exists and holds nothing. Four of the 636.
EMPTY_SHELL_BYTES = 32

# The tracking feed's court frame: feet, 94 x 50, origin at a corner.
HOOP_RIGHT_X, HOOP_LEFT_X, HOOP_Y = 88.75, 5.25, 25.0
RIM_HEIGHT = 10.0
HZ = 25

# --- the league's own map of the floor ---------------------------------------
# SHOT_ZONE_BASIC in the order aggregate.py files it, which is also the order
# site/src/palette.ts assigns hues in. Index is what ships.
ZONE_NAMES = [
    "Restricted Area",
    "In The Paint (Non-RA)",
    "Mid-Range",
    "Left Corner 3",
    "Right Corner 3",
    "Above the Break 3",
    "Backcourt",
]

# The geometry the plate already draws, in tenths of a foot from the hoop.
RESTRICTED_R = 40.0
LANE_HALF_W = 80.0
FREE_THROW_Y = 137.5
THREE_R = 237.5
CORNER_X = 220.0
# Where the arc meets the corner line. Not chosen: the corner-3 line ends 14 ft
# from the baseline and the hoop stands 5.25 ft off it, so sqrt(237.5^2 - 220^2)
# lands at 89.48 tenths = 8.95 ft, which is that same 8.75 ft plus the arc's
# own curvature. Derived here rather than typed.
CORNER_Y = (THREE_R ** 2 - CORNER_X ** 2) ** 0.5
HALFCOURT_Y = 417.5

# THE PLATE'S REACH - the halfcourt box every artifact is clipped to and the box
# `site/src/plate.ts:COURT` draws. The original design clipped LOC_Y to
# [-52, 418]; this widens it two tenths each way so the grid's bins are whole
# feet and the sample and grid totals assert equal (decided 2026-08-06).
#
# It lived only in aggregate.py, which was fine while aggregate.py was the only
# thing that clipped. THE CENSUS's filing made it a question the GATE has to ask
# too - which of the record's own categories land somewhere this plate can hold
# - so it is one definition here rather than two that can drift.
HALF_X_MAX = 250
HALF_Y_MIN = -50
HALF_Y_MAX = 420


def zone_at(x, y):
    """Which of the league's seven regions a point on the floor falls in.

    SHOT_ZONE_BASIC is a PARTITION OF THE FLOOR that the NBA drew, not a
    property of a shot: aggregate.py already verifies that no coordinate
    carries two zones in any season. So the same test that labels a shot also
    labels a place, and a body crossing the floor crosses the league's own
    regions.

    That is the entire footing on which THE HAND is allowed to use colour. It
    is verified rather than asserted - qa.py reclassifies every 2015-16 shot
    from its coordinates alone and gates agreement with the league's own label
    at 99.9% (measured: 207,879 of 207,893). The fourteen misses are FIVE
    boundary coordinates, and the record labels each of them CONSISTENTLY - it
    is a convention that rounds the other way from these polygons, not the
    record contradicting itself, and qa.py gates the consistency too.

    There is a second copy of this rule in site/src/zone.ts, because the
    renderer needs it. The two are checked against one committed fixture -
    pipeline/checks/zone_fixture.json, regenerated by `qa.py
    --write-zone-fixture`, re-derived here by qa.py and there by `npm run gate`
    - so neither toolchain has to run the other's and neither can drift.
    """
    import math

    if y > HALFCOURT_Y:
        return 6
    if abs(x) >= CORNER_X and y <= CORNER_Y:
        return 3 if x < 0 else 4
    if math.hypot(x, y) >= THREE_R:
        return 5
    if math.hypot(x, y) <= RESTRICTED_R:
        return 0
    if abs(x) <= LANE_HALF_W and y <= FREE_THROW_Y:
        return 1
    return 2

PROVENANCE = {
    "shots_source": "stats.nba.com shotchartdetail, bulk archive github.com/shufinskiy/nba_data",
    "sportvu_source": (
        "NBA/STATS SportVU public 2015-16 release, github.com/linouk23/NBA-Player-Movements "
        "+ mirrors (github.com/sealneaward/nba-movement-data, HF dcayton/nba_tracking_data_15_16)"
    ),
    "license_note": "derived data only; bulk dumps are never committed (see README.md, Data & license)",
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


def extract_7z(archive, dest_dir):
    """Extract a .7z, raising rather than exiting so one bad archive is survivable.

    py7zr first where it imports, then bsdtar/libarchive (which reads 7z
    natively), then p7zip. GNU tar CANNOT read 7z, so `tar` is only accepted
    once its --version identifies it as bsdtar - otherwise a run appears to
    work and produces nothing.
    """
    import shutil

    try:
        import py7zr

        with py7zr.SevenZipFile(archive) as z:
            z.extractall(dest_dir)
        return
    except ImportError:
        pass

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
        raise RuntimeError(
            "no 7z extractor found: install py7zr, p7zip (7z), or libarchive bsdtar "
            "- GNU tar cannot read .7z"
        )
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if proc.returncode != 0:
        raise RuntimeError(f"7z extraction failed ({cmd[0]}): {proc.stderr.decode()[:400]}")


def read_7z_bytes(archive):
    """The single file inside a .7z, straight to memory.

    A SportVU game unpacks to ~100 MB of JSON. Extracting it to a temp
    directory and reading it back costs two full passes over the disk per game,
    and across six parallel workers that is what the stage spends most of its
    time on: measured at 126 s of system time against 65 s of user time. Piping
    libarchive's output instead removes both passes.

    Falls back to extract_7z on disk when no streaming extractor is available.
    """
    import shutil

    cmd = None
    if shutil.which("bsdtar"):
        cmd = ["bsdtar", "-xOf", str(archive)]
    else:
        for exe in ("7z", "7za", "7zz"):
            if shutil.which(exe):
                cmd = [exe, "x", "-so", str(archive)]
                break
    if cmd is None:
        return None
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if proc.returncode != 0 or not proc.stdout:
        raise RuntimeError(f"7z stream failed ({cmd[0]}): {proc.stderr.decode()[:400]}")
    return proc.stdout


def _lzma_available():
    try:
        import lzma  # noqa: F401
        return True
    except ImportError:
        return False


def read_season_csv(start_year, **read_csv_kwargs):
    """Read one season's shotdetail CSV out of its tar.xz dump.

    A Python built without _lzma (some source builds) cannot open tar.xz via
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
