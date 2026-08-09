/** The mode axis: the same record, drawn by different hands.
 *
 * This is not a feature menu. The league's present position is that it
 * publishes ever more elaborate *renderings* of data it will not hand over —
 * "the public may watch renderings of the data but cannot hold the data". A
 * piece that shows you several renderings of one record, none of which is the
 * record, makes that case in its own form rather than stating it.
 *
 * Every hand is a pure function of the same scrub float. None may hold state
 * between frames, so scrubbing backwards rebuilds rather than remembers.
 */

import type { Loaded } from "../data";
import type { Inscription } from "../inscription";
import type { View } from "../plate";
import type { Schedule, State } from "../timeline";

export interface Frame {
  ctx: CanvasRenderingContext2D;
  view: View;
  dpr: number;
  st: State;
  data: Loaded;
  schedule: Schedule;
  inscriptions: Inscription[];
  /** 1 minus the coda; everything the piece drew recedes to bare stone. */
  remains: number;
  /**
   * Whether somebody is working, rather than whether anything is remembered.
   *
   * MODE CONFIGURATION, NOT HELD STATE, and the distinction is the reason this
   * is allowed to exist at all: `render` is still a pure function of its inputs,
   * and `t` still determines the frame completely for a given configuration.
   * Nothing here accumulates and nothing here survives a frame.
   *
   * It follows the RAIL rather than the talk clock, so `?talk&nav=0` gives a
   * clean plate for a capture — which is what the capture recipe asks for. THE
   * CENSUS is the only hand that reads it today: its six-table apparatus is
   * kept verbatim for the lectern and is not on the gallery wall.
   */
  talk: boolean;
}

export type Hand = (f: Frame) => void;

export const MODE_IDS = ["plate", "field", "ledger", "census", "measure", "hand"] as const;
export type ModeId = (typeof MODE_IDS)[number];

export const MODE_TITLES: Record<ModeId, string> = {
  plate: "the plate",
  field: "the field",
  ledger: "the ledger",
  census: "the census",
  measure: "the measure",
  hand: "the hand",
};
