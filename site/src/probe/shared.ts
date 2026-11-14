/** What the probes need: a surface, the beats, the ranges, and residency.
 *
 * Nothing in here is reachable from the exhibit path. `main.ts` imports the
 * probe module dynamically and only when `?probe=` is present, so the gallery
 * build never fetches this chunk, and a probe run returns instead of starting
 * the rAF loop — the piece being measured must not also be animating.
 *
 * ONE VIEW PER SIZE, SHARED BY EVERY TARGET. The gallery builds its `View` when
 * the window is sized and then draws every frame through that one object, so
 * the stroke caches that key on a View's identity stay warm from frame to
 * frame. A probe that built a new View for each target met those caches empty
 * on the frame under test, every time, whatever history had been replayed
 * before it — so nothing a history left in them could ever reach a verdict,
 * and the moving passages, which are where those caches do their work, were
 * measured as a piece the gallery never runs. `viewOf` hands every target of
 * one size the same object. What stays virgin is the canvas, which is the
 * part the destination confound lives in.
 */

import type { Loaded } from "../data";
import { boundedCompositeDpr, boundedDpr } from "../display";
import type { Inscription } from "../inscription";
import { MODE_IDS, type ModeId } from "../modes";
import { ALL_OPS, bitOf, NO_OPS, OPERATIONS, type StackOps } from "../modes/operations";
import { clearLayers } from "../field";
import {
  GAME_PREFIX_STEPS,
  gameClock,
  gameTotalFrames,
  possessionFrames,
} from "../game";
import { clearStamps } from "../marks";
import { clearCensusCaches } from "../modes/census";
import { ACT_CUE_SECONDS } from "../modes/shared";
import { clearCanvas } from "../modes/hand";
import { clearLedgerCaches } from "../modes/ledger";
import { OVERVIEW_CHAPTER_SECONDS, OVERVIEW_CHAPTERS } from "../overview";
import { COURT, makeView, type View } from "../plate";
import type { Target } from "../render";
import { semanticStopById, semanticTime } from "../semantic";
import { clearAtlas } from "../textatlas";
import { clearWashes } from "../wash";
import {
  ACT0_SECONDS,
  ARRIVAL_TAIL,
  CODA_SECONDS,
  WINDOW_BEATS,
  WINDOW_YEAR,
  CUT_YEAR,
  type Schedule,
} from "../timeline";
import {
  handWindowPhases,
  PLATE_WINDOW_SPANS,
  WINDOW_ONE_LEAD_SECONDS,
  WINDOW_SEASON_CREST,
  type PhaseSpan,
} from "../window-score";
import { THRESHOLDS } from "./continuity-metrics";

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
  return makeTargetOf(PROBE_W, PROBE_H, PROBE_DPR, readback);
}

/**
 * The same surface at any size: a virgin canvas over the shared View.
 *
 * The backing is floored exactly as the gallery floors its own (`sizeTarget`
 * in main.ts), because a bounded device ratio is fractional and a probe that
 * rounded where the gallery floors would be measuring a canvas one device
 * pixel wider than the one a visitor sees.
 */
export function makeTargetOf(w: number, h: number, dpr: number, readback = false): Target {
  const el = document.createElement("canvas");
  el.width = Math.max(1, Math.floor(w * dpr));
  el.height = Math.max(1, Math.floor(h * dpr));
  const ctx = el.getContext("2d", { alpha: false, willReadFrequently: readback })!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, view: viewOf(w, h), dpr };
}

/**
 * The surfaces a passage can be watched on.
 *
 * `probe` is the fixed surface above, at a device ratio the gallery never
 * bounds: right for asking whether one frame is one frame, wrong for asking how
 * a passage looks, because the piece is judged on a laptop and a laptop's
 * window is past the backing budget - so the ratio it actually draws at is
 * fractional, and the strokes, the grain and every cached layer land on a
 * different pixel grid there. `laptop` and `overview` are that window, sized by
 * the same two functions `main.ts` sizes the full work and the guided entry
 * with, so what is measured is a canvas a visitor is shown.
 */
export type SurfaceName = "probe" | "laptop" | "overview";
export const SURFACE_NAMES: readonly SurfaceName[] = ["probe", "laptop", "overview"];

/**
 * The laptop window, as an instrument setting: css width and height and the
 * display's own device ratio. A setting, not a reading of any one display;
 * nothing downstream holds a copy, so replacing the triple replaces the
 * surface.
 */
export const LAPTOP_SURFACE = { width: 1440, height: 810, deviceDpr: 2 } as const;

/** How many full-viewport surfaces the guided entry shares one backing budget
 *  across: the visible destination and the outgoing frame it fades from. */
const OVERVIEW_SURFACES = 2;

export interface Surface {
  name: SurfaceName;
  /** Css pixels. */
  width: number;
  height: number;
  /** The display's ratio before any bound; null where none is applied. */
  deviceDpr: number | null;
  /** The ratio the surface is drawn at. */
  dpr: number;
  /** Device pixels, floored as `makeTargetOf` floors them. */
  backingWidth: number;
  backingHeight: number;
  /** Which sizing rule produced `dpr`. */
  sizedBy: "fixed" | "boundedDpr" | "boundedCompositeDpr";
}

export function surfaceOf(name: SurfaceName): Surface {
  const sized = (
    width: number, height: number, deviceDpr: number | null, dpr: number,
    sizedBy: Surface["sizedBy"],
  ): Surface => ({
    name,
    width,
    height,
    deviceDpr,
    dpr,
    backingWidth: Math.max(1, Math.floor(width * dpr)),
    backingHeight: Math.max(1, Math.floor(height * dpr)),
    sizedBy,
  });
  if (name === "probe") return sized(PROBE_W, PROBE_H, null, PROBE_DPR, "fixed");
  const { width, height, deviceDpr } = LAPTOP_SURFACE;
  return name === "overview"
    ? sized(width, height, deviceDpr,
      boundedCompositeDpr(width, height, deviceDpr, OVERVIEW_SURFACES), "boundedCompositeDpr")
    : sized(width, height, deviceDpr, boundedDpr(width, height, deviceDpr), "boundedDpr");
}

/** `&surface=`, or the caller's own default; an unknown name is a throw, on
 *  `narrow`'s reasoning - a default surface under another one's name is a
 *  believable table. */
export function surfaceFromQuery(q: URLSearchParams, fallback: SurfaceName): Surface {
  const wanted = q.get("surface");
  if (wanted === null) return surfaceOf(fallback);
  const name = SURFACE_NAMES.find((n) => n === wanted);
  if (!name) throw new Error(`no such surface: ${wanted} (have ${SURFACE_NAMES.join(", ")})`);
  return surfaceOf(name);
}

/** A virgin canvas of a surface's size, over the shared View. */
export function makeSurfaceTarget(surface: Surface, readback = false): Target {
  return makeTargetOf(surface.width, surface.height, surface.dpr, readback);
}

/** Give a target's backing store back now, not when the collector gets to
 *  it. A passage is a virgin canvas for every frame, each the size of the
 *  window, and the browser moves a canvas off the accelerated path under
 *  exactly the pressure that holding them would build. */
export function releaseTarget(tg: Target): void {
  tg.ctx.canvas.width = 0;
  tg.ctx.canvas.height = 0;
}

/** Half-open bounds in device pixels. */
export interface DeviceRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * The halfcourt's rectangle on a target, in device pixels.
 *
 * Read off the View's own court transform and rounded outward, the way the
 * hand rounds the court surface it bakes, so the crop is the region the
 * record's marks can land in and nothing typed. What lies outside it is the
 * plate's margin and whatever is drawn there. What a hand letters INSIDE the
 * court is inside this rectangle too: the crop tells the court from its
 * margin, and cannot tell a line of text from the marks it stands over.
 */
export function courtRect(tg: Target): DeviceRect {
  const { view, dpr } = tg;
  const { width, height } = tg.ctx.canvas;
  const left = view.sx(COURT.x0);
  const top = view.sy(COURT.y1);
  const right = left + view.s(COURT.x1 - COURT.x0);
  const bottom = top + view.s(COURT.y1 - COURT.y0);
  const clamp = (v: number, max: number): number => Math.max(0, Math.min(max, v));
  return {
    x0: clamp(Math.floor(left * dpr), width),
    y0: clamp(Math.floor(top * dpr), height),
    x1: clamp(Math.ceil(right * dpr), width),
    y1: clamp(Math.ceil(bottom * dpr), height),
  };
}

const views = new Map<string, View>();
let freshViews = false;

/**
 * The one View every target of this size draws through.
 *
 * A View is immutable geometry, so sharing it changes no pixel; what it changes
 * is whether a cache keyed on the object can be found again, which is the
 * gallery's condition and therefore the one a verdict has to be taken in.
 * `cold()` still empties those caches: they reset on the prefix generation or
 * in `clearWashes`, neither of which depends on the View being new.
 */
export function viewOf(w: number, h: number): View {
  if (freshViews) return makeView(w, h);
  const key = `${w}x${h}`;
  let view = views.get(key);
  if (!view) {
    view = makeView(w, h);
    views.set(key, view);
  }
  return view;
}

/**
 * `&view=fresh`: a new View per target, as the probes used to build them.
 *
 * For demonstrations only — it is the arm that shows what the shared View
 * buys, by failing to see a defect the shared one sees. A verdict taken this
 * way says so in its report and is not a verdict about the gallery.
 */
export function viewsFromQuery(q: URLSearchParams): void {
  const wanted = q.get("view");
  if (wanted !== null && wanted !== "fresh" && wanted !== "shared") {
    throw new Error(`no such view: ${wanted} (have shared, fresh)`);
  }
  freshViews = wanted === "fresh";
}

export function viewSharing(): "shared" | "fresh" {
  return freshViews ? "fresh" : "shared";
}

/** A target's whole backing, at whatever size it was made. */
export function pixelsOf(tg: Target): Uint8ClampedArray {
  const { width, height } = tg.ctx.canvas;
  return tg.ctx.getImageData(0, 0, width, height).data;
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

/**
 * A stretch of the score, for the questions a single instant cannot answer.
 *
 * `beatsOf` asks whether one frame is the same frame however it was reached.
 * Whether the piece MOVES well is a question about consecutive frames, and
 * whether a cache that only fills while a stroke is being laid stays honest is
 * a question about the instants inside a passage — neither has a beat. A range
 * names the passage, the hand that draws it, and what an observer should find
 * there: `moving` (something changes on every frame), `held` (an authored
 * stillness, so a still frame is not a fault), or `cut` (exactly one hard
 * change, and it is the record's).
 *
 * Bounds are seconds into the loop, before the pass offset, on the clock
 * `Beat.at` uses. The end is INCLUSIVE: the frame at `to` is drawn, so the
 * pair that straddles a boundary belongs to the range that ends on it. The
 * continuity probe draws that pair and hands its judgement on where the
 * boundary has a seam range centred on it: see `seamAt` there.
 */
export interface RangeMark {
  /** Seconds into the loop, on the range's own clock. */
  t: number;
  /** The game surfaces bake one more prefix step at this instant. */
  kind: "prefix-step";
}

export interface Range {
  id: string;
  mode: ModeId;
  from: number;
  to: number;
  expect: "moving" | "held" | "cut";
  /** Instants inside the range where the renderer changes how it composes
   *  the same picture, so a step found there can be told from one found
   *  anywhere else. */
  marks?: RangeMark[];
  /** Measured and listed, never judged against a budget. */
  reportOnly?: true;
}

/** How far either side of the cut its range reaches: settled frames before
 *  and after, so the cut pair is the only event the range can contain. */
const CUT_REACH_S = 1;
/** Half the width of a seam. A seam is asked whether the pair of frames
 *  across one boundary steps, so it needs the boundary and enough of each
 *  neighbour to show what an ordinary pair there looks like — and no more,
 *  because the neighbours have ranges of their own. */
const SEAM_REACH_S = 0.5;
/** The closing rush: the last stretch of score before a hand's game ends,
 *  where the eased clock lays the most feed per frame. */
const RUSH_S = 1;
/** How much of a long beat its head range takes. The season beat is most of
 *  the window and nearly all of it is the calendar folding at a pace nobody
 *  needs frame by frame; what a head buys is the stretch where the previous
 *  phase hands over and the first of the new one lands, at a capture cost of
 *  seconds of score rather than minutes. */
const HEAD_S = 10;
/** Halvings of the unit interval when the game clock is inverted — more than
 *  a double can resolve, so the instant found is the clock's own. */
const BISECTIONS = 60;
/** Two boundaries closer than this are one boundary under two names. */
const SAME_INSTANT_S = 1e-6;
/** The hands whose ordinary seasons and window boundaries are sampled. */
const SEASON_HANDS = ["plate", "field", "hand"] as const satisfies readonly ModeId[];

/** The game phase's `u` at which its eased clock has laid `frac` of the feed.
 *  Found by bisection on the exported clock, so the probe owns no copy of the
 *  curve and cannot drift off it. */
function gameClockAt(frac: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < BISECTIONS; i++) {
    const mid = (lo + hi) / 2;
    if (gameClock(mid) < frac) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** The boundaries strictly inside a set of spans, named for what meets there.
 *  Where one span ends as another begins it is `<ending>-<beginning>`; a span
 *  that ends into nothing is `<id>-end` and one that begins out of nothing is
 *  `<id>-start`. The game's end is `game-end` on every hand, whatever follows
 *  it, because it is the same event in each — the feed running out — and the
 *  hands differ only in what they do next. */
function seamsOf(spans: readonly PhaseSpan[]): { name: string; phase: number }[] {
  const inside = (p: number): boolean => p > 0 && p < 1;
  const out: { name: string; phase: number }[] = [];
  for (const s of spans) {
    if (inside(s.to)) {
      const next = spans.find((n) => n !== s && n.from === s.to);
      out.push({
        name: s.id === "game" || !next ? `${s.id}-end` : `${s.id}-${next.id}`,
        phase: s.to,
      });
    }
    if (inside(s.from) && !spans.some((n) => n !== s && n.to === s.from)) {
      out.push({ name: `${s.id}-start`, phase: s.from });
    }
  }
  return out;
}

/**
 * The passages worth watching, derived from the score rather than typed.
 *
 * Every bound is read from an exported score value or from the artifact the
 * renderer reads, so a change to the score moves the range with it and a
 * verdict cannot go on describing a passage that is no longer there. AN ID IS
 * NEVER RENAMED ONCE PUBLISHED: budgets and verdict files name ranges by id,
 * and a renamed range is a budget silently judging nothing.
 */
export function rangesOf(schedule: Schedule, data: Loaded): Range[] {
  const out: Range[] = [];
  const add = (
    id: string, mode: ModeId, from: number, to: number,
    expect: Range["expect"] = "moving", extra: Partial<Range> = {},
  ): void => {
    out.push({ id, mode, from, to, expect, ...extra });
  };

  // The piece's one cut, as a positive control: a range in which an
  // instrument that cannot see a hard change is shown to be blind.
  const cut = schedule.byYear.get(CUT_YEAR);
  if (cut) add("plate.cut", "plate", cut.start - CUT_REACH_S, cut.start + CUT_REACH_S, "cut");

  // An ordinary season handing over to the next, on `beatsOf`'s own ordinary
  // season. The incoming season lands across ARRIVAL_TAIL of its own phase
  // while the outgoing one recedes beneath it, so that is the moving part;
  // what precedes it is the settled season, held, and is kept as its own
  // range so a dip can be measured against the plate it dips from.
  const k = Math.floor(schedule.segments.length / 4);
  const settled = schedule.segments[k];
  const arriving = schedule.segments[k + 1];
  if (settled && arriving) {
    for (const mode of SEASON_HANDS) {
      add(`${mode}.tail`, mode,
        settled.start + settled.duration * ARRIVAL_TAIL, arriving.start, "held");
      add(`${mode}.hand-over`, mode,
        arriving.start, arriving.start + arriving.duration * ARRIVAL_TAIL);
    }
  }

  const win = schedule.byYear.get(WINDOW_YEAR);
  if (win) {
    const at = (phase: number): number => win.start + phase * win.duration;
    const nightSeconds = data.slateFile?.span.seconds;
    const gf = data.gameFile;
    const [beatOne, , beatSeason, beatClose] = WINDOW_BEATS;
    const plate = (id: string): PhaseSpan => PLATE_WINDOW_SPANS.find((s) => s.id === id)!;
    const [handOne, handGame, handNight] = handWindowPhases(nightSeconds);

    // Where each game surface takes on one more prefix step. Both hands cache
    // the dried game in the same number of steps over the same frames and
    // differ only in the span their clock runs across, so one derivation
    // serves both. A step that lands on the phase's last instant is the end
    // of the range, not a mark inside it.
    const prefixMarks = (span: PhaseSpan): RangeMark[] => {
      if (!gf) return [];
      const total = gameTotalFrames(gf);
      const step = Math.ceil(total / GAME_PREFIX_STEPS);
      const marks: RangeMark[] = [];
      for (let frame = step; frame < total; frame += step) {
        marks.push({
          t: at(span.from + gameClockAt(frame / total) * (span.to - span.from)),
          kind: "prefix-step",
        });
      }
      return marks;
    };

    // THE PLATE's evidence, in the order it is shown.
    add("plate.possession", "plate", at(plate("possession").from), at(plate("possession").to));
    add("plate.hold", "plate", at(plate("hold").from), at(plate("hold").to), "held");
    add("plate.game", "plate", at(plate("game").from), at(plate("game").to), "moving",
      { marks: prefixMarks(plate("game")) });
    add("plate.game.rush", "plate", at(plate("game").to) - RUSH_S, at(plate("game").to));
    add("plate.gestures", "plate", at(plate("gestures").from), at(plate("gestures").to));
    // The close carries large changed-pixel steps that are rounding and not
    // events, which makes it the standing negative control: an instrument
    // that flags it is counting pixels where it should be weighing them.
    add("plate.close", "plate", at(beatClose.from), at(beatClose.to));

    // THE HAND's scales. ONE opens on the preceding season receding alone,
    // then a time-clip of the game artifact at true rate, so it moves for the
    // lead plus exactly as long as the declared possession lasts and then
    // stands until the beat ends: two ranges, because the second is an
    // authored hold and judging it as motion would call the score a fault.
    // A hold shorter than the window a flicker is judged over cannot show
    // the one fault a hold is watched for, so one that short is not listed.
    if (gf) {
      const pos = possessionFrames(gf);
      const drawn = Math.min(at(handOne.to),
        at(handOne.from) + WINDOW_ONE_LEAD_SECONDS + (pos.f1 - pos.f0) / gf.hz);
      add("hand.one.draw", "hand", at(handOne.from), drawn);
      if (at(handOne.to) - drawn >= THRESHOLDS.FLICKER_WINDOW_S) {
        add("hand.one.held", "hand", drawn, at(handOne.to), "held");
      }
    }
    add("hand.game", "hand", at(handGame.from), at(handGame.to), "moving",
      { marks: prefixMarks(handGame) });
    // The middle of the hand's game: the live edge at an instant no beat
    // falls on, kept narrow so a few samples of it are all near the middle.
    const mid = at((handGame.from + handGame.to) / 2);
    add("hand.game.mid", "hand", mid - SEAM_REACH_S, mid + SEAM_REACH_S);
    add("hand.game.rush", "hand", at(handGame.to) - RUSH_S, at(handGame.to));
    add("hand.night", "hand", at(handNight.from), at(handNight.to));
    add("hand.season-head", "hand", at(beatSeason.from), at(beatSeason.from) + HEAD_S);

    // Seams. A boundary shared by two names is one seam, under the name of
    // the hand's own score — which is why each hand's spans are entered
    // before the beats every hand shares.
    const seams = new Map<ModeId, { name: string; t: number }[]>();
    const seam = (mode: ModeId, name: string, t: number): void => {
      const mine = seams.get(mode) ?? [];
      seams.set(mode, mine);
      if (mine.some((s) => Math.abs(s.t - t) < SAME_INSTANT_S)) return;
      mine.push({ name, t });
    };
    for (const s of seamsOf(PLATE_WINDOW_SPANS)) seam("plate", s.name, at(s.phase));
    for (const s of seamsOf(handWindowPhases(nightSeconds))) seam("hand", s.name, at(s.phase));
    for (const mode of SEASON_HANDS) {
      for (const s of seamsOf(WINDOW_BEATS)) {
        if (s.phase === beatSeason.from || s.phase === beatClose.from) {
          seam(mode, s.name, at(s.phase));
        }
      }
      seam(mode, "window-entry", win.start);
      seam(mode, "window-exit", win.start + win.duration);
    }
    // The possession hand-over: the instant each hand's game clock reaches
    // the middle of the declared possession, where the strokes ONE laid at
    // true rate leave its layer and the game's own walk re-lays them.
    if (gf) {
      const pos = possessionFrames(gf);
      const u = gameClockAt((pos.f0 + pos.f1) / 2 / gameTotalFrames(gf));
      for (const [mode, span] of [["plate", plate("game")], ["hand", handGame]] as const) {
        seam(mode, "possession", at(span.from + u * (span.to - span.from)));
      }
    }
    for (const [mode, mine] of seams) {
      for (const s of mine) {
        add(`${mode}.seam.${s.name}`, mode, s.t - SEAM_REACH_S, s.t + SEAM_REACH_S);
      }
    }

    // Reported, never budgeted: passages that show the same kinds of motion
    // on other hands and at other scales, listed so they are looked at.
    const listed = { reportOnly: true } as const;
    add("measure.one", "measure", at(beatOne.from), at(beatOne.to), "moving", listed);
    add("hand.close", "hand", at(beatClose.from),
      Math.min(at(beatClose.to), at(beatClose.from) + HEAD_S), "moving", listed);
    const crest = at(beatSeason.from + WINDOW_SEASON_CREST * (beatSeason.to - beatSeason.from));
    add("hand.season.crest", "hand", crest - HEAD_S / 2, crest + HEAD_S / 2, "moving", listed);
    // The guided entry's chapters, each on its own hand: the passages a
    // visitor meets first. The anchor is the chapter's semantic stop, resolved
    // the way the overview resolves it.
    OVERVIEW_CHAPTERS.forEach((chapter, index) => {
      const stop = semanticStopById(chapter.stop);
      const anchor = stop ? semanticTime(stop, schedule, nightSeconds) : null;
      if (anchor === null) return;
      add(`overview.chapter.${index + 1}`, chapter.mode,
        anchor, anchor + OVERVIEW_CHAPTER_SECONDS, "moving", listed);
    });
  }

  // A range that names nothing, or a name that means two things, is a budget
  // judging the wrong frames in silence.
  const seen = new Set<string>();
  for (const r of out) {
    if (!(r.from < r.to)) throw new Error(`range ${r.id} is empty: ${r.from} .. ${r.to}`);
    if (seen.has(r.id)) throw new Error(`two ranges are named ${r.id}`);
    seen.add(r.id);
  }
  return out;
}

/** How many instants a range is sampled at when nobody says. */
export const DEFAULT_RANGE_SAMPLES = 3;

/**
 * Evenly spaced instants strictly inside a range, as beats.
 *
 * Never the ends: an end is a boundary, and the frame there belongs to
 * whichever side the renderer's own comparison puts it on. That is all this
 * spacing promises. A seam, and the cut's range, are built symmetrically
 * around a boundary of their own, so an odd count puts the middle sample on
 * that boundary: it is the same float in every run and therefore the same
 * frame, but which side of the boundary it shows is the renderer's to say and
 * not the name's. An even count stays off it. The id carries the sample and
 * the count, so the same name is the same instant in every verdict file it
 * appears in.
 */
export function samplesOf(range: Range, n: number): Beat[] {
  const out: Beat[] = [];
  for (let i = 1; i <= n; i++) {
    out.push({
      id: `${range.id}@${i}of${n}`,
      at: range.from + (i / (n + 1)) * (range.to - range.from),
    });
  }
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
