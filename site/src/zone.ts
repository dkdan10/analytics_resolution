/** The league's own map of the floor — one copy of it, on this side.
 *
 * SHOT_ZONE_BASIC is a PARTITION OF THE FLOOR that the NBA drew, not a property
 * of a shot: the same test that labels a shot labels a place, and a body
 * crossing the court crosses the league's own regions. That is the entire
 * footing on which THE HAND is allowed to use colour, and on which THE FIELD's
 * hue is a measurement rather than a choice (CLAUDE.md Rule 4).
 *
 * Which means this file cannot be allowed to drift from `pipeline/common.py`.
 * The Python copy is scored against the league's own labels over every one of
 * 2015-16's shots, and qa.py prints the agreement rate and gates it — the
 * misses are a few boundary coordinates the record labels consistently under a
 * convention that rounds the other way from these polygons. This copy is scored
 * against the Python one, and required to agree exactly, through a committed
 * fixture both sides read:
 *
 *     pipeline/checks/zone_fixture.json     the coordinates and their regions
 *     python3 pipeline/qa.py                re-derives it from common.zone_at
 *     npm run gate                          re-derives it from zoneAt below
 *
 * Neither toolchain runs the other's. If the two implementations part company,
 * one of those two gates goes red and the colour stops being a measurement.
 *
 * The geometry lived in three places before this file existed: here, in
 * plate.ts (which engraves it) and in marks.ts (which asked one question of the
 * restricted circle). They all import it now.
 */

/** Tenths of a foot, hoop at the origin — the record's own frame. */
export const RESTRICTED_R = 40;
export const LANE_HALF_W = 80;
export const FREE_THROW_Y = 137.5;

/** Modern three-point geometry: a 23'9" arc, cut to 22 ft in the corners. */
export const THREE_R = 237.5;
export const CORNER_X = 220;

/**
 * Where the arc meets the corner line.
 *
 * Not chosen: the corner-3 line ends 14 ft from the baseline and the hoop
 * stands 5.25 ft off it, so sqrt(237.5² − 220²) lands at 89.48 tenths — that
 * same 8.75 ft plus the arc's own curvature. Derived here exactly as
 * `common.py` derives it, from the same two constants in the same order, so
 * both sides get the same double.
 */
export const CORNER_Y = Math.sqrt(THREE_R * THREE_R - CORNER_X * CORNER_X);

export const HALFCOURT_Y = 417.5;

/** SHOT_ZONE_BASIC in the order aggregate.py files it, which is the order
 *  palette.ts assigns hues in. The index is what ships in the binaries. */
export const ZONE_NAMES = [
  "Restricted Area",
  "In The Paint (Non-RA)",
  "Mid-Range",
  "Left Corner 3",
  "Right Corner 3",
  "Above the Break 3",
  "Backcourt",
] as const;

/**
 * Which of the league's seven regions a point on the floor falls in.
 *
 * The order of these tests is part of the rule, not an implementation detail:
 * backcourt wins over everything, the corner cut wins over the arc, and the
 * restricted circle wins over the lane. `common.py:zone_at` returns in exactly
 * this order.
 */
export function zoneAt(x: number, y: number): number {
  if (y > HALFCOURT_Y) return 6;
  if (Math.abs(x) >= CORNER_X && y <= CORNER_Y) return x < 0 ? 3 : 4;
  const r = Math.hypot(x, y);
  if (r >= THREE_R) return 5;
  if (r <= RESTRICTED_R) return 0;
  if (Math.abs(x) <= LANE_HALF_W && y <= FREE_THROW_Y) return 1;
  return 2;
}
