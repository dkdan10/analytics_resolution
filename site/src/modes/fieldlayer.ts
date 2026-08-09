/** The shared field: every shot, for whichever hand is drawing.
 *
 * All four hands want the same thing beneath them — the season's whole record,
 * developing — differing only in whether it carries the league's colours and
 * how far it is dimmed. This keeps that in one place so the composite rules
 * (blit with `lighter`, pin drawn separately and source-over, previous season
 * receding as the current one develops) cannot drift apart between hands.
 */

import type { Season } from "../data";
import { bakeLayer, bakeResidence, developed, drawLayer } from "../field";
import { drawPin } from "../marks";
import { RESIDENCE_ALPHA } from "../scalars";
import { WINDOW_BEATS } from "../timeline";
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
}

/**
 * The residence's whole-layer envelope — THE ONLY THING `t` DRIVES.
 *
 * Rise through "many", hold through "the instant", washed by "the close", with
 * the beat edges read from `WINDOW_BEATS` so the rail and this layer cannot
 * disagree about where a beat begins. Never cell-by-cell: the grid is an
 * aggregate with no chronology, and animating cells would author an order the
 * source never measured. A pure function of phase — scrubbing backwards
 * rebuilds it, nothing is remembered.
 */
function residenceEnvelope(phase: number): number {
  const riseTo = WINDOW_BEATS.find((b) => b.id === "many")!.to;
  const washFrom = WINDOW_BEATS.find((b) => b.id === "close")!.from;
  if (phase < riseTo) return developed(phase / riseTo);
  if (phase < washFrom) return 1;
  return 1 - developed((phase - washFrom) / (1 - washFrom));
}

export function drawSeasonField(f: Frame, opts: FieldOpts): void {
  const { ctx, view, dpr, st, data } = f;
  const { coloured = false, dim, withPrevious = true, residence = false } = opts;
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

  if (withPrevious && st.prev !== null) {
    const prevSeason = data.byYear.get(st.prev);
    const prevPts = data.points(st.prev);
    if (prevSeason && prevPts) {
      const fading = (1 - st.arrived) * dim;
      drawLayer(
        ctx,
        bakeLayer(st.prev, prevPts, coloured, view, dpr, pinCoordOf(prevSeason)),
        view,
        fading,
      );
      drawPin(ctx, view, pinFractionOf(prevSeason), pinCoordOf(prevSeason), {
        dpr, opacity: fading,
      });
    }
  }

  const season = data.byYear.get(year)!;
  const pts = data.points(year);
  if (pts) {
    drawLayer(
      ctx,
      bakeLayer(year, pts, coloured, view, dpr, pinCoordOf(season)),
      view,
      developed(st.arrived) * dim,
    );
  }
  // The pin is never baked into the layer: it occludes rather than adds, and
  // it stands for shots the record refused to place, so it belongs to no zone
  // and takes no colour.
  drawPin(ctx, view, pinFractionOf(season), pinCoordOf(season), {
    dpr, opacity: dim, arrived: st.arrived,
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
