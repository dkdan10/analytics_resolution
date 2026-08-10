/** THE FIELD — the league's own colours.
 *
 * Hue comes from SHOT_ZONE_BASIC: seven categories the NBA authored and applies
 * to every shot it files. Colouring by them adds no classification, it exposes
 * one already imposed — which is the only footing on which this piece may use
 * colour at all, since its governing rule is that every material property of a
 * mark derives from a measurement.
 *
 * What it makes legible is the migration itself. Across the corpus the warm
 * middle of the floor drains while the cool arc floods — `mid_share` and
 * `three_share` in seasons.json are the two curves — so the whole image cools
 * as the game reorganises: the argument as colour rather than as thinning.
 */

import { drawInscriptions, drawSlug } from "../inscription";
import { SEASON_SECONDS, secondsFor } from "../timeline";
import type { Frame } from "./types";
import { drawSeasonField } from "./fieldlayer";

export function drawFieldHand(f: Frame): void {
  const { ctx, view, st, inscriptions, remains } = f;

  ctx.save();
  ctx.globalAlpha = remains * 0.8;
  drawInscriptions(ctx, view, inscriptions, st.t);
  ctx.restore();

  // Every shot in the league's own colours, arriving mark by mark in the
  // record's own emphasis order (stage B). The pin stays bone inside
  // drawSeasonField: it stands for shots the record would not place, so it
  // belongs to no zone and colouring it would invent a category it never had.
  // In the window the residence rises beneath the colours — bone, because the
  // ball belongs to no zone either.
  drawSeasonField(f, { coloured: true, dim: remains, residence: true, reveal: true });

  // Whose categories these are, named on the plate rather than only on a wall.
  // Clocked in SECONDS, not phase (third audit, FIELD improvement 3): the
  // attribution held a few seconds in an ordinary season but nearly a minute in the dilated
  // window — the longest-lived sentence in the piece, over the act with the
  // most competing material. The spans below reproduce the judged ordinary-
  // season timing exactly (byte-identical there) and give the window the same
  // few seconds; a viewer entering mid-window catches it next season.
  const sIn = st.phase * secondsFor(st.year!);
  const spanS = 0.34 * SEASON_SECONDS;
  const rampS = SEASON_SECONDS / 8;
  if (sIn < spanS) {
    const fade = Math.min(1, sIn / rampS) * Math.min(1, (spanS - sIn) / rampS) * remains;
    drawSlug(ctx, view, ["COLOURED BY THE NBA'S OWN ZONES"], { x: 0, y: 400 }, fade);
  }
}
