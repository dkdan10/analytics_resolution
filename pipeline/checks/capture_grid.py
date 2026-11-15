#!/usr/bin/env python3
"""The record's capture grid: how far apart the lines it actually files on are.

Every coordinate in the record is stored in tenths of a foot, and that storage
quantum is constant across all thirty seasons. The lines the record USES are
not: off the rim, whole tenth-lines go empty in a regular pattern, so the
instrument behind the file was placing shots on a coarser lattice than the
file can hold. This measures that lattice, per season and per axis, from the
shipped `data/processed/points/season_*.bin` alone, and says which radius
multiple the field's splat would take if its radius followed it.

THE ESTIMATOR, every decision of it written down, because each one changes the
counts:

  - Cells beyond OFF_RIM_TENTHS of the hoop only (strictly beyond). The rim is
    where the record's refusals pile and where hires and the rest arenas mix;
    the spacing is a property of the placed floor.
  - A line's LOAD is the shots filed on it: for the x axis every off-rim cell
    with that x, summed over y; for y the same the other way.
  - The box is the plate's inclusive halfcourt (common.py HALF_X_MAX,
    HALF_Y_MIN, HALF_Y_MAX).
  - THE EDGE RULE: a line is eligible only when its whole NEIGHBOURHOOD-line
    neighbourhood (itself and NEIGHBOURHOOD // 2 lines each side) lies inside
    the box. A neighbourhood is never clipped and never padded. Clipping it
    would let the sparse corner lines near the sidelines judge themselves
    against a handful of equally sparse neighbours, and they would count as
    unused in seasons that use every line.
  - The neighbourhood's REFERENCE is the median of its fuller half: the
    loads sorted, the NEIGHBOURHOOD // 2 + 1 largest kept (the middle one
    included), and the middle of those taken - one element, so the reference
    is a whole count and the decisions below compare integers with a product.
    A median of the whole neighbourhood would sit near zero exactly where half
    the lines are empty, which is the case being measured.
  - Eligible also needs a reference of at least MIN_LOCAL_LOAD: a line among
    lines that hold almost nothing says nothing about the lattice.
  - A line is USED when its own load is at least USED_SHARE of its reference.
  - spacing_tenths is eligible / used, the mean distance between used lines,
    except that fewer than LATTICE_MIN_UNUSED unused lines snap it to exactly
    1: a handful of empty lines is noise in a season that uses all of them.

WHAT THE SPACING CHOOSES. The splat is a peak-1 paraboloid on a disc of radius
k * (one tenth's width), and its response at the tenth lattice's fundamental is
8 * J2(2*pi*k) / (2*pi*k)^2 - zero exactly at k = j2,n / (2*pi). Today's k is
`SPLAT_SPACING_K`, the third such zero. A radius that followed the capture
lattice would be k = SPLAT_SPACING_K * g, g = sqrt(spacing_x * spacing_y); that
leaves the zero and brings the 0.1-ft line back, so such a radius would snap
g's multiple onto a zero instead. The table of zeros is SPLAT_SPACING_K and the
five above it, written to the register's own precision (SPLAT_SPACING_K's
decimals); each is found here from a pure-Python series for J2 in exact
decimal arithmetic, never typed. `nearest` takes the zero nearest K * g (the
first of two equally near, in ascending order); `at or above` takes the
smallest zero at or above it. A K * g outside the table is an error.

PRINTED, NOT GATED:
  the per-season table; (a) each axis's line-load spectral peak against both
  1/p and 1 - 1/p (for a spacing under 2 the strongest line is the alias);
  (b) the null at each USED_SHARE and MIN_LOCAL_LOAD in a sweep, and the
  seasons whose null moves; (c) the share of non-sentinel shots within
  OFF_RIM_TENTHS on lines that are unused off-rim; (d) each declared null
  checked as a J2 zero; (e) off-rim deposited light at each season's null
  against today's, replayed at the author's surface.

  --raw Y[,Y..]    the same line counts from the raw season file
                   (<root>/data/shots/shotdetail_Y.tar.xz), printed beside the
                   shipped bin's, so that where the unused lines come from is
                   an output rather than a claim
  --root <repo>    the checkout whose data/shots/ the raw arm reads

Usage: python3 pipeline/checks/capture_grid.py [--raw 2004,2019 --root ...]
"""

import argparse
import json
import math
import re
import sys
from decimal import ROUND_HALF_EVEN, Decimal, getcontext
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import common  # noqa: E402
from common import (  # noqa: E402
    HALF_X_MAX,
    HALF_Y_MAX,
    HALF_Y_MIN,
    PROCESSED_DIR,
    REPO_ROOT,
    RESTRICTED_R,
    SEASON_START_YEARS,
    require_env,
    season_label,
)

# --- the estimator's constants ------------------------------------------------
OFF_RIM_TENTHS = 2 * RESTRICTED_R
NEIGHBOURHOOD = 21
MIN_LOCAL_LOAD = 50
USED_SHARE = 0.10
LATTICE_MIN_UNUSED = 16

# The sweep (b) walks these. The declared constants sit inside both ranges.
SWEEP_SHARES = (0.03, 0.05, 0.08, 0.10, 0.15, 0.20, 0.25, 0.30)
SWEEP_LOADS = (25, 50, 100, 200)

# How many zeros of J2 the table reaches: SPLAT_SPACING_K is the third, and a
# radius that followed the capture grid would take one of the five above it.
ZERO_ORDER_K = 3
ZERO_ORDER_TOP = 8

# The surface (e) replays the splat at: the author's laptop in CSS pixels at
# its own device ratio, through the full work's pixel budget.
AUTHOR_W, AUTHOR_H, AUTHOR_DEVICE_DPR = 1440, 810, 2
PIXEL_BUDGET = 4_000_000

SCALARS_TS = REPO_ROOT / "site" / "src" / "scalars.ts"

POINT_DTYPE = np.dtype([
    ("x", "<i2"), ("y", "<i2"),
    ("n_hires", "<u4"), ("n_rest", "<u4"),
    ("zone", "u1"), ("pad", "u1"),
])


# --- the register -------------------------------------------------------------
def register_value(src, name):
    m = re.search(rf"\b{name}: \{{\s*class: \"(\w+)\",\s*value: ([0-9.eE+-]+),", src)
    if not m:
        return None
    return m.group(1), m.group(2)


def register_decimals(text):
    return len(text.split(".")[1]) if "." in text else 0


# --- J2, in exact decimal arithmetic -----------------------------------------
getcontext().prec = 60


def dec_pi():
    """pi to the context's precision (the decimal module's own recipe)."""
    getcontext().prec += 2
    three = Decimal(3)
    lasts, t, s, n, na, d, da = 0, three, 3, 1, 0, 0, 24
    while s != lasts:
        lasts = s
        n, na = n + na, na + 8
        d, da = d + da, da + 32
        t = (t * n) / d
        s += t
    getcontext().prec -= 2
    return +s


PI = dec_pi()
TWO_PI = 2 * PI


def j2(x):
    """J2(x) = sum_m (-1)^m (x/2)^(2m+2) / (m! (m+2)!). At sixty digits the
    alternating terms cancel with tens of digits to spare for x under 30."""
    x = Decimal(x)
    half_sq = (x / 2) ** 2
    term = half_sq / 2  # m = 0: (x/2)^2 / (0! 2!)
    total = term
    m = 0
    eps = Decimal(10) ** -50
    while abs(term) > eps:
        m += 1
        term = -term * half_sq / (m * (m + 2))
        total += term
    return total


def j2_zeros(count):
    """The first `count` positive zeros of J2, each to well past 20 digits."""
    zeros = []
    step = Decimal("0.05")
    a = Decimal("0.5")
    fa = j2(a)
    while len(zeros) < count:
        b = a + step
        fb = j2(b)
        if fa == 0 or (fa < 0) != (fb < 0):
            lo, hi, flo = a, b, fa
            for _ in range(90):
                mid = (lo + hi) / 2
                fm = j2(mid)
                if (fm < 0) == (flo < 0):
                    lo, flo = mid, fm
                else:
                    hi = mid
            zeros.append((lo + hi) / 2)
        a, fa = b, fb
    return zeros


def lattice_response(k):
    """The splat's response at the tenth lattice's fundamental, as a share of
    its DC response: 8 J2(q) / q^2 at q = 2 pi k."""
    q = TWO_PI * Decimal(k)
    return float(8 * j2(q) / (q * q))


def null_table(src):
    """SPLAT_SPACING_K and the zeros above it, each the register's precision,
    each checked here as the J2 zero of its order."""
    k_entry = register_value(src, "SPLAT_SPACING_K")
    if k_entry is None:
        raise SystemExit("capture_grid: SPLAT_SPACING_K not found in scalars.ts")
    k_text = k_entry[1]
    places = register_decimals(k_text)
    quantum = Decimal(1).scaleb(-places)
    zeros = j2_zeros(ZERO_ORDER_TOP)
    rows = []
    for n, root in enumerate(zeros, start=1):
        if n < ZERO_ORDER_K:
            continue
        exact = root / TWO_PI
        declared = exact.quantize(quantum, rounding=ROUND_HALF_EVEN)
        rows.append((n, exact, declared))
    table = [float(Decimal(k_text))] + [float(d) for n, _, d in rows if n > ZERO_ORDER_K]
    return k_text, places, rows, table


def check_nulls(src, k_text, places, rows):
    """(d): each declared null, and any the register itself declares, against
    the zero of its order. Returns the failures."""
    fails = []
    print(f"\n(d) declared nulls checked as J2 zeros (pure-Python series, "
          f"{getcontext().prec} digits; declared to {places} decimals)")
    print("    n   j2,n / 2pi           declared   register   8*J2(2*pi*k)/(2*pi*k)^2")
    for n, exact, declared in rows:
        name = "SPLAT_SPACING_K" if n == ZERO_ORDER_K else f"SPLAT_NULL_{n}"
        entry = register_value(src, name)
        reg = entry[1] if entry else "-"
        resp = lattice_response(declared)
        print(f"    {n}   {exact:.12f}   {declared}     {reg:<9}  {resp:+.2e}")
        if entry is not None and Decimal(entry[1]) != declared:
            fails.append(f"{name} is {entry[1]} in the register; the zero is {declared}")
        if n == ZERO_ORDER_K and Decimal(k_text) != declared:
            fails.append(f"SPLAT_SPACING_K {k_text} is not j2,{n}/2pi to its precision")
        if entry is not None and n != ZERO_ORDER_K and entry[0] != "geometry":
            fails.append(f"{name} is class {entry[0]}, not geometry")
    exports = re.search(r"export const SPLAT_NULLS[^=]*=\s*\[([^\]]*)\]", src)
    if exports:
        names = [s.strip() for s in exports.group(1).split(",") if s.strip()]
        want = ["SPLAT_SPACING_K"] + [f"SCALARS.SPLAT_NULL_{n}.value"
                                      for n, _, _ in rows if n > ZERO_ORDER_K]
        print(f"    SPLAT_NULLS in the register: {', '.join(names)}")
        if names != want:
            fails.append(f"SPLAT_NULLS lists {names}, expected {want}")
    else:
        print("    the register declares SPLAT_SPACING_K only")
    return fails


# --- the estimator ------------------------------------------------------------
def load_points(year):
    return np.fromfile(PROCESSED_DIR / "points" / f"season_{year}.bin", dtype=POINT_DTYPE)


def line_loads(x, y, n):
    """Off-rim shots per tenth-line, x lines over the box's width and y lines
    over its depth. Integer counts."""
    x = np.asarray(x, dtype=np.int64)
    y = np.asarray(y, dtype=np.int64)
    n = np.asarray(n, dtype=np.int64)
    off = x * x + y * y > OFF_RIM_TENTHS * OFF_RIM_TENTHS
    lx = np.zeros(2 * HALF_X_MAX + 1, dtype=np.int64)
    ly = np.zeros(HALF_Y_MAX - HALF_Y_MIN + 1, dtype=np.int64)
    np.add.at(lx, x[off] + HALF_X_MAX, n[off])
    np.add.at(ly, y[off] - HALF_Y_MIN, n[off])
    return lx, ly


def references(loads):
    """Each line's reference (the median of its neighbourhood's fuller half)
    for every line whose whole neighbourhood lies in the box; the first index
    such a line can have is returned with them."""
    half = NEIGHBOURHOOD // 2
    windows = np.lib.stride_tricks.sliding_window_view(loads, NEIGHBOURHOOD)
    fuller = np.sort(windows, axis=1)[:, half:]
    ref = fuller[:, fuller.shape[1] // 2]
    return half, ref


def occupancy(loads, share=USED_SHARE, min_load=MIN_LOCAL_LOAD, refs=None):
    first, ref = refs if refs is not None else references(loads)
    own = loads[first:first + len(ref)]
    eligible = ref >= min_load
    used = eligible & (own >= share * ref)
    n_elig = int(eligible.sum())
    n_used = int(used.sum())
    if n_used == 0:
        raise SystemExit("capture_grid: an axis with no used line")
    spacing = 1.0 if n_elig - n_used < LATTICE_MIN_UNUSED else n_elig / n_used
    return {"lines_eligible": n_elig, "lines_used": n_used, "spacing_tenths": spacing}, \
        eligible, used, first


class OutsideTable(ValueError):
    """A K*g the null table does not reach. The renderer throws on one; the
    sweep reports it as its own outcome."""


def nearest(table, v):
    if not table[0] <= v <= table[-1]:
        raise OutsideTable(f"K*g = {v} lies outside the null table")
    best = table[0]
    for z in table[1:]:
        if abs(v - z) < abs(v - best):
            best = z
    return best


def at_or_above(table, v):
    if not table[0] <= v <= table[-1]:
        raise OutsideTable(f"K*g = {v} lies outside the null table")
    return next(z for z in table if z >= v)


def swept(rule, table, v):
    try:
        return rule(table, v)
    except OutsideTable:
        return "beyond"


def season_grid(lx, ly, share=USED_SHARE, min_load=MIN_LOCAL_LOAD, refs=None):
    gx, *_ = occupancy(lx, share, min_load, refs[0] if refs else None)
    gy, *_ = occupancy(ly, share, min_load, refs[1] if refs else None)
    return gx, gy


def kg_of(k, gx, gy):
    return k * math.sqrt(gx["spacing_tenths"] * gy["spacing_tenths"])


# --- (a) the spectral cross-check ---------------------------------------------
def spectral_peak(loads, eligible, first):
    """The strongest frequency in an axis's line loads, each eligible line read
    against its own reference so the court's density envelope drops out. In
    cycles per tenth, folded into (0, 0.5]."""
    _, ref = references(loads)
    own = loads[first:first + len(ref)].astype(float)
    series = np.where(eligible, own / np.maximum(ref, 1), np.nan)
    series = series[~np.isnan(series)]
    series = series - series.mean()
    pad = 1 << 14
    power = np.abs(np.fft.rfft(series, n=pad)) ** 2
    freq = np.fft.rfftfreq(pad)
    keep = freq >= 0.05
    return float(freq[keep][np.argmax(power[keep])])


# --- (e) deposited light ------------------------------------------------------
def author_surface():
    """The plate's tenth in device pixels on the author's surface, as
    plate.ts:makeView and display.ts:boundedDpr compute it."""
    court_w = 2 * HALF_X_MAX
    court_h = HALF_Y_MAX - HALF_Y_MIN
    scale = min(AUTHOR_W * 0.9 / court_w, AUTHOR_H * 0.9 / court_h)
    dpr = min(max(0.5, AUTHOR_DEVICE_DPR), 2, math.sqrt(PIXEL_BUDGET / (AUTHOR_W * AUTHOR_H)))
    origin_x = AUTHOR_W / 2
    origin_y = AUTHOR_H / 2 + ((HALF_Y_MAX + HALF_Y_MIN) / 2) * scale
    return scale, dpr, origin_x, origin_y


def deposited(fx, fy, ink, spacing, k, min_px, disc):
    radius = max(min_px, spacing * k)
    span = math.ceil(radius)
    inv = 1 / (radius * radius)
    overlap = max(1.0, math.pi * radius * radius * disc / (spacing * spacing))
    bx = np.floor(fx + 0.5)
    by = np.floor(fy + 0.5)
    ex0 = bx - fx
    ey0 = by - fy
    s = np.zeros_like(fx)
    for dy in range(-span, span + 1):
        ey2 = (ey0 + dy) ** 2
        for dx in range(-span, span + 1):
            w = 1 - ((ex0 + dx) ** 2 + ey2) * inv
            s += np.where(w > 0, w, 0.0)
    return float(np.sum(ink * s / overlap))


def light_ratio(pts, pin, z, k, consts):
    if z == k:
        return 1.0
    x = pts["x"].astype(np.int64)
    y = pts["y"].astype(np.int64)
    count = pts["n_hires"].astype(np.int64) + pts["n_rest"].astype(np.int64)
    total = int(count.sum())
    keep = (count > 0) & (x * x + y * y > RESTRICTED_R * RESTRICTED_R)
    if pin is not None:
        keep &= ~((x == pin[0]) & (y == pin[1]))
    scale, dpr, ox, oy = author_surface()
    fx = (ox + x[keep] * scale) * dpr
    fy = (oy - y[keep] * scale) * dpr
    ink = consts["TONE_CEILING"] * (1 - np.exp(-consts["TONE_K"] * count[keep] / total))
    spacing = scale * dpr
    args = (spacing, consts["SPLAT_MIN_PX"], consts["FALLOFF_DISC_INTEGRAL"])
    today = deposited(fx, fy, ink, args[0], k, args[1], args[2])
    cand = deposited(fx, fy, ink, args[0], z, args[1], args[2])
    return cand / today


# --- the raw arm ----------------------------------------------------------------
def raw_loads(year, root):
    # common.read_season_csv resolves the dump through common.SHOTS_DIR at call
    # time; pointing it at another checkout reuses its reader (and its bsdtar
    # fallback) rather than writing a second one.
    common.SHOTS_DIR = Path(root) / "data" / "shots"
    df = common.read_season_csv(year, usecols=["LOC_X", "LOC_Y"])
    rows = len(df)
    df = df.dropna()
    half = df[(df.LOC_Y >= HALF_Y_MIN) & (df.LOC_Y <= HALF_Y_MAX) & (df.LOC_X.abs() <= HALF_X_MAX)]
    x = half.LOC_X.to_numpy(np.int64)
    y = half.LOC_Y.to_numpy(np.int64)
    lx, ly = line_loads(x, y, np.ones(len(x), dtype=np.int64))
    return rows, len(half), lx, ly


def raw_arm(years, root):
    fails = []
    print(f"raw arm: {Path(root) / 'data' / 'shots'} against {PROCESSED_DIR / 'points'}")
    print(f"constants: off-rim > {OFF_RIM_TENTHS:g} tenths, neighbourhood {NEIGHBOURHOOD}, "
          f"min local load {MIN_LOCAL_LOAD}, used share {USED_SHARE}, "
          f"lattice min unused {LATTICE_MIN_UNUSED}")
    for year in years:
        rows, n_half, rx, ry = raw_loads(year, root)
        pts = load_points(year)
        count = pts["n_hires"].astype(np.int64) + pts["n_rest"].astype(np.int64)
        bx, by = line_loads(pts["x"], pts["y"], count)
        print(f"\n{season_label(year)}: raw file {rows} rows, {n_half} in the box; "
              f"bin {int(count.sum())} shots in {len(pts)} cells")
        for axis, raw, binned in (("x", rx, bx), ("y", ry, by)):
            gr, el_r, used_r, first = occupancy(raw)
            gb, el_b, used_b, _ = occupancy(binned)
            unused_r = el_r & ~used_r
            lines = np.arange(len(raw))[first:first + len(el_r)]
            empty = int((raw[first:first + len(el_r)][unused_r] == 0).sum())
            same = bool(np.array_equal(raw, binned))
            print(f"  {axis}: raw  eligible {gr['lines_eligible']:3d} used {gr['lines_used']:3d} "
                  f"unused {gr['lines_eligible'] - gr['lines_used']:3d} "
                  f"spacing {gr['spacing_tenths']:.4f}   "
                  f"bin  eligible {gb['lines_eligible']:3d} used {gb['lines_used']:3d} "
                  f"unused {gb['lines_eligible'] - gb['lines_used']:3d} "
                  f"spacing {gb['spacing_tenths']:.4f}")
            off = HALF_X_MAX if axis == "x" else -HALF_Y_MIN
            sample = [int(v) - off for v in lines[unused_r][:12]]
            print(f"     unused lines in the raw file holding no off-rim shot at all: {empty} of "
                  f"{int(unused_r.sum())}; per-line loads raw == bin: {'yes' if same else 'NO'}; "
                  f"first unused (tenths): {sample}")
            if not same or gr != gb:
                fails.append(f"{season_label(year)} {axis}: raw and shipped line counts differ")
    return fails


# --- the main run ---------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--raw", default=None)
    ap.add_argument("--root", default=str(REPO_ROOT))
    args = ap.parse_args()
    require_env()

    if args.raw:
        years = [int(y) for y in args.raw.split(",") if y.strip()]
        fails = raw_arm(years, args.root)
        if fails:
            print("\nFAIL: " + "; ".join(fails))
            sys.exit(1)
        return

    src = SCALARS_TS.read_text()
    k_text, places, rows, table = null_table(src)
    k = table[0]
    consts = {}
    for name in ("TONE_K", "TONE_CEILING", "SPLAT_MIN_PX", "FALLOFF_DISC_INTEGRAL"):
        entry = register_value(src, name)
        if entry is None:
            raise SystemExit(f"capture_grid: {name} not found in scalars.ts")
        consts[name] = float(entry[1])

    seasons = json.loads((PROCESSED_DIR / "seasons.json").read_text())["seasons"]
    pins = {}
    for s in seasons:
        sent = s["resolution"].get("rim_sentinel")
        pins[s["year"]] = tuple(sent["coord"]) if sent and sent.get("is_refusal") else None

    print("capture grid - the lines the record uses, off the rim, per season")
    print(f"constants: off-rim > {OFF_RIM_TENTHS:g} tenths, neighbourhood {NEIGHBOURHOOD} "
          f"(full only), min local load {MIN_LOCAL_LOAD}, used share {USED_SHARE}, "
          f"lattice min unused {LATTICE_MIN_UNUSED}")
    print(f"null table (K first): {', '.join(f'{z:g}' for z in table)}")
    print()
    print("season    x elig used unused spacing   y elig used unused spacing        g      "
          "K*g   nearest  at/above  line resp. at K*g")

    per = {}
    for year in SEASON_START_YEARS:
        pts = load_points(year)
        count = pts["n_hires"].astype(np.int64) + pts["n_rest"].astype(np.int64)
        lx, ly = line_loads(pts["x"], pts["y"], count)
        refs = (references(lx), references(ly))
        gx, gy = season_grid(lx, ly, refs=refs)
        g = math.sqrt(gx["spacing_tenths"] * gy["spacing_tenths"])
        kg = kg_of(k, gx, gy)
        try:
            near = nearest(table, kg)
            above = at_or_above(table, kg)
        except OutsideTable as e:
            raise SystemExit(f"capture_grid: {season_label(year)}: {e}") from None
        per[year] = dict(pts=pts, count=count, lx=lx, ly=ly, refs=refs, gx=gx, gy=gy,
                         kg=kg, near=near, above=above)
        print(f"{season_label(year)}   "
              f"{gx['lines_eligible']:4d} {gx['lines_used']:4d} "
              f"{gx['lines_eligible'] - gx['lines_used']:6d} {gx['spacing_tenths']:7.4f}   "
              f"{gy['lines_eligible']:4d} {gy['lines_used']:4d} "
              f"{gy['lines_eligible'] - gy['lines_used']:6d} {gy['spacing_tenths']:7.4f}   "
              f"{g:6.4f}  {kg:6.4f}   {near:6.4f}    {above:6.4f}   {lattice_response(kg):+.4f}")

    # The runs of seasons each rule leaves at today's K, for the identity
    # controls and for whoever reads the table.
    def runs(rule):
        years = [y for y in SEASON_START_YEARS if per[y][rule] == k]
        spans, start, prev = [], None, None
        for y in years:
            if start is None:
                start = prev = y
            elif y == prev + 1:
                prev = y
            else:
                spans.append((start, prev))
                start = prev = y
        if start is not None:
            spans.append((start, prev))
        return ", ".join(f"{season_label(a)}..{season_label(b)}" if a != b else season_label(a)
                         for a, b in spans) or "none"

    print(f"\nseasons left at today's K: nearest {runs('near')}; at or above {runs('above')}")
    steps = [(a, b) for a, b in zip(SEASON_START_YEARS, SEASON_START_YEARS[1:])
             if per[a]["near"] != per[b]["near"]]
    print("nearest-null steps between seasons: "
          + ", ".join(f"{season_label(a)}|{season_label(b)} "
                      f"({per[a]['near']:g} -> {per[b]['near']:g})" for a, b in steps))

    # (a)
    print("\n(a) line-load spectral peak (cycles per tenth, folded to 0.5) against 1/p and 1 - 1/p")
    print("season    x: peak     1/p   1-1/p    y: peak     1/p   1-1/p")
    for year in SEASON_START_YEARS:
        p = per[year]
        cells = []
        for loads, grid, ref in ((p["lx"], p["gx"], p["refs"][0]), (p["ly"], p["gy"], p["refs"][1])):
            _, eligible, _, first = occupancy(loads, refs=ref)
            peak = spectral_peak(loads, eligible, first)
            sp = grid["spacing_tenths"]
            cells.append(f"{peak:8.4f} {1 / sp:7.4f} {1 - 1 / sp:7.4f}")
        print(f"{season_label(year)}  {cells[0]}    {cells[1]}")

    # (b)
    print("\n(b) the sweep: the null each season takes at every used share and min local load")
    print(f"    shares {', '.join(f'{s:g}' for s in SWEEP_SHARES)}; "
          f"loads {', '.join(str(v) for v in SWEEP_LOADS)}; a setting is written share/load")
    for label, rule, key in (("nearest", nearest, "near"), ("at or above", at_or_above, "above")):
        moved = {}
        for year in SEASON_START_YEARS:
            p = per[year]
            for share in SWEEP_SHARES:
                for load in SWEEP_LOADS:
                    gx, gy = season_grid(p["lx"], p["ly"], share, load, refs=p["refs"])
                    z = swept(rule, table, kg_of(k, gx, gy))
                    if z != p[key]:
                        moved.setdefault(year, {}).setdefault(z, []).append(f"{share:g}/{load}")
        print(f"    {label}: {len(SEASON_START_YEARS) - len(moved)} of {len(SEASON_START_YEARS)} "
              "seasons hold one null across the whole sweep")
        for year, by_null in moved.items():
            print(f"      {season_label(year)} (declared {per[year][key]:g}): "
                  + "; ".join(f"{z if z == 'beyond' else format(z, 'g')} at {' '.join(c)}"
                              for z, c in by_null.items()))

    # (c)
    print(f"\n(c) non-sentinel shots within {OFF_RIM_TENTHS:g} tenths on lines unused off-rim")
    print("season     shots   on unused x   on unused y   on either   (unused share of the "
          "eligible lines inside that radius: x, y)")
    for year in SEASON_START_YEARS:
        p = per[year]
        pts, count = p["pts"], p["count"]
        x = pts["x"].astype(np.int64)
        y = pts["y"].astype(np.int64)
        near_rim = x * x + y * y <= OFF_RIM_TENTHS * OFF_RIM_TENTHS
        pin = pins.get(year)
        if pin is not None:
            near_rim &= ~((x == pin[0]) & (y == pin[1]))
        flags = []
        line_shares = []
        for axis, loads, ref, coord, off in (("x", p["lx"], p["refs"][0], x, HALF_X_MAX),
                                             ("y", p["ly"], p["refs"][1], y, -HALF_Y_MIN)):
            _, eligible, used, first = occupancy(loads, refs=ref)
            unused_line = np.zeros(len(loads), dtype=bool)
            unused_line[first:first + len(eligible)] = eligible & ~used
            elig_line = np.zeros(len(loads), dtype=bool)
            elig_line[first:first + len(eligible)] = eligible
            flags.append(unused_line[coord + off])
            lo, hi = -OFF_RIM_TENTHS + off, OFF_RIM_TENTHS + off
            inside = slice(max(0, int(lo)), int(hi) + 1)
            n_el = int(elig_line[inside].sum())
            line_shares.append(unused_line[inside].sum() / n_el if n_el else float("nan"))
        total = int(count[near_rim].sum())
        on_x = int(count[near_rim & flags[0]].sum())
        on_y = int(count[near_rim & flags[1]].sum())
        on_e = int(count[near_rim & (flags[0] | flags[1])].sum())
        print(f"{season_label(year)}  {total:8d}   {on_x / total:10.4f}   {on_y / total:10.4f}   "
              f"{on_e / total:9.4f}   ({line_shares[0]:.3f}, {line_shares[1]:.3f})")

    # (d)
    fails = check_nulls(src, k_text, places, rows)

    # (e)
    scale, dpr, _, _ = author_surface()
    print(f"\n(e) off-rim deposited light, each season's null against today's K, replayed at "
          f"{AUTHOR_W}x{AUTHOR_H} CSS, ratio {dpr:.4f}, one tenth = {scale * dpr:.4f} device px")
    print("season    nearest  light ratio   at/above  light ratio")
    for year in SEASON_START_YEARS:
        p = per[year]
        pin = pins.get(year)
        rn = light_ratio(p["pts"], pin, p["near"], k, consts)
        ra = light_ratio(p["pts"], pin, p["above"], k, consts)
        print(f"{season_label(year)}   {p['near']:6.4f}   {rn:10.6f}    {p['above']:6.4f}   {ra:10.6f}")

    if fails:
        print("\nFAIL: " + "; ".join(fails))
        sys.exit(1)


if __name__ == "__main__":
    main()
