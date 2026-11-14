/**
 * Which entry an address opens.
 *
 * Import-free and written in erasable syntax only, so the address table can be
 * checked in Node with no bundler: `scripts/route-check.mjs` loads this file
 * as it stands.
 */

/** The keys that address a frame directly. Any one of them keeps the visitor
 *  on the canonical work, so a bookmark to a frame always opens that frame. */
export const DIRECT_KEYS = ["t", "year", "stop", "mode", "ops"] as const;

export type Landing = "overview" | "player";
export type Entry = "canonical" | Landing;

/** What the bare address serves. The cast keeps the type wider than the
 *  value, so a comparison with the other landing stays legal while this one is
 *  in force. `route-check.mjs` pins it: changing it alone turns that check red. */
export const LANDING = "overview" as Landing;

/**
 * Existing direct-frame and working addresses stay on the canonical work: the
 * presenter's keys, the rail, a probe, an explicit request for the full work,
 * and any direct key. Only an explicit request for the overview, or an address
 * that asks for none of these, chooses otherwise, and the bare address serves
 * `LANDING`.
 */
export function entryOf(q: URLSearchParams): Entry {
  if (q.has("talk") || q.has("nav") || q.has("probe")) return "canonical";
  if (q.get("experience") === "full") return "canonical";
  if (q.get("experience") === "overview") return "overview";
  if (DIRECT_KEYS.some((key) => q.has(key))) return "canonical";
  return LANDING;
}

/** How far short of the loop's end a seek stops, so it never wraps to the
 *  start. The rail writes the same margin inline at its scrub's end and keeps
 *  its own copy. */
export const LOOP_END_GUARD_S = 0.01;

/** How far ahead of an instant a stop may lie and still count as reached. The
 *  rail's stop walk writes the same margin inline and keeps its own copy. */
export const STOP_TOLERANCE_S = 0.01;

/** How many turns a lift may take before it is called broken. Wherever it has
 *  been measured a lift took one turn at most; the rest is margin, not a search. */
const LIFT_TURNS = 4;

/** A loop time folded into one loop, by the expression the timeline folds with. */
export function wrapLoop(t: number, D: number): number {
  return ((t % D) + D) % D;
}

/** Which pass of the loop an instant falls in, and where in the loop it is. */
export function passLocal(t: number, D: number, passes: number): { pass: number; local: number } {
  return { pass: Math.floor(Math.max(0, t) / D) % passes, local: wrapLoop(t, D) };
}

/**
 * The loop time that shows `local` in the given pass, never a hair before it.
 *
 * Adding the pass's start to a local rounds, and folding the sum back rounds
 * again, so the folded value can land just below the local it was built from:
 * a seek to a stop's start would then draw the last frame of the span before
 * the stop, with no error anywhere. Each turn moves the time up by about one
 * unit in the last place of the loop's length or of the time itself, whichever
 * is coarser: the smallest move that still changes the fold everywhere in the
 * loop, the first pass included. The local is first held inside the loop and
 * `guard` short of its end, so the lift never leaves its pass.
 */
export function toPass(pass: number, local: number, D: number, guard: number): number {
  const at = Math.min(Math.max(0, local), D - guard);
  let r = pass * D + at;
  for (let turn = 0; wrapLoop(r, D) < at; turn++) {
    if (turn === LIFT_TURNS) throw new Error("toPass: the folded time stays below the local");
    r += Math.max(Math.abs(r), D) * Number.EPSILON;
  }
  return r;
}

/**
 * The stop a step lands on: the index walk of the rail's own stop buttons.
 *
 * A step goes by index, never by elapsed seconds, so a press does not depend
 * on how long ago the last one was. A stop ahead of `local` by no more than
 * `tolerance` counts as reached, so a seek that landed a rounding error short
 * of a stop steps on past it. Past either end the walk wraps: forward to the
 * first start, back to the last.
 */
export function stepFrom(
  starts: readonly number[],
  local: number,
  dir: -1 | 1,
  tolerance: number,
): number {
  let i = 0;
  for (let k = 0; k < starts.length; k++) if (starts[k]! <= local + tolerance) i = k;
  return starts[i + dir] ?? (dir === 1 ? starts[0]! : starts[starts.length - 1]!);
}
