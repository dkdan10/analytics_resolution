#!/usr/bin/env python3
"""The choice palette.py leaves open: candidate palettes, measured.

WHAT THIS IS AND IS NOT. `palette.json` says, gated, that the shipped seven hues
do not reach the seven-way separation target; an earlier independent review of
the palette measured that the target is REACHABLE under the piece's own taste
constraints (`--search audit-base`, `AUDIT_BASE`, `AUDIT_SEED` and `audit_walk`
are named for that review). Choosing hues is taste, taste is the author's, and
this tool decides nothing: it is an instrument of choice, not of acceptance. It
is deliberately NOT wired into `qa.py` — same standing as `pipeline/checks/` —
and it writes nothing under `data/processed/`. The shipped truth stays
`palette.json`.

THE METRIC IS THE PIPELINE'S OWN, imported rather than restated: this file takes
`separation()`, `CONDITIONS`, `read_site_palette()`, `adjacent_zones()`,
`GROUND_HEX` and `SEPARATION_TARGET` from `pipeline/palette.py`, so every number
it emits is measured on the instrument the gate already trusts (colorspacious
CAM02-UCS; Machado/Oliveira/Fernandes CVD at severity 100; normal + protan +
deutan + tritan). A candidate measured under any other instrument would not be a
candidate. Constraints are expressed in CIECAM02 JCh (hue angle h, chroma C,
lightness J) — the review's own idiom for "the rust family", "gold", "grey".

THE REVIEW'S RESULT IS REPRODUCED BEFORE ANYTHING NEW IS GENERATED. The
review's own search script survives in its scratchpad and `--search audit-base`
is a verbatim port of it: same seed (19961997), same proposal distribution, same
accept-if-better walk, same constraint set, same temperature handling (the decay
is skipped when a proposal fails constraints — a quirk, kept, because
reproduction means the loop as it ran, not as it would be tidied). Run it and it
must print the review's base figure; the local working notes quote both sides.
The review's second figure (rust-held, 17.864) came from a constraint variant
whose exact windows did not survive; RUST_HELD below declares this file's own
windows as data, anchored on the shipped hues' measured JCh, and the two numbers
are quoted side by side as what they are — the same stated constraints, two
formalisations.

EVERY CANDIDATE IS MEASURED AT THE VALUES THAT WOULD SHIP. The search walks in
continuous sRGB, but `ZONE_RGB` holds 8-bit integers, so each candidate is
rounded first and every figure in the emitted table is measured on the rounded
values. The feasibility bar (maximin >= the pipeline's SEPARATION_TARGET in
every condition) is enforced after rounding.

DETERMINISM. Fixed seeds, no timestamps in the output, library versions recorded
in it. Two runs of `--emit` must produce byte-identical files; if they do not,
the environment changed (numpy/colorspacious version — recorded) and the output
says which versions produced it.

    python3 pipeline/palette_search.py --search audit-base   # the reproduction
    python3 pipeline/palette_search.py --emit                # the candidate set
    python3 pipeline/palette_search.py --apply NEAREST       # working tree only
    python3 pipeline/palette_search.py --apply shipped       # restore from git

`--apply` rewrites the seven quoted triples inside `site/src/palette.ts`'s
ZONE_RGB block IN THE WORKING TREE, for judgment captures and — if the author
picks a candidate — as the first, mechanical link of the application chain:
ZONE_RGB -> `python3 pipeline/palette.py` -> the seven `display` entries in
`site/scripts/numbers-allowlist.json` -> `npm run disclose` -> gates -> sweeps.
It never touches git; `git checkout -- site/src/palette.ts` is the undo. The
hue-family comments beside the triples are authored copy and are deliberately
NOT rewritten by --apply: after a real application they must be re-read against
the new hues by a person.

Reads:  site/src/palette.ts (the shipped hues, via palette.read_site_palette),
        OUT_DIR/candidates.json (--apply only)
Writes: OUT_DIR/candidates.json, candidates.md (--emit);
        site/src/palette.ts working tree (--apply only, never committed by it)
OUT_DIR (below) is a local, gitignored directory: the candidate table is an
instrument of choice and never ships.
"""

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np  # noqa: E402

# The pipeline's own instrument, imported rather than restated. palette.py
# checks its own environment and dies with the pinned-requirements message if
# colorspacious is absent; importing it is the point, not a convenience.
from palette import (  # noqa: E402
    CONDITIONS,
    GROUND_HEX,
    SEPARATION_TARGET,
    adjacent_zones,
    read_site_palette,
    separation,
)
from common import REPO_ROOT, ZONE_NAMES, die  # noqa: E402

from colorspacious import cspace_convert  # noqa: E402
import colorspacious  # noqa: E402

# A local, gitignored directory (see the module docstring).
OUT_DIR = REPO_ROOT / "docs" / "build" / "palette-search"
PALETTE_TS = REPO_ROOT / "site" / "src" / "palette.ts"

# The review's seed, verbatim (the first charted season twice over).
AUDIT_SEED = 19961997

# --- constraint sets, declared as data --------------------------------------
# Zones by index: 0 RA, 1 Paint, 2 Mid-Range, 3 LC3, 4 RC3, 5 AB3, 6 Backcourt.
# h is CIECAM02 hue angle in degrees, C chroma, J lightness — all via
# colorspacious "JCh". Shipped anchors, measured (run --anchors to reprint):
# RA h 74.5 C 43.0, Paint h 54.0 C 50.9, Mid-Range h 32.9 C 65.2,
# LC3 h 212.6, RC3 h 234.8, AB3 h 264.1, Backcourt C 3.3.

# The review's base set, verbatim from its surviving script: warm through the
# middle, cool along the arc, RA the brightest thing on the floor, Backcourt
# near-grey, everything clearly brighter than the ground. Load-bearing:
# warm-middle/cool-arc is what carries the migration reading.
AUDIT_BASE = {
    "hue_windows": {0: (20.0, 100.0), 1: (20.0, 100.0), 2: (20.0, 100.0),
                    3: (180.0, 300.0), 4: (180.0, 300.0), 5: (180.0, 300.0)},
    "chroma_min": {},
    "chroma_max": {6: 12.0},
    "ra_brightest": True,
    "j_min": 25.0,
}

# This file's rust-held set: the review's stated additions ("Mid-Range h
# 15-50, C >= 25, RA gold, paint orange"), formalised. The rust window and its
# chroma floor are the review's own words; gold and orange are declared as
# windows bracketing the shipped anchors (74.5 and 54.0), and the review's
# C >= 25 floor is applied to all three warm pins because a family pin without
# a chroma floor pins nothing — a grey has no meaningful hue angle.
RUST_HELD = {
    "hue_windows": {0: (60.0, 95.0), 1: (40.0, 70.0), 2: (15.0, 50.0),
                    3: (180.0, 300.0), 4: (180.0, 300.0), 5: (180.0, 300.0)},
    "chroma_min": {0: 25.0, 1: 25.0, 2: 25.0},
    "chroma_max": {6: 12.0},
    "ra_brightest": True,
    "j_min": 25.0,
}

CONSTRAINT_SETS = {"audit-base": AUDIT_BASE, "rust-held": RUST_HELD}

# The composite level the disclosure names: field.ts's tone curve is
# exponential and most of the record sits faint, so palette.json recomputes its
# minima down the ladder and the quarter-tone row is where the shipped palette
# collapses hardest. Same construction as palette.py's COMPOSITE_LEVELS entry.
QUARTER_TONE = 0.25


def jch(rgb01):
    return cspace_convert(np.asarray(rgb01), "sRGB1", "JCh")


def constraints_ok(rgb01, cset):
    c = jch(rgb01)
    J, C, h = c[:, 0], c[:, 1], (c[:, 2] % 360)
    for i, (lo, hi) in cset["hue_windows"].items():
        if not (lo <= h[i] <= hi):
            return False
    for i, lo in cset["chroma_min"].items():
        if C[i] < lo:
            return False
    for i, hi in cset["chroma_max"].items():
        if C[i] > hi:
            return False
    if cset["ra_brightest"] and J[0] < max(J[1:]) - 1e-9:
        return False
    if (J < cset["j_min"]).any():
        return False
    return True


def maximin(rgb01):
    """The objective: the worst pairwise separation across every condition,
    measured by the pipeline's own `separation`. Returns (value, (condition,
    zone_a, zone_b)) for the binding pair."""
    worst, what = 1e9, None
    for cond in CONDITIONS:
        d = separation(np.asarray(rgb01), cond)
        (a, b), v = min(d.items(), key=lambda kv: kv[1])
        if v < worst:
            worst, what = v, (cond, ZONE_NAMES[a], ZONE_NAMES[b])
    return worst, what


def per_condition_min(rgb01):
    return {cond: round(min(separation(np.asarray(rgb01), cond).values()), 3)
            for cond in CONDITIONS}


def dist_from_shipped(rgb01, shipped01):
    """Per-zone CAM02-UCS distance from the shipped hue, under normal vision
    (the distance is between declared hues, so the unsimulated space is the
    honest one), plus the total."""
    a = cspace_convert(np.asarray(rgb01), "sRGB1", "CAM02-UCS")
    b = cspace_convert(np.asarray(shipped01), "sRGB1", "CAM02-UCS")
    per = [float(np.linalg.norm(a[i] - b[i])) for i in range(len(ZONE_NAMES))]
    return per, float(sum(per))


def quarter_tone_min(rgb01):
    """palette.py's composite construction at the quarter-tone level: `lighter`
    over GROUND is additive, so a cell at tone k lands at GROUND + k * hue.
    Returns the per-condition minima and the overall minimum — the shipped
    palette's overall figure is palette.json's disclosed 1.42 row."""
    ground = np.array([int(GROUND_HEX[i:i + 2], 16) for i in (0, 2, 4)], float) / 255.0
    c = np.clip(ground + QUARTER_TONE * np.asarray(rgb01), 0, 1)
    per = {cond: round(min(separation(c, cond).values()), 3) for cond in CONDITIONS}
    return per, min(per.values())


def worst_adjacent(rgb01, touching):
    """The worst pair among those that share a boundary on the floor
    (palette.py:adjacent_zones — measured from the partition, not assumed),
    across every condition."""
    worst, what = 1e9, None
    for cond in CONDITIONS:
        d = separation(np.asarray(rgb01), cond)
        for (a, b), v in d.items():
            if (a, b) in touching and v < worst:
                worst, what = v, (cond, ZONE_NAMES[a], ZONE_NAMES[b])
    return round(worst, 3), what


# --- the walks ---------------------------------------------------------------
# Accept-if-better with a shrinking Gaussian proposal — the review's own walk,
# kept: it is not a true annealer (no uphill acceptance) and nobody here claims
# optimality; the bar is feasibility (maximin >= target after rounding) and
# reproducibility, and the review's basin figures are existence proofs.


def audit_walk(start01, cset, seed, iters=4000, t0=0.12, t_floor=0.02,
               decay=0.9995):
    """Verbatim port of the review's loop, generalised only in its constraint
    set. RNG consumption order and the constraint-skip of the temperature decay
    are preserved exactly — `--search audit-base` must reproduce the review's
    figure from the same seed, and does."""
    rng = np.random.default_rng(seed)
    best = np.asarray(start01).copy()
    best_score, _ = maximin(best)
    T = t0
    for _ in range(iters):
        cand = np.clip(best + rng.normal(0, T, best.shape), 0.02, 1.0)
        if not constraints_ok(cand, cset):
            continue
        s, _ = maximin(cand)
        if s > best_score:
            best_score, best = s, cand
        T = max(t_floor, T * decay)
    return best, best_score


def nearest_walk(start01, shipped01, cset, seed, iters=6000, t0=0.05,
                 t_floor=0.004, decay=0.9995):
    """Minimise total CAM02-UCS distance from the shipped seven, subject to the
    rounded candidate clearing the target in every condition. Starts from a
    feasible point and walks home."""
    rng = np.random.default_rng(seed)

    def feasible(x01):
        r = np.round(np.asarray(x01) * 255) / 255.0
        return constraints_ok(x01, cset) and maximin(r)[0] >= SEPARATION_TARGET

    if not feasible(start01):
        die("nearest_walk needs a feasible start")
    best = np.asarray(start01).copy()
    best_cost = dist_from_shipped(best, shipped01)[1]
    T = t0
    for _ in range(iters):
        cand = np.clip(best + rng.normal(0, T, best.shape), 0.02, 1.0)
        T = max(t_floor, T * decay)
        if not feasible(cand):
            continue
        cost = dist_from_shipped(cand, shipped01)[1]
        if cost < best_cost:
            best_cost, best = cost, cand
    return best, best_cost


def capped_walk(start01, shipped01, cset, cap, seed, iters=6000, t0=0.06,
                t_floor=0.005, decay=0.9995):
    """Maximise maximin subject to total distance-from-shipped <= cap: the
    BALANCED points. The cap is derived by the tool (see emit), not chosen by
    hand."""
    rng = np.random.default_rng(seed)

    def ok(x01):
        return (constraints_ok(x01, cset)
                and dist_from_shipped(x01, shipped01)[1] <= cap)

    if not ok(start01):
        die(f"capped_walk needs a start inside its cap ({cap})")
    best = np.asarray(start01).copy()
    best_score, _ = maximin(np.round(best * 255) / 255.0)
    T = t0
    for _ in range(iters):
        cand = np.clip(best + rng.normal(0, T, best.shape), 0.02, 1.0)
        T = max(t_floor, T * decay)
        if not ok(cand):
            continue
        s, _ = maximin(np.round(cand * 255) / 255.0)
        if s > best_score:
            best_score, best = s, cand
    return best, best_score


# --- assembly ----------------------------------------------------------------


def measure_candidate(name, rgb255, shipped01, touching, note):
    rgb01 = np.asarray(rgb255, dtype=float) / 255.0
    mm, binding = maximin(rgb01)
    per_cond = per_condition_min(rgb01)
    qt_per, qt_min = quarter_tone_min(rgb01)
    per_zone, total = dist_from_shipped(rgb01, shipped01)
    wa, wa_what = worst_adjacent(rgb01, touching)
    c = jch(rgb01)
    return {
        "name": name,
        "note": note,
        "rgb": [[int(v) for v in row] for row in rgb255],
        "maximin": round(mm, 3),
        "binding": {"condition": binding[0], "pair": [binding[1], binding[2]]},
        "clears_target_every_condition": bool(mm >= SEPARATION_TARGET),
        "per_condition_min": per_cond,
        "quarter_tone_min": qt_min,
        "quarter_tone_per_condition": qt_per,
        "distance_from_shipped": {
            "per_zone": [round(v, 2) for v in per_zone],
            "total": round(total, 2),
        },
        "worst_adjacent_on_floor": {
            "distance": wa,
            "condition": wa_what[0],
            "pair": [wa_what[1], wa_what[2]],
        },
        "jch": [[round(float(v), 1) for v in (row[0], row[1], row[2] % 360)]
                for row in c],
    }


def emit():
    shipped255 = read_site_palette()
    shipped01 = np.asarray(shipped255, dtype=float) / 255.0
    touching = set(adjacent_zones())

    print("reproduction first (the review's base run, verbatim port):")
    base01, base_score = audit_walk(shipped01, AUDIT_BASE, AUDIT_SEED)
    print(f"  audit-base maximin {base_score:.3f} (float, the review's own figure)")

    print("rust-held (this file's declared windows):")
    rust01, rust_score = audit_walk(shipped01, RUST_HELD, AUDIT_SEED)
    print(f"  rust-held maximin {rust_score:.3f} (float)")

    # NEAREST starts from the base basin (feasible) and walks toward shipped.
    near01, near_cost = nearest_walk(base01, shipped01, AUDIT_BASE, AUDIT_SEED + 1)
    print(f"  nearest total distance {near_cost:.2f} (float)")

    # The BALANCED caps are derived, not chosen: the total-distance axis runs
    # from NEAREST's total to RUST-HELD's, and the caps sit at its thirds.
    near_total = dist_from_shipped(near01, shipped01)[1]
    rust_total = dist_from_shipped(rust01, shipped01)[1]
    lo = min(near_total, rust_total)
    hi = max(near_total, rust_total)
    caps = [lo + (hi - lo) / 3.0, lo + 2.0 * (hi - lo) / 3.0]
    bal = []
    for k, cap in enumerate(caps):
        b01, b_score = capped_walk(near01, shipped01, AUDIT_BASE, cap,
                                   AUDIT_SEED + 2 + k)
        bal.append(b01)
        print(f"  balanced-{k + 1} maximin {b_score:.3f} under cap {cap:.2f} (float)")

    rows = [
        measure_candidate("SHIPPED", shipped255, shipped01, touching,
                          "the palette at HEAD; keeping it is a listed option"),
        measure_candidate("NEAREST",
                          np.round(np.asarray(near01) * 255).astype(int).tolist(),
                          shipped01, touching,
                          "minimum total CAM02-UCS distance from shipped, "
                          "subject to clearing the target in every condition"),
        measure_candidate("BALANCED-1",
                          np.round(np.asarray(bal[0]) * 255).astype(int).tolist(),
                          shipped01, touching,
                          "maximin under the lower derived distance cap"),
        measure_candidate("BALANCED-2",
                          np.round(np.asarray(bal[1]) * 255).astype(int).tolist(),
                          shipped01, touching,
                          "maximin under the upper derived distance cap"),
        measure_candidate("RUST-HELD",
                          np.round(np.asarray(rust01) * 255).astype(int).tolist(),
                          shipped01, touching,
                          "maximum maximin under this file's rust-held "
                          "windows; the far point, more saturated than shipped"),
    ]

    for r in rows[1:]:
        if not r["clears_target_every_condition"]:
            die(f"candidate {r['name']} does not clear the target after "
                f"rounding: maximin {r['maximin']}")

    doc = {
        "generated_by": "pipeline/palette_search.py --emit",
        "_why": (
            "The palette's open question: candidate palettes for the "
            "author's eye, every figure measured by pipeline/palette.py's own instrument on the "
            "rounded integer values that would ship. This file decides "
            "nothing; the shipped truth is data/processed/palette.json and "
            "keeping the shipped palette is a listed option."
        ),
        "determinism": {
            "seed": AUDIT_SEED,
            "derived_seeds": {"nearest": AUDIT_SEED + 1,
                              "balanced-1": AUDIT_SEED + 2,
                              "balanced-2": AUDIT_SEED + 3},
            "numpy": np.__version__,
            "colorspacious": colorspacious.__version__,
            "note": "no timestamps by design: two runs must be byte-identical "
                    "under the versions above",
        },
        "metric": {
            "space": "CAM02-UCS",
            "severity": 100,
            "conditions": list(CONDITIONS),
            "target": SEPARATION_TARGET,
            "source": "pipeline/palette.py (imported, not restated)",
        },
        "reproduction": {
            "audit_base_maximin_float": round(base_score, 3),
            "audit_stated_base": "the independent palette review's stated base "
                                 "constraints (local working notes)",
            "note": "the review's own scratchpad script, ported verbatim (seed "
                    "19961997); the review's rust-held figure used constraint "
                    "windows that did not survive its scratchpad — this file's "
                    "RUST_HELD declares its own, and the local working notes "
                    "quote both.",
        },
        "constraint_sets": {
            name: {
                "hue_windows_deg": {ZONE_NAMES[i]: list(w)
                                    for i, w in cs["hue_windows"].items()},
                "chroma_min": {ZONE_NAMES[i]: v
                               for i, v in cs["chroma_min"].items()},
                "chroma_max": {ZONE_NAMES[i]: v
                               for i, v in cs["chroma_max"].items()},
                "ra_brightest": cs["ra_brightest"],
                "j_min": cs["j_min"],
            } for name, cs in CONSTRAINT_SETS.items()
        },
        "zones": list(ZONE_NAMES),
        "candidates": rows,
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_json = OUT_DIR / "candidates.json"
    out_json.write_text(json.dumps(doc, indent=2) + "\n")

    md = ["# Candidate palettes, measured (emitted by pipeline/palette_search.py --emit)",
          "",
          "Every figure below is measured by `pipeline/palette.py`'s own instrument "
          "(CAM02-UCS, CVD severity 100, four conditions) on the rounded integer "
          "values that would ship. The target every candidate must clear in every "
          f"condition is {SEPARATION_TARGET:g} (`palette.py:SEPARATION_TARGET`). "
          "SHIPPED is the palette at HEAD and keeping it is a listed option.",
          ""]
    conds = list(CONDITIONS)
    head = (["candidate", "maximin"] + [c.replace("anomaly-100", "") for c in conds]
            + ["quarter-tone min", "dist total", "worst adjacent pair"])
    md.append("| " + " | ".join(head) + " |")
    md.append("|" + "---|" * len(head))
    for r in rows:
        wa = r["worst_adjacent_on_floor"]
        md.append("| " + " | ".join([
            r["name"], f"{r['maximin']}",
            *[f"{r['per_condition_min'][c]}" for c in conds],
            f"{r['quarter_tone_min']}",
            f"{r['distance_from_shipped']['total']}",
            f"{wa['pair'][0]} / {wa['pair'][1]} at {wa['distance']} ({wa['condition']})",
        ]) + " |")
    md += ["", "## The seven hues, per candidate", ""]
    for r in rows:
        md.append(f"### {r['name']}")
        md.append("")
        md.append(f"*{r['note']}.*")
        md.append("")
        md.append("| zone | rgb | J | C | h | dist from shipped |")
        md.append("|---|---|---|---|---|---|")
        for i, z in enumerate(ZONE_NAMES):
            rr = r["rgb"][i]
            J, C, h = r["jch"][i]
            md.append(f"| {z} | `{rr[0]}, {rr[1]}, {rr[2]}` | {J} | {C} | {h} "
                      f"| {r['distance_from_shipped']['per_zone'][i]} |")
        md.append("")
        md.append(f"Binding pair: {r['binding']['pair'][0]} / "
                  f"{r['binding']['pair'][1]} ({r['binding']['condition']}); "
                  f"quarter-tone per condition: "
                  + ", ".join(f"{c.replace('anomaly-100', '')} "
                              f"{r['quarter_tone_per_condition'][c]}"
                              for c in conds) + ".")
        md.append("")
    (OUT_DIR / "candidates.md").write_text("\n".join(md))

    print(f"\n{len(rows)} rows (SHIPPED + {len(rows) - 1} candidates) -> "
          f"{out_json.relative_to(REPO_ROOT)} and candidates.md")
    for r in rows:
        print(f"  {r['name']:<11} maximin {r['maximin']:7.3f}  "
              f"quarter-tone {r['quarter_tone_min']:6.3f}  "
              f"dist {r['distance_from_shipped']['total']:7.2f}  "
              f"{'clears' if r['clears_target_every_condition'] else 'BELOW'} "
              f"target {SEPARATION_TARGET:g}")


def apply_candidate(name):
    src = PALETTE_TS.read_text()
    if name == "shipped":
        die("--apply shipped: restore with `git checkout -- site/src/palette.ts` "
            "— git is the source of the shipped values, not this tool")
    cand_file = OUT_DIR / "candidates.json"
    if not cand_file.exists():
        die(f"{cand_file} not found; run --emit first")
    doc = json.loads(cand_file.read_text())
    row = next((r for r in doc["candidates"] if r["name"] == name), None)
    if row is None:
        die(f"no candidate named {name!r}; have "
            + ", ".join(r["name"] for r in doc["candidates"]))
    m = re.search(r"export const ZONE_RGB:\s*string\[\]\s*=\s*\[(.*?)\];", src, re.S)
    if not m:
        die(f"could not find ZONE_RGB in {PALETTE_TS}")
    block = m.group(1)
    triples = list(re.finditer(r'"\s*\d+\s*,\s*\d+\s*,\s*\d+\s*"', block))
    if len(triples) != len(ZONE_NAMES):
        die(f"{len(triples)} triples in ZONE_RGB for {len(ZONE_NAMES)} zones")
    out, last = [], 0
    for t, rgb in zip(triples, row["rgb"]):
        out.append(block[last:t.start()])
        out.append(f'"{rgb[0]}, {rgb[1]}, {rgb[2]}"')
        last = t.end()
    out.append(block[last:])
    new_src = src[:m.start(1)] + "".join(out) + src[m.end(1):]
    PALETTE_TS.write_text(new_src)
    print(f"applied {name} to the WORKING TREE at {PALETTE_TS.relative_to(REPO_ROOT)}")
    print("  (undo: git checkout -- site/src/palette.ts; the gate stays red "
          "until pipeline/palette.py and the allowlist follow — see the "
          "application chain in this file's docstring)")


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--search", choices=sorted(CONSTRAINT_SETS),
                   help="run one constrained walk and print its result")
    g.add_argument("--emit", action="store_true",
                   help="run everything and write the candidate table")
    g.add_argument("--apply", metavar="NAME",
                   help="write a candidate's hues into site/src/palette.ts "
                        "(working tree only)")
    g.add_argument("--anchors", action="store_true",
                   help="print the shipped hues' JCh coordinates")
    args = ap.parse_args()

    if args.anchors:
        shipped01 = np.asarray(read_site_palette(), dtype=float) / 255.0
        c = jch(shipped01)
        for z, row in zip(ZONE_NAMES, c):
            print(f"  {z:22s} J={row[0]:5.1f} C={row[1]:5.1f} h={row[2] % 360:5.1f}")
        return
    if args.apply:
        apply_candidate(args.apply)
        return
    if args.search:
        shipped01 = np.asarray(read_site_palette(), dtype=float) / 255.0
        base, what = maximin(shipped01)
        print(f"shipped: maximin {base:.3f} at {what}")
        best01, score = audit_walk(shipped01, CONSTRAINT_SETS[args.search],
                                   AUDIT_SEED)
        _, binding = maximin(best01)
        print(f"{args.search}: maximin {score:.3f} (float), binding {binding}")
        for z, row in zip(ZONE_NAMES,
                          np.round(np.asarray(best01) * 255).astype(int)):
            print(f'  "{row[0]}, {row[1]}, {row[2]}", // {z}')
        return
    emit()


if __name__ == "__main__":
    main()
