/** The texture ladder: grain is a measurement, not a mood.
 *
 * What the measurement actually covers matters, and an earlier version of this
 * file overstated it. The four regimes in `resolution` are measured ONLY over
 * restricted-area shots - whether the record would say *where at the rim* a
 * layup happened. Away from the rim the record's precision is a constant 0.1 ft
 * in all thirty seasons and all thirty buildings (CLAUDE.md ground truth), and
 * the approved plan rejects coordinate precision as a driver for exactly that
 * reason. So the grain claims only what is measured:
 *
 *   at the rim    the era's regime decides how a shot is drawn, because that is
 *                 where the regime was measured. In the uneven era the building
 *                 decides, so shots from arenas that recorded rim coordinates
 *                 are placed and the rest are in the pin.
 *   off the rim   every mark, every era, is drawn at the same fineness, because
 *                 the record placed them all to the same tenth of a foot.
 *
 * The era ladder is carried by the thing that genuinely changed: how much of
 * the plate the record refused to place. In 1996-97 that is a third of it.
 *
 * Shots filed at the origin are never scattered apart to make the chart look
 * right. They are drawn as what they are: one pile, at one point.
 */

import type { Sample, Season } from "./data";
import { BONE_RGB } from "./palette";
import type { View } from "./plate";

interface Hand {
  /** Mark radius in COURT units (tenths of a foot), so a mark is the same size
   *  on the floor at any window size - the era's grain must not depend on the
   *  display it is shown on. */
  radius: number;
  /** 0 = hard edge, 1 = fully diffuse. Stands for how definitely the record
   *  placed this KIND of shot in this era - not for confidence in this mark's
   *  coordinate, which is a constant 0.1 ft throughout. */
  softness: number;
  alpha: number;
}

/**
 * Ink is conserved. A season's shots deposit the same total light however
 * finely they were recorded - resolution changes only how that light is
 * *spread*, never how much there is. Without this the fine eras read as "less
 * data" instead of "a better record", which would be the opposite of true:
 * every season here is the same 2,000-dot sample of a full season.
 */
const INK = 9.0;

function hand(radius: number, softness: number): Hand {
  // Alpha is set later, once the sprite's actual deposited light is measured -
  // a gradient's integral is not alpha*r^2, and deriving it by hand is how the
  // diffuse mark ended up a third brighter than the tight one.
  return { radius, softness, alpha: 1 };
}

/** Placed to the tenth of a foot: a tight mark. */
const SHARP: Hand = hand(1.7, 0.3);
/** A shot the record of this era placed only loosely: the same ink, spread wide. */
const COARSE: Hand = hand(3.3, 0.95);

/** Where the regime was measured: the restricted area, 4 ft from the hoop. */
const RESTRICTED_R_TENTHS = 40;

/** The pin is the densest thing on the plate - it has to be, it is a pile. */
const PIN_CORE_ALPHA = 0.62;

interface Stamp {
  canvas: HTMLCanvasElement;
  /** Draw size in CSS px. */
  size: number;
  /** Multiplier that makes this stamp deposit exactly INK. */
  gain: number;
}

const stampCache = new Map<string, Stamp>();

/** Pre-render a mark so soft edges cost nothing per dot, and measure the light
 *  it deposits so every hand can be normalised to the same total. */
function stamp(hand: Hand, pxPerTenth: number, dpr: number): Stamp {
  const key = `${hand.radius}|${hand.softness}|${pxPerTenth.toFixed(3)}|${dpr}`;
  const hit = stampCache.get(key);
  if (hit) return hit;

  // Radius is in court tenths; convert once, here, so the mark keeps its size
  // on the floor whatever the window does.
  const rCss = Math.max(0.6, hand.radius * pxPerTenth);
  const r = rCss * dpr;
  const pad = Math.ceil(r * (1 + hand.softness * 2)) + 2;
  const size = pad * 2;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;

  const grad = g.createRadialGradient(pad, pad, 0, pad, pad, Math.max(r, 0.5) * (1 + hand.softness * 2));
  const core = Math.max(0.02, 1 - hand.softness);
  grad.addColorStop(0, `rgba(${BONE_RGB}, 1)`);
  grad.addColorStop(core, `rgba(${BONE_RGB}, 0.55)`);
  grad.addColorStop(1, `rgba(${BONE_RGB}, 0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);

  // Measure rather than derive: sum the alpha the stamp actually lays down.
  const data = g.getImageData(0, 0, size, size).data;
  let sum = 0;
  for (let i = 3; i < data.length; i += 4) sum += data[i]!;
  const deposited = sum / 255 / (dpr * dpr); // in CSS px
  const out: Stamp = {
    canvas: c,
    size: size / dpr,
    gain: Math.min(0.95, INK / Math.max(deposited, 1e-6)),
  };
  stampCache.set(key, out);
  return out;
}

/**
 * Which hand drew a given dot.
 *
 * The regime is measured over restricted-area shots only, so it decides only
 * those. Everywhere else the record placed the shot to a tenth of a foot in
 * every season and every building, and the mark says so.
 */
function handFor(season: Season, hires: boolean, x: number, y: number): Hand {
  if (Math.hypot(x, y) > RESTRICTED_R_TENTHS) return SHARP;
  switch (season.resolution.regime) {
    case "uniformly_blind":
      return COARSE;
    case "uneven":
      // In this era it is the building, not the shot: an arena that recorded
      // rim coordinates placed this one, and the rest are in the pin.
      return hires ? SHARP : COARSE;
    default:
      return SHARP;
  }
}

export interface MarkOpts {
  dpr: number;
  /** Global opacity, for the outgoing season receding beneath the incoming one. */
  opacity: number;
  /**
   * 0..1 of this season's marks laid down so far. The sample is in the season's
   * own order, so arrival is chronological: the record accumulates through the
   * season in front of you rather than appearing whole. Defaults to 1 for the
   * outgoing season, which has already finished arriving.
   */
  arrived?: number;
}

export function drawMarks(
  ctx: CanvasRenderingContext2D,
  view: View,
  sample: Sample,
  season: Season,
  opts: MarkOpts,
): void {
  const { dpr, opacity, arrived = 1 } = opts;
  if (opacity <= 0.001) return;

  const sharp = stamp(SHARP, view.scale, dpr);
  const coarse = stamp(COARSE, view.scale, dpr);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  const n = Math.min(sample.n, Math.ceil(sample.n * Math.min(1, Math.max(0, arrived))));
  let current: Stamp | null = null;
  for (let i = 0; i < n; i++) {
    // Origin-filed shots are held back for the pin; drawing them as dots would
    // stack 680 marks on one pixel and read as a rendering bug rather than the
    // record's silence.
    if (sample.pin[i] === 1) continue;
    const x = sample.x[i]!;
    const y = sample.y[i]!;
    const h = handFor(season, sample.hires[i] === 1, x, y);
    const s = h === SHARP ? sharp : coarse;
    if (s !== current) {
      ctx.globalAlpha = opacity * s.gain;
      current = s;
    }
    ctx.drawImage(s.canvas, view.sx(x) - s.size / 2, view.sy(y) - s.size / 2, s.size, s.size);
  }

  ctx.restore();
}

/**
 * The pin: every shot the record declined to place, drawn where it filed them.
 *
 * Its area is the summed area of the marks it stands for, so the pile is
 * exactly as heavy on the plate as the shots inside it - the most-shot place on
 * the court rendered as the one place the record could not see.
 */
export function drawPin(
  ctx: CanvasRenderingContext2D,
  view: View,
  sample: Sample,
  opts: MarkOpts,
): void {
  const { opacity, arrived = 1 } = opts;
  if (opacity <= 0.001) return;

  // The pile grows with the season, like every other mark.
  const upto = Math.min(sample.n, Math.ceil(sample.n * Math.min(1, Math.max(0, arrived))));
  let count = 0;
  for (let i = 0; i < upto; i++) if (sample.pin[i] === 1) count++;
  if (count === 0) return;

  // Same ink rule as the marks, and in the same measured units: each mark
  // deposits INK of light, so the pile deposits count * INK. Solving for a disc
  // of that total at the pin's mean alpha gives its radius directly in CSS px -
  // no scale factor, because INK is already measured at the current view.
  const meanAlpha = PIN_CORE_ALPHA * 0.7;
  const r = Math.sqrt((count * INK) / (meanAlpha * Math.PI));
  const cx = view.sx(0);
  const cy = view.sy(0);

  ctx.save();
  ctx.globalAlpha = opacity;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  // A definite edge, not a bloom: this is a struck pin standing for a silence,
  // and a soft glow would read as atmosphere rather than as a fact.
  grad.addColorStop(0, `rgba(${BONE_RGB}, ${PIN_CORE_ALPHA})`);
  grad.addColorStop(0.72, `rgba(${BONE_RGB}, ${PIN_CORE_ALPHA * 0.92})`);
  grad.addColorStop(0.9, `rgba(${BONE_RGB}, ${PIN_CORE_ALPHA * 0.45})`);
  grad.addColorStop(1, `rgba(${BONE_RGB}, 0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
