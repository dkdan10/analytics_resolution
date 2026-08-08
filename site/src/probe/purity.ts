/** Harness A — is `render(mode, t)` really a pure function of one float?
 *
 * The piece's fifth rule says it is: scrubbing backwards REBUILDS, it never
 * remembers. Derived caches are allowed; accumulated state is not. That claim
 * had never been tested, and the 2026-08-08 audit found it false for THE HAND,
 * which extends one module-level canvas in 64-stroke blocks: two frames of the
 * same instant, reached along different histories, differed in 110,983 of
 * 2,233,440 RGB channel bytes.
 *
 * So: for each hand, at each representative beat, the same `t` is reached four
 * ways and the resulting pixels are hashed.
 *
 *   continuous   two seconds of playback at 1/60, landing exactly on t
 *   forward      an earlier beat, then a jump to t
 *   backward     a later beat, then a jump to t
 *   direct       every cache emptied, one render at t
 *
 * `direct` is the reference: it is what a fresh page load at `?t=` produces.
 * Anything that disagrees with it is a frame that depends on how you got there.
 *
 * Exact bytes, not screenshots. `getImageData` has no capture noise, so a
 * difference reported here is a difference in what was drawn.
 *
 * THE HAND IS EXPECTED TO FAIL. That is audit finding F-04 and it belongs to
 * session 4. This harness exists to measure it, not to hide it, and it is also
 * how the `renderTo` extraction was shown to have moved nothing: the five pure
 * hands come back byte-identical across all four histories.
 */

import { renderTo } from "../render";
import type { ModeId } from "../modes";
import type { PixelDiff } from "./shared";
import {
  cold,
  beatsOf,
  diffPixels,
  emit,
  forceResidency,
  hashPixels,
  makeTarget,
  MODES,
  warmUp,
  aboveNoise,
  measureNoiseFloor,
  PROBE_DPR,
  PROBE_H,
  PROBE_W,
  type Env,
} from "./shared";

const HISTORIES = ["direct", "forward", "backward", "continuous"] as const;
type History = (typeof HISTORIES)[number];

/**
 * How far back continuous playback starts, and its step.
 *
 * One second is sixty frames per capture, and with five captures at each of
 * seventy-two mode-and-beat pairs the run is already ~4,800 renders onto a
 * software-rasterised 2560x1440 surface. `&playback=` lengthens it where a
 * longer history is wanted; nothing found so far needs more than a second to
 * show itself, because what these histories differ in is whether a cache was
 * built forwards, backwards or not at all.
 */
const DEFAULT_PLAYBACK_S = 1;
const STEP = 1 / 60;
/** How far a seek jumps from. Far enough to be a different act at most beats. */
const SEEK_S = 45;

export async function purityProbe(env: Env, q: URLSearchParams): Promise<unknown> {
  const { data, schedule, inscriptions } = env;
  const residency = await forceResidency(data, (s) => console.log(s));
  const playback = Number(q.get("playback")) || DEFAULT_PLAYBACK_S;

  /**
   * Two ways to hold the surface still, and they trade precision for hours.
   *
   * DEFAULT — the accelerated canvas the gallery actually runs on. It is not
   * bit-stable across memory pressure, so the run measures its own noise floor
   * (see below) and only calls a difference the piece's when it clears it. On
   * this machine the floor is ~60,000 channels at a maximum delta of 8, and
   * F-04's is thirty-five times that.
   *
   * `&exact=1` — software rasterisation, pinned. The floor drops to zero and a
   * single differing channel is real, but a 2560x1440 frame costs an order of
   * magnitude more to draw and the whole run takes hours rather than minutes.
   * Reach for it to characterise something the default has already found.
   */
  const exact = q.get("exact") === "1";
  const target = makeTarget(exact);
  const beats = beatsOf(schedule);
  // Every beat is taken on the SECOND pass of the loop, so that continuous
  // playback into the prelude arrives out of the previous loop's coda exactly
  // as the gallery does, rather than out of nothing.
  const base = schedule.duration;

  const draw = (t: number, mode: ModeId) =>
    renderTo(target, t, data, schedule, inscriptions, mode);

  const capture = (t: number, mode: ModeId, history: History): Uint8ClampedArray => {
    cold();
    if (history === "forward") draw(t - SEEK_S, mode);
    if (history === "backward") draw(t + SEEK_S, mode);
    if (history === "continuous") {
      for (let k = Math.round(playback / STEP); k >= 1; k--) draw(t - k * STEP, mode);
    }
    draw(t, mode);
    return target.ctx.getImageData(0, 0, PROBE_W * PROBE_DPR, PROBE_H * PROBE_DPR).data;
  };

  // Settle every first-use cost before anything is captured. Without this the
  // browser's own warm-up reads as impurity in every hand that draws text.
  warmUp(draw, beats, base);

  // The environment's own variation, measured under the pressure this run
  // creates, before any of it is attributed to the piece.
  const noise = measureNoiseFloor(
    () => draw(base + beats[0]!.at, "plate"),
    () => target.ctx.getImageData(0, 0, PROBE_W * PROBE_DPR, PROBE_H * PROBE_DPR).data,
    PROBE_W * PROBE_DPR,
  );
  console.log(`noise floor: ${noise.channels} channels, max delta ${noise.maxDelta}, `
    + `under ${noise.ballastMB} MB of ballast`);

  const rows: unknown[] = [];
  let impure = 0;
  let inconclusive = 0;
  let withinNoise = 0;

  for (const mode of MODES) {
    for (const beat of beats) {
      // Hand the main thread back between beats. Five thousand renders onto a
      // software-rasterised surface is minutes of work, and a page that cannot
      // repaint or answer a console question for that long looks hung rather
      // than busy.
      await new Promise((r) => setTimeout(r, 0));
      const t = base + beat.at;
      const shots: Partial<Record<History, Uint8ClampedArray>> = {};
      const hashes: Partial<Record<History, string>> = {};
      for (const h of HISTORIES) {
        shots[h] = capture(t, mode, h);
        hashes[h] = hashPixels(shots[h]!);
      }
      // THE CONTROL. `direct` again, with nothing whatever changed between the
      // two. It must be byte-identical, and if it is not then the measurement
      // has moved and nothing else in this row can be believed. An instrument
      // that cannot tell "the piece is impure" from "the instrument drifted"
      // is not evidence, and this is the difference between the two.
      const control = capture(t, mode, "direct");
      const stable = hashPixels(control) === hashes.direct;

      // `direct` is what a fresh load produces, so it is what the others are
      // measured against.
      const ref = shots.direct!;
      const diffs: Record<string, PixelDiff> = {};
      let identical = true;
      let real = false;
      for (const h of HISTORIES) {
        if (h === "direct") continue;
        if (hashes[h] === hashes.direct) continue;
        identical = false;
        diffs[h] = diffPixels(ref, shots[h]!, PROBE_W * PROBE_DPR);
        if (aboveNoise(diffs[h]!.channels, noise)) real = true;
      }
      // Three-valued on purpose. `within-noise` is not a pass and not a
      // failure: it is the instrument saying the difference is smaller than
      // its own hands shake, and the numbers are reported either way.
      if (!stable) inconclusive++;
      else if (real) impure++;
      else if (!identical) withinNoise++;
      const verdict = !stable ? "INCONCLUSIVE"
        : real ? "IMPURE" : identical ? "pure" : "within-noise";
      console.log(`purity ${mode}/${beat.id}: ${verdict}`);
      rows.push({
        mode,
        beat: beat.id,
        t: Number(t.toFixed(4)),
        verdict,
        controlStable: stable,
        hashes,
        ...(stable ? {} : { control: diffPixels(ref, control, PROBE_W * PROBE_DPR) }),
        ...(identical ? {} : { diffs }),
      });
    }
  }

  const byMode = Object.fromEntries(
    MODES.map((m) => {
      const mine = rows as { mode: string; verdict: string; diffs?: Record<string, { channels: number }> }[];
      const ours = mine.filter((r) => r.mode === m);
      const bad = ours.filter((r) => r.verdict === "IMPURE");
      const worst = bad
        .flatMap((r) => Object.values(r.diffs ?? {}))
        .reduce((a, d) => Math.max(a, d.channels), 0);
      return [m, {
        beats: ours.length,
        pure: ours.filter((r) => r.verdict === "pure").length,
        withinNoise: ours.filter((r) => r.verdict === "within-noise").length,
        impure: bad.length,
        inconclusive: ours.filter((r) => r.verdict === "INCONCLUSIVE").length,
        worstDifferingChannels: worst,
      }];
    }),
  );

  return {
    probe: "purity",
    verdict: inconclusive ? "INCONCLUSIVE" : impure === 0 ? "PURE" : "IMPURE",
    surface: { width: PROBE_W, height: PROBE_H, dpr: PROBE_DPR },
    histories: HISTORIES,
    reference: "direct",
    playbackSeconds: playback,
    seekSeconds: SEEK_S,
    beats: beats.map((b) => b.id),
    residency,
    impureBeats: impure,
    withinNoiseBeats: withinNoise,
    inconclusiveBeats: inconclusive,
    noiseFloor: noise,
    totalBeats: rows.length,
    rasterisation: exact
      ? "software (willReadFrequently), pinned - the floor is zero and a single "
        + "differing channel is real"
      : "accelerated, as the gallery runs it - not bit-stable across memory "
        + "pressure, so read every verdict against noiseFloor below (&exact=1 "
        + "pins software rasterisation instead, and takes hours)",
    byMode,
    rows,
  };
}

export function emitPurity(report: unknown): void {
  emit("probe-purity", report);
}
