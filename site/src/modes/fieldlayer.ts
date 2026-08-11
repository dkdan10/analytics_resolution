/** The shared field: every shot, for whichever hand is drawing.
 *
 * All four hands want the same thing beneath them — the season's whole record,
 * developing — differing only in whether it carries the league's colours and
 * how far it is dimmed. This keeps that in one place so the composite rules
 * (blit with `lighter`, pin drawn separately and source-over, previous season
 * receding as the current one develops) cannot drift apart between hands.
 */

import type { Season } from "../data";
import {
  bakeLayer, bakeResidence, developed, drawDeveloping, drawLayer, drawReveal,
  drawWindowReveal, grainProfileFor, windowPinArrived, type WindowFoldClock,
} from "../field";
import { drawPin } from "../marks";
import { DEVELOP_STATES, RESIDENCE_ALPHA } from "../scalars";
import {
  PLATE_WITHDRAW_SPAN,
  WINDOW_BEATS,
  progressInWindowSpan,
  windowEntryProgress,
} from "../window-score";
import { seasonClock } from "./shared";
import type { Frame } from "./types";

export interface FieldOpts {
  /** Hue from the NBA's seven zones, for THE FIELD. */
  coloured?: boolean;
  /** Overall dim, before development. */
  dim: number;
  /** THE CENSUS draws no outgoing season: a field still holding the previous
   *  season's shots would contradict a tally counting only this one. */
  withPrevious?: boolean;
  /** THE RESIDENCE — the window's ball-occupancy under-layer, Act III only.
   *  Carried by THE PLATE and THE FIELD alone: the text hands dim the field to
   *  ground their registers, and a glow under their type would be one more
   *  thing to read around rather than the ground disagreeing with the marks. */
  residence?: boolean;
  /** THE ENTRY YIELD MASK (session 17, the fourth audit's entry ruling —
   *  PLATE only, the hand where the collision was measured and the only
   *  reveal hand drawing the strokes). When present, the PREVIOUS season's
   *  layer composites through a per-frame scratch: its exposure states drawn
   *  in, then this callback erases along every body/ball vertex the clock
   *  has reached (`destination-out`; the caller sets its own widths and
   *  strengths), then ONE `lighter` blit — so the old field locally dries in
   *  the strokes' wake while untouched marks persist whole and the no-clear
   *  recession stands. Pure in t: the wake is the disc-union along a
   *  monotone stroke prefix, recomputed from scratch every frame; nothing
   *  survives between frames. */
  yieldMask?: (ctx: CanvasRenderingContext2D) => void;
  /** THE PER-MARK ARRIVAL (session 9, stage B): the arriving season's cells
   *  surface individually in the record's own emphasis order — descending
   *  filed count — instead of developing as one image. THE PLATE and THE
   *  FIELD (the hands the artist named), and since S2 LEDGER and MEASURE:
   *  they share the plate's bone reveal surface (same cache key), and the
   *  measured budget said yes — no new surfaces, every probed frame inside
   *  budget. THE CENSUS stays on stage A BY MEASUREMENT: with the reveal it
   *  showed a deterministic over-budget stall on the frame after the first
   *  mid-season step crossing at after-the-cut, an order of magnitude past
   *  the same crossing in every other hand (mechanism unattributed; the
   *  measured figures are in the session-9 handoff) — so the hand that
   *  already documents its own withPrevious exception keeps one more. THE
   *  STACK's locate base is deliberately left on stage A — a talk-mode
   *  instrument, outside the named scope. Recession keeps A's develop-out in
   *  every hand, as ratified. SINCE SESSION 16: in the window season this
   *  same flag routes to THE WINDOW FOLD — the base accumulates on the
   *  record's own calendar instead of the emphasis-order arrival (the
   *  re-clock ruling); the two no-reveal hands keep the shared envelope,
   *  documented above. */
  reveal?: boolean;
}

/**
 * The residence's whole-layer envelope. (Until session 16 this was the only
 * thing `t` drove in this file; the window fold's clock below is the second,
 * and both read the shared beat table.)
 *
 * Since the crescendo: rise through "one" and "the night", held through "the
 * season", washed by "the close" — the ground where the ball lived is
 * complete before the accelerating record floods over it, which is the
 * reading the re-score wants (the passage under the endings, then the
 * endings at the machine's pace). Beat edges read from `WINDOW_BEATS` so the
 * rail and this layer cannot disagree about where a beat begins. Never
 * cell-by-cell: the grid is an aggregate with no chronology, and animating
 * cells would author an order the source never measured. A pure function of
 * phase — scrubbing backwards rebuilds it, nothing is remembered.
 */
function residenceEnvelope(phase: number): number {
  const night = WINDOW_BEATS.find((b) => b.id === "night")!;
  const washFrom = PLATE_WITHDRAW_SPAN.from;
  // DELAYED to the game phase (session 17, the fourth audit's entry ruling,
  // Codex A11's measured reason: at the entry's one-frame test the residence
  // was part of a ground outweighing the tracked figure by orders of
  // magnitude). "One" opens on bare stone plus the possession alone; the
  // dwelling rises with the game/night expansion — game start to night's
  // end, derived from the shared beat table, no new scalar — and is complete
  // before the season floods over it, as before.
  if (phase < night.from) return 0;
  if (phase < night.to) return developed((phase - night.from) / (night.to - night.from));
  if (phase < washFrom) return 1;
  return 1 - developed(progressInWindowSpan(phase, PLATE_WITHDRAW_SPAN));
}

/**
 * THE WINDOW FOLD's clock (session 16, the re-clock ruling): where the base
 * sits on the window's own calendar, from the shared beat table and the same
 * `seasonClock` the drops keep — one clock in Act III, base and foreground
 * agreeing about what day it is. "One" opens with none of the season's
 * endings (and, since session 17, none of the residence — the dwelling is
 * delayed to the game phase); the night's day rises through the game+night
 * span as one continuous arrival; the season beat folds the window's days;
 * the close floods the remainder and holds the finished layer. Null wherever
 * the season ships no calendar, and the shared arrival envelope stands.
 */
function windowBaseClock(phase: number, season: Season): WindowFoldClock | null {
  const meta = season.points_by_day;
  if (!meta) return null;
  const night = WINDOW_BEATS.find((b) => b.id === "night")!;
  const seasonBeat = WINDOW_BEATS.find((b) => b.id === "season")!;
  const closeFrom = WINDOW_BEATS.find((b) => b.id === "close")!.from;
  if (phase >= closeFrom) return { rise: 1, dayFrac: meta.window_days, flood: true };
  const rise = Math.min(1, Math.max(0, (phase - night.from) / (night.to - night.from)));
  const seasonU = Math.min(1, Math.max(0, (phase - seasonBeat.from) / (seasonBeat.to - seasonBeat.from)));
  return { rise, dayFrac: seasonClock(seasonU) * meta.window_days, flood: false };
}

/** Scratch for the entry yield's per-frame composite — reused, not
 *  reallocated (the field's own accOf discipline). Never a cache: it is
 *  cleared and fully redrawn inside the one frame that uses it, so no byte
 *  survives to the next and purity needs nothing registered. */
let yieldScratch: HTMLCanvasElement | null = null;

function yieldScratchOf(w: number, h: number): HTMLCanvasElement {
  if (!yieldScratch || yieldScratch.width !== w || yieldScratch.height !== h) {
    yieldScratch = document.createElement("canvas");
    yieldScratch.width = w;
    yieldScratch.height = h;
  }
  return yieldScratch;
}

export function drawSeasonField(f: Frame, opts: FieldOpts): void {
  const { ctx, view, dpr, st, data } = f;
  const { coloured = false, dim, withPrevious = true, residence = false, reveal = false } = opts;
  const year = st.year!;

  // The residence goes down FIRST: it is the ground the endings sit over, and
  // it is drawn only where the feed existed — Act III, the one stretch whose
  // motion between the record's endpoints survives. Bone, under everything,
  // inheriting the hand's own dim so it can never outshine the record above it.
  if (residence && st.act === 3 && data.window) {
    drawLayer(
      ctx,
      bakeResidence(data.window.occupancy, view, dpr),
      view,
      dim * residenceEnvelope(st.phase) * RESIDENCE_ALPHA,
    );
  }

  // THE DEVELOPMENT (session 8): arrival is a position in the exposure
  // ladder, not a global alpha — the incoming season develops like a print
  // (rim flare out of the dark first, faintest texture last) and the outgoing
  // one sinks the same ladder in reverse (texture first, flare last). One
  // position drives both, so the plate's total light hands over continuously;
  // `developed` keeps the same easing the old crossfade had, and past
  // ARRIVAL_TAIL the position sits at the ladder's top, where the drawn frame
  // is byte-identical to the finished layer the old path blitted.
  const ladder = developed(st.arrived) * DEVELOP_STATES;
  const previousArrival = st.act === 3 ? windowEntryProgress(st.phase) : st.arrived;

  if (withPrevious && st.prev !== null) {
    const prevSeason = data.byYear.get(st.prev);
    const prevPts = data.points(st.prev);
    if (prevSeason && prevPts) {
      const prevGrain = grainProfileFor(prevSeason.resolution.regime);
      // The pin is not part of the ladder: it occludes rather than adds, so it
      // keeps the linear fade the receding field used to share with it.
      const fading = (1 - previousArrival) * dim;
      const bakePrev = (strength: number) =>
        bakeLayer(
          st.prev!, prevPts, coloured, view, dpr, pinCoordOf(prevSeason), strength, prevGrain,
        );
      if (opts.yieldMask && previousArrival < 1) {
        // THE ENTRY YIELD: the receding layer draws into the scratch, the
        // wake erases locally, one blit carries the result. `lighter` over
        // transparent black premultiplies each develop state by its own
        // alpha, so the blit adds exactly what the direct path would have —
        // minus what the wake took down.
        const w = Math.max(1, Math.round(view.width * dpr));
        const h = Math.max(1, Math.round(view.height * dpr));
        const scratch = yieldScratchOf(w, h);
        const sctx = scratch.getContext("2d")!;
        sctx.setTransform(1, 0, 0, 1, 0, 0);
        sctx.clearRect(0, 0, w, h);
        sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawDeveloping(
          sctx, view, DEVELOP_STATES - developed(previousArrival) * DEVELOP_STATES,
          dim, bakePrev,
        );
        sctx.save();
        sctx.globalCompositeOperation = "destination-out";
        opts.yieldMask(sctx);
        sctx.restore();
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.drawImage(scratch, 0, 0, view.width, view.height);
        ctx.restore();
      } else {
        drawDeveloping(
          ctx, view, DEVELOP_STATES - developed(previousArrival) * DEVELOP_STATES,
          dim, bakePrev,
        );
      }
      drawPin(ctx, view, pinFractionOf(prevSeason), pinCoordOf(prevSeason), {
        dpr, opacity: fading,
      });
    }
  }

  const season = data.byYear.get(year)!;
  const grain = grainProfileFor(season.resolution.regime);
  const pts = data.points(year);
  // THE WINDOW FOLD: the window season's base accumulates on its own measured
  // calendar wherever the reveal is on and the calendar shipped. CENSUS (no
  // reveal, stage A by measurement) and STACK (talk instrument) keep the
  // shared arrival envelope — the two documented exceptions, packet-flagged.
  const dayPts = reveal && st.act === 3 && season.points_by_day ? data.pointsByDay(year) : null;
  const clock = dayPts ? windowBaseClock(st.phase, season) : null;
  const seedDay = data.slateFile?.day ?? -1;
  const windowLast = season.points_by_day?.window_last_day ?? 0;
  if (pts) {
    if (dayPts && clock) {
      drawWindowReveal(ctx, view, clock, dim, year, pts, dayPts, coloured, dpr,
        pinCoordOf(season), seedDay, windowLast, grain);
    } else if (reveal && st.arrived < 1) {
      // THE PER-MARK ARRIVAL: while the season is arriving, its cells strike
      // in the record's own emphasis order, each at full tone. At
      // `st.arrived >= 1` this branch is dead and the path below draws the
      // finished layer exactly as stage A did — the tail and every boundary
      // handover frame are byte-identical to the judged development.
      drawReveal(
        ctx, view, st.arrived, dim, year, pts, coloured, dpr, pinCoordOf(season), grain,
      );
    } else {
      drawDeveloping(ctx, view, ladder, dim, (strength) =>
        bakeLayer(year, pts, coloured, view, dpr, pinCoordOf(season), strength, grain),
      );
    }
  }
  // The pin is never baked into the layer: it occludes rather than adds, and
  // it stands for shots the record refused to place, so it belongs to no zone
  // and takes no colour. On the window fold it fills with the marks — the
  // refusal keeps the calendar's clock, never a separate one.
  drawPin(ctx, view, pinFractionOf(season), pinCoordOf(season), {
    dpr, opacity: dim,
    arrived: dayPts && clock
      ? windowPinArrived(dayPts, pinCoordOf(season), clock, seedDay, windowLast)
      : st.arrived,
  });
}

/**
 * WHERE the pin stands: the coordinate the record piles its refusal on.
 *
 * NOT THE ORIGIN, and that is the whole of what changed here. For most seasons
 * the two are the same cell; for six they are not, and reading the origin there
 * drew a pin standing for nothing beside a single blown-out mark a fraction of
 * a foot off the rim — `rim_sentinel.share_of_season` of a season rendered as
 * one bright dot.
 *
 * `null` when the season refuses nothing, which is 2010-11 through 2013-14 and
 * only those. Everything downstream — the bake's skip, the pin's centre, THE
 * LEDGER's caption, THE CENSUS's tally — reads this one derivation, so a shot
 * cannot be the pin's in one hand and the floor's in another.
 */
export function pinCoordOf(season: Season): [number, number] | null {
  const s = season.resolution.rim_sentinel;
  return s && s.is_refusal ? s.coord : null;
}

/** The season's measured share of shots the record refused to place. */
export function pinFractionOf(season: Season): number {
  const s = season.resolution.rim_sentinel;
  return season.attempts && s && s.is_refusal ? s.n / season.attempts : 0;
}
