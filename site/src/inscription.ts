/** Numbers struck into the floor.
 *
 * Nothing the piece says lives in a row. Each season's figure is cut into the
 * middle of the court, held, then migrates out to a permanent slot on the 16-ft
 * annulus - the exact region draining of evidence - so that by the end thirty
 * numerals garland the void they measure.
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
import type { Schedule } from "./timeline";

/** Struck on the centreline, out in the middle the piece is about. */
const STRIKE_AT = { x: 0, y: 200 };
/** The annulus the numerals end on: 17 ft, mid-way through the emptying
 *  mid-range, and wide enough that thirty numerals sit clear of each other. */
const RING_R = 172;

const STRIKE_IN = 0.8;
const HOLD = 2.4;
const MIGRATE = 2.6;
/** A beat into the season, so the marks arrive first and the number answers. */
const STRIKE_DELAY = 2.2;

const FACE_SIZE = 34;
/** Small enough that thirty of them fit the annulus without touching. */
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

/** 39.9% -> "39·9" - a struck numeral, not a label with a percent sign. */
function struckFigure(share: number): string {
  return (100 * share).toFixed(1).replace(".", "·");
}

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
      counterLabel: s.contemporaneous ? "UNDER THE 22-FT LINE THEN IN FORCE" : undefined,
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

/** Cut, not printed: a shadowed upper wall above a dull face.
 *  `rotation` lays the numeral tangent to the annulus, so the ring reads as a
 *  garland around the void rather than a row of labels. */
function strike(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  px: number,
  alpha: number,
  rotation = 0,
): void {
  ctx.save();
  ctx.translate(x, y);
  if (rotation !== 0) ctx.rotate(rotation);
  ctx.font = `${px}px ${INSCRIPTION_FAMILY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.letterSpacing = `${Math.max(1, px * 0.08)}px`;

  const depth = Math.max(1, px * 0.045);
  ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.85, alpha * 1.1)})`;
  ctx.fillText(text, 0, -depth);
  ctx.fillStyle = `rgba(${BONE_RGB}, ${alpha * 0.62})`;
  ctx.fillText(text, 0, 0);
  ctx.letterSpacing = "0px";
  ctx.restore();
}

/**
 * Small machine type, for the two moments the piece names a thing rather than
 * counts it: the era with no coordinates, and the archive that holds nothing.
 */
export function drawSlug(
  ctx: CanvasRenderingContext2D,
  view: View,
  lines: string[],
  at: { x: number; y: number },
  alpha: number,
  offsetPx = 0,
): void {
  if (alpha <= 0.01) return;
  const px = Math.max(9, 11 * (view.scale / 2));
  ctx.save();
  ctx.font = `${px}px ${SLUG_FAMILY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.letterSpacing = `${px * 0.14}px`;
  ctx.fillStyle = `rgba(${BONE_RGB}, ${alpha * 0.5})`;
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
      drawSlug(ctx, view, [ins.label], { x: p.x, y: p.y }, naming * 0.9, -px * 0.85);
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
            p.alpha * fade * 0.75, px * 1.75);
        }
      }
    }
  }
  ctx.restore();
}
