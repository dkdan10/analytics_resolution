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
import { setContextDisplay, type DisplayProfile } from "./display";
import { drawSettledInscriptions, drawSlug, type Inscription } from "./inscription";
import { drawHand, modeAt, openingFieldOf, windowReadsOf, type ModeId } from "./modes";
import { prewarmOpening } from "./modes/fieldlayer";
import { completedStackState, NO_OPS, type StackRenderState } from "./modes/operations";
import { GROUND } from "./palette";
import { drawPlate, shortenedThreeR, type View } from "./plate";
import { SLUG_VOICE_TENTHS } from "./scalars";
import { CODA_SECONDS, CUT_YEAR, stateAt, type Schedule } from "./timeline";
import { THREE_R } from "./zone";

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
export const PRELUDE_ENGRAVING = 0.62;

/**
 * The one cut this piece is allowed, given the beat that says what it IS.
 *
 * THE DEFECT: the discontinuity is visually strong, but on its own it reads as
 * obliteration or reset before it reads as the end of league-wide rim
 * blindness. Measured with `?probe=shots`'s frame statistics: the lit-pixel
 * count either side of the boundary is
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
export const CUT_BEAT_SECONDS = 3.2;

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
  // ABOVE the arc's crown, not on the strike line: the
  // outgoing season's numeral holds and migrates through STRIKE_AT's band for
  // the beat's first three seconds, and the piece's one cut must not have its
  // cause statement overprinted by a migrating numeral. The band above the
  // arc is unoccupied in both bounding seasons at every point of the beat
  // (THE MEASURE's own sentence there has stood down before the beat begins),
  // and the migration path, round the hoop inside the strike line, can never
  // reach it.
  drawSlug(ctx, view, [
    `${before.season}   ${pct(before)}% OF RIM SHOTS UNPLACED   ${regimeText(before.resolution.regime)}`,
    `${after.season}   ${pct(after)}%   ${regimeText(after.resolution.regime)}`,
  ], { x: 0, y: 295 }, smoothstep(k));
}

/**
 * Ask for the season after this one, on this one's frames.
 *
 * For the loop of a route that plays the seasons in order, called once that
 * loop has drawn its frame, so the frame's own files are asked for first; and
 * nothing is asked ahead while any file a frame asked for is still on its
 * way, since a request made ahead would share the link with what the frame
 * is waiting for. The next season is first drawn when this one ends, so its
 * record is here when the work done ahead of the hand-over looks for it. The
 * window season reads more files than its points, and which of them depends
 * on the hand that will play it, so the hand playing now names them.
 *
 * `renderTo` does not call it. A caller that draws instants out of order may
 * never draw the season after the one it is on, and asking there would
 * download a file no frame reads.
 */
export function askAhead(
  t: number,
  data: Loaded,
  schedule: Schedule,
  modeOverride: ModeId | null,
): void {
  if (data.pendingAssets().length > 0) return;
  const st = stateAt(t, schedule);
  if (st.next === null) return;
  data.prefetchPoints(st.next);
  if (data.byYear.get(st.next)?.points_by_day) {
    data.prefetchWindow(windowReadsOf(modeAt(t, schedule, modeOverride)));
  }
}

export function renderTo(
  { ctx, view, dpr }: Target,
  t: number,
  data: Loaded,
  schedule: Schedule,
  inscriptions: Inscription[],
  modeOverride: ModeId | null,
  /** Whether this is the presenter/talk rendering context. Mode configuration,
   *  independent of whether its rail is visible. */
  talk = false,
  /** Whether the presenter rail is actually visible. */
  navVisible = false,
  /** Which of THE STACK's operations are applied, plus operation-local
   * progress. URL/legacy callers default to a completed empty state. */
  stack: StackRenderState = completedStackState(NO_OPS),
  /** A candidate composition for the shots probe only — see `types.ts:Frame`. No
   *  gallery caller passes it; defaulted null so every existing caller is
   *  byte-identical. */
  candidate: string | null = null,
  /** Viewer-distance profile; near preserves the original material. */
  display: DisplayProfile = "near",
): void {
  setContextDisplay(ctx, display);
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
    // count and the same mean, frame after identical frame — too dark for too
    // long, and easy to mistake for inactive hardware (the figures come from
    // `?probe=shots`). The absence is the content and
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
    // with nothing else competing. Splitting the timing changes no rank — both
    // lines share the voice rank (ranks: inscription.ts, `SlugRank`). The span
    // stands a line of its own type above the arc's crown, wholly clear of the
    // engraving, rather than with its tops on it.
    drawSlug(ctx, view, [`${founded} — ${firstCharted ?? ""}`],
      { x: 0, y: THREE_R + SLUG_VOICE_TENTHS }, ramp(p, 0.14, 0.30, 0.80, 0.97), "voice");
    drawSlug(ctx, view, ["NO SHOT WAS GIVEN A PLACE"],
      { x: 0, y: 176 }, ramp(p, 0.44, 0.62, 0.84, 0.99), "voice");
    // No hand draws here, so none is building ahead of the first season: the
    // prelude does it for the hand about to play. After every draw of this
    // frame, and it takes no context.
    const opening = openingFieldOf(modeAt(t, schedule, modeOverride));
    if (opening) prewarmOpening(view, dpr, st, data, opening.coloured, opening.reveal);
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
  // a visible step, in a piece whose whole coda exists so that it would not.
  // The two ends have to agree, and the value they agree on is
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
      ctx, view, dpr, st, data, schedule, inscriptions, remains,
      talk, navVisible, display, stack, candidate,
    });
  }

  // The coda lets the completed evidence sit above the withdrawing hand. Hold
  // the ring through most of the seven seconds, then take the final fade to the
  // same bare ground the prelude opens on. It comes up over the share of the
  // coda's own clock that one of its seconds is, rather than whole on the
  // coda's first frame: over a hand that does not draw the ring, the whole
  // ring appearing at once is a second cut, and over one that does, the
  // overprint strengthens a ring already there instead of stepping it.
  if (st.coda > 0) {
    const ring = st.coda <= 0.65 ? 1 : Math.max(0, (1 - st.coda) / 0.35);
    const lift = smoothstep(st.coda * CODA_SECONDS);
    drawSettledInscriptions(ctx, view, inscriptions, st.t, ring * lift);
  }

  // Last, and over whichever hand is drawing: the cut is the record's event,
  // not any one hand's reading of it, and it is the only moment in the piece
  // where the plate is briefly empty of everything.
  drawCutBeat(ctx, view, data, schedule, st.t);
}
