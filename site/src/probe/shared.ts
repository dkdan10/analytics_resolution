/** What both probes need: a surface, the beats, and residency.
 *
 * Nothing in here is reachable from the exhibit path. `main.ts` imports the
 * probe module dynamically and only when `?probe=` is present, so the gallery
 * build never fetches this chunk, and a probe run returns instead of starting
 * the rAF loop — the piece being measured must not also be animating.
 */

import type { Loaded } from "../data";
import type { Inscription } from "../inscription";
import { MODE_IDS, type ModeId } from "../modes";
import { ALL_OPS, bitOf, NO_OPS, OPERATIONS, type StackOps } from "../modes/operations";
import { clearLayers } from "../field";
import { clearStamps } from "../marks";
import { clearCensusCaches } from "../modes/census";
import { ACT_CUE_SECONDS } from "../modes/shared";
import { clearCanvas } from "../modes/hand";
import { clearLedgerCaches } from "../modes/ledger";
import { makeView } from "../plate";
import type { Target } from "../render";
import { clearAtlas } from "../textatlas";
import { clearWashes } from "../wash";
import {
  ACT0_SECONDS,
  CODA_SECONDS,
  WINDOW_BEATS,
  WINDOW_YEAR,
  CUT_YEAR,
  type Schedule,
} from "../timeline";

export interface Env {
  data: Loaded;
  schedule: Schedule;
  inscriptions: Inscription[];
}

/** A fixed surface, so a comparison is not at the mercy of the viewport. */
export const PROBE_W = 1280;
export const PROBE_H = 720;
export const PROBE_DPR = 2;

/** One rendered frame at 60 Hz, in milliseconds. The budget a hand has. */
export const FRAME_BUDGET_MS = 1000 / 60;

/**
 * A surface to draw the piece on.
 *
 * `readback` pins the rasterisation backend, and the purity probe needs it.
 * Measured 2026-08-08: the SAME frame, rendered twice from cold
 * with nothing whatever changed between them, comes back byte-identical — and
 * then differs in 60,253 RGB channels with a maximum delta of 8 once ~320 MB of
 * ballast is allocated in between. That is the browser moving an accelerated
 * canvas onto a software rasteriser under memory pressure, and a probe that
 * holds four 14 MB pixel buffers and fifty megabytes of resident record is
 * exactly the thing that provokes it. It reads as impurity in every hand and it
 * is nothing of the sort.
 *
 * WHAT THIS FUNCTION ACTUALLY DOES, since two places in the repo said otherwise
 * and the code is the truth: `readback` DEFAULTS TO FALSE, so both probes run
 * on the accelerated surface the gallery uses unless the purity probe is asked
 * for `&exact=1`. The purity run therefore reads every verdict against its own
 * MEASURED noise floor rather than assuming a stable rasteriser; `&exact=1`
 * pins the software path, drops the floor to zero, and takes hours.
 *
 * The performance probe must never pin it: it is measuring the pipeline the
 * gallery actually runs on, and it compares no pixels.
 */
export function makeTarget(readback = false): Target {
  const el = document.createElement("canvas");
  el.width = PROBE_W * PROBE_DPR;
  el.height = PROBE_H * PROBE_DPR;
  const ctx = el.getContext("2d", { alpha: false, willReadFrequently: readback })!;
  ctx.setTransform(PROBE_DPR, 0, 0, PROBE_DPR, 0, 0);
  return { ctx, view: makeView(PROBE_W, PROBE_H), dpr: PROBE_DPR };
}

/**
 * Empty every cache the renderer keeps between frames.
 *
 * This is what a fresh page load looks like. The caches are all keyed by the
 * inputs they depend on, so clearing them must make no difference to any pixel
 * — which is exactly the claim the purity probe is here to test, and it can
 * only be tested from cold.
 */
export function cold(): void {
  clearCanvas();
  clearAtlas();
  clearLayers();
  clearStamps();
  // THE LEDGER's per-year utterance list and its string ruler. Registering a new
  // cache here is not optional and the failure mode is the dangerous direction:
  // an unregistered cache does not produce a false IMPURE, it produces a false
  // PURE, because every history then shares the same stale cache and they agree
  // with each other.
  clearLedgerCaches();
  // THE CENSUS's string ruler: a word's width in COURT TENTHS, measured once
  // per string at a fixed nominal size. Same trap as the line above.
  clearCensusCaches();
  // THE WASH's lanes: the fold's accumulator and its front/delta
  // surfaces. Same trap again — an unregistered lane is a false PURE.
  clearWashes();
}

export interface Beat {
  id: string;
  /** Seconds into the loop, before the pass offset is added. */
  at: number;
}

/**
 * The moments worth asking about, derived from the schedule rather than typed.
 *
 * The prelude, an ordinary season, both sides of the piece's one cut, each of
 * the window's four beats, the last season, the coda, and the final frame
 * before the loop turns over.
 */
export function beatsOf(schedule: Schedule): Beat[] {
  const first = schedule.segments[0]!;
  const last = schedule.segments[schedule.segments.length - 1]!;
  const cut = schedule.byYear.get(CUT_YEAR);
  const win = schedule.byYear.get(WINDOW_YEAR);
  const ordinary = schedule.segments[Math.floor(schedule.segments.length / 4)]!;
  const frame = 1 / 60;

  const out: Beat[] = [
    { id: "prelude", at: ACT0_SECONDS * 0.5 },
    { id: "first-season", at: first.start + first.duration * 0.5 },
    { id: "ordinary-season", at: ordinary.start + ordinary.duration * 0.5 },
  ];
  if (cut) {
    out.push({ id: "before-the-cut", at: cut.start - frame });
    out.push({ id: "after-the-cut", at: cut.start + frame });
  }
  // The named act boundaries: mid-cue frames, derived from the schedule like
  // every other beat, on the cut pair's precedent. One definition with the
  // cue's own pacing (modes/shared.ts), so the probe cannot drift off it.
  const actTwo = schedule.segments.find((s) => s.act === 2);
  if (actTwo) out.push({ id: "act-two-boundary", at: actTwo.start + ACT_CUE_SECONDS / 2 });
  if (win) {
    for (const b of WINDOW_BEATS) {
      out.push({ id: `window-${b.id}`, at: win.start + win.duration * (b.from + b.to) * 0.5 });
    }
  }
  const actFive = schedule.segments.find((s) => s.act === 5);
  if (actFive) out.push({ id: "act-five-boundary", at: actFive.start + ACT_CUE_SECONDS / 2 });
  out.push({ id: "final-season", at: last.start + last.duration * 0.5 });
  out.push({ id: "coda", at: schedule.lastEnds + CODA_SECONDS * 0.5 });
  out.push({ id: "last-frame", at: schedule.duration - frame });
  return out;
}

export const MODES: readonly ModeId[] = MODE_IDS;

/**
 * THE STACK's third axis: which operations are applied.
 *
 * The other six hands are a pure function of `(mode, t)` and this probe sweeps
 * exactly that. THE STACK takes a configuration as well, so a sweep that only
 * ever renders it with nothing switched on has tested the one frame that is
 * guaranteed to be cheap and empty — a control, and a necessary one, but not
 * coverage.
 *
 * The shape is the minimum that counts as coverage: nothing on, each operation
 * ALONE (so a row that moves names the operation that moved it), and everything
 * at once — which is also the densest frame the view can produce, and therefore
 * the one the noise floor and the frame budget both have to be judged on. Every
 * configuration is a real address, `?ops=lci`, so a row in the verdict can be
 * reopened in a browser exactly as it was measured.
 */
export interface Config {
  id: string;
  ops: StackOps;
}

export function configsOf(mode: ModeId): Config[] {
  if (mode !== "stack") return [{ id: "-", ops: NO_OPS }];
  return [
    { id: "none", ops: NO_OPS },
    ...OPERATIONS.map((o) => ({ id: o.id, ops: bitOf(o.id) })),
    { id: "all", ops: ALL_OPS },
  ];
}

/**
 * Narrow a sweep, and refuse a filter that matches nothing.
 *
 * The purity probe had no narrowing at all: every run was the whole sweep of
 * every hand at every beat along every history, all or nothing, which is why
 * iterating on one hand meant paying for all of them. The perf probe had `&mode=` but a typo in
 * it yielded `rows: []` and no error, so a driver read an empty table as a
 * clean one. Both are one function now, and an unmatched name is a THROW - the
 * probe's error path exists precisely so a driver can tell that apart from a
 * slow run.
 */
export function narrow<T>(
  what: string,
  all: readonly T[],
  wanted: string | null,
  nameOf: (t: T) => string,
): readonly T[] {
  if (wanted === null) return all;
  const names = wanted.split(",").map((s) => s.trim()).filter(Boolean);
  const missing = names.filter((n) => !all.some((t) => nameOf(t) === n));
  if (missing.length) {
    throw new Error(
      `no such ${what}: ${missing.join(", ")} (have ${all.map(nameOf).join(", ")})`,
    );
  }
  return all.filter((t) => names.includes(nameOf(t)));
}

/**
 * Wait until every lazily-fetched asset is in memory.
 *
 * `points()`, `measures()` and `strokes()` return null and start a fetch, so a
 * frame drawn before they land is a different frame. Everything is forced, once,
 * before anything is captured or timed — and nothing evicts, so every capture
 * afterwards sees the same resident set.
 */
export async function forceResidency(
  data: Loaded,
  log: (s: string) => void,
  timeoutMs = 60_000,
): Promise<{
  resident: string[];
  missing: string[];
  errors: string[];
  fonts: FontFaceSetLoadStatus;
}> {
  const wanted: [string, () => unknown][] = [
    ...data.seasons.map((s) => [`points/${s.year}`, () => data.points(s.year)] as [string, () => unknown]),
    // The calendar: every season that declares one - today the window season
    // alone - same rule as the slate below, same commit as its loader.
    ...data.seasons.filter((s) => s.points_by_day).map(
      (s) => [`points_by_day/${s.year}`, () => data.pointsByDay(s.year)] as [string, () => unknown]),
    ["measures", () => data.measures()],
    ["strokes", () => data.strokes()],
    // The quarrel is lazy like the calipers, and a capture taken while its
    // fetch is pending would compare an empty flood against a full one and
    // call the difference impurity. Resident before any hash, like the rest.
    ["quarrel", () => data.quarrel()],
    // The slate too, for exactly the quarrel's reason. The rule: a
    // lazily-fetched binary joins this list in the same commit as its
    // loader, or the probe hashes an empty night against a full one.
    ["slate", () => data.slate()],
    // The four scales: the game and the wash, same rule, same commit as their
    // loaders.
    ["game", () => data.game()],
    ["wash", () => data.wash()],
  ];
  const resident: string[] = [];
  const missing: string[] = [];
  const t0 = performance.now();
  for (const [name, get] of wanted) {
    for (;;) {
      if (get()) {
        resident.push(name);
        break;
      }
      // A failed fetch now LATCHES rather than being retried from the loop, so
      // waiting out the timeout on one would be waiting for something that is
      // never coming. Give up on it at once and say why.
      if (data.assetErrors().length || performance.now() - t0 > timeoutMs) {
        missing.push(name);
        break;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  const errors = data.assetErrors();
  // Fonts are an asset too, and the least obvious one.
  //
  // Text is drawn through `textatlas`, which rasterises each string once. The
  // FIRST rasterisation in a page can land before the font stack has resolved,
  // and every later one is shaped differently — so an unwarmed probe reports
  // every text-drawing hand as impure, at about a hundred thousand channels
  // with a maximum delta of 8. That is the browser warming up, not the piece
  // remembering anything, and this harness exists to tell those apart.
  await document.fonts.ready;
  log(`resident: ${resident.length} assets, missing: ${missing.length}, `
    + `errors: ${errors.length}, fonts: ${document.fonts.status}`);
  return { resident, missing, errors, fonts: document.fonts.status };
}

/**
 * Draw every hand at every beat once and throw the frames away.
 *
 * Anything a renderer does lazily on first use — shaping a glyph, uploading a
 * texture, resolving a font — happens here, before anything is captured or
 * timed. What is being measured is the renderer's behaviour in the steady
 * state, which is the only state a gallery loop is ever in.
 */
export function warmUp(
  draw: (t: number, mode: ModeId) => void,
  beats: readonly Beat[],
  base: number,
  modes: readonly ModeId[] = MODES,
): void {
  // NOT cold() between these. The point is to make every lazy first-use cost
  // happen once, and clearing the caches before each render instead forces a
  // full season rebake seventy-two times over - which is half a second each and
  // was most of the runtime of both probes. Cold starts belong in the captures,
  // where they mean something.
  for (const mode of modes) {
    for (const beat of beats) draw(base + beat.at, mode);
  }
  cold();
}

/** FNV-1a over the whole pixel buffer, plus a second accumulator on a different
 *  prime so an accidental 32-bit collision cannot read as "identical". */
export function hashPixels(d: Uint8ClampedArray): string {
  let a = 0x811c9dc5;
  let b = 0x2166136f;
  for (let i = 0; i < d.length; i++) {
    a = Math.imul(a ^ d[i]!, 0x01000193);
    b = Math.imul(b + d[i]! + i, 0x85ebca6b) ^ (b >>> 13);
  }
  return `${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}`;
}

export interface PixelDiff {
  channels: number;
  totalChannels: number;
  share: number;
  maxDelta: number;
  meanDelta: number;
  firstPixel: { x: number; y: number } | null;
}

/** Reported in the terms every verdict uses: differing RGB channel bytes, their
 *  share, the largest delta and where the first one is. Alpha is skipped — the
 *  context is opaque, so it carries no information. */
export function diffPixels(a: Uint8ClampedArray, b: Uint8ClampedArray, width: number): PixelDiff {
  let channels = 0;
  let maxDelta = 0;
  let sum = 0;
  let first: { x: number; y: number } | null = null;
  let total = 0;
  for (let i = 0; i < a.length; i++) {
    if (i % 4 === 3) continue;
    total++;
    const d = Math.abs(a[i]! - b[i]!);
    if (d === 0) continue;
    channels++;
    sum += d;
    if (d > maxDelta) maxDelta = d;
    if (!first) {
      const px = Math.floor(i / 4);
      first = { x: px % width, y: Math.floor(px / width) };
    }
  }
  return {
    channels,
    totalChannels: total,
    share: total ? channels / total : 0,
    maxDelta,
    meanDelta: channels ? sum / channels : 0,
    firstPixel: first,
  };
}

/**
 * What this browser does to an unchanged frame, before the piece is blamed for it.
 *
 * Canvas2D rasterisation is not stable across memory pressure. Measured on
 * 2026-08-08: one frame rendered twice from cold, with NOTHING changed
 * between the two renders, comes back byte-identical — and then differs in
 * 60,253 RGB channels with a maximum delta of 8 once a few hundred megabytes
 * are allocated in between. No renderer state is involved in that at all; it is
 * the browser moving the canvas onto a different backend. A probe that holds
 * four fourteen-megabyte pixel buffers and fifty megabytes of resident record
 * is exactly the thing that provokes it, and unmeasured it reads as impurity in
 * every hand that allocates.
 *
 * So the floor is measured rather than assumed, under the same pressure the run
 * itself creates, and reported alongside every verdict. A difference below it
 * is not evidence of anything; THE HAND's old accumulating canvas (the defect
 * `prefix.ts` removes) measured thirty-five times above it.
 */
export interface NoiseFloor {
  channels: number;
  maxDelta: number;
  ballastMB: number;
}

export function measureNoiseFloor(
  render: () => void,
  grab: () => Uint8ClampedArray,
  width: number,
): NoiseFloor {
  const ballastMB = 320;
  cold();
  render();
  const a = grab();
  const ballast: Float64Array[] = [];
  for (let i = 0; i < ballastMB / 8; i++) ballast.push(new Float64Array(1 << 20));
  // Touch it, or an untouched allocation may never be committed.
  for (const b of ballast) b[0] = 1;
  cold();
  render();
  const b2 = grab();
  const d = diffPixels(a, b2, width);
  ballast.length = 0;
  return { channels: d.channels, maxDelta: d.maxDelta, ballastMB };
}

/** How far above the measured floor a difference has to sit to be the piece's
 *  rather than the browser's. Four times, and never fewer than a thousand
 *  channels — THE HAND's old accumulating canvas cleared it by more than an
 *  order of magnitude. */
export const NOISE_MARGIN = 4;

/**
 * Above the floor on EITHER axis, because the two say different things.
 *
 * The floor has a size and a depth: how many channels the browser moves on its
 * own, and by how much. Judging on the count alone throws away the second, and
 * that is not a hypothetical — a run of this sweep measured a floor of a few
 * thousand channels at a maximum delta of TWO, while THE PLATE differed from
 * itself in a comparable number of channels at a maximum delta of THIRTY-EIGHT.
 * Those are not the same finding: one is the rasteriser rounding, the other is
 * a different picture in a small region. A count-only test called them equal.
 */
export function aboveNoise(diff: PixelDiff, floor: NoiseFloor): boolean {
  return diff.channels > Math.max(1000, floor.channels * NOISE_MARGIN)
    || diff.maxDelta > Math.max(2, floor.maxDelta * NOISE_MARGIN);
}

/** Publish the verdict where a driver or a person can read it. */
export function emit(id: string, report: unknown): void {
  const pre = document.createElement("pre");
  pre.id = id;
  pre.style.cssText =
    "position:fixed;inset:0;margin:0;padding:16px;overflow:auto;background:#0b0a09;" +
    "color:#e8e2d6;font:11px/1.5 ui-monospace,monospace;white-space:pre-wrap;z-index:9";
  pre.textContent = JSON.stringify(report, null, 2);
  document.body.replaceChildren(pre);
  document.body.classList.remove("exhibit");
  console.log(report);
  (window as unknown as Record<string, unknown>)[id] = report;
}
