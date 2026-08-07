/** The single float.
 *
 * The whole piece is a pure function of one number: seconds into the loop.
 * Acts, blends, the cut and every inscription are derived here and nowhere
 * else, which is what lets the gallery loop and the symposium performance be
 * the same work sampled two ways.
 */

import type { Season } from "./data";

/** The plan's six acts - the argument's structure. Distinct from the record's
 *  resolution regimes, which are measured in the data and layer on top. */
export type Act = 0 | 1 | 2 | 3 | 4 | 5;

export const ACT_TITLES: Record<Act, string> = {
  0: "Counts",
  1: "The charted court",
  2: "The cameras arrive",
  3: "The window",
  4: "Enclosure",
  5: "Renderings without records",
};

/** Act 0 has no coordinates, so it has no marks - the plate is bare stone. */
export const ACT0_SECONDS = 24;
/**
 * After the last season the plate empties again before the loop turns over.
 * Without it the finished ring of thirty numerals vanishes in a single frame
 * and the gallery loop shows a seam - the one cut the piece is allowed is
 * 2010-11, and it should not have to share that distinction with a wrap.
 */
export const CODA_SECONDS = 7;
const SEASON_SECONDS = 11;
/** The window dilates: the piece is slow exactly where the record is rich. */
const WINDOW_SECONDS = 75;
const WINDOW_YEAR = 2015;

/**
 * Fraction of a season spent laying that season's marks down.
 *
 * The record accumulates in front of you rather than appearing whole: a season
 * that arrives as a block and then sits still for its whole duration is the
 * reason the piece read as static. Arrival is a pure function of phase, so
 * scrubbing backwards rebuilds it rather than remembering it.
 */
export const ARRIVAL_TAIL = 0.62;

/** The season whose arrival is a cut rather than a drift: the record's rim
 *  blindness ends in one step, league-wide. Verified in the data, not chosen. */
export const CUT_YEAR = 2010;

/** Fraction of a season spent crossfading into the next. */
const BLEND_TAIL = 0.28;

export function actOf(year: number): Act {
  if (year <= 2012) return 1;
  if (year <= 2014) return 2;
  if (year === 2015) return 3;
  if (year <= 2022) return 4;
  return 5;
}

export function secondsFor(year: number): number {
  return year === WINDOW_YEAR ? WINDOW_SECONDS : SEASON_SECONDS;
}

export interface Segment {
  year: number;
  act: Act;
  start: number;
  duration: number;
}

export interface Schedule {
  segments: Segment[];
  byYear: Map<number, Segment>;
  /** When the final season ends; the coda runs from here to `duration`. */
  lastEnds: number;
  duration: number;
}

export function buildSchedule(seasons: Season[]): Schedule {
  const segments: Segment[] = [];
  let cursor = ACT0_SECONDS;
  for (const s of seasons) {
    const duration = secondsFor(s.year);
    segments.push({ year: s.year, act: actOf(s.year), start: cursor, duration });
    cursor += duration;
  }
  return {
    segments,
    byYear: new Map(segments.map((seg) => [seg.year, seg])),
    lastEnds: cursor,
    duration: cursor + CODA_SECONDS,
  };
}

export interface State {
  t: number;
  act: Act;
  /** null through Act 0, when the record holds no geometry to draw. */
  year: number | null;
  next: number | null;
  /** The season still fading out beneath this one, null at the first and at
   *  the cut. Marks now arrive rather than crossfade forward: the outgoing
   *  season recedes as the incoming one lands, so the plate is never empty and
   *  the drift is continuous. */
  prev: number | null;
  /** 0..1 crossfade toward `next`; always 0 when `cut` is true. */
  blend: number;
  /** True while approaching a boundary the record itself made abruptly. */
  cut: boolean;
  /** 0..1 within the current season. */
  phase: number;
  /** 0..1 through Act 0 (0 once the seasons begin). */
  preludePhase: number;
  /** 0..1 through the closing fade back to bare stone (0 until then). */
  coda: number;
  /** 0..1 of this season's marks laid down so far - the record accumulating. */
  arrived: number;
}

function smoothstep(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
}

export function stateAt(t: number, schedule: Schedule): State {
  const time = ((t % schedule.duration) + schedule.duration) % schedule.duration;

  if (time < ACT0_SECONDS) {
    return {
      t: time,
      act: 0,
      year: null,
      next: schedule.segments[0]?.year ?? null,
      prev: null,
      blend: 0,
      cut: false,
      phase: 0,
      preludePhase: time / ACT0_SECONDS,
      coda: 0,
      arrived: 0,
    };
  }

  let idx = schedule.segments.length - 1;
  for (let i = 0; i < schedule.segments.length; i++) {
    const seg = schedule.segments[i]!;
    if (time < seg.start + seg.duration) {
      idx = i;
      break;
    }
  }
  const seg = schedule.segments[idx]!;
  const phase = (time - seg.start) / seg.duration;
  const next = schedule.segments[idx + 1]?.year ?? null;

  // The 2010-11 boundary is the one discontinuity in a piece otherwise made of
  // drift, so it never blends: the pin holds full strength until it bursts.
  // No blend into a season that does not exist: the last one would otherwise
  // dissolve to an empty plate over its final third with nothing replacing it.
  const cut = next === CUT_YEAR;
  const blend = cut || next === null
    ? 0
    : smoothstep((phase - (1 - BLEND_TAIL)) / BLEND_TAIL);

  const coda = time > schedule.lastEnds
    ? smoothstep((time - schedule.lastEnds) / CODA_SECONDS)
    : 0;
  const arrived = smoothstep(phase / ARRIVAL_TAIL);
  // The season being replaced. Not at 2010-11: that boundary is the piece's one
  // cut, so the pin holds full strength and is gone in a single frame.
  const prevSeg = schedule.segments[idx - 1];
  const prev = seg.year === CUT_YEAR || !prevSeg ? null : prevSeg.year;
  return {
    t: time, act: seg.act, year: seg.year, next, prev, blend, cut, phase,
    preludePhase: 0, coda, arrived,
  };
}

/** Start of a season, for the talk mode's deterministic jumps. */
export function seekTo(year: number, schedule: Schedule): number {
  return schedule.byYear.get(year)?.start ?? 0;
}

/**
 * Which pass of the loop this is. The mode axis rides on it, so a hand is a
 * pure function of the same float as everything else: the rail still scrubs it,
 * and no state is held between frames.
 */
export function passAt(t: number, schedule: Schedule): number {
  return Math.floor(Math.max(0, t) / schedule.duration);
}

export function seekAct(act: Act, schedule: Schedule): number {
  if (act === 0) return 0;
  return schedule.segments.find((s) => s.act === act)?.start ?? 0;
}
