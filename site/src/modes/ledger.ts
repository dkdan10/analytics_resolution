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
import { label } from "../textatlas";
import { drawSeasonField } from "./fieldlayer";
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
 * own content. They now come from `facts.json:external.published_instead`,
 * where each one carries the endpoint it is cited to - PtMeasureType values of
 * LeagueDashPtStats, plus PlayerDashPtShots, SynergyPlayTypes and HustleStats,
 * all from docs/build-plan-v2.md section 1.4-1.5.
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
function windowValues(w: WindowFile | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!w) return out;
  const inv = w.inventory;
  const widest = w.contest.buckets[w.contest.buckets.length - 1];
  if (widest) {
    // A recovered-set proportion, so it is shown as one: the share carries the
    // scope tag the pipeline templated from its own coverage figure, and the
    // reader is never handed it as if it described the season (audit F-12).
    const scope = w.bias.scope ? ` · ${w.bias.scope}` : "";
    out.set("CLOSEST DEFENDER",
      `${(100 * widest.share).toFixed(1)}% ${widest.name.toUpperCase()}${scope}`);
  }
  out.set("SPEED & DISTANCE", `${inv.miles_run.toLocaleString()} MI`);
  if (inv.per_game.drives !== null) out.set("DRIVES", `${inv.per_game.drives}/GAME`);
  if (inv.per_game.touches !== null) out.set("TOUCHES", `${inv.per_game.touches}/GAME`);
  if (inv.per_game.passes !== null) out.set("PASSING", `${inv.per_game.passes}/GAME`);
  if (inv.mean_seconds_per_touch !== null) {
    out.set("POSSESSIONS", `${inv.mean_seconds_per_touch}S/TOUCH`);
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

function leagueBoxes(names: string[]): Box[] {
  const perArc = Math.ceil(names.length / 2);
  return names.map((text, i) => {
    const arc = i < perArc ? 0 : 1;
    const k = arc === 0 ? i : i - perArc;
    const count = arc === 0 ? perArc : names.length - perArc;
    const a = Math.PI - ((k + 0.5) / count) * Math.PI;
    const r = arc === 0 ? LEAGUE_ARC_INNER : LEAGUE_ARC_OUTER;
    const w = widthTenths(text, LEAGUE_NAME_TENTHS);
    return {
      // Centred on the arc, so the box's left edge is half a width back.
      wx: r * Math.cos(a) - w / 2,
      wy: r * Math.sin(a),
      w,
      h: LEAGUE_NAME_TENTHS * 1.7,
    };
  });
}

function labelBudget(season: Season): number {
  const varied = season.vocabulary.words_covering_90pct / CALMEST_WORDS_90;
  return Math.max(12, Math.min(MAX_LABELS, Math.round(LABELS_AT_CALMEST * varied)));
}

// --- THE SPOKEN TERM ---------------------------------------------------------
//
// The audit read this hand's failure as COUNT — "dozens of labels" — and asked
// for a small sequence of monumental terms instead. Both halves of that are
// wrong for this piece. The count is the one part of the hand that is measured:
// it is `words_covering_90pct`, which is the hand's whole argument. And a
// curated word list is authored content, which rule 3 forbids outright.
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
 * not be keyed on the year alone and the plate would speak different words on
 * different screens.
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
 * and CLAUDE.md forbids the pattern by name.
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
 * The season's whole utterance list, memoised BY YEAR ALONE.
 *
 * That key is the invariant, not a convenience: every quantity below derives
 * from the season, the fixed-seed sample and the schedule, and none of it from
 * the viewport. If this ever needed `view.scale` in its key, the layout would
 * have been done in pixels somewhere and the plate would say different words on
 * different screens.
 */
const utterances = new Map<number, Term[]>();

function utterancesFor(
  year: number,
  season: Season,
  sample: Sample,
  seasons: Season[],
  writingSeconds: number,
  /** Boxes already spoken for all act long - the league's names, in Acts III
   *  and V. A function of the act, which is a function of the year, so the
   *  memo key stays the year alone. */
  fixed: Box[],
): Term[] {
  const hit = utterances.get(year);
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
  utterances.set(year, out);
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

/**
 * Speak the terms that are live at this instant.
 *
 * `at` is how far through the season's WRITING we are, in the same units the
 * utterance list was built in. `dim` carries the season crossfade, so the
 * outgoing season's last words recede as the new season's first arrive instead
 * of vanishing at the boundary.
 */
function drawTerms(f: Frame, terms: Term[], elapsed: number, interval: number, dim: number): void {
  const { ctx, view, dpr, remains } = f;
  if (dim <= 0.01) return;
  const spoken = Math.min(terms.length - 1, Math.floor(elapsed / interval));

  ctx.save();
  for (const t of terms) {
    if (t.j > spoken) continue;
    const age = elapsed - t.j * interval;
    if (age < 0 || age >= TERM_HOLD_SECONDS) continue;
    const fresh = 1 - age / TERM_HOLD_SECONDS;
    const alpha = remains * dim
      * (TERM_ALPHA_AGED + (TERM_ALPHA_FRESH - TERM_ALPHA_AGED) * fresh);
    if (alpha <= 0.01) continue;

    // The tie: mark to word. Drawn first, so the word sits over its own line.
    ctx.strokeStyle = `rgba(${BONE_RGB}, ${alpha * TERM_TIE_ALPHA})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(view.sx(t.x), view.sy(t.y));
    ctx.lineTo(view.sx(t.wx < t.x ? t.wx + t.w : t.wx), view.sy(t.wy));
    ctx.stroke();

    const px = Math.max(SCATTER_MIN_PX, view.s(t.size));
    // Set exactly as the archive filed it, lower-case `shot` and all: the
    // record's own inconsistent casing is a fact about the record.
    const lab = label(t.phrase, px, dpr);
    ctx.globalAlpha = alpha;
    ctx.drawImage(lab.canvas, view.sx(t.wx), view.sy(t.wy) - lab.height / 2,
      lab.width, lab.height);

    // A birth discloses what it is, in the margin, rather than being asserted
    // by its size alone.
    if (t.bornIn) {
      const mp = Math.max(SCATTER_MIN_PX * 0.8, px * TERM_MARGIN_SCALE);
      const margin = label(`FIRST FILED ${t.bornIn}`, mp, dpr);
      ctx.globalAlpha = alpha * TERM_MARGIN_ALPHA;
      ctx.drawImage(margin.canvas, view.sx(t.wx),
        view.sy(t.wy) - lab.height / 2 + lab.height * 1.05, margin.width, margin.height);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

export function drawLedgerHand(f: Frame): void {
  const { st, data, schedule, remains } = f;
  const year = st.year!;
  const season = data.byYear.get(year)!;
  const sample = data.samples.get(year);

  // The marks recede: here the description is the subject, and the dot is what
  // the description is about.
  drawSeasonField(f, { dim: remains * 0.42 });

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
  const writing = (seg: number) => seg * ARRIVAL_TAIL;
  // The league's names hold the middle of the floor for Acts III and V, so in
  // those acts they are obstacles the plate has to speak around.
  const obstacles = (y: number) =>
    actOf(y) === 3 || actOf(y) === 5 ? leagueBoxes(publishedInstead(data)) : [];

  if (st.prev !== null && st.arrived < 1) {
    const prevSeason = data.byYear.get(st.prev);
    const prevSample = data.samples.get(st.prev);
    const prevSeg = schedule.byYear.get(st.prev);
    if (prevSeason && prevSample && prevSeg) {
      const secs = writing(prevSeg.duration);
      const terms = utterancesFor(st.prev, prevSeason, prevSample, data.seasons, secs,
        obstacles(st.prev));
      drawTerms(f, terms, secs, secs / Math.max(1, terms.length), 1 - st.arrived);
    }
  }
  let speaking: Box[] = [];
  if (sample) {
    const seg = schedule.byYear.get(year)!;
    const secs = writing(seg.duration);
    const terms = utterancesFor(year, season, sample, data.seasons, secs, obstacles(year));
    const interval = secs / Math.max(1, terms.length);
    const elapsed = st.phase * seg.duration;
    speaking = terms.filter((t) => {
      const age = elapsed - t.j * interval;
      return age >= 0 && age < TERM_HOLD_SECONDS;
    });
    // The league's names hold their ground against the grain too. They are the
    // whole of Act V's argument and a scatter label running through PASSING
    // makes them one more piece of noise.
    speaking = [...speaking, ...obstacles(year)];

    // The scatter goes down FIRST and yields wherever a term is speaking, so
    // the big register has the local emptiness that makes it read.
    drawLabels(f, sample, season, speaking);
    // The pile, named once. Labels stacked on a single point would be a
    // rendering bug; one line saying how many shots the record declined to
    // place is the fact itself.
    drawPinLabel(f, season);
    drawTerms(f, terms, elapsed, interval, 1);
  }

  // Act III shows the same published names carrying real recomputed values;
  // Act V shows them bare. That contrast IS the argument, so both call the
  // same code.
  if (st.act === 3 || st.act === 5) drawPublishedInstead(f, st.act === 3);
}

function drawLabels(f: Frame, sample: Sample, season: Season, live: Box[]): void {
  const { ctx, view, dpr, st, remains } = f;
  const px = Math.max(SCATTER_MIN_PX, view.s(SCATTER_TENTHS));
  const vocab = sample.action_vocab;
  const budget = labelBudget(season);

  // Labels trail the arrival edge: the record is being written, and the scribe
  // annotates what has just landed. Older marks keep their dot and lose their
  // description, which is also how an archive behaves.
  const arrivedCount = Math.ceil(sample.n * Math.min(1, Math.max(0, st.arrived)));
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
    const x = sample.x[i]!;
    const y = sample.y[i]!;
    if (live.some((b) => x >= b.wx - b.h && x <= b.wx + b.w + b.h
      && Math.abs(y - b.wy) <= b.h)) continue;

    const lab = label(text, px, dpr);
    ctx.globalAlpha = alpha;
    ctx.drawImage(
      lab.canvas,
      view.sx(x) + px * 0.6,
      view.sy(y) - lab.height / 2,
      lab.width,
      lab.height,
    );
  }
  ctx.restore();
}

function drawPinLabel(f: Frame, season: Season): void {
  const { ctx, view, st, remains } = f;
  // The season's own measured count of unplaced shots, grown with arrival -
  // `resolution.origin_snapped`, not a number scaled off a sample.
  const count = Math.round(
    season.resolution.origin_snapped * Math.min(1, Math.max(0, st.arrived)),
  );
  if (count === 0) return;

  // What the record refused to place, and what it called those shots. Both come
  // from the season's own measurement.
  const refused = Object.keys(season.resolution.refused_action_types)[0];
  const lines = [`${count.toLocaleString()} SHOTS · NO PLACE GIVEN`];
  if (refused) lines.push(refused.toUpperCase());
  drawSlug(ctx, view, lines, { x: 0, y: -30 }, remains * 0.85);
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
  // UNIFORM, AND LARGER THAN THE SCATTER, AND THAT IS THE ARGUMENT.
  //
  // These were drawn at the size of an action label, among the whole scatter of
  // them, so Act V's claim was invisible on the plate. They are now a
  // rank of their own - and all ONE size, because every other word this hand
  // speaks is sized by how many shots it names and these cannot be: the record
  // beneath them is not public. The typography carries the claim; the slug
  // states it.
  const px = Math.max(SCATTER_MIN_PX, view.s(LEAGUE_NAME_TENTHS));
  const values = inWindow ? windowValues(data.window) : new Map<string, string>();
  const names = publishedInstead(data);

  // They accumulate across the act and settle into the mid-range, which by this
  // point in the piece is very nearly empty: the derived measures occupy exactly
  // the space the geometry vacated. Two arcs, because one cannot hold all the
  // phrases without them running off the floor.
  const shown = Math.min(names.length, Math.ceil(st.phase * names.length * 1.4));
  // Both arcs sit inside the mid-range band, which by Act V is very nearly
  // empty - `mid_share` says how nearly. The names occupy that emptiness, and
  // the spoken register reads these SAME boxes so it does not speak through them.
  const boxes = leagueBoxes(names);
  ctx.save();
  for (let i = 0; i < shown; i++) {
    const text = names[i]!;
    const lab = label(text, px, dpr);
    const box = boxes[i]!;
    const x = view.sx(box.wx + box.w / 2);
    const y = view.sy(box.wy);
    const arriving = Math.min(1, (shown - i) * LEAGUE_ARRIVAL_K);
    ctx.globalAlpha = remains * LEAGUE_NAME_ALPHA * arriving;
    ctx.drawImage(lab.canvas, x - lab.width / 2, y - lab.height / 2, lab.width, lab.height);

    // The value, when there is one to show, struck beneath its own name.
    const v = values.get(text);
    if (v) {
      const vl = label(v, px * LEAGUE_VALUE_SCALE, dpr);
      ctx.globalAlpha = remains * LEAGUE_VALUE_ALPHA * arriving;
      ctx.drawImage(vl.canvas, x - vl.width / 2, y + lab.height * 0.75, vl.width, vl.height);
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
  drawSlug(ctx, view, slug, { x: 0, y: 395 }, remains * 0.5);
}
