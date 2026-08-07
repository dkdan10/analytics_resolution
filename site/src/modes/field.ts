/** THE FIELD — the league's own colours.
 *
 * Hue comes from SHOT_ZONE_BASIC: seven categories the NBA authored and applies
 * to every shot it files. Colouring by them adds no classification, it exposes
 * one already imposed — which is the only footing on which this piece may use
 * colour at all, since its governing rule is that every material property of a
 * mark derives from a measurement.
 *
 * What it makes legible is the migration itself. Across thirty seasons the warm
 * middle of the floor drains (mid-range 21.5% → 7.0% of attempts by radial band)
 * while the cool arc floods (20.1% → 34.3%), so the whole image cools as the
 * game reorganises — the argument as colour rather than as thinning.
 */

import { drawInscriptions, drawSlug } from "../inscription";
import { drawMarks, drawPin } from "../marks";
import { ZONE_RGB } from "../palette";
import type { Frame } from "./types";

export function drawFieldHand(f: Frame): void {
  const { ctx, view, dpr, st, data, inscriptions, remains } = f;
  const year = st.year!;
  const season = data.byYear.get(year)!;

  ctx.save();
  ctx.globalAlpha = remains * 0.8;
  drawInscriptions(ctx, view, inscriptions, st.t);
  ctx.restore();

  const dim = remains;

  if (st.prev !== null) {
    const prevSeason = data.byYear.get(st.prev);
    const prevSample = data.samples.get(st.prev);
    if (prevSeason && prevSample) {
      const fading = (1 - st.arrived) * dim;
      drawMarks(ctx, view, prevSample, prevSeason, { dpr, opacity: fading, palette: ZONE_RGB });
      drawPin(ctx, view, prevSample, { dpr, opacity: fading });
    }
  }

  const sample = data.samples.get(year);
  if (sample) {
    drawMarks(ctx, view, sample, season, {
      dpr, opacity: dim, arrived: st.arrived, palette: ZONE_RGB,
    });
    // The pin stays bone. It stands for shots the record would not place, so it
    // belongs to no zone — colouring it would give it a category it never had.
    drawPin(ctx, view, sample, { dpr, opacity: dim, arrived: st.arrived });
  }

  // Whose categories these are, named on the plate rather than only on a wall.
  if (st.phase < 0.34) {
    const fade = Math.min(1, st.phase * 8) * Math.min(1, (0.34 - st.phase) * 8) * remains;
    drawSlug(ctx, view, ["COLOURED BY THE NBA'S OWN ZONES"], { x: 0, y: 400 }, fade);
  }
}
