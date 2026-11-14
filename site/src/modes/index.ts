/** Hand dispatch, and the rotation. */

import type { WindowAsset } from "../data";
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
/** The full work is one complete pass of the loop per hand, in rotation order. */
export const ROTATION_PASSES = ROTATION.length;
/** The pass that draws this hand; negative for THE STACK, which no pass draws. */
export function passOfMode(id: ModeId): number {
  return ROTATION.indexOf(id);
}
/** The rotation's order, as a copy: a caller cannot reorder the loop. */
export function rotationModes(): readonly ModeId[] {
  return [...ROTATION];
}

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

/**
 * The window's files each hand's frames read beyond the season's points, in
 * the order they are asked for ahead of the window.
 *
 * What is asked for ahead of the window follows the hand about to play it. A
 * file that hand never reads would be downloaded for nothing. A file a hand
 * reads and does not name here is asked for by its own first frame, as on a
 * landing, so a list that falls short costs time and a list that runs long
 * costs a download: keep each to what the hand's own code reads. THE STACK
 * reads the paint and the quarrel only under an operation, so it names
 * neither.
 *
 * The order is the order to ask in, not the order a frame reads in. Files are
 * asked for one at a time and none past the first that has not arrived, so
 * where one fails ahead, every file after it is left to the frame that reads
 * it. A file whose reader waits for another comes after that one, as the
 * paint's wash, game and slate come after its strokes. The plate's frame
 * reads its game before its calendar and neither waits for the other; the
 * calendar leads because building ahead reads it too, for the window's fold
 * order.
 */
const WINDOW_READS: Record<ModeId, readonly WindowAsset[]> = {
  plate: ["calendar", "game"],
  field: ["calendar"],
  ledger: ["calendar"],
  census: [],
  measure: ["calendar", "measures"],
  hand: ["measures", "strokes", "wash", "game", "slate"],
  stack: [],
};

export function windowReadsOf(mode: ModeId): readonly WindowAsset[] {
  return WINDOW_READS[mode];
}

/**
 * The field a hand lays its first season on, as far as building ahead has to
 * name it: whether it carries the league's colours, and whether the season
 * arrives mark by mark or develops as one image.
 *
 * The prelude draws no hand, so the work done ahead of the first season
 * cannot read these from the options a hand passes its field, as a season's
 * own frames do. This restates them. A hand absent here builds nothing ahead
 * of its first season. An entry that disagrees with its hand costs time and
 * never a pixel: what is built is met only as a cache entry, under the key
 * the hand's own draw asks for.
 */
const OPENING_FIELD: Partial<Record<ModeId, { coloured: boolean; reveal: boolean }>> = {
  plate: { coloured: false, reveal: true },
  field: { coloured: true, reveal: true },
  ledger: { coloured: false, reveal: true },
  measure: { coloured: false, reveal: true },
  census: { coloured: false, reveal: false },
};

export function openingFieldOf(mode: ModeId): { coloured: boolean; reveal: boolean } | null {
  return OPENING_FIELD[mode] ?? null;
}
