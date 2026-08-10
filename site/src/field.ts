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
  REVEAL_CURVE,
  REVEAL_STEPS,
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

/** Bytes per record in points_by_day/season_YYYY.bin — must match DAY_POINT_DTYPE. */
const DAY_REC = 11;

/** The window season's calendar: one count delta per (day, coordinate), filed
 *  day-ascending with the reveal's own emphasis rule inside each day. Days sum
 *  per coordinate to that season's points/season_YYYY.bin exactly (gated in
 *  qa.py); the renderer trusts that identity and never re-derives it. */
export interface DayPoints {
  n: number;
  day: Uint16Array;
  x: Int16Array;
  y: Int16Array;
  count: Uint32Array;
  zone: Uint8Array;
  /** Every shot in the season's halfcourt, summed from the records. */
  total: number;
}

export function decodePointsByDay(buf: ArrayBuffer): DayPoints {
  const n = Math.floor(buf.byteLength / DAY_REC);
  const dv = new DataView(buf);
  const day = new Uint16Array(n);
  const x = new Int16Array(n);
  const y = new Int16Array(n);
  const count = new Uint32Array(n);
  const zone = new Uint8Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const o = i * DAY_REC;
    day[i] = dv.getUint16(o, true);
    x[i] = dv.getInt16(o + 2, true);
    y[i] = dv.getInt16(o + 4, true);
    const c = dv.getUint32(o + 6, true);
    count[i] = c;
    zone[i] = dv.getUint8(o + 10);
    total += c;
  }
  return { n, day, x, y, count, zone, total };
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

/**
 * The splat's geometry, derived once per bake — one derivation for the whole
 * field and the reveal both, so the two paths cannot disagree about what a
 * cell's ink looks like on the plate.
 *
 * Adjacent coordinates are a tenth of a foot apart, which is a few pixels.
 * Writing each as an axis-aligned square at a rounded position makes the
 * lattice beat against the pixel grid and the whole field turns into a
 * mechanical dot-screen - an artefact of the renderer, not a property of the
 * record. Each cell is instead splatted at its true fractional position with
 * a soft falloff just wide enough that neighbours meet — wide enough that
 * occupied coordinates merge, because only a fraction of the lattice is
 * occupied in a season and a tight splat renders the record's grid rather
 * than its density.
 *
 * A wider splat lands on more pixels and would simply make the plate
 * brighter. Dividing by the splat's own overlap - the integral of the falloff
 * over the lattice - keeps a coordinate's density the thing that sets its
 * brightness, so `radius` controls smoothness only and nothing else changes
 * when it is tuned. FALLOFF_DISC_INTEGRAL is that integral and is derived
 * from the falloff below, not chosen; see src/scalars.ts.
 */
interface Splat {
  span: number;
  inv: number;
  overlap: number;
}

function splatOf(view: View, dpr: number): Splat {
  const spacing = view.s(1) * dpr;
  const radius = Math.max(SPLAT_MIN_PX, spacing * SPLAT_SPACING_K);
  return {
    span: Math.ceil(radius),
    inv: 1 / (radius * radius),
    overlap: Math.max(
      1,
      (Math.PI * radius * radius * FALLOFF_DISC_INTEGRAL) / (spacing * spacing),
    ),
  };
}

/** One cell's ink into the float accumulator — `a` is the cell's tone already
 *  divided by the splat overlap, so this is pure deposition. The same function
 *  the whole-season bake and the per-mark reveal both call: the fold over
 *  cells is linear, so a prefix folded here IS the corresponding prefix of the
 *  finished bake, which is the reveal's fidelity guarantee.
 *
 *  `img`, when given, mirrors every touched pixel into 8-bit as it lands —
 *  the reveal's quantization, kept INSIDE the splat so a reveal step pays for
 *  the pixels its batch touches rather than a full-frame conversion (measured
 *  this session: the full-frame path put a step's cost at 2-4x the frame
 *  budget; this path fits). The mirror is idempotent — the last write to a
 *  pixel is the clamp of its final accumulated value, the exact assignment
 *  `quantize` would make — so mirroring during the fold and converting after
 *  it produce the same bytes. The mirror also stamps the pixel opaque: under
 *  `lighter` a transparent pixel and an opaque black one contribute the same
 *  nothing, so a mirrored surface may start as transparent black — one native
 *  fill — instead of paying a per-pixel alpha pass (measured this session:
 *  that pass was most of a delta refold's cost). For the reveal's persistent
 *  img, whose alpha is already opaque, the write re-stamps the byte it
 *  already holds. */
function splatCell(
  acc: Float32Array,
  w: number,
  h: number,
  view: View,
  dpr: number,
  sp: Splat,
  cx: number,
  cy: number,
  a: number,
  rgb: number[],
  img: Uint8ClampedArray | null = null,
): void {
  const fx = view.sx(cx) * dpr;
  const fy = view.sy(cy) * dpr;
  const bx = Math.round(fx);
  const by = Math.round(fy);

  for (let dy = -sp.span; dy <= sp.span; dy++) {
    const yy = by + dy;
    if (yy < 0 || yy >= h) continue;
    const ey = yy - fy;
    for (let dx = -sp.span; dx <= sp.span; dx++) {
      const xx = bx + dx;
      if (xx < 0 || xx >= w) continue;
      const ex = xx - fx;
      // Peak-1 falloff, so a dense coordinate reaches its own alpha and
      // neighbours add where they overlap.
      const wgt = 1 - (ex * ex + ey * ey) * sp.inv;
      if (wgt <= 0) continue;
      const v = a * wgt;
      const o = (yy * w + xx) * 3;
      acc[o] = acc[o]! + rgb[0]! * v;
      acc[o + 1] = acc[o + 1]! + rgb[1]! * v;
      acc[o + 2] = acc[o + 2]! + rgb[2]! * v;
      if (img) {
        const q = (yy * w + xx) * 4;
        img[q] = acc[o] as number;
        img[q + 1] = acc[o + 1] as number;
        img[q + 2] = acc[o + 2] as number;
        img[q + 3] = 255;
      }
    }
  }
}

/**
 * Scratch for the bakes — reused, not reallocated, and that is a measured GC
 * repair, not an optimisation taste: each bake used to allocate a ~44 MB
 * float accumulator and a ~15 MB ImageData and drop both, and the major GC
 * collecting them landed as a frame several times the budget in the middle
 * of a season (measured this session at census@after-the-cut, with the pause
 * moving between runs — the classic signature). Both buffers are fully
 * overwritten
 * before every read — the accumulator by `fill(0)` and the fold, the image by
 * the quantize loop writing every pixel — so no byte survives from one bake
 * to the next and the output stays a pure function of the bake's inputs.
 * `clearLayers` drops them; holding them is the memory side of the trade the
 * layer cache already accepts.
 */
let scratchAcc: Float32Array | null = null;
let scratchImg: ImageData | null = null;

function accOf(len: number): Float32Array {
  if (!scratchAcc || scratchAcc.length !== len) scratchAcc = new Float32Array(len);
  else scratchAcc.fill(0);
  return scratchAcc;
}

/** Quantize a float accumulation once, onto a fresh canvas — the single point
 *  where the field becomes 8-bit. Every surface this produces is written in
 *  one `putImageData` burst and never drawn on again (the prefix.ts
 *  discipline; the bytes are a pure function of `acc`). */
function quantize(acc: Float32Array, w: number, h: number): HTMLCanvasElement {
  const img = scratchImg && scratchImg.width === w && scratchImg.height === h
    ? scratchImg
    : (scratchImg = new ImageData(w, h));
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
  return canvas;
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
  const acc = accOf(w * h * 3);

  const bone = BONE_RGB.split(",").map((s) => Number(s.trim()));
  const zoneRGB = ZONE_RGB.map((s) => s.split(",").map((v) => Number(v.trim())));
  const sp = splatOf(view, dpr);

  const [pinX, pinY] = pin ?? [NaN, NaN];
  for (let i = 0; i < pts.n; i++) {
    const cx = pts.x[i]!;
    const cy = pts.y[i]!;
    if (cx === pinX && cy === pinY) continue;
    const count = pts.hires[i]! + pts.rest[i]!;
    if (count === 0) continue;

    const a = tone(count / pts.total, strength) / sp.overlap;
    const rgb = coloured ? (zoneRGB[pts.zone[i]!] ?? bone) : bone;
    splatCell(acc, w, h, view, dpr, sp, cx, cy, a, rgb);
  }

  const layer: Layer = { canvas: quantize(acc, w, h), key };
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
  // The lower state is skipped exactly when its weight is zero — `frac` is 1
  // only at the ladder's top, where the finished state draws alone. drawLayer
  // would skip the blit anyway, so no pixel depends on this; what it stops is
  // the zero-weight ARGUMENT cold-baking a state nobody ever draws (measured
  // this session: a full-plate bake on the first tail frame, at alpha 0). An
  // alpha-threshold guard was tried here and reverted: it deferred REAL bakes
  // from a hand's first frame to the first frame their alpha cleared the
  // blit's own floor, which moved the cost from a season's opening — where
  // cold work belongs — to its middle.
  if (upper > 1 && frac < 1) {
    drawLayer(ctx, bake(exposureStrength(upper - 1)), view, (1 - frac) * dim);
  }
  drawLayer(ctx, bake(exposureStrength(upper)), view, frac * dim);
}

/**
 * THE PER-MARK ARRIVAL (session 9, stage B of the artist's arrival repair).
 *
 * During arrival a season's cells no longer surface as one developing image —
 * they ARRIVE, each at its full measured tone, in THE RECORD'S OWN EMPHASIS
 * ORDER: descending filed count, the most-filed coordinate first (artist
 * ruling, 2026-08-09 — explicitly not THE HAND's declared scatter). Ties —
 * equal counts — break by a stated deterministic rule: nearest the rim first
 * (x² + y², exact in integers), then y, then x; coordinates are unique per
 * cell, so the order is total and stable. The pin's cell and empty cells are
 * excluded up front: the pin occludes rather than adds, and in the sentinel
 * seasons it is the largest cell, so leaving it in would make the arrival's
 * first strike a mark that never draws.
 *
 * `points/*.bin` holds no time. This order claims nothing chronological — it
 * is the record's emphasis, not its calendar. The order is MEASURED; only the
 * pace (REVEAL_STEPS, REVEAL_CURVE in the register) is composition.
 *
 * THE ACCUMULATOR IS ADVANCED IN PLACE, AND THAT IS SOUND WHERE THE CANVAS
 * VERSION (prefix.ts, F-04) WAS NOT: the fold is pure JS float arithmetic.
 * Per pixel, the sequence of additions is the emphasis order itself, identical
 * whether a prefix arrives in one call or across many — IEEE addition is
 * deterministic and no rasteriser touches the numbers until `quantize`, which
 * writes fully-computed pixels onto a FRESH canvas in one `putImageData`
 * burst. So forward-advance and rebuild-from-zero produce the same bytes, and
 * scrubbing backwards REBUILDS from zero — the fold has no inverse, and there
 * is no path by which a surface carries cells the requested prefix does not
 * contain. The cache is cleared by `clearLayers`, which `cold()` calls.
 */

interface RevealOrder {
  pinKey: string;
  order: Int32Array;
}

const revealOrders = new WeakMap<Points, RevealOrder>();

function revealOrder(pts: Points, pin: [number, number] | null): Int32Array {
  const pinKey = pin ? pin.join(",") : "none";
  const have = revealOrders.get(pts);
  if (have && have.pinKey === pinKey) return have.order;

  const [pinX, pinY] = pin ?? [NaN, NaN];
  const idx: number[] = [];
  for (let i = 0; i < pts.n; i++) {
    if (pts.x[i]! === pinX && pts.y[i]! === pinY) continue;
    if (pts.hires[i]! + pts.rest[i]! === 0) continue;
    idx.push(i);
  }
  idx.sort((a, b) => {
    const ca = pts.hires[a]! + pts.rest[a]!;
    const cb = pts.hires[b]! + pts.rest[b]!;
    if (ca !== cb) return cb - ca;
    const da = pts.x[a]! * pts.x[a]! + pts.y[a]! * pts.y[a]!;
    const db = pts.x[b]! * pts.x[b]! + pts.y[b]! * pts.y[b]!;
    if (da !== db) return da - db;
    if (pts.y[a]! !== pts.y[b]!) return pts.y[a]! - pts.y[b]!;
    return pts.x[a]! - pts.x[b]!;
  });

  const built: RevealOrder = { pinKey, order: Int32Array.from(idx) };
  revealOrders.set(pts, built);
  return built.order;
}

/** A season's arrival in flight: the float fold of the emphasis order's first
 *  `cells` cells, its 8-bit mirror, and the one canvas that carries them.
 *
 *  THE CANVAS IS PERSISTENT AND WRITTEN ONLY BY `putImageData`, and that is
 *  why reusing it does not reopen F-04. What prefix.ts measured was
 *  RASTERISED drawing — vector fills and `drawImage` composites, whose bytes
 *  the browser may produce differently as a canvas's backing moves between
 *  paths. `putImageData` is not rasterisation: it replaces every pixel of the
 *  written rect with exactly the bytes of `img`, and `img` is a pure function
 *  of the prefix (the idempotent mirror in `splatCell`, same clamp `quantize`
 *  makes). So the canvas's content after any history of advances equals its
 *  content after one cold rebuild to the same prefix — the invariant the
 *  purity probe's four histories test directly at the mid-arrival beats. */
interface Reveal {
  key: string;
  cells: number;
  acc: Float32Array;
  img: ImageData;
  canvas: HTMLCanvasElement;
  layer: Layer | null;
  w: number;
  h: number;
}

const reveals = new Map<string, Reveal>();

function revealLayer(
  year: number,
  pts: Points,
  coloured: boolean,
  view: View,
  dpr: number,
  pin: [number, number] | null,
  prefix: number,
): Layer {
  // Everything that affects the pixels except the prefix, which advances.
  const key = `reveal|${year}|${coloured ? "zone" : "bone"}|${Math.round(view.width)}x${Math.round(view.height)}|${dpr}|${pin ? pin.join(",") : "none"}`;
  const w = Math.max(1, Math.round(view.width * dpr));
  const h = Math.max(1, Math.round(view.height * dpr));

  let r = reveals.get(key);
  if (r && (r.w !== w || r.h !== h)) r = undefined;
  // Going backwards REBUILDS: zero the fold and its mirror, keep the buffers.
  // Same rule as prefix.ts, same reason — the fold has no inverse.
  if (r && r.cells > prefix) {
    r.cells = 0;
    r.layer = null;
    r.acc.fill(0);
    r.img.data.fill(0);
    for (let p = 3; p < r.img.data.length; p += 4) r.img.data[p] = 255;
  }
  if (!r) {
    const img = new ImageData(w, h);
    for (let p = 3; p < img.data.length; p += 4) img.data[p] = 255;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    r = { key, cells: 0, acc: new Float32Array(w * h * 3), img, canvas, layer: null, w, h };
  }

  if (r.cells < prefix || r.layer === null) {
    const order = revealOrder(pts, pin);
    const bone = BONE_RGB.split(",").map((s) => Number(s.trim()));
    const zoneRGB = ZONE_RGB.map((s) => s.split(",").map((v) => Number(v.trim())));
    const sp = splatOf(view, dpr);
    for (let j = r.cells; j < prefix; j++) {
      const i = order[j]!;
      const count = pts.hires[i]! + pts.rest[i]!;
      // Full tone: a mark that has arrived is the finished bake's mark — the
      // development IS the population filling in, dense first.
      const a = tone(count / pts.total, 1) / sp.overlap;
      const rgb = coloured ? (zoneRGB[pts.zone[i]!] ?? bone) : bone;
      splatCell(r.acc, w, h, view, dpr, sp, pts.x[i]!, pts.y[i]!, a, rgb, r.img.data);
    }
    r.cells = prefix;
    r.canvas.getContext("2d")!.putImageData(r.img, 0, 0);
    r.layer = { canvas: r.canvas, key: `${key}|c${prefix}` };
  }

  reveals.set(key, r);
  // The live set, derived: only the ARRIVING season reveals, in at most two
  // palettes (bone for THE PLATE, zone for THE FIELD). An evicted entry costs
  // a rebuild — time, never bytes.
  if (reveals.size > 2) {
    const oldest = reveals.keys().next().value;
    if (oldest !== undefined && oldest !== key) reveals.delete(oldest);
  }
  return r.layer;
}

/** THE CROSSFADE (session 13, by the artist's ruling — the session-9 packet's
 *  named rival, now taken): a batch no longer strikes at its full tone on a
 *  floor crossing; it RISES over its interval. The arriving batch is its own
 *  delta layer — the bake is linear in cells, so
 *  `layer(prefix_{s+1}) = layer(prefix_s) + layer(batch_s)` in float exactly —
 *  drawn above the folded base at an alpha that is the LINEAR fractional part
 *  of the same reveal envelope. No new authored scalar: the ramp is the
 *  fraction the floor already discarded.
 *
 *  One persistent entry per (season, palette, geometry), same shape and
 *  justification as `Reveal` above: the canvas is written only by
 *  `putImageData` and its bytes are a pure function of (geometry key, step).
 *  Refolding a step costs one batch fold and one full-frame putImageData; the
 *  float scratch is the shared `accOf` pool, zeroed per refold. The 8-bit
 *  QUANTIZATION of a delta is independent of the fold's: a batch cell's
 *  contribution rounds once here and once inside the folded prefix, so at full
 *  alpha `base + delta` can differ from the folded `prefix_{s+1}` by the two
 *  roundings — and at every integer boundary the drawn frame IS the folded
 *  prefix (the delta's alpha is exactly 0), so the handover is byte-exact and
 *  the delta is only ever an APPROACH to the surface the next boundary draws. */
interface Delta {
  key: string;
  /** Which interval's batch is folded into `img`; -1 before the first fold. */
  step: number;
  img: ImageData;
  canvas: HTMLCanvasElement;
  layer: Layer | null;
  w: number;
  h: number;
}

const deltas = new Map<string, Delta>();

function deltaLayer(
  year: number,
  pts: Points,
  coloured: boolean,
  view: View,
  dpr: number,
  pin: [number, number] | null,
  step: number,
  from: number,
  to: number,
): Layer {
  const key = `delta|${year}|${coloured ? "zone" : "bone"}|${Math.round(view.width)}x${Math.round(view.height)}|${dpr}|${pin ? pin.join(",") : "none"}`;
  const w = Math.max(1, Math.round(view.width * dpr));
  const h = Math.max(1, Math.round(view.height * dpr));

  let d = deltas.get(key);
  if (d && (d.w !== w || d.h !== h)) d = undefined;
  if (!d) {
    // Transparent black, not opaque: the splat mirror stamps every touched
    // pixel opaque, and under `lighter` the untouched remainder contributes
    // nothing either way — which is what buys the refold its native fill.
    const img = new ImageData(w, h);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    d = { key, step: -1, img, canvas, layer: null, w, h };
  }

  if (d.step !== step || d.layer === null) {
    // Refold: any direction, always from zero — a batch is tiny against the
    // season, so there is nothing worth advancing in place.
    const order = revealOrder(pts, pin);
    const acc = accOf(w * h * 3);
    d.img.data.fill(0);
    const bone = BONE_RGB.split(",").map((s) => Number(s.trim()));
    const zoneRGB = ZONE_RGB.map((s) => s.split(",").map((v) => Number(v.trim())));
    const sp = splatOf(view, dpr);
    for (let j = from; j < to; j++) {
      const i = order[j]!;
      const count = pts.hires[i]! + pts.rest[i]!;
      const a = tone(count / pts.total, 1) / sp.overlap;
      const rgb = coloured ? (zoneRGB[pts.zone[i]!] ?? bone) : bone;
      splatCell(acc, w, h, view, dpr, sp, pts.x[i]!, pts.y[i]!, a, rgb, d.img.data);
    }
    d.step = step;
    d.canvas.getContext("2d")!.putImageData(d.img, 0, 0);
    d.layer = { canvas: d.canvas, key: `${key}|s${step}` };
  }

  deltas.set(key, d);
  // The live set, derived exactly as `reveals`' is: only the arriving season
  // carries a delta, in at most two palettes. Eviction costs a refold — time,
  // never bytes.
  if (deltas.size > 2) {
    const oldest = deltas.keys().next().value;
    if (oldest !== undefined && oldest !== key) deltas.delete(oldest);
  }
  return d.layer;
}

/**
 * Draw a season mid-arrival: the reveal replaces THE DEVELOPMENT's exposure
 * crossfade for the arriving season only (recession keeps A's develop-out, as
 * ratified). `arrived` is the arrival envelope itself — `st.arrived`, which
 * reaches 1 exactly at ARRIVAL_TAIL, so THE NUMBER LEAVES LAST's ratified
 * timing still lands the numeral against arrival's end.
 *
 * SINCE SESSION 13 THE STEPS BLEND (the crossfade above): the folded prefix of
 * the floor's step draws as the base, and the NEXT batch rises over it at the
 * linear fractional part of the same envelope. At every integer boundary the
 * frame is exactly the folded prefix — the delta contributes nothing at alpha
 * 0 — and at the top and past it the surface drawn is `bakeLayer`'s own
 * finished canvas, so the tail endpoint frames are byte-identical to the
 * judged bake by construction, not by arithmetic luck. Between boundaries the
 * frames are new, which is the ruling's point. The delta's bake is skipped
 * while its draw would be skipped (the blit's own alpha floor) so its cold
 * cost lands a frame after the base's advance, never stacked on it; no pixel
 * depends on that timing.
 */
export function drawReveal(
  ctx: CanvasRenderingContext2D,
  view: View,
  arrived: number,
  dim: number,
  year: number,
  pts: Points,
  coloured: boolean,
  dpr: number,
  pin: [number, number] | null,
): void {
  const r = Math.min(1, Math.max(0, arrived));
  if (r <= 0 || dim <= 0.002) return;
  // The finished layer is both this ladder's top step and the tail the
  // arrival hands over to. It is baked at the arrival's OPENING frame — the
  // boundary, where the season's cold work (the order, the accumulator)
  // already lives — so its one cold cost sits in the frame a viewer and a
  // probe can attribute rather than surprising the middle of the season
  // (measured in session 9: left lazy, it landed a full-plate bake at the
  // reveal's top step, mid-window). Warm frames pay a cache hit; no pixel
  // depends on when this ran.
  const top = bakeLayer(year, pts, coloured, view, dpr, pin, 1);
  const u = r * REVEAL_STEPS;
  const step = Math.floor(u);
  if (step >= REVEAL_STEPS) {
    drawLayer(ctx, top, view, dim);
    return;
  }
  const order = revealOrder(pts, pin);
  const prefixAt = (s: number): number =>
    Math.round(order.length * Math.pow(s / REVEAL_STEPS, REVEAL_CURVE));
  const base = prefixAt(step);
  if (base > 0) {
    drawLayer(ctx, revealLayer(year, pts, coloured, view, dpr, pin, base), view, dim);
  }
  const next = prefixAt(step + 1);
  const alpha = dim * (u - step);
  if (next > base && alpha > 0.002) {
    drawLayer(ctx, deltaLayer(year, pts, coloured, view, dpr, pin, step, base, next), view, alpha);
  }
}

export function clearLayers(): void {
  layers.clear();
  reveals.clear();
  deltas.clear();
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
