/** The shared field: every shot, for whichever hand is drawing.
 *
 * All four hands want the same thing beneath them — the season's whole record,
 * developing — differing only in whether it carries the league's colours and
 * how far it is dimmed. This keeps that in one place so the composite rules
 * (blit with `lighter`, pin drawn separately and source-over, previous season
 * receding as the current one develops) cannot drift apart between hands.
 */

import { bakeLayer, developed, drawLayer } from "../field";
import { drawPin } from "../marks";
import type { Frame } from "./types";

export interface FieldOpts {
  /** Hue from the NBA's seven zones, for THE FIELD. */
  coloured?: boolean;
  /** Overall dim, before development. */
  dim: number;
  /** THE CENSUS draws no outgoing season: a field still holding the previous
   *  season's shots would contradict a tally counting only this one. */
  withPrevious?: boolean;
}

export function drawSeasonField(f: Frame, opts: FieldOpts): void {
  const { ctx, view, dpr, st, data } = f;
  const { coloured = false, dim, withPrevious = true } = opts;
  const year = st.year!;

  if (withPrevious && st.prev !== null) {
    const prevSeason = data.byYear.get(st.prev);
    const prevPts = data.points(st.prev);
    if (prevSeason && prevPts) {
      const fading = (1 - st.arrived) * dim;
      drawLayer(ctx, bakeLayer(st.prev, prevPts, coloured, view, dpr), view, fading);
      drawPin(ctx, view, pinFractionOf(prevSeason), { dpr, opacity: fading });
    }
  }

  const season = data.byYear.get(year)!;
  const pts = data.points(year);
  if (pts) {
    drawLayer(ctx, bakeLayer(year, pts, coloured, view, dpr), view, developed(st.arrived) * dim);
  }
  // The pin is never baked into the layer: it occludes rather than adds, and
  // it stands for shots the record refused to place, so it belongs to no zone
  // and takes no colour.
  drawPin(ctx, view, pinFractionOf(season), { dpr, opacity: dim, arrived: st.arrived });
}

/** The season's measured share of shots the record filed at the origin. */
export function pinFractionOf(season: { resolution: { origin_snapped: number }; attempts: number }): number {
  return season.attempts ? season.resolution.origin_snapped / season.attempts : 0;
}
