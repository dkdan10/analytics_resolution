#!/usr/bin/env python3
"""Stage 5 - the facts the dumps cannot supply, and the display facts derived.

Every number the piece puts on screen has to resolve to a key in
data/processed/ (CLAUDE.md honesty rule). Most of them already did. A residue
did not, and it was authored in the renderers instead:

  1946                the league's founding, which no shot dump reaches back to
  22-FT               the three-point line of 1994-97
  ELEVEN WEEKS        wrong: the corpus spans 89 inclusive days, 12.7 weeks
  514-second loop     wrong: the schedule totals 500 s
  "1"                 the positions the record keeps per shot
  Games of 1,230      a full season's schedule
  SIX TAXONOMIES      how many ways a shot is filed
  FOUR CATEGORIES     how many boxes the caliper is cut into
  twelve names        what the league publishes instead of the geometry

Two kinds, kept apart because they are different claims:

  external  history no dump records. Each carries a `value`, the `statement`
            the piece is entitled to make from it, a `source` specific enough
            to check, and a `note` wherever the fact has a subtlety the piece
            is glossing. These cannot be derived and must therefore be cited.

  derived   a display fact computed from another artifact, or from the site's
            own schedule constants. Each carries a `value` and a `from` naming
            what it was computed out of. These must never be typed anywhere.

The schedule is the interesting one. `site/src/timeline.ts` is the only place
the piece's durations are declared, so this stage READS those four constants out
of the TypeScript and multiplies them against the season count in seasons.json.
That gives the loop exactly one source of truth, which is what lets qa.py gate
the prose in CLAUDE.md and README.md against the code rather than against a
number somebody remembered.

Usage: python3 pipeline/facts.py
"""

import datetime
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    PROCESSED_DIR,
    PROVENANCE,
    REPO_ROOT,
    die,
    require_env,
    write_json,
)

require_env()

TIMELINE_TS = REPO_ROOT / "site" / "src" / "timeline.ts"

# The four durations and the one year the schedule is built from. Declared in
# the TypeScript because that is where they are USED; read here so the piece's
# runtime has a single source and every prose statement of it can be gated.
SCHEDULE_CONSTANTS = ("ACT0_SECONDS", "CODA_SECONDS", "SEASON_SECONDS",
                      "WINDOW_SECONDS", "WINDOW_YEAR")

# Two of the five are `export const` and three are bare `const`, so anchoring on
# `^const` - which is what qa.py's decoder-parity check does - silently misses
# half of them and the loop comes out wrong rather than absent.
CONST_RE = r"^(?:export )?const {name} = (\d+);"


def read_schedule():
    """The schedule constants, out of the source that owns them."""
    if not TIMELINE_TS.exists():
        die(f"{TIMELINE_TS} missing - the schedule has no source to read")
    src = TIMELINE_TS.read_text()
    out = {}
    for name in SCHEDULE_CONSTANTS:
        m = re.search(CONST_RE.format(name=name), src, re.M)
        if not m:
            die(f"{TIMELINE_TS.name} does not declare `const {name} = <int>;` - "
                f"the loop length cannot be derived, and guessing it is the defect "
                f"this stage exists to remove")
        out[name] = int(m.group(1))
    return out


def loop_seconds(sched, years):
    """Act 0, thirty seasons of which one is the window, and the coda."""
    total = sched["ACT0_SECONDS"] + sched["CODA_SECONDS"]
    for y in years:
        total += sched["WINDOW_SECONDS"] if y == sched["WINDOW_YEAR"] else sched["SEASON_SECONDS"]
    return total


def clock(seconds):
    return f"{seconds // 60}:{seconds % 60:02d}"


def span_days(first, last):
    """Inclusive days between two ISO dates - 27 Oct to 23 Jan is 89, not 88."""
    a = datetime.date.fromisoformat(first)
    b = datetime.date.fromisoformat(last)
    return (b - a).days + 1


def ext(value, statement, source, note=None):
    e = {"value": value, "statement": statement, "source": source}
    if note:
        e["note"] = note
    return e


def der(value, frm):
    return {"value": value, "from": frm}


# What the league publishes INSTEAD of the geometry it stopped releasing.
#
# These twelve were hard-coded in site/src/modes/ledger.ts, which is display copy
# authoring its own content. They are names, not numbers, but they carry a
# citation - the slug beneath them says the league publishes these - so they
# belong in a sourced artifact like any other external fact. Each is cited to the
# endpoint it comes from in docs/build-plan-v2.md section 1.4.
#
# Nine are PtMeasureType values of LeagueDashPtStats; the other three come from
# their own endpoints. TOUCHES is the one that is a measure WITHIN a type rather
# than a type, and it says so, because the piece draws a recomputed value for it.
PUBLISHED_INSTEAD = [
    ("SPEED & DISTANCE", "LeagueDashPtStats, PtMeasureType=SpeedDistance"),
    ("DRIVES", "LeagueDashPtStats, PtMeasureType=Drives"),
    ("TOUCHES", "LeagueDashPtStats, PtMeasureType=Possessions (touches per game); "
                "a measure within that type, not a type of its own"),
    ("PASSING", "LeagueDashPtStats, PtMeasureType=Passing"),
    ("POSSESSIONS", "LeagueDashPtStats, PtMeasureType=Possessions"),
    ("CATCH & SHOOT", "LeagueDashPtStats, PtMeasureType=CatchShoot"),
    ("PULL-UP SHOOTING", "LeagueDashPtStats, PtMeasureType=PullUpShot"),
    ("CLOSEST DEFENDER", "PlayerDashPtShots - closest-defender shot dashboards"),
    ("REBOUNDING", "LeagueDashPtStats, PtMeasureType=Rebounding"),
    ("PLAY TYPES", "SynergyPlayTypes - play-type frequencies from 2015-16"),
    ("HUSTLE", "HustleStats - begins with the 2016 playoffs, so it is NOT available "
               "for the corpus window and stays bare in every act"),
    ("EFFICIENCY", "LeagueDashPtStats, PtMeasureType=Efficiency"),
]


def build():
    def load(name):
        p = PROCESSED_DIR / name
        if not p.exists():
            die(f"{p} missing - run the stage that writes it first")
        return json.loads(p.read_text())

    seasons_file = load("seasons.json")
    seasons = seasons_file["seasons"]
    if not seasons:
        die("seasons.json holds no seasons")
    window = load("window.json")
    load("paint.json")          # required to exist; nothing here reads from it yet
    load("sportvu_probe.json")  # ditto - the corpus listing is read by the site

    years = [s["year"] for s in seasons]
    sched = read_schedule()
    secs = loop_seconds(sched, years)

    corpus = window["corpus"]
    first, last = corpus["date_first"], corpus["date_last"]
    if not (first and last):
        die("window.json:corpus has no date span - the window's duration cannot be derived")
    days = span_days(first, last)

    # Constant across the thirty, and asserted rather than assumed: if a season
    # ever files a shot under a seventh taxonomy, THE CENSUS's header is wrong
    # and should say so rather than keep printing SIX.
    tax = {len(s["vocabulary"]["taxonomies"]) for s in seasons}
    if len(tax) != 1:
        die(f"seasons file a shot under differing numbers of taxonomies: {sorted(tax)}")
    widths = {s["schema"]["fields_per_shot"] for s in seasons}
    positions = {s["schema"]["positions_per_shot"] for s in seasons}
    if len(widths) != 1 or len(positions) != 1:
        die(f"the per-shot schema is not constant: {sorted(widths)} fields, "
            f"{sorted(positions)} positions")

    contemp = next((s["contemporaneous"] for s in seasons if s.get("contemporaneous")), None)
    if not contemp or "line_ft" not in contemp:
        die("no season carries contemporaneous.line_ft - re-run pipeline/aggregate.py")

    external = {
        "league_founded": ext(
            1946,
            "the league's founding year; Act 0's slug closes on the first season the "
            "shot record holds, which is read from seasons.json",
            "external history; the Basketball Association of America was founded in "
            "June 1946 and the corpus begins fifty seasons later",
            note=("the body founded in 1946 was the BAA. It absorbed the National "
                  "Basketball League and took the name NBA in 1949, so 1946 is the "
                  "league's own founding date and not, strictly, the NBA's. The piece "
                  "prints the year alone and makes no claim about the name."),
        ),
        "endpoint_known_dead_by": ext(
            "2016-02-10",
            "the date by which the public moment endpoint was already dead - NOT the "
            "date it closed, which is not established",
            "docs/build-plan-v2.md section 1.4-1.5, citing the earliest dated artifact: "
            "github.com/bttmly/nba-movement issue #1, 10 February 2016, "
            "\"especially locations_getmoments, are no longer active\"",
            note=("the shutdown date itself is unknown. The corpus's last archive is "
                  f"{last} and the endpoint was dead by this date; everything between "
                  "the two is dark. The widely repeated \"mid-January\" cutoff has no "
                  "primary source. The piece therefore shows both dates and explains "
                  "neither, because that is the state of the evidence."),
        ),
        "three_point_line_1994_97_ft": ext(
            contemp["line_ft"],
            "the radius of the three-point line in force through 1996-97, which "
            "SHOT_ZONE_BASIC's modern polygons are applied over retroactively",
            "external history, declared in pipeline/aggregate.py:SHORTENED_LINE_FT and "
            "emitted per season into seasons.json:contemporaneous.line_ft, which is "
            "where this value was read from",
            note=("the line stood at 22 ft everywhere from 1994-95 through 1996-97. Only "
                  "1996-97 is in this dataset. The piece draws the arc and prints the "
                  "figure from this one key so the two cannot disagree."),
        ),
        "published_instead": ext(
            [{"name": n, "source": s} for n, s in PUBLISHED_INSTEAD],
            "the tracking measures the league publishes in place of the optical "
            "geometry it stopped releasing; THE LEDGER draws these names, with "
            "recomputed values inside the window and bare outside it",
            "docs/build-plan-v2.md section 1.4-1.5 (LeagueDashPtStats PtMeasureType "
            "values, PlayerDashPtShots, SynergyPlayTypes, HustleStats)",
            note=("the league publishes VALUES for all of these; what it stopped "
                  "publishing is the geometry they are made from. The list is the "
                  "twelve the piece draws, not an exhaustive one: LeagueDashPtStats "
                  "also carries PtMeasureType=Defense, which is not shown - a "
                  "compositional limit of two arcs on one halfcourt, not a claim."),
        ),
    }

    derived = {
        "window.days_inclusive": der(
            days, f"window.json:corpus.date_first..date_last ({first}..{last}), inclusive"),
        "window.days_elapsed": der(
            days - 1, f"window.json:corpus.date_first..date_last ({first}..{last})"),
        "window.weeks": der(
            round(days / 7, 2), "window.json:corpus date span / 7"),
        "loop.seconds": der(
            secs,
            f"site/src/timeline.ts: ACT0_SECONDS {sched['ACT0_SECONDS']} + "
            f"{len(years) - 1} x SEASON_SECONDS {sched['SEASON_SECONDS']} + "
            f"WINDOW_SECONDS {sched['WINDOW_SECONDS']} + CODA_SECONDS "
            f"{sched['CODA_SECONDS']}, over seasons.json's {len(years)} seasons"),
        "loop.clock": der(clock(secs), "facts.json:derived.loop.seconds, as m:ss"),
        "loop.window_share": der(
            round(sched["WINDOW_SECONDS"] / secs, 4),
            "site/src/timeline.ts:WINDOW_SECONDS / facts.json:derived.loop.seconds"),
        "season.games_full": der(
            corpus["season_games"], "window.json:corpus.season_games"),
        "season.count": der(len(years), "seasons.json:seasons, counted"),
        "season.first_year": der(years[0], "seasons.json:seasons[0].year"),
        "schema.fields_per_shot": der(
            sorted(widths)[0],
            "seasons.json:seasons[].schema.fields_per_shot, asserted constant across "
            f"all {len(years)} seasons"),
        "schema.positions_per_shot": der(
            sorted(positions)[0],
            "seasons.json:seasons[].schema.positions_per_shot, asserted constant across "
            f"all {len(years)} seasons"),
        "taxonomies.count": der(
            sorted(tax)[0],
            "seasons.json:seasons[].vocabulary.taxonomies, counted and asserted "
            f"constant across all {len(years)} seasons"),
        "contest.categories": der(
            len(window["contest"]["buckets"]), "window.json:contest.buckets, counted"),
    }

    return {
        "generated_by": "pipeline/facts.py",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "provenance": PROVENANCE,
        "definitions": {
            "external": (
                "history no dump records. Every entry carries a source specific enough "
                "to check. Nothing here is a measurement and nothing here may be "
                "presented as one"
            ),
            "derived": (
                "a display fact computed from another artifact or from the site's own "
                "schedule constants; `from` names what it was computed out of. The site "
                "reads these; it never restates them"
            ),
            "_why": (
                "the piece is not entitled to author a number. Where one is not in the "
                "shot record it is either cited here or it is not shown"
            ),
        },
        "external": external,
        "derived": derived,
    }


def main():
    facts = build()
    write_json(PROCESSED_DIR / "facts.json", facts)

    d = facts["derived"]
    print(f"QA: {len(facts['external'])} external facts, {len(d)} derived "
          f"-> data/processed/facts.json")
    print(f"     the window spans {d['window.days_inclusive']['value']} inclusive days "
          f"({d['window.weeks']['value']} weeks)")
    print(f"     the loop runs {d['loop.seconds']['value']} s = "
          f"{d['loop.clock']['value']}, of which the window is "
          f"{100 * d['loop.window_share']['value']:.0f}%")
    print(f"     {d['schema.fields_per_shot']['value']} fields and "
          f"{d['schema.positions_per_shot']['value']} position per shot, in every season; "
          f"{d['taxonomies.count']['value']} taxonomies; "
          f"{d['contest.categories']['value']} published categories")
    for k, v in facts["external"].items():
        val = v["value"]
        shown = f"{len(val)} entries" if isinstance(val, list) else val
        print(f"     external {k}: {shown}")


if __name__ == "__main__":
    main()
