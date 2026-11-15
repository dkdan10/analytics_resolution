/** THE CENSUS — the machine classifying basketball, struck into the floor.
 *
 * Every shot the record holds is filed under six taxonomies at once: whether it
 * was a two or a three, whether it went in, which zone, which range, which area,
 * and which of the record's phrases for what the shot *was*. Only that last one
 * grows. That asymmetry is the census's argument and it used to be a number in a
 * gutter; it is now a constellation of ticks that never changes its count
 * against one that breeds.
 *
 * WHAT THIS HAND WAS, AND WHY IT COULD NOT STAY. Two statistical tables
 * flanking a court chart, a wall of the smallest type on screen redrawn every
 * frame. Almost all of it disappeared at any distance, and close up it read as
 * an analytical instrument — the clearest recurrence of the failure this
 * project is named against. The decision was that the information is valuable
 * and the hand stays, given an ADDITIONAL visual representation rather than
 * only the tables being built uniformly.
 *
 * SO THE TABLE BECAME THE COURT. Each of a taxonomy's categories is struck into
 * the plate as one word, at the mean distance and bearing of the shots the
 * record actually gave that name, at a size whose AREA is that category's
 * measured share. One taxonomy is filed per season, so a viewer standing through
 * a pass watches the machine file basketball six different ways. Nothing is
 * deleted: over one pass all six of the old tables are shown in full, serialised
 * instead of stacked, and the literal apparatus — absolute counts for every
 * taxonomy, PLACEMENT, the window inventory — is listed in the talk rail's
 * census panel (`navigator.ts`), off the audience's court.
 *
 * THERE IS NO AUTHORED POSITION AND NO AUTHORED PROPORTION IN THIS HAND. Every
 * place is `seasons.json:classification_place`; every size is a share; how many
 * words are named is `vocabulary.covering_90pct`, the same measurement THE
 * LEDGER's label budget is; which taxonomy is filed is `active_taxonomy`,
 * derived by the pipeline from the vocabulary and the era. The five authored
 * scalars are in src/scalars.ts and none of them is a coordinate.
 *
 * AND THE WORDS WALK, which is the piece's whole argument performed in the
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
import { drawSlug, slugBox, strike, STRIKE_LETTER_SPACING, struckFigure } from "../inscription";
import { BONE_RGB, INSCRIPTION_FAMILY, SLUG_FAMILY, ZONE_RGB } from "../palette";
import { COURT, type View } from "../plate";
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
  MACHINE_SAW_SCOPE_OFFSET_PX,
  ROTATE_MAX_RAD,
  ROTATE_STEP_RAD,
  SLUG_STATEMENT_TENTHS,
  SIXFOLD_ALPHA,
  SIXFOLD_SECONDS,
  SLUG_MIN_PX,
  STRIKE_FLOOR_TENTHS,
  STRIKE_MAX_TENTHS,
  WORD_CLEAR_PAD,
} from "../scalars";
import { ARRIVAL_TAIL, type Act } from "../timeline";
import {
  CENSUS_FILING_COMPLETE,
  CENSUS_FILING_FADE,
  CENSUS_FILING_HOLD_TO,
  CENSUS_FILING_MIN_SECONDS,
  CENSUS_MACHINE_SAW_SPAN,
  CENSUS_MACHINE_SAW_STOP,
  MACHINE_SAW_BUILD_SECONDS,
  MACHINE_SAW_TITLE,
  censusWindowStops,
  windowSecondAtPhase,
} from "../window-score";
import { drawSeasonField } from "./fieldlayer";
import { actCueLevel, drawActCue } from "./shared";
import type { Frame } from "./types";

/** Compatibility exports; the canonical Census score is centralized. */
export {
  CENSUS_FILING_COMPLETE,
  CENSUS_FILING_FADE,
  CENSUS_FILING_HOLD_TO,
  CENSUS_FILING_MIN_SECONDS,
  CENSUS_MACHINE_SAW_SPAN,
  CENSUS_MACHINE_SAW_STOP,
  MACHINE_SAW_BUILD_SECONDS,
  MACHINE_SAW_TITLE,
};


/** Where the plate speaks, in court tenths. Above the arc, where no season has
 *  marks, and below the baseline, where the record has none either. */
const HEADER_AT = { x: 0, y: 402 };
const FOOTER_AT = { x: 0, y: -32 };

/** The boundaries the census names: it has no native boundary event — its
 *  taxonomy turnover happens most seasons, not at the acts. */
const CUED_ACTS: readonly Act[] = [2, 5];

/** The top of the footer's ground, which no word may stand on: a whole em of
 *  the footer's registered size above its first line's centre. Half of that
 *  is the line's own letters; the other half is clear stone between them and
 *  a word in the near profile, and is what still covers them where the room
 *  profile floors the footer's type larger in pixels. In court tenths like the
 *  rest of the layout, so one season files the same way on every screen. */
const FOOTER_TOP = FOOTER_AT.y + SLUG_STATEMENT_TENTHS;

/** Where the share figure is struck beneath its word, as a fraction of the
 *  word's size. One number for the pen and the collision test, so the figure
 *  tested is the figure drawn. */
const FIGURE_DROP = 0.95;

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
  /** What the word's letters cover about the point it is struck at, and the
   *  same for the share figure struck beneath it. The collision test's whole
   *  input besides the place. */
  glyphs: Glyphs;
  figureGlyphs: Glyphs;
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

/** What a struck line's letters cover, in court tenths, about the point it is
 *  struck at: back and forward along the line it reads along, up (away from
 *  the hoop, the way its letters stand) and down. */
export interface Glyphs {
  back: number;
  fore: number;
  up: number;
  down: number;
}

/**
 * A string's struck letters in COURT TENTHS at a given size.
 *
 * Measured once per string at a fixed nominal size through a ruler of its own,
 * never through the live view. That is the invariant THE LEDGER keeps, and it
 * holds here for the same reason: if any of this geometry needed
 * `view.scale`, the layout would differ between screens and the plate would file
 * the same season two ways.
 *
 * The letters themselves and not a proportion of the size: the collision test
 * is only as true as the rectangle it is given, and an allowance kept around a
 * word, once the word is turned, collides at its corners where no letter is.
 */
const NOMINAL_PX = 100;
const measured = new Map<string, Glyphs>();
const lettered = new Map<string, Glyphs[]>();
const slugWidths = new Map<string, number>();
let slugAdvance: number | undefined;
let ruler: CanvasRenderingContext2D | null = null;
let slugRuler: CanvasRenderingContext2D | null = null;

/** The ruler, set the way `strike` sets its pen: the same face, letter-spacing
 *  and baseline, or the collision boxes would be measuring a different string
 *  from the one drawn. */
function struckRuler(align: CanvasTextAlign): CanvasRenderingContext2D {
  ruler ??= document.createElement("canvas").getContext("2d")!;
  ruler.font = `${NOMINAL_PX}px ${INSCRIPTION_FAMILY}`;
  ruler.letterSpacing = `${NOMINAL_PX * STRIKE_LETTER_SPACING}px`;
  ruler.textAlign = align;
  ruler.textBaseline = "middle";
  return ruler;
}

function scaled(g: Glyphs, k: number): Glyphs {
  return { back: g.back * k, fore: g.fore * k, up: g.up * k, down: g.down * k };
}

function glyphsOf(text: string, sizeTenths: number): Glyphs {
  let per = measured.get(text);
  if (per === undefined) {
    const m = struckRuler("center").measureText(text);
    per = {
      back: m.actualBoundingBoxLeft / NOMINAL_PX,
      fore: m.actualBoundingBoxRight / NOMINAL_PX,
      up: m.actualBoundingBoxAscent / NOMINAL_PX,
      down: m.actualBoundingBoxDescent / NOMINAL_PX,
    };
    measured.set(text, per);
  }
  return scaled(per, sizeTenths);
}

/**
 * The same string letter by letter: what each letter covers about the point
 * the whole line is struck at.
 *
 * The line's own rectangle stands as high as its tallest glyph for its whole
 * length, and in the record's names the tallest glyph is a parenthesis. Turned
 * against a sideline, that rectangle's corner is past the line where the
 * word's first letter is not. The plate's edge is asked about the letters.
 */
function lettersOf(text: string, sizeTenths: number): Glyphs[] {
  let per = lettered.get(text);
  if (per === undefined) {
    const pen = struckRuler("left");
    const whole = pen.measureText(text).width;
    per = [];
    for (let i = 0; i < text.length; i++) {
      if (text[i] === " ") continue;
      const g = pen.measureText(text[i]!);
      // Where this letter's own origin falls from the line's centre: the
      // advance up to and including it, less its own.
      const from = pen.measureText(text.slice(0, i + 1)).width - g.width - whole / 2;
      per.push({
        back: (g.actualBoundingBoxLeft - from) / NOMINAL_PX,
        fore: (g.actualBoundingBoxRight + from) / NOMINAL_PX,
        up: g.actualBoundingBoxAscent / NOMINAL_PX,
        down: g.actualBoundingBoxDescent / NOMINAL_PX,
      });
    }
    lettered.set(text, per);
  }
  return per.map((g) => scaled(g, sizeTenths));
}

/** A view with nothing but a scale: one court tenth is `NOMINAL_PX` of the
 *  footer's registered size, so no pixel floor binds on what is measured. */
const RULER_SCALE = NOMINAL_PX / SLUG_STATEMENT_TENTHS;
const RULER_VIEW: View = {
  scale: RULER_SCALE,
  width: 0,
  height: 0,
  sx: (x) => x * RULER_SCALE,
  sy: (y) => -y * RULER_SCALE,
  s: (len) => len * RULER_SCALE,
};

/**
 * How wide `drawSlug` sets a statement line, in court tenths at its registered
 * size.
 *
 * Taken through `drawSlug` itself, with the fill replaced by a measurement:
 * the face and the letter-spacing are that function's own, and a copy of
 * either kept here would go stale without a word.
 */
function slugWidthOf(line: string): number {
  let w = slugWidths.get(line);
  if (w === undefined) {
    slugRuler ??= document.createElement("canvas").getContext("2d")!;
    const pen = slugRuler;
    let px = 0;
    pen.fillText = (text: string): void => {
      const m = pen.measureText(text);
      px = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    };
    drawSlug(pen, RULER_VIEW, [line], FOOTER_AT, 1);
    w = px / RULER_SCALE;
    slugWidths.set(line, w);
  }
  return w;
}

/**
 * How far `drawSlug` sets one line under the last, as a multiple of its type
 * size.
 *
 * Taken through `drawSlug` like the width above, and for the same reason: the
 * advance is that function's own, and a copy of it kept here would go stale
 * without a word.
 */
function slugAdvanceOf(): number {
  if (slugAdvance === undefined) {
    slugRuler ??= document.createElement("canvas").getContext("2d")!;
    const pen = slugRuler;
    const set: number[] = [];
    pen.fillText = (_text: string, _x: number, y: number): void => {
      set.push(y);
    };
    drawSlug(pen, RULER_VIEW, ["", ""], FOOTER_AT, 1);
    slugAdvance = (set[1]! - set[0]!) / slugBox(pen, RULER_VIEW, "").height;
  }
  return slugAdvance;
}

/** Drop the rulers' maps. Registered in probe/shared.ts:cold() — an
 *  unregistered cache does not produce a false IMPURE, it produces a false
 *  PURE, because every history then shares the same stale map. */
export function clearCensusCaches(): void {
  measured.clear();
  lettered.clear();
  slugWidths.clear();
  slugAdvance = undefined;
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
    const figure = size * CENSUS_SHARE_SCALE;
    out.push({
      name: name.toUpperCase(),
      n,
      share,
      dist,
      bearing: p.bearing_rad,
      size,
      // The word is struck STRAIGHT, tangent to the hoop at its centre, so what
      // it covers is a rectangle and not an arc at its own radius: a long word
      // close to the hoop reaches far outside any radius band of its own.
      glyphs: glyphsOf(name.toUpperCase(), size),
      figureGlyphs: glyphsOf(struckFigure(share), figure),
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

/** A rectangle something is struck in, in court tenths: its centre, the unit
 *  direction its line of type reads along, its half-extents along that line
 *  and across it, and the clear floor it keeps from other type. */
interface Box {
  cx: number;
  cy: number;
  tx: number;
  ty: number;
  halfAlong: number;
  halfAcross: number;
  pad: number;
}

/** The rectangle a line's letters cover when it is struck at (x, y), `size`
 *  high, with its letters standing along the unit direction (ux, uy), so
 *  reading along (uy, -ux). Every struck line keeps WORD_CLEAR_PAD of its own
 *  size clear around it. */
function boxAt(x: number, y: number, ux: number, uy: number, g: Glyphs, size: number): Box {
  const along = (g.fore - g.back) / 2;
  const across = (g.up - g.down) / 2;
  return {
    cx: x + along * uy + across * ux,
    cy: y - along * ux + across * uy,
    tx: uy,
    ty: -ux,
    halfAlong: (g.fore + g.back) / 2,
    halfAcross: (g.up + g.down) / 2,
    pad: WORD_CLEAR_PAD * size,
  };
}

/**
 * What a word covers on the floor at its current bearing: the word, and the
 * share figure struck beneath it together with the strip of floor between the
 * two.
 *
 * Laid tangent to the hoop with its letters standing away from it, so "up" is
 * the bearing's own direction and "beneath" is toward the hoop, where
 * `strikeWords` puts the figure. The strip is the figure's own width, from the
 * figure up to the underside of the word's letters: nothing is drawn in it,
 * and it is still the word's, because a smaller word laid there stands
 * directly over the figure and the figure then reads as that word's share.
 * The figure's rectangle is kept where a small screen does not strike the
 * figure (`strikeWords`), so the layout stays a function of the season alone.
 */
function boxesOf(w: Filed): [Box, Box] {
  const ux = Math.cos(w.bearing);
  const uy = Math.sin(w.bearing);
  const figure = w.dist - FIGURE_DROP * w.size;
  const under: Glyphs = {
    ...w.figureGlyphs,
    up: Math.max(w.figureGlyphs.up, FIGURE_DROP * w.size - w.glyphs.down),
  };
  return [
    boxAt(w.dist * ux, w.dist * uy, ux, uy, w.glyphs, w.size),
    boxAt(figure * ux, figure * uy, ux, uy, under, w.size * CENSUS_SHARE_SCALE),
  ];
}

/** How far a box reaches from its centre along the unit direction (nx, ny). */
function reach(k: Box, nx: number, ny: number): number {
  return k.halfAlong * Math.abs(k.tx * nx + k.ty * ny)
    + k.halfAcross * Math.abs(k.tx * ny - k.ty * nx);
}

/** A box being placed overlaps one already down, short of its own clear floor,
 *  unless one of their four edge directions separates them. */
function overlaps(a: Box, b: Box): boolean {
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  const apart = (nx: number, ny: number): boolean =>
    Math.abs(dx * nx + dy * ny) >= reach(a, nx, ny) + reach(b, nx, ny) + a.pad;
  return !(apart(a.tx, a.ty) || apart(-a.ty, a.tx) || apart(b.tx, b.ty) || apart(-b.ty, b.tx));
}

/** A box lies wholly on the plate. The plate's edges are stone, not type, and
 *  keep no clear floor. */
function inStone(k: Box): boolean {
  const ex = reach(k, 1, 0);
  const ey = reach(k, 0, 1);
  return k.cx - ex >= COURT.x0 && k.cx + ex <= COURT.x1
    && k.cy - ey >= COURT.y0 && k.cy + ey <= COURT.y1;
}

/**
 * Everything a word strikes lies on the plate.
 *
 * Its two rectangles first. Where one of them crosses an edge the letters
 * themselves are asked, each by its own rectangle: the word's is as tall as
 * its tallest glyph along its whole length, and a corner of it can be past a
 * sideline that no letter reaches.
 */
function onPlate(w: Filed, boxes: [Box, Box]): boolean {
  if (boxes.every(inStone)) return true;
  const ux = Math.cos(w.bearing);
  const uy = Math.sin(w.bearing);
  const figure = w.dist - FIGURE_DROP * w.size;
  const sub = w.size * CENSUS_SHARE_SCALE;
  return lettersOf(w.name, w.size)
      .every((g) => inStone(boxAt(w.dist * ux, w.dist * uy, ux, uy, g, w.size)))
    && lettersOf(struckFigure(w.share), sub)
      .every((g) => inStone(boxAt(figure * ux, figure * uy, ux, uy, g, sub)));
}

/** The footer's lines, for the pen and for the layout that keeps words off
 *  them. */
function footerLines(
  total: number, struck: number, tail: number, beyond: number, homeless: number,
): string[] {
  // A clause for a count of none says nothing, and the last line agrees with
  // its own count.
  const lines = [`${struck} OF ${total} STRUCK`
    + (tail > 0 ? ` · ${tail} SHOWN AS A TICK AND A COUNT` : "")];
  if (beyond > 0) lines.push(`${beyond} PLACED BEYOND THIS FLOOR`);
  if (homeless > 0) {
    lines.push(homeless === 1
      ? `${homeless} WITH NO ROOM AT ITS OWN DISTANCE`
      : `${homeless} WITH NO ROOM AT THEIR OWN DISTANCES`);
  }
  return lines;
}

/** How many categories the record has under a taxonomy this season. */
function categoriesOf(season: Season, taxonomy: string): number {
  return Object.keys(season.classification[taxonomy] ?? {}).length;
}

/**
 * The footer's ground, which no word may stand on.
 *
 * From the plate's foot up to FOOTER_TOP, and as wide as the footer's own
 * lines and no wider: a word in the corner, a long way from the footer's
 * letters, is not on them and is not moved for them. The width is the widest
 * line the footer can print for a taxonomy of this many categories — every
 * count at the count of categories, which none can exceed — set at twice its
 * registered size, the size whose letters reach FOOTER_TOP. So the ground
 * keeps one proportion in both directions, and covers the footer the same way
 * where the room profile floors its type larger in pixels.
 */
function footerGround(categories: number): Box {
  const widest = Math.max(
    ...footerLines(categories, categories, categories, categories, categories).map(slugWidthOf),
  );
  return {
    cx: FOOTER_AT.x,
    cy: (COURT.y0 + FOOTER_TOP) / 2,
    tx: 1,
    ty: 0,
    // The whole registered width: half the line at twice the size.
    halfAlong: widest,
    halfAcross: (FOOTER_TOP - COURT.y0) / 2,
    pad: 0,
  };
}

/** Two words collide when anything one strikes — the word or its figure —
 *  lies on anything the other strikes. */
function collides(a: [Box, Box], b: [Box, Box]): boolean {
  for (const x of a) for (const y of b) if (overlaps(x, y)) return true;
  return false;
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
function layOut(words: Filed[], categories: number): void {
  const ground = footerGround(categories);
  const placed: [Box, Box][] = [];
  for (const w of words) {
    // A word nobody will strike must not take up room. The first build laid out
    // EVERY category and let the unnamed tail block the named head, so in a
    // long-tailed season most of what should have been struck was crowded out by
    // words the plate was never going to draw.
    if (!w.named) continue;
    const home = w.bearing;
    let ok = false;
    let boxes = boxesOf(w);
    for (let step = 0; step * ROTATE_STEP_RAD <= ROTATE_MAX_RAD && !ok; step++) {
      for (const sign of step === 0 ? [1] : [1, -1]) {
        w.moved = sign * step * ROTATE_STEP_RAD;
        w.bearing = home + w.moved;
        boxes = boxesOf(w);
        // Off the plate is off the plate: a word swung past the sideline is not
        // a solution, it is a different mistake. Tested on everything the word
        // strikes, not on its centre. The footer's ground is type, so a box
        // keeps its own clear floor from it as it does from a word.
        if (!onPlate(w, boxes)) continue;
        if (boxes.some((k) => overlaps(k, ground))) continue;
        if (placed.some((p) => collides(boxes, p))) continue;
        ok = true;
        break;
      }
    }
    w.homeless = !ok;
    if (ok) {
      placed.push(boxes);
    } else {
      // Back to the record's own place, and nothing moved: `strikeTicks` puts
      // the tick at `bearing - moved`, so a bearing tried and given up must
      // not stay behind in `moved` and carry the tick off the place measured.
      w.bearing = home;
      w.moved = 0;
    }
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
    // carries the share and this only says exactly how much. "Beneath" is the
    // word's own downward direction once it is turned by `rotation`, which on
    // the screen is (-sin, +cos): toward the hoop for every word on the floor.
    const sub = px * CENSUS_SHARE_SCALE;
    // Under the slug floor the face stops resolving and the figure reads as a
    // speck of dirt under its word, so it is not struck, and nothing is enlarged
    // to reach the floor: the word's size still carries the share and the
    // receipt lists every one exactly.
    if (sub < SLUG_MIN_PX) continue;
    strike(ctx, struckFigure(w.share), x - Math.sin(rotation) * px * FIGURE_DROP,
           y + Math.cos(rotation) * px * FIGURE_DROP, sub, alpha * CENSUS_WORD_ALPHA * 0.8, rotation);
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
    layOut(words, categoriesOf(season, taxonomy));
    strikeTicks(f, words, k * SIXFOLD_ALPHA * f.remains);
    strikeWords(f, words, k * SIXFOLD_ALPHA * f.remains, false);
  }
}

/** The machine's own field name and its size, plus the count so far. The
 *  league's schema names rather than friendly words: this is the machine's
 *  field, struck in stone. */
function strikeHeader(
  f: Frame,
  season: Season,
  taxonomy: string,
  arrived: number,
  opacity = 1,
): void {
  const { ctx, view, data, remains } = f;
  const column = data.taxonomyColumns[taxonomy] ?? taxonomy;
  const categories = season.vocabulary.taxonomies[column] ?? 0;
  const classified = Math.round(season.attempts * Math.min(1, Math.max(0, arrived)));
  drawSlug(ctx, view, [
    `${season.season}  ·  ${column}  ·  ${categories} CATEGORIES`,
    `${classified.toLocaleString()} SHOTS CLASSIFIED`,
  ], HEADER_AT, remains * CENSUS_HEAD_ALPHA * opacity);
}

/**
 * The sentence that makes the placement a measurement rather than a
 * composition. One line, once, in THE MEASURE's definition idiom, and it is not
 * optional: without it a viewer is entitled to read the layout as a design.
 */
function strikeDisclosure(f: Frame, opacity = 1): void {
  const { ctx, view, remains, display } = f;
  // The act's title is struck just under this sentence while it crosses into
  // the act. The room profile floors both larger, and there the title would
  // read as a third line of it, so the sentence stands down on the title's own
  // curve and returns as the title leaves.
  const title = display === "room"
    ? Math.max(0, ...CUED_ACTS.map((act) => actCueLevel(f, act)))
    : 0;
  drawSlug(ctx, view, [
    "EACH NAME STRUCK AT THE MEAN DISTANCE AND BEARING",
    "OF THE SHOTS THE RECORD GAVE IT · BEARING MOVED FOR ROOM, DISTANCE NEVER",
  ], HEADER_AT, remains * CENSUS_SUB_ALPHA * opacity * (1 - title), "aside", 62);
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
function strikeFooter(
  f: Frame,
  season: Season,
  taxonomy: string,
  words: Filed[],
  opacity = 1,
): void {
  const { ctx, view, remains } = f;
  const total = categoriesOf(season, taxonomy);
  const struck = words.filter((w) => w.named && !w.homeless).length;
  // Three DIFFERENT things, kept apart. The first build called them all "no
  // room", which put a category the record files beyond the halfcourt in the
  // same sentence as one that lost a collision — two facts about the record and
  // the plate that have nothing to do with each other.
  const beyond = words.filter((w) => w.beyond).length;
  const homeless = words.filter((w) => w.named && w.homeless).length;
  // STRUCK, not NAMED: a category can be named and still lose its place to a
  // collision, and this line has to add up to what is actually on the floor.
  const lines = footerLines(total, struck, total - struck, beyond, homeless);
  const alpha = remains * CENSUS_SUB_ALPHA * opacity;
  // The lines hang from a fixed first line by the type's own advance, and the
  // footer's ground ends at the plate's foot. Where a pixel floor sets the type
  // larger than its court size the advance grows with it, and the last line
  // would hang through the court's baseline. There the lines close up, never
  // nearer than set solid, so the last one still stands on the plate. The
  // first line does not move: it is the one the layout keeps words clear of.
  const px = slugBox(ctx, view, lines[0]!).height;
  const onPlate = view.s(FOOTER_AT.y - COURT.y0) - px / 2;
  const below = lines.length - 1;
  if (below * px * slugAdvanceOf() <= onPlate) {
    drawSlug(ctx, view, lines, FOOTER_AT, alpha);
    return;
  }
  const step = Math.max(px, onPlate / below);
  lines.forEach((line, i) => {
    drawSlug(ctx, view, [line], FOOTER_AT, alpha, "statement", i * step);
  });
}

/**
 * The receipt: the active taxonomy's rows, printed AFTER the filing.
 *
 * Kept in the gallery by decision (2026-08-08), over the alternative of no
 * table there at all. The floor is an ADDITIONAL visual representation of the
 * census's information, not a replacement for the table — so the table is not
 * necessarily gone — and of the two options, compared in pictures, the narrow
 * one stays.
 *
 * WHAT MAKES THIS NOT THE OLD TABLE'S FAILURE. It is one column, not two
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
function drawReceipt(
  f: Frame,
  season: Season,
  taxonomy: string,
  words: Filed[],
  localPhase = f.st.phase,
  completeAt = ARRIVAL_TAIL,
  holdTo = 1,
  opacity = 1,
): void {
  const { ctx, view, remains, navVisible, display } = f;
  // The panel already carries this apparatus. Suppress only when it is visibly
  // present; talk mode with the panel hidden remains a clean, complete canvas.
  if (navVisible) return;
  // Nothing until this filing has finished arriving, then in on its LOCAL tail.
  const tail = Math.max(Number.EPSILON, holdTo - completeAt);
  const k = Math.min(1, Math.max(0, ((localPhase - completeAt) / tail) * 3)) * opacity;
  if (k <= 0.01) return;

  const px = Math.max(display === "room" ? 13 : 8.5, Math.min(RECEIPT_TOP_PX, view.width / 150));
  const pad = Math.round(px * 1.6);
  // The near receipt's own leading at the largest type it is set in, kept
  // wherever the room profile floors the type above that size: at the bare
  // LINE the room's rows were set solid and touched top to bottom. Near never
  // exceeds that size, so its step is LINE exactly as before.
  const step = Math.max(LINE, Math.round((px * LINE) / RECEIPT_TOP_PX));
  ctx.save();
  ctx.font = `${px}px ${SLUG_FAMILY}`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  const total = Object.keys(season.classification[taxonomy] ?? {}).length;
  let y = pad + step;
  ctx.fillStyle = `rgba(${BONE_RGB}, ${CENSUS_SUB_ALPHA * remains * k})`;
  // The league's own column, as the header over the plate prints it: one
  // filing has one name on the screen.
  ctx.fillText(f.data.taxonomyColumns[taxonomy] ?? taxonomy, pad, y);
  y += step + 3;
  ctx.fillStyle = `rgba(${BONE_RGB}, ${CENSUS_ROW_ALPHA * remains * k})`;
  for (const w of words) {
    if (!w.named) continue;
    ctx.fillText(`${w.name.toLowerCase()}   ${struckFigure(w.share)}`, pad, y);
    y += step;
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

// --- TIME BELONGS TO THE COUNT -----------------------------------------------
//
// The window's census stops used to split the act evenly, so the smallest
// filing held the plate exactly as long as the largest — a plateau for the
// small filings and a sprint for the one that carries the hand's whole
// argument. The beats are now DERIVED from the record: each
// filing gets the central CENSUS_FILING_MIN_SECONDS floor, the remainder of the
// PRE-CLOSE score divides in proportion to each taxonomy's own category count
// (`vocabulary.taxonomies`). MACHINE SAW owns the shared CLOSE exactly: its
// build is short and its completed receipt holds for the rest of the Window.
// Time belongs to the count; nothing here is a judgment about which filing
// matters.
//
// ONE definition, TWO readers: the hand files by this table and the talk
// rail's CENSUS interior lists it (the WINDOW_BEATS discipline).

export function censusFilingProgress(localPhase: number): number {
  return Math.min(1, Math.max(0, localPhase / CENSUS_FILING_COMPLETE));
}

export function censusFilingOpacity(localPhase: number): number {
  if (localPhase <= CENSUS_FILING_HOLD_TO) return 1;
  return Math.min(1, Math.max(0, (1 - localPhase) / CENSUS_FILING_FADE));
}

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
  return censusWindowStops(columns.map((taxonomy) => {
    const title = taxonomyColumns[taxonomy] ?? taxonomy;
    return {
      taxonomy,
      title,
      count: season.vocabulary.taxonomies[title] ?? 0,
    };
  }), durationSeconds).map(({ taxonomy, title, from, to }) => ({
    taxonomy,
    title,
    from,
    to,
  }));
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
  // `voice` — THE FIFTH sentence at that rank, a deliberate exception rather
  // than this file's own choice: the rank is reserved for four sentences, and
  // copy does not move between ranks casually. This one earns it: the figure
  // struck above is how many body positions the machine held, and the record
  // kept one point per shot, which is the enclosure this whole piece is about,
  // in one line. The rank is the `"voice"` argument this call passes to
  // `drawSlug`.
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
  ], { x: 0, y: 60 }, remains * k, "aside", MACHINE_SAW_SCOPE_OFFSET_PX);
}

export function drawCensusHand(f: Frame): void {
  const { st, data, schedule, remains } = f;
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
  const local = stop
    ? Math.min(1, Math.max(0, (st.phase - stop.from) / (stop.to - stop.from)))
    : st.phase;
  const filingOpacity = stop && stop.taxonomy !== null
    ? censusFilingOpacity(local)
    : 1;
  const arrived = stop
    ? (machineSaw
      ? Math.min(1, Math.max(0,
        (windowSecondAtPhase(st.phase) - windowSecondAtPhase(stop.from))
          / MACHINE_SAW_BUILD_SECONDS))
      : censusFilingProgress(local))
    : st.arrived;

  // The league's own region names, in the league's own order, out of the
  // season's own artifact.
  const zoneNames = data.samples.get(st.year!)?.zone_names ?? [];

  if (machineSaw) {
    strikeMachineSaw(f, arrived);
  } else {
    const words = filing(season, taxonomy, arrived, zoneNames,
                         season.vocabulary.covering_90pct?.[taxonomy] ?? 1);
    layOut(words, categoriesOf(season, taxonomy));
    strikeTicks(f, words, remains * filingOpacity);
    strikeWords(f, words, remains * filingOpacity, taxonomy === "ZONE");
    strikeHeader(f, season, taxonomy, arrived, filingOpacity);
    strikeDisclosure(f, filingOpacity);
    strikeFooter(f, season, taxonomy, words, filingOpacity);
    if (stop) {
      drawReceipt(f, season, taxonomy, words, local,
        CENSUS_FILING_COMPLETE, CENSUS_FILING_HOLD_TO, filingOpacity);
    } else {
      drawReceipt(f, season, taxonomy, words);
    }

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
  drawSeasonField(f, {
    dim: remains * CENSUS_FIELD_DIM, withPrevious: false, prewarm: true,
  });

  for (const act of CUED_ACTS) drawActCue(f, act);
}

// --- the canvas tables, kept whole -------------------------------------------
//
// THE INFORMATION IS VALUABLE AND STAYS, and it does, in two places. The
// gallery keeps the CONTENT, as the floor: every row of the active taxonomy is
// a struck word, every row outside the named set is a tick and a footer count,
// and over one pass all six of these tables are shown in full. The presenter
// keeps the literal apparatus — absolute counts, all six groups, PLACEMENT, the
// window inventory — which the talk rail's census panel builds from the same
// classification maps (`navigator.ts`, `syncCensus`). The canvas version below,
// `drawCensusApparatus`, is retained exactly as it was; it is exported, and no
// hand calls it.
//
// PLACEMENT stays in the apparatus and leaves the gallery. `Located / No place
// given` is already drawn at full monumental scale in every hand — it IS the
// pin — and it is already named in THE LEDGER. A two-row table of it beside the
// object itself is the instrument failure in miniature.

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
/** The largest type the receipt is set in on a near screen. */
const RECEIPT_TOP_PX = 11;

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

export function drawCensusApparatus(f: Frame, season: Season): void {
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
