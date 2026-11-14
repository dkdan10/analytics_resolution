/** The shared field: every shot, for whichever hand is drawing.
 *
 * All four hands want the same thing beneath them — the season's whole record,
 * developing — differing only in whether it carries the league's colours and
 * how far it is dimmed. This keeps that in one place so the composite rules
 * (blit with `lighter`, pin drawn separately and source-over, previous season
 * receding as the current one develops) cannot drift apart between hands.
 */

import type { Loaded, Season } from "../data";
import {
  advancePrewarm, bakeLayer, bakeResidence, developed, drawDeveloping, drawLayer,
  drawReveal, drawWindowReveal, grainProfileFor, windowPinArrived,
  type GrainProfile, type Points, type PrewarmRequest, type WindowFoldClock,
} from "../field";
import { drawPin } from "../marks";
import type { View } from "../plate";
import { DEVELOP_STATES, RESIDENCE_ALPHA } from "../scalars";
import { ACT0_SECONDS, ARRIVAL_TAIL, CUT_YEAR, SEASON_SECONDS, type State } from "../timeline";
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
  /** THE PER-MARK ARRIVAL (stage B of the two-stage arrival; stage A is the
   *  development, below): the arriving season's cells
   *  surface individually in the record's own emphasis order — descending
   *  filed count — instead of developing as one image. On in THE PLATE and
   *  THE FIELD by design, and also in LEDGER and MEASURE:
   *  they share the plate's bone reveal surface (same cache key), and the
   *  measured budget said yes — no new surfaces, every probed frame inside
   *  budget. THE CENSUS stays on stage A BY MEASUREMENT: with the reveal it
   *  showed a deterministic over-budget stall on the frame after the first
   *  mid-season step crossing at after-the-cut, an order of magnitude past
   *  the same crossing in every other hand (mechanism unattributed; the
   *  perf probe measures it) — so the hand that
   *  already documents its own withPrevious exception keeps one more. THE
   *  STACK's locate base is deliberately left on stage A — a talk-mode
   *  instrument, outside the reveal's chosen scope. Recession keeps A's
   *  develop-out in every hand, by design. In the window season this
   *  same flag routes to THE WINDOW FOLD — the base accumulates on the
   *  record's own calendar instead of the emphasis-order arrival (the
   *  re-clock; see windowBaseClock); the two no-reveal hands keep the shared
   *  envelope, documented above. */
  reveal?: boolean;
  /** BUILD AHEAD: in the closing stretch of a season, pay for what the
   *  coming hand-over will ask for (its layers, its emphasis order, and
   *  before the window the residence and the calendar's fold order), a little
   *  a frame, so the boundary holds no whole bake where the arriving season's
   *  points were already here in that stretch. Where they were not, only what
   *  can be made without them is built, and the hand-over pays for the rest
   *  whole. It decides when work is done and never what is drawn: a
   *  frame meets what was built only as an entry already in a cache, and the
   *  entry is the one a miss would have made. Off unless a hand asks. THE
   *  STACK does not ask: it draws two
   *  palettes a frame under a talk-only instrument, and what it keeps live
   *  already fills the layer cache. */
  prewarm?: boolean;
}

/**
 * The residence's whole-layer envelope. (The window fold's clock below is the
 * other thing `t` drives in this file, and both read the shared beat table.)
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
  // DELAYED to the game phase, for a measured reason: at the window entry's
  // one-frame test the residence was part of a ground outweighing the
  // tracked figure by orders of magnitude. "One" opens on bare stone plus
  // the possession alone; the dwelling rises with the game/night expansion
  // — game start to night's end, derived from the shared beat table, no new
  // scalar — and is complete
  // before the season floods over it, as before.
  if (phase < night.from) return 0;
  if (phase < night.to) return developed((phase - night.from) / (night.to - night.from));
  if (phase < washFrom) return 1;
  return 1 - developed(progressInWindowSpan(phase, PLATE_WITHDRAW_SPAN));
}

/**
 * THE WINDOW FOLD's clock (the re-clock): where the base
 * sits on the window's own calendar, from the shared beat table and the same
 * `seasonClock` the drops keep — one clock in Act III, base and foreground
 * agreeing about what day it is. "One" opens with none of the season's
 * endings (and none of the residence — the dwelling is
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

/** The share of a season's settled tail by which everything built ahead is
 *  owed; the rest of the tail is slack for a slow clock. It decides when work
 *  is done and cannot change a pixel. */
const PREWARM_DEADLINE = 0.75;

/**
 * Ask for what the coming hand-over will read, and pay toward it.
 *
 * It pays only inside the last stretch before the hand-over, as long as an
 * ordinary season's settled tail. That stretch is measured in seconds, which
 * the caller gives as `left`, never as a phase: the window season is many
 * times longer, and a phase test would open the work that much earlier
 * there. What is owed rises with the clock alone; what has been built is
 * history, and history decides only whether a layer is already made when a
 * frame asks for it.
 *
 * The list names what the next season's opening frames ask `bakeLayer`,
 * `bakeResidence` and the two orders for, by the arguments they will pass,
 * in the order of the frames that first read them. It is not the order
 * within a frame: the opening frame draws the receding season before the
 * arriving one, and the list names the arriving layer first. Before the
 * window season the residence leads, where the hand lays it, as the first
 * thing that season's opening frame draws, and the calendar's fold order
 * follows it on the reveal's hands. `receding` is the season that will be
 * going out under the next one, with its own grain and points, or null where
 * the next season's opening frames draw none. `residence` is whether the
 * hand lays the residence.
 *
 * The arriving season's points, and the window season's calendar, are taken
 * only if they are already here. Building ahead must not start a fetch: what
 * is fetched, and when, is decided by the loop that plays the frames, never
 * by work no frame has asked for. Where that loop plays the seasons in order
 * it asks for the next season's files on every frame, so they have had this
 * season's arrival to land in before this stretch opens, and all of it is
 * built here. Where one is not here, as when a page lands inside the
 * stretch, a file is slow or has failed, or the route does not play in
 * order, what needs it is not built, and is made whole when a frame of the
 * hand-over first reads it. What does not need it is still built: the
 * receding season's lower states on the reveal's hands, and before the
 * window the residence where the hand lays it. The hand that develops in
 * builds nothing without the arriving points.
 *
 * It takes no context. Nothing here can draw.
 */
function payAhead(
  view: View,
  dpr: number,
  data: Loaded,
  next: number,
  coloured: boolean,
  reveal: boolean,
  residence: boolean,
  left: number,
  receding: { season: Season; grain: GrainProfile; pts: Points } | null,
): void {
  const lead = (1 - ARRIVAL_TAIL) * SEASON_SECONDS;
  if (left >= lead) return;
  const owed = Math.min(1, (lead - left) / (lead * PREWARM_DEADLINE));

  const nextSeason = data.byYear.get(next);
  const nextPts = data.residentPoints(next);
  const arriving = nextSeason && nextPts ? { season: nextSeason, pts: nextPts } : null;
  const layerOf = (s: Season, p: Points, g: GrainProfile, state: number): PrewarmRequest => ({
    what: "layer", year: s.year, pts: p, coloured, view, dpr, pin: pinCoordOf(s), state, grain: g,
  });
  const arrivingAt = (a: { season: Season; pts: Points }, state: number): PrewarmRequest =>
    layerOf(a.season, a.pts, grainProfileFor(a.season.resolution.regime), state);

  const requests: PrewarmRequest[] = [];
  // Formed from the expressions `drawSeasonField` passes on the window
  // season's frames, so each is the entry those frames ask for.
  if (nextSeason?.points_by_day) {
    if (residence && data.window) {
      requests.push({ what: "residence", occ: data.window.occupancy, view, dpr });
    }
    const dayPts = reveal ? data.residentPointsByDay(next) : null;
    if (dayPts) {
      requests.push({
        what: "dayPlan",
        dayPts,
        pin: pinCoordOf(nextSeason),
        seedDay: data.slateFile?.day ?? -1,
        windowLast: nextSeason.points_by_day?.window_last_day ?? 0,
      });
    }
  }
  if (reveal) {
    if (arriving) requests.push(arrivingAt(arriving, DEVELOP_STATES));
    if (receding) {
      requests.push(layerOf(receding.season, receding.pts, receding.grain, DEVELOP_STATES - 1));
    }
    // The window season arrives on its calendar and reads no emphasis order.
    // Elsewhere the order is one sort that cannot be cut. Asking for it here
    // moves it whole out of the boundary frame and makes it no shorter: it
    // can still run past a frame by itself (measured), in a passage where
    // nothing is arriving.
    if (arriving && !arriving.season.points_by_day) {
      requests.push({ what: "order", pts: arriving.pts, pin: pinCoordOf(arriving.season) });
    }
    if (receding) {
      for (let state = DEVELOP_STATES - 2; state >= 1; state--) {
        requests.push(layerOf(receding.season, receding.pts, receding.grain, state));
      }
    }
  } else if (arriving) {
    // A hand whose season develops in as one image climbs the arriving
    // season's whole ladder. The one such hand that builds ahead draws no
    // outgoing season, so none is asked for; a hand that develops in and also
    // recedes would add the receding season's lower states here.
    for (let state = 1; state <= DEVELOP_STATES; state++) {
      requests.push(arrivingAt(arriving, state));
    }
  }
  if (requests.length) advancePrewarm(requests, owed);
}

/**
 * Build ahead of the next season, on a season's own frames.
 *
 * This season is the one that will be receding then, so its requests are
 * formed from this frame's own season, grain and points. Whether the hand
 * lays the residence is this frame's own option, passed on.
 */
function prewarmNext(
  f: Frame,
  coloured: boolean,
  dim: number,
  withPrevious: boolean,
  reveal: boolean,
  residence: boolean,
  season: Season,
  grain: GrainProfile,
  pts: Points | null,
): void {
  const { view, dpr, st, data } = f;
  // A field that is not drawn asks for nothing. The draw's own floor is
  // tested at the boundary against a strength this frame cannot know, so this
  // is a guess on the side of working: a wrong one costs time, never a pixel.
  if (st.next === null || dim <= 0) return;
  const seg = f.schedule.byYear.get(season.year);
  if (!seg) return;
  // This season recedes under the next only where the next draws a previous
  // one, and the cut draws none.
  const receding = withPrevious && st.next !== CUT_YEAR && pts !== null
    ? { season, grain, pts }
    : null;
  payAhead(
    view, dpr, data, st.next, coloured, reveal, residence, (1 - st.phase) * seg.duration, receding,
  );
}

/**
 * Build ahead of the first season, on the prelude's frames.
 *
 * The prelude draws no hand, so nothing in it reaches a field, and the first
 * season's opening frames would otherwise make their layer and their order
 * whole, on the hand-over every loop of the piece opens with. No season is
 * receding there, so only the arriving one's requests are formed. The caller
 * names the field the hand about to play will lay, since no hand is drawing
 * to pass it; the first season is not the window's, so no residence is
 * asked for. Outside the prelude it does nothing.
 */
export function prewarmOpening(
  view: View,
  dpr: number,
  st: State,
  data: Loaded,
  coloured: boolean,
  reveal: boolean,
): void {
  if (st.act !== 0 || st.next === null) return;
  payAhead(
    view, dpr, data, st.next, coloured, reveal, false, (1 - st.preludePhase) * ACT0_SECONDS, null,
  );
}

export function drawSeasonField(f: Frame, opts: FieldOpts): void {
  const { ctx, view, dpr, st, data } = f;
  const {
    coloured = false, dim, withPrevious = true, residence = false, reveal = false,
    prewarm = false,
  } = opts;
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

  // THE DEVELOPMENT (stage A of the two-stage arrival): arrival is a
  // position in the exposure ladder, not a global alpha — the incoming
  // season develops like a print (rim flare out of the dark first, faintest
  // texture last) and the outgoing
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
      drawDeveloping(
        ctx, view, DEVELOP_STATES - developed(previousArrival) * DEVELOP_STATES,
        dim, bakePrev,
      );
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
  // shared arrival envelope — the two documented exceptions (FieldOpts.reveal).
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

  // Last, and after every draw of this frame: paying ahead takes no context.
  if (prewarm) prewarmNext(f, coloured, dim, withPrevious, reveal, residence, season, grain, pts);
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
