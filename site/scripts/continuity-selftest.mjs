#!/usr/bin/env node
/**
 * Show every continuity verdict failing, for its own reason and no other.
 *
 * The continuity probe judges the piece with definitions - what a still pair
 * is, what a flicker is, what a cut is - and a definition that has only ever
 * been run on the piece cannot be told from one that passes whatever it is
 * shown. So each is run here on a small synthetic sequence built to break
 * exactly one of them: a ramp that stutters, a ramp that freezes, a flash, a
 * dip, a step on a marked frame, a cut. Each case states the one outcome it
 * must produce, reasons included, and a sequence that goes red for a second
 * reason fails its case as surely as one that stays green.
 *
 * The same is done for what stands around the definitions: the control that
 * makes a range INCONCLUSIVE, the budget file's rules (headroom, the ratchet,
 * the thresholds fingerprint that voids it), and the driver's check that a
 * report is of the run that was asked for.
 *
 * Runs in Node on the page's own metrics file, with no browser:
 *
 *   npm run check:continuity
 *
 * `probe-run.mjs continuity` runs it before every launch and refuses to launch
 * on a failure. It is not part of `npm test`: it guards an instrument that is
 * run on purpose, and the build does not run that instrument either.
 */

import {
  assertion,
  budgetsInForce,
  budgetSourceProblems,
  captureProblems,
  compareContinuity,
  CONTINUITY_CONTROLS,
  emptyBudgets,
  entryFrom,
  fingerprintOf,
  flagProblems,
  judgeRows,
  loadMetrics,
  loosens,
  perfComparable,
  perfSweepProblems,
  sweepProblems,
  withEntry,
  withHeadroom,
} from "./probe-run.mjs";

const m = await loadMetrics();
const T = m.THRESHOLDS;

// --- synthetic frames ----------------------------------------------------------
const W = 64;
const H = 64;
/** How many pixels of these frames have to flicker for a pair to count: the
 *  share the metrics hold, on a frame this size. */
const MIN_PX = m.flickerMinPx(W * H);
const FPS = 60;
const FRAMES = 60;
/** Where the settled picture sits, with room to move either way. */
const GROUND = 40;
/** A small region that moves on every frame, so a sequence is never still
 *  unless a case makes it so. Small enough that it is never a cut by itself. */
const RAMP = { x0: 8, y0: 8, x1: 12, y1: 12 };
/** A second small region, for the thing a case stages. */
const PATCH = { x0: 40, y0: 40, x1: 44, y1: 44 };
/** Per-frame step of the ramp: past the still level, short of a cut's weight. */
const STEP = T.STILL_DELTA + 1;

function frame(paint) {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    d[p * 4] = d[p * 4 + 1] = d[p * 4 + 2] = GROUND;
    d[p * 4 + 3] = 255;
  }
  const fill = (r, v) => {
    for (let y = r.y0; y < r.y1; y++) {
      for (let x = r.x0; x < r.x1; x++) {
        const i = (y * W + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = v;
      }
    }
  };
  paint(fill);
  return d;
}

const ALL = { x0: 0, y0: 0, x1: W, y1: H };
const HALF = { x0: 0, y0: 0, x1: W, y1: H / 2 };

/** A sequence: `paint(i, fill)` draws frame `i` over the ground. */
const sequence = (paint, n = FRAMES) =>
  Array.from({ length: n }, (_, i) => frame((fill) => paint(i, fill)));

const ramp = (i, fill) => fill(RAMP, GROUND + STEP * i);

function measure(frames, { marks = [], crop = null, seams = [], lead = null } = {}) {
  const state = m.beginState(frames[0], W, H, FPS, crop);
  const full = [];
  const part = [];
  for (let i = 1; i < frames.length; i++) {
    const pair = m.pairStats(frames[i - 1], frames[i], state);
    full.push(pair.full);
    if (pair.crop) part.push(pair.crop);
  }
  return {
    summary: m.summarize(full, FPS, marks, seams, lead),
    court: crop ? m.summarize(part, FPS, marks, seams, lead) : null,
    pairs: full,
  };
}

const times = (n = FRAMES) => Array.from({ length: n }, (_, i) => i / FPS);

/** How far a frame moved when it was drawn again: the control's one number. */
function redrawDelta(a, b) {
  return m.pairStats(a, b, m.beginState(a, W, H, FPS)).full.maxDelta;
}

const say = (j) => (j.verdict === "green" ? "green"
  : j.verdict === "INCONCLUSIVE" ? `INCONCLUSIVE: ${j.reasons.join(", ")}`
    : `red: ${j.reasons.join(", ")}`);

/** A budget no smooth sequence here breaks and each staged fault breaks once. */
const BUDGET = {
  stillShareMax: 0.25,
  longestStillRunSMax: 0.1,
  flickerLowFrameShareMax: 0,
  flickerHighFrameShareMax: 0,
  dipDepthMax: 0.02,
  markStepRatioMax: null,
};
const MARK_BUDGET = { ...BUDGET, markStepRatioMax: 2 };

// --- the sequences ---------------------------------------------------------------
const smooth = sequence(ramp);
const STUTTER = 3;
const stutter = (i, fill) => fill(RAMP, GROUND + STEP * Math.floor(i / STUTTER));
const stuttered = sequence(stutter);
/** A patch that goes out and back by `by` on alternate frames, over whatever
 *  `under` paints: every pair moves, and by exactly that much. */
const wobbling = (by, under = () => {}) => sequence((i, fill) => {
  under(i, fill);
  fill(PATCH, GROUND + (i % 2 ? by : 0));
});
const FREEZE = { from: 24, pairs: 12 };
const frozen = sequence((i, fill) => {
  const moved = i <= FREEZE.from ? i : Math.max(FREEZE.from, i - FREEZE.pairs);
  fill(RAMP, GROUND + STEP * moved);
});
const FLASH_AT = 30;
const flash = (depth) => sequence((i, fill) => {
  ramp(i, fill);
  if (i === FLASH_AT) fill(PATCH, GROUND + depth);
});
const HIGH_DEPTH = T.FLICKER_HIGH_LEVEL + 20;
const highFlash = flash(HIGH_DEPTH);
const lowFlash = flash(T.FLICKER_LOW_LEVEL + 3);
/** The same fault the other way up: a lit patch that goes dark for a frame. */
const LIT = 200;
const blink = sequence((i, fill) => {
  ramp(i, fill);
  fill(PATCH, i === FLASH_AT ? LIT - HIGH_DEPTH : LIT);
});
/** A row of `n` pixels, for a flash that is too small to be one. */
const few = (n) => ({ x0: PATCH.x0, y0: PATCH.y0, x1: PATCH.x0 + n, y1: PATCH.y0 + 1 });
const flashOn = (region, depth) => sequence((i, fill) => {
  ramp(i, fill);
  if (i === FLASH_AT) fill(region, GROUND + depth);
});
/** A flash that goes out in one pair and comes home `step` levels a pair. */
const eased = (depth, step) => sequence((i, fill) => {
  ramp(i, fill);
  if (i >= FLASH_AT) fill(PATCH, GROUND + Math.max(0, depth - step * (i - FLASH_AT)));
});
/** The flicker window, in pairs at this cadence. */
const WINDOW_PAIRS = Math.round(T.FLICKER_WINDOW_S * FPS);
/** Out in one pair, home by the still level a pair for one pair longer than
 *  the window, then out again. The second rise follows the way home's first
 *  step by more than the window, and its last by none at all. */
const OUT = T.FLICKER_HIGH_LEVEL + 2;
const slowHome = sequence((i, fill) => {
  ramp(i, fill);
  const at = i - FLASH_AT;
  if (at < 0) return;
  const home = Math.min(at, WINDOW_PAIRS + 1) * T.STILL_DELTA;
  fill(PATCH, GROUND + OUT - home + (at > WINDOW_PAIRS + 1 ? OUT : 0));
});
/** A flash whose way out is two halves with one level given back between
 *  them. Neither half reaches the low level alone; together they pass it. */
const HALF_RISE = Math.ceil(T.FLICKER_LOW_LEVEL / 2) + 2;
const wobbledRise = sequence((i, fill) => {
  ramp(i, fill);
  const at = i - FLASH_AT;
  const lift = at === 0 ? HALF_RISE : at === 1 ? HALF_RISE - 1 : at === 2 ? 2 * HALF_RISE - 1 : 0;
  fill(PATCH, GROUND + lift);
});
/** A fall and a recovery, each slower than the flicker window, so the dip is
 *  the only thing wrong with it. */
const DIP = { top: 150, from: 10, pairs: 20 };
const dipped = sequence((i, fill) => {
  const down = Math.min(Math.max(0, i - DIP.from), DIP.pairs);
  const up = Math.min(Math.max(0, i - DIP.from - DIP.pairs), DIP.pairs);
  fill(ALL, DIP.top - STEP * (down - up));
  ramp(i, fill);
});
const faded = sequence((i, fill) => fill(ALL, 200 - STEP * i), 50);
/** A passage that begins under the picture it is leaving and climbs back to
 *  it: a rise and nothing else, unless that picture is counted before it. */
const SETTLED = DIP.top;
const recovering = sequence((i, fill) => {
  fill(ALL, SETTLED - STEP * Math.max(0, DIP.pairs - i));
  ramp(i, fill);
});
const settledMean = m.meanOf(frame((fill) => fill(ALL, SETTLED)), W, H).full;
const MARKS = [9, 19, 29, 39, 49];
const MARK_STEP = 30;
const stepped = sequence((i, fill) => {
  ramp(i, fill);
  fill(PATCH, GROUND + MARK_STEP * MARKS.filter((pair) => pair < i).length);
});
/** One level over half the frame at each mark: a great many pixels, each
 *  moving by the least it can. */
const widened = sequence((i, fill) => {
  fill(HALF, GROUND + MARKS.filter((pair) => pair < i).length);
  ramp(i, fill);
});
const cascade = sequence((i, fill) => {
  fill(HALF, GROUND + (i >= 20 ? 1 : 0) + (i >= 40 ? 1 : 0));
  ramp(i, fill);
});
const CUT_PAIR = 29;
const cutAt = (pair) => (i, fill) => {
  if (i > pair) fill(HALF, GROUND + 80);
  ramp(i, fill);
};
const cutOnce = sequence(cutAt(CUT_PAIR));
const cutTwice = sequence((i, fill) => {
  fill(HALF, GROUND + (i > CUT_PAIR ? 80 : 0) + (i > CUT_PAIR + 10 ? 80 : 0));
  ramp(i, fill);
});
const still = sequence(() => {});
/** Between two frames, and on a frame: the two ways a cut can sit on a grid. */
const BETWEEN = (CUT_PAIR + 0.5) / FPS;
const ON_A_FRAME = (CUT_PAIR + 1) / FPS;

// --- the cases ---------------------------------------------------------------------
const cases = [];
const add = (name, expected, got) => cases.push({ name, expected, got });
const verdict = (frames, expect, budget,
  { marks = [], seams = [], cutPairs = null, control = null, lead = null } = {}) =>
  () => say(m.judge(measure(frames, { marks, seams, lead }).summary, expect, budget, cutPairs, control));
/** The verdict, and how many pairs each band was counted on. */
const flickers = (frames) => () => {
  const { summary } = measure(frames);
  const on = (share) => Math.round(share * summary.pairs);
  return `${say(m.judge(summary, "moving", BUDGET))}; high on ${on(summary.flickerHighFrameShare)}, `
    + `low on ${on(summary.flickerLowFrameShare)}`;
};

add("a smooth ramp", "green", verdict(smooth, "moving", BUDGET));
add("a stuttered ramp", "red: stillShare", verdict(stuttered, "moving", BUDGET));
add("the stuttered ramp with stillShareMax null (a null field is not judged)", "green",
  verdict(stuttered, "moving", { ...BUDGET, stillShareMax: null }));
add("a stuttered ramp whose stalled frames wobble by the still level (still is a magnitude)",
  "red: stillShare", verdict(wobbling(T.STILL_DELTA, stutter), "moving", BUDGET));
add("a long freeze inside motion", "red: longestStillRunS", verdict(frozen, "moving", BUDGET));
add("nothing but a wobble of the still level, in a moving range",
  "red: stillShare, longestStillRunS", verdict(wobbling(T.STILL_DELTA), "moving", BUDGET));
add("the same wobble one level wider (that much is movement)", "green",
  verdict(wobbling(T.STILL_DELTA + 1), "moving", BUDGET));
add("a high one-frame flash", "red: flickerHighFrameShare", verdict(highFlash, "moving", BUDGET));
add("a high one-frame blink (down and back: either order is the fault)",
  "red: flickerHighFrameShare", verdict(blink, "moving", BUDGET));
add("a low one-frame flash, under the high level", "red: flickerLowFrameShare",
  verdict(lowFlash, "moving", BUDGET));
add("a high flash on one pixel fewer than the flicker minimum", "green",
  verdict(flashOn(few(MIN_PX - 1), HIGH_DEPTH), "moving", BUDGET));
add("the same flash on exactly the minimum", "red: flickerHighFrameShare",
  verdict(flashOn(few(MIN_PX), HIGH_DEPTH), "moving", BUDGET));
add("the flicker minimum is a share of the frame: more pixels on a larger one, never none, "
  + "and no answer for a size that is not one",
  "more; 1; refused", () => {
    let unsized = "answered";
    try { m.flickerMinPx(undefined); } catch { unsized = "refused"; }
    return `${m.flickerMinPx(4 * W * H) > m.flickerMinPx(W * H) ? "more" : "not more"}; `
      + `${m.flickerMinPx(0)}; ${unsized}`;
  });
add("one flash of the minimum for this frame, on this frame and on one twice as wide and tall "
  + "(the minimum is applied as a share, not as that count)",
  "red: flickerHighFrameShare; green", () => {
    // Frames of any size, built here because every other case shares one size
    // and so could not tell a share from a count.
    const flashed = (side) => {
      const at = (i) => {
        const d = new Uint8ClampedArray(side * side * 4);
        for (let p = 0; p < side * side; p++) {
          d[p * 4] = d[p * 4 + 1] = d[p * 4 + 2] = GROUND;
          d[p * 4 + 3] = 255;
        }
        const set = (p, v) => { d[p * 4] = d[p * 4 + 1] = d[p * 4 + 2] = v; };
        // One pixel that moves on every frame, so the sequence is never still.
        set(0, GROUND + STEP * i);
        if (i === FLASH_AT) for (let k = 0; k < MIN_PX; k++) set(side * 2 + k, GROUND + HIGH_DEPTH);
        return d;
      };
      const frames = Array.from({ length: FRAMES }, (_, i) => at(i));
      const state = m.beginState(frames[0], side, side, FPS, null);
      const pairs = [];
      for (let i = 1; i < frames.length; i++) {
        pairs.push(m.pairStats(frames[i - 1], frames[i], state).full);
      }
      return say(m.judge(m.summarize(pairs, FPS), "moving", BUDGET));
    };
    return `${flashed(W)}; ${flashed(2 * W)}`;
  });
add("a low flash on one pixel fewer than the minimum, and on exactly the minimum",
  "green; red: flickerLowFrameShare", () => [MIN_PX - 1, MIN_PX]
    .map((n) => verdict(flashOn(few(n), T.FLICKER_LOW_LEVEL + 3), "moving", BUDGET)()).join("; "));
add("a high flash that comes home over several pairs (one excursion, one count, deepest band)",
  "red: flickerHighFrameShare; high on 1, low on 0", flickers(eased(HIGH_DEPTH, 2 * STEP)));
add("a flash that falls back in steps no larger than the still level (the steps add up)",
  "red: flickerLowFrameShare; high on 0, low on 1",
  flickers(eased(T.FLICKER_HIGH_LEVEL + 2, T.STILL_DELTA)));
add("a slow way home is dated from its first step (a rise outside the window of that step "
  + "is not a second flicker)", "red: flickerLowFrameShare; high on 0, low on 1", flickers(slowHome));
add("a flash whose rise carries a one-level wobble (the wobble does not split the rise)",
  "red: flickerLowFrameShare", verdict(wobbledRise, "moving", BUDGET));
add("a dip that recovers", "red: dipDepth", verdict(dipped, "moving", BUDGET));
add("a monotone fade", "green", verdict(faded, "moving", BUDGET));
add("a passage that begins under the settled picture it leaves, measured alone", "green",
  verdict(recovering, "moving", BUDGET));
add("the same passage with that picture's mean standing before it", "red: dipDepth",
  verdict(recovering, "moving", BUDGET, { lead: settledMean }));
add("steps on marked frames", "red: markStepRatio",
  verdict(stepped, "moving", MARK_BUDGET, { marks: MARKS }));
add("a wide, shallow step on marked frames (energy is per pixel of the frame)",
  "red: markStepRatio", verdict(widened, "moving", MARK_BUDGET, { marks: MARKS }));
add("the same marks on a smooth ramp", "green",
  verdict(smooth, "moving", MARK_BUDGET, { marks: MARKS }));
add("marks with no step on them, on a ramp that sits two frames in three "
  + "(a still pair is not the typical pair)", "a finite ratio, green", () => {
  const { summary } = measure(stuttered, { marks: MARKS });
  const ratio = summary.markStepRatio;
  return `${Number.isFinite(ratio) ? "a finite ratio" : `ratio ${ratio}`}, `
    + say(m.judge(summary, "moving", { ...MARK_BUDGET, stillShareMax: null }));
});
add("a mark budget on a range that carries no mark (a bound with nothing to hold)",
  "red: markStepRatio", verdict(smooth, "moving", MARK_BUDGET));
add("many pixels moving by one level (a rounding cascade)", "no cut events, green", () => {
  const { summary } = measure(cascade);
  return `${summary.cutEvents.length ? `cut events at ${summary.cutEvents}` : "no cut events"}, `
    + say(m.judge(summary, "moving", null));
});
add("a deep step over a narrow share of the frame (ink arriving)", "no cut events, green", () => {
  const narrow = { x0: 0, y0: 0, x1: W, y1: Math.floor(H * T.CUT_MIN_SHARE / 2) };
  const { summary } = measure(sequence((i, fill) => {
    if (i > CUT_PAIR) fill(narrow, GROUND + 80);
    ramp(i, fill);
  }));
  return `${summary.cutEvents.length ? `cut events at ${summary.cutEvents}` : "no cut events"}, `
    + say(m.judge(summary, "moving", null));
});
add("one hard cut in a cut range", `one cut event at pair ${CUT_PAIR}, green`, () => {
  const { summary } = measure(cutOnce);
  const pairs = m.straddlingPairs(times(), BETWEEN);
  return `${summary.cutEvents.length === 1 ? "one cut event" : `${summary.cutEvents.length} cut events`} `
    + `at pair ${summary.cutEvents.join(",")}, ${say(m.judge(summary, "cut", null, pairs))}`;
});
add("the same cut, a frame landing on its instant (either pair beside it straddles)", "green",
  () => say(m.judge(measure(cutOnce).summary, "cut", null, m.straddlingPairs(times(), ON_A_FRAME))));
add("the same cut in a moving range", "red: cutEvents", verdict(cutOnce, "moving", null));
add("the same cut in a held range", "red: cutEvents", verdict(cutOnce, "held", null));
add("a cut range with no cut", "red: cutEvents",
  verdict(smooth, "cut", null, { cutPairs: [CUT_PAIR] }));
add("the pairs that straddle an instant: between two frames, and on a frame",
  `${CUT_PAIR}; ${CUT_PAIR},${CUT_PAIR + 1}`,
  () => [BETWEEN, ON_A_FRAME].map((at) => m.straddlingPairs(times(), at).join(",")).join("; "));
add("a cut range whose cut is on another pair", "red: cutEvents",
  verdict(sequence(cutAt(CUT_PAIR - 10)), "cut", null,
    { cutPairs: m.straddlingPairs(times(), BETWEEN) }));
add("the pair each mark falls in: between two frames, on a frame, outside them",
  "4; 9; none", () => [4.5 / FPS, 10 / FPS, FRAMES / FPS + 1]
    .map((at) => m.markedPairs(times(), [at]).join(",") || "none").join("; "));
add("a cut range with two cuts", "red: cutEvents",
  verdict(cutTwice, "cut", null, { cutPairs: [CUT_PAIR] }));
add("a cut-weight step on the pair a seam is there to judge",
  "no cut events, 1 seam event, green", () => {
    const { summary } = measure(cutOnce, { seams: [CUT_PAIR] });
    return `${summary.cutEvents.length ? "cut events" : "no cut events"}, `
      + `${summary.seamEvents.length} seam event, ${say(m.judge(summary, "moving", BUDGET))}`;
  });
add("the same step with the seam on another pair", "red: cutEvents",
  () => say(m.judge(measure(cutOnce, { seams: [CUT_PAIR + 1] }).summary, "moving", BUDGET)));
const FADE_FRAMES = 50;
const fadeIntoNext = sequence((i, fill) =>
  fill(ALL, i === FADE_FRAMES - 1 ? 200 : 200 - STEP * i), FADE_FRAMES);
add("a fade whose last frame is the next passage's, across a seam (not a dip, not a cut)",
  "green", verdict(fadeIntoNext, "moving", BUDGET, { seams: [FADE_FRAMES - 2] }));
add("the same fade and the same frame with no seam there", "red: cutEvents, dipDepth",
  verdict(fadeIntoNext, "moving", BUDGET));
add("a still sequence in a held range (a hold is excused the still metrics)", "green",
  verdict(still, "held", BUDGET));
add("the same still sequence in a moving range", "red: stillShare, longestStillRunS",
  verdict(still, "moving", BUDGET));

const last = smooth[smooth.length - 1];
const drifted = (by) => frame((fill) => {
  ramp(FRAMES - 1, fill);
  fill(PATCH, GROUND + by);
});
add("a control that drifted past the still level", "INCONCLUSIVE: control",
  () => say(m.judge(measure(smooth).summary, "moving", BUDGET, null,
    redrawDelta(last, drifted(T.STILL_DELTA + 3)))));
add("a drifting control over a sequence that is also red (the control comes first)",
  "INCONCLUSIVE: control",
  () => say(m.judge(measure(stuttered).summary, "moving", BUDGET, null,
    redrawDelta(last, drifted(T.STILL_DELTA + 3)))));
add("a control that moved by the still level and no more", "green",
  () => say(m.judge(measure(smooth).summary, "moving", BUDGET, null,
    redrawDelta(last, drifted(T.STILL_DELTA)))));

/** One pair in which a patch arrives far brighter than another one fades:
 *  the largest step is the arrival, and the fall is the fade and not it. */
const ARRIVE = 150;
const FADE = 70;
const arriveAndFade = [
  frame((fill) => fill(RAMP, GROUND + FADE)),
  frame((fill) => { fill(RAMP, GROUND); fill(PATCH, GROUND + ARRIVE); }),
];
add("a pair where one patch arrives and another fades (the fall is signed: "
  + "an arrival is never one, however large)",
  `step ${ARRIVE}, fall ${FADE}, summary fall ${FADE}`, () => {
    const got = measure(arriveAndFade);
    return `step ${got.pairs[0].maxDelta}, fall ${got.pairs[0].maxFall}, `
      + `summary fall ${got.summary.maxPixelFall}`;
  });
add("the same pair run backwards (the arrival is now the fall)",
  `fall ${ARRIVE}`, () => `fall ${measure([...arriveAndFade].reverse()).pairs[0].maxFall}`);
add("a fall outside the crop is not the crop's",
  `frame ${FADE}, crop 0`, () => {
    const got = measure(arriveAndFade, { crop: { x0: 32, y0: 32, x1: W, y1: H } });
    return `frame ${got.summary.maxPixelFall}, crop ${got.court.maxPixelFall}`;
  });

add("a fall inside the crop is the crop's as well as the frame's",
  `frame ${FADE}, crop ${FADE}`, () => {
    const got = measure(arriveAndFade, { crop: { x0: 0, y0: 0, x1: 32, y1: 32 } });
    return `frame ${got.summary.maxPixelFall}, crop ${got.court.maxPixelFall}`;
  });
/** Three pairs whose deepest fall is the middle one: a summary that kept the
 *  first pair's fall, or the last, would answer one of the shallow ones. */
const SHALLOW = 20;
const fallsInTheMiddle = [
  frame((fill) => fill(RAMP, GROUND + FADE + 2 * SHALLOW)),
  frame((fill) => fill(RAMP, GROUND + FADE + SHALLOW)),
  frame((fill) => fill(RAMP, GROUND + SHALLOW)),
  frame((fill) => fill(RAMP, GROUND)),
];
add("the deepest fall of a sequence is the deepest of its pairs, wherever it lies",
  `pairs ${SHALLOW},${FADE},${SHALLOW}; summary ${FADE}`, () => {
    const got = measure(fallsInTheMiddle);
    return `pairs ${got.pairs.map((p) => p.maxFall).join(",")}; summary ${got.summary.maxPixelFall}`;
  });

add("a flash inside the crop, one pixel under the frame's minimum and then on it "
  + "(a crop is held to the whole frame's share, not to its own)",
  "full frame green; crop green; full frame red: flickerHighFrameShare; "
  + "crop red: flickerHighFrameShare", () => [MIN_PX - 1, MIN_PX].map((n) => {
    const inside = { x0: 16, y0: 20, x1: 16 + n, y1: 21 };
    const { summary, court } = measure(flashOn(inside, HIGH_DEPTH),
      { crop: { x0: 0, y0: 0, x1: 32, y1: 32 } });
    return `full frame ${say(m.judge(summary, "moving", BUDGET))}; `
      + `crop ${say(m.judge(court, "moving", BUDGET))}`;
  }).join("; "));
add("a flash outside the crop", "full frame red: flickerHighFrameShare; crop green", () => {
  const { summary, court } = measure(highFlash, { crop: { x0: 0, y0: 0, x1: 32, y1: 32 } });
  return `full frame ${say(m.judge(summary, "moving", BUDGET))}; `
    + `crop ${say(m.judge(court, "moving", BUDGET))}`;
});

add("a straddle pair in which a patch gets darker",
  "16 px changed, 16 fell, by 20, in 40,40..44,44", () => {
    const a = frame((fill) => fill(PATCH, GROUND + 20));
    const f = m.fallStats(a, frame(() => {}), W);
    return `${f.changedPx} px changed, ${f.fellPx} fell, by ${f.maxFall}, `
      + `in ${f.box.x0},${f.box.y0}..${f.box.x1},${f.box.y1}`;
  });
add("a straddle pair in which ink only arrives", "16 px changed, 0 fell", () => {
  const f = m.fallStats(frame(() => {}), frame((fill) => fill(PATCH, GROUND + 20)), W);
  return `${f.changedPx} px changed, ${f.fellPx} fell`;
});

// --- budgets ---------------------------------------------------------------------
const FP = fingerprintOf(T);
const SURFACE = { name: "laptop", width: W, height: H, dpr: 1, backingWidth: W, backingHeight: H };

/** A row as the page reports one, from a synthetic sequence. */
function rowOf(range, frames, expect, extra = {}) {
  const { summary, pairs } = measure(frames);
  return {
    range,
    mode: range.split(".")[0],
    expect,
    reportOnly: false,
    control: CONTINUITY_CONTROLS.includes(range),
    frames: frames.length,
    marks: 0,
    summary,
    controlDraw: { identical: true, channels: 0, maxDelta: 0 },
    perFrame: {
      t: times(frames.length),
      hash: frames.map((_, i) => `h${i}`),
      mean: [0, ...pairs.map((p) => p.mean)],
      changedPx: [null, ...pairs.map((p) => p.changedPx)],
      energy: [null, ...pairs.map((p) => p.energy)],
    },
    ...extra,
  };
}

const controlRows = () => [
  rowOf("plate.cut", cutOnce, "cut", { cutPairs: [CUT_PAIR] }),
  rowOf("plate.close", smooth, "moving"),
];
const reportOf = (rows, extra = {}) => ({
  probe: "continuity", surface: SURFACE, backing: { width: W, height: H }, fps: FPS,
  crop: null, pairs: null, view: "shared", display: "near", thresholds: T,
  rasterisation: "accelerated", rows, ...extra,
});

const frozenReport = reportOf([rowOf("hand.one.draw", frozen, "moving")]);
const frozenEntry = entryFrom(frozenReport.rows[0], frozenReport, m);
const onFile = withEntry(emptyBudgets(FP), frozenEntry, FP).file;
const stutterReport = reportOf([rowOf("hand.one.draw", stuttered, "moving")]);
const judgedAs = (report, file, fp) => {
  const [j] = judgeRows(report, budgetsInForce(file, fp), m);
  return `${say(j)} [${j.status}]`;
};

const PAIRS = FRAMES - 1;
add("headroom on a share of pairs: times its factor, rounded up, and never less than one pair",
  "0.25, 0.126, 0.017",
  () => [0.2, 0.1001, 0].map((x) => withHeadroom("stillShare", x, FPS, PAIRS)).join(", "));
add("headroom on a depth that was achieved at nothing: one rounding step, not nothing", "0.001",
  () => String(withHeadroom("dipDepth", 0, FPS, PAIRS)));
add("a share whose bound would reach one is left unjudged; a ratio's is not", "null, 1.063",
  () => `${withHeadroom("stillShare", 0.85, FPS, PAIRS)}, ${withHeadroom("markStepRatio", 0.85, FPS, PAIRS)}`);
add("headroom on a count: one more frame", "13 frames",
  () => `${Math.round(withHeadroom("longestStillRunS", 12 / FPS, FPS) * FPS)} frames`);
add("a budget entry carries plain fields only",
  "range, fps, surface, backing, crop, achieved, budget, headroom; strings: range, surface, crop", () => {
    const strings = Object.entries(frozenEntry).filter(([, v]) => typeof v === "string").map(([k]) => k);
    return `${Object.keys(frozenEntry).join(", ")}; strings: ${strings.join(", ")}`;
  });
add("a budget, applied to a run that breaks it", "red: stillShare [budgeted]",
  () => judgedAs(stutterReport, onFile, FP));
add("a budget taken from a clean run, against the same run with a few pixels a level off "
  + "for one frame", "green [budgeted]", () => {
  const clean = reportOf([rowOf("hand.one.draw", smooth, "moving")]);
  const file = withEntry(emptyBudgets(FP), entryFrom(clean.rows[0], clean, m), FP).file;
  const off = sequence((i, fill) => {
    ramp(i, fill);
    if (i === FLASH_AT) fill(few(4), GROUND - 1);
  });
  return judgedAs(reportOf([rowOf("hand.one.draw", off, "moving")]), file, FP);
});
add("the thresholds fingerprint moves with a value and not with the order they are written in",
  "a value changed: another; reordered: the same; a file under the other: void, 0 applied", () => {
    const moved = fingerprintOf({ ...T, STILL_DELTA: T.STILL_DELTA + 1 });
    const reordered = fingerprintOf(Object.fromEntries(Object.entries(T).reverse()));
    const force = budgetsInForce({ ...onFile, thresholds: moved }, FP);
    return `a value changed: ${moved === FP ? "the same" : "another"}; `
      + `reordered: ${reordered === FP ? "the same" : "another"}; `
      + `a file under the other: ${force.void ? "void" : "in force"}, ${force.entries.length} applied`;
  });
add("the same budget under another thresholds fingerprint is not applied", "green [void]",
  () => judgedAs(stutterReport, onFile, `${FP}-other`));
add("the same budget at another cadence is not this run's budget", "green [unbudgeted]",
  () => judgedAs({ ...stutterReport, fps: FPS / 2 }, onFile, FP));
add("nor on another surface", "green [unbudgeted]",
  () => judgedAs({ ...stutterReport, surface: { ...SURFACE, name: "probe" } }, onFile, FP));
add("a report-only range with an entry on file under its name is still never budgeted",
  "green [report-only]",
  () => judgedAs(reportOf([{ ...stutterReport.rows[0], reportOnly: true }]), onFile, FP));
const unjudgedAs = (report, file) => {
  const all = reportOf([...report.rows, ...controlRows()], {
    view: report.view, display: report.display, backing: report.backing,
  });
  const inForce = budgetsInForce(file, FP);
  const judged = judgeRows(all, inForce, m);
  return `${say(judged[0])} [${judged[0].status}]; `
    + `assertion ${assertion(all, judged, inForce).passed ? "passes" : "fails"}`;
};
add("a budget taken on the court crop, against a run that took no crop",
  "green [unjudged]; assertion fails",
  () => unjudgedAs(stutterReport, { ...onFile, entries: [{ ...frozenEntry, crop: "court" }] }));
add("a budget against a run on another size of backing under the same surface name",
  "green [unjudged]; assertion fails",
  () => unjudgedAs({ ...stutterReport, backing: { width: W * 2, height: H } }, onFile));
add("a budget against a run drawn on a View per target", "green [unjudged]; assertion fails",
  () => unjudgedAs({ ...stutterReport, view: "fresh" }, onFile));
add("a budget against a run of the room display", "green [unjudged]; assertion fails",
  () => unjudgedAs({ ...stutterReport, display: "room" }, onFile));
add("a budget that bounds only stillness, against a range that has since become a hold",
  "green [unjudged]; assertion fails", () => {
    const only = entryFrom(frozenReport.rows[0], frozenReport, m, ["stillShare"]);
    const hold = reportOf([{ ...stutterReport.rows[0], expect: "held" }]);
    return unjudgedAs(hold, withEntry(emptyBudgets(FP), only, FP).file);
  });
add("a write that loosens an entry, without a ruling", "refused", () => {
  const looser = entryFrom(stutterReport.rows[0], stutterReport, m);
  return withEntry(onFile, looser, FP).refused ? "refused" : "written";
});
add("the same write with a ruling", "written, ruled: true", () => {
  const looser = entryFrom(stutterReport.rows[0], stutterReport, m);
  const done = withEntry(onFile, looser, FP, { ruling: true });
  return done.refused ? "refused" : `written, ruled: ${done.file.entries[0].ruled}`;
});
add("the loosened budget written a second time, with no ruling, keeps the record of the first",
  "written, ruled: true", () => {
    const looser = entryFrom(stutterReport.rows[0], stutterReport, m);
    const ruled = withEntry(onFile, looser, FP, { ruling: true }).file;
    const again = withEntry(ruled, looser, FP);
    return again.refused ? "refused" : `written, ruled: ${again.file.entries[0].ruled}`;
  });
add("a write that tightens an entry", "written, ruled: undefined", () => {
  const smoothReport = reportOf([rowOf("hand.one.draw", smooth, "moving")]);
  const done = withEntry(onFile, entryFrom(smoothReport.rows[0], smoothReport, m), FP);
  return done.refused ? "refused" : `written, ruled: ${done.file.entries[0].ruled}`;
});
add("a rewrite that drops fields loosens each field it drops",
  "longestStillRunSMax, flickerLowFrameShareMax, flickerHighFrameShareMax, dipDepthMax",
  () => loosens(frozenEntry, entryFrom(frozenReport.rows[0], frozenReport, m, ["stillShare"]))
    .map((why) => why.split(" ")[0]).join(", "));
add("a rewrite on another crop, or another size of backing, is a loosening each", "1, 1",
  () => [{ crop: "court" }, { backing: { width: W * 2, height: H } }]
    .map((other) => loosens(frozenEntry, { ...frozenEntry, ...other }).length).join(", "));
add("a write into a file taken under other thresholds", "refused",
  () => (withEntry({ ...onFile, thresholds: `${FP}-other` }, frozenEntry, FP).refused
    ? "refused" : "written"));
add("an authored hold is budgeted on nothing that asks whether it moved",
  "stillShareMax: null, longestStillRunSMax: null", () => {
    const report = reportOf([rowOf("plate.hold", still, "held")]);
    const { budget } = entryFrom(report.rows[0], report, m);
    return `stillShareMax: ${budget.stillShareMax}, longestStillRunSMax: ${budget.longestStillRunSMax}`;
  });
add("an entry that would judge no field is not written", "refused", () => {
  const report = reportOf([rowOf("plate.hold", still, "held")]);
  const entry = entryFrom(report.rows[0], report, m, ["stillShare"]);
  return withEntry(emptyBudgets(FP), entry, FP).refused ? "refused" : "written";
});

// --- where a budget may be taken from ---------------------------------------------
const goodReport = () => reportOf([rowOf("hand.one.draw", smooth, "moving"), ...controlRows()]);
const source = (report, range = "hand.one.draw") => {
  const found = budgetSourceProblems(report, range, m, FP);
  return found.length ? `refused: ${found.length}` : "fit";
};
add("a budget's source: the gallery's condition, both controls good", "fit",
  () => source(goodReport()));
add("a source drawn on a View per target", "refused: 1",
  () => source({ ...goodReport(), view: "fresh" }));
add("a source of the room display", "refused: 1",
  () => source({ ...goodReport(), display: "room" }));
add("a source drawn on the software rasteriser", "refused: 1",
  () => source({ ...goodReport(), rasterisation: "software (willReadFrequently), pinned" }));
add("a source taken without its controls", "refused: 2",
  () => source(reportOf([rowOf("hand.one.draw", smooth, "moving")])));
add("a source whose cut control saw no cut", "refused: 1", () => source(reportOf([
  rowOf("hand.one.draw", smooth, "moving"),
  rowOf("plate.cut", smooth, "cut", { cutPairs: [CUT_PAIR] }), controlRows()[1],
])));
add("a source in which the range itself is red on structure", "refused: 1",
  () => source(reportOf([rowOf("hand.one.draw", cutOnce, "moving"), ...controlRows()])));
add("a source whose range measured nothing", "refused: 1", () => source(reportOf([
  rowOf("hand.one.draw", smooth, "moving",
    { controlDraw: { identical: false, channels: 300, maxDelta: T.STILL_DELTA + 1 } }),
  ...controlRows(),
])));
add("a source taken under other thresholds", "refused: 1",
  () => source({ ...goodReport(), thresholds: { ...T, STILL_DELTA: T.STILL_DELTA + 1 } }));
add("a source that does not hold the range, and one that holds it report-only",
  "refused: 1, refused: 1", () => [
    source(goodReport(), "hand.game"),
    source(reportOf([{ ...goodReport().rows[0], reportOnly: true }, ...controlRows()])),
  ].join(", "));

// --- the assertion -----------------------------------------------------------------
const FAILING = ["red", "inconclusive", "unjudged", "voidBudgets", "missingControls"];
const asserted = (rows, file = emptyBudgets(FP), fp = FP) => {
  const report = reportOf(rows);
  const inForce = budgetsInForce(file, fp);
  const a = assertion(report, judgeRows(report, inForce, m), inForce);
  if (a.passed) return `passes${a.unbudgeted.length ? `, ${a.unbudgeted.length} unbudgeted listed` : ""}`;
  return `fails: ${FAILING.filter((k) => a[k].length).join(", ")}`;
};
add("asserted: both controls good and an unbudgeted range", "passes, 3 unbudgeted listed",
  () => asserted([rowOf("hand.one.draw", smooth, "moving"), ...controlRows()]));
add("asserted: a run without its controls", "fails: missingControls",
  () => asserted([rowOf("hand.one.draw", smooth, "moving")]));
add("asserted: the cut control sees no cut", "fails: red",
  () => asserted([rowOf("plate.cut", smooth, "cut", { cutPairs: [CUT_PAIR] }), controlRows()[1]]));
add("asserted: the close control sees a cut", "fails: red",
  () => asserted([controlRows()[0], rowOf("plate.close", cutOnce, "moving")]));
add("asserted: a range whose control drifted", "fails: inconclusive", () => asserted([
  rowOf("hand.one.draw", smooth, "moving",
    { controlDraw: { identical: false, channels: 300, maxDelta: T.STILL_DELTA + 1 } }),
  ...controlRows(),
]));
add("asserted: a clean run with budgets on file that the thresholds have voided",
  "fails: voidBudgets",
  () => asserted([rowOf("hand.one.draw", smooth, "moving"), ...controlRows()], onFile, `${FP}-other`));
add("asserted: a void file that lists no budget voids nothing", "passes, 3 unbudgeted listed",
  () => asserted([rowOf("hand.one.draw", smooth, "moving"), ...controlRows()],
    emptyBudgets(`${FP}-other`)));
add("asserted: what is listed beside the verdict - a seam step whose seam range was not taken, "
  + "and a budget whose range was not", "seams: plate.close -> plate.seam.window-exit; budgets: hand.one.draw",
() => {
  const close = rowOf("plate.close", smooth, "moving", { seam: "plate.seam.window-exit" });
  close.summary = { ...close.summary, seamEvents: [PAIRS - 1] };
  const report = reportOf([controlRows()[0], close]);
  const inForce = budgetsInForce(onFile, FP);
  const a = assertion(report, judgeRows(report, inForce, m), inForce);
  return `seams: ${a.seamsNotTaken.join(", ")}; budgets: ${a.budgetsNotTaken.join(", ")}`;
});

// --- asked against got ----------------------------------------------------------------
const problems = (report, flags, switches = []) => {
  const found = sweepProblems(report, flags, "continuity", CONTINUITY_CONTROLS, switches);
  return found.length ? `${found.length} problem(s)` : "believed";
};
const ASKED = { range: "hand.one.draw" };
add("a report of the run that was asked for", "believed", () => problems(goodReport(), ASKED));
add("a page that ignored --surface", "1 problem(s)",
  () => problems(goodReport(), { ...ASKED, surface: "overview" }));
add("a page that ignored --fps", "1 problem(s)",
  () => problems(goodReport(), { ...ASKED, fps: String(FPS / 2) }));
add("a page that ignored --crop", "1 problem(s)",
  () => problems(goodReport(), { ...ASKED, crop: "court" }));
add("a page that says it cropped and carries no cropped summary", "1 problem(s)",
  () => problems(reportOf(goodReport().rows, { crop: "court" }), { ...ASKED, crop: "court" }));
add("a page that ignored --pairs", "1 problem(s)",
  () => problems(goodReport(), { ...ASKED, pairs: "marks" }));
add("a page that says it took pairs and carries none for a marked range", "1 problem(s)", () => {
  const rows = [rowOf("plate.game", smooth, "moving", { marks: 2 }), ...controlRows()];
  return problems(reportOf(rows, { pairs: "marks", straddle: { rows: [] } }),
    { range: "plate.game", pairs: "marks" });
});
add("a report that states no surface", "1 problem(s)",
  () => problems(reportOf(goodReport().rows, { surface: undefined }), ASKED));
add("a report without a control that was asked for", "1 problem(s)",
  () => problems(reportOf(goodReport().rows.slice(0, 2)), ASKED));
add("a report with a range nobody asked for", "1 problem(s)",
  () => problems(reportOf([...goodReport().rows, rowOf("hand.game", smooth, "moving")]), ASKED));
add("a row with fewer frames listed than it states", "1 problem(s)", () => {
  const report = goodReport();
  report.rows[0].perFrame.t.pop();
  return problems(report, ASKED);
});
add("a page that ignored --display", "1 problem(s)",
  () => problems(goodReport(), { ...ASKED, display: "room" }));
add("a page that ignored --view", "1 problem(s)",
  () => problems(goodReport(), { ...ASKED, view: "fresh" }));
add("a page that ignored --exact", "1 problem(s)", () => problems(goodReport(), ASKED, ["exact"]));
add("a page that pinned the canvas when nobody asked", "1 problem(s)",
  () => problems(reportOf(goodReport().rows, { rasterisation: "software, pinned" }), ASKED));
add("a report that states no rasteriser", "1 problem(s)",
  () => problems(reportOf(goodReport().rows, { rasterisation: undefined }), ASKED));
add("a page that answered as another probe", "1 problem(s)",
  () => problems(reportOf(goodReport().rows, { probe: "purity" }), ASKED));
add("asked by hand, a row drawn by another hand", "1 problem(s)",
  () => problems(goodReport(), { mode: "plate" }));
add("a range reported twice", "1 problem(s)",
  () => problems(reportOf([goodReport().rows[0], ...goodReport().rows]), ASKED));
add("a control row that does not say it is one", "1 problem(s)", () => {
  const report = goodReport();
  report.rows[1].control = false;
  return problems(report, ASKED);
});
add("a row with no control draw", "1 problem(s)", () => {
  const report = goodReport();
  delete report.rows[0].controlDraw;
  return problems(report, ASKED);
});
add("pairs asked of a run in which no range carries a mark", "1 problem(s)",
  () => problems(reportOf(goodReport().rows, { pairs: "marks", straddle: { rows: [] } }),
    { ...ASKED, pairs: "marks" }));

// The perf probe's surface and pace, held the same way. A report from before
// either could be set states neither, and is the first forgery here.
const PACE_MS = 13;
const PERF_SURFACE = { name: "laptop", width: W, height: H, dpr: 1 };
const perfReport = (extra = {}, row = {}) => ({
  probe: "perf",
  sweep: "range",
  surface: PERF_SURFACE,
  pace: PACE_MS,
  visibilityState: "visible",
  rows: [{ mode: "plate", beat: "plate.hand-over", range: "plate.hand-over", ...row }],
  ...extra,
});
const olderPerfReport = () => {
  const { pace: _pace, visibilityState: _seen, surface, ...rest } = perfReport();
  const { name: _name, ...unnamed } = surface;
  return { ...rest, surface: unnamed };
};
const perfProblems = (report, flags) => {
  const found = perfSweepProblems(report, { range: "plate.hand-over", ...flags });
  return found.length ? `${found.length} problem(s)` : "believed";
};
const PACED = { pace: String(PACE_MS), surface: "laptop" };
const BY_FRAME = { pace: "raf" };
add("a perf report of the pace and the surface asked for", "believed",
  () => perfProblems(perfReport(), PACED));
add("a perf page that reads neither --pace nor --surface, each asked alone",
  "1 problem(s), 1 problem(s)", () => [
    perfProblems(olderPerfReport(), { pace: PACED.pace }),
    perfProblems(olderPerfReport(), { surface: PACED.surface }),
  ].join(", "));
add("a perf page that ran its frames back to back under --pace", "1 problem(s)",
  () => perfProblems(perfReport({ pace: null }), PACED));
add("a perf page that kept another pace", "1 problem(s)",
  () => perfProblems(perfReport({ pace: PACE_MS + 1 }), PACED));
add("a perf page that waited on a timer when asked for animation frames", "1 problem(s)",
  () => perfProblems(perfReport(), BY_FRAME));
add("a paced perf run on a page that was hidden", "1 problem(s)",
  () => perfProblems(perfReport({ visibilityState: "hidden" }), PACED));
add("a paced perf run that does not say whether the page was visible", "1 problem(s)",
  () => perfProblems(perfReport({ visibilityState: undefined }), PACED));
add("a perf run paced by animation frames, with and without its intervals",
  "believed, 1 problem(s)", () => [
    perfProblems(perfReport({ pace: "raf" }, { intervalModalMs: PACE_MS }), BY_FRAME),
    perfProblems(perfReport({ pace: "raf" }), BY_FRAME),
  ].join(", "));
add("a perf page that drew on another surface", "1 problem(s)",
  () => perfProblems(perfReport(), { ...PACED, surface: "probe" }));

const RESIDENT = { resident: ["points"], missing: [], errors: [] };
const captured = (report, pageErrors = []) => {
  const found = captureProblems({ report, pageErrors }, ASKED, CONTINUITY_CONTROLS);
  return found.length ? `${found.length} problem(s)` : "believed";
};
add("a capture whose assets were resident", "believed",
  () => captured({ ...goodReport(), residency: RESIDENT }));
add("a capture with no residency block", "1 problem(s)", () => captured(goodReport()));
add("a capture whose assets never became resident", "1 problem(s)",
  () => captured({ ...goodReport(), residency: { ...RESIDENT, missing: ["game"] } }));
add("a capture whose page threw", "1 problem(s)",
  () => captured({ ...goodReport(), residency: RESIDENT }, ["an uncaught error"]));
add("a capture with no rows", "1 problem(s)",
  () => captured({ ...goodReport(), residency: RESIDENT, rows: [] }));

const refusals = (kind, flags, bools = []) => {
  const found = flagProblems(kind, { flags, bools: new Set(bools) });
  return found.length ? `refused: ${found.length}` : "accepted";
};
add("purity given --surface", "refused: 1", () => refusals("purity", { surface: "laptop" }));
add("perf given --assert-continuity", "refused: 1", () => refusals("perf", {}, ["assert-continuity"]));
add("continuity given --samples", "refused: 1", () => refusals("continuity", { samples: "3" }));
add("purity and continuity given --pace", "refused: 1, refused: 1", () => [
  refusals("purity", { pace: PACED.pace }), refusals("continuity", { pace: PACED.pace }),
].join(", "));
add("perf given a pace that is not one: a word, nothing, a wait backwards, a wait past the longest",
  "refused: 1, refused: 1, refused: 1, refused: 1", () => [
    refusals("perf", { pace: "fast" }), refusals("perf", { pace: "0" }),
    refusals("perf", { pace: "-13" }), refusals("perf", { pace: "13000" }),
  ].join(", "));
add("perf given a surface it does not have", "refused: 1",
  () => refusals("perf", { surface: "phone" }));
add("perf given a surface and either pace", "accepted, accepted", () => [
  refusals("perf", { range: "plate.hand-over", warmup: "0", ...PACED }),
  refusals("perf", { surface: "overview", ...BY_FRAME }),
].join(", "));
add("continuity given a surface it does not have", "refused: 1",
  () => refusals("continuity", { surface: "phone" }));
add("--write-budget without --from", "refused: 1",
  () => refusals("continuity", { "write-budget": "hand.one.draw" }));
add("--from beside a flag that shapes a capture", "refused: 1",
  () => refusals("continuity", { from: "some-verdict", range: "plate.cut" }));
add("a cadence that is not one, a crop and a kind of pair the probe does not have",
  "refused: 1, refused: 1, refused: 1, refused: 1", () => [
    refusals("continuity", { fps: "fast" }), refusals("continuity", { fps: "0" }),
    refusals("continuity", { crop: "plate" }), refusals("continuity", { pairs: "all" }),
  ].join(", "));
add("--ruling with nothing to rule on", "refused: 1", () => refusals("continuity", {}, ["ruling"]));
add("--init-budgets beside --from", "refused: 1",
  () => refusals("continuity", { from: "some-verdict" }, ["init-budgets"]));
add("an ordinary continuity run's flags", "accepted",
  () => refusals("continuity", { range: "plate.game", crop: "court", pairs: "marks", fps: "30" },
    ["no-control"]));

add("two verdicts of one build, a hash apart", "0 hashes moved is not required: 1 moved, mean unmoved",
  () => {
    const before = goodReport();
    const after = goodReport();
    after.rows[0].perFrame.hash[5] = "other";
    const [c] = compareContinuity(before, after);
    return `0 hashes moved is not required: ${c.hashesMoved} moved, `
      + `mean ${c.maxMeanDelta === 0 ? "unmoved" : "moved"}`;
  });

const against = (other) => {
  const [c] = compareContinuity(goodReport(), reportOf(goodReport().rows, other));
  return c.comparable ? "compared" : "not comparable";
};
add("two verdicts taken alike are laid frame against frame", "compared", () => against({}));
add("two verdicts of one picture taken under different thresholds "
  + "(frames compared, summaries not: a share that moved would be the instrument's doing)",
"compared, summaries laid side by side; compared, summaries withheld", () => [
  {}, { thresholds: { ...T, FLICKER_MIN_SHARE: T.FLICKER_MIN_SHARE * 2 } },
].map((other) => {
  const [c] = compareContinuity(goodReport(), reportOf(goodReport().rows, other));
  return `${c.comparable ? "compared" : "not comparable"}, summaries `
    + `${c.summary === null ? "withheld" : "laid side by side"}`;
}).join("; "));
add("not a verdict on another surface, of another display, on another View arrangement, "
  + "or pinned against accelerated",
"not comparable, not comparable, not comparable, not comparable", () => [
  against({ surface: { ...SURFACE, name: "probe" } }), against({ display: "room" }),
  against({ view: "fresh" }), against({ rasterisation: "software (willReadFrequently), pinned" }),
].join(", "));

const perfAgainst = (a, b) => (perfComparable(a, b) ? "compared" : "not comparable");
add("a perf verdict from before the surface and the pace were stated, against one that "
  + "states the defaults", "compared",
() => perfAgainst(olderPerfReport(), perfReport({ pace: null, surface: { ...PERF_SURFACE, name: "probe" } })));
add("not a paced perf verdict against an unpaced one, one pace against another, a timer "
  + "against animation frames, or two surfaces of one size",
"not comparable, not comparable, not comparable, not comparable", () => [
  perfAgainst(perfReport(), perfReport({ pace: null })),
  perfAgainst(perfReport(), perfReport({ pace: PACE_MS + 1 })),
  perfAgainst(perfReport(), perfReport({ pace: "raf" })),
  perfAgainst(perfReport(), perfReport({ surface: { ...PERF_SURFACE, name: "overview" } })),
].join(", "));
add("not an older perf verdict against a paced one", "not comparable",
  () => perfAgainst(olderPerfReport(), perfReport({ surface: { ...PERF_SURFACE, name: "probe" } })));

// --- run ---------------------------------------------------------------------------
let failed = 0;
for (const c of cases) {
  let got;
  try {
    got = c.got();
  } catch (e) {
    got = `threw: ${e instanceof Error ? e.message : e}`;
  }
  const ok = got === c.expected;
  if (!ok) failed++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${c.name} -> ${c.expected}${ok ? "" : `\n          got: ${got}`}`);
}
if (failed) {
  console.error(`continuity self-test: ${failed} of ${cases.length} case(s) FAILED`);
  process.exit(1);
}
console.log(`continuity self-test: ${cases.length} cases, each as expected`);
