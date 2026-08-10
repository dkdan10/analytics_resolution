/**
 * THE WASH — the dried ground of the four scales (session 15).
 *
 * One body-occupancy raster per game day (`wash.bin`), folded in FIXED ORDER
 * into a cell-space float accumulator and converted to pixels through the
 * residence's own splat kernel and a compressive tone curve read against the
 * CORPUS total. Every scale — the game's grid, the night's raster, the
 * season's fold — converts through the same curve against the same total, so
 * game ≤ night ≤ season holds cell-wise BY MEASURE and each handoff is
 * subset → superset rather than a crossfade between unrelated pictures.
 *
 * Per-day 8-bit layers were REJECTED at design (the sub-8-bit trap: a single
 * game day's share of the corpus quantizes to zero and whole days vanish).
 * Instead: float accumulation, one conversion per applied day, front + delta
 * canvases so a mid-day frame crossfades the arriving day up over the ground
 * (the session-13 arrival idiom). Integer-boundary frames are EXACT by
 * construction — when a day completes, the front is reconverted from the
 * accumulator and the delta is retired, so no boundary pixel ever depends on
 * the crossfade path. A dead day contributes no delta and its frames are
 * byte-identical to the ground at any speed.
 *
 * Purity: every cached surface is a pure function of its key — geometry, DPR,
 * the artifact's identity, the seed day and the count of applied days. A
 * backward seek REBUILDS from the seed rather than remembering; `clearWashes`
 * is registered in `probe/shared.ts:cold()` (an unregistered cache is a false
 * PURE, not a false failure).
 *
 * The wash blits `lighter` inside its own save/restore — the field's reading
 * (a ground the marks settle over, not a matte) — which is a DOCUMENTED
 * exception inside THE HAND's source-over regime; see hand.ts's header.
 */

import { BONE_RGB } from "./palette";
import {
  FALLOFF_DISC_INTEGRAL,
  SPLAT_MIN_PX,
  SPLAT_SPACING_K,
  WASH_ALPHA,
  WASH_TONE_K,
} from "./scalars";
import type { View } from "./plate";
import type { Wash, WindowFile } from "./data";

/** Court tenths per wash cell — the artifact's own 1-ft grain. */
const CELL_TENTHS = 10;

type WashMeta = WindowFile["wash"];

interface Lane {
  key: string;
  /** Cell-space float sums — the fold's ground truth. */
  acc: Float64Array;
  /** How many rasters of the fold order have been applied (seed excluded). */
  applied: number;
  front: HTMLCanvasElement;
  /** The front's float pixels, kept so a delta is a float subtraction. */
  frontPx: Float32Array;
  /** The arriving day's own pixels (convert(front+day) − convert(front)),
   *  or null when the arriving day is dead or already the seed. */
  delta: HTMLCanvasElement | null;
  deltaFor: number;
}

const lanes = new Map<string, Lane>();

/** Artifact identity for keys, the hand's own WeakMap idiom. */
const ids = new WeakMap<object, number>();
let nextId = 1;
function idOf(o: object): number {
  let v = ids.get(o);
  if (v === undefined) {
    v = nextId++;
    ids.set(o, v);
  }
  return v;
}

export function clearWashes(): void {
  lanes.clear();
}

/** One day's cells out of the decoded rasters, as fold-ready floats. */
export function dayCells(wash: Wash, meta: WashMeta, day: number): Float64Array | null {
  const at = meta.days.indexOf(day);
  if (at < 0) return null;
  const per = meta.rows * meta.cols;
  const out = new Float64Array(per);
  for (let i = 0; i < per; i++) out[i] = wash.data[at * per + i]!;
  return out;
}

/** A sparse artifact grid (`game.json:game_grid`) on the wash's own lattice. */
export function gridCells(grid: Record<string, number>, meta: WashMeta): Float64Array {
  const out = new Float64Array(meta.rows * meta.cols);
  for (const [cell, v] of Object.entries(grid)) {
    const comma = cell.indexOf(",");
    const cx = Number(cell.slice(0, comma)) - meta.x0;
    const cy = Number(cell.slice(comma + 1)) - meta.y0;
    if (cx >= 0 && cx < meta.cols && cy >= 0 && cy < meta.rows) {
      out[cy * meta.cols + cx] = v;
    }
  }
  return out;
}

/** Cell sums → toned, splatted float pixels. The residence's arithmetic at the
 *  wash's tone: a cell's share of the CORPUS total through 1 − e^(−k·share),
 *  spread by the J2-null kernel so the lattice's beat is suppressed. */
function convert(
  cells: Float64Array,
  total: number,
  meta: WashMeta,
  view: View,
  dpr: number,
): Float32Array {
  const w = Math.max(1, Math.round(view.width * dpr));
  const h = Math.max(1, Math.round(view.height * dpr));
  const px = new Float32Array(w * h);
  const spacing = view.s(CELL_TENTHS) * dpr;
  const radius = Math.max(SPLAT_MIN_PX, spacing * SPLAT_SPACING_K);
  const span = Math.ceil(radius);
  const inv = 1 / (radius * radius);
  const overlap = Math.max(
    1,
    (Math.PI * radius * radius * FALLOFF_DISC_INTEGRAL) / (spacing * spacing),
  );
  for (let c = 0; c < cells.length; c++) {
    const sum = cells[c]!;
    if (sum <= 0) continue;
    const gx = (c % meta.cols) + meta.x0;
    const gy = Math.floor(c / meta.cols) + meta.y0;
    const cx = gx * CELL_TENTHS + CELL_TENTHS / 2;
    const cy = gy * CELL_TENTHS + CELL_TENTHS / 2;
    const a = (1 - Math.exp(-WASH_TONE_K * (sum / total))) / overlap;
    const fx = view.sx(cx) * dpr;
    const fy = view.sy(cy) * dpr;
    const bx = Math.round(fx);
    const by = Math.round(fy);
    for (let dy = -span; dy <= span; dy++) {
      const yy = by + dy;
      if (yy < 0 || yy >= h) continue;
      const ey = yy - fy;
      for (let dx = -span; dx <= span; dx++) {
        const xx = bx + dx;
        if (xx < 0 || xx >= w) continue;
        const ex = xx - fx;
        const wgt = 1 - (ex * ex + ey * ey) * inv;
        if (wgt <= 0) continue;
        px[yy * w + xx] = px[yy * w + xx]! + a * wgt;
      }
    }
  }
  return px;
}

const bone = BONE_RGB.split(",").map((s) => Number(s.trim()));

/** Float pixels → a canvas, bone always: the ground belongs to no zone. */
function toCanvas(px: Float32Array, view: View, dpr: number): HTMLCanvasElement {
  const w = Math.max(1, Math.round(view.width * dpr));
  const h = Math.max(1, Math.round(view.height * dpr));
  const img = new ImageData(w, h);
  const data = img.data;
  for (let p = 0, o = 0; p < px.length; p++, o += 4) {
    const v = Math.min(1, px[p]!);
    data[o] = bone[0]! * v;
    data[o + 1] = bone[1]! * v;
    data[o + 2] = bone[2]! * v;
    data[o + 3] = 255;
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.putImageData(img, 0, 0);
  return canvas;
}

function blitLighter(
  ctx: CanvasRenderingContext2D,
  el: HTMLCanvasElement,
  view: View,
  alpha: number,
): void {
  if (alpha <= 0.002) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(el, 0, 0, view.width, view.height);
  ctx.restore();
}

/** One fixed grid (the game's own, or one night's raster) as dried ground.
 *  `id` is the caller's stable name for the grid — it is part of the key, so
 *  it must change iff the cells change. */
export function drawWashCells(
  ctx: CanvasRenderingContext2D,
  view: View,
  dpr: number,
  id: string,
  cells: Float64Array,
  total: number,
  meta: WashMeta,
  alpha: number,
): void {
  const key = `cells|${id}|${Math.round(view.width)}x${Math.round(view.height)}|${dpr}`;
  let lane = lanes.get(key);
  if (!lane) {
    const px = convert(cells, total, meta, view, dpr);
    lane = {
      key,
      acc: cells,
      applied: 0,
      front: toCanvas(px, view, dpr),
      frontPx: px,
      delta: null,
      deltaFor: -1,
    };
    lanes.set(key, lane);
    evict(key);
  }
  blitLighter(ctx, lane.front, view, alpha * WASH_ALPHA);
}

/**
 * The season's fold: rasters accumulate in day order beneath the calendar.
 *
 * `seedDay` is pre-seeded into the ground (the night is already on screen
 * when the season opens) and SKIPPED when the sweep reaches it — no
 * double-add. `dayFrac` is the window's continuous day (the hands' own
 * clock): day d's raster rises across [d, d+1) and is exact at d+1.
 */
export function drawWashFold(
  ctx: CanvasRenderingContext2D,
  view: View,
  dpr: number,
  wash: Wash,
  meta: WashMeta,
  seedDay: number,
  dayFrac: number,
  alpha: number,
): void {
  const per = meta.rows * meta.cols;
  const total = meta.positions_total;
  const lo = Math.floor(Math.max(0, dayFrac));
  // The fold order: every raster day except the seed, ascending.
  const order = meta.days.filter((d) => d !== seedDay);
  const wantApplied = order.filter((d) => d < lo).length;

  const geom = `${Math.round(view.width)}x${Math.round(view.height)}|${dpr}`;
  const key = `fold|${idOf(wash)}|${seedDay}|${geom}`;
  let lane = lanes.get(key);
  if (lane && lane.applied > wantApplied) lane = undefined; // backward: rebuild
  if (!lane) {
    const acc = dayCells(wash, meta, seedDay) ?? new Float64Array(per);
    const px = convert(acc, total, meta, view, dpr);
    lane = {
      key,
      acc,
      applied: 0,
      front: toCanvas(px, view, dpr),
      frontPx: px,
      delta: null,
      deltaFor: -1,
    };
    lanes.set(key, lane);
    evict(key);
  }
  while (lane.applied < wantApplied) {
    const day = order[lane.applied]!;
    const at = meta.days.indexOf(day);
    for (let i = 0; i < per; i++) lane.acc[i] = lane.acc[i]! + wash.data[at * per + i]!;
    lane.applied++;
    const px = convert(lane.acc, total, meta, view, dpr);
    lane.front = toCanvas(px, view, dpr);
    lane.frontPx = px;
    lane.delta = null;
    lane.deltaFor = -1;
  }

  blitLighter(ctx, lane.front, view, alpha * WASH_ALPHA);

  // The arriving day, rising over the ground. Dead day or the seed: nothing —
  // the frame is the ground, byte-identical at any speed.
  const frac = Math.max(0, dayFrac) - lo;
  const arriving = order[wantApplied];
  if (arriving === undefined || arriving !== lo || frac <= 0) return;
  if (lane.deltaFor !== lo) {
    const at = meta.days.indexOf(lo);
    const next = new Float64Array(lane.acc);
    for (let i = 0; i < per; i++) next[i] = next[i]! + wash.data[at * per + i]!;
    const nextPx = convert(next, total, meta, view, dpr);
    for (let p = 0; p < nextPx.length; p++) {
      nextPx[p] = Math.max(0, nextPx[p]! - lane.frontPx[p]!);
    }
    lane.delta = toCanvas(nextPx, view, dpr);
    lane.deltaFor = lo;
  }
  if (lane.delta) blitLighter(ctx, lane.delta, view, alpha * WASH_ALPHA * frac);
}

/** Two lanes serve a frame (the fold and one fixed grid); keep a spare of
 *  each and evict beyond that, never the key just written. */
function evict(current: string): void {
  if (lanes.size <= 4) return;
  for (const k of lanes.keys()) {
    if (k !== current) {
      lanes.delete(k);
      break;
    }
  }
}
