/** Hand dispatch, and the rotation. */

import { passAt, type Schedule } from "../timeline";
import { drawCensusHand } from "./census";
import { drawFieldHand } from "./field";
import { drawHandHand } from "./hand";
import { drawLedgerHand } from "./ledger";
import { drawMeasureHand } from "./measure";
import { drawPlateHand } from "./plate";
import { drawStackHand } from "./stack";
import { MODE_IDS, TALK_ONLY_MODES, type Frame, type Hand, type ModeId } from "./types";

export { MODE_IDS, MODE_TITLES, TALK_ONLY_MODES } from "./types";
export type { Frame, ModeId } from "./types";

const HANDS: Record<ModeId, Hand> = {
  plate: drawPlateHand,
  field: drawFieldHand,
  ledger: drawLedgerHand,
  census: drawCensusHand,
  measure: drawMeasureHand,
  hand: drawHandHand,
  stack: drawStackHand,
};

/**
 * Rotation order: evidence, then the league's colours, then its words, then
 * its count, then the one measure anyone outside could ever make — and last
 * the paint, which is the only hand that draws what the record did NOT keep.
 *
 * SIX, AND THE SEVENTH ID IS DELIBERATELY ABSENT. THE STACK is in `MODE_IDS`
 * because a presenter can pin it; it is not here because the gallery may not
 * arrive at it. Two reasons, and the second is the load-bearing one. `modeAt`
 * derives the hand from `passAt(t) % ROTATION.length`, so adding an entry
 * re-maps which hand every instant in the loop belongs to — every committed
 * purity and perf sweep is indexed by that mapping. And THE STACK opens on bare
 * stone by design: with no rail and no keyboard it would never leave it.
 */
const ROTATION: ModeId[] = ["plate", "field", "ledger", "census", "measure", "hand"];

export function isModeId(v: string | null): v is ModeId {
  return v !== null && (MODE_IDS as readonly string[]).includes(v);
}

/** Whether `?mode=` may name this one on a machine with no rail. */
export function isGalleryMode(id: ModeId): boolean {
  return !TALK_ONLY_MODES.includes(id);
}

/**
 * The hand for a given moment.
 *
 * With no override, each pass of the loop draws the same record differently: a
 * visitor who stays one pass sees one rendering, one who stays longer sees the
 * others and learns that none of them is the record. Because it is derived from
 * `t` rather than held, seeking and scrubbing keep working untouched.
 */
export function modeAt(t: number, schedule: Schedule, override: ModeId | null): ModeId {
  if (override) return override;
  return ROTATION[passAt(t, schedule) % ROTATION.length]!;
}

export function drawHand(mode: ModeId, f: Frame): void {
  HANDS[mode](f);
}
