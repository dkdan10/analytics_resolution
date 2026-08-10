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
import { NO_OPS, type StackOps } from "./modes/operations";
import { GROUND } from "./palette";
import { drawPlate, shortenedThreeR, type View } from "./plate";
import { CUT_YEAR, stateAt, type Schedule } from "./timeline";

/** Where a frame is drawn. `main()` keeps one and `resize()` updates it in
 *  place; the probes make their own at a fixed size and DPR. */
export interface Target {
  ctx: CanvasRenderingContext2D;
  view: View;
  dpr: number;
}

function smoothstep(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
}

/** In over [a,b], held, out over [c,d]. Composition, not grain: these are the
 *  prelude's and the cut's own pacing and they are declared here rather than in
 *  the material register, whose scope is marks. */
function ramp(p: number, a: number, b: number, c: number, d: number): number {
  return smoothstep((p - a) / (b - a)) * (1 - smoothstep((p - c) / (d - c)));
}

/** How much of the prelude the court takes to arrive. */
const PRELUDE_ENGRAVING = 0.62;

/**
 * The one cut this piece is allowed, given the beat that says what it IS.
 *
 * THE DEFECT (audit V-01): "the discontinuity is visually strong, but it
 * currently reads as obliteration or reset before it reads as the end of
 * league-wide rim blindness." Measured with `?probe=shots`'s frame statistics
 * and recorded in CLAUDE.md: the lit-pixel count either side of the boundary is
 * held EXACTLY unchanged for seconds, collapses to bare stone, and stays there
 * for about a second before the new season begins to arrive. A frozen frame, a
 * blackout, an empty plate. That is the shape of an asset reload, and a viewer
 * has no way to read it as anything else, because nothing on screen says what
 * happened.
 *
 * So the cut now carries its own cause, in the record's own figures and the
 * pipeline's own classification of them: the share of rim shots the record
 * declined to place, either side, and the regime each season was measured into.
 * Not a caption on a transition — the two numbers ARE the event.
 *
 * Drawn here rather than in a hand, because it is a property of the RECORD and
 * every hand is looking at the same record.
 */
const CUT_BEAT_SECONDS = 3.2;

function regimeText(regime: string): string {
  return regime.replace(/_/g, " ").toUpperCase();
}

function drawCutBeat(
  ctx: CanvasRenderingContext2D,
  view: View,
  data: Loaded,
  schedule: Schedule,
  time: number,
): void {
  const seg = schedule.byYear.get(CUT_YEAR);
  const after = data.byYear.get(CUT_YEAR);
  const before = data.byYear.get(CUT_YEAR - 1);
  if (!seg || !after || !before) return;
  // Centred on the boundary itself, so the beat is at its strongest across the
  // one empty frame rather than either side of it.
  const k = 1 - Math.min(1, Math.abs(time - seg.start) / CUT_BEAT_SECONDS);
  if (k <= 0.01) return;
  const pct = (s: { resolution: { ra_origin_share: number } }): string =>
    (100 * s.resolution.ra_origin_share).toFixed(1);
  // ABOVE the arc's crown, not on the strike line (third audit D-04): the
  // outgoing season's numeral holds and migrates through STRIKE_AT's band for
  // the beat's first three seconds, and the piece's one cut must not have its
  // cause statement overprinted by a migrating numeral. The band above the
  // arc is unoccupied in both bounding seasons at every point of the beat,
  // and the migration path (strike line down to the ring) can never reach it.
  drawSlug(ctx, view, [
    `${before.season}   ${pct(before)}% OF RIM SHOTS UNPLACED   ${regimeText(before.resolution.regime)}`,
    `${after.season}   ${pct(after)}%   ${regimeText(after.resolution.regime)}`,
  ], { x: 0, y: 295 }, smoothstep(k));
}

export function renderTo(
  { ctx, view, dpr }: Target,
  t: number,
  data: Loaded,
  schedule: Schedule,
  inscriptions: Inscription[],
  modeOverride: ModeId | null,
  /** Whether the rail is up. Mode CONFIGURATION, like `modeOverride`: it does
   *  not travel with `t` and it holds nothing between frames, so `renderTo`
   *  stays a pure function of its arguments. Defaulted false so every probe and
   *  every caller that does not care gets the gallery. */
  talk = false,
  /** Which of THE STACK's seven operations are applied. The same kind of thing
   *  as `talk` and on the same footing — passed in, never written to, nothing
   *  held between frames — and unlike `talk` it is addressable, because the
   *  purity harness reaches a frame by direct URL and has to be able to reach
   *  a CONFIGURED one. Every hand but THE STACK ignores it; defaulted to none,
   *  which is the view's own opening state, so a caller that does not care gets
   *  bare stone rather than an arbitrary selection. */
  stack: StackOps = NO_OPS,
  /** A packet candidate for the shots probe only — see `types.ts:Frame`. No
   *  gallery caller passes it; defaulted null so every existing caller is
   *  byte-identical. */
  candidate: string | null = null,
): void {
  const st = stateAt(t, schedule);

  ctx.fillStyle = GROUND;
  ctx.fillRect(0, 0, view.width, view.height);

  // Act 0 holds no coordinates, so the plate holds no marks. The engraving
  // itself arrives over the prelude - the court before anything is recorded on it.
  if (st.act === 0) {
    const p = st.preludePhase;
    // THE ENGRAVING IS THE PRELUDE'S FIRST EVENT AND IT NOW TAKES ITS TIME.
    //
    // It used to reach full strength about a quarter of the way in, after which
    // NOTHING CHANGED AT ALL for well over half the prelude — the same lit-pixel
    // count and the same mean, frame after identical frame (audit V-01, "too
    // dark for too long... can be mistaken for inactive hardware"; the figures
    // are in CLAUDE.md, from `?probe=shots`). The absence is the content and
    // stays; a still image is not the same thing as an absence, and that
    // difference is the whole finding.
    //
    // EASE OUT, NOT SMOOTHSTEP, and the difference is measured rather than
    // tasteful: a smoothstep is slow at BOTH ends, which put three seconds of
    // literal bare ground at the top of a loop that has just wrapped out of an
    // equally bare coda. The court starts being cut immediately and decelerates.
    ctx.save();
    ctx.globalAlpha = 1 - (1 - Math.min(1, p / PRELUDE_ENGRAVING)) ** 2;
    drawPlate(ctx, view);
    ctx.restore();
    // Half a century of basketball and not one coordinate. The plate is bare
    // because the record is - this is the absence, not a stylised version of it.
    // The closing year is the first season the record holds; the opening one is
    // the league's founding, external history no dump can supply, so it is
    // cited in facts.json rather than written here.
    //
    // THE TWO LINES ARRIVE SEPARATELY. One slug carrying both was a single
    // event across the whole passage; the span answers the sentence rather than
    // being read with it, which is also how it reads aloud.
    const firstCharted = data.seasons[0]?.year;
    const founded = factExternal<number>(data.facts, "league_founded");
    // `voice`, both of them: the piece opens on this, alone, over bare stone,
    // with nothing else competing (audit V-08). Splitting the timing changes no
    // rank — docs/build/typography-inventory.md row 1 covers both lines.
    drawSlug(ctx, view, [`${founded} — ${firstCharted ?? ""}`],
      { x: 0, y: 232 }, ramp(p, 0.14, 0.30, 0.80, 0.97), "voice");
    drawSlug(ctx, view, ["NO SHOT WAS GIVEN A PLACE"],
      { x: 0, y: 176 }, ramp(p, 0.44, 0.62, 0.84, 0.99), "voice");
    return;
  }

  const year = st.year!;

  // The arc carries the geometry in force: the earliest season here was played
  // to a shorter line that the modern taxonomy has since drawn over. Which
  // season, and how short, both come from the record - the season carries a
  // `contemporaneous` block exactly when its line differed.
  const era = data.byYear.get(year)?.contemporaneous;
  const threeR = era ? shortenedThreeR(era.line_ft) : undefined;
  // The engraving recedes through the coda too, and it recedes ALL THE WAY.
  //
  // It used to stop a little short of nothing, so the last frame before the wrap
  // held a court and the first frame after it held none: the loop turned over on
  // a visible step, in a piece whose whole coda exists so that it would not
  // (audit F-13). The two ends have to agree, and the value they agree on is
  // zero, because the engraving's arrival over the prelude is a composed event -
  // the court recognised a beat after the image is - and starting the prelude
  // part-drawn would be cutting it.
  ctx.save();
  ctx.globalAlpha = 1 - st.coda;
  drawPlate(ctx, view, threeR);
  ctx.restore();

  // The coda empties the plate back to bare stone so the loop turns over
  // without a seam - everything the piece drew recedes, the engraving stays.
  const remains = 1 - st.coda;

  // The hand for this moment. Everything above is shared by all of them: the
  // ground, the prelude, the era's arc.
  if (remains > 0.001) {
    drawHand(modeAt(t, schedule, modeOverride), {
      ctx, view, dpr, st, data, schedule, inscriptions, remains, talk, stack, candidate,
    });
  }

  // Last, and over whichever hand is drawing: the cut is the record's event,
  // not any one hand's reading of it, and it is the only moment in the piece
  // where the plate is briefly empty of everything.
  drawCutBeat(ctx, view, data, schedule, st.t);
}
