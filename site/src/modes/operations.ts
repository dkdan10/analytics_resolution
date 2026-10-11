/** The eight acts by which a record becomes an image.
 *
 * THE STACK's controls do not name visual effects. They name INTERPRETIVE
 * OPERATIONS — things somebody did to a list of coordinates to turn it into a
 * picture — and each one declares the artifact it reads and the definition that
 * artifact ships for it. The point of the view is that a presenter adds these
 * one at a time over bare stone, and the audience watches interpretation being
 * applied, which is exactly what the league does and does not show.
 *
 * This module is the TABLE and nothing else: ids, keys, titles, the artifact
 * keys each operation reads, and which definition in which artifact defines it.
 * It is read by `modes/stack.ts` (which draws) and by `navigator.ts` (which
 * lists them in the rail), and it imports no renderer, so neither of those two
 * can pull the other in.
 *
 * NO MATERIAL VALUE MAY BE WRITTEN HERE. Alphas, radii and widths belong in
 * `src/scalars.ts` like every other material scalar in the piece; this file is
 * in `check-numbers.mjs:MARK_LAYERS` anyway, so pass 3 will say so if one is.
 *
 * NO DEFINITION TEXT IS WRITTEN HERE EITHER. `definitionKey` names an artifact
 * and a key inside its own `definitions` block, and the rail reads the sentence
 * out of `data/processed/` at run time. A definition copied into source is a
 * definition that will go stale, which is the first rule (README, The rules)
 * applied to prose rather than to a number.
 */

import { STACK_OPERATION_DURATIONS_SECONDS } from "../window-score";

/** Compatibility export; operation response timing lives in the Window score. */
export { STACK_OPERATION_DURATIONS_SECONDS };

/** One letter per operation: the URL token and the keyboard key are the same
 *  alphabet, so `?ops=lci` and pressing `l`, `c`, `i` are one thing said twice.
 *  Three verbs and four objects, all distinct — the table is the definition. */
export const OPERATIONS = [
  {
    id: "locate",
    key: "l",
    title: "LOCATE THE ATTEMPT",
    /** A dense cached field needs a legible, but still prompt, reveal. */
    durationSeconds: STACK_OPERATION_DURATIONS_SECONDS.locate,
    /** What the operation does to the record, in the rail, under its title. */
    does: "puts every shot where the record says it happened, and piles the ones it would not place",
    // No STACK string may assert `rim_sentinel` unless a second instrument has
    // seen it. The rail's LOCATE row once quoted `ra_origin_share` instead,
    // because that key is about the exact origin and was corroborated while the
    // sentinel was not. The sentinel is corroborated now
    // (window.json:sentinel_corroboration), and the definition this quotes
    // carries the verdict AND the scope limit, which is why quoting it is safe.
    reads: ["points/season_YYYY.bin", "seasons[].resolution.rim_sentinel"],
    definition: ["seasons", "resolution.rim_sentinel"],
  },
  {
    id: "classify",
    key: "c",
    title: "CLASSIFY THE FLOOR",
    /** A colour response is immediately legible; it should not linger. */
    durationSeconds: STACK_OPERATION_DURATIONS_SECONDS.classify,
    does: "tints those same marks by the league's own seven regions — a partition the NBA drew",
    reads: ["seasons[].zones", "palette.ts:ZONE_RGB"],
    definition: ["paint", "zone"],
    /** A MODIFIER, not a layer. It re-tints the base LOCATE draws and never
     *  draws a second field, because neutral density, coloured density and
     *  splotches are one material choice rather than three overlays. With
     *  LOCATE off there is nothing to tint and nothing happens. */
    requires: "locate",
  },
  {
    id: "inscribe",
    key: "i",
    title: "INSCRIBE THE SEASON",
    durationSeconds: STACK_OPERATION_DURATIONS_SECONDS.inscribe,
    does: "strikes the season's own figure into the floor and migrates it out to the ring",
    reads: ["seasons[].mid_share", "seasons[].contemporaneous"],
    definition: ["seasons", "mid_share"],
  },
  {
    id: "connect",
    key: "b",
    title: "CONNECT THE BODY",
    /** The only deliberately slow operation: the bodies draw their paths. */
    durationSeconds: STACK_OPERATION_DURATIONS_SECONDS.connect,
    does: "joins the positions of one corroborated possession into the paths the bodies took",
    reads: ["paint_strokes.bin", "paint_index.bin"],
    definition: ["paint", "stroke"],
    /** The optical feed is public for one span only. Outside it this operation
     *  has nothing to apply, and the rail says so rather than drawing a blank —
     *  an operation that cannot be applied everywhere is the piece's argument,
     *  not a gap in this view. */
    windowOnly: true,
  },
  {
    id: "measure",
    key: "d",
    title: "MEASURE THE DEFENDER",
    durationSeconds: STACK_OPERATION_DURATIONS_SECONDS.measure,
    does: "cuts a continuous distance into the league's four published categories",
    reads: ["window.json:contest.heroes", "window.json:bias"],
    definition: ["window", "closest_defender"],
    windowOnly: true,
  },
  {
    id: "name",
    key: "n",
    title: "NAME THE ACTION",
    durationSeconds: STACK_OPERATION_DURATIONS_SECONDS.name,
    does: "says what the record called each shot, as often a season as its vocabulary is varied",
    reads: ["samples/season_YYYY.json:action_vocab"],
    definition: ["seasons", "sample"],
  },
  {
    id: "count",
    key: "e",
    title: "COUNT THE EVENT",
    durationSeconds: STACK_OPERATION_DURATIONS_SECONDS.count,
    does: "files the season under one of the record's six taxonomies and tallies it in the margin",
    reads: ["seasons[].classification", "seasons[].active_taxonomy"],
    definition: ["seasons", "vocabulary.covering_90pct"],
  },
  {
    id: "join",
    key: "j",
    title: "JOIN THE INSTRUMENTS",
    /** A short flood: longer than a static response, shorter than a body. */
    durationSeconds: STACK_OPERATION_DURATIONS_SECONDS.join,
    does: "lays a hairline from each filed coordinate to the feed's ball at release — the archive's two words about where one shot happened",
    reads: ["quarrel.bin", "window.json:quarrel_bin"],
    definition: ["window", "quarrel"],
    /** THE QUARREL, as an operation. The join that made CONNECT and MEASURE
     *  possible re-numbered games by a voted integer — how many, and out of
     *  how many, is `window.json:recovery.games_offset` against
     *  `corpus.games_parsed` — and ships confession keys that nothing else
     *  draws. This is the join's honest drawable, the per-shot disagreement it
     *  measures, and like the other two feed operations it can only be
     *  applied where the feed is public. */
    windowOnly: true,
  },
] as const;

export type Operation = (typeof OPERATIONS)[number];
export type OpId = Operation["id"];

/**
 * The configuration: a bitmask.
 *
 * The operation selection IS the mode configuration, so rendering remains a
 * pure function of `(modeConfiguration, t)` and no toggle may accumulate state
 * between frames. A number satisfies that by construction — it is passed in,
 * never read back, and nothing downstream can write to it.
 *
 * The bit is the operation's INDEX IN THE TABLE ABOVE, which is also the layer
 * order, so the mask reads bottom-up and no bit position is written anywhere.
 */
export type StackOps = number;

/**
 * The complete, addressable rendering configuration for THE STACK.
 *
 * `mask` says which operations are held on. `progressByOp` says how far the
 * presenter-triggered response for each selected operation has travelled.
 * Both are inputs to rendering, never renderer-owned state, so direct seeks and
 * backward scrubs remain deterministic.
 */
export interface StackRenderState {
  mask: StackOps;
  progressByOp: Partial<Record<OpId, number>>;
}

/** Numeric masks remain accepted while navigation and stored URLs migrate. */
export type StackRenderInput = StackOps | StackRenderState;

export const NO_OPS: StackOps = 0;

export const ALL_OPS: StackOps = OPERATIONS.reduce((m, _, i) => m | (1 << i), 0);

export function bitOf(id: OpId): StackOps {
  const i = OPERATIONS.findIndex((o) => o.id === id);
  return i < 0 ? 0 : 1 << i;
}

export function has(ops: StackOps, id: OpId): boolean {
  return (ops & bitOf(id)) !== 0;
}

/** The selected bits, independent of whether the caller is legacy or paced. */
export function stackMask(state: StackRenderInput): StackOps {
  return typeof state === "number" ? state : state.mask;
}

/**
 * Operation-local progress, clamped at the renderer boundary.
 *
 * A missing entry is complete rather than zero. That is the compatibility
 * rule for URL-loaded configurations and old callers: an address names a held
 * rendering, not the instant its controls happened to be pressed.
 */
export function operationProgress(state: StackRenderInput, id: OpId): number {
  const mask = stackMask(state);
  if (!has(mask, id)) return 0;
  if (typeof state === "number") return 1;
  const value = state.progressByOp[id];
  return value === undefined ? 1 : Math.max(0, Math.min(1, value));
}

/** Build the stable state represented by a URL token or restored mask. */
export function completedStackState(mask: StackOps): StackRenderState {
  return { mask, progressByOp: {} };
}

export function toggle(ops: StackOps, id: OpId): StackOps {
  return ops ^ bitOf(id);
}

/**
 * The mask as a URL token, and back.
 *
 * ADDRESSABILITY IS A PURITY REQUIREMENT, not a convenience. The purity harness
 * tests direct URL seeks — "forward seek, backward seek, direct URL seek and
 * continuous playback yield byte-identical pixels" — and a configuration
 * reachable only by clicking cannot be reached that way at all. Letters rather
 * than a number so a presenter can read what a link is going to show them.
 *
 * Emitted in TABLE ORDER whatever order the letters arrived in, so one
 * configuration has exactly one token and two links to the same frame are the
 * same string.
 */
export function opsToken(ops: StackOps): string {
  return OPERATIONS.filter((_, i) => (ops & (1 << i)) !== 0).map((o) => o.key).join("");
}

/**
 * Unknown letters are IGNORED rather than thrown.
 *
 * The same rule `startOffset` follows for `?t=`: a bad value must never reach
 * the piece. There is no key to press to get out of a frozen exhibit, and a
 * mistyped token should show a smaller stack, never a fault screen.
 */
export function parseOps(token: string | null): StackOps {
  if (!token) return NO_OPS;
  let ops = NO_OPS;
  for (const ch of token.toLowerCase()) {
    const i = OPERATIONS.findIndex((o) => o.key === ch);
    if (i >= 0) ops |= 1 << i;
  }
  return ops;
}

/** The operation a keystroke names, or null. */
export function opForKey(key: string): Operation | null {
  return OPERATIONS.find((o) => o.key === key.toLowerCase()) ?? null;
}

/**
 * ALL RENDERINGS: every operation at once.
 *
 * DECIDED 2026-08-09, and it is the reason there is no timer anywhere in this
 * view. Of the three ways out — let the illegibility decay back
 * deterministically, cut to bare stone, or HOLD UNTIL RELEASED — the view
 * holds. So the argumentative event is not a transient at all — it is the
 * configuration with every bit set, and the presenter decides how long the
 * audience sits in it.
 *
 * What that buys, and it is worth saying plainly: a transient triggered "now"
 * smuggles wall-clock state into a pure render, and keeping it out would mean
 * carrying the invoking `t` in the configuration. Holding instead leaves no
 * `t0` to carry, no paused-clock semantics to disclose, and no arithmetic that
 * has to be trusted to return. The return is the previous mask, restored by
 * the rail, and it is byte-identical because it is the same number.
 */
export function allOn(ops: StackOps): boolean {
  return ops === ALL_OPS;
}
