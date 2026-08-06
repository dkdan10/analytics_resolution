/** Act III - the bloom.
 *
 * For 89 days the public record held the whole gesture. Here the dots the plate
 * has been drawing all along open into the movements that produced them, and
 * then close again.
 *
 * Each trace is anchored at its own dot: pipeline/bloom.py verified that the
 * ball's position at release, carried into the shot record's frame, lands a
 * median 0.75 ft from where the record filed the shot. The traces are not
 * placed near their dots - they grow out of them.
 */

import { BONE_RGB } from "./palette";
import type { View } from "./plate";

export interface Trace {
  game: string;
  date: string;
  player: string;
  zone: string;
  made: number;
  anchor: [number, number];
  anchor_residual_ft: number;
  /** Index into `points` where the ball leaves the hand. */
  release_index: number;
  hz: number;
  /** [x tenths, y tenths, z feet], hoop at origin. */
  points: [number, number, number][];
}

export interface TracesFile {
  median_anchor_residual_ft: number;
  traces: Trace[];
}

/** Rim height, the only scale the ball's third dimension needs. */
const RIM_FT = 10;

/**
 * Traces pass one at a time, the way possessions do.
 *
 * Drawn simultaneously, thirty-two gestures overlap into a starburst at the rim
 * and nothing is legible - the opposite of the claim Act III makes, which is
 * that for 89 days you could see *the gesture*. So each trace draws itself,
 * holds, and fades, staggered so only two or three share the plate at once.
 */
const DRAW_S = 1.3;
const HOLD_S = 2.2;
const FADE_S = 2.4;
const LIFE_S = DRAW_S + HOLD_S + FADE_S;
/** Ignitions are spread across this much of the act; the tail is the closing. */
const SPREAD = 0.86;

export interface BloomTiming {
  /** 0..1 through Act III. */
  phase: number;
  /** Seconds Act III lasts, so ignition can be spread across it. */
  duration: number;
}

/**
 * How far a given trace has drawn itself, 0..1, and how lit it is.
 * Pure function of the act's phase - no animation state anywhere.
 */
function traceState(i: number, n: number, timing: BloomTiming): { drawn: number; alpha: number } {
  const { phase, duration } = timing;
  const t = phase * duration;
  const igniteAt = (i / Math.max(1, n)) * duration * SPREAD;
  const u = t - igniteAt;
  if (u < 0 || u > LIFE_S) return { drawn: 0, alpha: 0 };

  const drawn = Math.min(1, u / DRAW_S);
  // On Jan 23 the window closes on whatever is still lit.
  const closing = Math.max(0, Math.min(1, (phase - 0.94) / 0.06));
  let alpha = 1;
  if (u > DRAW_S + HOLD_S) alpha = 1 - (u - DRAW_S - HOLD_S) / FADE_S;
  return { drawn, alpha: Math.max(0, alpha) * (1 - closing) };
}

/**
 * Draw the traces. Ball height becomes luminance, so the arc brightens as it
 * rises and dims into the rim - the one channel the machine saw in three
 * dimensions, used as the only channel that changes.
 */
export function drawBloom(
  ctx: CanvasRenderingContext2D,
  view: View,
  traces: Trace[],
  timing: BloomTiming,
): void {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  traces.forEach((tr, i) => {
    const { drawn, alpha } = traceState(i, traces.length, timing);
    if (alpha <= 0.001 || drawn <= 0) return;

    const pts = tr.points;
    const last = Math.max(1, Math.floor(pts.length * drawn));

    for (let k = 1; k < last; k++) {
      const a = pts[k - 1]!;
      const b = pts[k]!;
      // Height above the floor, normalised at the rim.
      const h = Math.min(1.4, Math.max(0, b[2] / RIM_FT));
      const lit = 0.1 + 0.62 * h;
      // The gesture before the release is quieter than the shot itself.
      const inFlight = k >= tr.release_index;
      const w = (inFlight ? 1.5 : 1.0) * Math.max(1, view.scale * 0.55);

      ctx.strokeStyle = `rgba(${BONE_RGB}, ${lit * alpha * (inFlight ? 1 : 0.72)})`;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(view.sx(a[0]), view.sy(a[1]));
      ctx.lineTo(view.sx(b[0]), view.sy(b[1]));
      ctx.stroke();
    }

    // The dot it grew out of, held brighter than the field around it.
    const [ax, ay] = tr.anchor;
    ctx.fillStyle = `rgba(${BONE_RGB}, ${0.8 * alpha})`;
    ctx.beginPath();
    ctx.arc(view.sx(ax), view.sy(ay), Math.max(1.2, view.scale * 0.9), 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}
