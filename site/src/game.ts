/**
 * THE GAME — the second of the four scales, drawn.
 *
 * One found archive (`game.json` + the two binaries), every body and the
 * ball, laid on the game's own clock. This module owns the TIMING arithmetic
 * (period bases, absolute stroke spans, the eased clock), the PLATE idiom
 * (bone — bodies fainter and thinner, the ball at the traces' own weights)
 * and the measured event punctuation (shot anchors in the bloom's idiom,
 * pass beads at PASS_MARK_R). THE HAND's zone-hue paint physics is NOT
 * reimplemented here: hand.ts walks the same spans through `walkGame` and
 * supplies its own `paintStroke` — one implementation of the paint, two
 * consumers, the project's own zone.ts rule.
 *
 * Nothing here reads `t` or caches a surface: the walkers are pure functions
 * of (artifact, uptoFrame), and every cached quantity is a WeakMap-keyed
 * derivation of the immutable decoded artifact (the scatter-order idiom).
 * Prefix caching lives at the call sites through prefix.ts.
 */

import { BONE_RGB } from "./palette";
import {
  GAME_CLOCK_K,
  GAME_WET_S,
  PASS_MARK_ALPHA,
  PASS_MARK_R,
  TRACE_ANCHOR_ALPHA,
  TRACE_ANCHOR_MIN_PX,
  TRACE_ANCHOR_SCALE,
  TRACE_APPROACH_DIM,
  TRACE_LIT_FLOOR,
  TRACE_LIT_RANGE,
  TRACE_W_APPROACH,
  TRACE_W_IN_FLIGHT,
  TRACE_W_SCALE,
} from "./scalars";
import type { View } from "./plate";
import type { Game, GameEvent, GameFile, Strokes } from "./data";
import { prefixCacheGeneration } from "./prefix";

/** The game surfaces accumulate in this many prefix steps across the whole
 *  game — one cache granularity for both consumers (hand and plate), a
 *  composition constant like STROKE_STEP, not a material. */
export const GAME_PREFIX_STEPS = 40;

/** How long a finished game stroke stays wet — bright at full ink — before
 *  it dries to GAME_DRIED. Seconds of the game's own feed; one value for both
 *  consumers, declared in the register because it decides which strokes are
 *  bright on a frame. */
export { GAME_WET_S };

/** Artifact identity for cache keys — the hand's own WeakMap idiom, exported
 *  so both surfaces key the same decoded object the same way. */
const ids = new WeakMap<object, number>();
let nextId = 1;
export function gameAssetId(o: object): number {
  let v = ids.get(o);
  if (v === undefined) {
    v = nextId++;
    ids.set(o, v);
  }
  return v;
}

/** Cumulative frame base per period, so period-relative starts recover the
 *  game's own order. A pure derivation of game.json:periods. */
const bases = new WeakMap<object, Map<number, number>>();
export function frameBases(gf: GameFile): Map<number, number> {
  let m = bases.get(gf);
  if (!m) {
    m = new Map();
    let at = 0;
    for (const p of gf.periods) {
      m.set(p.period, at);
      at += p.frames;
    }
    bases.set(gf, m);
  }
  return m;
}

export function gameTotalFrames(gf: GameFile): number {
  let n = 0;
  for (const p of gf.periods) n += p.frames;
  return n;
}

/** The game phase's eased clock: u ∈ [0,1] → fraction of the game's frames.
 *  SEASON_CLOCK_K's curve one scale down, with its own authored K. */
export function gameClock(u: number): number {
  const c = Math.min(1, Math.max(0, u));
  return (Math.exp(GAME_CLOCK_K * c) - 1) / (Math.exp(GAME_CLOCK_K) - 1);
}

/**
 * A position along one stroke, counted in its own vertices: whole at a vertex,
 * fractional on the chord between that vertex and the next.
 *
 * Branded because a bare number here is ambiguous. A share of the stroke
 * handed over as a reach would clamp to the first segment of everything and
 * nothing would fail, so a drawer takes a `Reach`: one of the two ends named
 * below, or what `strokeReach` answers. A caller holding a vertex index of
 * its own has to say so with a cast, where a reader can see it.
 */
export type Reach = number & { readonly __reach: unique symbol };

/** The stroke's first vertex — the tail of every stroke that is not a clip. */
export const STROKE_START = 0 as Reach;

/** Past every vertex of any stroke. A drawer clamps it to the last one, so a
 *  bake asks for the finished stroke without knowing how long it is. */
export const WHOLE_STROKE = Number.POSITIVE_INFINITY as Reach;

/** The columns a stroke's clock is read from. The paint, the slate and the
 *  game each ship their own stroke table, and all of them carry these. */
export type StrokeClock = Pick<Strokes, "first" | "count" | "dt">;

/**
 * Frames inside a stroke → how far its head has come, on the stroke's own
 * clock. ONE walk for the plate, the paint, the slate and the composite, so
 * every consumer draws one pace.
 *
 * The stored dts are walked in order, so the head stands on a vertex at
 * exactly the frame the record put a body there. Between two vertices it is
 * not synthesised motion: the tip lies on the stored chord between two
 * recorded vertices, travels it in that segment's own recorded duration, and
 * no vertex is added. A segment drawn part of the way inks nothing its
 * finished self does not ink. What the fraction does assume is an even pace
 * inside the segment, which the record does not hold; it holds the two ends
 * and the time between them, and both are honoured. A head that waited at one
 * vertex and then stood whole at the next claimed more than that, and nobody
 * measured it either.
 *
 * A share of the vertex COUNT is not this. Control points are not uniform in
 * time, and a share of the count would rush the slow stretches and drag the
 * fast ones.
 */
export function strokeReach(s: StrokeClock, i: number, frames: number): Reach {
  if (!(frames > 0)) return STROKE_START;
  const first = s.first[i]!;
  const n = s.count[i]!;
  let cum = 0;
  for (let k = 1; k < n; k++) {
    const d = s.dt[first + k]!;
    // Strictly past the frame, so `d` is above zero wherever it divides and a
    // frame that lands on a vertex answers that vertex exactly.
    if (cum + d > frames) return (k - 1 + (frames - cum) / d) as Reach;
    cum += d;
  }
  return Math.max(0, n - 1) as Reach;
}

/** The frames a stroke takes from its first vertex to its last — the sum
 *  `strokeReach` walks, so a share of it is a share of the stroke's own time. */
export function strokeFrames(s: StrokeClock, i: number): number {
  const first = s.first[i]!;
  const n = s.count[i]!;
  let frames = 0;
  for (let k = 1; k < n; k++) frames += s.dt[first + k]!;
  return frames;
}

/** Frames inside a stroke → the share of its vertex COUNT the measured dts
 *  have passed, in whole vertices. No drawer reads it: a drawn length is a
 *  `strokeReach`, which keeps the part of a segment this rounds away. */
export function timeFrac(game: Game, i: number, frames: number): number {
  if (frames <= 0) return 0;
  const first = game.first[i]!;
  const n = game.count[i]!;
  let k = 1;
  let cum = 0;
  while (k < n && cum + game.dt[first + k]! <= frames) {
    cum += game.dt[first + k]!;
    k++;
  }
  return Math.min(1, k / n);
}

interface Spans {
  /** Absolute start frame per stroke (period base + period-relative start). */
  start: Float64Array;
  /** Painted duration per stroke — the sum of its vertex dts. */
  dur: Float64Array;
}

const spans = new WeakMap<object, Spans>();
export function strokeSpans(game: Game, gf: GameFile): Spans {
  let s = spans.get(game);
  if (!s) {
    const b = frameBases(gf);
    const start = new Float64Array(game.n);
    const dur = new Float64Array(game.n);
    for (let i = 0; i < game.n; i++) {
      start[i] = (b.get(game.period[i]!) ?? 0) + game.start[i]!;
      let d = 0;
      const first = game.first[i]!;
      const last = first + game.count[i]!;
      for (let v = first; v < last; v++) d += game.dt[v]!;
      dur[i] = d;
    }
    s = { start, dur };
    spans.set(game, s);
  }
  return s;
}

/**
 * Visit every stroke the clock has reached, in index order (the shipped
 * order, which carries no derive-order structure). `drawn` is the fraction
 * of the stroke's own painted frames; `age` is frames since it finished
 * (0 while still wet at the edge).
 */
export function walkGame(
  game: Game,
  gf: GameFile,
  fromFrame: number,
  uptoFrame: number,
  visit: (i: number, drawn: number, age: number) => void,
): void {
  const s = strokeSpans(game, gf);
  for (let i = 0; i < game.n; i++) {
    const st = s.start[i]!;
    if (st >= uptoFrame || st < fromFrame) continue;
    const d = s.dur[i]!;
    const drawn = d > 0 ? Math.min(1, (uptoFrame - st) / d) : 1;
    visit(i, drawn, Math.max(0, uptoFrame - (st + d)));
  }
}

const boneOf = (alpha: number): string => `rgba(${BONE_RGB}, ${alpha})`;

/** Keep compound-path circles farther apart than their antialias footprints. */
const EVENT_AA_GAP_DEVICE_PX = 2;

interface CompleteEventPaths {
  passes: Path2D[];
  shots: Path2D[];
}

let eventPathGeneration = -1;
let completePaths = new WeakMap<GameFile, WeakMap<View, Map<number, CompleteEventPaths>>>();

/**
 * Contiguous, screen-nonoverlapping batches in artifact order.
 *
 * Translucent circles that overlap must be separate fills or their accumulated
 * alpha changes. Circles in one batch are separated by a device-pixel safety
 * gap, so filling their compound Path2D directly on the destination is the same
 * set of covered pixels as filling each subpath alone. A collision closes the
 * current batch rather than reordering events around it.
 */
function eventPaths(
  events: readonly GameEvent[],
  view: View,
  radius: number,
  deviceScale: number,
): Path2D[] {
  const batches: Path2D[] = [];
  let path = new Path2D();
  let centres: Array<readonly [number, number]> = [];
  const clear = radius * 2 + EVENT_AA_GAP_DEVICE_PX / deviceScale;
  const clear2 = clear * clear;

  for (const event of events) {
    const x = view.sx(event.x);
    const y = view.sy(event.y);
    const overlaps = centres.some(([cx, cy]) => {
      const dx = x - cx;
      const dy = y - cy;
      return dx * dx + dy * dy <= clear2;
    });
    if (overlaps) {
      batches.push(path);
      path = new Path2D();
      centres = [];
    }
    // `moveTo` starts an independent subpath; otherwise `arc` would join this
    // circle to the preceding circle's endpoint with a line.
    path.moveTo(x + radius, y);
    path.arc(x, y, radius, 0, Math.PI * 2);
    centres.push([x, y]);
  }
  if (centres.length) batches.push(path);
  return batches;
}

function completedEventPaths(
  ctx: CanvasRenderingContext2D,
  view: View,
  gf: GameFile,
): CompleteEventPaths {
  const generation = prefixCacheGeneration();
  if (generation !== eventPathGeneration) {
    completePaths = new WeakMap();
    eventPathGeneration = generation;
  }

  let byView = completePaths.get(gf);
  if (!byView) {
    byView = new WeakMap();
    completePaths.set(gf, byView);
  }
  let byScale = byView.get(view);
  if (!byScale) {
    byScale = new Map();
    byView.set(view, byScale);
  }

  const transform = ctx.getTransform();
  const deviceScale = Math.max(
    Number.EPSILON,
    Math.hypot(transform.a, transform.b),
    Math.hypot(transform.c, transform.d),
  );
  let paths = byScale.get(deviceScale);
  if (!paths) {
    const passR = Math.max(1, view.s(PASS_MARK_R));
    const anchorR = Math.max(TRACE_ANCHOR_MIN_PX, view.scale * TRACE_ANCHOR_SCALE);
    paths = {
      passes: eventPaths(gf.events.passes, view, passR, deviceScale),
      shots: eventPaths(gf.events.shots, view, anchorR, deviceScale),
    };
    byScale.set(deviceScale, paths);
  }
  return paths;
}

function drawCompletedGameEvents(
  ctx: CanvasRenderingContext2D,
  view: View,
  gf: GameFile,
  alpha: number,
): void {
  const paths = completedEventPaths(ctx, view, gf);
  ctx.save();
  ctx.fillStyle = boneOf(Math.min(1, PASS_MARK_ALPHA * alpha));
  for (const path of paths.passes) ctx.fill(path);
  ctx.fillStyle = boneOf(Math.min(1, TRACE_ANCHOR_ALPHA * alpha));
  for (const path of paths.shots) ctx.fill(path);
  ctx.restore();
}

/**
 * The stroke's vertex path, begun on the ctx — ONE walk for every consumer.
 * `plateStroke` styles and strokes it; the entry yield mask
 * strokes the same path wider in `destination-out`, and sharing the walk is
 * what guarantees the wake and the stroke cannot drift apart. Returns false
 * when the stroke has no path to draw.
 *
 * `head` and `tail` are reaches. An end that falls between two vertices is
 * put on their chord, and the whole vertices between the ends are the stored
 * ones, untouched — so it stays one path, stroked once, and a finished
 * stroke is the same calls whether it was asked for whole or arrived at.
 */
export function strokePath(
  ctx: CanvasRenderingContext2D,
  view: View,
  game: Game,
  i: number,
  head: Reach,
  tail: Reach = STROKE_START,
): boolean {
  const first = game.first[i]!;
  const n = game.count[i]!;
  const to = Math.min(n - 1, Math.max(0, head));
  const from = Math.min(to, Math.max(0, tail));
  if (!(to > from)) return false;
  const fromV = Math.floor(from);
  const toV = Math.floor(to);
  const sx = (v: number): number => view.sx(game.x[first + v]!);
  const sy = (v: number): number => view.sy(game.y[first + v]!);
  ctx.beginPath();
  if (from > fromV) {
    const part = from - fromV;
    const x0 = sx(fromV);
    const y0 = sy(fromV);
    ctx.moveTo(x0 + (sx(fromV + 1) - x0) * part, y0 + (sy(fromV + 1) - y0) * part);
  } else {
    ctx.moveTo(sx(fromV), sy(fromV));
  }
  for (let v = fromV + 1; v <= toV; v++) ctx.lineTo(sx(v), sy(v));
  // The tip, only when the head is between two vertices: a head standing on a
  // vertex ends on the stored one, never on a chord's computed end.
  if (to > toV) {
    const part = to - toV;
    const x0 = sx(toV);
    const y0 = sy(toV);
    ctx.lineTo(x0 + (sx(toV + 1) - x0) * part, y0 + (sy(toV + 1) - y0) * part);
  }
  return true;
}

/**
 * The PLATE idiom: one stroke in bone. Bodies faint and thin (the traces'
 * approach weights), the ball at their in-flight weights — ALL the
 * information, drawn at the register the plate already speaks.
 */
export function plateStroke(
  ctx: CanvasRenderingContext2D,
  view: View,
  game: Game,
  i: number,
  head: Reach,
  alpha: number,
  tail: Reach = STROKE_START,
): void {
  const ball = game.kind[i] === 1;
  // The ball as bright as a trace at full height; bodies at the approach dim —
  // the traces' own register, no new ink invented for the plate.
  const lit = ball ? TRACE_LIT_FLOOR + TRACE_LIT_RANGE
    : TRACE_LIT_FLOOR * TRACE_APPROACH_DIM;
  const wpx = Math.max(1, view.scale * TRACE_W_SCALE)
    * (ball ? TRACE_W_IN_FLIGHT : TRACE_W_APPROACH);
  ctx.save();
  ctx.strokeStyle = boneOf(Math.min(1, lit * alpha));
  ctx.lineWidth = wpx;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (strokePath(ctx, view, game, i, head, tail)) ctx.stroke();
  ctx.restore();
}

/** Every event the clock has reached, punctuated: a pass is one bone bead at
 *  the frame the ball reached its receiver; a shot is the bloom's own anchor
 *  idiom — the dot the record kept, held brighter than the line around it.
 *  `clip` additionally admits events inside an absolute-frame window the
 *  walk has not reached yet — the nested possession's own annotations, which
 *  the game's clock later replaces record-for-record. `sinceFrame` narrows
 *  the punctuation to the wet edge: THE HAND lets an annotation dry away
 *  with the motion it marked (the filed record's drops are what persists
 *  there), while THE PLATE — ALL the information, by design — omits
 *  it and keeps every mark. */
export function drawGameEvents(
  ctx: CanvasRenderingContext2D,
  view: View,
  gf: GameFile,
  uptoFrame: number,
  alpha: number,
  clip?: { from: number; to: number },
  sinceFrame?: number,
): void {
  if (alpha <= 0.002) return;
  // The Plate holds the completed game's annotations for most of the Window.
  // Their geometry is static; only ink changes in CLOSE. Batch that one case
  // directly on the destination. Dynamic, clipped and wet-edge calls retain
  // the original per-event path below.
  if (clip === undefined && sinceFrame === undefined
      && uptoFrame >= gameTotalFrames(gf)) {
    drawCompletedGameEvents(ctx, view, gf, alpha);
    return;
  }
  const b = frameBases(gf);
  const at = (e: GameEvent): number => (b.get(e.p) ?? 0) + e.f;
  const due = (e: GameEvent): boolean => {
    const f = at(e);
    if (clip !== undefined && f >= clip.from && f <= clip.to && f > uptoFrame) return true;
    return f <= uptoFrame && (sinceFrame === undefined || f > sinceFrame);
  };
  ctx.save();
  const passR = Math.max(1, view.s(PASS_MARK_R));
  ctx.fillStyle = boneOf(Math.min(1, PASS_MARK_ALPHA * alpha));
  for (const e of gf.events.passes) {
    if (!due(e)) continue;
    ctx.beginPath();
    ctx.arc(view.sx(e.x), view.sy(e.y), passR, 0, Math.PI * 2);
    ctx.fill();
  }
  const anchorR = Math.max(TRACE_ANCHOR_MIN_PX, view.scale * TRACE_ANCHOR_SCALE);
  ctx.fillStyle = boneOf(Math.min(1, TRACE_ANCHOR_ALPHA * alpha));
  for (const e of gf.events.shots) {
    if (!due(e)) continue;
    ctx.beginPath();
    ctx.arc(view.sx(e.x), view.sy(e.y), anchorR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** The declared possession as absolute frame bounds — "one" is literally a
 *  time-clip of this artifact. */
export function possessionFrames(gf: GameFile): { f0: number; f1: number } {
  const base = frameBases(gf).get(gf.possession.p) ?? 0;
  return { f0: base + gf.possession.f0, f1: base + gf.possession.f1 };
}
