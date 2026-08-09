/** The pin, and a dormant texture ladder.
 *
 * WHAT IN THIS FILE ACTUALLY DRAWS. Only `drawPin` and `clearStamps` are
 * imported anywhere: the pin, by modes/fieldlayer.ts, and the cache reset by
 * the purity probe, which needs to force a cold start. `drawMarks`, `stampsFor`
 * and `stamp` are the two-hand texture ladder, and nothing calls them — since
 * commit e811cab THE FIELD bakes every shot into one image (field.ts) instead
 * of stamping the fixed-seed sample, and that layer COLLAPSES the count classes,
 * summing `hires` and `rest` per cell. So the arena-inlay content the ladder
 * below describes is not on screen at all.
 *
 * It is kept, deliberately, and it is session 5's to decide: deleting it would
 * silently remove the option of restoring the ladder over the baked field, and
 * the loss is recorded in CLAUDE.md rather than left for a reader to discover.
 * INK is live through INK_REFERENCE_MARKS, which sets the pin's radius.
 *
 * THE LADDER'S CLAIM, for whoever restores it. The four regimes in `resolution`
 * are measured ONLY over restricted-area shots — whether the record would say
 * *where at the rim* a layup happened. Away from the rim its precision is a
 * constant tenth of a foot in every season and every building (CLAUDE.md ground
 * truth), and the plan rejects coordinate precision as a driver for exactly
 * that reason. So the grain claims only what is measured:
 *
 *   at the rim    the era's regime decides how a shot is drawn, because that is
 *                 where the regime was measured. In the uneven era the building
 *                 decides, so shots from arenas that recorded rim coordinates
 *                 are placed and the rest are in the pin.
 *   off the rim   every mark, every era, is drawn at the same fineness, because
 *                 the record placed them all to the same tenth of a foot.
 *
 * The era ladder is carried by the thing that genuinely changed: how much of
 * the plate the record refused to place (`resolution.origin_snapped_share`).
 *
 * Shots filed at the origin are never scattered apart to make the chart look
 * right. They are drawn as what they are: one pile, at one point.
 *
 * Every material scalar here is declared in src/scalars.ts.
 */

import type { Sample, Season } from "./data";
import { RESTRICTED_R } from "./zone";
import { BONE_RGB } from "./palette";
import type { View } from "./plate";
import {
  COARSE_R,
  COARSE_SOFTNESS,
  INK,
  INK_REFERENCE_MARKS,
  PIN_CORE_ALPHA,
  PIN_MEAN_ALPHA_K,
  PIN_STOP_MID,
  PIN_STOP_MID_ALPHA_K,
  PIN_STOP_OUTER,
  PIN_STOP_OUTER_ALPHA_K,
  SHARP_R,
  SHARP_SOFTNESS,
  STAMP_CORE_ALPHA,
  STAMP_GRAD_MIN_R,
  STAMP_MAX_GAIN,
  STAMP_MIN_CORE,
  STAMP_MIN_R_PX,
} from "./scalars";

interface Hand {
  /** Mark radius in COURT units (tenths of a foot), so a mark is the same size
   *  on the floor at any window size - the era's grain must not depend on the
   *  display it is shown on. */
  radius: number;
  /** 0 = hard edge, 1 = fully diffuse. Stands for how definitely the record
   *  placed this KIND of shot in this era - not for confidence in this mark's
   *  coordinate, whose precision is one constant quantum in every season. */
  softness: number;
  alpha: number;
}

/**
 * Ink is conserved. A season's shots deposit the same total light however
 * finely they were recorded - resolution changes only how that light is
 * *spread*, never how much there is. Without this the fine eras would read as
 * "less data" instead of "a better record", which is the opposite of true.
 *
 * INK and INK_REFERENCE_MARKS are declared in src/scalars.ts with what each
 * controls. Their product is the light a whole season deposits, so every season
 * stays comparable and the pin stays exactly as heavy as the shots it stands
 * for.
 */
export const INK_TOTAL = INK_REFERENCE_MARKS * INK;

function hand(radius: number, softness: number): Hand {
  // Alpha is set later, once the sprite's actual deposited light is measured -
  // a gradient's integral is not alpha*r^2, and deriving it by hand is how the
  // diffuse mark ended up a third brighter than the tight one.
  return { radius, softness, alpha: 1 };
}

/** Placed to the tenth of a foot: a tight mark. */
const SHARP: Hand = hand(SHARP_R, SHARP_SOFTNESS);
/** A shot the record of this era placed only loosely: the same ink, spread wide. */
const COARSE: Hand = hand(COARSE_R, COARSE_SOFTNESS);

/** Where the regime was measured: the restricted area, 4 ft from the hoop -
 *  the league's own circle, taken from the one module that defines it. */
const RESTRICTED_R_TENTHS = RESTRICTED_R;

interface Stamp {
  canvas: HTMLCanvasElement;
  /** Draw size in CSS px. */
  size: number;
  /** Multiplier that makes this stamp deposit exactly INK. */
  gain: number;
}

const stampCache = new Map<string, Stamp>();
/** Deposited light depends only on a stamp's geometry, never on its hue, so the
 *  measurement is taken once per geometry and shared by every colour. Without
 *  it, every zone times every hand would mean a synchronous getImageData
 *  readback each, on every resize. */
const gainCache = new Map<string, number>();

/** Empty both caches. Nothing in the piece calls this: they are keyed by every
 *  input they depend on, so a hit and a miss must produce the same pixels. That
 *  claim is what the purity probe checks, and it can only check it from cold. */
export function clearStamps(): void {
  stampCache.clear();
  gainCache.clear();
}

/** Pre-render a mark so soft edges cost nothing per dot, and measure the light
 *  it deposits so every hand can be normalised to the same total. */
export function stamp(hand: Hand, pxPerTenth: number, dpr: number, rgb = BONE_RGB): Stamp {
  const geometry = `${hand.radius}|${hand.softness}|${pxPerTenth.toFixed(3)}|${dpr}`;
  const key = `${geometry}|${rgb}`;
  const hit = stampCache.get(key);
  if (hit) return hit;

  // Radius is in court tenths; convert once, here, so the mark keeps its size
  // on the floor whatever the window does.
  const rCss = Math.max(STAMP_MIN_R_PX, hand.radius * pxPerTenth);
  const r = rCss * dpr;
  const pad = Math.ceil(r * (1 + hand.softness * 2)) + 2;
  const size = pad * 2;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;

  const grad = g.createRadialGradient(pad, pad, 0, pad, pad, Math.max(r, STAMP_GRAD_MIN_R) * (1 + hand.softness * 2));
  const core = Math.max(STAMP_MIN_CORE, 1 - hand.softness);
  grad.addColorStop(0, `rgba(${rgb}, 1)`);
  grad.addColorStop(core, `rgba(${rgb}, ${STAMP_CORE_ALPHA})`);
  grad.addColorStop(1, `rgba(${rgb}, 0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);

  // Measure rather than derive: sum the alpha the stamp actually lays down.
  // Cached by geometry, because the alpha profile is identical for every hue.
  let gain = gainCache.get(geometry);
  if (gain === undefined) {
    const data = g.getImageData(0, 0, size, size).data;
    let sum = 0;
    for (let i = 3; i < data.length; i += 4) sum += data[i]!;
    const deposited = sum / 255 / (dpr * dpr); // in CSS px
    gain = Math.min(STAMP_MAX_GAIN, INK / Math.max(deposited, 1e-6));
    gainCache.set(geometry, gain);
  }

  const out: Stamp = { canvas: c, size: size / dpr, gain };
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
  /**
   * One "r, g, b" string per zone index, for THE FIELD. Hue then comes from
   * `sample.zone` — the NBA's own seven categories, filed by the pipeline — so
   * the colour is their classification made visible, never a mood.
   */
  palette?: string[];
}

export interface StampSet {
  sharp: Stamp;
  coarse: Stamp;
}

/** Both hands in one hue, so a mode can pre-warm the cache it needs. */
export function stampsFor(view: View, dpr: number, rgb?: string): StampSet {
  return { sharp: stamp(SHARP, view.scale, dpr, rgb), coarse: stamp(COARSE, view.scale, dpr, rgb) };
}

export function drawMarks(
  ctx: CanvasRenderingContext2D,
  view: View,
  sample: Sample,
  season: Season,
  opts: MarkOpts,
): void {
  const { dpr, opacity, arrived = 1, palette } = opts;
  if (opacity <= 0.001) return;

  // One stamp pair per hue in play. Bone when no palette is given.
  const sets: StampSet[] = palette
    ? palette.map((rgb) => stampsFor(view, dpr, rgb))
    : [stampsFor(view, dpr)];

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  const n = Math.min(sample.n, Math.ceil(sample.n * Math.min(1, Math.max(0, arrived))));
  let current: Stamp | null = null;
  for (let i = 0; i < n; i++) {
    // Origin-filed shots are held back for the pin; drawing them as dots
    // would stack the whole of `resolution.origin_snapped` on one pixel and
    // read as a rendering bug rather than as the record's silence.
    if (sample.pin[i] === 1) continue;
    const x = sample.x[i]!;
    const y = sample.y[i]!;
    const h = handFor(season, sample.hires[i] === 1, x, y);
    const set = palette
      ? sets[Math.min(sets.length - 1, Math.max(0, sample.zone?.[i] ?? 0))]!
      : sets[0]!;
    const s = h === SHARP ? set.sharp : set.coarse;
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
 *
 * "WHERE IT FILED THEM" IS NOT ALWAYS THE ORIGIN, and until 2026-08-09 this
 * function assumed it was. Six seasons file their refusal a tenth (then six
 * tenths) of a foot off centre, so the centre is passed in - from
 * `fieldlayer.ts:pinCoordOf`, which is the one derivation of it in the piece.
 * `null` means the season refused nothing, and nothing is drawn.
 */
export function drawPin(
  ctx: CanvasRenderingContext2D,
  view: View,
  pinFraction: number,
  coord: [number, number] | null,
  opts: MarkOpts,
): void {
  const { opacity, arrived = 1 } = opts;
  if (opacity <= 0.001) return;
  if (pinFraction <= 0) return;
  if (coord === null) return;

  // The pile grows with the season, like every other mark.
  const grown = Math.min(1, Math.max(0, arrived)) * pinFraction;

  // Same ink rule as before, but taken from the season's own measured share of
  // unplaced shots rather than counted out of a sample. The season's size
  // cancels: count * INK_N = (fraction * N) * (INK_TOTAL / N). So the pile is
  // exactly as heavy as the shots inside it whatever the season's attempt count,
  // and the two O(n) scans this used to need are gone.
  const meanAlpha = PIN_CORE_ALPHA * PIN_MEAN_ALPHA_K;
  const r = Math.sqrt((grown * INK_TOTAL) / (meanAlpha * Math.PI));
  const cx = view.sx(coord[0]);
  const cy = view.sy(coord[1]);

  ctx.save();
  ctx.globalAlpha = opacity;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  // A definite edge, not a bloom: this is a struck pin standing for a silence,
  // and a soft glow would read as atmosphere rather than as a fact.
  grad.addColorStop(0, `rgba(${BONE_RGB}, ${PIN_CORE_ALPHA})`);
  grad.addColorStop(PIN_STOP_MID, `rgba(${BONE_RGB}, ${PIN_CORE_ALPHA * PIN_STOP_MID_ALPHA_K})`);
  grad.addColorStop(PIN_STOP_OUTER, `rgba(${BONE_RGB}, ${PIN_CORE_ALPHA * PIN_STOP_OUTER_ALPHA_K})`);
  grad.addColorStop(1, `rgba(${BONE_RGB}, 0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
