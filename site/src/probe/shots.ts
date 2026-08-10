/** Exact frames, for looking at — the third diagnostic, and the only one whose
 *  output is for a person rather than for a comparison.
 *
 * Every visual session so far has judged compositions from screenshots grabbed
 * off the RUNNING clock, which is not a comparison at all: the piece is a pure
 * function of one float, so "the same frame" means the same `t`. Session 4
 * mis-diagnosed a paint balance that way and 5a's handoff says so in as many
 * words. This renders through `renderTo` at an exact `t` onto a fixed offscreen
 * surface, exactly as the purity probe does, and hands back a PNG.
 *
 * IT IS NOT A GATE AND MUST NEVER BECOME ONE. It compares nothing and asserts
 * nothing; `?probe=purity` is what says whether pixels moved. This says what the
 * frame looks like.
 *
 * Reached only through `?probe=shots`, so it is behind the same door as the
 * other two: dynamically imported, never fetched by the gallery build, and it
 * returns instead of starting the rAF loop — the piece being photographed must
 * not also be animating.
 */

import { buildInscriptions } from "../inscription";
import { isModeId, type ModeId } from "../modes";
import { parseOps } from "../modes/operations";
import { GROUND } from "../palette";
import { makeView } from "../plate";
import { renderTo } from "../render";
import { cold, forceResidency } from "./shared";
import type { Env } from "./shared";

export interface ShotRequest {
  mode: string;
  t: number;
  width: number;
  height: number;
  dpr: number;
  talk?: boolean;
  /** THE STACK's operation token, exactly as `?ops=` carries it — `lci` for
   *  locate, classify and inscribe. Ignored by every other hand. Without it a
   *  picture of THE STACK is always a picture of bare stone, which is the one
   *  frame nobody needs a driver to imagine. */
  ops?: string;
  /** A packet candidate (`types.ts:Frame.candidate`). This request field is
   *  the ONLY door to it: main.ts parses no URL parameter into the frame, so
   *  a candidate composition exists in captures and nowhere else. */
  candidate?: string;
}

/**
 * Install `window.__shot`, which the driver calls once per frame.
 *
 * A FRESH SURFACE PER FRAME, and that is not tidiness. 5a established that
 * Chrome does not rasterise a canvas's second pass the way it rasterises its
 * first, which is what made three sessions of purity verdicts measure the
 * destination rather than the piece. Two frames taken for comparison must
 * therefore be drawn on canvases in identical condition, and the cheapest way
 * to guarantee that is to never reuse one.
 *
 * `cold()` before each, so a picture shows what a viewer arriving at that
 * instant would see rather than what a viewer who scrubbed there would.
 */
export async function shotsProbe(env: Env): Promise<void> {
  await forceResidency(env.data, () => {});
  const inscriptions = buildInscriptions(env.data.seasons, env.schedule);

  const draw = (r: ShotRequest, readback: boolean): CanvasRenderingContext2D => {
    const el = document.createElement("canvas");
    el.width = Math.round(r.width * r.dpr);
    el.height = Math.round(r.height * r.dpr);
    const ctx = el.getContext("2d", { alpha: false, willReadFrequently: readback })!;
    ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
    cold();
    const mode: ModeId | null = isModeId(r.mode) ? r.mode : null;
    renderTo(
      { ctx, view: makeView(r.width, r.height), dpr: r.dpr },
      r.t, env.data, env.schedule, inscriptions, mode, r.talk ?? false,
      parseOps(r.ops ?? null), r.candidate ?? null,
    );
    return ctx;
  };

  (window as unknown as Record<string, unknown>).__shot = async (r: ShotRequest) =>
    draw(r, false).canvas.toDataURL("image/png");

  /**
   * WHAT A FRAME WEIGHS, which is the only honest way to look for the passage
   * V-01 calls "accidentally blank or stalled".
   *
   * A person cannot watch the whole loop and say where the dead stretch was; a
   * luminance profile over it can, and 5a settled THE MEASURE's dead interval
   * with exactly this kind of count. `lit` counts pixels above the ground by
   * more than one 8-bit level, so it measures what a viewer can actually see
   * rather than what the buffer contains.
   *
   * Reported, never asserted. This decides nothing on its own — a bare plate at
   * the top of the prelude is composed absence, not a fault.
   */
  (window as unknown as Record<string, unknown>).__frameStats = async (r: ShotRequest) => {
    const ctx = draw(r, true);
    const { width, height } = ctx.canvas;
    const d = ctx.getImageData(0, 0, width, height).data;
    let lit = 0;
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < d.length; i += 4) {
      // The ground is a warm near-black; anything at or below it is the plate
      // being empty rather than the piece being dark.
      const v = Math.max(d[i]!, d[i + 1]!, d[i + 2]!);
      sum += v;
      if (v > peak) peak = v;
      if (v > GROUND_MAX + 1) lit++;
    }
    const px = d.length / 4;
    return { t: r.t, lit, litShare: lit / px, mean: sum / px, peak };
  };
}

/** The brightest channel in `palette.ts:GROUND`. Read from the string rather
 *  than restated, so a change to the ground cannot leave this behind. */
const GROUND_MAX = Math.max(
  ...[1, 3, 5].map((i) => parseInt(GROUND.slice(i, i + 2), 16)),
);
