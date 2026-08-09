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

  (window as unknown as Record<string, unknown>).__shot = async (r: ShotRequest) => {
    const el = document.createElement("canvas");
    el.width = Math.round(r.width * r.dpr);
    el.height = Math.round(r.height * r.dpr);
    const ctx = el.getContext("2d", { alpha: false })!;
    ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
    cold();
    const mode: ModeId | null = isModeId(r.mode) ? r.mode : null;
    renderTo(
      { ctx, view: makeView(r.width, r.height), dpr: r.dpr },
      r.t, env.data, env.schedule, inscriptions, mode, r.talk ?? false,
    );
    return el.toDataURL("image/png");
  };
}
