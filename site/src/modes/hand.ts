/** THE HAND — the bodies the record could not keep.
 *
 * Every other hand draws what the archive holds. This one draws what it lost.
 *
 * In every season but one a shot is a point and there is nothing between the
 * points, so those seasons are drops and nothing else. For the span of the
 * window the optical feed held the motion too, and only there can the paint
 * that connects the endpoints be laid at all. The painting's subject is the
 * absence everywhere else.
 *
 * THE PAINT IS PHYSICS, NOT TASTE
 *
 * The feed is the brush and its flow rate is 25 Hz, so paint is deposited per
 * unit TIME, never per unit distance:
 *
 *     ink   = DRIP · dt          conserved against time
 *     w · a = ink / arc = DRIP / v
 *
 * A body that runs lays a thin faint filament; a body that pivots on the spot
 * pools. Split as a round filament — a falling stream keeps its cross-section —
 * so radius and alpha each go as 1/sqrt(v). Three regimes fall out of that, and
 * their boundaries are the record's own measured speed percentiles, not chosen
 * numbers:
 *
 *     POOL      below p10   the filament caps and the excess becomes a blot
 *     FILAMENT  p10 to p90  a continuous tapered ribbon
 *     BREAK     above p90   a stream cannot stay a cylinder longer than its
 *                           circumference (Plateau–Rayleigh), so it beads
 *
 * TWO CONSERVATIONS, AND THE DIFFERENCE BETWEEN THEM IS THE ARGUMENT
 *
 * A drop outside the window and a drop inside it both conserve ink, and they
 * split it the other way up, because the thing their radius carries is not the
 * same thing.
 *
 *   OUTSIDE   a drop stands for a COORDINATE and the record says only how many
 *             shots landed there. Radius carries the count — area rises with
 *             it — and opacity is CONSTANT. Every drop is equally wet; they
 *             differ only in size, and where the record concentrated they run
 *             together and cover.
 *   INSIDE    a drop stands for ONE SHOT, and its radius carries something the
 *             record only says here: how open the shooter was. The weight is
 *             the same for every shot, so opacity must absorb what radius
 *             spends — alpha falls as 1/r², and a contested shot is a hot tight
 *             dot while an open one is a broad pale wash.
 *
 * That inversion is also what keeps this hand from being THE FIELD with a
 * different caption. THE FIELD varies BRIGHTNESS at a fixed size, tone-mapped,
 * compositing additively so marks add light. This one varies SIZE at a fixed
 * opacity and composites `source-over`, so marks OCCLUDE. Same measured driver,
 * opposite material, and only one of them can cover.
 *
 * COLOUR IS THE LEAGUE'S OWN MAP
 *
 * Hue is SHOT_ZONE_BASIC read at the vertex. That is legitimate for exactly the
 * reason THE FIELD's colour is: the zones are a partition of the FLOOR the NBA
 * drew, so a body crossing the court crosses the league's own regions, and
 * qa.py gates the reconstruction against the league's own labels (the agreement
 * rate is printed by the gate, not restated here). Colour adds no
 * classification. It exposes one that was already imposed — and one continuous
 * stroke recolours along its own length, indigo to gold, because that is the
 * map the players are moving across.
 *
 * PAINT COVERS
 *
 * Every other hand composites with `lighter`, because a mark there is a deposit
 * of light on a plate. Paint is not light; it occludes. This hand is the one
 * deliberate departure: a stroke crossing an earlier stroke must cover it, or
 * the canvas is a glow instead of a painting.
 *
 * PURE, AND NOW ACTUALLY SO
 *
 * This file used to keep one module-level canvas and extend it as the playhead
 * moved forward, calling that "a rebuild, not a memory". It was a memory: the
 * purity probe found `forward` differing from a cold render by tens of
 * thousands of channels at every window beat while `backward` and `continuous`
 * agreed, which is the signature of a surface drawn on across two JS turns
 * (audit F-04). Both layers now accumulate through `src/prefix.ts`, whose one
 * invariant is that a cached surface is built in a single burst onto a cleared
 * canvas and never drawn on again. See that file for why that is the strong
 * form and how the recursion makes forward and backward the same picture.
 *
 * WHAT ARRIVAL IS PACED BY
 *
 * Not the stroke index. `paint_index.bin:day` indexes the corroborated corpus's
 * own game-days and `paint.json:day_offsets` puts each of them on the window's
 * calendar, which is the same clock `window_measures.bin:day` counts on. So the
 * dots and the paint arrive together, on the days they were actually recorded,
 * and the window's own unevenness — some days one possession, some days six,
 * and four days on which nobody played and the painting simply stops — is a
 * measurement rather than an easing curve.
 */

import { factNum, type PaintFile, type Strokes, type WindowFile } from "../data";
import { drawSlug } from "../inscription";
import { BONE_RGB, ZONE_RGB } from "../palette";
import { COURT, type View } from "../plate";
import { prefixSurface } from "../prefix";
// One implementation of the league's map, checked against the Python one
// through a committed fixture. See site/src/zone.ts.
import { zoneAt } from "../zone";
import {
  BEAD_CAP,
  BORE,
  DRIP,
  DROP_ALPHA,
  DROP_AREA,
  DROP_MAX_R,
  DROP_MIN_R,
  FILAMENT_ALPHA_CAP,
  FILAMENT_ALPHA_K,
  KEPT_OVER_PAINT,
  POOL_ALPHA_CAP,
  POOL_ALPHA_K,
  POOL_EXCESS_K,
  POOL_R_CAP,
  POOL_V_FLOOR,
  RAYLEIGH,
  SPLOTCH_ALPHA_CAP_WINDOW,
  SPLOTCH_INK,
  SPLOTCH_MAX_R,
  SPLOTCH_MIN_R,
  SPLOTCH_VISIBLE,
} from "../scalars";
import { WINDOW_BEATS, WINDOW_YEAR } from "../timeline";
import type { Frame } from "./types";

const ZONE = ZONE_RGB.map((s) => s.split(",").map((v) => Number(v.trim())));
/** The ball, and the fallback for a coordinate no zone claims: the plate's own
 *  bone, taken from the palette rather than written out a third time. */
const BONE = BONE_RGB.split(",").map((v) => Number(v.trim()));

/**
 * THE AUTHORED SCALARS IN THIS HAND ARE DECLARED IN src/scalars.ts.
 *
 * This file used to announce DRIP as "the one authored scalar", eight lines
 * above a comment recording that BORE had been looked at by eye — which was two
 * claims and only one of them true (audit F-06). DRIP is the brush's flow rate
 * and BORE its width, and both were chosen; the regime boundaries and the
 * splotch scale are measured and come from the artifacts; RAYLEIGH is physics.
 * Each is classified and disclosed in the register, with what it controls.
 *
 * The constants below are NOT material: they quantise how much work one frame
 * may do, and moving them changes no mark's radius, opacity or colour. They are
 * here rather than in the register for that reason, and each says what it buys.
 */

/**
 * How much of a layer one cached step carries.
 *
 * The live tail — everything past the last whole step — is redrawn every frame,
 * so this is the per-frame work bound, and the number of steps is what a cold
 * or backward jump has to walk. Measured on this machine at the probe's
 * surface: a drop costs about a microsecond and a copy about a millisecond and
 * a half, which is what these two are balanced against.
 *
 * Do NOT reach for batching. Grouping the drops into one path per colour and
 * issuing a single `fill` was measured as several times SLOWER than a path per
 * drop, because a path carrying tens of thousands of subpaths pays for
 * tessellation the per-drop version never does.
 */
const DROP_STEP = 2048;
/** The same, for strokes. Smaller, because the tail is also the wet edge — the
 *  gesture still being laid — and it is redrawn at a partial length. */
const STROKE_STEP = 128;
/** How much of a stroke's own length the wet edge has drawn when it is this far
 *  behind the arrival point. A gesture arrives over a few strokes' worth of
 *  time rather than appearing whole. */
const WET_STROKES = 6;

export interface Regimes {
  v10: number;
  v50: number;
  v90: number;
}

/** Radius and alpha for a measured speed, conserving ink against time. */
function filament(v: number, r: Regimes): { rad: number; alpha: number } {
  const k = Math.sqrt(r.v50 / Math.max(v, r.v10));
  return {
    rad: BORE * k,
    alpha: Math.min(FILAMENT_ALPHA_CAP, DRIP * k * FILAMENT_ALPHA_K),
  };
}

// --- identity, so a cache key can name what it was built from ----------------

/**
 * A stable id for a decoded asset.
 *
 * A cache key has to carry the identity of the data it was built from, not just
 * its geometry. The arrays are replaced only when the page reloads them, so an
 * id handed out on first sight and remembered against the object itself is
 * exact: the same array always answers the same, and a different one never
 * collides with it.
 */
const assetIds = new WeakMap<object, number>();
let nextAssetId = 1;

function assetId(o: object): number {
  let id = assetIds.get(o);
  if (id === undefined) {
    id = nextAssetId++;
    assetIds.set(o, id);
  }
  return id;
}

// --- the calendar both layers arrive on --------------------------------------

/**
 * How many marks have arrived by each day of the window.
 *
 * Both binaries carry a `day` and neither counts the same thing: the calipers
 * count days since the window opened, the strokes index the corpus's own
 * game-days. `paint.json:day_offsets` is the map between them, so this reduces
 * both to one cumulative table on the window's calendar and the two layers
 * share a clock. Derived from the asset and cached against it — a derived
 * cache, which the fifth rule allows; nothing here is accumulated.
 */
const cumulative = new WeakMap<object, Int32Array>();

/**
 * The order the drops of a season land in — and why it is not the file's.
 *
 * `points/*.bin` is sorted by x: measured on the shipped bytes, every record's
 * x is greater than or equal to the one before it. Taking a prefix of that array
 * as "what has arrived" therefore draws a CURTAIN moving left to right across
 * the floor, and this hand did exactly that for as long as it has existed. The
 * old marks were faint enough to hide it; drops are not.
 *
 * There is no honest fix that keeps the file's order, because the artifact
 * holds no time at all — it is one count per coordinate for a whole season, so
 * no arrival order is the record's. Any order here is authored, which means the
 * only question is which false structure it asserts. Left to right asserts that
 * the season was played across the floor. This asserts nothing: a van der Corput
 * scatter, low-discrepancy by construction, so that at every moment the drops
 * that have landed are spread over the whole plate in the record's own
 * proportions. Deterministic, so the same instant always fills the same way.
 */
const scatter = new WeakMap<object, Int32Array>();

function scatterOrder(owner: object, n: number): Int32Array {
  const have = scatter.get(owner);
  if (have && have.length === n) return have;
  let bits = 1;
  while (1 << bits < n) bits++;
  const out = new Int32Array(n);
  let at = 0;
  for (let k = 0; k < 1 << bits; k++) {
    // Reverse the bits of k: consecutive k land as far apart as the range
    // allows, so a prefix of this sequence covers the whole array evenly.
    let r = 0;
    for (let b = 0; b < bits; b++) r = (r << 1) | ((k >> b) & 1);
    if (r < n) out[at++] = r;
  }
  scatter.set(owner, out);
  return out;
}

function cumulativeByDay(owner: object, days: ArrayLike<number>, n: number,
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

/** How many marks have landed by a fractional day, interpolated inside a day so
 *  arrival is continuous while its RATE stays the record's own. */
function arrivedByDay(cum: Int32Array, dayFrac: number): number {
  const span = cum.length - 1;
  const d = Math.max(0, Math.min(span, dayFrac));
  const lo = Math.floor(d);
  const hi = Math.min(span, lo + 1);
  const a = cum[lo]!;
  return Math.round(a + (cum[hi]! - a) * (d - lo));
}

// --- the beats ---------------------------------------------------------------

const [BEAT_ONE, , BEAT_INSTANT, BEAT_CLOSE] = WINDOW_BEATS;

/** Where the window is, as the four states the schedule already names. The rail
 *  lists the same four and a presenter stepping to "THE INSTANT" must land
 *  where this hand agrees the instant begins - one definition, two readers. */
interface Window3 {
  /** 0..1 through the opening beat, where ONE possession is laid. */
  opening: number;
  /** The day of the window arrival has reached, fractional. */
  dayFrac: number;
  /** 0..1 as the kept points come up over the paint through the instant. */
  kept: number;
  /** 0..1 as the paint is taken back off the plate over the close. */
  wash: number;
}

function windowAt(phase: number, span: number): Window3 {
  const p = Math.min(1, Math.max(0, phase));
  const opening = Math.min(1, p / BEAT_ONE.to);
  // The calendar sweeps from the end of the opening beat to the end of the
  // instant, so the painting is still arriving through the beat the piece is
  // built toward and has stopped before the plate is cleared.
  const sweep = (p - BEAT_ONE.to) / (BEAT_INSTANT.to - BEAT_ONE.to);
  return {
    opening,
    dayFrac: Math.max(0, Math.min(1, sweep)) * span,
    kept: smooth((p - BEAT_INSTANT.from) / (BEAT_INSTANT.to - BEAT_INSTANT.from)),
    wash: smooth((p - BEAT_CLOSE.from) / (BEAT_CLOSE.to - BEAT_CLOSE.from)),
  };
}

function smooth(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
}

// --- one stroke --------------------------------------------------------------

/**
 * One stroke, one body, five measured seconds.
 *
 * `drawn` is how much of it has been laid so far, which is what makes the
 * gesture read as a gesture rather than as a shape that appears.
 */
export function paintStroke(
  ctx: CanvasRenderingContext2D,
  view: View,
  s: Strokes,
  i: number,
  drawn: number,
  r: Regimes,
): void {
  const first = s.first[i]!;
  const n = s.count[i]!;
  if (n < 2) return;
  const upto = Math.max(2, Math.ceil(n * Math.min(1, Math.max(0, drawn))));
  const ball = s.kind[i] === 1;

  for (let k = 1; k < upto; k++) {
    const a = first + k - 1;
    const b = first + k;
    const dt = s.dt[b]!;
    const arcT = s.arc[b]!;
    if (dt === 0) continue;

    // The true measured mean speed over this span. `arc` was summed at the full
    // 25 Hz before simplification, so this is unaffected by how few control
    // points survived.
    const v = arcT / 10 / (dt / 25);
    const { rad, alpha } = filament(v, r);

    const x0 = view.sx(s.x[a]!);
    const y0 = view.sy(s.y[a]!);
    const x1 = view.sx(s.x[b]!);
    const y1 = view.sy(s.y[b]!);

    // Hue at the vertex the paint is landing on: the league's own region.
    const rgb = ball ? BONE : (ZONE[zoneAt(s.x[b]!, s.y[b]!)] ?? BONE);
    const col = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, `;

    if (v > r.v90) {
      // BREAK. Beyond the instability the stream cannot wet a continuous line,
      // so the segment is laid as beads one wavelength apart. Nothing is drawn
      // fainter than this: below it paint does not wet at all. The span this
      // walks is a real one — the pipeline cuts a path at every over-long step
      // and every feed break, so no segment here bridges a discarded jump.
      const wl = RAYLEIGH * rad;
      const beads = Math.max(1, Math.min(BEAD_CAP, Math.round(arcT / wl)));
      for (let d = 0; d < beads; d++) {
        const t = (d + 0.5) / beads;
        ctx.beginPath();
        ctx.fillStyle = `${col}${alpha})`;
        ctx.arc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, view.s(rad), 0, Math.PI * 2);
        ctx.fill();
      }
      continue;
    }

    ctx.beginPath();
    ctx.strokeStyle = `${col}${alpha})`;
    ctx.lineWidth = view.s(rad * 2);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    if (v < r.v10) {
      // POOL. The filament is capped, and the ink the cap refuses goes down as
      // a blot: a body standing still for three seconds leaves a real mark.
      const excess = (r.v10 / Math.max(v, POOL_V_FLOOR) - 1) * POOL_EXCESS_K;
      if (excess > POOL_V_FLOOR) {
        ctx.beginPath();
        ctx.fillStyle = `${col}${Math.min(POOL_ALPHA_CAP, alpha * POOL_ALPHA_K)})`;
        ctx.arc((x0 + x1) / 2, (y0 + y1) / 2,
          view.s(rad * Math.min(POOL_R_CAP, 1 + excess)), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

// --- the drops ---------------------------------------------------------------

/**
 * A shot as paint.
 *
 * THE FRAME'S OWN ALPHA IS NO LONGER FOLDED IN HERE, and that is a deliberate
 * change of reading. It used to be multiplied in BEFORE the per-mark clamp, so
 * the clamp bound differently depending on how far the coda had receded — which
 * made the cap a fade cap as well as a material one, and made the layer
 * impossible to cache. The clamp is a MATERIAL cap: how much ink one mark may
 * hold. It is applied to the unmultiplied value here and the frame's alpha
 * multiplies the finished layer at composite time. A dimmed painting is the
 * same painting with the same occlusion, which is also the more defensible
 * reading of what the coda does.
 *
 * THE WINDOW RADIUS IS NOT THE CALIPER AT FLOOR SCALE, and this file used to
 * say it was. A caliper runs the length of the floor (`contest.caliper_ft`) and
 * a drop is under a foot across; literal scale would put a single shot's mark
 * over a large part of the court. THE MEASURE draws the caliper at literal
 * scale, as a line, because that is the hand whose subject it is. What this is
 * instead, said plainly: A MONOTONE AUTHORED MAP of a measured distance onto an
 * authored radius range, whose reference is MEASURED —
 * `window.json:contest.caliper_ft.p99`, the 99th percentile of the very
 * distribution being drawn. It used to be the old one-byte STORAGE CEILING of
 * window_measures.bin, a property of the file format rather than of basketball,
 * which also silently clipped the longest calipers onto one value (audit F-05).
 */
function bakeWindowDrops(
  ctx: CanvasRenderingContext2D,
  view: View,
  m: { x: Int16Array; y: Int16Array; dist: Uint16Array; n: number },
  w: WindowFile,
  from: number,
  to: number,
): void {
  const end = Math.min(to, m.n);
  // Ink per mark, so the layer weighs the same whatever the count. The measured
  // distribution this hand is drawing, in tenths to match the stored caliper:
  // the transfer function reaches its widest radius at the reference, and the
  // tail beyond it draws at that radius rather than past it.
  const per = SPLOTCH_INK / m.n;
  const scaleAt = 10 * w.contest.caliper_ft.p99;
  for (let i = from; i < end; i++) {
    const open = Math.min(1, m.dist[i]! / scaleAt);
    const rad = SPLOTCH_MIN_R + open * (SPLOTCH_MAX_R - SPLOTCH_MIN_R);
    const a = Math.min(SPLOTCH_ALPHA_CAP_WINDOW, per / (rad * rad));
    if (a < SPLOTCH_VISIBLE) continue;
    const rgb = ZONE[zoneAt(m.x[i]!, m.y[i]!)] ?? BONE;
    ctx.beginPath();
    ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
    ctx.arc(view.sx(m.x[i]!), view.sy(m.y[i]!), view.s(rad), 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Every other season: a drop per coordinate, sized by what landed there.
 *
 * The record kept a point and a count and nothing else, so the count is the
 * only thing a drop can carry — and it goes into AREA, not brightness. A
 * coordinate the league's own lattice holds many shots at spreads into a fat
 * wet blot; one it holds a handful at stays a bead. Ink is conserved by
 * construction: area rises with the coordinate's share of its season, so
 * opacity does not have to move at all, and the drops run together and COVER
 * where the record concentrated.
 *
 * Share, never raw count, and against a FIXED reference across every season —
 * the same discipline `field.ts:tone` keeps, and for the same reason.
 * Normalising each season to its own maximum would falsely equalise them, and
 * the lockout years and the bubble are SHORT, not sparse.
 *
 * The origin is skipped: those are the shots the record declined to place, and
 * they are the pin's subject, not paint's.
 */
function bakeSeasonDrops(
  ctx: CanvasRenderingContext2D,
  view: View,
  pts: { x: Int16Array; y: Int16Array; hires: Uint32Array; rest: Uint32Array;
         zone: Uint8Array; n: number; total: number },
  from: number,
  to: number,
): void {
  const end = Math.min(to, pts.n);
  const total = Math.max(1, pts.total);
  const k = DROP_AREA / (total * Math.PI);
  const order = scatterOrder(pts, pts.n);
  for (let j = from; j < end; j++) {
    const i = order[j]!;
    const cx = pts.x[i]!;
    const cy = pts.y[i]!;
    if (cx === 0 && cy === 0) continue;
    const count = pts.hires[i]! + pts.rest[i]!;
    if (count === 0) continue;
    const want = Math.sqrt(k * count);
    // Below the smallest drop the brush makes, the coordinate still deposits
    // its ink - it simply cannot spread it, so what area refuses goes to
    // opacity. That keeps every coordinate the record filed on the plate and
    // keeps the conservation exact at both ends of the range.
    const rad = Math.min(DROP_MAX_R, Math.max(DROP_MIN_R, want));
    const a = want >= DROP_MIN_R
      ? DROP_ALPHA
      : DROP_ALPHA * ((want * want) / (DROP_MIN_R * DROP_MIN_R));
    if (a < SPLOTCH_VISIBLE) continue;
    const rgb = ZONE[pts.zone[i]!] ?? BONE;
    ctx.beginPath();
    ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
    ctx.arc(view.sx(cx), view.sy(cy), view.s(rad), 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- the hand ----------------------------------------------------------------

export function drawHandHand(f: Frame): void {
  const { ctx, view, dpr, st, data, remains } = f;
  const paint: PaintFile | null = data.paint;
  const year = st.year!;
  const dw = Math.max(1, Math.round(view.width * dpr));
  const dh = Math.max(1, Math.round(view.height * dpr));
  // Everything about the surface that changes a pixel, including DPR as its own
  // component. The old key was the DEVICE size alone, so a small viewport at a
  // doubled ratio and a large one at a single ratio collided on the same key
  // while the view's own scale differed by a factor of two.
  const geom = `${Math.round(view.width)}x${Math.round(view.height)}|${dpr}`;

  ctx.save();
  // Paint covers. This is the one hand that does not composite additively.
  ctx.globalCompositeOperation = "source-over";

  // The plate is one halfcourt and bodies run the whole floor, so some of the
  // measured vertices sit past the halfcourt line - `vertices_outside_plate`
  // counts them. They are real positions and they stay in the artifact; the
  // canvas is simply the frame the whole piece is composed in, and paint stops
  // at its edge.
  ctx.beginPath();
  ctx.rect(view.sx(COURT.x0), view.sy(COURT.y1),
    view.s(COURT.x1 - COURT.x0), view.s(COURT.y1 - COURT.y0));
  ctx.clip();

  const inWindow = year === WINDOW_YEAR && data.window !== null;
  const w = data.window;
  const m = inWindow ? data.measures() : null;
  const span = inWindow && m ? m.day[m.n - 1]! : 0;
  const win = inWindow ? windowAt(st.phase, span) : null;

  // --- the drops the record kept --------------------------------------------
  let dropSurface: HTMLCanvasElement | null = null;
  if (inWindow && m && m.n && w) {
    // Paced by the day the shot was actually recorded on, so the flood runs as
    // the corpus did rather than as a fixed rate over an index.
    const cum = cumulativeByDay(m, m.day, m.n, (d) => d, span);
    const upto = arrivedByDay(cum, win!.dayFrac);
    dropSurface = prefixSurface(
      `hand.window|${assetId(m)}|${geom}`,
      Math.floor(upto / DROP_STEP), dw, dh, dpr, DROP_STEP,
      (c, a, b) => bakeWindowDrops(c, view, m, w, a, b),
    );
    if (dropSurface) blit(ctx, dropSurface, view, remains);
    // The live tail: everything past the last whole step, bounded by the step
    // and never by the resident record count.
    ctx.save();
    ctx.globalAlpha = remains;
    bakeWindowDrops(ctx, view, m, w, Math.floor(upto / DROP_STEP) * DROP_STEP, upto);
    ctx.restore();
  } else {
    const pts = data.points(year);
    if (pts) {
      const upto = Math.round(pts.n * Math.min(1, Math.max(0, st.arrived)));
      dropSurface = prefixSurface(
        `hand.season|${year}|${assetId(pts)}|${geom}`,
        Math.floor(upto / DROP_STEP), dw, dh, dpr, DROP_STEP,
        (c, a, b) => bakeSeasonDrops(c, view, pts, a, b),
      );
      if (dropSurface) blit(ctx, dropSurface, view, remains);
      ctx.save();
      ctx.globalAlpha = remains;
      bakeSeasonDrops(ctx, view, pts, Math.floor(upto / DROP_STEP) * DROP_STEP, upto);
      ctx.restore();
    }
  }

  // --- the bodies the record did not keep -----------------------------------
  const s = inWindow ? data.strokes() : null;
  if (s && s.n && paint && win) {
    const r: Regimes = {
      v10: paint.speed_ft_s.p10,
      v50: paint.speed_ft_s.p50,
      v90: paint.speed_ft_s.p90,
    };
    const offsets = paint.day_offsets;
    const last = offsets[offsets.length - 1] ?? 0;
    const cum = cumulativeByDay(s, s.day, s.n, (d) => offsets[d] ?? 0, last);
    // The opening beat lays ONE possession, slowly, because a single gesture is
    // the only thing at this scale a viewer can actually follow. From there the
    // calendar takes over and never goes back below it.
    const opener = firstCanvasStrokes(s);
    const byDay = arrivedByDay(cum, (win.dayFrac / Math.max(1, span)) * last);
    const laid = Math.max(Math.round(opener * win.opening), byDay);

    const steps = Math.floor(laid / STROKE_STEP);
    const baked = prefixSurface(
      `hand.paint|${assetId(s)}|${geom}`,
      steps, dw, dh, dpr, STROKE_STEP,
      (c, a, b) => {
        for (let i = a; i < Math.min(b, s.n); i++) paintStroke(c, view, s, i, 1, r);
      },
    );
    // The close takes the paint back off the plate rather than fading it out.
    const wet = remains * (1 - win.wash);
    if (baked) blit(ctx, baked, view, wet);
    ctx.save();
    ctx.globalAlpha = wet;
    for (let i = steps * STROKE_STEP; i < laid; i++) {
      paintStroke(ctx, view, s, i, Math.min(1, (laid - i) / WET_STROKES), r);
    }
    ctx.restore();

    // THE INSTANT: the kept points come up over the paint. Five seconds of body
    // were recorded and one coordinate was filed, and this is that coordinate
    // asserting itself over the gesture it stands for. Nothing new is drawn -
    // it is the same layer, composited again above instead of below.
    if (dropSurface && win.kept > 0) blit(ctx, dropSurface, view, remains * win.kept * KEPT_OVER_PAINT);

    if (win.wash > 0) {
      drawSlug(ctx, view, [
        `${paint.strokes.toLocaleString()} STROKES · ${paint.canvases} POSSESSIONS`,
        "EVERY VERTEX A POSITION THE MACHINE RECORDED",
      ], { x: 0, y: 330 }, remains * win.wash * 0.5);
    }
  }

  // THE SET THIS IS A PICTURE OF, said where the picture is.
  //
  // These drops are the RECOVERED set, not the season: a release is only found
  // by following the ball back from the rim, and every made shot reaches it. THE
  // MEASURE and THE LEDGER disclose that; this hand presents the same subset as
  // a picture of 2015-16 and said nothing. The line is templated by the pipeline
  // from the figures it quotes and drawn verbatim - the piece never composes it.
  if (inWindow && w?.bias.scope && win) {
    drawSlug(ctx, view, [w.bias.scope], { x: 0, y: -30 },
      remains * win.opening * (1 - win.wash) * 0.42);
  }

  if (!inWindow && st.year === WINDOW_YEAR + 1) {
    // The whole point, said once, on the first season after the window closes.
    const days = factNum(data.facts, "window.days_inclusive");
    // `voice`: the enclosure, named once, on the first season after it closes.
    drawSlug(ctx, view, [
      "THE RECORD KEEPS ENDPOINTS",
      `WHAT HAPPENED BETWEEN THEM WAS PUBLIC FOR ${days} DAYS`,
    ], { x: 0, y: 330 }, remains * Math.min(1, st.phase * 2) * 0.45, "voice");
  }

  ctx.restore();
}

/** How many strokes the first possession holds. One canvas is one corroborated
 *  possession, and the index is ordered by day and then by canvas, so this is a
 *  prefix — read from the data rather than assumed to be a fixed number, since
 *  after the discontinuity split a body can be several strokes. */
export function firstCanvasStrokes(s: Strokes): number {
  const c0 = s.canvas[0]!;
  let i = 0;
  while (i < s.n && s.canvas[i] === c0) i++;
  return i;
}

/** Composite a cached layer. Alpha is applied HERE and not baked in, which is
 *  what lets one surface serve every frame of a fade. */
function blit(ctx: CanvasRenderingContext2D, el: HTMLCanvasElement,
              view: View, alpha: number): void {
  if (alpha <= 0.002) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(el, 0, 0, view.width, view.height);
  ctx.restore();
}

/** Drop every cached surface. Imported by the purity probe's `cold()`, and it
 *  must change no pixel — which is the claim that probe exists to test. */
export { clearPrefixes as clearCanvas } from "../prefix";
