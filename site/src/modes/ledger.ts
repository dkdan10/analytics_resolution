/** THE LEDGER — the archive learns adjectives.
 *
 * Every mark carries what the record says it *was*. In the earliest season
 * that is calm: a handful of phrases exist in the whole season and a smaller
 * handful account for ninety per cent of every shot, so the same few words
 * repeat quietly across the floor. By the last, several times as many exist,
 * far more are needed for the same ninety per cent, and each description is
 * longer — "Driving Layup Shot" has become "Turnaround Fadeaway Bank Jump
 * Shot". The text thickens because the vocabulary did. Every count here is in
 * `vocabulary` and none of it is restated in this file.
 *
 * That is the mirror of the piece's first curve. As the record stops saying
 * *where* a shot happened, it becomes fluent in saying *what* it was — and Act
 * V's crowding is substitution, never decay: the shot record's precision is
 * untouched, it is the kind of record that changed.
 *
 * How many labels are shown is itself driven by the measurement rather than by
 * taste: it scales with `words_covering_90pct`, the count of phrases needed to
 * describe the bulk of a season, so the density of description on the plate is
 * proportional to how varied the description actually is.
 */

import { factExternal, factNum, type Loaded, type Sample, type Season, type WindowFile } from "../data";
import { contextDisplay, ROOM_TEXT_MIN_PX } from "../display";
import { drawSlug } from "../inscription";
import { BONE_RGB, SLUG_FAMILY } from "../palette";
import { COURT } from "../plate";
import {
  LEAGUE_ARRIVAL_K,
  LEAGUE_NAME_ALPHA,
  LEAGUE_NAME_TENTHS,
  LEAGUE_VALUE_ALPHA,
  LEAGUE_VALUE_SCALE,
  SCATTER_ALPHA,
  SCATTER_MIN_PX,
  SCATTER_TENTHS,
  SLUG_MIN_PX,
  SLUG_STATEMENT_TENTHS,
  TERM_ALPHA_AGED,
  TERM_ALPHA_FRESH,
  TERM_BIRTH_TENTHS,
  TERM_CLEAR_PAD,
  TERM_HEAD_TENTHS,
  TERM_HOLD_SECONDS,
  TERM_MARGIN_ALPHA,
  TERM_MARGIN_SCALE,
  TERM_NINETY_TENTHS,
  TERM_TAIL_TENTHS,
  TERM_TIE_ALPHA,
} from "../scalars";
import { actOf, ARRIVAL_TAIL } from "../timeline";
import { label, LABEL_LINE_HEIGHT } from "../textatlas";
import {
  LEDGER_WINDOW_STOPS,
  LEDGER_WINDOW_WITHDRAW_PHASE,
  LEDGER_WINDOW_WRITING_SPAN,
  progressInWindowSpan,
  WINDOW_BEATS,
  windowEntryProgress,
  windowSecondAtPhase,
} from "../window-score";
import { drawSeasonField } from "./fieldlayer";
import { drawActCue, seasonClock } from "./shared";
import type { Frame } from "./types";

/** How many labels the calmest season shows, and the vocabulary breadth that
 *  count is pinned to. Composition, not measurement: the density of description
 *  on the plate scales with `words_covering_90pct` from here. */
const LABELS_AT_CALMEST = 44;
const CALMEST_WORDS_90 = 4;
/** Ceiling from the measured frame budget, so the labels stay inside a frame
 *  even during a crossfade. */
const MAX_LABELS = 240;

/**
 * What the league publishes *instead of* the geometry, once the raw feed closes.
 *
 * The names used to be written out here, which is display copy authoring its
 * own content. They now come from `facts.json:external.published_instead` -
 * PtMeasureType values of LeagueDashPtStats, plus PlayerDashPtShots,
 * SynergyPlayTypes and HustleStats, each cited, with its endpoint, in its
 * `source` field there.
 *
 * An earlier version of this slug read "THE VALUES ARE NOT PUBLIC", and that
 * was false. The league does publish values for all of them. What it stopped
 * publishing is the OPTICAL GEOMETRY THEY ARE MADE FROM — and that is the
 * enclosure this piece is about. The window proves it: inside it these can be
 * recomputed from the raw record, and outside it only the names survive.
 *
 * Values shown here are this project's own reconstructions over the window, not
 * the league's figures — their rules are not published, so the two cannot be
 * the same number and the piece never claims they are.
 */
interface PublishedMeasure {
  name: string;
  source: string;
}

function publishedInstead(data: Loaded): string[] {
  return factExternal<PublishedMeasure[]>(data.facts, "published_instead")
    .map((m) => m.name);
}

/**
 * What this project could recompute for the window, keyed by the same names.
 *
 * Only measures actually derived by pipeline/window.py appear; the rest stay
 * bare in every act, which is the honest state of them. Every figure resolves
 * to a key in window.json — none is written here.
 */
function windowValues(w: WindowFile | null): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!w) return out;
  const inv = w.inventory;
  const widest = w.contest.buckets[w.contest.buckets.length - 1];
  if (widest) {
    // A recovered-set proportion, so it is shown as one: the share carries the
    // scope tag the pipeline templated from its own coverage figure, and the
    // reader is never handed it as if it described the season.
    // TWO LINES, because on one line the tagged value is the row's widest
    // string and stands struck through its neighbour's value for the whole
    // close — the two honesty-load-bearing strings destroying each other. The
    // share leads; the scope stands beneath it.
    const share = `${(100 * widest.share).toFixed(1)}% ${widest.name.toUpperCase()}`;
    // The scope opens its own line, so it carries no separator in front.
    out.set("CLOSEST DEFENDER",
      w.bias.scope ? [share, w.bias.scope] : [share]);
  }
  // Every count is grouped the same way, so a per-game figure in the
  // thousands reads like the miles two names away.
  const per = inv.per_game;
  out.set("SPEED & DISTANCE", [`${inv.miles_run.toLocaleString()} MI`]);
  if (per.drives !== null) out.set("DRIVES", [`${per.drives.toLocaleString()}/GAME`]);
  if (per.touches !== null) out.set("TOUCHES", [`${per.touches.toLocaleString()}/GAME`]);
  if (per.passes !== null) out.set("PASSING", [`${per.passes.toLocaleString()}/GAME`]);
  if (inv.mean_seconds_per_touch !== null) {
    // Spaced from its figure, or the S reads as one more digit.
    out.set("POSSESSIONS", [`${inv.mean_seconds_per_touch} S/TOUCH`]);
  }
  return out;
}

/**
 * Where the league's published names sit, in COURT TENTHS.
 *
 * Extracted so the spoken register can see them. They occupy the middle of the
 * floor for two whole acts, and until they were enrolled in the collision set
 * the plate happily spoke a three-foot phrase straight through PASSING - which
 * is how Act V came out as a tag cloud, the one outcome this hand may not have.
 * One layout, two readers: `drawPublishedInstead` draws from this too, so the
 * boxes the terms avoid are the boxes the names actually take.
 */
const LEAGUE_ARC_INNER = 152;
const LEAGUE_ARC_OUTER = 212;

/** How fast the bare published names accumulate in Act V. The Window instead
 *  follows the explicit NIGHT-to-crest span below. Retained as an export while
 *  older presenter integrations migrate to the semantic stops. */
export const LEAGUE_ACCUM_K = 1.4;

/** Compatibility exports; the canonical Ledger score is centralized. */
export { LEDGER_WINDOW_STOPS, LEDGER_WINDOW_WRITING_SPAN };

export function ledgerWindowWritingProgress(phase: number): number {
  return progressInWindowSpan(phase, LEDGER_WINDOW_WRITING_SPAN);
}

/** Null before CLOSE; thereafter the reverse-writing edge, one down to zero. */
export function ledgerWindowRemnant(phase: number): number | null {
  if (phase <= LEDGER_WINDOW_WITHDRAW_PHASE) return null;
  const close = progressInWindowSpan(phase, WINDOW_BEATS[3]);
  return 1 - seasonClock(close);
}

function leagueBoxes(names: string[]): Box[] {
  const perArc = Math.ceil(names.length / 2);
  const h = LEAGUE_NAME_TENTHS * 1.7;
  // The clearance a spoken term keeps around itself, which the names keep from
  // the sidelines and from each other.
  const pad = TERM_CLEAR_PAD * LEAGUE_NAME_TENTHS;
  const place = (text: string, r: number, a: number): Box => {
    const w = widthTenths(text, LEAGUE_NAME_TENTHS);
    // Centred on the arc, so the box's left edge is half a width back — but
    // never off the floor: an arc's end slot sits near a sideline, and a long
    // name centred there began outside the court.
    const centred = r * Math.cos(a) - w / 2;
    return {
      wx: Math.max(COURT.x0 + pad, Math.min(COURT.x1 - pad - w, centred)),
      wy: r * Math.sin(a),
      w,
      h,
    };
  };
  const inner: Box[] = [];
  return names.map((text, i) => {
    const arc = i < perArc ? 0 : 1;
    const k = arc === 0 ? i : i - perArc;
    const count = arc === 0 ? perArc : names.length - perArc;
    const a = Math.PI - ((k + 0.5) / count) * Math.PI;
    if (arc === 0) {
      const box = place(text, LEAGUE_ARC_INNER, a);
      inner.push(box);
      return box;
    }
    // The two arcs' end slots fall low and close, where an outer name stood on
    // the inner one beneath it and the pair read as one two-line label. An
    // outer name that would meet an inner one rises along its own arc until it
    // clears it, and no further.
    const box = place(text, LEAGUE_ARC_OUTER, a);
    const under = inner.filter((b) => overlaps(box, b, pad));
    if (!under.length) return box;
    const clear = Math.max(...under.map((b) => b.wy + (b.h + h) / 2 + pad));
    const lifted = Math.asin(Math.min(1, clear / LEAGUE_ARC_OUTER));
    return place(text, LEAGUE_ARC_OUTER, Math.cos(a) < 0 ? Math.PI - lifted : lifted);
  });
}

function labelBudget(season: Season): number {
  const varied = season.vocabulary.words_covering_90pct / CALMEST_WORDS_90;
  return Math.max(12, Math.min(MAX_LABELS, Math.round(LABELS_AT_CALMEST * varied)));
}

// --- THE SPOKEN TERM ---------------------------------------------------------
//
// The obvious reading of this hand's failure is COUNT — "dozens of labels" —
// with a small sequence of monumental terms as the cure. Both halves of that
// are wrong for this piece. The count is the one part of the hand that is
// measured: it is `words_covering_90pct`, which is the hand's whole argument.
// And a curated word list is authored content, which rule 3
// (docs/verification.md) forbids outright.
//
// Measured instead, the failure is SCALE and DWELL. Every label is half a foot
// tall on a floor tens of feet deep, and in the calmest season each one
// lives about a sixth of a second, because the arrival edge moves far faster
// than a reader — so the era the hand's own comment calls calm strobes faster
// than the noisy one. Nothing of any count is readable at that size for that
// long, from any distance.
//
// So: keep every label, and add a register above it. The plate SPEAKS. One
// phrase at a time, struck beside a real arriving mark with a hairline tie back
// to it, held long enough to read, fading under the next. Which word is spoken
// is whatever has just landed, so frequency comes from the record's own shares
// and nothing is chosen; how many times a season the plate speaks is
// `words_covering_90pct` — the same measured driver, moved from how many
// unreadable labels there are to how many times the plate says something you
// can read. The head phrase's collapsing monopoly on the big register IS the
// second curve, performed.

/** An axis-aligned box on the floor, in court tenths. Terms and the league's
 *  names are both these, which is what lets one avoid the other. */
interface Box {
  wx: number;
  wy: number;
  w: number;
  h: number;
}

interface Term extends Box {
  /** Which utterance of the season this is. */
  j: number;
  phrase: string;
  /** Court tenths. */
  size: number;
  /** The mark it describes, in court tenths. */
  x: number;
  y: number;
  /** The season this phrase was first filed in, when this is its first. */
  bornIn: string | null;
}

/**
 * A string's width in COURT TENTHS at a given size, independent of the viewport.
 *
 * Measured once per string at a fixed nominal size and scaled, never through the
 * live view: if any of this geometry needed `view.scale`, the memo below could
 * not be keyed without the viewport and the plate would speak different words
 * on different screens.
 */
const NOMINAL_PX = 100;
const widths = new Map<string, number>();
let ruler: CanvasRenderingContext2D | null = null;

function widthTenths(text: string, sizeTenths: number): number {
  let per = widths.get(text);
  if (per === undefined) {
    ruler ??= document.createElement("canvas").getContext("2d")!;
    ruler.font = `${NOMINAL_PX}px ${SLUG_FAMILY}`;
    per = ruler.measureText(text).width / NOMINAL_PX;
    widths.set(text, per);
  }
  return per * sizeTenths;
}

/** The same easing `stateAt` uses for arrival, so an utterance lands with the
 *  marks rather than on a clock of its own. */
function smoothstep(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
}

/**
 * The largest share any one phrase reaches in any season — the normaliser the
 * head term is sized against.
 *
 * Computed over the corpus at load, never written down: a hand-typed constant in
 * `bloom.ts` survived two re-runs while contradicting the artifact it came from,
 * and the first rule (docs/verification.md) forbids exactly that pattern.
 */
let refShare = 0;
function referenceShare(seasons: Season[]): number {
  if (refShare > 0) return refShare;
  for (const s of seasons) {
    const d = s.classification.DESCRIPTION;
    if (!d || !s.attempts) continue;
    const top = Math.max(...Object.values(d));
    refShare = Math.max(refShare, top / s.attempts);
  }
  return refShare;
}

/**
 * Every phrase's first season, from `vocabulary.words_list` alone.
 *
 * THE FIRST SEASON OF THE CORPUS IS NOT A BIRTH SEASON, and this is an honesty
 * point rather than a compositional one. Nothing is new when everything is: the
 * record did not learn "Jump Shot" in 1996-97, that is merely the earliest
 * season anyone holds, and striking FIRST FILED over it would be the piece
 * asserting something its data cannot support. Only a phrase that is absent
 * from an earlier season we DO hold has a birth to disclose.
 */
let firstFiled: Map<string, string> | null = null;
function births(seasons: Season[]): Map<string, string> {
  if (firstFiled) return firstFiled;
  const seen = new Map<string, string>();
  const founding = new Set(seasons[0]?.vocabulary.words_list ?? []);
  for (const s of seasons) {
    for (const w of s.vocabulary.words_list) {
      if (!seen.has(w) && !founding.has(w)) seen.set(w, s.season);
    }
  }
  firstFiled = seen;
  return seen;
}

/** The phrases inside this season's ninety-per-cent set, head first. */
function ninetySet(season: Season): { head: string; inside: Set<string> } {
  const d = season.classification.DESCRIPTION ?? {};
  const ranked = Object.entries(d).sort((a, b) => b[1] - a[1]);
  const w90 = season.vocabulary.words_covering_90pct;
  return {
    head: ranked[0]?.[0] ?? "",
    inside: new Set(ranked.slice(0, w90).map(([k]) => k)),
  };
}

function sizeOf(phrase: string, season: Season, seasons: Season[], isBirth: boolean): number {
  if (isBirth) return TERM_BIRTH_TENTHS;
  const { head, inside } = ninetySet(season);
  if (phrase === head) {
    const n = season.classification.DESCRIPTION?.[phrase] ?? 0;
    const share = season.attempts ? n / season.attempts : 0;
    const ref = referenceShare(seasons);
    // Area proportional to the shots the word names — the law `drawPin` obeys.
    return TERM_HEAD_TENTHS * Math.sqrt(ref > 0 ? share / ref : 1);
  }
  return inside.has(phrase) ? TERM_NINETY_TENTHS : TERM_TAIL_TENTHS;
}

function overlaps(a: Box, b: Box, pad: number): boolean {
  return Math.abs(a.wx + a.w / 2 - (b.wx + b.w / 2)) < (a.w + b.w) / 2 + pad
    && Math.abs(a.wy - b.wy) < (a.h + b.h) / 2 + pad;
}

/**
 * The season's whole utterance list, memoised BY YEAR — and, for the window
 * season, by whether the window file is resident.
 *
 * That key is the invariant, not a convenience: every quantity below derives
 * from the season, the fixed-seed sample and the schedule, and none of it from
 * the viewport. If this ever needed `view.scale` in its key, the layout would
 * have been done in pixels somewhere and the plate would say different words on
 * different screens.
 *
 * The window file is the one input that is not there from the first frame: it
 * is optional, and a failed fetch can be retried on a live page. The window
 * season's obstacles include the figures that file carries, so a layout made
 * without it is a different layout, and under the year alone whichever one was
 * made first would have stood for the life of the page. `layoutKey` names the
 * two apart, so what is spoken follows what is resident now.
 */
const utterances = new Map<string, Term[]>();

function layoutKey(data: Loaded, year: number): string {
  return actOf(year) === 3 && data.window ? `${year}+window` : `${year}`;
}

function utterancesFor(
  key: string,
  season: Season,
  sample: Sample,
  seasons: Season[],
  writingSeconds: number,
  /** Boxes occupied for the whole season - the league's names in Acts III and
   *  V, the window's figures while that file is resident, and the pin's
   *  caption in every season that refuses. Functions of what `key` names and
   *  nothing else. */
  fixed: Box[],
): Term[] {
  const hit = utterances.get(key);
  if (hit) return hit;

  const born = births(seasons);
  const vocab = sample.action_vocab;
  const U = Math.max(1, season.vocabulary.words_covering_90pct);
  const interval = writingSeconds / U;
  const out: Term[] = [];
  const spokenBirths = new Set<string>();

  for (let j = 0; j < U; j++) {
    // Live terms at this moment, which the candidate must not land on.
    const live: Box[] = [
      ...fixed,
      ...out.filter((t) => (j - t.j) * interval < TERM_HOLD_SECONDS),
    ];
    const anchor = Math.ceil(sample.n * smoothstep((j + 0.5) / U)) - 1;

    // In a birth season the plate prefers a phrase it has never filed before.
    // Only a handful of seasons gain words at all, so this is lumpy by
    // measurement rather than by design - `vocabulary.words_list` says which.
    for (const wantBirth of [true, false]) {
      let placed: Term | null = null;
      for (let i = anchor; i >= 0 && placed === null; i--) {
        if (sample.pin[i] === 1) continue;
        const phrase = vocab[sample.action[i] ?? -1];
        if (!phrase) continue;
        const isBirth = born.get(phrase) === season.season;
        if (wantBirth && (!isBirth || spokenBirths.has(phrase))) continue;
        if (!wantBirth && isBirth && spokenBirths.has(phrase)) continue;

        const size = sizeOf(phrase, season, seasons, isBirth);
        const w = widthTenths(phrase, size);
        const h = size * 1.7;
        const x = sample.x[i]!;
        const y = sample.y[i]!;
        // To the right of the mark, or to the left when the word would run off
        // the plate. The tie is what keeps it an annotation either way.
        const gap = size * 0.9;
        const wx = x + gap + w <= COURT.x1 ? x + gap : x - gap - w;
        const cand: Term = { j, phrase, size, x, y, wx, wy: y, w, h, bornIn: isBirth ? season.season : null };
        if (wx < COURT.x0) continue;
        const pad = TERM_CLEAR_PAD * size;
        if (live.some((t) => overlaps(cand, t, pad))) continue;
        placed = cand;
      }
      if (placed) {
        if (placed.bornIn) spokenBirths.add(placed.phrase);
        out.push(placed);
        break;
      }
      // Nothing born and unspoken was within reach: fall through to the
      // ordinary rule. And if THAT finds no room either, the plate simply does
      // not speak this utterance - the crowding limit is emergent rather than
      // authored, and by the late seasons the record has more to say than the
      // floor has room for.
    }
  }
  utterances.set(key, out);
  return out;
}

/** Drop the per-year memo and the string ruler. Called from the probes' cold
 *  start, and it must change no pixel - both are pure functions of their key. */
export function clearLedgerCaches(): void {
  utterances.clear();
  widths.clear();
  firstFiled = null;
  refShare = 0;
}

/** A term as one frame sets it, in court tenths: the type it puts down once
 *  its sizes are floored, which the box it was laid out in does not know. */
interface TermSet {
  /** The word's size and its margin line's, in pixels. */
  px: number;
  mp: number;
  /** The word's size as set, in court tenths. */
  size: number;
  /** The word's em box. */
  word: Box;
  /** The em box of a birth's margin line, where this frame puts it, or null
   *  where it has nowhere to stand. */
  margin: Box | null;
  /** Whether that line stands over its word instead of under it. */
  above: boolean;
}

/** The pin caption as one frame sets it, in court tenths. */
interface CaptionSet {
  /** With the leading every Box here carries: what the scatter keeps out of. */
  box: Box;
  /** The type alone, from its first line's top to its last line's foot: what
   *  a word or a margin line set beside it would actually meet. */
  type: Box;
}

/** Whether two settings of type meet: their em boxes, with `along` of clear
 *  floor kept between them where they share a line. */
function meets(a: Box, b: Box, along: number): boolean {
  return Math.abs(a.wx + a.w / 2 - (b.wx + b.w / 2)) < (a.w + b.w) / 2 + along
    && Math.abs(a.wy - b.wy) < (a.h + b.h) / 2;
}

/**
 * How one frame sets a term against the pin caption of the term's own season,
 * or null where that caption leaves the word no room.
 *
 * The layout keeps every word clear of the caption at court size, and it must:
 * its key carries no viewport. But the caption's type has pixel floors, and on
 * a floor it is wider than the box the layout knew and stands higher off the
 * plate's edge, so a word laid out beside it ran into it, and a birth's margin
 * line, which is in nobody's box, lay under its first line. Both are settled
 * here, from the frame alone, and by the type that is actually set, so that a
 * word which merely stands near the caption keeps its place. A word whose type
 * would meet the caption's, or run on into it along one line inside the
 * clearance the layout keeps, is not spoken: the layout already leaves an
 * utterance out when the floor has no room for it. A margin line that would
 * meet the caption stands over its word instead of under it, so the birth is
 * still disclosed. Where no floor binds, the layout has already kept every
 * word further off than this asks.
 *
 * Over its word the line is on new ground, and `beside` is who else speaks
 * there during this word's hold. A line that would stand on one of their
 * lines, inside the clear floor the scatter keeps beside a spoken word, would
 * read as that word's own and date a phrase to a season it was not first
 * filed in. There it is not set at all, which says less and nothing false.
 */
function termSet(
  f: Frame,
  t: Term,
  caption: CaptionSet | null,
  beside: Term[] = [],
): TermSet | null {
  const { view } = f;
  const room = contextDisplay(f.ctx) === "room";
  const px = termPx(f, t);
  const size = px / view.scale;
  const word: Box = { wx: t.wx, wy: t.wy, w: widthTenths(t.phrase, size), h: size };
  if (caption && meets(word, caption.type, TERM_CLEAR_PAD * size)) return null;
  const mp = Math.max(
    SCATTER_MIN_PX * 0.8,
    px * TERM_MARGIN_SCALE,
    room ? ROOM_TEXT_MIN_PX.aside : 0,
  );
  if (!t.bornIn) return { px, mp, size, word, margin: null, above: false };
  const marginSize = mp / view.scale;
  // The line's centre from the word's, by the rule `drawTerms` sets it at.
  const off = (marginTop(0, px * LABEL_LINE_HEIGHT) + mp * LABEL_LINE_HEIGHT / 2) / view.scale;
  const line = (side: number): Box => ({
    wx: t.wx,
    wy: t.wy + side * off,
    w: widthTenths(`FIRST FILED ${t.bornIn}`, marginSize),
    h: marginSize,
  });
  const under = line(-1);
  if (caption === null || !meets(under, caption.type, 0)) {
    return { px, mp, size, word, margin: under, above: false };
  }
  const over = line(1);
  const taken = beside.some((o) => readsWith(f, over, o));
  return { px, mp, size, word, margin: taken ? null : over, above: true };
}

/** Whether a margin line would stand on another spoken word's line, inside the
 *  clear floor the scatter keeps beside one, and so be read with it. */
function readsWith(f: Frame, line: Box, o: Term): boolean {
  const size = termPx(f, o) / f.view.scale;
  return meets(line, { wx: o.wx, wy: o.wy, w: widthTenths(o.phrase, size), h: size },
    size * 1.7);
}

/** The size a spoken word is set at in this frame, floors and all. */
function termPx(f: Frame, t: Term): number {
  return Math.max(
    SCATTER_MIN_PX,
    f.view.s(t.size),
    contextDisplay(f.ctx) === "room" ? ROOM_TEXT_MIN_PX.aside : 0,
  );
}

/** Where a birth's margin line starts under its word: screen y, from the
 *  word's centre and its label's height. */
function marginTop(centre: number, height: number): number {
  return centre - height / 2 + height * 1.05;
}

/**
 * Speak the terms that are live at this instant.
 *
 * `at` is how far through the season's WRITING we are, in the same units the
 * utterance list was built in. `dim` carries the season crossfade, so the
 * outgoing season's last words recede as the new season's first arrive instead
 * of vanishing at the boundary.
 */
export function drawTerms(
  f: Frame,
  terms: Term[],
  elapsed: number,
  interval: number,
  dim: number,
  /** How much of each term may still show, for a register that has to give
   *  way to another one drawn over the same floor. */
  yieldTo?: (t: Term, set: TermSet) => number,
  /** The pin caption of the terms' own season as this frame sets it, where a
   *  caption is drawn with them. */
  caption: CaptionSet | null = null,
): void {
  const { ctx, view, dpr, remains } = f;
  if (dim <= 0.01) return;
  const spoken = Math.min(terms.length - 1, Math.floor(elapsed / interval));

  ctx.save();
  for (const t of terms) {
    if (t.j > spoken) continue;
    const age = elapsed - t.j * interval;
    if (age < 0 || age >= TERM_HOLD_SECONDS) continue;
    // Who else of this season speaks while this word is up: the same for
    // every frame of its hold, so its margin line never changes sides.
    const beside = t.bornIn
      ? terms.filter((o) => o !== t && Math.abs(o.j - t.j) * interval < TERM_HOLD_SECONDS)
      : [];
    const set = termSet(f, t, caption, beside);
    if (!set) continue;
    const fresh = 1 - age / TERM_HOLD_SECONDS;
    const alpha = remains * dim * (yieldTo ? yieldTo(t, set) : 1)
      * (TERM_ALPHA_AGED + (TERM_ALPHA_FRESH - TERM_ALPHA_AGED) * fresh);
    if (alpha <= 0.01) continue;

    // The tie: mark to word. Drawn first, so the word sits over its own line.
    ctx.strokeStyle = `rgba(${BONE_RGB}, ${alpha * TERM_TIE_ALPHA})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(view.sx(t.x), view.sy(t.y));
    ctx.lineTo(view.sx(t.wx < t.x ? t.wx + t.w : t.wx), view.sy(t.wy));
    ctx.stroke();

    // Set exactly as the archive filed it, lower-case `shot` and all: the
    // record's own inconsistent casing is a fact about the record.
    const lab = label(t.phrase, set.px, dpr);
    ctx.globalAlpha = alpha;
    ctx.drawImage(lab.canvas, view.sx(t.wx), view.sy(t.wy) - lab.height / 2,
      lab.width, lab.height);

    // A birth discloses what it is, in the margin, rather than being asserted
    // by its size alone.
    if (t.bornIn && set.margin) {
      const margin = label(`FIRST FILED ${t.bornIn}`, set.mp, dpr);
      ctx.globalAlpha = alpha * TERM_MARGIN_ALPHA;
      // Over the word it stands as far from the word's centre as under it.
      const under = marginTop(view.sy(t.wy), lab.height);
      const top = set.above ? 2 * view.sy(t.wy) - under - margin.height : under;
      ctx.drawImage(margin.canvas, view.sx(t.wx), top, margin.width, margin.height);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/**
 * Where each line of a name's figure block starts, down-screen from the name's
 * centre, in whatever unit `size` is given in. `nameHeight` and `lineHeight`
 * are the heights of the name's label and of one figure line's label.
 *
 * One geometry, two readers: `drawPublishedInstead` strikes the figures from it
 * in pixels, and `figureBoxes` hands the same lines, in court tenths, to the
 * registers that must not speak through them.
 */
function figureTops(lines: number, size: number, nameHeight: number, lineHeight: number): number[] {
  // The recovered-set scope is the only multi-line value. Both display
  // profiles place that block above its heading: below it sits the inner
  // arc, and the earlier layout ran this evidence through DRIVES at the
  // completed crest.
  const first = lines > 1
    ? -nameHeight * 0.75 - lines * size * 1.35
    : nameHeight * 0.75;
  return Array.from({ length: lines }, (_, k) => first + k * lineHeight);
}

/**
 * The window's figures, line by line, as boxes in COURT TENTHS — the lines the
 * names carry beneath (or, for the scoped share, above) them. The names alone
 * were the obstacles, so a spoken phrase could still be struck straight through
 * a figure.
 *
 * At the unfloored court size, like every other box here: the figures are a
 * function of the window file alone, and the memo's key says whether that file
 * is resident, which keeps them inside its contract. A line sits where `label` would set it; the box takes the
 * same height convention as every other Box.
 */
function figureBoxes(data: Loaded, names: string[], boxes: Box[]): Box[] {
  const values = windowValues(data.window);
  const size = LEAGUE_NAME_TENTHS;
  const valueSize = size * LEAGUE_VALUE_SCALE;
  const out: Box[] = [];
  names.forEach((name, i) => {
    const v = values.get(name);
    const box = boxes[i];
    if (!v || !box) return;
    const tops = figureTops(v.length, size, size * LABEL_LINE_HEIGHT,
      valueSize * LABEL_LINE_HEIGHT);
    const spans = v.map((line) => widthTenths(line, valueSize));
    const block = v.length > 1 ? Math.max(...spans) : 0;
    const cx = box.wx + box.w / 2;
    v.forEach((_, k) => {
      out.push({
        // A scoped block shares one left edge; a single figure is centred.
        wx: cx - (block > 0 ? block : spans[k]!) / 2,
        // Screen-down offsets, so court y goes the other way.
        wy: box.wy - (tops[k]! + valueSize * LABEL_LINE_HEIGHT / 2),
        w: spans[k]!,
        h: valueSize * 1.7,
      });
    });
  });
  return out;
}

/** The league's names hold the middle of the floor for Acts III and V, so in
 *  those acts they are obstacles the plate has to speak around — and in the
 *  window, so are the figures struck with them, once the file that carries
 *  them is resident. Part of the memo's contract rather than a local
 *  convenience — see `ledgerUtterances` and `layoutKey`. */
function leagueObstacles(data: Loaded, year: number): Box[] {
  if (actOf(year) !== 3 && actOf(year) !== 5) return [];
  const names = publishedInstead(data);
  const boxes = leagueBoxes(names);
  return actOf(year) === 3 ? [...boxes, ...figureBoxes(data, names, boxes)] : boxes;
}

/** The caption sits three feet below the pile it names, in court tenths.
 *  Shared by `drawPinLabel` and `pinCaptionBox` so the drawn caption and the
 *  box the register avoids cannot drift apart. */
const PIN_CAPTION_DROP = 30;

/**
 * The pin caption's footprint, in COURT TENTHS, derived from the SEASON alone.
 *
 * Until 2026-08-09 the refusal's one caption was in nobody's collision set —
 * `utterancesFor`'s fixed obstacles were the league boxes only, `drawLabels`'
 * live set was terms plus league boxes — so in the act the piece dilates a
 * birth term's margin line and a scatter label struck straight through it.
 * The rect joins both sets now, from this one derivation.
 *
 * Every input is the season's: the sentinel's final count (the caption's widest
 * state — conservative while the count is still growing, and free of `t`), the
 * head of the same pile, and the statement rank's size in tenths. Nothing from
 * the viewport or the hand, which is what lets the box join the year-keyed
 * memo — see `ledgerUtterances`. Width adds `drawSlug`'s own per-character
 * letter-spacing fraction, which `widthTenths`'s ruler does not apply.
 *
 * `size` and `lift` describe the caption as one frame actually sets it — its
 * type floored, and stood up off the plate's edge — for the readers that work
 * at draw time, and `leading` is a line's height as a multiple of its size.
 * The memo never passes them.
 */
function pinCaptionBox(
  season: Season,
  size = SLUG_STATEMENT_TENTHS,
  lift = 0,
  leading = 1.7,
): Box | null {
  const sentinel = season.resolution.rim_sentinel;
  if (!sentinel || !sentinel.is_refusal) return null;
  const lines = [`${sentinel.n.toLocaleString()} SHOTS · NO PLACE GIVEN`];
  const refused = Object.keys(season.resolution.refused_action_types)[0];
  if (refused) lines.push(refused.toUpperCase());
  const w = Math.max(...lines.map((l) => widthTenths(l, size) + 0.14 * size * l.length));
  // `drawSlug` stacks lines down-screen, and screen-down is DECREASING court
  // y, so the second line sits one line-advance below the anchor in court
  // terms. Height uses the same line-height convention as every other Box here.
  const drop = (lines.length - 1) * 1.9 * size;
  return {
    wx: sentinel.coord[0] - w / 2,
    wy: sentinel.coord[1] - PIN_CAPTION_DROP + lift - drop / 2,
    w,
    h: drop + size * leading,
  };
}

/**
 * How the pin caption is set in this frame: `drawSlug`'s own size for the
 * statement rank, floors and all, and how many pixels the block stands up so
 * its last line stays on the plate.
 *
 * The caption hangs a fixed drop under its pile in court units, but its type
 * has pixel floors and its lines advance by the floored size, so where a floor
 * binds the second line hung through the baseline. It still hangs from the
 * same place wherever it fits; where it would not, it stands on the edge of
 * the box the record is clipped to instead, its lines stacked up from there.
 */
function pinCaptionSet(f: Frame, lines: number, anchorY: number): { px: number; lift: number } {
  const { ctx, view } = f;
  const room = contextDisplay(ctx) === "room";
  const px = Math.max(
    SLUG_MIN_PX,
    view.s(SLUG_STATEMENT_TENTHS),
    room ? ROOM_TEXT_MIN_PX.statement : 0,
  );
  const bottom = view.sy(anchorY) + (lines - 1) * px * 1.9 + px / 2;
  return { px, lift: Math.max(0, bottom - view.sy(COURT.y0)) };
}

/** The pin caption's footprint as this frame sets it: type floored and the
 *  block stood up, for every reader that works at draw time. */
function pinCaptionAsSet(f: Frame, season: Season): CaptionSet | null {
  const sentinel = season.resolution.rim_sentinel;
  if (!sentinel) return null;
  const lines = Object.keys(season.resolution.refused_action_types).length ? 2 : 1;
  const set = pinCaptionSet(f, lines, sentinel.coord[1] - PIN_CAPTION_DROP);
  const size = set.px / f.view.scale;
  const lift = set.lift / f.view.scale;
  const box = pinCaptionBox(season, size, lift);
  const type = pinCaptionBox(season, size, lift, 1);
  return box && type ? { box, type } : null;
}

/**
 * What this season says, and when — the whole of the spoken register, in one
 * place, so that two hands cannot ask for it two different ways.
 *
 * THIS EXISTS BECAUSE OF A CACHE HAZARD, not for tidiness. `utterancesFor`
 * memoises by the year and the window file's residency, never the viewport, and
 * that key is the invariant that keeps the plate speaking the same words on
 * every screen — but it is only sound while every caller passes the same
 * `writingSeconds` and the same `fixed` boxes for a given key. THE STACK's NAME THE ACTION is the second caller this file has ever had.
 * Had it computed its own obstacle set, the memo would have handed whichever
 * hand asked FIRST its own layout and the other hand a layout built for someone
 * else, silently, for the life of the page — and the purity probe could
 * not have caught it, because both hands would be consistent with themselves.
 *
 * So there is one derivation and both hands call it. That the two hands then
 * speak the same words in the same places is not a side effect to apologise for:
 * it is one measurement, read twice, which is what the rest of this piece does
 * with `WINDOW_BEATS` and with `covering_90pct`.
 */
export function ledgerUtterances(
  f: Frame,
  year: number,
): { terms: Term[]; interval: number; elapsed: number; heldElapsed: number } | null {
  const { data, schedule } = f;
  const season = data.byYear.get(year);
  const sample = data.samples.get(year);
  const seg = schedule.byYear.get(year);
  if (!season || !sample || !seg) return null;
  // A season spends `ARRIVAL_TAIL` of itself being written; the utterances are
  // spread over exactly that, so a term lands with the marks it describes.
  const isWindow = f.st.act === 3 && f.st.year === year;
  const secs = isWindow
    ? windowSecondAtPhase(LEDGER_WINDOW_WRITING_SPAN.to)
      - windowSecondAtPhase(LEDGER_WINDOW_WRITING_SPAN.from)
    : seg.duration * ARRIVAL_TAIL;
  // The fixed obstacles: the league's boxes (a function of the act, so of the
  // year, and in the window of the window file) and the pin's caption (a
  // function of the season). None is a property of the hand or the viewport, so
  // the memo in `utterancesFor` stays sound with the pin rect enrolled — every
  // caller receives the same obstacle set for a given key, by construction.
  const pinBox = pinCaptionBox(season);
  const fixed = pinBox
    ? [...leagueObstacles(data, year), pinBox]
    : leagueObstacles(data, year);
  const terms = utterancesFor(layoutKey(data, year), season, sample, data.seasons, secs, fixed);
  const interval = secs / Math.max(1, terms.length);
  const remnant = isWindow ? ledgerWindowRemnant(f.st.phase) : null;
  const elapsed = isWindow
    ? (f.st.phase < LEDGER_WINDOW_WRITING_SPAN.from
      ? -1
      : secs * (remnant ?? ledgerWindowWritingProgress(f.st.phase)))
    : (f.st.year === year ? f.st.phase * seg.duration : secs);
  return {
    terms,
    interval,
    elapsed,
    // THE STACK holds a deterministic final utterance; it does not inherit the
    // season clock merely because its words come from this shared derivation.
    heldElapsed: terms.length ? terms[terms.length - 1]!.j * interval : 0,
  };
}

/**
 * THE LEDGER CLOSES, day-keyed (decided 2026-08-10): in the close the ledger
 * withdraws rather than holding, paced on the window's own calendar.
 * The close un-writes the register the way the season wrote it: the WRITING
 * PHASE run backwards on the register's own easing —
 * `pRem(closeU) = ARRIVAL_TAIL × (1 − seasonClock(closeU))` — so every
 * departure is statable on the calendar the fold keeps, and strict reverse
 * arrival order IS reverse calendar order. The naive 89-day unwind was
 * measured and rejected: everything the ledger wrote arrived early in the
 * calendar, which leaves most of the close silent — exactly the dead air the
 * close must not have. Draw-time only: the year-keyed utterance memo and
 * every exported symbol are untouched (THE STACK is a second caller), and
 * the close's first frame is byte-identical to the pre-close frame because
 * `1 − seasonClock(0)` is exactly 1.
 */
function closeRemnant(f: Frame): number | null {
  const { st } = f;
  if (st.act !== 3) return null;
  return ledgerWindowRemnant(st.phase);
}

export function drawLedgerHand(f: Frame): void {
  const { st, data, remains } = f;
  const year = st.year!;
  const season = data.byYear.get(year)!;
  const sample = data.samples.get(year);

  // The marks recede: here the description is the subject, and the dot is what
  // the description is about.
  drawSeasonField(f, { dim: remains * 0.42, reveal: true, prewarm: true });

  // The labels still address the fixed-seed sample, and must. At full density a
  // label would live a fraction of a frame - the arrival window advances far
  // faster than a reader - so the field beneath is every shot while the writing
  // keeps to a pace a reader can follow.
  // THE SPOKEN REGISTER, over the scatter.
  //
  // The outgoing season's last words recede as this season's first arrive, the
  // way `drawSeasonField` already treats the marks - without it the plate would
  // snap every time a season turned over, which at three feet is the most
  // noticeable event on it.
  // The outgoing season's last words, still receding. `ledgerUtterances`
  // returns its `elapsed` at the END of the writing for a season that is not
  // the current one, which is what the explicit `secs` here used to say.
  //
  // Each season is laid out against its own words only, so the receding words
  // know nothing of the arriving ones. They give way here, at draw time and
  // never in the year-keyed layout: a receding word goes the moment an arriving
  // word lands on it, and dims as an arriving heading over it comes up.
  //
  // The caption is the other thing they cannot know: each word is set against
  // its own season's caption as this frame sets it, and a receding one gives
  // way to the arriving season's as well.
  const here = ledgerUtterances(f, year);
  const caption = sample && here ? pinCaptionAsSet(f, season) : null;
  const previousArrival = st.act === 3 ? windowEntryProgress(st.phase) : st.arrived;
  if (st.prev !== null && previousArrival < 1) {
    const out = ledgerUtterances(f, st.prev);
    const before = data.byYear.get(st.prev);
    if (out) {
      drawTerms(f, out.terms, out.elapsed, out.interval, 1 - previousArrival,
        giveWayTo(f, year, sample ? here : null, caption),
        before ? pinCaptionAsSet(f, before) : null);
    }
  }
  let speaking: Box[] = [];
  if (sample && here) {
    const { terms, interval, elapsed } = here;
    // A word the caption leaves no room for is not spoken, so it holds no
    // floor against the scatter either.
    speaking = terms.filter((t) => {
      const age = elapsed - t.j * interval;
      return age >= 0 && age < TERM_HOLD_SECONDS && termSet(f, t, caption) !== null;
    });
    // The league's names hold their ground against the grain too. They are the
    // whole of Act V's argument and a scatter label running through PASSING
    // makes them one more piece of noise. The pin's caption holds its ground
    // the same way — the same box the spoken register avoids, from the same
    // derivation, so the two readers cannot disagree about where it stands.
    speaking = [...speaking, ...leagueObstacles(data, year)];
    // At draw time the box is the caption as this frame sets it.
    if (caption) speaking = [...speaking, caption.box];

    // The scatter goes down FIRST and yields wherever a term is speaking, so
    // the big register has the local emptiness that makes it read.
    // In the close the conveyor runs BACKWARDS through the whole sample on
    // the raw mirrored easing — accelerando mirrored, motion every second of
    // the close. Deliberately NOT re-wrapped in the arrival's smoothstep:
    // its zero derivative at the boundary would hold the conveyor still for
    // the close's first seconds, exactly the dead air the close must not have
    // (measured: two share8-zero seconds with it, none without). Value
    // continuity at the boundary — the byte-identity that matters — needs
    // only rem(0) = 1, which the raw easing gives exactly.
    const rem = closeRemnant(f);
    const writing = st.act === 3 ? ledgerWindowWritingProgress(st.phase) : st.arrived;
    const edge = rem === null ? writing : rem;
    drawLabels(f, sample, season, speaking, edge);
    // The pile, named once. Labels stacked on a single point would be a
    // rendering bug; one line saying how many shots the record declined to
    // place is the fact itself.
    drawPinLabel(f, season, edge);
    // Reversing the register makes the first utterance freshest at the very
    // end; fade that final edge with the same spacing as the first heading so
    // CLOSE reaches an actually empty ledger instead of snapping one word off.
    const termVisible = rem === null
      ? 1
      : Math.max(0, Math.min(1, rem * Math.max(1, terms.length)));
    drawTerms(f, terms, elapsed, interval, termVisible, undefined, caption);
  }

  // Act III shows the same published names carrying real recomputed values;
  // Act V shows them bare. That contrast IS the argument, so both call the
  // same code.
  if (st.act === 3 || st.act === 5) drawPublishedInstead(f, st.act === 3);

  // The Act II boundary named. Act V is omitted: the league's published
  // names arriving over the scatter IS this hand's Act V event.
  drawActCue(f, 2);
}

/**
 * What share of a receding word may still show under what the arriving season
 * has put down by this instant.
 *
 * Every word the arriving season has spoken so far covers, not only the ones
 * still up: a receding word that returned when the word over it expired would
 * be the old season speaking again. An arriving heading covers as far as it
 * has come up, by the same law that draws it. The test is the one the layout
 * itself uses, at the receding word's own clearance.
 *
 * The arriving season's pin caption covers too, whole and from the season's
 * first frame, so nothing under it leaves when its count first reads: a
 * receding word it would meet as this frame sets both, or the margin line of a
 * receding birth, goes with the turnover. So does a receding birth whose
 * margin line, stood over its word, an arriving word has landed beside.
 */
function giveWayTo(
  f: Frame,
  year: number,
  here: ReturnType<typeof ledgerUtterances>,
  caption: CaptionSet | null,
): (t: Term, set: TermSet) => number {
  const covers: { box: Box; presence: number }[] = [];
  const landed: Term[] = [];
  if (here) {
    for (const t of here.terms) {
      if (here.elapsed - t.j * here.interval >= 0) {
        covers.push({ box: t, presence: 1 });
        landed.push(t);
      }
    }
  }
  if (actOf(year) === 3 || actOf(year) === 5) {
    const boxes = leagueBoxes(publishedInstead(f.data));
    const presence = headingPresence(f, actOf(year) === 3, boxes.length);
    boxes.forEach((box, i) => {
      if (presence[i]! > 0) covers.push({ box, presence: presence[i]! });
    });
  }
  return (t, set) => {
    if (caption && (meets(set.word, caption.type, TERM_CLEAR_PAD * set.size)
      || (set.margin && meets(set.margin, caption.type, 0)))) return 0;
    if (set.above && set.margin && landed.some((o) => readsWith(f, set.margin!, o))) return 0;
    const pad = TERM_CLEAR_PAD * t.size;
    let left = 1;
    for (const c of covers) {
      if (overlaps(t, c.box, pad)) left = Math.min(left, 1 - c.presence);
    }
    return left;
  };
}

function drawLabels(
  f: Frame,
  sample: Sample,
  season: Season,
  live: Box[],
  /** How far through the sample the writing edge stands — `st.arrived` while
   *  the season writes, the close's remnant while it un-writes. */
  arrived: number,
): void {
  const { ctx, view, dpr, remains } = f;
  const px = Math.max(SCATTER_MIN_PX, view.s(SCATTER_TENTHS));
  const vocab = sample.action_vocab;
  const budget = labelBudget(season);

  // Labels trail the arrival edge: the record is being written, and the scribe
  // annotates what has just landed. Older marks keep their dot and lose their
  // description, which is also how an archive behaves.
  const arrivedCount = Math.ceil(sample.n * Math.min(1, Math.max(0, arrived)));
  const from = Math.max(0, arrivedCount - budget);

  ctx.save();
  for (let i = from; i < arrivedCount; i++) {
    // Origin-filed shots are held out; they are named collectively by the pin.
    if (sample.pin[i] === 1) continue;
    const text = vocab[sample.action[i] ?? -1];
    if (!text) continue;

    // Newest are brightest, so the eye follows the writing rather than swimming.
    // The ceiling is lower than it was: this register is grain now, and it has
    // to sit under the spoken one rather than compete with it.
    const age = (arrivedCount - i) / budget;
    const alpha = (1 - age) * SCATTER_ALPHA * remains;
    if (alpha <= 0.02) continue;

    // A scatter label inside a spoken term's box is what turns a large word
    // back into noise. Local emptiness is most of why the big register reads.
    // The label runs rightward from just past its mark, so it is the span it
    // is set on that is tested, not the mark: from the mark's side a label
    // reaches a box its point never enters. Nor may it run off the plate.
    const x = sample.x[i]!;
    const y = sample.y[i]!;
    const lab = label(text, px, dpr);
    const lead = px * 0.6;
    const x0 = x + lead / view.scale;
    const x1 = x0 + lab.width / view.scale;
    if (x1 > COURT.x1) continue;
    if (live.some((b) => x1 >= b.wx - b.h && x0 <= b.wx + b.w + b.h
      && Math.abs(y - b.wy) <= b.h)) continue;

    ctx.globalAlpha = alpha;
    ctx.drawImage(lab.canvas, view.sx(x) + lead, view.sy(y) - lab.height / 2,
      lab.width, lab.height);
  }
  ctx.restore();
}

/**
 * The pile, named once.
 *
 * BOTH HALVES OF THIS SENTENCE MUST COME FROM THE SAME POPULATION, and until
 * 2026-08-09 they did not. The count read `origin_snapped` and the name read
 * `refused_action_types`, which was also derived at the exact origin — so in
 * 2017-18 through 2019-20 the plate named the handful of stragglers still filed
 * at (0,0) and gave their action type, for a season whose real refusal was
 * `rim_sentinel.n` shots a few tenths away; and in 2014-15 through 2016-17 it
 * said nothing at all. Now the count is the sentinel's own `n` and the name is
 * the head of that same pile.
 */
function drawPinLabel(f: Frame, season: Season, arrived: number): void {
  const { ctx, view, remains } = f;
  const sentinel = season.resolution.rim_sentinel;
  if (!sentinel || !sentinel.is_refusal) return;

  // The season's own measured count of refused shots, grown with arrival - not
  // a number scaled off a sample.
  const count = Math.round(sentinel.n * Math.min(1, Math.max(0, arrived)));
  if (count === 0) return;

  // What the record refused to place, and what it called those shots. Both come
  // from the season's own measurement, of the same cell.
  const refused = Object.keys(season.resolution.refused_action_types)[0];
  const lines = [`${count.toLocaleString()} SHOTS · NO PLACE GIVEN`];
  if (refused) lines.push(refused.toUpperCase());
  // Under the pile it names, wherever the record filed it - a caption anchored
  // three feet below the origin would sit under nothing in six seasons. The
  // drop is shared with `pinCaptionBox`, whose rect is what keeps the spoken
  // register and the scatter out of these two lines.
  const anchorY = sentinel.coord[1] - PIN_CAPTION_DROP;
  const { lift } = pinCaptionSet(f, lines.length, anchorY);
  drawSlug(ctx, view, lines, { x: sentinel.coord[0], y: anchorY }, remains * 0.85,
    "statement", -lift);
}

/** A heading enters at the start of its lane and finishes by the next one. */
function windowHeadingArrival(writing: number, count: number, index: number): number {
  const lane = writing * count - index;
  return lane <= 0 ? 0 : Math.min(1,
    LEAGUE_ARRIVAL_K + (1 - LEAGUE_ARRIVAL_K) * lane);
}

/**
 * How far each published name stands up at this instant, in `names` order:
 * its arrival times its departure. One law, read by the names' own draw and by
 * the receding season's words that give way to them.
 */
function headingPresence(f: Frame, inWindow: boolean, count: number): number[] {
  const { st } = f;
  // THE LEDGER WITHDRAWS: in the close each heading and recomputed figure
  // departs on the reverse of the accumulation law that brought it —
  // strict reverse arrival order, eased over exactly one name's spacing, so
  // the last figure written is the first to leave and every heading stands
  // absent at wash 1. Act V later rebuilds the surviving bare headings from
  // this same function. Per-NAME, never per-line: a scope tag departing separately
  // from its share would leave, for a moment, a recovered-set share standing
  // without the scope that keeps it honest. Each departure is statable on the
  // fold's own calendar — value i completes leaving when the reverse clock
  // reads (i / names) of the window's days.
  const rem = closeRemnant(f);
  // They accumulate across the act and settle into the mid-range, which by this
  // point in the piece is very nearly empty: the derived measures occupy exactly
  // the space the geometry vacated.
  const writing = inWindow ? ledgerWindowWritingProgress(st.phase) : st.phase * LEAGUE_ACCUM_K;
  const shown = inWindow ? count : Math.min(count, Math.ceil(writing * count));
  // The coda lifts the completed ring over every hand, and the ring runs
  // between these two arcs. The names leave first, together, inside the share
  // of the coda's clock that the close gives a single name to leave in, so the
  // ring comes up over a ledger that has already emptied rather than through it.
  const coda = Math.max(0, 1 - st.coda * count);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const arriving = i >= shown ? 0 : inWindow
      ? windowHeadingArrival(writing, count, i)
      : Math.min(1, (shown - i) * LEAGUE_ARRIVAL_K);
    const departing = inWindow && rem !== null
      ? Math.max(0, Math.min(1, rem * count - i))
      : 1;
    out.push(arriving * departing * coda);
  }
  return out;
}

/**
 * The published names, with or without their values.
 *
 * `inWindow` is the whole point. Inside the window the names carry figures this
 * project recomputed from the optical record; after it the same names appear
 * bare, because the geometry that makes them stopped being published. The piece
 * states its Act V claim once and then, for the one season that can,
 * demonstrates it instead.
 */
function drawPublishedInstead(f: Frame, inWindow: boolean): void {
  const { ctx, view, dpr, st, data, remains } = f;
  const room = contextDisplay(ctx) === "room";
  // UNIFORM, AND LARGER THAN THE SCATTER, AND THAT IS THE ARGUMENT.
  //
  // These were drawn at the size of an action label, among the whole scatter of
  // them, so Act V's claim was invisible on the plate. They are now a
  // rank of their own - and all ONE size, because every other word this hand
  // speaks is sized by how many shots it names and these cannot be: the record
  // beneath them is not public. The typography carries the claim; the slug
  // states it.
  const px = Math.max(
    SCATTER_MIN_PX,
    view.s(LEAGUE_NAME_TENTHS),
    room ? ROOM_TEXT_MIN_PX.statement : 0,
  );
  const values = inWindow ? windowValues(data.window) : new Map<string, string[]>();
  const names = publishedInstead(data);
  const rem = closeRemnant(f);
  const writing = inWindow ? ledgerWindowWritingProgress(st.phase) : st.phase * LEAGUE_ACCUM_K;
  const presence = headingPresence(f, inWindow, names.length);

  // Two arcs, because one cannot hold all the phrases without them running off
  // the floor. Both sit inside the mid-range band, which by Act V is very nearly
  // empty - `mid_share` says how nearly. The names occupy that emptiness, and
  // the spoken register reads these SAME boxes so it does not speak through them.
  const boxes = leagueBoxes(names);
  ctx.save();
  for (let i = 0; i < names.length; i++) {
    const visible = presence[i]!;
    if (visible <= 0.01) continue;
    const text = names[i]!;
    const lab = label(text, px, dpr);
    const box = boxes[i]!;
    const x = view.sx(box.wx + box.w / 2);
    const y = view.sy(box.wy);
    ctx.globalAlpha = remains * LEAGUE_NAME_ALPHA * visible;
    ctx.drawImage(lab.canvas, x - lab.width / 2, y - lab.height / 2, lab.width, lab.height);

    // The value, when there is one to show, struck beneath its own name —
    // line by line, so a scope-tagged value stacks instead of running wide
    // into its neighbour's figure.
    const v = values.get(text);
    if (v) {
      if (visible > 0.01) {
        ctx.globalAlpha = remains * LEAGUE_VALUE_ALPHA * visible;
        const valueLabels = v.map((line) => label(
          line,
          Math.max(
            px * LEAGUE_VALUE_SCALE,
            room ? ROOM_TEXT_MIN_PX.aside : 0,
          ),
          dpr,
        ));
        const blockWidth = valueLabels.length > 1
          ? Math.max(...valueLabels.map((valueLabel) => valueLabel.width))
          : 0;
        const tops = figureTops(v.length, px, lab.height, valueLabels[0]!.height);
        valueLabels.forEach((vl, k) => {
          // A scoped value is one evidence block, not two unrelated captions.
          // Both lines share a left edge so the shorter share reads at once
          // with its longer scope statement.
          const vx = blockWidth > 0 ? x - blockWidth / 2 : x - vl.width / 2;
          ctx.drawImage(vl.canvas, vx, y + tops[k]!, vl.width, vl.height);
        });
      }
    }
  }
  ctx.restore();

  // The window's own span, from the corpus's first and last dates - never
  // restated. This slug used to name an interval nobody had checked against
  // them, and it was wrong by nearly two weeks.
  const days = factNum(data.facts, "window.days_inclusive");
  const slug = inWindow
    ? ["RECOMPUTED FROM THE RAW RECORD",
       `${days} DAYS · ONE RECONSTRUCTION, NOT THE LEAGUE'S`]
    : ["PUBLISHED INSTEAD OF THE GEOMETRY", "THE NUMBERS REMAIN · THE RECORD BENEATH THEM DOES NOT"];
  const slugVisible = inWindow
    ? windowHeadingArrival(writing, names.length, 0)
      * (rem === null ? 1 : Math.max(0, Math.min(1, rem * names.length)))
    : 1;
  drawSlug(ctx, view, slug, { x: 0, y: 395 }, remains * slugVisible * 0.5);
}
