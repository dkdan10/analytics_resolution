/** Exact frames, for looking at — the third diagnostic, and the only one whose
 *  output is for a person rather than for a comparison.
 *
 * Judging a composition from screenshots grabbed off the RUNNING clock is not a
 * comparison at all: the piece is a pure function of one float, so "the same
 * frame" means the same `t`, and a paint balance has already been mis-diagnosed
 * that way. This renders through `renderTo` at an exact `t` onto a fixed
 * offscreen surface, exactly as the purity probe does, and hands back a PNG.
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
import { boundedDpr, type DisplayProfile } from "../display";
import { isModeId, type ModeId } from "../modes";
import { completedStackState, parseOps } from "../modes/operations";
import { GROUND } from "../palette";
import { makeView } from "../plate";
import { renderTo } from "../render";
import { semanticStopById, semanticTime } from "../semantic";
import { ARRIVAL_TAIL, WINDOW_YEAR } from "../timeline";
import { cold, diffPixels, forceResidency } from "./shared";
import type { Env } from "./shared";

export interface ShotRequest {
  mode: string;
  t?: number;
  /** Human-readable score address. A valid stop takes precedence over t. */
  stop?: string;
  /** A season, addressed at rest: the middle of the hold between the end of
   *  its arrival and the next season's first frame. The frame a comparison of
   *  two finished seasons wants, without a typed second that drifts when the
   *  score does. Takes precedence over t. */
  settled?: number;
  width: number;
  height: number;
  /** A ratio, or `"bounded"` for the one the full work would draw this
   *  viewport at on a display of `deviceDpr`. A plain ratio above the budget
   *  is a frame the piece never shows anybody. */
  dpr: number | "bounded";
  /** The display's own ratio, read only when `dpr` is `"bounded"`. */
  deviceDpr?: number;
  /** Pin the software rasteriser, so two runs of one build are the same
   *  bytes. For comparing files; it is not how the piece looks on a screen. */
  exact?: boolean;
  talk?: boolean;
  display?: DisplayProfile;
  /** THE STACK's operation token, exactly as `?ops=` carries it — `lci` for
   *  locate, classify and inscribe. Ignored by every other hand. Without it a
   *  picture of THE STACK is always a picture of bare stone, which is the one
   *  frame nobody needs a driver to imagine. */
  ops?: string;
  /** A candidate composition (`types.ts:Frame.candidate`). This request field
   *  is the ONLY door to it: main.ts parses no URL parameter into the frame, so
   *  a candidate composition exists in captures and nowhere else. */
  candidate?: string;
}

/**
 * Install `window.__shot`, which the driver calls once per frame.
 *
 * A FRESH SURFACE PER FRAME, and that is not tidiness. Chrome does not
 * rasterise a canvas's second pass the way it rasterises its first — measured,
 * not assumed — and that is what made the purity probe's early verdicts measure
 * the destination rather than the piece (purity.ts, "TWO DESTINATIONS"). Two
 * frames taken for comparison must therefore be drawn on canvases in identical
 * condition, and the cheapest way to guarantee that is to never reuse one.
 *
 * `cold()` before each, so a picture shows what a viewer arriving at that
 * instant would see rather than what a viewer who scrubbed there would.
 */
export async function shotsProbe(env: Env): Promise<void> {
  await forceResidency(env.data, () => {});
  const inscriptions = buildInscriptions(env.data.seasons, env.schedule);

  const settledAt = (year: number): number => {
    const seg = env.schedule.byYear.get(year);
    if (!seg) throw new Error(`settled: no season ${year} in the score`);
    // The window season is not an arrival and a rest; it is the acts.
    if (year === WINDOW_YEAR) throw new Error(`settled: season ${year} is the window; name a stop`);
    return seg.start + seg.duration * (ARRIVAL_TAIL + 1) / 2;
  };

  const resolve = (r: ShotRequest): { time: number; mode: ModeId | null } => {
    const stop = semanticStopById(r.stop ?? null);
    // A name that is not in the score used to fall through to whatever else
    // the request carried, and the picture was filed under the name anyway.
    if (r.stop && !stop) throw new Error(`no such stop: ${r.stop}`);
    if (!stop && !isModeId(r.mode)) throw new Error(`no such hand: ${r.mode}`);
    const at = stop
      ? semanticTime(stop, env.schedule, env.data.slateFile?.span.seconds)
      : r.settled !== undefined ? settledAt(r.settled) : null;
    // An instant that is not a number used to draw second zero and call it
    // the frame asked for, so a mistyped list was a set of bare plates filed
    // under the right names.
    if (at === null && !Number.isFinite(r.t)) {
      throw new Error(`not an instant: ${String(r.t)} (give t, a stop or a settled season)`);
    }
    return {
      time: at ?? Math.max(0, r.t!),
      mode: stop?.mode ?? (isModeId(r.mode) ? r.mode : null),
    };
  };

  const ratioOf = (r: ShotRequest): number =>
    r.dpr === "bounded" ? boundedDpr(r.width, r.height, r.deviceDpr ?? 1) : r.dpr;

  const draw = (r: ShotRequest, readback: boolean): CanvasRenderingContext2D => {
    const dpr = ratioOf(r);
    const el = document.createElement("canvas");
    // Floored, as the gallery floors its own backing: at a bounded ratio the
    // product is not a whole number, and a frame one pixel wider than the
    // piece's is a different resampling of every cached layer.
    el.width = Math.max(1, Math.floor(r.width * dpr));
    el.height = Math.max(1, Math.floor(r.height * dpr));
    const ctx = el.getContext("2d", { alpha: false, willReadFrequently: readback })!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cold();
    const resolved = resolve(r);
    renderTo(
      { ctx, view: makeView(r.width, r.height), dpr },
      resolved.time, env.data, env.schedule, inscriptions, resolved.mode,
      r.talk ?? false, false, completedStackState(parseOps(r.ops ?? null)),
      r.candidate ?? null, r.display ?? (r.talk ? "room" : "near"),
    );
    return ctx;
  };

  (window as unknown as Record<string, unknown>).__shot = async (r: ShotRequest) =>
    draw(r, r.exact ?? false).canvas.toDataURL("image/png");

  /** What the driver was actually given: the instant an address resolved to
   *  and the ratio and backing a surface came out at, so a file name's claim
   *  can be read against the frame behind it. */
  (window as unknown as Record<string, unknown>).__shotFacts = (r: ShotRequest) => {
    const dpr = ratioOf(r);
    return {
      t: resolve(r).time,
      dpr,
      backing: {
        width: Math.max(1, Math.floor(r.width * dpr)),
        height: Math.max(1, Math.floor(r.height * dpr)),
      },
    };
  };

  /**
   * Two finished pictures, compared in the terms every verdict uses.
   *
   * For a person deciding where to look, not for a gate: it says how many
   * channels differ between two files and by how much at most, and nothing
   * about whether that matters. Decoded with no colour conversion, so what is
   * compared is the bytes the two captures wrote.
   */
  (window as unknown as Record<string, unknown>).__diffPng = async (a: string, b: string) => {
    const pixels = async (url: string) => {
      const bitmap = await createImageBitmap(await (await fetch(url)).blob(), {
        colorSpaceConversion: "none",
        premultiplyAlpha: "none",
      });
      const el = document.createElement("canvas");
      el.width = bitmap.width;
      el.height = bitmap.height;
      const ctx = el.getContext("2d", { alpha: false, willReadFrequently: true })!;
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      return { width: el.width, height: el.height,
               data: ctx.getImageData(0, 0, el.width, el.height).data };
    };
    const [pa, pb] = [await pixels(a), await pixels(b)];
    if (pa.width !== pb.width || pa.height !== pb.height) {
      return { comparable: false, a: [pa.width, pa.height], b: [pb.width, pb.height] };
    }
    const d = diffPixels(pa.data, pb.data, pa.width);
    return { comparable: true, channels: d.channels, share: d.share,
             maxDelta: d.maxDelta, firstPixel: d.firstPixel };
  };

  /**
   * WHAT A FRAME WEIGHS, which is the only honest way to look for a passage
   * that is accidentally blank or stalled.
   *
   * A person cannot watch the whole loop and say where the dead stretch was; a
   * luminance profile over it can, and THE MEASURE's dead interval was settled
   * with exactly this kind of count. `lit` counts pixels above the ground by
   * more than one 8-bit level, so it measures what a viewer can actually see
   * rather than what the buffer contains.
   *
   * Reported, never asserted. This decides nothing on its own — a bare plate at
   * the top of the prelude is composed absence, not a fault.
   */
  (window as unknown as Record<string, unknown>).__frameStats = async (r: ShotRequest) => {
    // Read back from the rasteriser the picture itself is taken on, so the
    // figures written beside a PNG are figures about that PNG.
    const ctx = draw(r, r.exact ?? true);
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
    return { t: resolve(r).time, stop: r.stop ?? null, lit, litShare: lit / px, mean: sum / px, peak };
  };
}

/** The brightest channel in `palette.ts:GROUND`. Read from the string rather
 *  than restated, so a change to the ground cannot leave this behind. */
const GROUND_MAX = Math.max(
  ...[1, 3, 5].map((i) => parseInt(GROUND.slice(i, i + 2), 16)),
);
