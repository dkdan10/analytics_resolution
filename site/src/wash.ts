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
  /** The exact completed front the current delta rises toward. */
  nextFront: HTMLCanvasElement | null;
  nextPx: Float32Array | null;
  nextFor: number;
  /** One further day, prepared in bounded pieces behind the live fold. */
  prepared: PreparedFold | null;
  job: FoldJob | null;
}

interface PixelField {
  px: Float32Array;
  /** Half-open device-pixel bounds containing every possible non-zero value. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface PreparedFold {
  forDay: number;
  front: HTMLCanvasElement;
  px: Float32Array;
  delta: HTMLCanvasElement;
}

interface FoldJob {
  forDay: number;
  target: Float64Array;
  basePx: Float32Array;
  field: PixelField;
  cell: number;
  stage: "deposit" | "delta-field" | "delta-canvas" | "front";
  deltaField: PixelField | null;
  delta: HTMLCanvasElement | null;
}

/** At DPR 2 this is ~6 ms of the old all-at-once conversion. */
const PREP_CELLS_PER_FRAME = 256;

const lanes = new Map<string, Lane>();

interface WashGeometry {
  w: number;
  h: number;
  span: number;
  inv: number;
  overlap: number;
  fx: Float64Array;
  fy: Float64Array;
  x2: Float64Array;
  y2: Float64Array;
}

let geometries = new WeakMap<View, Map<string, WashGeometry>>();

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
  geometries = new WeakMap();
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

function washGeometry(meta: WashMeta, view: View, dpr: number): WashGeometry {
  const key = `${meta.rows}|${meta.cols}|${meta.x0}|${meta.y0}|${dpr}`;
  let byKey = geometries.get(view);
  if (!byKey) {
    byKey = new Map();
    geometries.set(view, byKey);
  }
  const have = byKey.get(key);
  if (have) return have;

  const w = Math.max(1, Math.round(view.width * dpr));
  const h = Math.max(1, Math.round(view.height * dpr));
  const spacing = view.s(CELL_TENTHS) * dpr;
  const radius = Math.max(SPLAT_MIN_PX, spacing * SPLAT_SPACING_K);
  const span = Math.ceil(radius);
  const inv = 1 / (radius * radius);
  const overlap = Math.max(
    1,
    (Math.PI * radius * radius * FALLOFF_DISC_INTEGRAL) / (spacing * spacing),
  );
  const fx = new Float64Array(meta.cols);
  const fy = new Float64Array(meta.rows);
  for (let c = 0; c < meta.cols; c++) {
    fx[c] = view.sx((c + meta.x0) * CELL_TENTHS + CELL_TENTHS / 2) * dpr;
  }
  for (let r = 0; r < meta.rows; r++) {
    fy[r] = view.sy((r + meta.y0) * CELL_TENTHS + CELL_TENTHS / 2) * dpr;
  }

  // Pixel-major conversion below visits the same cell order as the old
  // cell-major splat.  Cache only geometry: squared distances stay Float64, so
  // the eventual `1 - (x² + y²) * inv` is the exact same expression.
  const x2 = new Float64Array(w * meta.cols);
  const y2 = new Float64Array(h * meta.rows);
  for (let x = 0; x < w; x++) {
    const row = x * meta.cols;
    for (let c = 0; c < meta.cols; c++) {
      const ex = x - fx[c]!;
      x2[row + c] = ex * ex;
    }
  }
  for (let y = 0; y < h; y++) {
    const row = y * meta.rows;
    for (let r = 0; r < meta.rows; r++) {
      const ey = y - fy[r]!;
      y2[row + r] = ey * ey;
    }
  }

  const made = {
    w, h, span, inv, overlap, fx, fy, x2, y2,
  };
  byKey.set(key, made);
  return made;
}

/** Cell sums → toned, splatted float pixels. The residence's arithmetic at the
 *  wash's tone: a cell's share of the CORPUS total through 1 − e^(−k·share),
 *  spread by the J2-null kernel so the lattice's beat is suppressed.
 *
 * Geometry is cached because the court, kernel and device grid do not move
 * between days. Deposits remain cell-major and every Float32 write stays in the
 * original order; only repeated coordinate transforms and squaring leave the
 * day-crossing path.
 */
function emptyField(view: View, dpr: number): PixelField {
  const w = Math.max(1, Math.round(view.width * dpr));
  const h = Math.max(1, Math.round(view.height * dpr));
  return { px: new Float32Array(w * h), x0: w, y0: h, x1: 0, y1: 0 };
}

function depositCells(
  field: PixelField,
  cells: Float64Array,
  total: number,
  meta: WashMeta,
  view: View,
  dpr: number,
  from: number,
  to: number,
): void {
  const geom = washGeometry(meta, view, dpr);
  const { w, h, span, inv, overlap } = geom;
  const px = field.px;
  for (let c = from; c < Math.min(to, cells.length); c++) {
    const sum = cells[c]!;
    if (sum <= 0) continue;
    const a = (1 - Math.exp(-WASH_TONE_K * (sum / total))) / overlap;
    const col = c % meta.cols;
    const row = Math.floor(c / meta.cols);
    const bx = Math.round(geom.fx[col]!);
    const by = Math.round(geom.fy[row]!);
    field.x0 = Math.min(field.x0, Math.max(0, bx - span));
    field.y0 = Math.min(field.y0, Math.max(0, by - span));
    field.x1 = Math.max(field.x1, Math.min(w, bx + span + 1));
    field.y1 = Math.max(field.y1, Math.min(h, by + span + 1));
    const yy0 = Math.max(0, by - span);
    const yy1 = Math.min(h, by + span + 1);
    const xx0 = Math.max(0, bx - span);
    const xx1 = Math.min(w, bx + span + 1);
    for (let y = yy0; y < yy1; y++) {
      const pixelRow = y * w;
      const ey2 = geom.y2[y * meta.rows + row]!;
      for (let x = xx0; x < xx1; x++) {
        const wgt = 1 - (geom.x2[x * meta.cols + col]! + ey2) * inv;
        if (wgt <= 0) continue;
        const p = pixelRow + x;
        px[p] = px[p]! + a * wgt;
      }
    }
  }
}

function convert(
  cells: Float64Array,
  total: number,
  meta: WashMeta,
  view: View,
  dpr: number,
): PixelField {
  const field = emptyField(view, dpr);
  depositCells(field, cells, total, meta, view, dpr, 0, cells.length);
  return field;
}

const bone = BONE_RGB.split(",").map((s) => Number(s.trim()));

/** `Uint8ClampedArray`'s exact ToUint8Clamp, including ties-to-even. */
function clampByte(x: number): number {
  if (x <= 0) return 0;
  if (x >= 255) return 255;
  const lo = Math.floor(x);
  const d = x - lo;
  if (d < 0.5) return lo;
  if (d > 0.5) return lo + 1;
  return lo % 2 === 0 ? lo : lo + 1;
}

/** Float pixels → a canvas, bone always: the ground belongs to no zone. */
function toCanvas(field: PixelField, view: View, dpr: number): HTMLCanvasElement {
  const w = Math.max(1, Math.round(view.width * dpr));
  const h = Math.max(1, Math.round(view.height * dpr));
  const img = new ImageData(w, h);
  // The old loop wrote opaque black through the full viewport one channel at
  // a time even though the wash can only touch the fitted court.  Fill that
  // identical ground in native code, then visit only the device-pixel bounds
  // `convert` actually touched.  Packing a pixel is byte-identical to four
  // Uint8Clamped writes because `clampByte` implements their specified
  // ties-to-even conversion.
  const words = new Uint32Array(img.data.buffer);
  words.fill(0xff000000);
  for (let y = field.y0; y < field.y1; y++) {
    const row = y * w;
    for (let x = field.x0; x < field.x1; x++) {
      const p = row + x;
      const v = Math.min(1, field.px[p]!);
      const r = clampByte(bone[0]! * v);
      const g = clampByte(bone[1]! * v);
      const b = clampByte(bone[2]! * v);
      words[p] = (0xff000000 | r | (g << 8) | (b << 16)) >>> 0;
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.putImageData(img, 0, 0);
  return canvas;
}

function addDay(
  cells: Float64Array,
  wash: Wash,
  meta: WashMeta,
  day: number,
): void {
  const at = meta.days.indexOf(day);
  if (at < 0) return;
  const per = meta.rows * meta.cols;
  for (let i = 0; i < per; i++) cells[i] = cells[i]! + wash.data[at * per + i]!;
}

/** Begin the state after the day following the currently arriving one. */
function beginPreparation(
  lane: Lane,
  order: number[],
  wash: Wash,
  meta: WashMeta,
  view: View,
  dpr: number,
): void {
  if (lane.job || lane.prepared || !lane.nextPx) return;
  const arriving = order[lane.applied];
  const following = order[lane.applied + 1];
  if (arriving === undefined || following === undefined || lane.nextFor !== arriving) return;
  const target = new Float64Array(lane.acc);
  addDay(target, wash, meta, arriving);
  addDay(target, wash, meta, following);
  lane.job = {
    forDay: following,
    target,
    basePx: lane.nextPx,
    field: emptyField(view, dpr),
    cell: 0,
    stage: "deposit",
    deltaField: null,
    delta: null,
  };
}

function differenceField(
  next: PixelField,
  basePx: Float32Array,
  view: View,
  dpr: number,
): PixelField {
  const delta = emptyField(view, dpr);
  delta.x0 = next.x0;
  delta.y0 = next.y0;
  delta.x1 = next.x1;
  delta.y1 = next.y1;
  const w = Math.max(1, Math.round(view.width * dpr));
  for (let y = delta.y0; y < delta.y1; y++) {
    const row = y * w;
    for (let x = delta.x0; x < delta.x1; x++) {
      const p = row + x;
      delta.px[p] = Math.max(0, next.px[p]! - basePx[p]!);
    }
  }
  return delta;
}

/**
 * Pay one bounded piece of the next day's exact fold per rendered frame.
 * Typed-array accumulation is deterministic across these boundaries: cells
 * still deposit in one ascending sequence and no Canvas surface is extended.
 * Direct/backward seeks may fall back to `convert`; the resulting bytes are the
 * same, while ordinary forward playback never receives the all-at-once spike.
 */
function advancePreparation(
  lane: Lane,
  total: number,
  meta: WashMeta,
  view: View,
  dpr: number,
): void {
  const job = lane.job;
  if (!job) return;
  if (job.stage === "deposit") {
    const to = Math.min(job.target.length, job.cell + PREP_CELLS_PER_FRAME);
    depositCells(job.field, job.target, total, meta, view, dpr, job.cell, to);
    job.cell = to;
    if (job.cell >= job.target.length) job.stage = "delta-field";
    return;
  }
  if (job.stage === "delta-field") {
    job.deltaField = differenceField(job.field, job.basePx, view, dpr);
    job.stage = "delta-canvas";
    return;
  }
  if (job.stage === "delta-canvas") {
    job.delta = toCanvas(job.deltaField!, view, dpr);
    job.deltaField = null;
    job.stage = "front";
    return;
  }
  const front = toCanvas(job.field, view, dpr);
  lane.prepared = {
    forDay: job.forDay,
    front,
    px: job.field.px,
    delta: job.delta!,
  };
  lane.job = null;
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
    const field = convert(cells, total, meta, view, dpr);
    lane = {
      key,
      acc: cells,
      applied: 0,
      front: toCanvas(field, view, dpr),
      frontPx: field.px,
      delta: null,
      deltaFor: -1,
      nextFront: null,
      nextPx: null,
      nextFor: -1,
      prepared: null,
      job: null,
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
    const field = convert(acc, total, meta, view, dpr);
    lane = {
      key,
      acc,
      applied: 0,
      front: toCanvas(field, view, dpr),
      frontPx: field.px,
      delta: null,
      deltaFor: -1,
      nextFront: null,
      nextPx: null,
      nextFor: -1,
      prepared: null,
      job: null,
    };
    lanes.set(key, lane);
    evict(key);
  }
  // One bounded piece per frame. The initial direct/cold conversion above is
  // still synchronous; forward playback prepares every following day before
  // its boundary instead of paying the whole fold there.
  advancePreparation(lane, total, meta, view, dpr);

  // If the current arriving day was already converted (it is the destination
  // of the delta now on screen), promote those exact bytes at its boundary.
  while (lane.applied < wantApplied) {
    const day = order[lane.applied]!;
    if (lane.nextFor !== day || !lane.nextFront || !lane.nextPx) break;
    addDay(lane.acc, wash, meta, day);
    lane.applied++;
    lane.front = lane.nextFront;
    lane.frontPx = lane.nextPx;
    lane.nextFront = null;
    lane.nextPx = null;
    lane.nextFor = -1;
    lane.delta = null;
    lane.deltaFor = -1;

    const prepared = lane.prepared;
    const nowArriving = order[lane.applied];
    if (prepared && prepared.forDay === nowArriving) {
      lane.delta = prepared.delta;
      lane.deltaFor = prepared.forDay;
      lane.nextFront = prepared.front;
      lane.nextPx = prepared.px;
      lane.nextFor = prepared.forDay;
      lane.prepared = null;
      beginPreparation(lane, order, wash, meta, view, dpr);
    }
  }
  // Catch up in CELL SPACE first, then convert ONCE: during a multi-day
  // catch-up (a cold jump, a backward rebuild) the intermediate fronts are
  // never blitted, and converting per applied day was measured at ~7 s for a
  // deep-season jump. One conversion of the final accumulator is the same
  // arithmetic and the same pixels.
  if (lane.applied < wantApplied) {
    while (lane.applied < wantApplied) {
      const day = order[lane.applied]!;
      addDay(lane.acc, wash, meta, day);
      lane.applied++;
    }
    const field = convert(lane.acc, total, meta, view, dpr);
    lane.front = toCanvas(field, view, dpr);
    lane.frontPx = field.px;
    lane.delta = null;
    lane.deltaFor = -1;
    lane.nextFront = null;
    lane.nextPx = null;
    lane.nextFor = -1;
    lane.prepared = null;
    lane.job = null;
  }

  blitLighter(ctx, lane.front, view, alpha * WASH_ALPHA);

  // The arriving day, rising over the ground. Dead day or the seed: nothing —
  // the frame is the ground, byte-identical at any speed.
  const frac = Math.max(0, dayFrac) - lo;
  const arriving = order[wantApplied];
  if (arriving === undefined || arriving !== lo || frac <= 0) return;
  if (lane.deltaFor !== lo) {
    const next = new Float64Array(lane.acc);
    addDay(next, wash, meta, lo);
    const nextField = convert(next, total, meta, view, dpr);
    const delta = differenceField(nextField, lane.frontPx, view, dpr);
    lane.delta = toCanvas(delta, view, dpr);
    lane.deltaFor = lo;
    lane.nextFront = toCanvas(nextField, view, dpr);
    lane.nextPx = nextField.px;
    lane.nextFor = lo;
    lane.prepared = null;
    lane.job = null;
    beginPreparation(lane, order, wash, meta, view, dpr);
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
