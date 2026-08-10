/** Every shot, baked.
 *
 * A season is hundreds of thousands of attempts — `seasons.json:attempts` says
 * how many, and it is not this file's business to remember. They cannot be
 * drawn one at a time, and drawing them additively would not even be honest: at
 * conserved ink each mark's peak contribution is a small fraction of one 8-bit
 * level, so most marks would round to nothing and the survivors would round up.
 * "Ink is conserved" cannot be true in an 8-bit accumulator.
 *
 * So the summation happens in the pipeline instead, as exact integers, and
 * arrives here as a count per coordinate. Each cell is resolved once into a
 * float buffer, tone-mapped, and written as a single image. Nothing is
 * accumulated in 8 bits anywhere.
 *
 * The layer is complete regardless of where the playhead is, because a season
 * *develops* rather than fills in: arrival is the position in a ladder of
 * exposure states — the same tone curve at scaled strength, the last state
 * exactly the measured constants — so the rim flare surfaces first out of the
 * dark and the faintest texture arrives last, like a print in a tray. Every
 * state is a pure function of its key, which is why scrubbing backwards needs
 * no rebake beyond a cache miss, and why none of this holds frame state.
 */

import { BONE_RGB, ZONE_RGB } from "./palette";
import { COURT, type View } from "./plate";
import {
  DEVELOP_STATES,
  DEVELOP_STEP,
  FALLOFF_DISC_INTEGRAL,
  RESIDENCE_TONE_K,
  SPLAT_MIN_PX,
  SPLAT_SPACING_K,
  TONE_CEILING,
  TONE_K,
} from "./scalars";

/** Bytes per record in points/season_YYYY.bin — must match POINT_DTYPE. */
const REC = 14;

export interface Points {
  n: number;
  x: Int16Array;
  y: Int16Array;
  hires: Uint32Array;
  rest: Uint32Array;
  zone: Uint8Array;
  /** Every shot in the season's halfcourt, summed from the cells. */
  total: number;
}

export function decodePoints(buf: ArrayBuffer): Points {
  const n = Math.floor(buf.byteLength / REC);
  const dv = new DataView(buf);
  const x = new Int16Array(n);
  const y = new Int16Array(n);
  const hires = new Uint32Array(n);
  const rest = new Uint32Array(n);
  const zone = new Uint8Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const o = i * REC;
    x[i] = dv.getInt16(o, true);
    y[i] = dv.getInt16(o + 2, true);
    const h = dv.getUint32(o + 4, true);
    const r = dv.getUint32(o + 8, true);
    hires[i] = h;
    rest[i] = r;
    zone[i] = dv.getUint8(o + 12);
    total += h + r;
  }
  return { n, x, y, hires, rest, zone, total };
}

/**
 * One tone curve for every season.
 *
 * Counts are first divided by the season's own total, so brightness reads as a
 * shot's SHARE of its season and the distributions stay comparable — which is
 * also what "short seasons are short, not sparse" requires, the lockout years
 * holding barely half the attempts of the ones around them
 * (`seasons.json:attempts`).
 *
 * The curve itself is then fixed. Per-season auto-normalisation would falsely
 * equalise the seasons, and this piece does not do that. It is compressive
 * because the dynamic range is enormous — the densest single coordinate in a
 * season holds hundreds of shots while the median holds a handful — and because
 * photographic density response is compressive, which is the idiom the plate
 * already speaks.
 *
 * TONE_K and TONE_CEILING are declared in src/scalars.ts with what each one
 * controls; nothing material is written here.
 *
 * `strength` scales the curve's slope for THE DEVELOPMENT's under-exposed
 * states. At 1 the expression reduces to exactly the measured curve — the
 * multiplication by 1 is exact in IEEE arithmetic, so a fully developed layer
 * is byte-identical to the bake the constants define. Below 1 the curve is the
 * same shape under-exposed: compression means a dense cell keeps most of its
 * brightness while a faint one sinks toward black, which is why an early state
 * is the rim flare surfacing out of the dark rather than a dimmer photograph.
 */
function tone(share: number, strength: number): number {
  return TONE_CEILING * (1 - Math.exp(-TONE_K * strength * share));
}

/**
 * The exposure ladder: state `i` of 1..DEVELOP_STATES, each DEVELOP_STEP below
 * the next, the last exactly 1 — stated explicitly rather than through
 * Math.pow so the endpoint's byte-identity rests on nothing but the branch.
 */
function exposureStrength(state: number): number {
  return state >= DEVELOP_STATES ? 1 : Math.pow(DEVELOP_STEP, state - DEVELOP_STATES);
}

export interface Layer {
  canvas: HTMLCanvasElement;
  key: string;
}

const layers = new Map<string, Layer>();

function layerKey(
  year: number,
  coloured: boolean,
  view: View,
  dpr: number,
  pin: [number, number] | null,
  strength: number,
): string {
  // The pin's coordinate is a pure function of the year, so it could be left
  // out — and it is in the key anyway, because rule 5 asks that a key carry
  // everything affecting its pixels rather than everything that happens to
  // vary. It adds no cache entries. `strength` is the exposure state and DOES
  // add entries: each state is a different image of the same season.
  return `${year}|${coloured ? "zone" : "bone"}|${Math.round(view.width)}x${Math.round(view.height)}|${dpr}|${pin ? pin.join(",") : "none"}|s${strength}`;
}

/**
 * Resolve a season's cells into an image.
 *
 * The pin's cell is skipped: those are the shots the record declined to place,
 * and they are drawn as the pin — a solid mark that occludes, not an additive
 * one. Baking them here would both blow the plate out and quietly turn the
 * piece's clearest statement of absence into a bright smear.
 *
 * THE SKIP WAS HARDCODED TO (0,0) UNTIL 2026-08-09, and that is exactly what it
 * looked like: in the six seasons whose `resolution.rim_sentinel` is not at the
 * origin, the largest cell in `points/*.bin` IS the sentinel — it leads the
 * runner-up by `rim_sentinel.lead_ratio`, far enough to saturate the tone curve
 * — while the origin holds no record at all. So the skip skipped nothing, and
 * the refusal baked as one blown-out dot beside a pin standing for nothing.
 */
export function bakeLayer(
  year: number,
  pts: Points,
  coloured: boolean,
  view: View,
  dpr: number,
  pin: [number, number] | null,
  strength = 1,
): Layer {
  const key = layerKey(year, coloured, view, dpr, pin, strength);
  const hit = layers.get(key);
  if (hit) return hit;

  const w = Math.max(1, Math.round(view.width * dpr));
  const h = Math.max(1, Math.round(view.height * dpr));

  // Accumulate in float, never in 8-bit. A cell's alpha is a fraction of one
  // channel level for all but the densest coordinates, so summing into an
  // ImageData directly rounds almost every shot in the record away to nothing -
  // which is exactly the failure this whole approach exists to avoid.
  const acc = new Float32Array(w * h * 3);

  const bone = BONE_RGB.split(",").map((s) => Number(s.trim()));
  const zoneRGB = ZONE_RGB.map((s) => s.split(",").map((v) => Number(v.trim())));

  // Adjacent coordinates are a tenth of a foot apart, which is a few pixels.
  // Writing each as an axis-aligned square at a rounded position makes the
  // lattice beat against the pixel grid and the whole field turns into a
  // mechanical dot-screen - an artefact of the renderer, not a property of the
  // record. Each cell is instead splatted at its true fractional position with
  // a soft falloff just wide enough that neighbours meet.
  // Wide enough that occupied coordinates merge. Only a fraction of the lattice
  // is occupied in a season, so a tight splat renders the record's grid rather
  // than its density - true, but it reads as a halftone screen instead of the
  // photographic field the plate is composed in.
  const spacing = view.s(1) * dpr;
  const radius = Math.max(SPLAT_MIN_PX, spacing * SPLAT_SPACING_K);
  const span = Math.ceil(radius);
  const inv = 1 / (radius * radius);
  // A wider splat lands on more pixels and would simply make the plate
  // brighter. Dividing by the splat's own overlap - the integral of the falloff
  // over the lattice - keeps a coordinate's density the thing that sets its
  // brightness, so `radius` controls smoothness only and nothing else changes
  // when it is tuned. FALLOFF_DISC_INTEGRAL is that integral and is derived
  // from the falloff below, not chosen; see src/scalars.ts.
  const overlap = Math.max(
    1,
    (Math.PI * radius * radius * FALLOFF_DISC_INTEGRAL) / (spacing * spacing),
  );

  const [pinX, pinY] = pin ?? [NaN, NaN];
  for (let i = 0; i < pts.n; i++) {
    const cx = pts.x[i]!;
    const cy = pts.y[i]!;
    if (cx === pinX && cy === pinY) continue;
    const count = pts.hires[i]! + pts.rest[i]!;
    if (count === 0) continue;

    const a = tone(count / pts.total, strength) / overlap;
    const rgb = coloured ? (zoneRGB[pts.zone[i]!] ?? bone) : bone;
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
        // Peak-1 falloff, so a dense coordinate reaches its own alpha and
        // neighbours add where they overlap.
        const wgt = 1 - (ex * ex + ey * ey) * inv;
        if (wgt <= 0) continue;
        const v = a * wgt;
        const o = (yy * w + xx) * 3;
        acc[o] = acc[o]! + rgb[0]! * v;
        acc[o + 1] = acc[o + 1]! + rgb[1]! * v;
        acc[o + 2] = acc[o + 2]! + rgb[2]! * v;
      }
    }
  }

  const img = new ImageData(w, h);
  const data = img.data;
  const px = w * h;
  for (let p = 0, o = 0, q = 0; p < px; p++, o += 4, q += 3) {
    data[o] = acc[q] as number;
    data[o + 1] = acc[q + 1] as number;
    data[o + 2] = acc[q + 2] as number;
    data[o + 3] = 255;
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.putImageData(img, 0, 0);

  const layer: Layer = { canvas, key };
  layers.set(key, layer);
  // The live set, derived rather than guessed: at most the current and the
  // previous season are drawn (2), each at up to DEVELOP_STATES exposure
  // states as the ladder sweeps through them, in at most two palettes (bone
  // for THE PLATE and the text hands, zone for THE FIELD) — so a full
  // rotation's working set is 2 seasons x DEVELOP_STATES states x 2 palettes.
  // Sized to hold all of it so neither the ladder revisiting a state nor the
  // rotation switching palettes evicts a layer that is still in play; the
  // cost is memory, and it is the deliberate side of the trade.
  if (layers.size > 2 * 2 * DEVELOP_STATES) {
    const oldest = layers.keys().next().value;
    if (oldest !== undefined && oldest !== key) layers.delete(oldest);
  }
  return layer;
}

/**
 * THE DEVELOPMENT: draw a season at a position in its exposure ladder.
 *
 * `position` runs 0..DEVELOP_STATES. Segment 0 lifts the first state out of
 * black; every later segment crossfades two ADJACENT states, weights linear in
 * the position — and because the tone curve is monotone in its strength, the
 * upper state is pixel-wise at least the lower one, so the additive crossfade
 * is a monotone deepening with no brightness pumping at the midpoints. At
 * position DEVELOP_STATES exactly, the lower term's weight is 0 (skipped by
 * drawLayer's cutoff) and the top state draws alone at `dim` — byte-identical
 * to the single finished-layer blit this path replaced.
 *
 * The states are baked lazily through `bake`, so a frame only pays for the one
 * or two states it actually composites. A pure function of its arguments:
 * nothing here reads a clock or remembers a frame.
 */
export function drawDeveloping(
  ctx: CanvasRenderingContext2D,
  view: View,
  position: number,
  dim: number,
  bake: (strength: number) => Layer,
): void {
  const p = Math.min(DEVELOP_STATES, Math.max(0, position));
  if (p <= 0 || dim <= 0.002) return;
  const upper = Math.min(DEVELOP_STATES, Math.floor(p) + 1);
  const frac = p - (upper - 1);
  if (upper > 1) {
    drawLayer(ctx, bake(exposureStrength(upper - 1)), view, (1 - frac) * dim);
  }
  drawLayer(ctx, bake(exposureStrength(upper)), view, frac * dim);
}

export function clearLayers(): void {
  layers.clear();
  residence = null;
}

/**
 * THE RESIDENCE — where the ball LIVED, under where the shots ENDED.
 *
 * `window.json:occupancy.grid` holds every parsed ball frame of the window's
 * corpus on one-foot cells; `frames_total` is the population a cell's share is
 * read against. The shot record is an account of endings, and for the one act
 * whose feed survives, this layer carries the between: the mid-range, emptying
 * of endings, is seen to be a place the game never left. Both independent
 * display audits named this artifact the most deserving unshown material and
 * proposed this placement.
 *
 * Same discipline as `bakeLayer`: float accumulation, one `putImageData`,
 * cached under a key carrying everything that affects its pixels, cleared by
 * `clearLayers` (which `probe/shared.ts:cold()` already calls — an
 * unregistered cache would read as a false PURE, not a false failure). Bone,
 * always: the ball belongs to no zone. The grid's cells splat with the same
 * `SPLAT_SPACING_K` as the shot lattice — the J2 null is a function of K
 * alone, so it suppresses this lattice's beat exactly as it does the record's.
 * Nothing here reads `t`; the beat envelope lives at the draw call.
 */

/** Court tenths per occupancy cell: pipeline/window.py grids ball frames on
 *  tenths floor-divided into one-foot bins, so a cell's centre sits half a
 *  cell past its index. The artifact's own grain, like `REC` above. */
const CELL_TENTHS = 10;

let residence: Layer | null = null;

export interface Occupancy {
  grid: Record<string, number>;
  frames_total: number;
}

export function bakeResidence(occ: Occupancy, view: View, dpr: number): Layer {
  const key = `residence|${Math.round(view.width)}x${Math.round(view.height)}|${dpr}`;
  if (residence && residence.key === key) return residence;

  const w = Math.max(1, Math.round(view.width * dpr));
  const h = Math.max(1, Math.round(view.height * dpr));
  const acc = new Float32Array(w * h * 3);
  const bone = BONE_RGB.split(",").map((s) => Number(s.trim()));

  const spacing = view.s(CELL_TENTHS) * dpr;
  const radius = Math.max(SPLAT_MIN_PX, spacing * SPLAT_SPACING_K);
  const span = Math.ceil(radius);
  const inv = 1 / (radius * radius);
  const overlap = Math.max(
    1,
    (Math.PI * radius * radius * FALLOFF_DISC_INTEGRAL) / (spacing * spacing),
  );

  for (const [cell, frames] of Object.entries(occ.grid)) {
    const comma = cell.indexOf(",");
    const cx = Number(cell.slice(0, comma)) * CELL_TENTHS + CELL_TENTHS / 2;
    const cy = Number(cell.slice(comma + 1)) * CELL_TENTHS + CELL_TENTHS / 2;
    // A cell's share of the ball's measured time, through its own compressive
    // curve — the field's idiom, at the residence's own grain.
    const a = (1 - Math.exp(-RESIDENCE_TONE_K * (frames / occ.frames_total))) / overlap;
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
        const v = a * wgt;
        const o = (yy * w + xx) * 3;
        acc[o] = acc[o]! + bone[0]! * v;
        acc[o + 1] = acc[o + 1]! + bone[1]! * v;
        acc[o + 2] = acc[o + 2]! + bone[2]! * v;
      }
    }
  }

  const img = new ImageData(w, h);
  const data = img.data;
  const px = w * h;
  for (let p = 0, o = 0, q = 0; p < px; p++, o += 4, q += 3) {
    data[o] = acc[q] as number;
    data[o + 1] = acc[q + 1] as number;
    data[o + 2] = acc[q + 2] as number;
    data[o + 3] = 255;
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.putImageData(img, 0, 0);

  residence = { canvas, key };
  return residence;
}

/**
 * The season coming up, like a print in a tray.
 *
 * Arrival is opacity, not population, so the layer never has to be rebuilt as
 * the playhead moves — including backwards.
 */
export function developed(arrived: number): number {
  const a = Math.min(1, Math.max(0, arrived));
  return a * a * (3 - 2 * a);
}

/** Blit with `lighter`: source-over would matte out the inscriptions the marks
 *  are supposed to settle over, inverting the "cut into the plate" reading. */
export function drawLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  view: View,
  alpha: number,
): void {
  if (alpha <= 0.002) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(layer.canvas, 0, 0, view.width, view.height);
  ctx.restore();
}

/** Guard: the court box the pipeline clips to, so a stray coordinate is caught
 *  rather than silently drawn off-plate. */
export function withinCourt(x: number, y: number): boolean {
  return x >= COURT.x0 && x <= COURT.x1 && y >= COURT.y0 && y <= COURT.y1;
}
