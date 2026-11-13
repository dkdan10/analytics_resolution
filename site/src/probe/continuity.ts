/** Harness C - does a passage move well, frame after frame?
 *
 * Purity takes one instant at a time and perf times frames it throws away, so
 * neither has ever looked at two consecutive frames of the piece. This draws a
 * named range of the score at a display cadence, every frame of it, and hands
 * each consecutive pair to `continuity-metrics.ts`: how many pairs did not
 * move, whether anything flashed, whether the picture dipped and recovered,
 * whether it stepped where a surface was baked, and whether it cut.
 *
 * THE FRAMES ARE THE GALLERY'S FRAMES. Each is drawn at its own instant on a
 * VIRGIN canvas over the shared View, after a second of pre-roll has warmed
 * the caches the way playback into the range would. A virgin canvas, because a
 * canvas does not rasterise its second pass like its first and that difference
 * would land in every pair; the shared View and the pre-roll, because the
 * stroke caches that do their work in exactly these passages key on the View
 * and fill as the playhead advances. Nothing is emptied inside a range.
 *
 * THE SURFACE IS THE LAPTOP'S, not the fixed probe surface: see `Surface` in
 * shared.ts. `&surface=probe` and `&surface=overview` are there to ask the
 * same question of the other two canvases the piece is drawn on.
 *
 * THE COURT CROP IS THE COURT AND NOTHING FINER. `&crop=court` adds a second
 * set of statistics over the halfcourt's rectangle, which leaves out the
 * plate's margin and what is drawn there. It does not leave out lettering a
 * hand sets INSIDE the court - the recovered-set line that stands over the
 * window is one - because nothing the renderer exports says where that
 * lettering is. What keeps such a line's slow ramp from reading as motion is
 * the still level, not the crop.
 *
 * EVERY RANGE CARRIES ITS OWN CONTROL. After the last frame, that frame is
 * drawn once more on another virgin canvas. If the two differ by more than the
 * still level, two draws of one instant disagreed by more than the instrument
 * calls nothing - an accelerated canvas does that under load - and the range
 * is INCONCLUSIVE: it measured nothing and is taken again, alone or exact.
 *
 * WHAT THE PAGE JUDGES AND WHAT IT LEAVES. Structure only: one cut in the cut's
 * range, on the pair that straddles it, and none anywhere else. Budgets are
 * the driver's, applied to this report with the same `judge`, so the page
 * needs no file of them and a budget cannot change a capture.
 *
 * Parameters: `&range=<ids>` (default: every range), `&mode=<hands>`,
 * `&fps=<n>`, `&surface=probe|laptop|overview`, `&crop=court`, `&pairs=marks`,
 * `&control=<ids>` (ranges taken in addition, as the run's standing controls),
 * `&display=`, `&exact`, `&view=fresh`.
 */

import { displayFromQuery } from "../display";
import { GAME_PREFIX_STEPS, gameClock, gameTotalFrames } from "../game";
import type { ModeId } from "../modes";
import { renderTo, type Target } from "../render";
import { CUT_YEAR } from "../timeline";
import {
  beginState,
  fallStats,
  judge,
  markedPairs,
  meanOf,
  pairStats,
  straddlingPairs,
  summarize,
  THRESHOLDS,
  type PairStat,
  type PairState,
  type Summary,
} from "./continuity-metrics";
import {
  aboveNoise,
  cold,
  courtRect,
  diffPixels,
  emit,
  forceResidency,
  hashPixels,
  makeSurfaceTarget,
  MODES,
  narrow,
  pixelsOf,
  rangesOf,
  releaseTarget,
  surfaceFromQuery,
  viewSharing,
  warmUp,
  type Env,
  type NoiseFloor,
  type Range,
} from "./shared";

/** The cadence a range is drawn at when nobody says: the display's own. */
const DEFAULT_FPS = 60;
/** How much playback leads into a range before its first frame is kept. */
const PREROLL_S = 1;
/** How many frames are drawn between handing the main thread back. */
const YIELD_EVERY = 30;
/** A frame this close past a range's end is its end frame: the count is a
 *  product of floats and must not lose the last frame to a rounding step. */
const GRID_SLACK = 1e-6;
/** How far either side of a prefix step a straddle pair stands, in feed
 *  frames: near enough that nothing but the step separates the two frames,
 *  far enough that neither can land on it. */
const MARK_STRADDLE_FEED_FRAMES = 1 / 20;
/** Where the pair beside a straddle begins, in straddle half-widths before
 *  the step: one whole straddle back from where the straddle itself begins. */
const STRADDLE_WIDTHS_BACK = 3;
/** Halvings when the game clock is inverted, as the marks themselves are
 *  found: more than a double resolves, so the instant is the clock's own. */
const BISECTIONS = 60;
/** How far a straddle's midpoint may sit from the mark it straddles before
 *  the two derivations are not describing the same instant. */
const MARK_AGREEMENT_S = 1e-3;
/** The one continuity-only range: ONE whole, drawn and held together. */
const ONE_WHOLE = "hand.one";
/** How `rangesOf` names a range built around one boundary. */
const SEAM_INFIX = ".seam.";
/** How `rangesOf` names the settled plate a hand-over leaves. */
const TAIL_SUFFIX = ".tail";
/** Two instants closer than this are the same boundary. */
const SAME_INSTANT_S = 1e-6;

const round = (x: number, places: number): number => Number(x.toFixed(places));

/** Per-frame figures, one array per figure, because a range is a great many
 *  frames and a verdict is read by people as well as scripts. The first frame
 *  has no pair before it, so its pair figures are null. */
interface Columns {
  mean: number[];
  changedPx: (number | null)[];
  energy: (number | null)[];
}
const columns = (): Columns => ({ mean: [], changedPx: [], energy: [] });

/** What each pair holds of the two flicker bands, and its largest single
 *  step. Read off the finished pairs and never as they are made: a way back
 *  that goes on to reach the deeper band is taken out of the shallower one
 *  after the pair it was first counted in. They are here so that where a
 *  share of frames comes from can be seen, and so the level a frame has to
 *  reach to count can be set from what the passages actually hold. */
const flickerColumns = (pairs: readonly PairStat[]) => ({
  flickerLowPx: [null, ...pairs.map((p) => p.flickerLowPx)],
  flickerHighPx: [null, ...pairs.map((p) => p.flickerHighPx)],
  maxDelta: [null, ...pairs.map((p) => p.maxDelta)],
  maxFall: [null, ...pairs.map((p) => p.maxFall)],
});

export async function continuityProbe(env: Env, q: URLSearchParams): Promise<unknown> {
  const { data, schedule, inscriptions } = env;
  const residency = await forceResidency(data, (s) => console.log(s));

  const fps = q.has("fps") ? Number(q.get("fps")) : DEFAULT_FPS;
  if (!Number.isFinite(fps) || fps <= 0) throw new Error(`fps is not a cadence: ${q.get("fps")}`);
  const crop = q.get("crop");
  if (crop !== null && crop !== "court") throw new Error(`no such crop: ${crop} (have court)`);
  const pairsAsked = q.get("pairs");
  if (pairsAsked !== null && pairsAsked !== "marks") {
    throw new Error(`no such pairs: ${pairsAsked} (have marks)`);
  }
  const exact = q.get("exact") === "1";
  const surface = surfaceFromQuery(q, "laptop");
  const display = displayFromQuery(q, false);
  // The second pass of the loop, as the other probes take theirs, so a range
  // near the top of the score is reached out of the coda and not out of nothing.
  const base = schedule.duration;

  const fresh = (): Target => makeSurfaceTarget(surface, exact);
  const drawOn = (tg: Target, t: number, mode: ModeId): void =>
    renderTo(tg, t, data, schedule, inscriptions, mode, false, false, undefined, null, display);
  const shot = (t: number, mode: ModeId): Uint8ClampedArray => {
    const tg = fresh();
    drawOn(tg, t, mode);
    const px = pixelsOf(tg);
    releaseTarget(tg);
    return px;
  };
  const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

  // --- what is swept ---------------------------------------------------------
  const derived = rangesOf(schedule, data);
  // ONE as a single passage. Its two halves are ranges of their own, because
  // one is motion and the other an authored hold; the whole is listed beside
  // them, report-only, for anyone holding a figure that was taken over both.
  const draw = derived.find((r) => r.id === `${ONE_WHOLE}.draw`);
  const held = derived.find((r) => r.id === `${ONE_WHOLE}.held`);
  const every: Range[] = [...derived];
  if (draw && held) {
    every.push({
      id: ONE_WHOLE, mode: draw.mode, from: draw.from, to: held.to,
      expect: "moving", reportOnly: true,
    });
  }
  const modes = narrow("hand", MODES, q.get("mode"), (m) => m);
  let ranges = narrow("range", every, q.get("range"), (r) => r.id);
  if (q.has("mode")) {
    // A range belongs to one hand. Asked for by name beside a hand that does
    // not draw it, it would be a row silently missing from a table somebody
    // reads as complete; asked for by hand alone, the hand narrows the sweep.
    if (q.has("range")) {
      const strays = ranges.filter((r) => !modes.includes(r.mode));
      if (strays.length) {
        throw new Error("not drawn by the hand(s) asked for: "
          + strays.map((r) => `${r.id} (${r.mode})`).join(", "));
      }
    } else {
      ranges = ranges.filter((r) => modes.includes(r.mode));
    }
    const idle = modes.filter((m) => !ranges.some((r) => r.mode === m));
    if (idle.length) throw new Error(`no range asked for is drawn by: ${idle.join(", ")}`);
  }
  // The standing controls ride along whatever was asked for, hand or range.
  const controls = narrow("control", every, q.get("control") ?? "", (r) => r.id);
  const sweep = [...ranges, ...controls.filter((c) => !ranges.includes(c))];
  if (!sweep.length) throw new Error("nothing to sweep");

  const cut = schedule.byYear.get(CUT_YEAR);

  /**
   * The seam, if any, that a range ends on.
   *
   * A range is drawn through its end frame. Where the end is a boundary, that
   * frame is the next passage's first and the last pair is the step across
   * the boundary - which `rangesOf` gives a range of its own, centred on it.
   * So the pair is that seam's to judge, whether the seam is in this run or
   * not, and it is named on the row so the step is never out of sight.
   */
  const seamAt = (r: Range): Range | undefined =>
    every.find((s) => s !== r && s.mode === r.mode && s.id.includes(SEAM_INFIX)
      && Math.abs((s.from + s.to) / 2 - r.to) < SAME_INSTANT_S);

  /**
   * The settled plate a range hands over from, if it leaves one.
   *
   * A hand-over begins where the season before it stops being held, and a dip
   * in it is a dip from THAT picture. Measured from its own first frame alone,
   * a hand-over that is already under the settled plate when it begins would
   * score the shallower for having started inside its dip. So one frame of
   * the tail, from its middle where nothing is arriving or leaving, stands
   * before the range's first frame when the dip is taken - whether or not the
   * tail is in the run, so the figure a budget is taken from and the figure
   * it is held against are the same figure.
   */
  const leadOf = (r: Range): Range | undefined =>
    every.find((s) => s !== r && s.mode === r.mode && s.expect === "held"
      && s.id.endsWith(TAIL_SUFFIX) && Math.abs(s.to - r.from) < SAME_INSTANT_S);

  // Every first-use cost, once, before anything is kept: a glyph shaped or a
  // font resolved inside a range would be a changed pair that is the browser's.
  {
    const scratch = fresh();
    const onScratch = (t: number, m: ModeId): void => drawOn(scratch, t, m);
    for (const r of sweep) {
      warmUp(onScratch, [{ id: r.id, at: (r.from + r.to) / 2 }], base, [r.mode]);
    }
    releaseTarget(scratch);
  }

  // The crop is the same rectangle for every frame of the run: one surface,
  // one View.
  const probeTarget = fresh();
  const width = probeTarget.ctx.canvas.width;
  const height = probeTarget.ctx.canvas.height;
  const cropRect = crop === "court" ? courtRect(probeTarget) : null;
  releaseTarget(probeTarget);

  // --- one range ---------------------------------------------------------------
  const capture = async (r: Range): Promise<Record<string, unknown>> => {
    const t0 = performance.now();
    cold();
    // Before the pre-roll, so the playhead still runs straight into the range.
    const lead = leadOf(r);
    const leadAt = lead ? (lead.from + lead.to) / 2 : null;
    const leadMean = leadAt === null
      ? null : meanOf(shot(base + leadAt, r.mode), width, height, cropRect);
    const scratch = fresh();
    for (let k = Math.round(PREROLL_S * fps); k >= 1; k--) {
      drawOn(scratch, base + r.from - k / fps, r.mode);
    }
    releaseTarget(scratch);

    const count = Math.floor((r.to - r.from) * fps + GRID_SLACK) + 1;
    const times: number[] = [];
    const full: PairStat[] = [];
    const court: PairStat[] = [];
    const shown: number[] = [];
    const hashes: string[] = [];
    const cols = columns();
    const courtCols = columns();
    let prev: Uint8ClampedArray | null = null;
    let state: PairState | null = null;
    let hash = "";
    for (let i = 0; i < count; i++) {
      const at = r.from + i / fps;
      const px = shot(base + at, r.mode);
      times.push(at);
      shown.push(round(base + at, 6));
      if (prev && state) {
        const pair = pairStats(prev, px, state);
        full.push(pair.full);
        // No colour channel moved, so the bytes are the bytes already hashed.
        if (pair.full.changedPx !== 0) hash = hashPixels(px);
        cols.mean.push(round(pair.full.mean, 6));
        cols.changedPx.push(pair.full.changedPx);
        cols.energy.push(round(pair.full.energy, 6));
        if (pair.crop) {
          court.push(pair.crop);
          courtCols.mean.push(round(pair.crop.mean, 6));
          courtCols.changedPx.push(pair.crop.changedPx);
          courtCols.energy.push(round(pair.crop.energy, 6));
        }
      } else {
        state = beginState(px, width, height, fps, cropRect);
        hash = hashPixels(px);
        cols.mean.push(round(state.sumFull / state.pxFull, 6));
        cols.changedPx.push(null);
        cols.energy.push(null);
        if (cropRect) {
          courtCols.mean.push(round(state.sumCrop / state.pxCrop, 6));
          courtCols.changedPx.push(null);
          courtCols.energy.push(null);
        }
      }
      hashes.push(hash);
      prev = px;
      if (i % YIELD_EVERY === YIELD_EVERY - 1) await tick();
    }

    // The control: the last frame again, with nothing changed in between.
    const again = shot(base + times[times.length - 1]!, r.mode);
    const drift = diffPixels(prev!, again, width);
    const controlDraw = {
      identical: drift.channels === 0,
      channels: drift.channels,
      maxDelta: drift.maxDelta,
    };

    const marks = markedPairs(times, (r.marks ?? []).map((m) => m.t));
    const cutPairs = r.expect === "cut" && cut ? straddlingPairs(times, cut.start) : null;
    // Only where the last frame really is the end: a range whose length is
    // not a whole number of frames stops short of its boundary and has no
    // pair across it.
    const seam = seamAt(r);
    const lastPair = times.length - 2;
    const seamPairs = seam && Math.abs(times[times.length - 1]! - r.to) < SAME_INSTANT_S
      ? [lastPair] : [];
    const summary = summarize(full, fps, marks, seamPairs, leadMean?.full ?? null);
    const courtSummary: Summary | null = cropRect
      ? summarize(court, fps, marks, seamPairs, leadMean?.crop ?? null) : null;
    const structural = judge(summary, r.expect, null, cutPairs, drift.maxDelta);
    const seconds = (performance.now() - t0) / 1000;
    console.log(`continuity ${r.id}: ${structural.verdict}`
      + `${structural.reasons.length ? ` (${structural.reasons.join(", ")})` : ""}, `
      + `${count} frames in ${seconds.toFixed(1)}s`);
    return {
      range: r.id,
      mode: r.mode,
      expect: r.expect,
      reportOnly: r.reportOnly === true,
      control: controls.includes(r),
      from: r.from,
      to: r.to,
      frames: count,
      marks: (r.marks ?? []).length,
      markedPairs: marks,
      ...(cutPairs ? { cutAt: cut!.start, cutPairs } : {}),
      ...(seamPairs.length ? { seam: seam!.id, seamPairs } : {}),
      ...(lead && leadMean && leadAt !== null ? {
        dipLead: {
          range: lead.id,
          t: round(base + leadAt, 6),
          mean: round(leadMean.full, 6),
          ...(leadMean.crop === null ? {} : { courtMean: round(leadMean.crop, 6) }),
        },
      } : {}),
      // Structure only. A budget, where there is one, is the driver's to apply.
      verdict: structural.verdict,
      reasons: structural.reasons,
      controlDraw,
      summary,
      ...(courtSummary ? { court: courtSummary } : {}),
      captureSeconds: round(seconds, 1),
      framesPerSecond: round(count / seconds, 2),
      perFrame: {
        t: shown,
        hash: hashes,
        ...cols,
        ...flickerColumns(full),
        ...(cropRect ? { court: { ...courtCols, ...flickerColumns(court) } } : {}),
      },
    };
  };

  const rows: Record<string, unknown>[] = [];
  for (const r of sweep) {
    await tick();
    rows.push(await capture(r));
  }

  // --- straddle pairs ---------------------------------------------------------
  /**
   * A MARK, TAKEN FROM BOTH SIDES. A range's frames cross a prefix step
   * wherever the cadence happens to put them, with a whole frame of ordinary
   * motion in the same pair. A straddle pair stands a named fraction of a feed
   * frame either side of the step, so the step is all that separates its two
   * frames: whatever differs between them is the surface being baked, and a
   * pixel that got darker across it is the bake showing. Each pair is taken
   * from cold on virgin canvases, and judged by the purity probe's own rule
   * against a floor measured by drawing its later side again.
   *
   * AND ONE PAIR BESIDE IT. The same width of feed, ending where the straddle
   * begins, so both its frames are before the step. What that pair shows is
   * what this much time does to the picture with no step in it; without it a
   * straddle's difference could be the step or could be the clock, and
   * nothing in the report would say which.
   */
  const straddles: Record<string, unknown>[] = [];
  if (pairsAsked === "marks") {
    const gf = data.gameFile;
    const clockAt = (frac: number): number => {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < BISECTIONS; i++) {
        const mid = (lo + hi) / 2;
        if (gameClock(mid) < frac) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    };
    for (const r of sweep) {
      if (!r.marks?.length) continue;
      if (!gf) throw new Error(`${r.id} carries marks and the game's summary is not resident`);
      const total = gameTotalFrames(gf);
      const step = Math.ceil(total / GAME_PREFIX_STEPS);
      const instant = (frame: number): number => r.from + clockAt(frame / total) * (r.to - r.from);
      const feedFrame = (at: number): number =>
        gameClock((at - r.from) / (r.to - r.from)) * total;
      for (const [index, mark] of r.marks.entries()) {
        await tick();
        const stepFrame = (index + 1) * step;
        const before = instant(stepFrame - MARK_STRADDLE_FEED_FRAMES);
        const after = instant(stepFrame + MARK_STRADDLE_FEED_FRAMES);
        // The marks are derived in one place and the straddle here. If the
        // two stop agreeing, a pair is straddling nothing and must not be
        // reported as though it straddled a step.
        if (Math.abs((before + after) / 2 - mark.t) > MARK_AGREEMENT_S
          || !(feedFrame(before) < stepFrame && stepFrame <= feedFrame(after))) {
          throw new Error(`${r.id} mark ${index + 1}: the straddle does not straddle it`);
        }
        const lead = instant(stepFrame - STRADDLE_WIDTHS_BACK * MARK_STRADDLE_FEED_FRAMES);
        cold();
        const led = shot(base + lead, r.mode);
        const a = shot(base + before, r.mode);
        const b = shot(base + after, r.mode);
        const again = shot(base + after, r.mode);
        const idle = diffPixels(led, a, width);
        const wobble = diffPixels(b, again, width);
        const floor: NoiseFloor = {
          channels: wobble.channels, maxDelta: wobble.maxDelta, ballastMB: 0,
        };
        const diff = diffPixels(a, b, width);
        const fall = fallStats(a, b, width);
        straddles.push({
          range: r.id,
          mode: r.mode,
          mark: index + 1,
          stepFrame,
          before: round(base + before, 9),
          after: round(base + after, 9),
          channels: diff.channels,
          maxDelta: diff.maxDelta,
          changedPx: fall.changedPx,
          fellPx: fall.fellPx,
          maxFall: fall.maxFall,
          box: fall.box,
          floor,
          aboveNoise: aboveNoise(diff, floor),
          beside: {
            channels: idle.channels,
            maxDelta: idle.maxDelta,
            aboveNoise: aboveNoise(idle, floor),
          },
        });
      }
      console.log(`continuity ${r.id}: ${r.marks.length} straddle pair(s)`);
    }
  }

  const verdicts = rows.map((r) => r.verdict);
  return {
    probe: "continuity",
    // Structure and controls only: see the head of this file.
    verdict: verdicts.includes("INCONCLUSIVE") ? "INCONCLUSIVE"
      : verdicts.includes("red") ? "RED" : "GREEN",
    surface,
    backing: { width, height },
    fps,
    crop,
    ...(cropRect ? { cropRect } : {}),
    view: viewSharing(),
    display,
    // What the frame times are offset by, so a range's own bounds can be laid
    // against them.
    passOffset: base,
    prerollSeconds: PREROLL_S,
    thresholds: THRESHOLDS,
    rasterisation: exact
      ? "software (willReadFrequently), pinned"
      : "accelerated, as the gallery runs it - read every range against its own controlDraw",
    residency,
    controls: controls.map((c) => c.id),
    ranges: sweep,
    rows,
    pairs: pairsAsked,
    ...(pairsAsked ? {
      straddle: {
        feedFrames: MARK_STRADDLE_FEED_FRAMES,
        rows: straddles,
      },
    } : {}),
  };
}

export function emitContinuity(report: unknown): void {
  emit("probe-continuity", report);
}
