/** Helpers every hand may need. */

import type { Corpus } from "../data";
import { SEASON_CLOCK_K } from "../scalars";

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
 * (The pre-crescendo reading returned day zero's whole population at frac 0,
 * which is what quietly defeated the opening beat's "one possession" ramp.)
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
 * cached against it — a derived cache, which the fifth rule allows; nothing
 * here is accumulated across frames.
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
