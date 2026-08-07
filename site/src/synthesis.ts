/** The coda: the piece's account of itself.
 *
 * Three curves, drawn plainly, after the last season and before the loop turns
 * over. They are the whole argument reduced to what was measured:
 *
 *   WHERE     how much of the rim the record would not place — 95.4% to 0% to 9%
 *   WHAT      how many words it had for a shot — nine to forty-eight
 *   HOW MUCH  the mid-range's share of every shot — 39.9% to 9.7%
 *
 * The first two are the record describing itself; the third is the game. Set
 * side by side they are the thesis: as the archive lost the ability to say
 * *where*, it became fluent in saying *what*, and the thing it was describing
 * drained out of the middle of the floor.
 *
 * This belongs to no hand. Every mode ends here, because the account is the
 * piece's rather than any one rendering's.
 */

import type { Season } from "./data";
import { drawSlug } from "./inscription";
import { BONE_RGB } from "./palette";
import type { View } from "./plate";
import { label } from "./textatlas";

interface Curve {
  key: string;
  caption: string;
  values: number[];
  /** Endpoint readings, already formatted the way the piece speaks. */
  first: string;
  last: string;
  /** Court y of the curve's baseline, in tenths. */
  base: number;
}

const HEIGHT = 62;
const X0 = -215;
const X1 = 215;

function pct(v: number): string {
  return `${(100 * v).toFixed(1).replace(".", "·")}%`;
}

export function buildCurves(seasons: Season[]): Curve[] {
  const where = seasons.map((s) => s.resolution.ra_origin_share);
  const what = seasons.map((s) => s.vocabulary.words);
  const much = seasons.map((s) => s.mid_share);
  const at = <T>(a: T[], i: number): T => a[i]!;
  const n = seasons.length;

  return [
    {
      key: "WHERE",
      caption: "RIM SHOTS THE RECORD WOULD NOT PLACE",
      values: where,
      first: pct(at(where, 0)),
      last: pct(at(where, n - 1)),
      base: 330,
    },
    {
      key: "WHAT",
      caption: "WORDS IT HAD FOR A SHOT",
      values: what,
      first: String(at(what, 0)),
      last: String(at(what, n - 1)),
      base: 205,
    },
    {
      key: "HOW MUCH",
      caption: "THE MID-RANGE'S SHARE OF EVERY SHOT",
      values: much,
      first: pct(at(much, 0)),
      last: pct(at(much, n - 1)),
      base: 80,
    },
  ];
}

function smoothstep(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
}

/**
 * `coda` runs 0..1 through the closing. The curves draw themselves in sequence,
 * left to right, then hold, then release so the loop returns to bare stone
 * rather than cutting.
 */
export function drawSynthesis(
  ctx: CanvasRenderingContext2D,
  view: View,
  curves: Curve[],
  coda: number,
  dpr: number,
): void {
  const appear = smoothstep(coda / 0.14);
  const release = 1 - smoothstep((coda - 0.88) / 0.12);
  const alpha = appear * release;
  if (alpha <= 0.01) return;

  const px = Math.max(8, 9.5 * (view.scale / 2));

  curves.forEach((curve, ci) => {
    // Staggered, so the three arrive as an argument rather than a diagram.
    const started = (coda - 0.06 - ci * 0.12) / 0.34;
    const drawn = smoothstep(started);
    if (drawn <= 0.001) return;

    const lo = Math.min(...curve.values);
    const hi = Math.max(...curve.values);
    const span = hi - lo || 1;
    const n = curve.values.length;
    const upto = Math.max(2, Math.ceil(n * drawn));

    ctx.save();
    ctx.globalAlpha = alpha;

    // The baseline the curve is read against.
    ctx.strokeStyle = `rgba(${BONE_RGB}, 0.08)`;
    ctx.lineWidth = Math.max(1, view.scale * 0.8);
    ctx.beginPath();
    ctx.moveTo(view.sx(X0), view.sy(curve.base));
    ctx.lineTo(view.sx(X1), view.sy(curve.base));
    ctx.stroke();

    ctx.strokeStyle = `rgba(${BONE_RGB}, 0.78)`;
    ctx.lineWidth = Math.max(1.4, view.scale * 1.3);
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let i = 0; i < upto; i++) {
      const x = X0 + ((X1 - X0) * i) / (n - 1);
      const y = curve.base + HEIGHT * ((curve.values[i]! - lo) / span);
      if (i === 0) ctx.moveTo(view.sx(x), view.sy(y));
      else ctx.lineTo(view.sx(x), view.sy(y));
    }
    ctx.stroke();

    // The two readings that matter, at the ends they belong to.
    if (drawn > 0.08) {
      const y0 = curve.base + HEIGHT * ((curve.values[0]! - lo) / span);
      const first = label(curve.first, px, dpr);
      ctx.globalAlpha = alpha * 0.85;
      ctx.drawImage(
        first.canvas,
        view.sx(X0) - first.width - px * 0.5,
        view.sy(y0) - first.height / 2,
        first.width,
        first.height,
      );
    }
    if (drawn > 0.98) {
      const yn = curve.base + HEIGHT * ((curve.values[n - 1]! - lo) / span);
      const last = label(curve.last, px, dpr);
      ctx.globalAlpha = alpha * 0.85;
      ctx.drawImage(
        last.canvas,
        view.sx(X1) + px * 0.5,
        view.sy(yn) - last.height / 2,
        last.width,
        last.height,
      );
    }
    ctx.restore();

    drawSlug(ctx, view, [`${curve.key} · ${curve.caption}`],
      { x: 0, y: curve.base + HEIGHT + 26 }, alpha * 0.95);
  });
}
