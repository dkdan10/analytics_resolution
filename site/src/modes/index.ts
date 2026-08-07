/** Hand dispatch, and the rotation. */

import { passAt, type Schedule } from "../timeline";
import { drawFieldHand } from "./field";
import { drawLedgerHand } from "./ledger";
import { drawPlateHand } from "./plate";
import { MODE_IDS, type Frame, type Hand, type ModeId } from "./types";

export { MODE_IDS, MODE_TITLES } from "./types";
export type { Frame, ModeId } from "./types";

const HANDS: Record<ModeId, Hand> = {
  plate: drawPlateHand,
  field: drawFieldHand,
  ledger: drawLedgerHand,
};

/** Rotation order: evidence, then the league's colours, then its words. */
const ROTATION: ModeId[] = ["plate", "field", "ledger"];

export function isModeId(v: string | null): v is ModeId {
  return v !== null && (MODE_IDS as readonly string[]).includes(v);
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
