/** Harness A — is `render(mode, t)` really a pure function of one float?
 *
 * The piece's fifth rule says it is: scrubbing backwards REBUILDS, it never
 * remembers. Derived caches are allowed; accumulated state is not. That claim
 * had never been tested, and the 2026-08-08 audit found it false for THE HAND,
 * which extends one module-level canvas in 64-stroke blocks: two frames of the
 * same instant, reached along different histories, do not match. Run this to
 * see by how much; the count belongs in the report, not in a comment that will
 * outlive it.
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
 * TWO DESTINATIONS, AND ONLY ONE OF THEM CARRIES THE VERDICT (session 5a).
 *
 * Every history above differs in a second way nobody had separated out: how
 * many render passes the DESTINATION canvas has received before the readback.
 * `direct` draws once into it, `forward` twice, `continuous` sixty-one times.
 * Chrome does not rasterise pass two of a canvas identically to pass one, so
 * that difference alone moves pixels — and it is not the piece.
 *
 * It was measured rather than argued. At the beat this probe had been calling
 * THE PLATE impure since session 2, the drawing commands the renderer issues
 * are identical op for op under every history, the field layers it composites
 * are byte-identical, and the frames still differ. Identical inputs, identical
 * command stream, different pixels: whatever that is, no change to a renderer
 * can remove it.
 *
 * So each frame is captured twice.
 *
 *   RENDERER   the history is replayed onto a scratch surface, warming exactly
 *              the caches it would warm, and the frame under test is then drawn
 *              on a VIRGIN one. The destination is in the same condition in
 *              every history, so a difference here is renderer state — which is
 *              what the fifth rule is about. THIS IS THE VERDICT.
 *   SURFACE    what this probe did before: the history and the frame share one
 *              destination. Reported, never verdict-bearing, because it cannot
 *              tell the piece's memory from the canvas's.
 *
 * The surface arm is kept rather than deleted for two reasons. It is the only
 * arm that would notice a hand accumulating into the target context itself
 * (`renderTo` opens by filling the whole surface opaque, so nothing does today
 * — but nothing enforces it either), and the sweeps sessions 2 to 4 committed
 * are surface-arm numbers, so dropping it would strand the evidence they left.
 *
 * A capture method that reported everything identical whatever happened would
 * be worse than the confound it replaced. This one was checked against a staged
 * impurity before it was believed; the check is written up in the session 5a
 * handoff.
 *
 * THE HAND IS EXPECTED TO FAIL. That is audit finding F-04 and it belongs to
 * session 4. This harness exists to measure it, not to hide it.
 *
 * WHAT IS AND IS NOT ESTABLISHED — read this before trusting a verdict.
 * THE HAND's impurity is measured, at the window beats, and reproduced on every
 * version of this harness. The other five hands are NOT yet proven clean: no
 * completed calibrated sweep of all six exists. What session 2 had was an
 * uncalibrated run in which all six read impure INCLUDING the prelude, where
 * `renderTo` returns before any hand is called and the frame is therefore
 * mode-independent — which is what exposed the instrument rather than the
 * piece — plus a software-rasterised partial run in which THE PLATE came back
 * clean. An earlier version of this comment said the extraction "was shown to
 * have moved nothing: the five pure hands come back byte-identical". That was
 * asserting an unproven result inside the source of the instrument that would
 * prove it, which is exactly the honesty defect this project audits itself for.
 *
 * So: run a full sweep before changing a renderer, and read the noise floor
 * before reading a verdict.
 */

import { renderTo, type Target } from "../render";
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
  narrow,
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
  /** The surface arm's destination: ONE canvas for the whole run, exactly as
   *  this probe has always had, so its numbers stay comparable with the sweeps
   *  sessions 2 to 4 committed. */
  const surface = makeTarget(exact);
  // Narrowed the same way the perf probe is, and an unmatched name throws
  // rather than silently sweeping nothing. A full sweep is the default.
  const modes = narrow("hand", MODES, q.get("mode"), (m) => m);
  const beats = narrow("beat", beatsOf(schedule), q.get("beat"), (b) => b.id);
  // Every beat is taken on the SECOND pass of the loop, so that continuous
  // playback into the prelude arrives out of the previous loop's coda exactly
  // as the gallery does, rather than out of nothing.
  const base = schedule.duration;

  const drawOn = (tg: Target, t: number, mode: ModeId) =>
    renderTo(tg, t, data, schedule, inscriptions, mode);
  const draw = (t: number, mode: ModeId) => drawOn(surface, t, mode);
  const pixels = (tg: Target) =>
    tg.ctx.getImageData(0, 0, PROBE_W * PROBE_DPR, PROBE_H * PROBE_DPR).data;

  /** The frames a history draws BEFORE the one under test. */
  const replay = (tg: Target, t: number, mode: ModeId, history: History): void => {
    if (history === "forward") drawOn(tg, t - SEEK_S, mode);
    if (history === "backward") drawOn(tg, t + SEEK_S, mode);
    if (history === "continuous") {
      for (let k = Math.round(playback / STEP); k >= 1; k--) drawOn(tg, t - k * STEP, mode);
    }
  };

  /** THE VERDICT ARM. The history warms the renderer's caches on a surface
   *  nobody reads, and the frame under test is drawn on a virgin one. */
  const captureRenderer = (t: number, mode: ModeId, history: History): Uint8ClampedArray => {
    cold();
    if (history !== "direct") replay(makeTarget(exact), t, mode, history);
    const tg = makeTarget(exact);
    drawOn(tg, t, mode);
    return pixels(tg);
  };

  /** The old arm, unchanged: history and frame share one destination. */
  const captureSurface = (t: number, mode: ModeId, history: History): Uint8ClampedArray => {
    cold();
    replay(surface, t, mode, history);
    draw(t, mode);
    return pixels(surface);
  };

  // Settle every first-use cost before anything is captured. Without this the
  // browser's own warm-up reads as impurity in every hand that draws text.
  warmUp(draw, beats, base);

  // The environment's own variation, measured under the pressure this run
  // creates, before any of it is attributed to the piece.
  //
  // MEASURED ON THE HEAVIEST FRAME IN THE SWEEP, not the cheapest. It used to
  // render `beats[0]` — the prelude, where `renderTo` returns before any hand
  // is called and the plate is bare — and then apply that floor to frames
  // carrying tens of thousands of marks. Session 2's handoff named this as a
  // limit of the instrument and it turns out to matter: a bare frame's floor
  // came back at zero channels on this machine while a window beat's is
  // thousands, so the cheap floor promoted the browser's own jitter on a heavy
  // frame into a finding about the piece. The floor is a property of the FRAME,
  // so it is measured on the frame it will be used to judge.
  // The window beats are the heaviest the piece has: every hand that draws
  // there has the whole recovered set and the whole painting resident.
  const heaviest = [...beats].reverse().find((b) => b.id.startsWith("window-")) ?? beats[0]!;
  // EACH ARM IS JUDGED AGAINST A FLOOR MEASURED THE WAY THAT ARM CAPTURES.
  // A floor taken on a shared surface says nothing about an arm that draws on a
  // virgin one, and the reverse: the two differ by precisely the effect the
  // renderer arm exists to remove.
  let floorTarget: Target = surface;
  const noise = measureNoiseFloor(
    () => {
      floorTarget = makeTarget(exact);
      for (const mode of modes) drawOn(floorTarget, base + heaviest.at, mode);
    },
    () => pixels(floorTarget),
    PROBE_W * PROBE_DPR,
  );
  const surfaceNoise = measureNoiseFloor(
    () => {
      for (const mode of modes) draw(base + heaviest.at, mode);
    },
    () => pixels(surface),
    PROBE_W * PROBE_DPR,
  );
  console.log(`noise floor: ${noise.channels} channels, max delta ${noise.maxDelta}, `
    + `under ${noise.ballastMB} MB of ballast `
    + `(surface arm: ${surfaceNoise.channels} at ${surfaceNoise.maxDelta})`);

  const rows: unknown[] = [];
  let impure = 0;
  let inconclusive = 0;
  let withinNoise = 0;
  let surfaceImpure = 0;

  for (const mode of modes) {
    for (const beat of beats) {
      // Hand the main thread back between beats. Five thousand renders onto a
      // software-rasterised surface is minutes of work, and a page that cannot
      // repaint or answer a console question for that long looks hung rather
      // than busy.
      await new Promise((r) => setTimeout(r, 0));
      const t = base + beat.at;

      /**
       * One arm, four histories, and its own control.
       *
       * THE CONTROL is `direct` again, with nothing whatever changed between
       * the two. It must be byte-identical, and if it is not then the
       * measurement has moved and nothing else in that arm can be believed. An
       * instrument that cannot tell "the piece is impure" from "the instrument
       * drifted" is not evidence, and this is the difference between the two.
       */
      const arm = (cap: (t: number, m: ModeId, h: History) => Uint8ClampedArray, floor = noise) => {
        const shots: Partial<Record<History, Uint8ClampedArray>> = {};
        const hashes: Partial<Record<History, string>> = {};
        for (const h of HISTORIES) {
          shots[h] = cap(t, mode, h);
          hashes[h] = hashPixels(shots[h]!);
        }
        const control = cap(t, mode, "direct");
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
          if (aboveNoise(diffs[h]!, floor)) real = true;
        }
        return {
          hashes,
          controlStable: stable,
          identical,
          real,
          ...(stable ? {} : { control: diffPixels(ref, control, PROBE_W * PROBE_DPR) }),
          ...(identical ? {} : { diffs }),
        };
      };

      const renderer = arm(captureRenderer, noise);
      const { identical: _si, real: _sr, ...surfaceArm } = arm(captureSurface, surfaceNoise);
      const surfaceReal = _sr;

      // Three-valued on purpose. `within-noise` is not a pass and not a
      // failure: it is the instrument saying the difference is smaller than
      // its own hands shake, and the numbers are reported either way.
      const { controlStable: stable, identical, real } = renderer;
      if (!stable) inconclusive++;
      else if (real) impure++;
      else if (!identical) withinNoise++;
      const verdict = !stable ? "INCONCLUSIVE"
        : real ? "IMPURE" : identical ? "pure" : "within-noise";
      const surfaceVerdict = !surfaceArm.controlStable ? "INCONCLUSIVE"
        : surfaceReal ? "IMPURE" : _si ? "pure" : "within-noise";
      console.log(`purity ${mode}/${beat.id}: ${verdict} (surface arm ${surfaceVerdict})`);
      rows.push({
        mode,
        beat: beat.id,
        t: Number(t.toFixed(4)),
        verdict,
        controlStable: stable,
        hashes: renderer.hashes,
        ...(renderer.control ? { control: renderer.control } : {}),
        ...(renderer.diffs ? { diffs: renderer.diffs } : {}),
        // Reported, never verdict-bearing: this arm cannot tell the piece's
        // memory from the destination canvas's. It is here because it is what
        // the committed sweeps of sessions 2 to 4 measured.
        surfaceArm: { verdict: surfaceVerdict, ...surfaceArm },
      });
      if (surfaceVerdict === "IMPURE") surfaceImpure++;
    }
  }

  const byMode = Object.fromEntries(
    modes.map((m) => {
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
    noiseFloorBeat: heaviest.id,
    totalBeats: rows.length,
    /** What the verdict rests on, said in the report rather than only in the
     *  source, because a reader meets the numbers before they meet the code. */
    arms: {
      verdictArm: "renderer",
      renderer: "the history warms the renderer's caches on a scratch surface; "
        + "the frame under test is drawn on a virgin one, so the destination is "
        + "in the same condition in every history and a difference is the piece's",
      surface: "history and frame share one destination, as this probe did "
        + "through session 4 - reported for continuity with those sweeps, and "
        + "not verdict-bearing, because a canvas does not rasterise its second "
        + "pass the way it rasterised its first",
    },
    surfaceImpureBeats: surfaceImpure,
    surfaceNoiseFloor: surfaceNoise,
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
