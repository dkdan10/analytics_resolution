/** Harness A — is `render(mode, t)` really a pure function of one float?
 *
 * The piece's fifth rule says it is: scrubbing backwards REBUILDS, it never
 * remembers. Derived caches are allowed; accumulated state is not. That claim
 * had never been tested, and testing it on 2026-08-08 found it false for THE HAND,
 * which extends one module-level canvas in 64-stroke blocks: two frames of the
 * same instant, reached along different histories, do not match. Run this to
 * see by how much; the count belongs in the report, not in a comment that will
 * outlive it.
 *
 * So: for each hand, at each representative beat, the same `t` is reached five
 * ways and the resulting pixels are hashed.
 *
 *   continuous   a second of playback at 1/60, landing exactly on t
 *   forward      an earlier beat, then a jump to t
 *   backward     a later beat, then a jump to t
 *   returned     a moment later, then back to t
 *   direct       every cache emptied, one render at t
 *
 * `direct` is the reference: it is what a fresh page load at `?t=` produces.
 * Anything that disagrees with it is a frame that depends on how you got there.
 *
 * Exact bytes, not screenshots. `getImageData` has no capture noise, so a
 * difference reported here is a difference in what was drawn.
 *
 * TWO DESTINATIONS, AND ONLY ONE OF THEM CARRIES THE VERDICT.
 *
 * Every history above differs in a second way nobody had separated out: how
 * many render passes the DESTINATION canvas has received before the readback.
 * `direct` draws once into it, `forward` twice, `continuous` sixty-one times.
 * Chrome does not rasterise pass two of a canvas identically to pass one, so
 * that difference alone moves pixels — and it is not the piece.
 *
 * It was measured rather than argued. At the beat where earlier versions of
 * this probe called THE PLATE impure, the drawing commands the renderer issues
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
 * — but nothing enforces it either), and every sweep taken before the renderer
 * arm existed is a surface-arm number, so dropping it would strand the evidence
 * those sweeps left.
 *
 * A capture method that reported everything identical whatever happened would
 * be worse than the confound it replaced. This one was checked against a staged
 * impurity before it was believed.
 *
 * THE HAND IS THE CASE THIS WAS BUILT FOR. Its old module-level canvas, extended
 * in blocks as the playhead advanced, is the impurity described at the top of
 * this comment; the renderer-side fix lives in `prefix.ts`, not here. This
 * harness exists to measure it, not to hide it.
 *
 * WHAT IS AND IS NOT ESTABLISHED — read this before trusting a verdict.
 * THE HAND's impurity is measured, at the window beats, and reproduced on every
 * version of this harness. The other five hands are NOT yet proven clean: no
 * completed calibrated sweep of all six exists. The earliest evidence was an
 * uncalibrated run in which all six read impure INCLUDING the prelude, where
 * `renderTo` returns before any hand is called and the frame is therefore
 * mode-independent — which is what exposed the instrument rather than the
 * piece — plus a software-rasterised partial run in which THE PLATE came back
 * clean. An earlier version of this comment said the extraction "was shown to
 * have moved nothing: the five pure hands come back byte-identical". That was
 * asserting an unproven result inside the source of the instrument that would
 * prove it, which is exactly the honesty defect this project checks itself for.
 *
 * So: run a full sweep before changing a renderer, and read the noise floor
 * before reading a verdict.
 *
 * WHERE THE BEATS COME FROM. A default sweep asks at `beatsOf`'s representative
 * instants, and those are settled frames: none falls where a stroke is being
 * laid, a game surface is taking on a prefix step, or one phase is handing
 * over to the next. `&range=<ids>` samples the named passages of `rangesOf`
 * instead, each on the hand that draws it, and `&t=<s,...>` asks at instants
 * given outright. Both judge every row against a floor measured inside the
 * passage that row belongs to, because the floor is a property of the frame.
 */

import { renderTo, type Target } from "../render";
import { displayFromQuery } from "../display";
import { fieldWork } from "../field";
import type { ModeId } from "../modes";
import {
  completedStackState, OPERATIONS, opsToken, toggle, type StackOps,
} from "../modes/operations";
import { semanticStopById, semanticTime } from "../semantic";
import { layerBuildRows } from "./layers";
import type { PixelDiff } from "./shared";
import {
  cold,
  beatsOf,
  configsOf,
  DEFAULT_RANGE_SAMPLES,
  diffPixels,
  emit,
  forceResidency,
  hashPixels,
  makeTarget,
  MODES,
  narrow,
  pixelsOf,
  rangesOf,
  samplesOf,
  viewSharing,
  warmUp,
  aboveNoise,
  measureNoiseFloor,
  PROBE_DPR,
  PROBE_H,
  PROBE_W,
  type Beat,
  type Env,
  type NoiseFloor,
  type Range,
} from "./shared";

const HISTORIES = ["direct", "forward", "backward", "continuous", "returned"] as const;
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
/**
 * How far ahead `returned` goes before it comes back.
 *
 * The far seek lands where whatever was moving at `t` has long since been
 * finished, baked or taken off its layer, so a mark that remembered how far it
 * had come is never asked again and the far histories cannot see it. This one
 * stays close enough that a stroke in progress at `t` is still in progress, and
 * one that is drying is still drying: the frame that follows is drawn through
 * the same code, and the frame under test must not show it was there.
 */
const RETURN_S = 0.2;

export async function purityProbe(env: Env, q: URLSearchParams): Promise<unknown> {
  const { data, schedule, inscriptions } = env;
  const residency = await forceResidency(data, (s) => console.log(s));
  const playback = Number(q.get("playback")) || DEFAULT_PLAYBACK_S;

  /**
   * Two ways to hold the surface still, and they trade precision for hours.
   *
   * DEFAULT — the accelerated canvas the gallery actually runs on. It is not
   * bit-stable across memory pressure, so the run measures its own noise floor
   * (see below) and only calls a difference the piece's when it clears it. In
   * one measured run the floor was ~60,000 channels at a maximum delta of 8,
   * and THE HAND's old accumulating canvas measured thirty-five times that.
   *
   * `&exact=1` — software rasterisation, pinned. The floor drops to zero and a
   * single differing channel is real, but a 2560x1440 frame costs an order of
   * magnitude more to draw and the whole run takes hours rather than minutes.
   * Reach for it to characterise something the default has already found.
   */
  const exact = q.get("exact") === "1";
  /** The surface arm's destination: ONE canvas for the whole run, exactly as
   *  this probe has always had, so its numbers stay comparable with the sweeps
   *  taken before the renderer arm existed. */
  const surface = makeTarget(exact);
  // Narrowed the same way the perf probe is, and an unmatched name throws
  // rather than silently sweeping nothing. A full sweep is the default.
  let modes = narrow("hand", MODES, q.get("mode"), (m) => m);
  const semantic = semanticStopById(q.get("stop"));
  const semanticAt = semantic
    ? semanticTime(semantic, schedule, data.slateFile?.span.seconds)
    : null;
  const stopped = semantic !== null && semanticAt !== null;

  /**
   * What is swept: per hand, one or more groups of beats.
   *
   * A group is the unit a noise floor belongs to. The default sweep is one
   * group for the whole run with one floor, as it has always been. An instant
   * given by `&t=` is a group of its own, floored on itself. A range is a
   * group floored on its LAST sample: in the passages that accumulate, which
   * is most of them, the latest instant is the densest, and in every passage
   * it is a frame of that passage, which the default's floor beat is not.
   */
  interface Group {
    range: Range | null;
    beats: readonly Beat[];
    /** null: the run-wide floor of the default sweep. */
    floorBeat: Beat | null;
  }
  // A stop is one sweep, and an instant or a range is another. The stop used
  // to win without a word, so the instants asked for beside it were dropped
  // and the table that came back was filed as if it answered them.
  if (q.has("stop") && (q.has("t") || q.has("range"))) {
    throw new Error("stop is one sweep, and t or range is another: ask for one");
  }
  // `q.has` first, on the perf probe's precedent: an absent `t` parses to
  // zero, which is a real instant and a bare one.
  const timed = q.has("t");
  const ranged = q.has("range");
  if (timed && ranged) throw new Error("t and range are two sweeps: ask for one");
  if (q.has("samples") && !ranged) throw new Error("samples divides a range: name one with range");
  const sweep = stopped ? "stop" : timed ? "t" : ranged ? "range" : "beats";

  let beats: readonly Beat[] = [];
  let ranges: readonly Range[] = [];
  let samples: number | null = null;
  const groups = new Map<ModeId, Group[]>();
  if (timed) {
    const asked = (q.get("t") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    if (!asked.length) throw new Error("t names no instant");
    const instants = asked.map((x): Beat => {
      const at = Number(x);
      if (!Number.isFinite(at)) throw new Error(`t is not a number of seconds: ${x}`);
      // Seconds into the loop, as a beat's are. An instant outside it would be
      // drawn all the same, the pass offset added, as a frame of some other
      // pass under a name that says otherwise.
      if (at < 0 || at >= schedule.duration) {
        throw new Error(`t is not an instant of the loop, which is ${schedule.duration}s long: ${x}`);
      }
      return { id: `t=${at}`, at };
    });
    // Two spellings of one number are one instant, and two rows under one
    // name are one row to anything that keys on the name.
    const twice = instants.filter((b, i) => instants.findIndex((o) => o.id === b.id) !== i);
    if (twice.length) {
      throw new Error(`t names an instant more than once: ${twice.map((b) => b.id).join(", ")}`);
    }
    beats = narrow("beat", instants, q.get("beat"), (b) => b.id);
    for (const m of modes) {
      groups.set(m, beats.map((b) => ({ range: null, beats: [b], floorBeat: b })));
    }
  } else if (ranged) {
    ranges = narrow("range", rangesOf(schedule, data), q.get("range"), (r) => r.id);
    samples = q.has("samples") ? Number(q.get("samples")) : DEFAULT_RANGE_SAMPLES;
    if (!Number.isInteger(samples) || samples < 1) {
      throw new Error(`samples is not a count: ${q.get("samples")}`);
    }
    // A range belongs to one hand. A hand asked for that draws none of the
    // ranges, or a range whose hand was not asked for, would be rows silently
    // missing from a table somebody will read as complete.
    const drawn = new Set(ranges.map((r) => r.mode));
    if (q.has("mode")) {
      const strays = ranges.filter((r) => !modes.includes(r.mode));
      if (strays.length) {
        throw new Error(`not drawn by the hand(s) asked for: `
          + strays.map((r) => `${r.id} (${r.mode})`).join(", "));
      }
      const idle = modes.filter((m) => !drawn.has(m));
      if (idle.length) throw new Error(`no range asked for is drawn by: ${idle.join(", ")}`);
    } else {
      modes = modes.filter((m) => drawn.has(m));
    }
    const all: Beat[] = [];
    for (const r of ranges) {
      const whole = samplesOf(r, samples);
      all.push(...whole);
      const mine = groups.get(r.mode) ?? [];
      groups.set(r.mode, mine);
      mine.push({ range: r, beats: whole, floorBeat: whole[whole.length - 1]! });
    }
    // `&beat=` narrows the samples drawn, never the floor: one sample asked
    // for alone is still judged against its own range's last.
    beats = narrow("beat", all, q.get("beat"), (b) => b.id);
    for (const mine of groups.values()) {
      for (const g of mine) g.beats = g.beats.filter((b) => beats.includes(b));
    }
  } else {
    beats = narrow("beat", beatsOf(schedule), q.get("beat"), (b) => b.id);
    if (stopped) beats = [{ id: semantic.id, at: semanticAt }];
    for (const m of modes) groups.set(m, [{ range: null, beats, floorBeat: null }]);
  }
  const display = displayFromQuery(q, false);
  // Every beat is taken on the SECOND pass of the loop, so that continuous
  // playback into the prelude arrives out of the previous loop's coda exactly
  // as the gallery does, rather than out of nothing.
  const base = schedule.duration;

  // `ops` is threaded through EVERY draw here, defaulting to none, so the six
  // hands that ignore it are measured exactly as they were before THE STACK's
  // configuration axis existed, and their earlier sweeps stay comparable.
  const drawOn = (tg: Target, t: number, mode: ModeId, ops: StackOps = 0) =>
    renderTo(tg, t, data, schedule, inscriptions, mode,
      false, false, completedStackState(ops), null, display);
  const draw = (t: number, mode: ModeId, ops: StackOps = 0) => drawOn(surface, t, mode, ops);
  // Each target's own backing, and one width for every comparison: every
  // surface this probe makes is the default one, so they agree by construction.
  const pixels = pixelsOf;
  const width = surface.ctx.canvas.width;

  /** The frames a history draws BEFORE the one under test. */
  const replay = (tg: Target, t: number, mode: ModeId, history: History, ops: StackOps): void => {
    if (history === "forward") drawOn(tg, t - SEEK_S, mode, ops);
    if (history === "backward") drawOn(tg, t + SEEK_S, mode, ops);
    if (history === "returned") drawOn(tg, t + RETURN_S, mode, ops);
    if (history === "continuous") {
      for (let k = Math.round(playback / STEP); k >= 1; k--) drawOn(tg, t - k * STEP, mode, ops);
    }
  };

  /** THE VERDICT ARM. The history warms the renderer's caches on a surface
   *  nobody reads, and the frame under test is drawn on a virgin one. */
  const captureRenderer = (
    t: number, mode: ModeId, history: History, ops: StackOps,
  ): Uint8ClampedArray => {
    cold();
    if (history !== "direct") replay(makeTarget(exact), t, mode, history, ops);
    const tg = makeTarget(exact);
    drawOn(tg, t, mode, ops);
    return pixels(tg);
  };

  /** The old arm, unchanged: history and frame share one destination. */
  const captureSurface = (
    t: number, mode: ModeId, history: History, ops: StackOps,
  ): Uint8ClampedArray => {
    cold();
    replay(surface, t, mode, history, ops);
    draw(t, mode, ops);
    return pixels(surface);
  };

  /**
   * THE TOGGLE ROUND-TRIP — the one question no seek test can ask.
   *
   * The purity requirement has two halves. "Backward and forward scrubbing
   * are pixel-identical for the same configuration and `t`" is what the four
   * histories above test. "No toggle may retain visual state between frames"
   * is a different claim on a different axis, and nothing in this probe
   * could see it: every history varies `t` at a fixed configuration, and this
   * varies the CONFIGURATION at a fixed `t`.
   *
   * So: draw the frame, turn one operation on, turn it back off, draw it again.
   * The two must be the same bytes. Run once per operation, so a failure names
   * the operation that left something behind rather than the configuration that
   * happened to contain it.
   *
   * COMPARED BY HASH, NEVER THROUGH `aboveNoise`. That predicate carries a hard
   * thousand-channel, delta-two tolerance whatever floor the run measured — and
   * a slow accumulation across a toggle is exactly the shape of defect it would
   * swallow. This is the one place in the probe where a single differing channel
   * really is a finding, and it is true here because both frames are drawn at
   * the same `t` on virgin surfaces after the same number of passes: there is no
   * destination-canvas confound left to excuse a difference with.
   */
  const roundTrip = (t: number, mode: ModeId, ops: StackOps): {
    clean: boolean; failures: string[];
  } => {
    const failures: string[] = [];
    for (const op of OPERATIONS) {
      cold();
      const before = hashPixels(pixels(drawFresh(t, mode, ops)));
      // The excursion goes to a surface nobody reads, exactly as a history does:
      // what is under test is whether the RENDERER kept anything, not whether a
      // canvas rasterises its second pass like its first.
      const scratch = makeTarget(exact);
      drawOn(scratch, t, mode, toggle(ops, op.id));
      drawOn(scratch, t, mode, ops);
      const after = hashPixels(pixels(drawFresh(t, mode, ops)));
      if (before !== after) failures.push(op.id);
    }
    return { clean: failures.length === 0, failures };
  };

  const drawFresh = (t: number, mode: ModeId, ops: StackOps): Target => {
    const tg = makeTarget(exact);
    drawOn(tg, t, mode, ops);
    return tg;
  };

  // Settle every first-use cost before anything is captured. Without this the
  // browser's own warm-up reads as impurity in every hand that draws text.
  // The default sweep warms every hand at every beat, as it always has. A
  // range or an instant belongs to the hands that draw it, so only those are
  // warmed, each at its own beats.
  if (sweep === "beats" || sweep === "stop") warmUp(draw, beats, base);
  else {
    for (const m of modes) {
      warmUp(draw, (groups.get(m) ?? []).flatMap((g) => g.beats), base, [m]);
    }
  }

  // The environment's own variation, measured under the pressure this run
  // creates, before any of it is attributed to the piece.
  //
  // MEASURED ON THE HEAVIEST FRAME IN THE SWEEP, not the cheapest. It used to
  // render `beats[0]` — the prelude, where `renderTo` returns before any hand
  // is called and the plate is bare — and then apply that floor to frames
  // carrying tens of thousands of marks. That was first recorded as a known
  // limit of the instrument, and it turns out to matter: a bare frame's floor
  // came back at zero channels while a window beat's is
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
  // THE STACK's densest configuration, not its default, is what the floor has to
  // be characterised on: its default is bare stone and therefore the cheapest
  // frame in the piece, so a floor taken there would be measured on an empty
  // plate and applied to a full one — the same mistake as taking the floor on
  // the prelude, corrected above.
  const heaviestOps = (m: ModeId): StackOps => {
    const cs = configsOf(m);
    return cs[cs.length - 1]!.ops;
  };
  let floorTarget: Target = surface;
  /** Both arms' floors on the given frames, each measured the way its arm
   *  captures. */
  const floorsOn = (frames: readonly { mode: ModeId; at: number }[]) => ({
    renderer: measureNoiseFloor(
      () => {
        floorTarget = makeTarget(exact);
        for (const f of frames) drawOn(floorTarget, base + f.at, f.mode, heaviestOps(f.mode));
      },
      () => pixels(floorTarget),
      width,
    ),
    surface: measureNoiseFloor(
      () => {
        for (const f of frames) draw(base + f.at, f.mode, heaviestOps(f.mode));
      },
      () => pixels(surface),
      width,
    ),
  });
  /**
   * THE DEFAULT SWEEP'S FLOOR IS RUN-WIDE; A RANGE'S OR AN INSTANT'S IS ITS OWN.
   *
   * `heaviest` falls back to the first beat when no window beat is in the
   * sweep. For the default sweep that is a narrowed run somebody chose. For a
   * range or an instant it would be whichever sample happened to come first —
   * a floor taken on one passage and applied to another, which is the mistake
   * recorded above, made again with a different light frame. So those sweeps
   * measure no run-wide floor at all: each group is floored on its own beat,
   * just before its rows are taken, and every row says which beat that was so
   * a driver can refuse one judged from outside its own range.
   */
  const perGroup = sweep === "t" || sweep === "range";
  const runWide = perGroup
    ? null
    : floorsOn(modes.map((mode) => ({ mode, at: heaviest.at })));
  const groupFloors: {
    mode: ModeId; range: string | null; beat: string;
    renderer: NoiseFloor; surface: NoiseFloor;
  }[] = [];
  const say = (where: string, f: { renderer: NoiseFloor; surface: NoiseFloor }): void => {
    console.log(`noise floor${where}: ${f.renderer.channels} channels, `
      + `max delta ${f.renderer.maxDelta}, under ${f.renderer.ballastMB} MB of ballast `
      + `(surface arm: ${f.surface.channels} at ${f.surface.maxDelta})`);
  };
  if (runWide) say("", runWide);

  const rows: unknown[] = [];
  let impure = 0;
  let inconclusive = 0;
  let withinNoise = 0;
  let surfaceImpure = 0;

  const roundTrips: unknown[] = [];
  let roundTripFailures = 0;

  for (const mode of modes) {
   const configs = narrow("configuration", configsOf(mode), q.get("ops"), (c) => c.id);
   // Floored once per hand and group, not once per configuration: the floor
   // is taken at the densest configuration whichever one a row is drawn at.
   const floored = (groups.get(mode) ?? []).filter((g) => g.beats.length).map((g) => {
     if (!g.floorBeat) return { ...g, floors: runWide! };
     const floors = floorsOn([{ mode, at: g.floorBeat.at }]);
     say(` ${mode}/${g.range?.id ?? g.floorBeat.id} on ${g.floorBeat.id}`, floors);
     groupFloors.push({
       mode, range: g.range?.id ?? null, beat: g.floorBeat.id, ...floors,
     });
     return { ...g, floors };
   });
   // The round-trip's frame: the run's heaviest beat, or this hand's own
   // last floor beat when the sweep has no run-wide one.
   const densest = perGroup
     ? floored[floored.length - 1]?.floorBeat ?? heaviest
     : heaviest;
   for (const cfg of configs) {
    for (const group of floored) {
    const noise = group.floors.renderer;
    const surfaceNoise = group.floors.surface;
    for (const beat of group.beats) {
      // Hand the main thread back between beats. Five thousand renders onto a
      // software-rasterised surface is minutes of work, and a page that cannot
      // repaint or answer a console question for that long looks hung rather
      // than busy.
      await new Promise((r) => setTimeout(r, 0));
      const t = base + beat.at;

      /**
       * One arm, every history, and its own control.
       *
       * THE CONTROL is `direct` again, with nothing whatever changed between
       * the two. It must be byte-identical, and if it is not then the
       * measurement has moved and nothing else in that arm can be believed. An
       * instrument that cannot tell "the piece is impure" from "the instrument
       * drifted" is not evidence, and this is the difference between the two.
       *
       * `counted` also records what the field counted in each history: every
       * capture opens by emptying the caches, which returns the counters to
       * zero, so what stands after one is that history's work and no other's.
       * It says which path built the layers a frame composited, a bake on the
       * miss or a build ahead of it, and is no part of any verdict.
       */
      const arm = (
        cap: (t: number, m: ModeId, h: History, o: StackOps) => Uint8ClampedArray,
        floor = noise,
        counted = false,
      ) => {
        const shots: Partial<Record<History, Uint8ClampedArray>> = {};
        const hashes: Partial<Record<History, string>> = {};
        const work: Partial<Record<History, Record<string, number>>> = {};
        for (const h of HISTORIES) {
          shots[h] = cap(t, mode, h, cfg.ops);
          hashes[h] = hashPixels(shots[h]!);
          if (counted) {
            work[h] = Object.fromEntries(Object.entries(fieldWork).filter(([, n]) => n !== 0));
          }
        }
        const control = cap(t, mode, "direct", cfg.ops);
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
          diffs[h] = diffPixels(ref, shots[h]!, width);
          if (aboveNoise(diffs[h]!, floor)) real = true;
        }
        return {
          hashes,
          ...(counted ? { work } : {}),
          controlStable: stable,
          identical,
          real,
          ...(stable ? {} : { control: diffPixels(ref, control, width) }),
          ...(identical ? {} : { diffs }),
        };
      };

      const renderer = arm(captureRenderer, noise, true);
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
      const where = mode === "stack" ? `${mode}[${cfg.id}]` : mode;
      console.log(`purity ${where}/${beat.id}: ${verdict} (surface arm ${surfaceVerdict})`);
      rows.push({
        mode,
        // Which operations were applied. `-` for the six hands that ignore the
        // configuration entirely, so their rows read exactly as they always have.
        config: cfg.id,
        ops: mode === "stack" ? opsToken(cfg.ops) : "-",
        beat: beat.id,
        t: Number(t.toFixed(4)),
        // Only where the floor is the group's own. The default sweep's rows
        // read exactly as they always have, and its one floor is in the
        // report's head.
        ...(group.floorBeat ? {
          range: group.range?.id ?? null,
          noiseFloorBeat: group.floorBeat.id,
          noiseFloorT: Number((base + group.floorBeat.at).toFixed(4)),
          noiseFloor: noise,
        } : {}),
        verdict,
        controlStable: stable,
        hashes: renderer.hashes,
        // What the field counted in each history, for a reader asking which
        // path built what this row composited.
        work: renderer.work,
        ...(renderer.control ? { control: renderer.control } : {}),
        ...(renderer.diffs ? { diffs: renderer.diffs } : {}),
        // Reported, never verdict-bearing: this arm cannot tell the piece's
        // memory from the destination canvas's. It is here because it is what
        // every sweep taken before the renderer arm measured.
        surfaceArm: { verdict: surfaceVerdict, ...surfaceArm },
      });
      if (surfaceVerdict === "IMPURE") surfaceImpure++;
    }
    }
    // Once per (mode, configuration), on the heaviest beat rather than on every
    // beat in the sweep: the round-trip asks whether the renderer keeps anything
    // across a configuration change, and the frame that has the most for it to
    // keep is the one worth asking on. One excursion per operation per config is
    // already the expensive part of a stack sweep.
    if (mode === "stack") {
      const rt = roundTrip(base + densest.at, mode, cfg.ops);
      if (!rt.clean) roundTripFailures++;
      console.log(`round-trip ${mode}[${cfg.id}]: ${rt.clean ? "clean" : `LEFT STATE: ${rt.failures.join(", ")}`}`);
      roundTrips.push({
        mode, config: cfg.id, ops: opsToken(cfg.ops), beat: densest.id, ...rt,
      });
    }
   }
  }

  // After the sweep's rows, so what these leave for the collector cannot sit
  // under a row's noise floor. Taken in every capture, narrowed or not.
  const layerBuild = await layerBuildRows(data);

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
    // A round-trip failure is an IMPURE verdict for the whole run: it is the
    // fifth rule failing on the configuration axis rather than the time axis,
    // and burying it in a sub-object nobody reads is how `withinNoiseBeats`
    // came to be invisible for a day. A layer built in slices is compared by
    // hash and owes nothing to the noise floor, so a difference there is not
    // excused by a row whose control moved.
    verdict: layerBuild.failures > 0 ? "IMPURE"
      : inconclusive || layerBuild.unsettled > 0 || layerBuild.controlFailures > 0
        ? "INCONCLUSIVE"
        : impure === 0 && roundTripFailures === 0 ? "PURE" : "IMPURE",
    surface: { width: PROBE_W, height: PROBE_H, dpr: PROBE_DPR },
    // Whether every target drew through one View, as the gallery does, or
    // through a new one each — the demonstration arm, and not the gallery.
    view: viewSharing(),
    sweep,
    // What the row times are offset by, so a range's own bounds can be laid
    // against them.
    passOffset: base,
    ...(ranged ? { samples, ranges } : {}),
    display,
    histories: HISTORIES,
    reference: "direct",
    playbackSeconds: playback,
    seekSeconds: SEEK_S,
    returnSeconds: RETURN_S,
    beats: beats.map((b) => b.id),
    residency,
    impureBeats: impure,
    withinNoiseBeats: withinNoise,
    inconclusiveBeats: inconclusive,
    // Per group there is no one floor, so the head carries the worst of them
    // and the rows carry their own.
    noiseFloor: runWide ? runWide.renderer : worst(groupFloors.map((g) => g.renderer)),
    noiseFloorBeat: runWide ? heaviest.id : "per row",
    ...(runWide ? {} : { noiseFloors: groupFloors }),
    totalBeats: rows.length,
    /** What the verdict rests on, said in the report rather than only in the
     *  source, because a reader meets the numbers before they meet the code. */
    arms: {
      verdictArm: "renderer",
      renderer: "the history warms the renderer's caches on a scratch surface; "
        + "the frame under test is drawn on a virgin one, so the destination is "
        + "in the same condition in every history and a difference is the piece's",
      surface: "history and frame share one destination, as this probe's earlier "
        + "sweeps did - reported for continuity with those sweeps, and "
        + "not verdict-bearing, because a canvas does not rasterise its second "
        + "pass the way it rasterised its first",
    },
    surfaceImpureBeats: surfaceImpure,
    /** The configuration axis: turning an operation on and off again must
     *  return the exact bytes it started from. Hash equality, never the noise
     *  predicate — see `roundTrip` for why that distinction is the test. */
    roundTrip: {
      what: "at a held t: draw, toggle one operation on, toggle it off, draw "
        + "again. The two frames must hash identically. Compared by hash and "
        + "NOT through aboveNoise, whose 1000-channel tolerance is the exact "
        + "size of the accumulation this exists to catch",
      configurations: roundTrips.length,
      failures: roundTripFailures,
      rows: roundTrips,
    },
    /** A layer built a slice at a time against the same layer baked whole.
     *  Hash equality, with a control that must differ. */
    layerBuild,
    surfaceNoiseFloor: runWide
      ? runWide.surface
      : worst(groupFloors.map((g) => g.surface)),
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

/** The largest of several floors on each axis, for a report's head. */
function worst(floors: readonly NoiseFloor[]): NoiseFloor | null {
  if (!floors.length) return null;
  return {
    channels: Math.max(...floors.map((f) => f.channels)),
    maxDelta: Math.max(...floors.map((f) => f.maxDelta)),
    ballastMB: floors[0]!.ballastMB,
  };
}

export function emitPurity(report: unknown): void {
  emit("probe-purity", report);
}
