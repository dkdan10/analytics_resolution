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
import {
  FIELD_WINDOW_ATTRIBUTION_SPAN,
  FIELD_WINDOW_ATTRIBUTION_STOPS,
  progressInWindowSpan,
} from "../window-score";
import type { Frame } from "./types";
import { drawSeasonField } from "./fieldlayer";
import { drawActCue } from "./shared";

/** Compatibility exports; the canonical attribution score is centralized. */
export { FIELD_WINDOW_ATTRIBUTION_SPAN, FIELD_WINDOW_ATTRIBUTION_STOPS };

/** Window-only envelope: a short entrance, a long hold, then a clean exit. */
export function fieldWindowAttributionAlpha(phase: number): number {
  const local = progressInWindowSpan(phase, FIELD_WINDOW_ATTRIBUTION_SPAN);
  const enterEnd = progressInWindowSpan(
    FIELD_WINDOW_ATTRIBUTION_STOPS[1].at,
    FIELD_WINDOW_ATTRIBUTION_SPAN,
  );
  const exitStart = progressInWindowSpan(
    FIELD_WINDOW_ATTRIBUTION_STOPS[2].at,
    FIELD_WINDOW_ATTRIBUTION_SPAN,
  );
  if (local < enterEnd) return local / enterEnd;
  if (local <= exitStart) return 1;
  return Math.max(0, (1 - local) / (1 - exitStart));
}

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
  // Clocked in SECONDS, not phase: the
  // attribution held a few seconds in an ordinary season but nearly a minute in
  // the dilated window — the longest-lived sentence in the piece, over the act
  // with the most competing material. Ordinary seasons retain their judged
  // envelope; the Window gets the explicit entrance, hold, and exit above.
  const sIn = st.phase * secondsFor(st.year!);
  const spanS = 0.34 * SEASON_SECONDS;
  const rampS = SEASON_SECONDS / 8;
  const fade = st.act === 3
    ? fieldWindowAttributionAlpha(st.phase) * remains
    : (sIn < spanS
      ? Math.min(1, sIn / rampS) * Math.min(1, (spanS - sIn) / rampS) * remains
      : 0);
  if (fade > 0) {
    drawSlug(ctx, view, ["COLOURED BY THE NBA'S OWN ZONES"], { x: 0, y: 400 }, fade);
  }

  // The boundaries named (S1): the cue's anchor sits clear of the zone
  // attribution above.
  drawActCue(f, 2);
  drawActCue(f, 5);
}
