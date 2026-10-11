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
import type { Game, GameEvent, GameFile } from "./data";
import { prefixCacheGeneration } from "./prefix";

/** The game surfaces accumulate in this many prefix steps across the whole
 *  game — one cache granularity for both consumers (hand and plate), a
 *  composition constant like STROKE_STEP, not a material. */
export const GAME_PREFIX_STEPS = 40;

/** How long a finished game stroke stays wet — bright at full ink — before
 *  it dries to GAME_DRIED. Seconds of the game's own feed; one pacing
 *  constant for both consumers. */
export const GAME_WET_S = 2;

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

/** Frames inside a stroke → the vertex fraction its measured dts have
 *  reached — the slate's own walk (hand.ts:drawSlate), shared so every
 *  consumer draws one pace. A vertex-count fraction is NOT this: control
 *  points are not uniform in time, and a fraction of the count would rush
 *  the slow stretches and drag the fast ones. */
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
 */
export function strokePath(
  ctx: CanvasRenderingContext2D,
  view: View,
  game: Game,
  i: number,
  drawn: number,
  fromDrawn = 0,
): boolean {
  const first = game.first[i]!;
  const n = game.count[i]!;
  if (n < 2) return false;
  const upto = Math.max(2, Math.ceil(n * Math.min(1, Math.max(0, drawn))));
  const from = Math.min(upto - 2,
    Math.max(0, Math.floor(n * Math.min(1, Math.max(0, fromDrawn)))));
  ctx.beginPath();
  ctx.moveTo(view.sx(game.x[first + from]!), view.sy(game.y[first + from]!));
  for (let v = first + from + 1; v < first + upto; v++) {
    ctx.lineTo(view.sx(game.x[v]!), view.sy(game.y[v]!));
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
  drawn: number,
  alpha: number,
  fromDrawn = 0,
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
  if (strokePath(ctx, view, game, i, drawn, fromDrawn)) ctx.stroke();
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
