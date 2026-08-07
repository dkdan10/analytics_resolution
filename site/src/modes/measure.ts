/** THE MEASURE — one published statistic, made in public, then orphaned.
 *
 * The other four hands draw what the record holds. This one draws what the
 * record was ONCE ABLE to produce, and then cannot.
 *
 * The NBA publishes closest-defender distance in four categories — Very Tight,
 * Tight, Open, Wide Open — and still does. It is not observed; it is
 * manufactured, out of optical geometry, by choosing an instant and cutting a
 * continuous quantity into four boxes. For eleven weeks that geometry was
 * public, so for eleven weeks the manufacture can be watched. Since 23 January
 * 2016 only the output has been published.
 *
 * So this hand spans the whole timeline, because its subject is a statistic's
 * three states and only one of them is in the window:
 *
 *   Acts 0-I   no such measure exists. The record does not say who was near.
 *   Act II     the league begins publishing it; nobody outside can make it.
 *              Four category names cut into the floor, with no figures.
 *   Act III    it is made, out of all 632 games, in four beats.
 *   Acts IV-V  four figures hold above four empty calipers, for the remaining
 *              eleven seasons of the loop. The number outlives its evidence.
 *
 * Everything is a pure function of the scrub float, like every other hand:
 * beats are phase windows, the flood is a slice of a fixed-order array, and
 * nothing is held between frames.
 *
 * No figure is written here. Every number resolves to a key in window.json.
 */

import type { DefenderBucket, HeroShot, Measures, WindowFile } from "../data";
import { drawSlug } from "../inscription";
import { BONE_RGB, INSCRIPTION_FAMILY } from "../palette";
import type { View } from "../plate";
import { label } from "../textatlas";
import { WINDOW_BEATS } from "../timeline";
import { drawSeasonField } from "./fieldlayer";
import type { Frame } from "./types";

/** The four beats of Act III. Defined in timeline.ts, because the rail lists
 *  them too and both must agree on where each begins. */
const BEAT = Object.fromEntries(
  WINDOW_BEATS.map((b) => [b.id, [b.from, b.to] as const]),
) as Record<(typeof WINDOW_BEATS)[number]["id"], readonly [number, number]>;

/** The inner annulus the four figures settle on: 11 ft, inside the 17-ft ring
 *  the thirty season numerals garland, so Act III leaves two rings around the
 *  same void — thirty seasons outside, four categories within. */
const FIGURE_R = 110;

/**
 * How many calipers are ever drawn at once.
 *
 * Looked at by eye at 400 and it was exactly the failure this project is built
 * against: a caliper is a long line, and four hundred of them crossing one
 * halfcourt is a tangle in which nothing can be read - not one measure, not the
 * four figures settling underneath. The flood has to read as weather over the
 * floor, with a legible leading edge.
 *
 * The true scale is never hidden by this: the counter beside the flood carries
 * the real number, and the drawn-against-measured fraction is struck on the
 * floor so the sample confesses itself rather than implying it is everything.
 */
const CALIPER_BUDGET = 150;

function win(phase: number, [a, b]: readonly [number, number]): number {
  return Math.max(0, Math.min(1, (phase - a) / (b - a)));
}

function fade(x: number, inAt = 0.12, outAt = 0.88): number {
  return Math.min(1, Math.min(x / inAt, (1 - x) / (1 - outAt)));
}

/** 44.4 -> "44·4": a struck numeral, in the piece's own face. */
function struck(v: number): string {
  return v.toFixed(1).replace(".", "·");
}

// --- marks -------------------------------------------------------------------

/**
 * THE CALIPER — the statistic itself, drawn as the thing it measures.
 *
 * A hairline between two points on the floor, serifed at both ends. Not a bar,
 * not a gauge: the segment IS the number, at the scale the floor is drawn in,
 * so its length can be read against the court's own geometry.
 */
function caliper(
  ctx: CanvasRenderingContext2D,
  view: View,
  sx: number,
  sy: number,
  dx: number,
  dy: number,
  alpha: number,
  serif = 3.2,
): void {
  if (alpha <= 0.01) return;
  const x0 = view.sx(sx);
  const y0 = view.sy(sy);
  const x1 = view.sx(dx);
  const y1 = view.sy(dy);
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const nx = -Math.sin(ang) * serif;
  const ny = Math.cos(ang) * serif;

  ctx.save();
  ctx.strokeStyle = `rgba(${BONE_RGB}, ${alpha})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.moveTo(x0 - nx, y0 - ny);
  ctx.lineTo(x0 + nx, y0 + ny);
  ctx.moveTo(x1 - nx, y1 - ny);
  ctx.lineTo(x1 + nx, y1 + ny);
  ctx.stroke();
  ctx.restore();
}

/**
 * THE EMPTY MEASURE — the same caliper with nothing between its ends.
 *
 * What Acts IV and V are left holding: the figures stay lit, the evidence does
 * not. This is the piece's argument as a mark rather than as a sentence.
 */
function emptyCaliper(
  ctx: CanvasRenderingContext2D,
  view: View,
  sx: number,
  sy: number,
  dx: number,
  dy: number,
  alpha: number,
): void {
  if (alpha <= 0.01) return;
  const x0 = view.sx(sx);
  const y0 = view.sy(sy);
  const x1 = view.sx(dx);
  const y1 = view.sy(dy);
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const nx = -Math.sin(ang) * 3.2;
  const ny = Math.cos(ang) * 3.2;
  ctx.save();
  ctx.strokeStyle = `rgba(${BONE_RGB}, ${alpha})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0 - nx, y0 - ny);
  ctx.lineTo(x0 + nx, y0 + ny);
  ctx.moveTo(x1 - nx, y1 - ny);
  ctx.lineTo(x1 + nx, y1 + ny);
  ctx.stroke();
  ctx.restore();
}

/**
 * THE DEFENDER RING — open, never filled.
 *
 * The feed gave the ball a third dimension and the players none: player z is
 * 0.0 in every measured row. So the ball carries height and the bodies stay
 * flat and hollow. Grain is a measurement here too.
 */
function ring(
  ctx: CanvasRenderingContext2D,
  view: View,
  x: number,
  y: number,
  alpha: number,
  r = 9,
): void {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.strokeStyle = `rgba(${BONE_RGB}, ${alpha})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(view.sx(x), view.sy(y), view.s(r), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** A figure struck into the floor, in the inscription face. */
function strikeFigure(
  ctx: CanvasRenderingContext2D,
  view: View,
  text: string,
  sub: string,
  x: number,
  y: number,
  alpha: number,
  size = 22,
): void {
  if (alpha <= 0.01) return;
  const px = Math.max(11, size * (view.scale / 2));
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${px}px ${INSCRIPTION_FAMILY}`;
  ctx.fillStyle = `rgba(${BONE_RGB}, ${alpha})`;
  ctx.fillText(text, view.sx(x), view.sy(y));
  if (sub) {
    const sp = Math.max(7, px * 0.32);
    ctx.font = `${sp}px ${INSCRIPTION_FAMILY}`;
    ctx.fillStyle = `rgba(${BONE_RGB}, ${alpha * 0.55})`;
    ctx.letterSpacing = `${sp * 0.16}px`;
    ctx.fillText(sub, view.sx(x), view.sy(y) + px * 0.82);
    ctx.letterSpacing = "0px";
  }
  ctx.restore();
}

/** Where category `i` of four sits on the inner annulus. */
function figureSlot(i: number, n: number): { x: number; y: number } {
  const a = Math.PI - ((i + 0.5) / n) * Math.PI;
  return { x: FIGURE_R * Math.cos(a), y: FIGURE_R * Math.sin(a) };
}

// --- the three states --------------------------------------------------------

/** Acts 0-I: the record does not say who was near. */
function drawAbsent(f: Frame): void {
  const { ctx, view, st, remains } = f;
  // Nothing is being measured here, so the field keeps most of its strength -
  // the absence is the subject and the marks are what is absent from.
  drawSeasonField(f, { dim: remains * 0.8 });
  const held = Math.min(1, st.phase * 3) * Math.min(1, (1 - st.phase) * 3);
  drawSlug(ctx, view, ["THE RECORD DOES NOT SAY WHO WAS NEAR"], { x: 0, y: 300 },
    remains * held * 0.55);
}

/** Act II: the names arrive; the values cannot be made by anyone outside. */
function drawNamesOnly(f: Frame, w: WindowFile | null): void {
  const { ctx, view, st, remains } = f;
  drawSeasonField(f, { dim: remains * 0.55 });

  const names = w ? w.contest.buckets.map((b) => b.name) : [];
  const shown = Math.ceil(st.phase * names.length * 1.5);
  names.forEach((name, i) => {
    if (i >= shown) return;
    const slot = figureSlot(i, names.length);
    const lab = label(name.toUpperCase(), Math.max(8, 9.5 * (view.scale / 2)), f.dpr);
    ctx.save();
    ctx.globalAlpha = remains * 0.5;
    ctx.drawImage(lab.canvas, view.sx(slot.x) - lab.width / 2,
      view.sy(slot.y) - lab.height / 2, lab.width, lab.height);
    ctx.restore();
  });
  drawSlug(ctx, view, ["THE LEAGUE BEGINS PUBLISHING THESE FOUR CATEGORIES"],
    { x: 0, y: 300 }, remains * Math.min(1, st.phase * 2) * 0.5);
}

/** Acts IV-V: the figures outlive the evidence that made them. */
function drawOrphaned(f: Frame, w: WindowFile | null): void {
  const { ctx, view, st, remains } = f;
  // The field recedes hard here. These acts are the piece's longest stretch and
  // the thing to be seen in them is four figures standing over four measures
  // with nothing inside them; at full strength the late-era rim blazes and the
  // empty calipers cannot be found at all.
  drawSeasonField(f, { dim: remains * 0.4 });
  if (!w) return;

  const buckets = w.contest.buckets;
  buckets.forEach((b, i) => {
    const slot = figureSlot(i, buckets.length);
    strikeFigure(ctx, view, struck(100 * b.share), b.name.toUpperCase(),
      slot.x, slot.y, remains * 0.72, 18);
    // Two serifs and nothing between them, under each figure. This is the
    // piece's argument as a mark rather than as a sentence, and it holds for
    // eleven seasons, so it is drawn at the strength of a thing meant to be read.
    const y = slot.y - 34;
    emptyCaliper(ctx, view, slot.x - 22, y, slot.x + 22, y, remains * 0.6);
  });

  // Said once, on the first season after the window closes - which is read off
  // the corpus's own last date, not written here.
  const closedIn = w.corpus.date_last ? Number(w.corpus.date_last.slice(0, 4)) : null;
  if (closedIn !== null && st.year === closedIn) {
    drawSlug(ctx, view, [
      "THE LEAGUE STILL PUBLISHES THESE FOUR CATEGORIES",
      "THESE ARE THE LAST FIGURES ANYONE OUTSIDE COULD COMPUTE",
    ], { x: 0, y: 320 }, remains * Math.min(1, st.phase * 2) * 0.5);
  }
}

// --- Act III, four beats -----------------------------------------------------

/** ONE — four shots, each with its caliper closing in real geometry. */
function beatOne(f: Frame, w: WindowFile, k: number): void {
  const { ctx, view, remains } = f;
  const heroes = w.contest.heroes;
  if (!heroes.length) return;

  const a = fade(k, 0.08, 0.9) * remains;
  // Each hero runs in its own quarter of the beat, so the four categories are
  // shown one at a time rather than as a crowd.
  heroes.forEach((h: HeroShot, i: number) => {
    const span = 1 / heroes.length;
    const local = (k - i * span) / span;
    if (local < 0 || local > 1.35) return;
    const t = Math.min(1, local);
    const frames = h.track.filter((p): p is number[] => p !== null);
    if (!frames.length) return;
    const idx = Math.min(frames.length - 1, Math.floor(t * (frames.length - 1)));
    const p = frames[idx]!;
    const alpha = a * (local > 1 ? Math.max(0, 1 - (local - 1) / 0.35) : 1);

    // The path the defender has already covered, so the closing is legible.
    ctx.save();
    ctx.strokeStyle = `rgba(${BONE_RGB}, ${alpha * 0.16})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    frames.slice(0, idx + 1).forEach((q, j) => {
      const px = view.sx(q[2]!);
      const py = view.sy(q[3]!);
      if (j === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.restore();

    ring(ctx, view, p[2]!, p[3]!, alpha * 0.7);
    caliper(ctx, view, p[0]!, p[1]!, p[2]!, p[3]!, alpha * 0.85);

    // The number changing as the defender closes, struck at the midpoint.
    const dist = Math.hypot(p[2]! - p[0]!, p[3]! - p[1]!) / 10;
    strikeFigure(ctx, view, struck(dist), "",
      (p[0]! + p[2]!) / 2, (p[1]! + p[3]!) / 2 + 14, alpha * 0.75, 15);

    if (t >= 1) {
      strikeFigure(ctx, view, "", h.bucket_name.toUpperCase(),
        (p[0]! + p[2]!) / 2, (p[1]! + p[3]!) / 2 - 22, alpha * 0.6, 15);
    }
  });

  drawSlug(ctx, view, ["ONE SHOT · THE DISTANCE AT THE MOMENT THE BALL LEAVES THE HAND"],
    { x: 0, y: 330 }, a * 0.45);
}

/** MANY — the rate climbs from one to all of them, in calendar order. */
function beatMany(f: Frame, w: WindowFile, k: number, m: Measures | null): void {
  const { ctx, view, remains } = f;
  const a = fade(k, 0.06, 0.94) * remains;
  const measured = w.recovery.measured;

  // Exponential ramp: 1, 4, 30, 400, thousands, all of them. The eye is given
  // a countable number for long enough to count it.
  const reached = Math.max(1, Math.round(Math.pow(measured, Math.min(1, k * 1.12))));

  if (m && m.n) {
    const upto = Math.min(m.n, Math.round((reached / measured) * m.n));
    const from = Math.max(0, upto - CALIPER_BUDGET);
    for (let i = from; i < upto; i++) {
      // Sharply weighted to the newest, so the eye follows the writing edge
      // instead of swimming in the accumulated tangle behind it.
      const age = (upto - i) / Math.max(1, upto - from);
      const fresh = (1 - age) * (1 - age);
      const alpha = a * (0.045 + 0.34 * fresh);
      caliper(ctx, view, m.x[i]!, m.y[i]!, m.dx[i]!, m.dy[i]!, alpha, 1.8);
    }
  }

  // The date the leading edge has reached — the corpus traversed as a calendar.
  const day0 = w.measures_bin.day0;
  if (day0 && m && m.n) {
    const upto = Math.min(m.n - 1, Math.round((reached / measured) * m.n));
    const d = new Date(`${day0}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + (m.day[upto] ?? 0));
    const stamp = d.toISOString().slice(0, 10);
    drawSlug(ctx, view, [stamp], { x: 0, y: 360 }, a * 0.5);
  }

  const drawn = Math.min(CALIPER_BUDGET, reached);
  drawSlug(ctx, view, [
    `${drawn.toLocaleString()} DRAWN OF ${reached.toLocaleString()} MEASURED`,
    `${w.corpus.games_parsed} GAMES · ELEVEN WEEKS · HALF OF ONE SEASON`,
  ], { x: 0, y: 330 }, a * 0.45);

  // The four figures assemble as the flood fills, and settle.
  const settle = Math.max(0, (k - 0.55) / 0.45);
  if (settle > 0) {
    w.contest.buckets.forEach((b, i) => {
      const slot = figureSlot(i, w.contest.buckets.length);
      strikeFigure(ctx, view, struck(100 * b.share), b.name.toUpperCase(),
        slot.x, slot.y, a * settle * 0.75, 20);
    });
  }
}

/**
 * THE INSTANT — a continuous quantity, sampled once, divided into four boxes.
 *
 * The measured approach curve runs out from the hoop and shortens toward the
 * release; when it stops, the three boundaries are cut into it and the four
 * category names are struck between them. That single image is the whole
 * argument: the number is not found, it is made.
 */
function beatInstant(f: Frame, w: WindowFile, k: number): void {
  const { ctx, view, remains } = f;
  const a = fade(k, 0.08, 0.9) * remains;
  const curve = w.contest.approach_curve_ft.filter((v): v is number => v !== null);
  if (!curve.length) return;

  const run = Math.min(1, k / 0.55);
  const idx = Math.min(curve.length - 1, Math.floor(run * (curve.length - 1)));
  const dist = curve[idx]!;

  // A hairline out from the hoop along the centreline; its length is the mean
  // closest-defender distance at that instant before release.
  const y0 = 0;
  const y1 = dist * 10;
  ctx.save();
  ctx.strokeStyle = `rgba(${BONE_RGB}, ${a * 0.7})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(view.sx(0), view.sy(y0));
  ctx.lineTo(view.sx(0), view.sy(y1));
  ctx.stroke();
  ctx.restore();

  const secs = w.contest.approach_seconds_before_release * (1 - run);
  strikeFigure(ctx, view, struck(dist), `${secs.toFixed(1)} S BEFORE RELEASE`,
    0, y1 + 26, a * 0.8, 20);

  // Once it stops, the boundaries are cut and the boxes named.
  const cut = Math.max(0, (k - 0.55) / 0.45);
  if (cut > 0) {
    const buckets: DefenderBucket[] = w.contest.buckets;
    ctx.save();
    ctx.strokeStyle = `rgba(${BONE_RGB}, ${a * cut * 0.6})`;
    ctx.lineWidth = 1;
    buckets.forEach((b) => {
      if (b.hi_ft === null) return;
      const ty = b.hi_ft * 10;
      ctx.beginPath();
      ctx.moveTo(view.sx(-14), view.sy(ty));
      ctx.lineTo(view.sx(14), view.sy(ty));
      ctx.stroke();
    });
    ctx.restore();

    buckets.forEach((b, i) => {
      const lo = b.lo_ft * 10;
      const hi = b.hi_ft === null ? Math.max(y1, lo + 60) : b.hi_ft * 10;
      const lab = label(b.name.toUpperCase(), Math.max(8, 9 * (view.scale / 2)), f.dpr);
      ctx.save();
      ctx.globalAlpha = a * cut * 0.55;
      ctx.drawImage(lab.canvas, view.sx(22), view.sy((lo + hi) / 2) - lab.height / 2,
        lab.width, lab.height);
      ctx.restore();
      const slot = figureSlot(i, buckets.length);
      strikeFigure(ctx, view, struck(100 * b.share), "", slot.x, slot.y, a * cut * 0.6, 18);
    });

    // What the definition is worth, in the piece's own terms.
    const g = w.contest.gather_rule;
    if (g.changed_share !== null) {
      drawSlug(ctx, view, [
        "THE LEAGUE DOES NOT PUBLISH WHICH INSTANT IT MEANS",
        `READ AT THE GATHER INSTEAD, ${struck(100 * g.changed_share)}% CHANGE CATEGORY`,
      ], { x: 0, y: 330 }, a * cut * 0.5);
    }
  }
}

/** THE CLOSE — 23 January 2016. Everything goes but the figures. */
function beatClose(f: Frame, w: WindowFile, k: number, m: Measures | null): void {
  const { ctx, view, remains } = f;
  const remain = Math.max(0, 1 - k / 0.7);
  const a = remains;

  if (m && m.n && remain > 0) {
    const upto = Math.round(m.n * remain);
    const from = Math.max(0, upto - CALIPER_BUDGET);
    for (let i = from; i < upto; i++) {
      caliper(ctx, view, m.x[i]!, m.y[i]!, m.dx[i]!, m.dy[i]!, a * 0.25 * remain, 2.2);
    }
  }

  w.contest.buckets.forEach((b, i) => {
    const slot = figureSlot(i, w.contest.buckets.length);
    strikeFigure(ctx, view, struck(100 * b.share), b.name.toUpperCase(),
      slot.x, slot.y, a * 0.7, 20);
  });

  const closing = Math.max(0, (k - 0.55) / 0.45);
  if (closing > 0 && w.corpus.date_last) {
    drawSlug(ctx, view, [w.corpus.date_last, "THE PUBLIC FEED CLOSES"],
      { x: 0, y: 330 }, a * closing * 0.55);
  }
}

// --- the hand ----------------------------------------------------------------

export function drawMeasureHand(f: Frame): void {
  const { ctx, view, st, data, remains } = f;
  const w = data.window;

  if (st.act === 3 && w) {
    // The field recedes almost entirely: for these 150 seconds the caliper is
    // the subject and the dots are only where it lands.
    drawSeasonField(f, { dim: remains * 0.3 });
    const m = data.measures();
    const p = st.phase;
    if (p < BEAT.one[1]) beatOne(f, w, win(p, BEAT.one));
    else if (p < BEAT.many[1]) beatMany(f, w, win(p, BEAT.many), m);
    else if (p < BEAT.instant[1]) beatInstant(f, w, win(p, BEAT.instant));
    else beatClose(f, w, win(p, BEAT.close), m);
    return;
  }

  if (st.act <= 1) {
    drawAbsent(f);
    return;
  }
  if (st.act === 2) {
    drawNamesOnly(f, w);
    return;
  }
  drawOrphaned(f, w);

  // Nothing to draw the measure from: say so rather than showing an empty floor.
  if (!w && st.act >= 3) {
    drawSlug(ctx, view, ["THE WINDOW STAGE HAS NOT BEEN RUN"], { x: 0, y: 300 },
      remains * 0.3);
  }
}
