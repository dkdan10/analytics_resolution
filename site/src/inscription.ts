/** Numbers struck into the floor.
 *
 * Nothing the piece says lives in a row. Each season's figure is cut into the
 * middle of the court, held, then migrates out to a permanent slot on the ring
 * below - the exact region draining of evidence - so that by the end one
 * numeral per season garlands the void they measure.
 *
 * Inscriptions are drawn *under* the marks, because they are cut into the plate
 * rather than laid on it: the shots of every later season settle over them.
 *
 * Every figure here comes from data/processed (CLAUDE.md honesty rule). This
 * module formats numbers; it never authors them.
 */

import type { Season } from "./data";
import { BONE_RGB, INSCRIPTION_FAMILY, SLUG_FAMILY } from "./palette";
import type { View } from "./plate";
import {
  SLUG_ASIDE_ALPHA,
  SLUG_ASIDE_TENTHS,
  SLUG_MIN_PX,
  SLUG_STATEMENT_ALPHA,
  SLUG_STATEMENT_TENTHS,
  SLUG_VOICE_ALPHA,
  SLUG_VOICE_TENTHS,
  STRIKE_FACE_ALPHA,
  STRIKE_SHADOW_K,
  STRIKE_SHADOW_MAX,
} from "./scalars";
import type { Schedule } from "./timeline";

/** Struck on the centreline, out in the middle the piece is about. */
const STRIKE_AT = { x: 0, y: 200 };
/** The annulus the numerals end on, in court tenths: mid-way through the
 *  emptying mid-range, and wide enough that one numeral per season sits clear
 *  of its neighbours. */
const RING_R = 172;

const STRIKE_IN = 0.8;
const HOLD = 2.4;
const MIGRATE = 2.6;
/** A beat into the season, so the marks arrive first and the number answers. */
const STRIKE_DELAY = 2.2;

const FACE_SIZE = 34;
/** Small enough that a numeral per season fits the annulus without touching. */
const RESIDENT_SCALE = 0.3;

export interface Inscription {
  year: number;
  /** The figure, already formatted: "39·9". */
  text: string;
  /** What the figure is - the league's own category name, so a viewer is never
   *  asked to read a bare numeral and guess. */
  label: string;
  /** Second reading for the one season the record disagrees with itself. */
  counter?: string;
  counterLabel?: string;
  /** 0..1 - the share itself. The numeral is struck at a size proportional to
   *  it, so the figure physically shrinks as the thing it measures does and the
   *  number cannot disagree with its own picture. */
  weight: number;
  strikeAt: number;
  slot: { x: number; y: number };
  /** Where on the ring, in radians - the numeral lies tangent to it. */
  angle: number;
}

/** The NBA's own category, named as theirs. Disclosed in wall text. */
const TRACKED_ZONE = "Mid-Range";

/** A measured length, as the plate says it: a whole number of feet loses its
 *  trailing zero, anything else keeps one decimal. */
function fmtFt(ft: number): string {
  return Number.isInteger(ft) ? String(ft) : ft.toFixed(1);
}

/** A share -> a struck numeral, not a label with a percent sign. Exported since
 *  V-05: THE CENSUS says a share the same way the plate does, or the floor holds
 *  two conventions for one quantity. */
export function struckFigure(share: number): string {
  return (100 * share).toFixed(1).replace(".", "·");
}

/** How far apart a struck glyph's letters sit, as a fraction of its cap height.
 *  Exported because THE CENSUS has to MEASURE a word it is going to strike, and
 *  a ruler set to different spacing from the pen lays out boxes for a string
 *  nobody draws. */
export const STRIKE_LETTER_SPACING = 0.08;

export function buildInscriptions(seasons: Season[], schedule: Schedule): Inscription[] {
  const n = seasons.length;
  return seasons.map((s, i) => {
    // Slots run across the semicircle in season order, so the ring reads as
    // time laid around the hole it is measuring.
    const a = Math.PI - (i + 0.5) * (Math.PI / n);
    const seg = schedule.byYear.get(s.year);
    return {
      year: s.year,
      text: struckFigure(s.mid_share),
      label: `${TRACKED_ZONE.toUpperCase()} · ${s.season}`,
      // 1996-97 is struck twice: what the taxonomy files, and what was played
      // under the 22-ft line then in force. They part company once, in public.
      counter: s.contemporaneous
        ? struckFigure(s.contemporaneous.contemporaneous_mid_share)
        : undefined,
      // The line's own radius, from the season's artifact. The arc the plate
      // draws for 1996-97 comes from the same key, so the words and the
      // geometry cannot disagree (seasons.json:contemporaneous.line_ft).
      counterLabel: s.contemporaneous
        ? `UNDER THE ${fmtFt(s.contemporaneous.line_ft)}-FT LINE THEN IN FORCE`
        : undefined,
      weight: s.mid_share,
      strikeAt: (seg?.start ?? 0) + STRIKE_DELAY,
      slot: { x: RING_R * Math.cos(a), y: RING_R * Math.sin(a) },
      angle: a,
    };
  });
}

function easeInOut(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

interface Placement {
  x: number;
  y: number;
  scale: number;
  alpha: number;
  /** 0 while central, 1 once resident on the ring. */
  settled: number;
}

function placementAt(ins: Inscription, t: number): Placement | null {
  const u = t - ins.strikeAt;
  if (u < 0) return null;

  if (u < STRIKE_IN) {
    const p = u / STRIKE_IN;
    return { x: STRIKE_AT.x, y: STRIKE_AT.y, scale: 1 + 0.12 * (1 - p), alpha: p, settled: 0 };
  }
  if (u < STRIKE_IN + HOLD) {
    return { x: STRIKE_AT.x, y: STRIKE_AT.y, scale: 1, alpha: 1, settled: 0 };
  }
  const p = easeInOut((u - STRIKE_IN - HOLD) / MIGRATE);
  return {
    x: STRIKE_AT.x + (ins.slot.x - STRIKE_AT.x) * p,
    y: STRIKE_AT.y + (ins.slot.y - STRIKE_AT.y) * p,
    scale: 1 + (RESIDENT_SCALE - 1) * p,
    alpha: 1 - 0.55 * p,
    settled: p,
  };
}

/**
 * Cut, not printed: a shadowed upper wall above a dull face.
 *
 * `rotation` lays the numeral tangent to the annulus, so the ring reads as a
 * garland around the void rather than a row of labels.
 *
 * Exported since V-05, because THE CENSUS strikes its categories into the same
 * floor by the same idiom - one engraved system rather than two. Its words are
 * the same KIND of claim as a season's figure, so they are cut the same way.
 */
export function strike(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  px: number,
  alpha: number,
  rotation = 0,
  /** The face's colour, when a caller has one the record supplied. THE CENSUS's
   *  zone filing passes the league's own hue for that region — permitted
   *  because ZONE *is* SHOT_ZONE_BASIC, so the colour exposes a classification
   *  rather than adding one. Everything else strikes in bone. */
  rgb: string = BONE_RGB,
): void {
  ctx.save();
  ctx.translate(x, y);
  if (rotation !== 0) ctx.rotate(rotation);
  ctx.font = `${px}px ${INSCRIPTION_FAMILY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.letterSpacing = `${Math.max(1, px * STRIKE_LETTER_SPACING)}px`;

  const depth = Math.max(1, px * 0.045);
  ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(STRIKE_SHADOW_MAX, alpha * STRIKE_SHADOW_K)})`;
  ctx.fillText(text, 0, -depth);
  ctx.fillStyle = `rgba(${rgb}, ${alpha * STRIKE_FACE_ALPHA})`;
  ctx.fillText(text, 0, 0);
  ctx.letterSpacing = "0px";
  ctx.restore();
}

/**
 * Machine type: everything the piece says in words, at one of three ranks.
 *
 * THE DEFECT THIS EXISTS TO REMOVE (audit V-08). This function had ONE size and
 * ONE alpha for every place it is called from, so "NO SHOT WAS GIVEN A
 * PLACE" — the sentence the piece opens on, alone over bare stone — was set
 * exactly like a date stamp ticking past during the flood, and at half whatever
 * alpha its caller asked for. The piece could not say anything loudly because it
 * had no loud. That is the whole of "the same typography is asked to be both
 * texture and argument": not that the texture is small, but that there was only
 * one voice.
 *
 *   voice      the four sentences the piece is ABOUT. At most one is ever up.
 *   statement  the default, and every other thing the piece states.
 *   aside      an annotation subordinate to the mark beside it. Numerically the
 *              size and ink every slug used to take, so these stay exactly where
 *              they were while the sentences around them grow.
 *
 * Sizes are in court tenths, so type does not change with the window. Which
 * string is which rank is docs/build/typography-inventory.md, approved by the artist;
 * this function does not decide it and no string's CONTENT changes with rank.
 */
export type SlugRank = "voice" | "statement" | "aside";

const SLUG_RANK: Record<SlugRank, { tenths: number; alpha: number }> = {
  voice: { tenths: SLUG_VOICE_TENTHS, alpha: SLUG_VOICE_ALPHA },
  statement: { tenths: SLUG_STATEMENT_TENTHS, alpha: SLUG_STATEMENT_ALPHA },
  aside: { tenths: SLUG_ASIDE_TENTHS, alpha: SLUG_ASIDE_ALPHA },
};

export function drawSlug(
  ctx: CanvasRenderingContext2D,
  view: View,
  lines: string[],
  at: { x: number; y: number },
  alpha: number,
  rank: SlugRank = "statement",
  offsetPx = 0,
): void {
  if (alpha <= 0.01) return;
  const r = SLUG_RANK[rank];
  const px = Math.max(SLUG_MIN_PX, view.s(r.tenths));
  ctx.save();
  ctx.font = `${px}px ${SLUG_FAMILY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.letterSpacing = `${px * 0.14}px`;
  ctx.fillStyle = `rgba(${BONE_RGB}, ${alpha * r.alpha})`;
  lines.forEach((line, i) => {
    ctx.fillText(line, view.sx(at.x), view.sy(at.y) + offsetPx + i * px * 1.9);
  });
  ctx.letterSpacing = "0px";
  ctx.restore();
}

/**
 * Draw every inscription struck so far. Later seasons are still central; the
 * ones behind them have already settled onto the ring, which is why the piece
 * accumulates rather than replaces.
 */
export function drawInscriptions(
  ctx: CanvasRenderingContext2D,
  view: View,
  inscriptions: Inscription[],
  t: number,
): void {
  ctx.save();
  for (const ins of inscriptions) {
    const p = placementAt(ins, t);
    if (!p) continue;

    // Central size carries the measurement: 39·9 is struck large and 9·7 small,
    // so the figure shrinks with the thing it counts. The ring is uniform,
    // because there the numerals are a garland and have to stay legible.
    const byWeight = 0.55 + 1.05 * Math.min(1, ins.weight / 0.4);
    const sized = FACE_SIZE * (byWeight + (1 - byWeight) * p.settled);
    const px = sized * p.scale * (view.scale / 2);
    // Struck upright in the middle, turning into the ring as it settles.
    const rotation = (Math.PI / 2 - ins.angle) * p.settled;
    strike(ctx, ins.text, view.sx(p.x), view.sy(p.y), px, p.alpha, rotation);

    // While it is central, the figure says what it is. A bare numeral is the
    // thing the piece was rightly criticised for.
    const naming = (1 - p.settled) * p.alpha;
    if (naming > 0.01) {
      // `aside`: this names the numeral above it and must stay subordinate to
      // it. Numerically what every slug in the piece used to be.
      drawSlug(ctx, view, [ins.label], { x: p.x, y: p.y }, naming * 0.9, "aside", -px * 0.85);
    }

    // The counter-reading rides just below, and only for as long as the two
    // disagree: it fades out as the pair migrates, leaving the taxonomy's
    // number on the ring because that is the category the league kept.
    if (ins.counter) {
      const fade = 1 - p.settled;
      if (fade > 0.01) {
        strike(
          ctx,
          ins.counter,
          view.sx(p.x),
          view.sy(p.y) + px * 1.15,
          px * 0.86,
          p.alpha * fade * 0.8,
        );
        if (ins.counterLabel) {
          drawSlug(ctx, view, [ins.counterLabel], { x: p.x, y: p.y },
            p.alpha * fade * 0.75, "aside", px * 1.75);
        }
      }
    }
  }
  ctx.restore();
}
