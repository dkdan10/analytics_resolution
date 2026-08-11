/** The mode axis: the same record, drawn by different hands — and one view that
 * takes those hands apart.
 *
 * This is not a feature menu. The league's present position is that it
 * publishes ever more elaborate *renderings* of data it will not hand over —
 * "the public may watch renderings of the data but cannot hold the data". A
 * piece that shows you several renderings of one record, none of which is the
 * record, makes that case in its own form rather than stating it.
 *
 * SEVEN IDS, SIX HANDS, AND THE SEVENTH IS NOT A HAND. Session 6 added THE
 * STACK, and it is a different kind of thing from the six — which is why this
 * paragraph is a rewrite and not an incremented number. The six each render the
 * whole record one way. THE STACK renders nothing of its own: it composites the
 * others' material over a single shared base, one named interpretive operation
 * at a time, starting from bare stone with everything switched off. A view that
 * lets you watch each rendering being APPLIED — and switch it back off — says
 * something the six cannot say standing beside each other, which is that the
 * image is made of decisions and none of them is the record. It is talk-mode
 * only and is not in the gallery rotation; `ROTATION` in ./index.ts stays six.
 *
 * Every hand is a pure function of the same scrub float, and THE STACK of that
 * float plus a configuration that travels with it in the URL. None may hold
 * state between frames, so scrubbing backwards rebuilds rather than remembers.
 */

import type { Loaded } from "../data";
import type { DisplayProfile } from "../display";
import type { Inscription } from "../inscription";
import type { View } from "../plate";
import type { Schedule, State } from "../timeline";
import type { StackRenderState } from "./operations";

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
  /** Whether the presenter/navigation panel is visibly occupying the frame. */
  navVisible: boolean;
  /** Viewer-distance legibility profile. */
  display: DisplayProfile;
  /**
   * Which interpretive operations THE STACK has been asked to apply.
   *
   * MODE CONFIGURATION, on exactly `talk`'s footing and for exactly its reason:
   * it is passed in, it is never written to, and it holds nothing between
   * frames — so `renderTo` stays a pure function of its arguments and `t` still
   * determines the frame completely once the configuration is fixed. Unlike
   * `talk` it is also ADDRESSABLE (`?ops=`), because the purity harness reaches
   * a frame by direct URL and a configuration only a click can reach cannot be
   * tested that way at all.
   *
   * A selected-operation mask plus pure operation-local progress values. Every
   * hand but THE STACK ignores it.
   */
  stack: StackRenderState;
  /**
   * A PACKET CANDIDATE, never a gallery state. Populated only by the shots
   * probe (`?probe=shots`, `scripts/shots.mjs --candidate ...`); `main.ts`
   * parses no URL parameter into it, so no gallery or talk viewer can reach a
   * candidate frame — which is what "captured for the artist's judgment, not
   * wired" means mechanically. Same purity footing as `talk` and `stack`:
   * passed in, never written to, nothing held between frames. Today the one
   * value any hand reads is "quarrel" — THE PLATE's window composites the
   * quarrel flood so the artist can judge the gallery question from frames.
   */
  candidate: string | null;
}

export type Hand = (f: Frame) => void;

export const MODE_IDS = [
  "plate", "field", "ledger", "census", "measure", "hand", "stack",
] as const;
export type ModeId = (typeof MODE_IDS)[number];

export const MODE_TITLES: Record<ModeId, string> = {
  plate: "the plate",
  field: "the field",
  ledger: "the ledger",
  census: "the census",
  measure: "the measure",
  hand: "the hand",
  stack: "the stack",
};

/**
 * Modes the gallery may not be pinned to.
 *
 * ARTIST'S RULING, 2026-08-09, taken on a measured fact about `main.ts` rather
 * than on a preference: `?mode=` is read through `isModeId` with no talk check,
 * and `bindTalkKeys` is only called inside the talk branch. So the moment
 * `stack` entered `MODE_IDS`, `/?mode=stack` on a wall machine would pin a view
 * that opens on bare stone, with no rail, no keyboard and no rotation — and
 * genuinely no way out of it. THE STACK is also an instrument by design, and an
 * instrument that can appear in a gallery is not an instrument, it is a fault.
 */
export const TALK_ONLY_MODES: readonly ModeId[] = ["stack"];
