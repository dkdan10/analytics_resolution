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
import type { Frame } from "./types";
import { drawSeasonField } from "./fieldlayer";

export function drawFieldHand(f: Frame): void {
  const { ctx, view, st, inscriptions, remains } = f;

  ctx.save();
  ctx.globalAlpha = remains * 0.8;
  drawInscriptions(ctx, view, inscriptions, st.t);
  ctx.restore();

  // Every shot in the league's own colours. The pin stays bone inside
  // drawSeasonField: it stands for shots the record would not place, so it
  // belongs to no zone and colouring it would invent a category it never had.
  drawSeasonField(f, { coloured: true, dim: remains });

  // Whose categories these are, named on the plate rather than only on a wall.
  if (st.phase < 0.34) {
    const fade = Math.min(1, st.phase * 8) * Math.min(1, (0.34 - st.phase) * 8) * remains;
    drawSlug(ctx, view, ["COLOURED BY THE NBA'S OWN ZONES"], { x: 0, y: 400 }, fade);
  }
}
