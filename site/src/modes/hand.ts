/** THE HAND — the bodies the record could not keep.
 *
 * Every other hand draws what the archive holds. This one draws what it lost.
 *
 * In every season but one a shot is a point and there is nothing between the
 * points, so those seasons are splotches and nothing else. For the span of the
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
 * Pure like every hand: what has been laid down at time t is a prefix of one
 * fixed array, so scrubbing backwards rebuilds the canvas rather than
 * remembering it.
 */

import { factNum, type PaintFile, type Strokes } from "../data";
import { drawSlug } from "../inscription";
import { BONE_RGB, ZONE_RGB } from "../palette";
import { COURT, type View } from "../plate";
// One implementation of the league's map, checked against the Python one
// through a committed fixture. See site/src/zone.ts.
import { zoneAt } from "../zone";
import {
  BEAD_CAP,
  BORE,
  DRIP,
  FILAMENT_ALPHA_CAP,
  FILAMENT_ALPHA_K,
  POOL_ALPHA_CAP,
  POOL_ALPHA_K,
  POOL_EXCESS_K,
  POOL_R_CAP,
  POOL_V_FLOOR,
  RAYLEIGH,
  SPLOTCH_ALPHA_CAP_SEASON,
  SPLOTCH_ALPHA_CAP_WINDOW,
  SPLOTCH_FLAT_BONUS_R,
  SPLOTCH_INK,
  SPLOTCH_MAX_R,
  SPLOTCH_MIN_R,
  SPLOTCH_VISIBLE,
} from "../scalars";
import { WINDOW_YEAR } from "../timeline";
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
 */

interface Regimes {
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
    const rgb = ball ? BONE : (ZONE[zoneAt(s.x[b]!, s.y[b]!)] ?? BONE);
    const col = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, `;

    if (v > r.v90) {
      // BREAK. Beyond the instability the stream cannot wet a continuous line,
      // so the segment is laid as beads one wavelength apart. Nothing is drawn
      // fainter than this: below it paint does not wet at all.
      const wl = RAYLEIGH * rad;
      const lenT = arcT / 1;
      const beads = Math.max(1, Math.min(BEAD_CAP, Math.round(lenT / wl)));
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

// --- splotches ---------------------------------------------------------------

/**
 * A shot as paint.
 *
 * Inside the window the record held how open the shooter was, so the splotch
 * spreads with the room he had: a contested shot is a hot tight dot and a
 * wide-open one a broad pale wash, and alpha falls as 1/r^2 so the ink is the
 * same either way. Outside the window the record says nothing about room, so
 * every splotch is the same size — which is the difference the hand is about.
 *
 * THE RADIUS IS NOT THE CALIPER AT FLOOR SCALE, and this file used to say it
 * was. A caliper runs the length of the floor (`contest.caliper_ft`) and a
 * splotch is under a foot across; literal scale would put a single shot's mark
 * over a large part of the court. THE MEASURE draws the caliper at literal
 * scale, as a line, because that is the hand whose subject it is.
 *
 * What this is instead, said plainly: A MONOTONE AUTHORED MAP of a measured
 * distance onto an authored radius range. Two ends are authored — SPLOTCH_MIN_R
 * and SPLOTCH_MAX_R — and the reference the distance is normalised against is
 * MEASURED: `window.json:contest.caliper_ft.p99`, the 99th percentile of the
 * very distribution being drawn. It used to be the old one-byte STORAGE
 * CEILING of window_measures.bin — a property of the file format, not
 * of basketball, and one that also silently clipped the longest calipers in
 * the corpus onto a single value (audit F-05).
 * Every scalar below is declared and classified in src/scalars.ts.
 */
function splotches(f: Frame, alpha: number): void {
  const { ctx, view, st, data } = f;
  const year = st.year!;
  const arrived = Math.min(1, Math.max(0, st.arrived));

  if (year === WINDOW_YEAR && data.window) {
    const m = data.measures();
    if (m && m.n) {
      const upto = Math.round(m.n * arrived);
      // Ink per mark, so the layer weighs the same whatever the count.
      const per = (SPLOTCH_INK / m.n) * alpha;
      // The measured distribution this hand is drawing, in tenths to match the
      // stored caliper. The transfer function reaches its widest radius here;
      // the tail beyond it draws at that radius rather than past it.
      const scaleAt = 10 * data.window.contest.caliper_ft.p99;
      for (let i = 0; i < upto; i++) {
        // How open the shooter was, as a fraction of p99 - see the note above:
        // a monotone authored map of a measured distance, not floor scale.
        const open = Math.min(1, m.dist[i]! / scaleAt);
        const rad = SPLOTCH_MIN_R + open * (SPLOTCH_MAX_R - SPLOTCH_MIN_R);
        const rgb = ZONE[zoneAt(m.x[i]!, m.y[i]!)] ?? BONE;
        const a = Math.min(SPLOTCH_ALPHA_CAP_WINDOW, per / (rad * rad));
        if (a < SPLOTCH_VISIBLE) continue;
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
  const rad = SPLOTCH_MIN_R + SPLOTCH_FLAT_BONUS_R;
  const rpx = view.s(rad);
  const per = (SPLOTCH_INK / Math.max(1, pts.total)) * alpha / (rad * rad);
  ctx.save();
  for (let i = 0; i < upto; i++) {
    const cx = pts.x[i]!;
    const cy = pts.y[i]!;
    if (cx === 0 && cy === 0) continue;
    const count = pts.hires[i]! + pts.rest[i]!;
    if (count === 0) continue;
    const a = Math.min(SPLOTCH_ALPHA_CAP_SEASON, per * count);
    if (a < SPLOTCH_VISIBLE) continue;
    const rgb = ZONE[pts.zone[i]!] ?? BONE;
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

  // The plate is one halfcourt and bodies run the whole floor, so some of the
  // measured vertices sit past the halfcourt line - `vertices_outside_plate`
  // counts them. They are real positions and they stay in the artifact; the
  // canvas is simply the frame the whole piece is composed in, and paint stops
  // at its edge.
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
      const days = factNum(data.facts, "window.days_inclusive");
      drawSlug(ctx, view, [
        "THE RECORD KEEPS ENDPOINTS",
        `WHAT HAPPENED BETWEEN THEM WAS PUBLIC FOR ${days} DAYS`,
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
