/** Act III - the bloom.
 *
 * For 89 days the public record held the whole gesture. Here the dots the plate
 * has been drawing all along open into the movements that produced them, and
 * then close again.
 *
 * Each trace is anchored at its own dot: pipeline/bloom.py checks that the
 * ball's position at release, carried into the shot record's frame, lands close
 * to where the record filed that shot, and drops the trace if it does not. The
 * measured residual ships in traces.json as `median_anchor_residual_ft` - read
 * it there rather than quoting a figure here, which is how this comment came to
 * state a number the artifact had long since superseded.
 */

import { BONE_RGB } from "./palette";
import type { View } from "./plate";
import {
  RIM_FT,
  TRACE_ANCHOR_ALPHA,
  TRACE_ANCHOR_MIN_PX,
  TRACE_ANCHOR_SCALE,
  TRACE_APPROACH_DIM,
  TRACE_HEIGHT_CLAMP,
  TRACE_LIT_FLOOR,
  TRACE_LIT_RANGE,
  TRACE_W_APPROACH,
  TRACE_W_IN_FLIGHT,
  TRACE_W_SCALE,
} from "./scalars";

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

/**
 * Traces pass one at a time, the way possessions do.
 *
 * Drawn simultaneously, every curated gesture in `traces.json` overlaps into a
 * starburst at the rim and nothing is legible - the opposite of the claim Act
 * III makes, which is that for the window's span you could see *the gesture*.
 * So each trace draws itself, holds, and fades, staggered so only two or three
 * share the plate at once.
 */
const DRAW_S = 1.3;
const HOLD_S = 2.2;
const FADE_S = 2.4;
const LIFE_S = DRAW_S + HOLD_S + FADE_S;
/** Ignitions are spread across this much of the act. The remainder belongs to
 *  the terminal beat: the last gesture is still fading as the shell's three
 *  lines strike, and the closing takes whatever is left lit. The old value
 *  left the plate holding an empty-of-event frame inside the window — the
 *  leftover of this arithmetic, which both display audits hashed
 *  independently. Absence must be an event, not a remainder. */
const SPREAD = 0.96;

export interface BloomTiming {
  /** 0..1 through Act III. */
  phase: number;
  /** Seconds Act III lasts, so ignition can be spread across it. */
  duration: number;
}

/** Where trace `i` of `n` ignites, as a fraction of the act's phase. One
 *  definition, two readers — the drawing below and the talk rail's PLATE
 *  interior (THE SECOND SCORE) — the same discipline as `WINDOW_BEATS`. */
export function ignitePhase(i: number, n: number): number {
  return (i / Math.max(1, n)) * SPREAD;
}

/**
 * How far a given trace has drawn itself, 0..1, and how lit it is.
 * Pure function of the act's phase - no animation state anywhere.
 */
function traceState(i: number, n: number, timing: BloomTiming): { drawn: number; alpha: number } {
  const { phase, duration } = timing;
  const t = phase * duration;
  const igniteAt = ignitePhase(i, n) * duration;
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
      const h = Math.min(TRACE_HEIGHT_CLAMP, Math.max(0, b[2] / RIM_FT));
      const lit = TRACE_LIT_FLOOR + TRACE_LIT_RANGE * h;
      // The gesture before the release is quieter than the shot itself.
      const inFlight = k >= tr.release_index;
      const w = (inFlight ? TRACE_W_IN_FLIGHT : TRACE_W_APPROACH)
        * Math.max(1, view.scale * TRACE_W_SCALE);

      ctx.strokeStyle =
        `rgba(${BONE_RGB}, ${lit * alpha * (inFlight ? 1 : TRACE_APPROACH_DIM)})`;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(view.sx(a[0]), view.sy(a[1]));
      ctx.lineTo(view.sx(b[0]), view.sy(b[1]));
      ctx.stroke();
    }

    // The dot it grew out of, held brighter than the field around it.
    const [ax, ay] = tr.anchor;
    ctx.fillStyle = `rgba(${BONE_RGB}, ${TRACE_ANCHOR_ALPHA * alpha})`;
    ctx.beginPath();
    ctx.arc(view.sx(ax), view.sy(ay),
      Math.max(TRACE_ANCHOR_MIN_PX, view.scale * TRACE_ANCHOR_SCALE), 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}
