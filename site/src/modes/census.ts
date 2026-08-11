/** THE CENSUS — the machine classifying basketball, struck into the floor.
 *
 * Every shot the record holds is filed under six taxonomies at once: whether it
 * was a two or a three, whether it went in, which zone, which range, which area,
 * and which of the record's phrases for what the shot *was*. Only that last one
 * grows. That asymmetry is the census's argument and it used to be a number in a
 * gutter; it is now a constellation of ticks that never changes its count
 * against one that breeds.
 *
 * WHAT THIS HAND WAS, AND WHY IT COULD NOT STAY (audit V-05). Two statistical
 * tables flanking a court chart, a wall of the smallest type on screen redrawn
 * every frame. Almost all of it disappeared at any distance, and close up it
 * read as an analytical
 * instrument — the clearest recurrence of the failure this project is named
 * against. The artist's ruling was that the information is valuable and the hand
 * stays: *"CENSUS holds valuable information but maybe it could have an
 * additional visual representation than only the tables being built
 * uniformily."*
 *
 * SO THE TABLE BECAME THE COURT. Each of a taxonomy's categories is struck into
 * the plate as one word, at the mean distance and bearing of the shots the
 * record actually gave that name, at a size whose AREA is that category's
 * measured share. One taxonomy is filed per season, so a viewer standing through
 * a pass watches the machine file basketball six different ways. Nothing is
 * deleted: over one pass all six of the old tables are shown in full, serialised
 * instead of stacked, and the literal apparatus is kept verbatim for the rail.
 *
 * THERE IS NO AUTHORED POSITION AND NO AUTHORED PROPORTION IN THIS HAND. Every
 * place is `seasons.json:classification_place`; every size is a share; how many
 * words are named is `vocabulary.covering_90pct`, the same measurement THE
 * LEDGER's label budget is; which taxonomy is filed is `active_taxonomy`,
 * derived by the pipeline from the vocabulary and the era. The five authored
 * scalars are in src/scalars.ts and none of them is a coordinate.
 *
 * AND THE WORDS WALK, which is the piece's whole thesis performed in the
 * census's own material rather than reported beside it: `2PT FIELD GOAL` moves
 * in, `3PT FIELD GOAL` moves out, `JUMP SHOT` migrates from the mid-range to the
 * arc, `MADE SHOT` and `MISSED SHOT` begin almost on top of each other and part.
 *
 * Struck UNDER the field, in `drawInscriptions`'s position, because they are cut
 * into the plate and the season's marks settle over them. That alone removes the
 * overlay reading that was most of the instrument failure.
 *
 * Everything is counted from the arrived sample, so the census is a pure
 * function of the scrub float like everything else — scrub backwards and it
 * recounts rather than remembers. Nothing is cached between frames.
 */

import { factNum, type Place, type Season } from "../data";
import { drawSlug, strike, STRIKE_LETTER_SPACING, struckFigure } from "../inscription";
import { BONE_RGB, INSCRIPTION_FAMILY, SLUG_FAMILY, ZONE_RGB } from "../palette";
import { COURT } from "../plate";
import {
  CENSUS_FIELD_DIM,
  CENSUS_HEAD_ALPHA,
  CENSUS_SHARE_SCALE,
  CENSUS_SUB_ALPHA,
  CENSUS_TICK_ALPHA,
  CENSUS_TICK_TENTHS,
  CENSUS_ROW_ALPHA,
  CENSUS_TICK_WEIGHT,
  CENSUS_WORD_ALPHA,
  MACHINE_SAW_SCALE,
  ROTATE_MAX_RAD,
  ROTATE_STEP_RAD,
  SIXFOLD_ALPHA,
  SIXFOLD_SECONDS,
  STRIKE_FLOOR_TENTHS,
  STRIKE_MAX_TENTHS,
  WORD_CLEAR_PAD,
} from "../scalars";
import { ARRIVAL_TAIL } from "../timeline";
import { drawSeasonField } from "./fieldlayer";
import { drawActCue } from "./shared";
import type { Frame } from "./types";


/** Where the plate speaks, in court tenths. Above the arc, where no season has
 *  marks, and below the baseline, where the record has none either. */
const HEADER_AT = { x: 0, y: 402 };
const FOOTER_AT = { x: 0, y: -32 };

/** One category, ready to be struck. Court tenths throughout — nothing here
 *  depends on the viewport, so the plate files the same way on every screen. */
export interface Filed {
  name: string;
  /** Arrived-scaled count and its share of the season so far. */
  n: number;
  share: number;
  /** The record's own place for it. `dist` is never perturbed. */
  dist: number;
  bearing: number;
  /** Cap height, in court tenths: STRIKE_MAX * sqrt(share), so AREA ∝ share. */
  size: number;
  /** Half-extents used by the collision test: radial, and angular at `dist`. */
  halfRadial: number;
  halfAngle: number;
  /** How far the bearing had to move to find room. Zero for most. */
  moved: number;
  /** In the named set AND large enough to strike. Everything else is a tick. */
  named: boolean;
  /** Set when the plate could find no clear bearing at this radius. */
  homeless: boolean;
  /** The record placed it, but not anywhere this halfcourt reaches. Measured,
   *  and true of the three backcourt categories in every season. */
  beyond: boolean;
  /** The league's own zone index, when this filing IS the zone taxonomy. */
  zone: number;
}

/**
 * A string's width in COURT TENTHS at a given cap height.
 *
 * Measured once per string at a fixed nominal size through a ruler of its own,
 * never through the live view. That is the invariant 5a established for THE
 * LEDGER and it holds for the same reason: if any of this geometry needed
 * `view.scale`, the layout would differ between screens and the plate would file
 * the same season two ways.
 */
const NOMINAL_PX = 100;
const widths = new Map<string, number>();
let ruler: CanvasRenderingContext2D | null = null;

function widthTenths(text: string, sizeTenths: number): number {
  let per = widths.get(text);
  if (per === undefined) {
    ruler ??= document.createElement("canvas").getContext("2d")!;
    // The same face and the same letter-spacing `strike` uses, or the collision
    // boxes would be measuring a different string from the one drawn.
    ruler.font = `${NOMINAL_PX}px ${INSCRIPTION_FAMILY}`;
    ruler.letterSpacing = `${NOMINAL_PX * STRIKE_LETTER_SPACING}px`;
    per = ruler.measureText(text).width / NOMINAL_PX;
    ruler.letterSpacing = "0px";
    widths.set(text, per);
  }
  return per * sizeTenths;
}

/** Drop the string ruler. Registered in probe/shared.ts:cold() — an
 *  unregistered cache does not produce a false IMPURE, it produces a false
 *  PURE, because every history then shares the same stale map. */
export function clearCensusCaches(): void {
  widths.clear();
}

/**
 * The season's categories under one taxonomy, placed and sized.
 *
 * Counts are arrived-scaled, so words swell and settle as the season fills and
 * the census is the record deciding what a shot is AT THE MOMENT IT DECIDES IT
 * rather than a summary after the fact. A category whose arrived count has not
 * reached one yet is not there at all.
 */
export function filing(
  season: Season,
  taxonomy: string,
  arrived: number,
  /** The league's seven regions in the league's own order, from the season's
   *  own sample artifact — the same order `palette.ts` declares its hues in.
   *  Read rather than written here: the region names are the record's. */
  zoneNames: readonly string[],
  /** How many of this taxonomy's categories cover the bulk of the season —
   *  `vocabulary.covering_90pct`, the measurement THE LEDGER's label budget
   *  also reads. */
  named: number,
): Filed[] {
  const a = Math.min(1, Math.max(0, arrived));
  const counts = season.classification[taxonomy] ?? {};
  const places = season.classification_place?.[taxonomy] ?? {};
  // ONE population: the shots the record both named AND placed. Until
  // 2026-08-09 a word was SIZED from `classification` — the whole population,
  // the pin's pile included — and PLACED from `classification_place`, whose
  // mean excludes the pile. So in the dunk-convention seasons a DUNK SHOT
  // word sized by the season's whole dunk population claimed a mean position
  // computed from the few dunks the record actually placed. Both halves now
  // read the placed population: area ∝ share stays literally true of the
  // shots the word claims, and the refused rest is the pin's — drawn once,
  // named by the caption, receipted by PLACEMENT.
  let placedTotal = 0;
  for (const name of Object.keys(counts)) placedTotal += places[name]?.n_placed ?? 0;
  const classified = Math.round(placedTotal * a);
  const out: Filed[] = [];
  for (const name of Object.keys(counts)) {
    const p: Place | undefined = places[name];
    // A category the record named and placed none of has nowhere to be struck.
    // That is a fact about the record, not a gap: it is the blind era's rim.
    if (!p || p.dist_ft === undefined || p.bearing_rad === undefined) continue;
    const n = Math.round(p.n_placed * a);
    if (n < 1) continue;
    const share = classified ? n / classified : 0;
    const size = STRIKE_MAX_TENTHS * Math.sqrt(share);
    const dist = p.dist_ft * 10;
    const w = widthTenths(name.toUpperCase(), size);
    out.push({
      name: name.toUpperCase(),
      n,
      share,
      dist,
      bearing: p.bearing_rad,
      size,
      halfRadial: size * 0.85,
      // Laid tangent to the hoop, so the word's extent IS an arc at its own
      // radius. Guarded: close to the hoop a long word subtends more than the
      // whole plate, and it then blocks every bearing at that radius, which is
      // true and is what the collision test should conclude.
      halfAngle: Math.min(Math.PI, w / 2 / Math.max(1, dist)),
      moved: 0,
      // Filled in below, once the whole taxonomy is ranked.
      named: false,
      homeless: false,
      beyond: dist * Math.abs(Math.cos(p.bearing_rad)) > COURT.x1
        || dist * Math.sin(p.bearing_rad) > COURT.y1
        || dist * Math.sin(p.bearing_rad) < COURT.y0,
      // -1 unless this filing IS the zone taxonomy, in which case the word may
      // take the league's own hue for its own region.
      zone: taxonomy === "ZONE" ? zoneNames.indexOf(name) : -1,
    });
  }
  // Largest first: the biggest share gets the place the record gave it, and
  // everything else defers to it. Ties by name so the order is total and the
  // layout is a pure function of the season.
  out.sort((x, y) => y.share - x.share || (x.name < y.name ? -1 : 1));

  // WHICH CATEGORIES ARE NAMED, and it is two measurements rather than one.
  // `covering_90pct` is the same measured driver THE LEDGER's label budget is;
  // STRIKE_FLOOR_TENTHS is the point below which a word would be whispered
  // instead of struck. A category failing either is a tick and a count.
  for (let i = 0; i < out.length; i++) {
    out[i]!.named = i < named && out[i]!.size >= STRIKE_FLOOR_TENTHS && !out[i]!.beyond;
  }
  return out;
}

/** Two words laid tangent to the hoop overlap when they are close in RADIUS and
 *  close in BEARING. Exact for this geometry, and cheap. */
function collides(a: Filed, b: Filed, pad: number): boolean {
  if (Math.abs(a.dist - b.dist) >= a.halfRadial + b.halfRadial + pad * a.size) return false;
  let d = Math.abs(a.bearing - b.bearing) % (2 * Math.PI);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d < a.halfAngle + b.halfAngle + pad * a.size / Math.max(1, a.dist);
}

/**
 * The only layout logic there is, and it preserves `dist` exactly.
 *
 * Distance from the basket is the quantity this entire piece is about, so a word
 * is never moved toward or away from the hoop to make room. Bearing is the free
 * variable and the disclosure line on the plate says so. A word that finds no
 * clear bearing within a quarter turn is NOT struck and is counted in the
 * footer — the crowding limit is emergent, never a MAX_WORDS constant.
 *
 * Deterministic, order-fixed and stateless: the same season at the same arrival
 * gives the same layout, and scrubbing backwards rebuilds it.
 */
function layOut(words: Filed[]): void {
  const placed: Filed[] = [];
  for (const w of words) {
    // A word nobody will strike must not take up room. The first build laid out
    // EVERY category and let the unnamed tail block the named head, so in a
    // long-tailed season most of what should have been struck was crowded out by
    // words the plate was never going to draw.
    if (!w.named) continue;
    const home = w.bearing;
    let ok = false;
    for (let step = 0; step * ROTATE_STEP_RAD <= ROTATE_MAX_RAD && !ok; step++) {
      for (const sign of step === 0 ? [1] : [1, -1]) {
        w.moved = sign * step * ROTATE_STEP_RAD;
        w.bearing = home + w.moved;
        // Off the plate is off the plate: a word swung past the sideline is not
        // a solution, it is a different mistake.
        const x = w.dist * Math.cos(w.bearing);
        const y = w.dist * Math.sin(w.bearing);
        if (x < COURT.x0 || x > COURT.x1 || y < COURT.y0 || y > COURT.y1) continue;
        if (placed.some((p) => collides(w, p, WORD_CLEAR_PAD))) continue;
        ok = true;
        break;
      }
    }
    w.homeless = !ok;
    if (ok) placed.push(w);
    else w.bearing = home;
  }
}

/** Every category leaves a mark whether or not it is named. The tick count IS
 *  the taxonomy's size, which is the growth made visible without a digit. */
export function strikeTicks(f: Frame, words: Filed[], alpha: number): void {
  const { ctx, view } = f;
  if (alpha <= 0.01) return;
  const arm = view.s(CENSUS_TICK_TENTHS);
  ctx.save();
  ctx.strokeStyle = `rgba(${BONE_RGB}, ${alpha * CENSUS_TICK_ALPHA})`;
  ctx.lineWidth = Math.max(1, view.scale * CENSUS_TICK_WEIGHT);
  ctx.beginPath();
  for (const w of words) {
    // The tick sits at the record's own place, NOT at the bearing collision may
    // have moved the word to. The word can be nudged; the measurement cannot.
    const x = view.sx(w.dist * Math.cos(w.bearing - w.moved));
    const y = view.sy(w.dist * Math.sin(w.bearing - w.moved));
    ctx.moveTo(x - arm, y);
    ctx.lineTo(x + arm, y);
    ctx.moveTo(x, y - arm);
    ctx.lineTo(x, y + arm);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * The named categories, cut into the floor.
 *
 * `named` is `vocabulary.covering_90pct` for this taxonomy — the categories
 * covering the bulk of the season - `covering_90pct` - which is the same measured quantity
 * that drives THE LEDGER's label budget. Both hands' text density therefore
 * comes from one measurement.
 */
function strikeWords(f: Frame, words: Filed[], alpha: number, coloured: boolean): void {
  const { ctx, view } = f;
  if (alpha <= 0.01) return;
  for (const w of words) {
    if (!w.named || w.homeless) continue;
    const px = view.s(w.size);
    if (px < 1) continue;
    const x = view.sx(w.dist * Math.cos(w.bearing));
    const y = view.sy(w.dist * Math.sin(w.bearing));
    // Tangent to the hoop, matching the numeral garland's rule, so the floor
    // reads as one engraved system rather than two.
    const rotation = Math.PI / 2 - w.bearing;
    // Bone, except on the ZONE filing, where a word may take its own zone's
    // hue — permitted precisely because ZONE *is* SHOT_ZONE_BASIC, so the
    // colour exposes the league's classification rather than adding one.
    const rgb = coloured && w.zone >= 0 ? ZONE_RGB[w.zone] : undefined;
    strike(ctx, w.name, x, y, px, alpha * CENSUS_WORD_ALPHA, rotation, rgb);
    // The share numeral rides beneath, subordinate: the word's own size already
    // carries the share and this only says exactly how much.
    const sub = px * CENSUS_SHARE_SCALE;
    strike(ctx, struckFigure(w.share), x + Math.sin(rotation) * px * 0.95,
           y + Math.cos(rotation) * px * 0.95, sub, alpha * CENSUS_WORD_ALPHA * 0.8, rotation);
  }
}

/**
 * All six taxonomies at once, for a moment, at every season's opening.
 *
 * `categories_total` words on the plate at a stroke — 31 in 1996-97 and 75 in
 * 2015-16 — so the growth is a single perceivable event that recurs once per
 * season. Briefly illegible on purpose: the point is the DENSITY of six
 * overlapping vocabularies, not any one of them, and it is the piece's own
 * argument about maximal rendering performed at season scale without a panel.
 * Five withdraw and one remains.
 */
function strikeSixfold(
  f: Frame, season: Season, arrived: number, k: number, zoneNames: readonly string[],
): void {
  if (k <= 0.01) return;
  for (const taxonomy of Object.keys(f.data.taxonomyColumns)) {
    const words = filing(season, taxonomy, arrived, zoneNames,
                         season.vocabulary.covering_90pct?.[taxonomy] ?? 1);
    layOut(words);
    strikeTicks(f, words, k * SIXFOLD_ALPHA * f.remains);
    strikeWords(f, words, k * SIXFOLD_ALPHA * f.remains, false);
  }
}

/** The machine's own field name and its size, plus the count so far. The
 *  league's schema names rather than friendly words: this is the machine's
 *  field, struck in stone. */
function strikeHeader(f: Frame, season: Season, taxonomy: string, arrived: number): void {
  const { ctx, view, data, remains } = f;
  const column = data.taxonomyColumns[taxonomy] ?? taxonomy;
  const categories = season.vocabulary.taxonomies[column] ?? 0;
  const classified = Math.round(season.attempts * Math.min(1, Math.max(0, arrived)));
  drawSlug(ctx, view, [
    `${season.season}  ·  ${column}  ·  ${categories} CATEGORIES`,
    `${classified.toLocaleString()} SHOTS CLASSIFIED`,
  ], HEADER_AT, remains * CENSUS_HEAD_ALPHA);
}

/**
 * The sentence that makes the placement a measurement rather than a
 * composition. One line, once, in THE MEASURE's definition idiom, and it is not
 * optional: without it a viewer is entitled to read the layout as a design.
 */
function strikeDisclosure(f: Frame): void {
  const { ctx, view, remains } = f;
  drawSlug(ctx, view, [
    "EACH NAME STRUCK AT THE MEAN DISTANCE AND BEARING",
    "OF THE SHOTS THE RECORD GAVE IT · BEARING MOVED FOR ROOM, DISTANCE NEVER",
  ], HEADER_AT, remains * CENSUS_SUB_ALPHA, "aside", 62);
}

/**
 * A count, never a cloud.
 *
 * The census's sharpest sentence: the machine has more names than the floor has
 * room for. Three measured clauses — how many categories fall outside the
 * named set, how many the record named and placed nowhere, and how
 * many found no clear bearing. The tail is a tick and a number, never a swarm of
 * labels, which is THE LEDGER's proven failure.
 */
function strikeFooter(f: Frame, season: Season, taxonomy: string, words: Filed[]): void {
  const { ctx, view, remains } = f;
  const total = Object.keys(season.classification[taxonomy] ?? {}).length;
  const struck = words.filter((w) => w.named && !w.homeless).length;
  // Three DIFFERENT things, kept apart. The first build called them all "no
  // room", which put a category the record files beyond the halfcourt in the
  // same sentence as one that lost a collision — two facts about the record and
  // the plate that have nothing to do with each other.
  const beyond = words.filter((w) => w.beyond).length;
  const homeless = words.filter((w) => w.named && w.homeless).length;
  // STRUCK, not NAMED: a category can be named and still lose its place to a
  // collision, and this line has to add up to what is actually on the floor.
  const lines = [`${struck} OF ${total} STRUCK · ${total - struck} A TICK AND A COUNT`];
  if (beyond > 0) lines.push(`${beyond} PLACED BEYOND THIS FLOOR`);
  if (homeless > 0) lines.push(`${homeless} WITH NO ROOM AT ITS OWN DISTANCE`);
  drawSlug(ctx, view, lines, FOOTER_AT, remains * CENSUS_SUB_ALPHA);
}

/**
 * The receipt: the active taxonomy's rows, printed AFTER the filing.
 *
 * ARTIST'S RULING, 2026-08-08, against the direction's recommendation of no
 * table in the gallery at all. The ruling was *"CENSUS holds valuable
 * information but maybe it could have an ADDITIONAL visual representation than
 * only the tables"* — additional, so the table is not necessarily gone — and
 * shown the two options with pictures they chose to keep a narrow one.
 *
 * WHAT MAKES THIS NOT THE THING THE AUDIT FAILED. It is one column, not two
 * blocks flanking the court; it carries the ACTIVE taxonomy only, not all six at
 * once; and it does not exist for most of the season. It fades in only once the
 * marks have landed (`phase > ARRIVAL_TAIL`), so it reads as a receipt printed
 * after the filing rather than as a panel that grows throughout — which is the
 * difference between a record of what happened and a dashboard.
 *
 * It costs part of "no persistent dashboard layout", and saying so is the point:
 * the criterion is met for most of every season and knowingly relaxed at the end
 * of it, by decision.
 */
function drawReceipt(f: Frame, season: Season, taxonomy: string, words: Filed[]): void {
  const { ctx, view, st, remains } = f;
  // Nothing until the season has finished arriving, then in over the tail.
  const k = Math.min(1, Math.max(0, (st.phase - ARRIVAL_TAIL) / (1 - ARRIVAL_TAIL) * 3));
  if (k <= 0.01) return;

  const px = Math.max(8.5, Math.min(11, view.width / 150));
  const pad = Math.round(px * 1.6);
  ctx.save();
  ctx.font = `${px}px ${SLUG_FAMILY}`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  const total = Object.keys(season.classification[taxonomy] ?? {}).length;
  let y = pad + LINE;
  ctx.fillStyle = `rgba(${BONE_RGB}, ${CENSUS_SUB_ALPHA * remains * k})`;
  ctx.fillText(taxonomy, pad, y);
  y += LINE + 3;
  ctx.fillStyle = `rgba(${BONE_RGB}, ${CENSUS_ROW_ALPHA * remains * k})`;
  for (const w of words) {
    if (!w.named) continue;
    ctx.fillText(`${w.name.toLowerCase()}   ${struckFigure(w.share)}`, pad, y);
    y += LINE;
  }
  // The tail is a count, never a cloud — the same rule the footer obeys.
  const rest = total - words.filter((x) => x.named).length;
  if (rest > 0) {
    ctx.fillStyle = `rgba(${BONE_RGB}, ${CENSUS_SUB_ALPHA * remains * k})`;
    ctx.fillText(`… ${rest} more`, pad, y);
  }
  ctx.restore();
}

/**
 * The window's seventh beat: what the machine actually saw.
 *
 * 2015-16 gets seven — the six taxonomies in the record's own column order, then
 * this. Everything else in this hand counts what the archive SAYS about a shot;
 * this counts what the machine held, and the two are not the same order of
 * magnitude. It used to be a short block in a gutter, which is to say the
 * strongest content in the census set in the smallest type on screen.
 */

/** The seventh beat's headline — exported so the talk rail's CENSUS interior
 *  (THE SECOND SCORE) names the beat with the hand's own words rather than a
 *  second copy that can drift. One definition, two readers. */
export const MACHINE_SAW_TITLE = "BODY POSITIONS THE MACHINE SAW";

// --- TIME BELONGS TO THE COUNT (session 17, the three-instrument vote) -------
//
// The window's census stops used to split the act evenly, so the smallest
// filing held the plate exactly as long as the largest — a plateau for the
// small filings and a sprint for the one that carries the hand's whole
// argument. The beats are now DERIVED from the record: each
// filing gets a floor of CENSUS_FILING_MIN_S seconds, the remainder divides in
// proportion to each taxonomy's own category count
// (`vocabulary.taxonomies`), and MACHINE SAW is protected at the equal-split
// span it always had — its beat's boundaries are unchanged to the digit, so
// the seventh stop's frames are byte-stable across this change. Time belongs
// to the count; nothing here is a judgment about which filing matters.
//
// ONE definition, TWO readers: the hand files by this table and the talk
// rail's CENSUS interior lists it (the WINDOW_BEATS discipline).

/** A pacing floor, not a material: the shortest a filing may hold the plate,
 *  in window seconds — below this a two-category filing becomes a flash. */
const CENSUS_FILING_MIN_S = 6;

export interface CensusStop {
  /** The classification key this stop files, or null for MACHINE SAW. */
  taxonomy: string | null;
  title: string;
  /** Window-phase fractions, 0..1. */
  from: number;
  to: number;
}

export function censusStops(
  season: Season,
  taxonomyColumns: Record<string, string>,
  durationSeconds: number,
): CensusStop[] {
  const columns = Object.keys(taxonomyColumns);
  const sawSeconds = durationSeconds / (columns.length + 1);
  const counts = columns.map(
    (c) => season.vocabulary.taxonomies[taxonomyColumns[c] ?? c] ?? 0,
  );
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  const spare = Math.max(
    0, durationSeconds - sawSeconds - CENSUS_FILING_MIN_S * columns.length,
  );
  const out: CensusStop[] = [];
  let at = 0;
  columns.forEach((c, k) => {
    const secs = CENSUS_FILING_MIN_S + (spare * counts[k]!) / total;
    out.push({
      taxonomy: c,
      title: taxonomyColumns[c] ?? c,
      from: at / durationSeconds,
      to: (at + secs) / durationSeconds,
    });
    at += secs;
  });
  out.push({ taxonomy: null, title: MACHINE_SAW_TITLE, from: at / durationSeconds, to: 1 });
  return out;
}

function strikeMachineSaw(f: Frame, k: number): void {
  const { ctx, view, data, remains } = f;
  const w = data.window;
  if (!w) return;
  const inv = w.inventory;
  const grown = (n: number): string => Math.round(n * k).toLocaleString();
  const positions = factNum(data.facts, "schema.positions_per_shot");

  // Struck large, over the emptied middle, against what the record kept.
  const figure = view.s(STRIKE_MAX_TENTHS * MACHINE_SAW_SCALE);
  strike(ctx, grown(inv.body_positions), view.sx(0), view.sy(230), figure,
         remains * CENSUS_WORD_ALPHA * k);
  drawSlug(ctx, view, [MACHINE_SAW_TITLE], { x: 0, y: 230 },
           remains * k, "aside", figure * 0.75);
  drawSlug(ctx, view, [
    `${grown(inv.moments)} MOMENTS · ${grown(inv.miles_run)} MILES · ${grown(inv.touches)} TOUCHES`,
    `${grown(inv.passes)} PASSES · ${grown(inv.drives)} DRIVES · ${grown(inv.hours_tracked)} HOURS`,
  ], { x: 0, y: 130 }, remains * k);
  // `voice` — THE FIFTH, and it is an artist's ruling rather than this file's
  // decision (5a reserved the rank for four sentences and said not to move copy
  // between ranks without asking). It earns it: the figure struck above is how
  // many body positions the machine held, and the record kept one point per
  // shot, which is the enclosure this whole piece is about, in one line.
  // docs/build/typography-inventory.md carries the classification.
  drawSlug(ctx, view, [
    "THE RECORD KEPT",
    `${positions} POSITION PER SHOT`,
  ], { x: 0, y: 60 }, remains * k, "voice");
  // THE SCOPE THAT IS ACTUALLY TRUE OF THESE FIGURES. The first build put
  // `bias.scope` here, and it was a FALSE disclosure: `bias` measures the
  // recovered SHOT set — a fraction of the season's attempts — while `inventory`
  // is counted over every game the window stage parsed. Attaching a caveat to
  // figures it does not describe is the same defect as omitting one.
  drawSlug(ctx, view, [
    `${w.corpus.games_parsed} OF ${factNum(data.facts, "season.games_full").toLocaleString()} GAMES`,
  ], { x: 0, y: 60 }, remains * k, "aside", 44);
}

export function drawCensusHand(f: Frame): void {
  const { st, data, schedule, remains, talk } = f;
  const season = data.byYear.get(st.year!)!;
  const elapsed = st.phase * (schedule.byYear.get(st.year!)?.duration ?? 0);

  // The window season files all six in sequence and then a seventh; every other
  // season files the one the pipeline's schedule assigns it. The window's
  // stops come from the derived table above — time belongs to the count.
  const columns = Object.keys(data.taxonomyColumns);
  const isWindow = st.act === 3 && data.window !== null;
  const stop = isWindow
    ? (() => {
        const stops = censusStops(season, data.taxonomyColumns,
          schedule.byYear.get(st.year!)?.duration ?? 1);
        return stops.find((s) => st.phase < s.to) ?? stops[stops.length - 1]!;
      })()
    : null;
  const taxonomy = stop
    ? (stop.taxonomy ?? columns[0]!)
    : (season.active_taxonomy ?? columns[0]!);
  const machineSaw = stop !== null && stop.taxonomy === null;

  // Inside the window each beat fills on its own clock, so the count settles
  // once per taxonomy rather than once per season.
  const arrived = stop
    ? Math.min(1, Math.max(0, (st.phase - stop.from) / (stop.to - stop.from)))
    : st.arrived;

  // The league's own region names, in the league's own order, out of the
  // season's own artifact.
  const zoneNames = data.samples.get(st.year!)?.zone_names ?? [];

  if (machineSaw) {
    strikeMachineSaw(f, arrived);
  } else {
    const words = filing(season, taxonomy, arrived, zoneNames,
                         season.vocabulary.covering_90pct?.[taxonomy] ?? 1);
    layOut(words);
    strikeTicks(f, words, remains);
    strikeWords(f, words, remains, taxonomy === "ZONE");
    strikeHeader(f, season, taxonomy, arrived);
    strikeDisclosure(f);
    strikeFooter(f, season, taxonomy, words);
    drawReceipt(f, season, taxonomy, words);

    // All six at once, briefly, at the opening of every season.
    const k = 1 - Math.min(1, elapsed / SIXFOLD_SECONDS);
    if (k > 0) strikeSixfold(f, season, arrived, k * remains, zoneNames);
  }

  // The marks stay, quieter: the census is about them, so they have to be there.
  // Drawn AFTER the filing, so the words are cut into the plate and the season's
  // shots settle over them — the same relationship the season numerals have.
  //
  // The outgoing season is NOT drawn here, unlike every other hand. The tally
  // counts this season's arrived shots, so a field still carrying the previous
  // season's marks would contradict a census reading "3 SHOTS CLASSIFIED".
  drawSeasonField(f, { dim: remains * CENSUS_FIELD_DIM, withPrevious: false });

  // The full apparatus, verbatim, and only where somebody is working. This is
  // mode CONFIGURATION, not held state, so render(mode, t) stays pure.
  if (talk) drawTables(f, season);

  // The boundaries named (S1): the census has no native boundary event —
  // its taxonomy turnover happens most seasons, not at the acts.
  drawActCue(f, 2);
  drawActCue(f, 5);
}

// --- the tables, kept whole for the rail -------------------------------------
//
// THE ARTIST'S INSTRUCTION WAS THAT THE INFORMATION IS VALUABLE AND STAYS, and
// it does, in two places. The gallery keeps the CONTENT, as the floor: every row
// of the active taxonomy is a struck word, every row outside the named set is a
// tick and a footer count, and over one pass all six of these tables are shown
// in full. This is the literal apparatus — absolute counts, all six groups,
// PLACEMENT, the window inventory — retained exactly as it was and drawn only
// when the rail is present.
//
// PLACEMENT stays here and leaves the gallery. `Located / No place given` is
// already drawn at full monumental scale in every hand — it IS the pin — and it
// is already named in THE LEDGER. A two-row table of it beside the object itself
// is the instrument failure in miniature.

interface Row {
  name: string;
  n: number;
}

interface Group {
  title: string;
  rows: Row[];
  /** Total for the percentages in this group. */
  of: number;
}

function census(season: Season, arrived: number): { groups: Group[]; classified: number } {
  const a = Math.min(1, Math.max(0, arrived));
  const cls = season.classification;
  const classified = Math.round(season.attempts * a);

  const rows = (title: string): Row[] =>
    Object.entries(cls[title] ?? {})
      .map(([name, n]) => ({ name, n: Math.round(n * a) }))
      .filter((r) => r.n > 0)
      .sort((x, y) => y.n - x.n);

  // The pin's own count, not the exact origin's. This receipt describes the pin
  // - "it IS the pin" is the reason PLACEMENT leaves the gallery at all - so the
  // two have to come from one key. Reading `origin_snapped` made this table
  // print "No place given 0" for 2015-16 - the window season, the one the piece
  // spends the whole of Act III inside - while `rim_sentinel.n` shots of it sat
  // on a single cell beside the rim.
  const sentinel = season.resolution.rim_sentinel;
  const unplaced = Math.round(
    (sentinel && sentinel.is_refusal ? sentinel.n : 0) * a,
  );
  const groups: Group[] = [
    { title: "TYPE", of: classified, rows: rows("TYPE") },
    { title: "RESULT", of: classified, rows: rows("RESULT") },
    { title: "ZONE", of: classified, rows: rows("ZONE") },
    { title: "RANGE", of: classified, rows: rows("RANGE") },
    { title: "AREA", of: classified, rows: rows("AREA") },
    { title: "PLACEMENT", of: classified, rows: classified ? [
      { name: "Located", n: classified - unplaced },
      { name: "No place given", n: unplaced },
    ] : [] },
    { title: "DESCRIPTION", of: classified, rows: rows("DESCRIPTION") },
  ];
  return { groups, classified };
}

const LINE = 13;
const GAP = 9;

/** Flow a column of text, wrapping into the next column when it runs out of
 *  height — the tallies must never spill off the bottom of the frame. */
class Columns {
  private x: number;
  private y: number;
  constructor(
    private ctx: CanvasRenderingContext2D,
    private left: number,
    private top: number,
    private colW: number,
    private bottom: number,
    private cols: number,
  ) {
    this.x = left;
    this.y = top;
  }
  private wrap(need: number): boolean {
    if (this.y + need <= this.bottom) return true;
    this.x += this.colW;
    this.y = this.top;
    return this.x < this.left + this.colW * this.cols;
  }
  line(text: string, right: string, alpha: number, heading = false): void {
    if (!this.wrap(LINE)) return;
    const c = this.ctx;
    c.fillStyle = `rgba(${BONE_RGB}, ${alpha})`;

    // The record's longer phrases would otherwise run straight through their
    // own counts - "Driving Finger Roll Layup Shot" is wider than the column.
    const rightW = right ? c.measureText(right).width : 0;
    const room = this.colW - 14 - rightW - 8;
    let shown = text;
    if (c.measureText(shown).width > room) {
      while (shown.length > 1 && c.measureText(`${shown}…`).width > room) {
        shown = shown.slice(0, -1);
      }
      shown = `${shown}…`;
    }

    c.textAlign = "left";
    c.fillText(shown, this.x, this.y);
    if (right) {
      c.textAlign = "right";
      c.fillText(right, this.x + this.colW - 14, this.y);
    }
    this.y += heading ? LINE + 3 : LINE;
  }
  gap(): void {
    this.y += GAP;
  }
}

function drawTables(f: Frame, season: Season): void {
  const { ctx, view, st, data, remains } = f;
  const { groups, classified } = census(season, st.arrived);

  const px = Math.max(8.5, Math.min(11, view.width / 150));
  ctx.save();
  ctx.font = `${px}px ${SLUG_FAMILY}`;
  ctx.textBaseline = "alphabetic";

  const pad = Math.round(px * 1.6);
  const colW = Math.max(150, Math.min(215, view.width * 0.155));
  const top = pad + LINE * 3;
  const bottom = view.height - pad;

  ctx.fillStyle = `rgba(${BONE_RGB}, ${CENSUS_HEAD_ALPHA * remains})`;
  ctx.textAlign = "left";
  ctx.fillText(`${season.season}  ·  ${classified} SHOTS CLASSIFIED`, pad, pad + LINE);
  ctx.fillStyle = `rgba(${BONE_RGB}, ${CENSUS_SUB_ALPHA * remains})`;
  // How many ways a shot is filed, counted from this season's own artifact -
  // the machine's vocabulary grows and the shape of its filing does not.
  const taxonomies = Object.keys(season.vocabulary.taxonomies).length;
  ctx.fillText(
    `${season.vocabulary.categories_total} CATEGORIES IN ${taxonomies} TAXONOMIES`,
    pad,
    pad + LINE * 2,
  );

  const small = groups.filter((g) => g.title !== "DESCRIPTION");
  const left = new Columns(ctx, pad, top, colW, bottom, 1);
  for (const g of small) {
    left.line(g.title, "", CENSUS_SUB_ALPHA * remains, true);
    for (const r of g.rows) {
      const p = g.of ? ((100 * r.n) / g.of).toFixed(1) : "0.0";
      left.line(r.name, `${r.n}  ${p}%`, CENSUS_ROW_ALPHA * remains);
    }
    left.gap();
  }

  const desc = groups.find((g) => g.title === "DESCRIPTION")!;
  const rightCols = 2;
  const rightX = view.width - pad - colW * rightCols;
  const right = new Columns(ctx, rightX, top, colW, bottom, rightCols);
  right.line(`DESCRIPTION · ${desc.rows.length} OF ${season.vocabulary.words}`, "",
             CENSUS_SUB_ALPHA * remains, true);
  for (const r of desc.rows) {
    const p = desc.of ? ((100 * r.n) / desc.of).toFixed(1) : "0.0";
    right.line(r.name, `${r.n}  ${p}%`, CENSUS_ROW_ALPHA * remains);
  }

  if (st.act === 3 && data.window) drawWindowInventory(f, left);

  ctx.restore();
}

/**
 * What the machine held, for the length of the window.
 *
 * Set against a census whose largest number is a season's attempts, these are
 * the measure of what a shot record throws away: every other season keeps one
 * point per shot (`facts.json:schema.positions_per_shot`), and for the window's
 * span the same league held the body positions in `inventory` and never
 * published one of them again.
 */
function drawWindowInventory(f: Frame, col: Columns): void {
  const { st, data, remains } = f;
  const w = data.window!;
  const a = Math.min(1, Math.max(0, st.arrived));
  const grown = (n: number): string => Math.round(n * a).toLocaleString();
  const inv = w.inventory;

  col.gap();
  col.line("THE MACHINE SAW", "", CENSUS_SUB_ALPHA * remains, true);
  col.line("Moments", grown(inv.moments), CENSUS_ROW_ALPHA * remains);
  col.line("Body positions", grown(inv.body_positions), CENSUS_ROW_ALPHA * remains);
  col.line("Miles run", grown(inv.miles_run), CENSUS_ROW_ALPHA * remains);
  col.line("Hours tracked", grown(inv.hours_tracked), CENSUS_ROW_ALPHA * remains);
  col.line("Touches", grown(inv.touches), CENSUS_ROW_ALPHA * remains);
  col.line("Passes", grown(inv.passes), CENSUS_ROW_ALPHA * remains);
  col.line("Drives", grown(inv.drives), CENSUS_ROW_ALPHA * remains);
  col.gap();
  col.line("THE RECORD KEPT", "", CENSUS_SUB_ALPHA * remains, true);
  // Both measured. The record's width per shot is counted from the dump's own
  // header, and the full schedule from the season the window sits inside -
  // neither is a number this file is entitled to know.
  const positions = factNum(data.facts, "schema.positions_per_shot");
  const full = factNum(data.facts, "season.games_full");
  col.line("Positions per shot", String(positions), CENSUS_ROW_ALPHA * remains);
  col.line(`Games of ${full.toLocaleString()}`, String(w.corpus.games_parsed), CENSUS_ROW_ALPHA * remains);
}
