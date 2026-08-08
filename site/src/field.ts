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
 * *develops* rather than fills in: arrival is the layer's opacity. That is why
 * scrubbing backwards needs no rebake, and why none of this holds frame state.
 */

import { BONE_RGB, ZONE_RGB } from "./palette";
import { COURT, type View } from "./plate";
import {
  FALLOFF_DISC_INTEGRAL,
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
 */
function tone(share: number): number {
  return TONE_CEILING * (1 - Math.exp(-TONE_K * share));
}

export interface Layer {
  canvas: HTMLCanvasElement;
  key: string;
}

const layers = new Map<string, Layer>();

function layerKey(year: number, coloured: boolean, view: View, dpr: number): string {
  return `${year}|${coloured ? "zone" : "bone"}|${Math.round(view.width)}x${Math.round(view.height)}|${dpr}`;
}

/**
 * Resolve a season's cells into an image.
 *
 * The origin is skipped: those are the shots the record declined to place, and
 * they are drawn as the pin — a solid mark that occludes, not an additive one.
 * Baking them here would both blow the plate out and quietly turn the piece's
 * clearest statement of absence into a bright smear.
 */
export function bakeLayer(
  year: number,
  pts: Points,
  coloured: boolean,
  view: View,
  dpr: number,
): Layer {
  const key = layerKey(year, coloured, view, dpr);
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

  for (let i = 0; i < pts.n; i++) {
    const cx = pts.x[i]!;
    const cy = pts.y[i]!;
    if (cx === 0 && cy === 0) continue;
    const count = pts.hires[i]! + pts.rest[i]!;
    if (count === 0) continue;

    const a = tone(count / pts.total) / overlap;
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
  // Only the current and previous season are ever live, in at most two
  // palettes; anything older is a resize or a season we have left behind.
  if (layers.size > 6) {
    const oldest = layers.keys().next().value;
    if (oldest !== undefined && oldest !== key) layers.delete(oldest);
  }
  return layer;
}

export function clearLayers(): void {
  layers.clear();
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
