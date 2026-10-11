/** Helpers every hand may need. */

import type { Corpus } from "../data";
import { drawSlug } from "../inscription";
import { SEASON_CLOCK_K } from "../scalars";
import { ACT_TITLES, type Act } from "../timeline";
import type { Frame } from "./types";

/**
 * THE SEASON BEAT'S CLOCK — the crescendo's one authored curve.
 *
 * Maps beat-local u (0..1) onto a fraction of the window's real calendar. The
 * order underneath is measured — which marks arrive on which day is the
 * record's own, and the four dead days stay dead at speed — so this easing is
 * the only authored thing about the acceleration, and it is declared in the
 * register (`SEASON_CLOCK_K`) with exactly that scope. Exponential, so the
 * beat opens near the night's own pace and compresses toward its crest.
 */
export function seasonClock(u: number): number {
  const c = Math.min(1, Math.max(0, u));
  return (Math.exp(SEASON_CLOCK_K * c) - 1) / (Math.exp(SEASON_CLOCK_K) - 1);
}

/**
 * How many marks have arrived by a fractional calendar day, interpolated
 * INSIDE a day so arrival is continuous while its rate stays the record's own.
 *
 * Day-exclusive at the integers: `arrivedThrough(cum, 0)` is 0 and a day's
 * marks land DURING its own passage, so the season beat opens empty and
 * crescendos to everything at `span + 1` — the window's inclusive day count.
 * (A day-inclusive reading returns day zero's whole population at frac 0,
 * which quietly defeats the opening beat's "one possession" ramp.)
 */
export function arrivedThrough(cum: Int32Array, dayFrac: number): number {
  const span = cum.length - 1;
  const d = Math.max(0, Math.min(span + 1, dayFrac));
  const lo = Math.floor(d);
  const a = lo > 0 ? cum[Math.min(span, lo - 1)]! : 0;
  const b = cum[Math.min(span, lo)]!;
  return Math.round(a + (b - a) * (d - lo));
}

/**
 * The cumulative-by-day table both day-keyed hands pace on: how many records
 * carry each calendar-day offset, prefix-summed. Derived from the asset and
 * cached against it — a derived cache, which the fifth rule (README, The
 * rules) allows; nothing here is accumulated across frames.
 */
const cumulative = new WeakMap<object, Int32Array>();

export function cumulativeByDay(owner: object, days: ArrayLike<number>, n: number,
                                offsetOf: (d: number) => number, span: number): Int32Array {
  const have = cumulative.get(owner);
  if (have) return have;
  const out = new Int32Array(span + 1);
  for (let i = 0; i < n; i++) {
    const o = offsetOf(days[i]!);
    if (o >= 0 && o <= span) out[o] = out[o]! + 1;
  }
  for (let d = 1; d <= span; d++) out[d] = out[d]! + out[d - 1]!;
  cumulative.set(owner, out);
  return out;
}

/**
 * THE ACT NAMES THE LOSS — the act boundaries named in the score's own
 * phrases (decided 2026-08-10). Acts II and V open as ordinary season
 * arrivals: the record's own drift supplies no categorical sign that the
 * condition changed, so the act's existing title enters once, over the
 * crossing into the act, at the rank reserved for what the piece is about.
 * The string is ACT_TITLES uppercased at the pen — read from the score's
 * source, never typed here; the rank is the `"voice"` argument passed to
 * `drawSlug` below.
 *
 * Pure in t: the envelope is a smoothstep trapezoid over the act's opening
 * seconds, derived from the schedule's own segment start. Composition, not
 * grain — the pacing below is the boundary's own, declared like the prelude's
 * (render.ts:ramp); the ink rides the registered voice rank, held to the
 * in-plate voice weight the caliper and enclosure sentences carry.
 *
 * A hand with a native boundary event omits the duplicate: THE MEASURE
 * already names Act II (drawNamesOnly) and THE LEDGER already arrives in
 * Act V (drawPublishedInstead) — each calls this only for the act it lacks.
 */
export const ACT_CUE_SECONDS = 3;
const CUE_EDGE = 0.8;
const CUE_AT = { x: 0, y: 330 };

function cueStep(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
}

export function drawActCue(f: Frame, act: Act, at = CUE_AT): void {
  const seg = f.schedule.segments.find((s) => s.act === act);
  if (!seg) return;
  const u = f.st.t - seg.start;
  if (u <= 0 || u >= ACT_CUE_SECONDS) return;
  const a = cueStep(u / CUE_EDGE)
    * (1 - cueStep((u - (ACT_CUE_SECONDS - CUE_EDGE)) / CUE_EDGE));
  drawSlug(f.ctx, f.view, [ACT_TITLES[seg.act].toUpperCase()], at,
    f.remains * a * 0.45, "voice");
}

/** The empty archive dated the day the window closed.
 *
 *  Selected by parsing the MM.DD.YYYY prefix against the corpus's own last date,
 *  never by sorting the filenames: those strings are month-first, so
 *  lexicographic order is not chronological and a shell from December would
 *  sort after one from January. */
export function terminalShell(corpus: Corpus): string | null {
  const iso = corpus.date_range[1];
  for (const name of corpus.empty_32B_shells) {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})\./.exec(name);
    if (m && `${m[3]}-${m[1]}-${m[2]}` === iso) return name;
  }
  return null;
}
