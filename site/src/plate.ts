/** The plate: one halfcourt, engraved, that never moves.
 *
 * Court coordinates are the record's own - tenths of a foot, hoop at the
 * origin, exactly as data/processed carries them - so no shot is ever
 * transformed on its way to the screen beyond scale and offset.
 */

import { LINE, LINE_FAINT } from "./palette";
// The lines this file engraves ARE the lines that classify a shot, so it draws
// them from the same module the classifier reads. Three copies of the geometry
// lived in the site before zone.ts; one drifting from another would put the
// plate's own arc somewhere other than where the colour changes.
import {
  CORNER_X,
  FREE_THROW_Y,
  LANE_HALF_W,
  RESTRICTED_R,
  THREE_R,
} from "./zone";

/** The halfcourt box the pipeline clips to (tenths of feet, hoop origin). */
export const COURT = { x0: -250, x1: 250, y0: -50, y1: 420 } as const;

// Geometry in tenths of feet from the hoop. The hoop sits 5.25 ft from the
// baseline, which is why the baseline is at -52.5 and the plate clips at -50.
const BASELINE_Y = -52.5;
const FREE_THROW_R = 60;
const RIM_R = 7.5;
const BACKBOARD_Y = -12.5;
const BACKBOARD_HALF_W = 30;

/** The line in force in 1994-97, in court tenths, from the season's own
 *  artifact. Drawn only for the 1996-97 disagreement, where the taxonomy and
 *  the era part company - and read from `contemporaneous.line_ft`, the same key
 *  the counter-inscription prints, so the arc and the words agree by
 *  construction rather than by coincidence. */
export function shortenedThreeR(lineFt: number): number {
  return 10 * lineFt;
}

export interface View {
  /** Court tenths -> screen px. */
  sx(x: number): number;
  sy(y: number): number;
  /** Length in court tenths -> px. */
  s(len: number): number;
  scale: number;
  width: number;
  height: number;
}

/** Fit the halfcourt into the viewport with generous margin - the plate hangs,
 *  it does not fill. */
export function makeView(width: number, height: number, margin = 0.1): View {
  const cw = COURT.x1 - COURT.x0;
  const ch = COURT.y1 - COURT.y0;
  const scale = Math.min((width * (1 - margin)) / cw, (height * (1 - margin)) / ch);
  const originX = width / 2;
  const originY = height / 2 + ((COURT.y1 + COURT.y0) / 2) * scale;
  return {
    scale,
    width,
    height,
    sx: (x) => originX + x * scale,
    sy: (y) => originY - y * scale,
    s: (len) => len * scale,
  };
}

function strokePath(ctx: CanvasRenderingContext2D, color: string, w: number, path: () => void) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  path();
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw the engraving. `threeR` lets the arc carry the era actually in force:
 * the 1996-97 beat strikes the 22-ft line the taxonomy has since overwritten.
 */
export function drawPlate(ctx: CanvasRenderingContext2D, view: View, threeR = THREE_R): void {
  const { sx, sy, s } = view;
  const hair = Math.max(1, view.scale * 1.1);

  // Baseline and sidelines.
  strokePath(ctx, LINE, hair, () => {
    ctx.moveTo(sx(COURT.x0), sy(BASELINE_Y));
    ctx.lineTo(sx(COURT.x1), sy(BASELINE_Y));
    ctx.moveTo(sx(COURT.x0), sy(BASELINE_Y));
    ctx.lineTo(sx(COURT.x0), sy(COURT.y1));
    ctx.moveTo(sx(COURT.x1), sy(BASELINE_Y));
    ctx.lineTo(sx(COURT.x1), sy(COURT.y1));
  });

  // The lane and the free-throw circle.
  strokePath(ctx, LINE, hair, () => {
    ctx.moveTo(sx(-LANE_HALF_W), sy(BASELINE_Y));
    ctx.lineTo(sx(-LANE_HALF_W), sy(FREE_THROW_Y));
    ctx.lineTo(sx(LANE_HALF_W), sy(FREE_THROW_Y));
    ctx.lineTo(sx(LANE_HALF_W), sy(BASELINE_Y));
    ctx.moveTo(sx(FREE_THROW_R), sy(FREE_THROW_Y));
    ctx.arc(sx(0), sy(FREE_THROW_Y), s(FREE_THROW_R), 0, Math.PI * 2);
  });

  // The three-point line: corner segments to where they meet the arc.
  const cornerX = Math.min(CORNER_X, threeR);
  const meetY = Math.sqrt(Math.max(0, threeR * threeR - cornerX * cornerX));
  strokePath(ctx, LINE, hair, () => {
    ctx.moveTo(sx(-cornerX), sy(BASELINE_Y));
    ctx.lineTo(sx(-cornerX), sy(meetY));
    ctx.moveTo(sx(cornerX), sy(BASELINE_Y));
    ctx.lineTo(sx(cornerX), sy(meetY));
  });
  strokePath(ctx, LINE, hair, () => {
    const a = Math.atan2(meetY, cornerX);
    ctx.arc(sx(0), sy(0), s(threeR), -Math.PI + a, -a, false);
  });

  // Backboard, rim, restricted arc - the apparatus at the centre of the record.
  strokePath(ctx, LINE_FAINT, hair, () => {
    ctx.moveTo(sx(-BACKBOARD_HALF_W), sy(BACKBOARD_Y));
    ctx.lineTo(sx(BACKBOARD_HALF_W), sy(BACKBOARD_Y));
  });
  strokePath(ctx, LINE_FAINT, hair, () => {
    ctx.moveTo(sx(RIM_R), sy(0));
    ctx.arc(sx(0), sy(0), s(RIM_R), 0, Math.PI * 2);
  });
  strokePath(ctx, LINE_FAINT, hair, () => {
    ctx.arc(sx(0), sy(0), s(RESTRICTED_R), -Math.PI, 0, false);
  });
}
