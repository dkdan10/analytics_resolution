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
 * Every figure here comes from data/processed (rule 1, honesty -
 * docs/verification.md). This module formats numbers; it never authors them.
 */

import type { Season } from "./data";
import { contextDisplay, ROOM_TEXT_MIN_PX } from "./display";
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
import {
  ARRIVAL_TAIL, SEASON_SECONDS, WINDOW_YEAR,
  type Schedule,
} from "./timeline";
import {
  PLATE_NUMERAL_HOLD_SECONDS,
  PLATE_SHELL_FULL_PHASE,
  WINDOW_CREST_PHASE,
} from "./window-score";

/** Struck on the centreline, out in the middle the piece is about. */
const STRIKE_AT = { x: 0, y: 200 };
/** The annulus the numerals end on, in court tenths: mid-way through the
 *  emptying mid-range, and wide enough that one numeral per season sits clear
 *  of its neighbours. */
const RING_R = 172;

/**
 * THE NUMBER LEAVES LAST. The season's frozen tail becomes the moment its
 * measurement withdraws: the numeral strikes as the marks finish arriving,
 * stands central through a short hold, and is the one thing moving through
 * seconds that used to hold a single frame — settling resident on the ring
 * exactly as the next season's marks land. Composition constants, not
 * register entries (they time a figure and change no mark), and DERIVED
 * rather than typed: the strike is arrival's end (ARRIVAL_TAIL of an ordinary
 * season) and the migration ends at the season boundary, so nothing here can
 * drift away from the schedule it inhabits. For the window season the arc is
 * different, because the struck 24·6 would otherwise be the loudest object
 * at the exact instant the found possession is smallest: the
 * window's numeral WAITS, strikes at the season beat's crest
 * (window-score.ts:WINDOW_CREST_PHASE — the same anchor THE HAND's kept points
 * rise on), holds fully for its scored dwell, then migrates only until the
 * terminal shell becomes whole. It stays resident through the shell's
 * terminal hold, so the closing frame is genuinely stable.
 * The possession enters decongested; the statistic strikes as a consequence
 * of the season just built.
 *
 * What this costs, and it is accepted: the numeral no longer
 * coexists centrally with mid-arrival marks — the marks finish, and the
 * number answers.
 */
const STRIKE_IN = 0.8;
const HOLD = 0.8;
const STRIKE_DELAY = ARRIVAL_TAIL * SEASON_SECONDS;

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
  /** Seconds the numeral remains fully struck before it begins to migrate. */
  hold: number;
  /** Seconds the migration takes — derived so residence lands exactly at the
   *  season boundary whatever the strike's delay was. */
  migrate: number;
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

/** A share -> a struck numeral, not a label with a percent sign. Exported
 *  because THE CENSUS says a share the same way the plate does, or the floor
 *  holds two conventions for one quantity. */
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
    // The window's numeral waits for its season: it strikes at the beat's
    // crest and completes its migration when the shell becomes whole. It then
    // stays resident through the terminal hold.
    const duration = seg?.duration ?? SEASON_SECONDS;
    const delay = s.year === WINDOW_YEAR ? WINDOW_CREST_PHASE * duration : STRIKE_DELAY;
    const hold = s.year === WINDOW_YEAR ? PLATE_NUMERAL_HOLD_SECONDS : HOLD;
    // The Window's numeral completes its migration with the rest of the motion
    // when the terminal shell becomes whole, then stays resident through the
    // terminal receipt hold. Ordinary seasons still land at their own
    // boundary exactly as before.
    const migrationEnd = s.year === WINDOW_YEAR
      ? PLATE_SHELL_FULL_PHASE * duration
      : duration;
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
      strikeAt: (seg?.start ?? 0) + delay,
      hold,
      migrate: migrationEnd - delay - STRIKE_IN - hold,
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
  if (u < STRIKE_IN + ins.hold) {
    return { x: STRIKE_AT.x, y: STRIKE_AT.y, scale: 1, alpha: 1, settled: 0 };
  }
  const p = easeInOut((u - STRIKE_IN - ins.hold) / ins.migrate);
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
 * Exported because THE CENSUS strikes its categories into the same floor by
 * the same idiom - one engraved system rather than two. Its words are
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
 * THE DEFECT THIS EXISTS TO REMOVE. This function used to have ONE size and
 * ONE alpha for every place it is called from, so "NO SHOT WAS GIVEN A
 * PLACE" — the sentence the piece opens on, alone over bare stone — was set
 * exactly like a date stamp ticking past during the flood, and at half whatever
 * alpha its caller asked for. The piece could not say anything loudly because it
 * had no loud. That is the whole of the problem with asking one typography to
 * be both texture and argument: not that the texture is small, but that there
 * was only one voice.
 *
 *   voice      the four sentences the piece is ABOUT. At most one is ever up.
 *   statement  the default, and every other thing the piece states.
 *   aside      an annotation subordinate to the mark beside it. Numerically the
 *              size and ink every slug used to take, so these stay exactly where
 *              they were while the sentences around them grow.
 *
 * Sizes are in court tenths, so type does not change with the window. Which
 * string is which rank is the `rank` argument its caller passes, so the call
 * sites are the only table of which string speaks at which rank.
 * This function does not decide it, and no string's CONTENT changes with rank.
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
  const room = contextDisplay(ctx) === "room";
  const px = Math.max(SLUG_MIN_PX, view.s(r.tenths), room ? ROOM_TEXT_MIN_PX[rank] : 0);
  const ink = room
    ? Math.max(r.alpha, rank === "voice" ? 0.94 : rank === "statement" ? 0.84 : 0.76)
    : r.alpha;
  ctx.save();
  ctx.font = `${px}px ${SLUG_FAMILY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.letterSpacing = `${px * 0.14}px`;
  ctx.fillStyle = `rgba(${BONE_RGB}, ${alpha * ink})`;
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
    const px = Math.max(
      sized * p.scale * (view.scale / 2),
      contextDisplay(ctx) === "room" && p.settled >= 0.999 ? 14 : 0,
    );
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

/** Coda lift: the completed ring is redrawn over the receding hand, then the
 * ring itself takes the final fade. This is deliberately separate from the
 * ordinary under-field inscription pass so layer order is explicit. */
export function drawSettledInscriptions(
  ctx: CanvasRenderingContext2D,
  view: View,
  inscriptions: Inscription[],
  t: number,
  alpha: number,
): void {
  if (alpha <= 0.01) return;
  ctx.save();
  for (const ins of inscriptions) {
    const p = placementAt(ins, t);
    if (!p || p.settled < 0.999) continue;
    const byWeight = 0.55 + 1.05 * Math.min(1, ins.weight / 0.4);
    const sized = FACE_SIZE * (byWeight + (1 - byWeight) * p.settled);
    const px = Math.max(
      sized * p.scale * (view.scale / 2),
      contextDisplay(ctx) === "room" ? 14 : 0,
    );
    const rotation = (Math.PI / 2 - ins.angle) * p.settled;
    // A stronger overprint than the engraved under-layer; still cut through
    // `strike`, so face/shadow material remains one system.
    strike(ctx, ins.text, view.sx(p.x), view.sy(p.y), px, alpha * 1.2, rotation);
  }
  ctx.restore();
}
