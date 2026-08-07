/** THE HAND — the bodies the record could not keep.
 *
 * Every other hand draws what the archive holds. This one draws what it lost.
 *
 * For twenty-nine of the thirty seasons a shot is a point and there is nothing
 * between the points, so those seasons are splotches and nothing else. For
 * eleven weeks the optical feed held the motion too, and only there can the
 * paint that connects the endpoints be laid at all. The painting's subject is
 * the absence everywhere else.
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
 * COLOUR IS THE LEAGUE'S OWN MAP
 *
 * Hue is SHOT_ZONE_BASIC read at the vertex. That is legitimate for exactly the
 * reason THE FIELD's colour is: the seven zones are a partition of the FLOOR
 * the NBA drew, so a body crossing the court crosses the league's own regions,
 * and qa.py gates the reconstruction against the league's own labels at 99.993%.
 * Colour adds no classification. It exposes one that was already imposed — and
 * one continuous stroke recolours along its own length, indigo to gold, because
 * that is the map the players are moving across.
 *
 * PAINT COVERS
 *
 * Every other hand composites with `lighter`, because a mark there is a deposit
 * of light on a plate. Paint is not light; it occludes. This hand is the one
 * deliberate departure: a stroke crossing an earlier stroke must cover it, or
 * the canvas is a glow instead of a painting.
 *
 * Pure like every hand: what has been laid down at time t is a prefix of one
 * fixed array, so scrubbing backwards rebuilds the canvas rather than
 * remembering it.
 */

import type { PaintFile, Strokes } from "../data";
import { drawSlug } from "../inscription";
import { BONE_RGB, ZONE_RGB } from "../palette";
import { COURT, type View } from "../plate";
import type { Frame } from "./types";

/** Where the piece's own zone geometry lives, in the plate's frame. Mirrors
 *  `common.zone_at` exactly; qa.py gates that function against the record. */
const RESTRICTED_R = 40;
const LANE_HALF_W = 80;
const FREE_THROW_Y = 137.5;
const THREE_R = 237.5;
const CORNER_X = 220;
const CORNER_Y = Math.sqrt(THREE_R * THREE_R - CORNER_X * CORNER_X);

function zoneAt(x: number, y: number): number {
  if (y > 417.5) return 6;
  if (Math.abs(x) >= CORNER_X && y <= CORNER_Y) return x < 0 ? 3 : 4;
  const r = Math.hypot(x, y);
  if (r >= THREE_R) return 5;
  if (r <= RESTRICTED_R) return 0;
  if (Math.abs(x) <= LANE_HALF_W && y <= FREE_THROW_Y) return 1;
  return 2;
}

const ZONE = ZONE_RGB.map((s) => s.split(",").map((v) => Number(v.trim())));

/**
 * The one authored scalar in this hand, named the way `marks.ts` names INK.
 *
 * Paint deposited per tracked frame. Everything else — every width, every
 * opacity, every regime boundary — is derived from it and from the record's own
 * measured speeds.
 */
const DRIP = 0.055;
/** Filament radius in court tenths at the median measured speed.
 *
 *  Looked at by eye at 2.4 with DRIP 0.62 and the plate went to opaque mush:
 *  2,772 strokes is ~39,000 segments, and paint COVERS, so anything that reads
 *  well as one gesture reads as a slab at that count. The canvas has to survive
 *  its own accumulation - a stroke laid at the end must still be able to sit on
 *  top of everything before it and be seen. */
const BORE = 1.15;

/** Plateau–Rayleigh: the fastest-growing instability on a falling stream has a
 *  wavelength of 9.02 radii, so beyond it a filament beads instead of wetting.
 *  Physics, not a tuning knob. */
const RAYLEIGH = 9.02;

interface Regimes {
  v10: number;
  v50: number;
  v90: number;
}

/** Radius and alpha for a measured speed, conserving ink against time. */
function filament(v: number, r: Regimes): { rad: number; alpha: number } {
  const k = Math.sqrt(r.v50 / Math.max(v, r.v10));
  return { rad: BORE * k, alpha: Math.min(0.95, DRIP * k * 0.5) };
}

// --- the canvas --------------------------------------------------------------

interface Canvas {
  el: HTMLCanvasElement;
  /** How many strokes are baked into it. */
  upTo: number;
  key: string;
}

let canvas: Canvas | null = null;

/** Strokes bake in blocks, so scrubbing forward extends the canvas and
 *  scrubbing backwards throws it away and rebuilds — a rebuild, not a memory,
 *  exactly as `field.ts` treats its season layers. */
const BLOCK = 64;

function canvasFor(view: View, dpr: number, upTo: number, s: Strokes, r: Regimes): Canvas {
  const w = Math.max(1, Math.round(view.width * dpr));
  const h = Math.max(1, Math.round(view.height * dpr));
  const key = `${w}x${h}`;
  if (!canvas || canvas.key !== key || canvas.upTo > upTo) {
    const el = document.createElement("canvas");
    el.width = w;
    el.height = h;
    canvas = { el, upTo: 0, key };
  }
  if (canvas.upTo < upTo) {
    const ctx = canvas.el.getContext("2d")!;
    ctx.save();
    ctx.scale(dpr, dpr);
    for (let i = canvas.upTo; i < upTo; i++) paintStroke(ctx, view, s, i, 1, r);
    ctx.restore();
    canvas.upTo = upTo;
  }
  return canvas;
}

export function clearCanvas(): void {
  canvas = null;
}

/**
 * One stroke, one body, five measured seconds.
 *
 * `drawn` is how much of it has been laid so far, which is what makes the
 * gesture read as a gesture rather than as a shape that appears.
 */
function paintStroke(
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
    const rgb = ball ? [232, 226, 214] : (ZONE[zoneAt(s.x[b]!, s.y[b]!)] ?? [232, 226, 214]);
    const col = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, `;

    if (v > r.v90) {
      // BREAK. Beyond the instability the stream cannot wet a continuous line,
      // so the segment is laid as beads one wavelength apart. Nothing is drawn
      // fainter than this: below it paint does not wet at all.
      const wl = RAYLEIGH * rad;
      const lenT = arcT / 1;
      const beads = Math.max(1, Math.min(24, Math.round(lenT / wl)));
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
      const excess = (r.v10 / Math.max(v, 0.05) - 1) * 0.5;
      if (excess > 0.05) {
        ctx.beginPath();
        ctx.fillStyle = `${col}${Math.min(0.9, alpha * 1.1)})`;
        ctx.arc((x0 + x1) / 2, (y0 + y1) / 2,
          view.s(rad * Math.min(3.2, 1 + excess)), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

// --- splotches ---------------------------------------------------------------

/**
 * A shot as paint.
 *
 * Inside the window the record held how open the shooter was, so the splotch
 * spreads exactly as far as the room he had: radius is the caliper at true
 * floor scale and alpha falls as 1/r² so the ink is the same either way. A
 * contested shot is a hot tight dot; a wide-open one is a broad pale wash.
 * Outside the window the record says nothing about room, so every splotch is
 * the same size — which is the difference the hand is about.
 */
/** Ink for the whole splotch layer, so a season of 190,000 marks and a window
 *  of 48,000 lay down the same amount of paint and neither floods the plate.
 *  Conserved the way `marks.ts` conserves it for dots. */
const SPLOTCH_INK = 9000;
/**
 * Splotch radii in court tenths.
 *
 * Deliberately fat. THE FIELD already draws every shot as a photographic
 * density, and if these marks were the same size this hand would simply BE
 * THE FIELD with a different caption for the six minutes it spends outside the
 * window. Paint is a different material: fewer visible marks, hard edges, and
 * enough overlap that the crowded parts of the floor go opaque while the thin
 * parts stay discrete blobs. That contrast is what makes it read as a painting
 * across a room rather than as a chart.
 */
const SPLOTCH_MIN_R = 2.6;
const SPLOTCH_MAX_R = 9.0;

function splotches(f: Frame, alpha: number): void {
  const { ctx, view, st, data } = f;
  const year = st.year!;
  const arrived = Math.min(1, Math.max(0, st.arrived));

  if (year === 2015 && data.window) {
    const m = data.measures();
    if (m && m.n) {
      const upto = Math.round(m.n * arrived);
      // Ink per mark, so the layer weighs the same whatever the count.
      const per = (SPLOTCH_INK / m.n) * alpha;
      for (let i = 0; i < upto; i++) {
        // The splotch spreads as far as the room the shooter had: radius is the
        // measured caliper, and alpha falls as 1/r^2 so the ink is the same
        // either way. A contested shot is a hot tight dot; a wide-open one is a
        // broad pale wash. Only the window can say this - outside it the record
        // does not record how open anyone was.
        const open = m.dist[i]! / 255;
        const rad = SPLOTCH_MIN_R + open * (SPLOTCH_MAX_R - SPLOTCH_MIN_R);
        const rgb = ZONE[zoneAt(m.x[i]!, m.y[i]!)] ?? [232, 226, 214];
        const a = Math.min(0.34, per / (rad * rad));
        if (a < 0.004) continue;
        ctx.beginPath();
        ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
        ctx.arc(view.sx(m.x[i]!), view.sy(m.y[i]!), view.s(rad), 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
  }

  // Every other season: the record kept a point and nothing else, so every mark
  // is the same size and carries only the league's colour. That sameness is the
  // hand's argument, not a shortcut.
  const pts = data.points(year);
  if (!pts) return;
  const upto = Math.round(pts.n * arrived);
  const rad = SPLOTCH_MIN_R + 1.6;
  const rpx = view.s(rad);
  const per = (SPLOTCH_INK / Math.max(1, pts.total)) * alpha / (rad * rad);
  ctx.save();
  for (let i = 0; i < upto; i++) {
    const cx = pts.x[i]!;
    const cy = pts.y[i]!;
    if (cx === 0 && cy === 0) continue;
    const count = pts.hires[i]! + pts.rest[i]!;
    if (count === 0) continue;
    const a = Math.min(0.30, per * count);
    if (a < 0.004) continue;
    const rgb = ZONE[pts.zone[i]!] ?? [232, 226, 214];
    ctx.beginPath();
    ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
    ctx.arc(view.sx(cx), view.sy(cy), rpx, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// --- the hand ----------------------------------------------------------------

export function drawHandHand(f: Frame): void {
  const { ctx, view, dpr, st, data, remains } = f;
  const paint: PaintFile | null = data.paint;

  ctx.save();
  // Paint covers. This is the one hand that does not composite additively.
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = remains;

  // The plate is one halfcourt and bodies run the whole floor, so ~6% of the
  // measured vertices sit past the halfcourt line. They are real positions and
  // they stay in the artifact; the canvas is simply the frame the whole piece
  // is composed in, and paint stops at its edge.
  ctx.beginPath();
  ctx.rect(view.sx(COURT.x0), view.sy(COURT.y1),
    view.s(COURT.x1 - COURT.x0), view.s(COURT.y1 - COURT.y0));
  ctx.clip();

  splotches(f, remains * 0.9);

  const s = st.act === 3 ? data.strokes() : null;
  if (s && s.n && paint) {
    const r: Regimes = {
      v10: paint.speed_ft_s.p10,
      v50: paint.speed_ft_s.p50,
      v90: paint.speed_ft_s.p90,
    };

    // The canvas accumulates across the window — that is what a painting does —
    // then washes off over the closing beat, so 23 January takes the paint back
    // off the plate rather than fading it out.
    const lay = Math.min(1, st.phase / 0.86);
    const laid = Math.round(s.n * lay);
    const blocks = Math.floor(laid / BLOCK) * BLOCK;

    const baked = canvasFor(view, dpr, blocks, s, r);
    const wash = Math.max(0, (st.phase - 0.9) / 0.1);
    ctx.globalAlpha = remains * (1 - wash);
    ctx.drawImage(baked.el, 0, 0, view.width, view.height);

    // The wet edge: the strokes still being laid, drawn live over the bake.
    for (let i = blocks; i < laid; i++) {
      const local = laid - i;
      paintStroke(ctx, view, s, i, Math.min(1, local / 6), r);
    }

    if (st.phase > 0.9) {
      drawSlug(ctx, view, [
        `${paint.strokes.toLocaleString()} STROKES · ${paint.canvases} POSSESSIONS`,
        "EVERY VERTEX A POSITION THE MACHINE RECORDED",
      ], { x: 0, y: 330 }, remains * wash * 0.5);
    }
  } else if (st.act !== 3) {
    // The whole point, said once, on the first season after the window closes.
    if (st.year === 2016) {
      drawSlug(ctx, view, [
        "THE RECORD KEEPS ENDPOINTS",
        "WHAT HAPPENED BETWEEN THEM WAS PUBLIC FOR ELEVEN WEEKS",
      ], { x: 0, y: 330 }, remains * Math.min(1, st.phase * 2) * 0.45);
    }
  }

  ctx.restore();
}

/** Guard: the plate box the pipeline clips to. */
export function withinPlate(x: number, y: number): boolean {
  return x >= COURT.x0 && x <= COURT.x1 && y >= COURT.y0 && y <= COURT.y1;
}

export const HAND_BONE = BONE_RGB;
