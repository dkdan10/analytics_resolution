/** What it means for a passage to move well, as arithmetic on consecutive frames.
 *
 * Purity asks whether one frame is the same frame however it was reached. It
 * cannot ask whether a passage MOVES well, because that is a property of the
 * frames beside each other: a line that sits and then jumps, a stroke that
 * flashes as it dries, a field that dips while one season hands over to the
 * next are each a run of individually correct frames. This file is the
 * definition of those faults, and nothing else.
 *
 * NO DOM AND NO IMPORTS, so the same file is read by the page that captures
 * the frames and by the Node script that proves each definition can fail. A
 * definition that only ever ran in a browser, on the piece, could not be told
 * from one that passes whatever it is shown.
 *
 * EVERY EVENT TEST CARRIES A MAGNITUDE. Counting changed pixels alone is how a
 * synchronised rounding step in a continuous fade came to be read as an event:
 * a great many pixels each moving by the least a channel can move. So a still
 * pair is still by how far its furthest channel went, a flicker has a depth, a
 * cut is weighed per changed pixel, and nothing here is flagged for being
 * numerous.
 *
 * WHAT IS JUDGED AND WHAT IS ONLY REPORTED. `judge` reads the cut events, which
 * are structural and always on, and the six quantities a `Budget` can bound.
 * Everything else `summarize` returns is there to be read beside them.
 */

/**
 * Every level, window and share the metrics use, in one object so that it can
 * be fingerprinted: a budget is a statement about these definitions, and one
 * taken under other values is a statement about a different instrument.
 */
export const THRESHOLDS = {
  /** The furthest any channel may move in a pair that still counts as still,
   *  and the most a redrawn control may differ before its range has measured
   *  nothing. An accelerated canvas moves a channel by about this much between
   *  two draws of one instant, so below it there is nothing to see or say. */
  STILL_DELTA: 2,
  /** Report-only: the summed channel change above which a pixel is said to
   *  have jumped, and how many such pixels make a pair a jump pair. */
  JUMP_SUMMED_DELTA: 6,
  JUMP_MIN_PX: 8,
  /** The two depths of flicker, in levels of a pixel's brightest channel. The
   *  low one is for a body stroke falling from its wet register to its dried
   *  one, which the high one alone would walk past; the high one is a flash
   *  nobody could take for drying. They are bands, not nested: a pixel counts
   *  in the deepest band its excursion reaches. BRIGHTNESS ONLY: a pixel that
   *  changes hue and back while its brightest channel holds its level is not
   *  a flicker here, and shows only in the energy of the two pairs. */
  FLICKER_LOW_LEVEL: 12,
  FLICKER_HIGH_LEVEL: 48,
  /** How soon the way back has to follow the way out for the two to be one
   *  flicker and not two things that happened to the same pixel. */
  FLICKER_WINDOW_S: 0.25,
  /** How much of the whole frame has to flicker in one pair for the pair to
   *  count. A share and not a count, so that one surface's figure means the
   *  same on another; and of the WHOLE frame even when the figures are a
   *  crop's, because a patch of flicker is as large to the eye whichever
   *  region it is being counted in. It stands above what lettering does: a
   *  numeral struck into the floor, or one travelling, is a small block of
   *  pixels going out and coming back by design, pair after pair, and a
   *  minimum of a handful of pixels called every such passage a flickering
   *  one. The largest lettering holds about half of this, and a passage where
   *  marks visibly pop holds several times it in its worse pairs. It costs
   *  one reading: where a passage's deep flicker comes in patches smaller
   *  than a numeral, as the hand's game does, the deep band reads nothing
   *  and the passage is caught by the shallow band alone - no share can
   *  count the one patch and pass over the other. */
  FLICKER_MIN_SHARE: 0.001,
  /** A cut: the mean summed channel change per CHANGED pixel, and the share of
   *  the frame that changed. Both, because a rounding cascade is wide and
   *  shallow, and ink arriving - a stroke end, a whole stroke laid wet - is
   *  deep and narrow, and only a cut is wide and deep at once. The first is a
   *  sum over the colour channels, so a neutral fade reaches it at a third of
   *  its value per channel: a wide fade that fast is a cut on every pair. */
  CUT_PER_CHANGED: 12,
  CUT_MIN_SHARE: 0.1,
} as const;

/** Half-open, in device pixels: the low edges are inside, the high ones not. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

type Bytes = Uint8ClampedArray | Uint8Array;

/** One pair of consecutive frames, over one region of them. */
export interface PairStat {
  /** Pixels with any colour channel different. */
  changedPx: number;
  /** `changedPx` over the region's pixel count. */
  changedShare: number;
  /** Summed colour-channel change over the whole region, per pixel. */
  energy: number;
  /** The same sum per CHANGED pixel: how hard the pixels that moved, moved. */
  perChanged: number;
  /** The furthest any one channel moved. */
  maxDelta: number;
  /** The furthest any one pixel's brightest channel FELL. A mark arriving is
   *  a rise and is the piece moving; a deep fall in one pair is ink taken
   *  away faster than anything dries. */
  maxFall: number;
  jumpPx: number;
  /** Pixels whose flicker was counted in this pair, by band. The low count
   *  can fall after the pair is returned: see `pairStats`. */
  flickerLowPx: number;
  flickerHighPx: number;
  /** The whole frame's pixel count, on a crop's figures as on the frame's:
   *  what the flicker minimum is a share of. */
  framePx: number;
  /** Mean of each pixel's brightest channel, before and after. */
  prevMean: number;
  mean: number;
}

export interface PairStats {
  full: PairStat;
  /** The same pair over the crop, when the state was begun with one. */
  crop: PairStat | null;
}

/**
 * What has to be carried from one pair to the next.
 *
 * A flicker is a pixel going out and coming back, so it cannot be seen in one
 * pair: each pixel remembers the leg it is on and the leg before it. The mean
 * is carried as a running sum for a different reason, which is cost - only the
 * pixels that changed are visited, and the sum is integer, so it is exact.
 */
export interface PairState {
  width: number;
  height: number;
  crop: Rect | null;
  /** The flicker window in pairs. */
  windowPairs: number;
  /** Index of the pair `pairStats` will be handed next. */
  pair: number;
  sumFull: number;
  sumCrop: number;
  pxFull: number;
  pxCrop: number;
  /** Per pixel, the leg its brightest channel is on: which way it goes, the
   *  level it left and the furthest level it has reached, the pair it began
   *  on, and the pair in which it last turned back from that furthest level
   *  (`NO_PAIR` while it stands on it). */
  dir: Int8Array;
  pivot: Uint8Array;
  peak: Uint8Array;
  legStart: Uint16Array;
  turn: Uint16Array;
  /** How far the leg before went, and the pair it began on. */
  before: Uint8Array;
  beforeStart: Uint16Array;
  /** Which bands this pixel's present excursion has already been counted in,
   *  so one flicker is one count however many pairs its way back takes, and
   *  the pair its low count was given in, so that count can be moved. */
  told: Uint8Array;
  lowAt: Uint16Array;
  /** Every pair's statistics as they were returned, kept so a low count can
   *  be taken back from the pair it was given in. */
  given: PairStats[];
}

const TOLD_LOW = 1;
const TOLD_HIGH = 2;
/** Stands for no pair in the per-pixel pair indices, and so is also one more
 *  than the last pair a sequence can hold. */
const NO_PAIR = 0xffff;
const CHANNELS = 4;

function clipRect(crop: Rect | null, width: number, height: number): Rect | null {
  if (!crop) return null;
  const r = {
    x0: Math.max(0, Math.min(width, Math.floor(crop.x0))),
    y0: Math.max(0, Math.min(height, Math.floor(crop.y0))),
    x1: Math.max(0, Math.min(width, Math.ceil(crop.x1))),
    y1: Math.max(0, Math.min(height, Math.ceil(crop.y1))),
  };
  if (!(r.x0 < r.x1 && r.y0 < r.y1)) throw new Error("the crop holds no pixel of the frame");
  return r;
}

/** The summed brightest channel of one frame, whole and inside the crop. */
function brightness(
  frame: Bytes, width: number, height: number, inside: Rect | null,
): { full: number; crop: number } {
  if (frame.length !== width * height * CHANNELS) {
    throw new Error("the frame is not width x height pixels");
  }
  let full = 0;
  let crop = 0;
  for (let y = 0, i = 0; y < height; y++) {
    const inRow = inside !== null && y >= inside.y0 && y < inside.y1;
    for (let x = 0; x < width; x++, i += CHANNELS) {
      const v = Math.max(frame[i]!, frame[i + 1]!, frame[i + 2]!);
      full += v;
      if (inRow && x >= inside.x0 && x < inside.x1) crop += v;
    }
  }
  return { full, crop };
}

const areaOf = (r: Rect | null): number => (r ? (r.x1 - r.x0) * (r.y1 - r.y0) : 0);

/**
 * The mean brightness of one frame alone, as a pair's `mean` is defined: for a
 * frame that stands outside a sequence and is only there to be compared with
 * it, such as the settled picture a passage leaves.
 */
export function meanOf(
  frame: Bytes, width: number, height: number, crop: Rect | null = null,
): { full: number; crop: number | null } {
  const inside = clipRect(crop, width, height);
  const sums = brightness(frame, width, height, inside);
  return {
    full: sums.full / (width * height),
    crop: inside ? sums.crop / areaOf(inside) : null,
  };
}

/** Begin a sequence on its first frame. */
export function beginState(
  first: Bytes, width: number, height: number, fps: number, crop: Rect | null = null,
): PairState {
  const px = width * height;
  const inside = clipRect(crop, width, height);
  const sums = brightness(first, width, height, inside);
  return {
    width,
    height,
    crop: inside,
    windowPairs: Math.max(1, Math.round(THRESHOLDS.FLICKER_WINDOW_S * fps)),
    pair: 0,
    sumFull: sums.full,
    sumCrop: sums.crop,
    pxFull: px,
    pxCrop: areaOf(inside),
    dir: new Int8Array(px),
    pivot: new Uint8Array(px),
    peak: new Uint8Array(px),
    legStart: new Uint16Array(px),
    turn: new Uint16Array(px),
    before: new Uint8Array(px),
    beforeStart: new Uint16Array(px),
    told: new Uint8Array(px),
    lowAt: new Uint16Array(px),
    given: [],
  };
}

/** A whole-pixel view, so an unchanged pixel costs one comparison. */
function words(d: Bytes): Uint32Array {
  return new Uint32Array(d.buffer, d.byteOffset, d.length >> 2);
}

interface Tally {
  changed: number;
  summed: number;
  maxDelta: number;
  maxFall: number;
  jump: number;
  low: number;
  high: number;
  /** Net change in the sum of brightest channels. */
  lift: number;
}

const tally = (): Tally => ({
  changed: 0, summed: 0, maxDelta: 0, maxFall: 0, jump: 0, low: 0, high: 0, lift: 0,
});

/** How many pixels have to flicker in one pair of a frame this large for the
 *  pair to count. Never none: a pair in which nothing flickered must not
 *  count on any frame, an empty one included. A size that is not a number is
 *  refused, because every comparison against what it would give is false and
 *  a passage measured that way reads as one that never flickers. */
export function flickerMinPx(framePx: number): number {
  if (!(framePx >= 0)) throw new Error(`not a frame's pixel count: ${framePx}`);
  return Math.max(1, Math.ceil(THRESHOLDS.FLICKER_MIN_SHARE * framePx));
}

function statOf(t: Tally, px: number, sumBefore: number, framePx: number): PairStat {
  return {
    changedPx: t.changed,
    changedShare: px ? t.changed / px : 0,
    energy: px ? t.summed / px : 0,
    perChanged: t.changed ? t.summed / t.changed : 0,
    maxDelta: t.maxDelta,
    maxFall: t.maxFall,
    jumpPx: t.jump,
    flickerLowPx: t.low,
    flickerHighPx: t.high,
    framePx,
    prevMean: px ? sumBefore / px : 0,
    mean: px ? (sumBefore + t.lift) / px : 0,
  };
}

/**
 * One pair of consecutive frames, colour channels only.
 *
 * A FLICKER, PER PIXEL: its brightest channel goes one way by at least a
 * level and then back by at least that level, the way back arriving within the
 * window of the way out beginning. Either order - a flash and a blink are the
 * same fault.
 *
 * A LEG ENDS WHEN THE PIXEL HAS COME BACK FROM ITS FURTHEST LEVEL BY MORE THAN
 * THE STILL LEVEL, counted from that furthest level and not pair by pair. A
 * rounding wobble in the middle of a rise comes back by less and the rise goes
 * on through it; a way back made of steps that are each no more than a wobble
 * still adds up, and is a way back from the pair its first step was taken in.
 * Taking each small step off the leg instead would let a flash fall all the
 * way home unseen, so long as it fell slowly.
 *
 * ONE EXCURSION, ONE COUNT, IN ITS DEEPEST BAND. The depth is the shallower of
 * the two legs. The pixel is counted in the pair where its way back first
 * reaches a band's level. A way back that passes the low level in one pair and
 * the high one in a later pair was a high flicker all along, so its low count
 * is taken back out of the pair that was given it: that pair's statistics are
 * the object this function returned for it, and they are lowered in place.
 */
export function pairStats(prev: Bytes, cur: Bytes, state: PairState): PairStats {
  const { width, height, crop, windowPairs } = state;
  if (prev.length !== cur.length || cur.length !== width * height * CHANNELS) {
    throw new Error("the two frames are not the size the sequence began with");
  }
  const k = state.pair;
  if (k >= NO_PAIR) throw new Error("the sequence is longer than its per-pixel state can index");
  const { dir, pivot, peak, legStart, turn, before, beforeStart, told, lowAt, given } = state;
  const {
    STILL_DELTA, JUMP_SUMMED_DELTA, FLICKER_LOW_LEVEL, FLICKER_HIGH_LEVEL,
  } = THRESHOLDS;
  const a32 = words(prev);
  const b32 = words(cur);
  const full = tally();
  const part = tally();

  for (let y = 0, p = 0; y < height; y++) {
    const inRow = crop !== null && y >= crop.y0 && y < crop.y1;
    for (let x = 0; x < width; x++, p++) {
      if (a32[p] === b32[p]) continue;
      const i = p * CHANNELS;
      const r0 = prev[i]!;
      const g0 = prev[i + 1]!;
      const b0 = prev[i + 2]!;
      const r1 = cur[i]!;
      const g1 = cur[i + 1]!;
      const b1 = cur[i + 2]!;
      const dr = Math.abs(r1 - r0);
      const dg = Math.abs(g1 - g0);
      const db = Math.abs(b1 - b0);
      const summed = dr + dg + db;
      // Opacity alone: the surface is opaque, so it carries nothing.
      if (summed === 0) continue;
      const top = Math.max(dr, dg, db);
      const v0 = Math.max(r0, g0, b0);
      const v1 = Math.max(r1, g1, b1);
      const dv = v1 - v0;
      const inCrop = inRow && x >= crop.x0 && x < crop.x1;

      let low = 0;
      let high = 0;
      if (dv !== 0) {
        const way = dir[p]!;
        if (way === 0) {
          dir[p] = dv > 0 ? 1 : -1;
          pivot[p] = v0;
          peak[p] = v1;
          legStart[p] = k;
          turn[p] = NO_PAIR;
        } else {
          const back = way * (peak[p]! - v1);
          if (back <= 0) {
            peak[p] = v1;
            turn[p] = NO_PAIR;
          } else {
            if (turn[p] === NO_PAIR) turn[p] = k;
            if (back > STILL_DELTA) {
              before[p] = way * (peak[p]! - pivot[p]!);
              beforeStart[p] = legStart[p]!;
              pivot[p] = peak[p]!;
              peak[p] = v1;
              dir[p] = -way;
              legStart[p] = turn[p]!;
              turn[p] = NO_PAIR;
              told[p] = 0;
            }
          }
        }
        const depth = Math.min(before[p]!, dir[p]! * (peak[p]! - pivot[p]!));
        if (depth >= FLICKER_LOW_LEVEL && k - beforeStart[p]! <= windowPairs) {
          if (depth >= FLICKER_HIGH_LEVEL) {
            if (!(told[p]! & TOLD_HIGH)) {
              if (told[p]! & TOLD_LOW) {
                const was = given[lowAt[p]!]!;
                was.full.flickerLowPx--;
                if (inCrop && was.crop) was.crop.flickerLowPx--;
              }
              told[p] = TOLD_LOW | TOLD_HIGH;
              high = 1;
            }
          } else if (!(told[p]! & TOLD_LOW)) {
            told[p] = TOLD_LOW;
            lowAt[p] = k;
            low = 1;
          }
        }
      }

      const jumped = summed > JUMP_SUMMED_DELTA ? 1 : 0;
      full.changed++;
      full.summed += summed;
      if (top > full.maxDelta) full.maxDelta = top;
      if (-dv > full.maxFall) full.maxFall = -dv;
      full.jump += jumped;
      full.low += low;
      full.high += high;
      full.lift += dv;
      if (inCrop) {
        part.changed++;
        part.summed += summed;
        if (top > part.maxDelta) part.maxDelta = top;
        if (-dv > part.maxFall) part.maxFall = -dv;
        part.jump += jumped;
        part.low += low;
        part.high += high;
        part.lift += dv;
      }
    }
  }

  const out: PairStats = {
    full: statOf(full, state.pxFull, state.sumFull, state.pxFull),
    crop: crop ? statOf(part, state.pxCrop, state.sumCrop, state.pxFull) : null,
  };
  given.push(out);
  state.sumFull += full.lift;
  state.sumCrop += part.lift;
  state.pair = k + 1;
  return out;
}

export interface Summary {
  /** The pairs the figures below are taken over: every pair but a seam's. */
  pairs: number;
  /** Report-only: pairs in which no colour channel moved at all. */
  identicalShare: number;
  /** Pairs whose furthest channel stayed within the still level. */
  stillShare: number;
  /** The longest unbroken run of still pairs, in seconds. */
  longestStillRunS: number;
  flickerLowFrameShare: number;
  flickerHighFrameShare: number;
  /** The deepest fall in mean brightness that later recovers, as a share of
   *  the lower of the two peaks it lies between. */
  dipDepth: number;
  /** Report-only: pairs in which the mean fell at all, and the furthest it
   *  fell in one pair, in levels. */
  drops: number;
  maxMeanFall: number;
  /** Report-only: the furthest any one pixel fell in one pair, in levels. */
  maxPixelFall: number;
  /** Report-only. */
  jumpFrameShare: number;
  /** Typical energy on the marked pairs over typical energy on the rest;
   *  null where the range carries no mark or nothing else moved. */
  markStepRatio: number | null;
  /** Indices of the pairs that are cuts. */
  cutEvents: number[];
  /** Seam pairs of a cut's weight: steps across a boundary another range is
   *  there to judge. Listed, and not this range's to answer for. */
  seamEvents: number[];
}

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (!n) return 0;
  return n % 2 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
}

/**
 * A sequence's pairs, reduced to what is judged and what is read beside it.
 *
 * THE DIP IS A FALL THAT RECOVERS. For each frame, the highest mean anywhere
 * before it and the highest anywhere after it; the dip there is how far the
 * frame sits under the lower of the two. A fade that only falls has nothing
 * higher after it and a rise has nothing higher before, so an authored fade
 * scores nothing however deep it goes, and what is left is brightness the
 * passage gave up and then took back.
 *
 * `leadMean` is the mean of the settled picture a passage leaves, where it
 * leaves one: it stands before the first frame as something the passage can
 * have dipped from. Without it a passage whose first frame is already under
 * the picture it is handing over from would be measured from inside its own
 * dip, and score the shallower for it.
 *
 * THE MARK STEP is a ratio of medians: what a pair across a mark typically
 * costs against what a pair that MOVED typically costs elsewhere in the same
 * range. Still pairs are left out of the denominator, because a range that
 * sits half the time has a typical pair of nothing and every ratio over it
 * would be the same meaningless infinity.
 *
 * A SEAM'S PAIR IS THE SEAM'S. A range is drawn through its end frame, and
 * where it ends on a boundary that frame is the next passage's first: the
 * last pair is then the step across the boundary, which has a range of its
 * own built to judge it. `seams` names such pairs, and they are left out of
 * every figure here: one frame of the next passage is enough to turn a fade
 * that only falls into a dip that recovers. A seam pair of a cut's weight is
 * listed as a seam event, so the step stays in sight, and it is answered for
 * once, by the range that exists to ask about it.
 */
export function summarize(
  pairs: readonly PairStat[],
  fps: number,
  marks: readonly number[] = [],
  seams: readonly number[] = [],
  leadMean: number | null = null,
): Summary {
  const {
    STILL_DELTA, JUMP_MIN_PX, CUT_PER_CHANGED, CUT_MIN_SHARE,
  } = THRESHOLDS;
  const seam = new Set(seams);
  const own = pairs.filter((_, i) => !seam.has(i));
  const n = own.length;
  let identical = 0;
  let still = 0;
  let run = 0;
  let longest = 0;
  let low = 0;
  let high = 0;
  let jump = 0;
  let drops = 0;
  let maxMeanFall = 0;
  let maxPixelFall = 0;
  const cutEvents: number[] = [];
  const seamEvents: number[] = [];
  pairs.forEach((p, i) => {
    const cut = p.perChanged >= CUT_PER_CHANGED && p.changedShare >= CUT_MIN_SHARE;
    if (seam.has(i)) {
      if (cut) seamEvents.push(i);
      run = 0;
      return;
    }
    if (cut) cutEvents.push(i);
    if (p.changedPx === 0) identical++;
    if (p.maxDelta <= STILL_DELTA) {
      still++;
      run++;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
    const flickers = flickerMinPx(p.framePx);
    if (p.flickerLowPx >= flickers) low++;
    if (p.flickerHighPx >= flickers) high++;
    if (p.jumpPx >= JUMP_MIN_PX) jump++;
    if (p.maxFall > maxPixelFall) maxPixelFall = p.maxFall;
    if (p.mean < p.prevMean) {
      drops++;
      if (p.prevMean - p.mean > maxMeanFall) maxMeanFall = p.prevMean - p.mean;
    }
  });

  let dipDepth = 0;
  if (n) {
    const means = [
      ...(leadMean === null ? [] : [leadMean]),
      own[0]!.prevMean,
      ...own.map((p) => p.mean),
    ];
    const after = new Array<number>(means.length);
    let peak = -Infinity;
    for (let i = means.length - 1; i >= 0; i--) {
      peak = Math.max(peak, means[i]!);
      after[i] = peak;
    }
    peak = -Infinity;
    for (let i = 0; i < means.length; i++) {
      peak = Math.max(peak, means[i]!);
      const rim = Math.min(peak, after[i]!);
      if (rim > 0) dipDepth = Math.max(dipDepth, (rim - means[i]!) / rim);
    }
  }

  const marked = new Set(marks.filter((i) => i >= 0 && i < pairs.length && !seam.has(i)));
  const onMarks: number[] = [];
  const elsewhere: number[] = [];
  pairs.forEach((p, i) => {
    if (seam.has(i)) return;
    if (marked.has(i)) onMarks.push(p.energy);
    else if (p.maxDelta > STILL_DELTA) elsewhere.push(p.energy);
  });
  const typical = median(elsewhere);
  const markStepRatio = onMarks.length && typical > 0 ? median(onMarks) / typical : null;

  const share = (count: number): number => (n ? count / n : 0);
  return {
    pairs: n,
    identicalShare: share(identical),
    stillShare: share(still),
    longestStillRunS: longest / fps,
    flickerLowFrameShare: share(low),
    flickerHighFrameShare: share(high),
    dipDepth,
    drops,
    maxMeanFall,
    maxPixelFall,
    jumpFrameShare: share(jump),
    markStepRatio,
    cutEvents,
    seamEvents,
  };
}

/** What a range may be held to. A null field is not judged. */
export interface Budget {
  stillShareMax: number | null;
  longestStillRunSMax: number | null;
  flickerLowFrameShareMax: number | null;
  flickerHighFrameShareMax: number | null;
  dipDepthMax: number | null;
  markStepRatioMax: number | null;
}

/** The summary quantity each budget field bounds, in the order they print. */
export const BUDGET_FIELDS = [
  "stillShare",
  "longestStillRunS",
  "flickerLowFrameShare",
  "flickerHighFrameShare",
  "dipDepth",
  "markStepRatio",
] as const;
export type BudgetField = (typeof BUDGET_FIELDS)[number];

/** The fields that ask whether anything moved, which an authored hold is
 *  excused from: its stillness is the score's, not a fault. */
export const STILL_FIELDS: readonly BudgetField[] = ["stillShare", "longestStillRunS"];

export type Expect = "moving" | "held" | "cut";

export interface Judgement {
  verdict: "green" | "red" | "INCONCLUSIVE";
  /** Why, by name: `control`, `cutEvents`, or a budget field. */
  reasons: string[];
  /** The budget fields this judgement actually read. */
  judged: BudgetField[];
}

/**
 * Hold one range's summary to its structure and, where there is one, its
 * budget.
 *
 * THE CONTROL COMES FIRST. `controlMaxDelta` is how far the range's last frame
 * moved when it was simply drawn again. Above the still level, two draws of
 * one instant disagreed by more than the instrument calls nothing, so nothing
 * else it reported about the range can be told from that, and the range is
 * neither green nor red.
 *
 * STRUCTURE IS ALWAYS ON. A `cut` range holds exactly one cut, on a pair that
 * straddles the cut's own instant (`cutPairs`: the pairs that do, more than
 * one only when a frame lands on the instant itself). Every other range holds
 * none. This needs no budget, which is what lets the two standing controls
 * mean something before any budget exists.
 */
export function judge(
  summary: Summary,
  expect: Expect,
  budget: Budget | null,
  cutPairs: readonly number[] | null = null,
  controlMaxDelta: number | null = null,
): Judgement {
  if (controlMaxDelta !== null && controlMaxDelta > THRESHOLDS.STILL_DELTA) {
    return { verdict: "INCONCLUSIVE", reasons: ["control"], judged: [] };
  }
  const reasons: string[] = [];
  const judged: BudgetField[] = [];
  const events = summary.cutEvents;
  if (expect === "cut") {
    const [only] = events;
    if (events.length !== 1 || only === undefined || !(cutPairs ?? []).includes(only)) {
      reasons.push("cutEvents");
    }
  } else if (events.length !== 0) {
    reasons.push("cutEvents");
  }
  if (budget) {
    for (const field of BUDGET_FIELDS) {
      const max = budget[`${field}Max`];
      if (max === null || max === undefined) continue;
      if (expect === "held" && STILL_FIELDS.includes(field)) continue;
      judged.push(field);
      const got = summary[field];
      // A bound with nothing to hold it against is a budget judging nothing,
      // which must not read as a pass.
      if (got === null || !(got <= max)) reasons.push(field);
    }
  }
  return { verdict: reasons.length ? "red" : "green", reasons, judged };
}

/** Two instants closer than this are one instant: frame times are sums of
 *  floats and can land a rounding step to either side of a boundary. */
const SAME_INSTANT_S = 1e-6;

/** The pairs that straddle `at`: more than one only when a frame lands on it,
 *  since which side that frame shows is the renderer's to say. */
export function straddlingPairs(times: readonly number[], at: number): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < times.length; i++) {
    if (times[i]! <= at + SAME_INSTANT_S && at <= times[i + 1]! + SAME_INSTANT_S) out.push(i);
  }
  return out;
}

/** The pair each mark falls in: the one whose later frame is the first drawn
 *  at or after it. A mark outside the frames falls in none. */
export function markedPairs(times: readonly number[], marks: readonly number[]): number[] {
  const out: number[] = [];
  for (const at of marks) {
    for (let i = 0; i + 1 < times.length; i++) {
      if (times[i]! < at && at <= times[i + 1]!) {
        out.push(i);
        break;
      }
    }
  }
  return out;
}

export interface FallStats {
  changedPx: number;
  /** Pixels whose brightest channel is lower in the second frame. */
  fellPx: number;
  /** The furthest any of them fell, in levels. */
  maxFall: number;
  /** Bounds of every changed pixel, half-open, or null when none changed. */
  box: Rect | null;
}

/**
 * Two frames either side of one instant: what changed, where, and what fell.
 *
 * For a pair that straddles a step in how the same picture is composed. Ink
 * arriving between the two is the piece moving; ink that gets DARKER is the
 * composition showing, since nothing in the record took it away.
 */
export function fallStats(a: Bytes, b: Bytes, width: number): FallStats {
  if (a.length !== b.length) throw new Error("the two frames are not the same size");
  const a32 = words(a);
  const b32 = words(b);
  let changedPx = 0;
  let fellPx = 0;
  let maxFall = 0;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  for (let p = 0; p < a32.length; p++) {
    if (a32[p] === b32[p]) continue;
    const i = p * CHANNELS;
    if (a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2]) continue;
    changedPx++;
    const x = p % width;
    const y = (p - x) / width;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    const fall = Math.max(a[i]!, a[i + 1]!, a[i + 2]!) - Math.max(b[i]!, b[i + 1]!, b[i + 2]!);
    if (fall > 0) {
      fellPx++;
      if (fall > maxFall) maxFall = fall;
    }
  }
  return {
    changedPx,
    fellPx,
    maxFall,
    box: changedPx ? { x0, y0, x1: x1 + 1, y1: y1 + 1 } : null,
  };
}
