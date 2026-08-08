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
import { clearLayers } from "../field";
import { clearStamps } from "../marks";
import { clearCanvas } from "../modes/hand";
import { makeView } from "../plate";
import type { Target } from "../render";
import { clearAtlas } from "../textatlas";
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
 * Measured 2026-08-08 on this machine: the SAME frame, rendered twice from cold
 * with nothing whatever changed between them, comes back byte-identical — and
 * then differs in 60,253 RGB channels with a maximum delta of 8 once ~320 MB of
 * ballast is allocated in between. That is the browser moving an accelerated
 * canvas onto a software rasteriser under memory pressure, and a probe that
 * holds four 14 MB pixel buffers and fifty megabytes of resident record is
 * exactly the thing that provokes it. It reads as impurity in every hand and it
 * is nothing of the sort.
 *
 * So a pixel comparison asks for the software path up front and never moves.
 * The performance probe must NOT: it is measuring the pipeline the gallery
 * actually runs on, and it compares no pixels.
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
  if (win) {
    for (const b of WINDOW_BEATS) {
      out.push({ id: `window-${b.id}`, at: win.start + win.duration * (b.from + b.to) * 0.5 });
    }
  }
  out.push({ id: "final-season", at: last.start + last.duration * 0.5 });
  out.push({ id: "coda", at: schedule.lastEnds + CODA_SECONDS * 0.5 });
  out.push({ id: "last-frame", at: schedule.duration - frame });
  return out;
}

export const MODES: readonly ModeId[] = MODE_IDS;

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
): Promise<{ resident: string[]; missing: string[]; fonts: FontFaceSetLoadStatus }> {
  const wanted: [string, () => unknown][] = [
    ...data.seasons.map((s) => [`points/${s.year}`, () => data.points(s.year)] as [string, () => unknown]),
    ["measures", () => data.measures()],
    ["strokes", () => data.strokes()],
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
      if (performance.now() - t0 > timeoutMs) {
        missing.push(name);
        break;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
  }
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
    + `fonts: ${document.fonts.status}`);
  return { resident, missing, fonts: document.fonts.status };
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
  beats: Beat[],
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

/** Reported in the audit's own terms: differing RGB channel bytes, their share,
 *  the largest delta and where the first one is. Alpha is skipped — the context
 *  is opaque, so it carries no information. */
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
 * Canvas2D rasterisation is not stable across memory pressure. Measured on this
 * machine 2026-08-08: one frame rendered twice from cold, with NOTHING changed
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
 * is not evidence of anything; F-04's is thirty-five times above it.
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
 *  channels — F-04 clears it by more than an order of magnitude. */
export const NOISE_MARGIN = 4;

export function aboveNoise(channels: number, floor: NoiseFloor): boolean {
  return channels > Math.max(1000, floor.channels * NOISE_MARGIN);
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
  // eslint-disable-next-line no-console
  console.log(report);
  (window as unknown as Record<string, unknown>)[id] = report;
}
