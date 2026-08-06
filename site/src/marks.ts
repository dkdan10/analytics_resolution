/** The texture ladder: grain is a measurement, not a mood.
 *
 * Every material property of a mark derives from something measured about that
 * era's record (pipeline/aggregate.py, `resolution`), never from taste:
 *
 *   uniformly_blind      the record knows roughly, everywhere - one coarse hand
 *   uneven               it depended on the building - sharp marks from arenas
 *                        that recorded rim coordinates, coarse from the rest
 *   uniformly_sighted    every arena places every shot - one fine hand
 *   categorical_refusal  fine, but a small class of shots is refused a place
 *
 * Shots the record filed at the origin are never scattered apart to make the
 * chart look right. They are drawn as what they are: one pile, at one point.
 */

import type { Sample, Season } from "./data";
import { BONE_RGB } from "./palette";
import type { View } from "./plate";

interface Hand {
  /** Mark radius in px at unit scale. */
  radius: number;
  /** 0 = hard edge, 1 = fully diffuse. Stands for positional confidence. */
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
const INK = 1.85;

function hand(radius: number, softness: number): Hand {
  return { radius, softness, alpha: Math.min(0.95, INK / (radius * radius)) };
}

/** Placed to the tenth of a foot: a tight mark, high confidence. */
const SHARP: Hand = hand(1.6, 0.3);
/** The record knows roughly: the same ink, spread wide. */
const COARSE: Hand = hand(3.1, 0.95);

/** The pin is the densest thing on the plate - it has to be, it is a pile. */
const PIN_CORE_ALPHA = 0.62;

const spriteCache = new Map<string, HTMLCanvasElement>();

/** Pre-render a mark so soft edges cost nothing per dot. */
function sprite(hand: Hand, dpr: number): HTMLCanvasElement {
  const key = `${hand.radius}|${hand.softness}|${hand.alpha}|${dpr}`;
  const hit = spriteCache.get(key);
  if (hit) return hit;

  const r = hand.radius * dpr;
  const pad = Math.ceil(r * 3) + 2;
  const size = pad * 2;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;

  const grad = g.createRadialGradient(pad, pad, 0, pad, pad, Math.max(r, 0.5) * (1 + hand.softness * 2));
  const core = Math.max(0.02, 1 - hand.softness);
  grad.addColorStop(0, `rgba(${BONE_RGB}, ${hand.alpha})`);
  grad.addColorStop(core, `rgba(${BONE_RGB}, ${hand.alpha * 0.55})`);
  grad.addColorStop(1, `rgba(${BONE_RGB}, 0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);

  spriteCache.set(key, c);
  return c;
}

/** Which hand drew a given dot, from the season's measured regime. */
function handFor(season: Season, hires: boolean): Hand {
  switch (season.resolution.regime) {
    case "uniformly_blind":
      return COARSE;
    case "uneven":
      return hires ? SHARP : COARSE;
    default:
      return SHARP;
  }
}

export interface MarkOpts {
  dpr: number;
  /** Global opacity, for crossfades between seasons. */
  opacity: number;
}

export function drawMarks(
  ctx: CanvasRenderingContext2D,
  view: View,
  sample: Sample,
  season: Season,
  opts: MarkOpts,
): void {
  const { dpr, opacity } = opts;
  if (opacity <= 0.001) return;

  const sharpSprite = sprite(SHARP, dpr);
  const coarseSprite = sprite(COARSE, dpr);

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.globalCompositeOperation = "lighter";

  const n = sample.n;
  for (let i = 0; i < n; i++) {
    // Origin-filed shots are held back for the pin; drawing them as dots would
    // stack 680 marks on one pixel and read as a rendering bug rather than the
    // record's silence.
    if (sample.pin[i] === 1) continue;
    const x = sample.x[i]!;
    const y = sample.y[i]!;
    const hand = handFor(season, sample.hires[i] === 1);
    const img = hand === SHARP ? sharpSprite : coarseSprite;
    const w = img.width / dpr;
    const h = img.height / dpr;
    ctx.drawImage(img, view.sx(x) - w / 2, view.sy(y) - h / 2, w, h);
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
  const { opacity } = opts;
  if (opacity <= 0.001) return;

  let count = 0;
  for (let i = 0; i < sample.n; i++) if (sample.pin[i] === 1) count++;
  if (count === 0) return;

  // Same ink rule as the marks: the pile carries exactly the light of the shots
  // inside it, so it is as heavy on the plate as the record made it.
  const r = Math.sqrt((count * INK) / PIN_CORE_ALPHA) * (view.scale / 2);
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
