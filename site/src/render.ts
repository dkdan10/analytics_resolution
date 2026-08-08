/** One frame of FADEAWAY, drawn somewhere.
 *
 * The whole piece is a pure function of one float, and this is that function.
 * It lived inside `main.ts`, closed over the window's canvas, its view and its
 * device pixel ratio — which meant the only way to render a frame was to be the
 * gallery. It now takes its target, so the same code can be asked for the same
 * instant on a fixed offscreen surface and the answer compared byte for byte.
 *
 * Nothing here decides anything the gallery did not already decide. If a pixel
 * moved in this extraction, the purity probe would say so — which is precisely
 * what it was extracted for.
 */

import { factExternal, type Loaded } from "./data";
import { drawSlug, type Inscription } from "./inscription";
import { drawHand, modeAt, type ModeId } from "./modes";
import { GROUND } from "./palette";
import { drawPlate, shortenedThreeR, type View } from "./plate";
import { stateAt, type Schedule } from "./timeline";

/** Where a frame is drawn. `main()` keeps one and `resize()` updates it in
 *  place; the probes make their own at a fixed size and DPR. */
export interface Target {
  ctx: CanvasRenderingContext2D;
  view: View;
  dpr: number;
}

export function renderTo(
  { ctx, view, dpr }: Target,
  t: number,
  data: Loaded,
  schedule: Schedule,
  inscriptions: Inscription[],
  modeOverride: ModeId | null,
): void {
  const st = stateAt(t, schedule);

  ctx.fillStyle = GROUND;
  ctx.fillRect(0, 0, view.width, view.height);

  // Act 0 holds no coordinates, so the plate holds no marks. The engraving
  // itself arrives over the prelude - the court before anything is recorded on it.
  if (st.act === 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, st.preludePhase * 1.6);
    drawPlate(ctx, view);
    ctx.restore();
    // Half a century of basketball and not one coordinate. The plate is bare
    // because the record is - this is the absence, not a stylised version of it.
    // The closing year is the first season the record holds; the opening one is
    // the league's founding, external history no dump can supply, so it is
    // cited in facts.json rather than written here.
    const p = st.preludePhase;
    const firstCharted = data.seasons[0]?.year;
    const founded = factExternal<number>(data.facts, "league_founded");
    drawSlug(
      ctx,
      view,
      [`${founded} — ${firstCharted ?? ""}`, "NO SHOT WAS GIVEN A PLACE"],
      { x: 0, y: 200 },
      Math.min(1, p * 4) * Math.min(1, (1 - p) * 5),
    );
    return;
  }

  const year = st.year!;

  // The arc carries the geometry in force: the earliest season here was played
  // to a shorter line that the modern taxonomy has since drawn over. Which
  // season, and how short, both come from the record - the season carries a
  // `contemporaneous` block exactly when its line differed.
  const era = data.byYear.get(year)?.contemporaneous;
  const threeR = era ? shortenedThreeR(era.line_ft) : undefined;
  // The engraving recedes through the coda too, so the wrap arrives on near-bare
  // stone rather than on a fully drawn court.
  ctx.save();
  ctx.globalAlpha = 1 - 0.85 * st.coda;
  drawPlate(ctx, view, threeR);
  ctx.restore();

  // The coda empties the plate back to bare stone so the loop turns over
  // without a seam - everything the piece drew recedes, the engraving stays.
  const remains = 1 - st.coda;

  // The hand for this moment. Everything above is shared by all of them: the
  // ground, the prelude, the era's arc.
  if (remains > 0.001) {
    drawHand(modeAt(t, schedule, modeOverride), {
      ctx, view, dpr, st, data, schedule, inscriptions, remains,
    });
  }
}
