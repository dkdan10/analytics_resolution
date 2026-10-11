#!/usr/bin/env python3
"""What THE FIELD's seven hues actually separate by, measured.

`site/src/palette.ts` used to claim, in its own header, that the seven "stay
separable for colour-blind viewers and survive a bright room". Nobody had
measured it and it is not true: under simulated deuteranopia two of the seven
sit about three CAM02-UCS units apart, which is a few just-noticeable
differences, on marks drawn small and semi-transparent over a near-black ground.

WHAT IS AUTHORED AND WHAT IS MEASURED, because the whole finding is about the
difference. The seven CATEGORIES are the NBA's - `SHOT_ZONE_BASIC` - and that is
what lets this piece use colour at all (rule 4). WHICH HUE STANDS FOR WHICH is
authored, and lives in `palette.ts` with the rest of the material register,
because an authored scalar's home is source (rule 3). What may never be authored
is the CLAIM about them, and that is this file: every distance below is a script
output and the gate refuses a palette whose source has drifted from it.

So the division is deliberate and it is the reverse of what it looks like:
the site DECLARES the hues, this stage READS them out of the site and measures
them, and `qa.py` binds the two together in both directions. Edit a hue without
re-running this stage and the gate goes red.

WHAT IT DOES NOT MODEL, said out loud so the number is not over-read. CAM02-UCS
is a distance between two large uniform patches under a reference viewing
condition. THE FIELD's marks are small, they are composited with `lighter` at
low opacity over `GROUND`, and they overlap. The `composite` block below is the
honest partial answer: the same table recomputed at the levels the tone curve
actually reaches, which shows the separation collapsing toward the ground rather
than holding at the declared hue.

    python3 pipeline/palette.py

Reads:  site/src/palette.ts, site/src/zone.ts (via pipeline/common.py's copy of
        the same geometry, which npm run gate holds to the site's)
Writes: data/processed/palette.json
"""

import datetime
import itertools
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import (  # noqa: E402
    HALF_X_MAX,
    HALF_Y_MAX,
    HALF_Y_MIN,
    PROCESSED_DIR,
    REPO_ROOT,
    ZONE_NAMES,
    die,
    require_env,
    write_json,
    zone_at,
)

require_env()

import numpy as np  # noqa: E402

# Required by THIS STAGE ONLY, and deliberately not added to common.REQUIRED:
# that dict is checked by require_env() at the top of every stage, so a global
# entry would make acquire.py and window.py fail for anyone who does not have a
# colour-appearance library they have no use for.
try:
    from colorspacious import cspace_convert
except ImportError:  # pragma: no cover - the message IS the handling
    die("pipeline/palette.py needs colorspacious (pinned in requirements.txt):\n"
        "  python3 -m pip install -r requirements.txt")

PALETTE_TS = REPO_ROOT / "site" / "src" / "palette.ts"
GROUND_HEX = "0b0a09"

# The simulations. Machado, Oliveira & Fernandes (2009) as colorspacious
# implements it; severity 100 is the dichromat end of each anomaly.
# Tritanomaly is included even though the earlier colour-vision check ran only
# the two common ones: it is one more line and a claim about "colour-blind
# viewers" that quietly
# means "two of the three kinds" is the sort of thing this project exists not
# to do.
CONDITIONS = {
    "normal": None,
    "protanomaly-100": {"name": "sRGB1+CVD", "cvd_type": "protanomaly", "severity": 100},
    "deuteranomaly-100": {"name": "sRGB1+CVD", "cvd_type": "deuteranomaly", "severity": 100},
    "tritanomaly-100": {"name": "sRGB1+CVD", "cvd_type": "tritanomaly", "severity": 100},
}

# THE FLOOR IS A REGRESSION GUARD AND NOT A CLAIM OF ADEQUACY. It sits below
# what this palette measures today so that a hue edited without measuring goes
# red; it does NOT say the palette is good enough, and the artifact carries
# `meets_target: false` beside it saying so. Same footing as qa.py's
# WINDOW_RECOVERY_FLOOR, which is 0.40 against a measured 0.4545.
SEPARATION_FLOOR = 3.0

# THE TARGET IS THE CLAIM THE PALETTE CANNOT YET MAKE. One CAM02-UCS unit is
# about one just-noticeable difference between two large adjacent patches under
# a reference viewing condition, so ten is an order of magnitude above threshold
# and leaves room for the three things the metric does not model - that these
# marks are small, semi-transparent, and laid over a near-black ground.
SEPARATION_TARGET = 10.0

# The levels the composite table is recomputed at. Not arbitrary: 0.92 is
# field.ts's TONE_CEILING, the brightest a cell may reach, and the rest walk
# down toward the ground because that is where most of the record sits - the
# tone curve is exponential and the long tail is faint.
COMPOSITE_LEVELS = [1.0, 0.92, 0.5, 0.25]


def read_site_palette():
    """The seven hues, out of the site's own source.

    Read rather than restated. The artifact is a claim ABOUT palette.ts, so
    taking the values from anywhere else would let the claim describe a palette
    the piece is not drawing - which is the exact failure mode qa.py's
    source-equality check exists for.
    """
    src = PALETTE_TS.read_text()
    m = re.search(r"export const ZONE_RGB:\s*string\[\]\s*=\s*\[(.*?)\];", src, re.S)
    if not m:
        die(f"could not find ZONE_RGB in {PALETTE_TS}")
    rgb = [tuple(int(v) for v in t) for t in re.findall(r'"\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*"',
                                                        m.group(1))]
    if len(rgb) != len(ZONE_NAMES):
        die(f"{PALETTE_TS}: {len(rgb)} hues for {len(ZONE_NAMES)} zones")
    for c in rgb:
        if not all(0 <= v <= 255 for v in c):
            die(f"{PALETTE_TS}: channel out of range in {c}")
    return rgb


def adjacent_zones():
    """Which of the league's seven regions actually touch on this floor.

    Measured from the partition itself rather than assumed, and it matters:
    LEFT CORNER 3 and RIGHT CORNER 3 are among the closest pairs in every
    condition, and they are separated by the whole width of the paint - a viewer
    is never asked to tell those two apart, because they are never in the same
    place. Shipping this stops anyone later from waving that argument at the
    numbers without evidence, AND stops them from rescuing a pair the argument
    does not cover: under deuteranopia the worst pair is RIGHT CORNER 3 against
    ABOVE THE BREAK 3, which share a boundary.

    One tenth of a foot is the record's own resolution, so the lattice is the
    finest one any shot could distinguish.
    """
    xs = np.arange(-HALF_X_MAX, HALF_X_MAX + 1, 1)
    ys = np.arange(HALF_Y_MIN, HALF_Y_MAX + 1, 1)
    # `zone_at` returns the region's INDEX into ZONE_NAMES, which is the same
    # order palette.ts declares its hues in - and qa.py gates that too.
    grid = np.empty((len(ys), len(xs)), dtype=np.int8)
    for j, y in enumerate(ys):
        for i, x in enumerate(xs):
            grid[j, i] = zone_at(float(x), float(y))
    pairs = set()
    for a, b in ((grid[:, :-1], grid[:, 1:]), (grid[:-1, :], grid[1:, :])):
        d = a != b
        for u, v in zip(a[d].tolist(), b[d].tolist()):
            pairs.add((min(u, v), max(u, v)))
    return sorted(pairs)


def separation(rgb01, condition):
    """Every pairwise CAM02-UCS distance, under one simulation."""
    start = CONDITIONS[condition] or "sRGB1"
    j = cspace_convert(np.asarray(rgb01), start, "CAM02-UCS")
    return {
        (a, b): float(np.linalg.norm(j[a] - j[b]))
        for a, b in itertools.combinations(range(len(ZONE_NAMES)), 2)
    }


def main():
    rgb = read_site_palette()
    rgb01 = np.array(rgb, dtype=float) / 255.0
    ground = np.array([int(GROUND_HEX[i:i + 2], 16) for i in (0, 2, 4)], float) / 255.0
    touching = set(adjacent_zones())

    out_sep, below_target = {}, []
    for cond in CONDITIONS:
        d = separation(rgb01, cond)
        pairs = [
            {
                "a": ZONE_NAMES[a],
                "b": ZONE_NAMES[b],
                "distance": round(v, 3),
                # Whether these two ever meet on the floor. See adjacent_zones.
                "adjacent": (a, b) in touching,
            }
            for (a, b), v in sorted(d.items(), key=lambda kv: kv[1])
        ]
        worst = pairs[0]
        worst_adj = next((p for p in pairs if p["adjacent"]), None)
        out_sep[cond] = {
            "min": worst["distance"],
            "min_pair": [worst["a"], worst["b"]],
            "min_adjacent": worst_adj["distance"] if worst_adj else None,
            "min_adjacent_pair": [worst_adj["a"], worst_adj["b"]] if worst_adj else None,
            "pairs": pairs,
        }
        below_target += [
            f"{cond}: {p['a']} / {p['b']} at {p['distance']}"
            for p in pairs if p["distance"] < SEPARATION_TARGET
        ]

    # The same question asked of what the piece actually draws. `lighter` over
    # GROUND is additive, so a cell at tone k lands at GROUND + k * hue.
    composite = {}
    for level in COMPOSITE_LEVELS:
        c = np.clip(ground + level * rgb01, 0, 1)
        composite[f"{level:g}"] = {
            cond: round(min(separation(c, cond).values()), 3) for cond in CONDITIONS
        }

    meets_floor = all(v["min"] >= SEPARATION_FLOOR for v in out_sep.values())
    # The floor is a claim about the DECLARED hue. Saying "floor met" without
    # saying where it stops being met would be exactly the gloss this artifact
    # exists to prevent, so the level at which the composite drops below it is
    # measured and shipped beside the flag.
    composite_below_floor = sorted(
        f"{level}: {cond} at {v}"
        for level, d in composite.items() for cond, v in d.items()
        if v < SEPARATION_FLOOR
    )
    doc = {
        "generated_by": "pipeline/palette.py",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "_why": (
            "THE FIELD's hues, and how far apart they actually are. The seven "
            "CATEGORIES are the NBA's (SHOT_ZONE_BASIC); which hue stands for which "
            "is authored and lives in site/src/palette.ts, where authored scalars "
            "belong. This file is the CLAIM about them, which may never be authored: "
            "palette.py reads the hues out of the site and measures them, and qa.py "
            "binds the two so an edited hue cannot ship unmeasured."
        ),
        "metric": {
            "space": "CAM02-UCS",
            "unit": "delta E prime; about one just-noticeable difference between two "
                    "large adjacent patches under a reference viewing condition",
            "library": "colorspacious 1.1.2",
            "cvd_model": "Machado, Oliveira & Fernandes (2009), via colorspacious's "
                         "sRGB1+CVD space",
            "severity": 100,
            "conditions": list(CONDITIONS),
            "not_modelled": (
                "mark size, opacity and the near-black ground. The metric compares two "
                "large uniform patches; THE FIELD composites small semi-transparent "
                "marks with `lighter` over GROUND. See `composite`."
            ),
        },
        "threshold": {
            "floor": SEPARATION_FLOOR,
            "floor_is": (
                "a regression guard, not a claim of adequacy: it sits below what this "
                "palette measures today so a hue edited without measuring goes red. "
                "Same footing as qa.py's WINDOW_RECOVERY_FLOOR."
            ),
            "target": SEPARATION_TARGET,
            "target_is": (
                "the separation a palette would need before anyone may claim seven-way "
                "categorical separation. An order of magnitude above one JND, leaving "
                "room for what the metric does not model."
            ),
        },
        "ground": f"#{GROUND_HEX}",
        "zones": list(ZONE_NAMES),
        "rgb": [list(c) for c in rgb],
        "adjacent_on_the_floor": [[ZONE_NAMES[a], ZONE_NAMES[b]] for a, b in sorted(touching)],
        "separation": out_sep,
        "composite": {
            "levels": COMPOSITE_LEVELS,
            "note": "GROUND + level * hue, which is what `lighter` compositing gives. "
                    "0.92 is field.ts:TONE_CEILING.",
            "min": composite,
            # Disclosure, NOT a gate: the floor is a claim about the declared
            # hue, and this says where the drawn mark stops meeting it.
            "below_floor": composite_below_floor,
        },
        "floor_applies_to": "the declared hue; see composite.below_floor for the drawn mark",
        "meets_floor": meets_floor,
        "meets_target": not below_target,
        "below_target": below_target,
    }
    write_json(PROCESSED_DIR / "palette.json", doc)

    print(f"  {len(rgb)} hues, {len(touching)} adjacent pairs on the floor")
    for cond, v in out_sep.items():
        flag = "" if v["min"] >= SEPARATION_TARGET else "  BELOW TARGET"
        print(f"  {cond:<20} min {v['min']:6.2f}  {v['min_pair'][0]} / {v['min_pair'][1]}"
              f"{flag}")
        if v["min_adjacent_pair"] != v["min_pair"]:
            print(f"  {'':<20} min over pairs that TOUCH {v['min_adjacent']:6.2f}  "
                  f"{v['min_adjacent_pair'][0]} / {v['min_adjacent_pair'][1]}")
    for line in composite_below_floor:
        print(f"  composite below the floor  {line}")
    print(f"\nQA: floor {SEPARATION_FLOOR:g} {'met' if meets_floor else 'NOT MET'} at the "
          f"declared hue ({len(composite_below_floor)} composite level-conditions below it); "
          f"target {SEPARATION_TARGET:g} {'met' if not below_target else 'NOT met'} "
          f"({len(below_target)} pair-conditions below it) "
          f"-> data/processed/palette.json")
    if not meets_floor:
        die("the palette is below its own floor")


if __name__ == "__main__":
    main()
