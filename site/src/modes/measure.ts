/** THE MEASURE — one published statistic, made in public, then orphaned.
 *
 * The other four hands draw what the record holds. This one draws what the
 * record was ONCE ABLE to produce, and then cannot.
 *
 * The NBA publishes closest-defender distance in a handful of categories —
 * Very Tight, Tight, Open, Wide Open — and still does. It is not observed; it
 * is manufactured, out of optical geometry, by choosing an instant and cutting
 * a continuous quantity into boxes. For the span of the window that geometry
 * was public, so for that span the manufacture can be watched. After the
 * corpus's last archive, only the output has been published. Every count and
 * every date below comes from window.json and facts.json.
 *
 * So this hand spans the whole timeline, because its subject is a statistic's
 * three states and only one of them is in the window:
 *
 *   Acts 0-I   no such measure exists. The record does not say who was near.
 *   Act II     the league begins publishing it; nobody outside can make it.
 *              The category names cut into the floor, with no figures.
 *   Act III    it is made, out of every game in the corpus, in four beats.
 *   Acts IV-V  the figures hold above empty calipers for the rest of the loop.
 *              The number outlives its evidence.
 *
 * Everything is a pure function of the scrub float, like every other hand:
 * beats are phase windows, the flood is a slice of a fixed-order array, and
 * nothing is held between frames.
 *
 * No figure is written here. Every number resolves to a key in window.json.
 */

import {
  factExternal,
  factNum,
  type DefenderBucket,
  type HeroShot,
  type Measures,
  type WindowFile,
} from "../data";
import { drawSlug } from "../inscription";
import { BONE_RGB, INSCRIPTION_FAMILY } from "../palette";
import type { View } from "../plate";
import {
  BUCKET_LABEL_ALPHA,
  BUCKET_NAME_TENTHS,
  CALIPER_SERIF,
  CALIPER_SERIF_CLOSE,
  CALIPER_SERIF_FLOOD,
  CLOSE_ALPHA,
  DEFENDER_RING_R,
  FIGURE_SUB_ALPHA,
  FLOOD_ALPHA_BASE,
  FLOOD_ALPHA_FRESH,
  HERO_ALPHA,
  HERO_PATH_ALPHA,
  HERO_RING_ALPHA,
  HERO_TAIL,
  INSTANT_BAND_HALF_W,
  INSTANT_CUT_ALPHA,
  INSTANT_LINE_ALPHA,
  NAMES_ONLY_ALPHA,
  SLUG_MIN_PX,
} from "../scalars";
import { label } from "../textatlas";
import { WINDOW_BEATS } from "../timeline";
import { drawSeasonField } from "./fieldlayer";
import type { Frame } from "./types";

/** The four beats of Act III. Defined in timeline.ts, because the rail lists
 *  them too and both must agree on where each begins. */
const BEAT = Object.fromEntries(
  WINDOW_BEATS.map((b) => [b.id, [b.from, b.to] as const]),
) as Record<(typeof WINDOW_BEATS)[number]["id"], readonly [number, number]>;

/** The inner annulus the figures settle on, in court tenths: inside the ring
 *  the season numerals garland, so Act III leaves two rings around the same
 *  void — the seasons outside, the categories within. */
const FIGURE_R = 110;

/**
 * How many calipers are ever drawn at once.
 *
 * Looked at by eye at several times this and it was exactly the failure this
 * project is built against: a caliper is a long line, and that many crossing
 * one halfcourt is a tangle in which nothing can be read - not one measure, not
 * the figures settling underneath. The flood has to read as weather over the
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

/**
 * A beat's own envelope, and why the ramps are short.
 *
 * Only one beat is drawn at a time, so a long fade out into a long fade in is
 * not a cross-dissolve — it is an empty plate. Measured across the three
 * internal boundaries before this was shortened: the flood dimmed to nothing
 * over three and a half seconds, the plate held one hairline, and the next beat
 * took nearly three more to arrive. Beats now hold almost to their edge and the
 * handover is quick, which is the only honest way to have soft edges without a
 * gap between them. The ramps exist so nothing snaps on; they are not
 * transitions.
 */
function fade(x: number, inAt = 0.01, outAt = 0.99): number {
  return Math.min(1, Math.min(x / inAt, (1 - x) / (1 - outAt)));
}

/** A measured figure as a struck numeral, in the piece's own face. */
function struck(v: number): string {
  return v.toFixed(1).replace(".", "·");
}

/**
 * A small COUNT, spelled. The piece says "THESE FOUR CATEGORIES" because that
 * is how a wall label reads, and the four used to be typed here - so the slug
 * would have gone on saying four if the league had ever published five. This
 * formats a number the artifact supplies; it never supplies one.
 */
const WORDS = ["ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN",
  "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE"];

function spell(n: number): string {
  return WORDS[n] ?? String(n);
}

// --- marks -------------------------------------------------------------------

/**
 * THE CALIPER — the statistic itself, drawn as the thing it measures.
 *
 * A hairline between two points on the floor, serifed at both ends. Not a bar,
 * not a gauge: the segment IS the number, at the scale the floor is drawn in,
 * so its length can be read against the court's own geometry.
 */
export function caliper(
  ctx: CanvasRenderingContext2D,
  view: View,
  sx: number,
  sy: number,
  dx: number,
  dy: number,
  alpha: number,
  serif: number = CALIPER_SERIF,
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
  const nx = -Math.sin(ang) * CALIPER_SERIF;
  const ny = Math.cos(ang) * CALIPER_SERIF;
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
 * zero in every measured row of the corpus. So the ball carries height and the
 * bodies stay flat and hollow. Grain is a measurement here too.
 */
function ring(
  ctx: CanvasRenderingContext2D,
  view: View,
  x: number,
  y: number,
  alpha: number,
  r: number = DEFENDER_RING_R,
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
    ctx.fillStyle = `rgba(${BONE_RGB}, ${alpha * FIGURE_SUB_ALPHA})`;
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
  drawSeasonField(f, { dim: remains * 0.8, reveal: true });
  const held = Math.min(1, st.phase * 3) * Math.min(1, (1 - st.phase) * 3);
  drawSlug(ctx, view, ["THE RECORD DOES NOT SAY WHO WAS NEAR"], { x: 0, y: 300 },
    remains * held * 0.55);
}

/** Act II: the names arrive; the values cannot be made by anyone outside. */
function drawNamesOnly(f: Frame, w: WindowFile | null): void {
  const { ctx, view, st, remains } = f;
  drawSeasonField(f, { dim: remains * 0.55, reveal: true });

  const names = w ? w.contest.buckets.map((b) => b.name) : [];
  const shown = Math.ceil(st.phase * names.length * 1.5);
  names.forEach((name, i) => {
    if (i >= shown) return;
    const slot = figureSlot(i, names.length);
    const lab = label(name.toUpperCase(), Math.max(8, 9.5 * (view.scale / 2)), f.dpr);
    ctx.save();
    ctx.globalAlpha = remains * NAMES_ONLY_ALPHA;
    ctx.drawImage(lab.canvas, view.sx(slot.x) - lab.width / 2,
      view.sy(slot.y) - lab.height / 2, lab.width, lab.height);
    ctx.restore();
  });
  drawSlug(ctx, view,
    [`THE LEAGUE BEGINS PUBLISHING THESE ${spell(names.length)} CATEGORIES`],
    { x: 0, y: 300 }, remains * Math.min(1, st.phase * 2) * 0.5);
}

/** Acts IV-V: the figures outlive the evidence that made them. */
function drawOrphaned(f: Frame, w: WindowFile | null): void {
  const { ctx, view, st, remains } = f;
  // The field recedes hard here. These acts are the piece's longest stretch and
  // the thing to be seen in them is four figures standing over four measures
  // with nothing inside them; at full strength the late-era rim blazes and the
  // empty calipers cannot be found at all.
  drawSeasonField(f, { dim: remains * 0.4, reveal: true });
  if (!w) return;

  const buckets = w.contest.buckets;
  buckets.forEach((b, i) => {
    const slot = figureSlot(i, buckets.length);
    strikeFigure(ctx, view, struck(100 * b.share), b.name.toUpperCase(),
      slot.x, slot.y, remains * 0.72, 18);
    // Two serifs and nothing between them, under each figure. This is the
    // piece's argument as a mark rather than as a sentence, and it holds for
    // every act after the window - most of the loop - so it is drawn at the
    // strength of a thing meant to be read.
    const y = slot.y - 34;
    emptyCaliper(ctx, view, slot.x - 22, y, slot.x + 22, y, remains * 0.6);
  });

  // The figures above are shares of the RECOVERED set, and they hold here for
  // the rest of the loop with no evidence under them at all - so the one place
  // a viewer sees them longest is the place the selection must be stated.
  if (w.bias.scope) {
    drawSlug(ctx, view, [w.bias.scope], { x: 0, y: 250 }, remains * 0.4);
  }

  // Said once, on the first season after the window closes - which is read off
  // the corpus's own last date, not written here.
  const closedIn = w.corpus.date_last ? Number(w.corpus.date_last.slice(0, 4)) : null;
  if (closedIn !== null && st.year === closedIn) {
    drawSlug(ctx, view, [
      `THE LEAGUE STILL PUBLISHES THESE ${spell(buckets.length)} CATEGORIES`,
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

  const a = fade(k) * remains;
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
    const alpha = a * (local > 1 ? Math.max(0, 1 - (local - 1) / HERO_TAIL) : 1);

    // The path the defender has already covered, so the closing is legible.
    ctx.save();
    ctx.strokeStyle = `rgba(${BONE_RGB}, ${alpha * HERO_PATH_ALPHA})`;
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

    ring(ctx, view, p[2]!, p[3]!, alpha * HERO_RING_ALPHA);
    caliper(ctx, view, p[0]!, p[1]!, p[2]!, p[3]!, alpha * HERO_ALPHA);

    // The number changing as the defender closes, struck at the midpoint.
    const dist = Math.hypot(p[2]! - p[0]!, p[3]! - p[1]!) / 10;
    strikeFigure(ctx, view, struck(dist), "",
      (p[0]! + p[2]!) / 2, (p[1]! + p[3]!) / 2 + 14, alpha * 0.75, 15);

    if (t >= 1) {
      strikeFigure(ctx, view, "", h.bucket_name.toUpperCase(),
        (p[0]! + p[2]!) / 2, (p[1]! + p[3]!) / 2 - 22, alpha * 0.6, 15);
    }
  });

  // `voice`: what a caliper IS, said once, over the one shot that shows it.
  drawSlug(ctx, view, ["ONE SHOT · THE DISTANCE AT THE MOMENT THE BALL LEAVES THE HAND"],
    { x: 0, y: 330 }, a * 0.45, "voice");
}

/** MANY — the rate climbs from one to all of them, in calendar order. */
function beatMany(f: Frame, w: WindowFile, k: number, m: Measures | null): void {
  const { ctx, view, remains } = f;
  const a = fade(k) * remains;
  const measured = w.recovery.measured;

  // Exponential ramp: one, a few, a few dozen, hundreds, thousands, all of
  // them. The eye is given a countable number for long enough to count it.
  const reached = Math.max(1, Math.round(Math.pow(measured, Math.min(1, k * 1.12))));

  if (m && m.n) {
    const upto = Math.min(m.n, Math.round((reached / measured) * m.n));
    const from = Math.max(0, upto - CALIPER_BUDGET);
    for (let i = from; i < upto; i++) {
      // Sharply weighted to the newest, so the eye follows the writing edge
      // instead of swimming in the accumulated tangle behind it.
      const age = (upto - i) / Math.max(1, upto - from);
      const fresh = (1 - age) * (1 - age);
      const alpha = a * (FLOOD_ALPHA_BASE + FLOOD_ALPHA_FRESH * fresh);
      caliper(ctx, view, m.x[i]!, m.y[i]!, m.dx[i]!, m.dy[i]!, alpha, CALIPER_SERIF_FLOOD);
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
  // The span is the corpus's own, and the second line no longer implies the
  // recovered set stands for the season: it says what the set IS. Both strings
  // are templated by the pipeline from the figures they quote (audit F-12).
  const days = factNum(f.data.facts, "window.days_inclusive");
  drawSlug(ctx, view, [
    `${drawn.toLocaleString()} DRAWN OF ${reached.toLocaleString()} MEASURED`,
    `${w.corpus.games_parsed} GAMES · ${days} DAYS`,
    ...w.bias.disclosure,
  ], { x: 0, y: 330 }, a * 0.45);

  // The figures assemble as the flood fills, and settle.
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
  const a = fade(k) * remains;
  const curve = w.contest.approach_curve_ft.filter((v): v is number => v !== null);
  if (!curve.length) return;

  // HOW LONG THE APPROACH RUNS BEFORE THE BOXES ARE CUT.
  //
  // This used to be more than half the beat, and it was the piece's longest dead
  // interval: measured on the shipped frames, from its start until the cut began
  // the plate held ONE hairline and ONE numeral, for a stretch measured in tens
  // of seconds, against beats either side carrying the whole flood. The approach is
  // a real measurement and it should be watchable, but watching a line shorten
  // is not nineteen seconds of subject. The cut - a continuous quantity being
  // divided into four boxes - is what this beat is FOR, so it gets most of it.
  const RUN_ENDS = 0.22;
  const run = Math.min(1, Math.max(0, k) / RUN_ENDS);
  const idx = Math.min(curve.length - 1, Math.max(0, Math.floor(run * (curve.length - 1))));
  const dist = curve[idx]!;

  // A hairline out from the hoop along the centreline; its length is the mean
  // closest-defender distance at that instant before release.
  const y0 = 0;
  const y1 = dist * 10;
  ctx.save();
  ctx.strokeStyle = `rgba(${BONE_RGB}, ${a * INSTANT_LINE_ALPHA})`;
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
  const cut = Math.max(0, (k - RUN_ENDS) / (1 - RUN_ENDS));
  if (cut > 0) {
    const buckets: DefenderBucket[] = w.contest.buckets;
    // THE BOXES ARE DRAWN AS BOXES (audit V-06).
    //
    // The boundaries used to be ticks a foot and a half either side of the
    // centreline, with the category names crammed against them at the size of a
    // scatter label - so the one image this piece calls its whole argument read
    // as a small ladder near the hoop rather than as a continuous quantity being
    // divided. The VERTICAL axis is untouched and stays true to the floor: a
    // boundary is drawn at the distance it actually is, in court tenths. Only
    // the horizontal extent grows, and it carries no measurement at all - it is
    // how wide the band is, and a band has to be wide enough to be a band.
    ctx.save();
    ctx.strokeStyle = `rgba(${BONE_RGB}, ${a * cut * INSTANT_CUT_ALPHA})`;
    ctx.lineWidth = 1;
    buckets.forEach((b) => {
      if (b.hi_ft === null) return;
      const ty = b.hi_ft * 10;
      ctx.beginPath();
      ctx.moveTo(view.sx(-INSTANT_BAND_HALF_W), view.sy(ty));
      ctx.lineTo(view.sx(INSTANT_BAND_HALF_W), view.sy(ty));
      ctx.stroke();
    });
    ctx.restore();

    // EACH BOX CARRIES ITS OWN NAME AND ITS OWN SHARE, and this is the one beat
    // where the figures leave the annulus.
    //
    // They are ON the ring through the flood before this and back on it at the
    // close after it, because the ring is where they are orphaned in Acts IV-V.
    // Here they are not orphaned - here they are being MADE, and a share drawn
    // a third of the floor away from the band it belongs to is the reader's
    // problem to solve rather than the picture's to state. Drawing both was
    // tried first and the ring's figures land squarely on the band names.
    buckets.forEach((b) => {
      const lo = b.lo_ft * 10;
      const hi = b.hi_ft === null ? Math.max(y1, lo + 60) : b.hi_ft * 10;
      const mid = (lo + hi) / 2;
      // Clear of the centreline, which the measured hairline runs along.
      const inset = INSTANT_BAND_HALF_W * 0.55;
      const lab = label(b.name.toUpperCase(), Math.max(SLUG_MIN_PX, view.s(BUCKET_NAME_TENTHS)),
        f.dpr);
      ctx.save();
      ctx.globalAlpha = a * cut * BUCKET_LABEL_ALPHA;
      ctx.drawImage(lab.canvas, view.sx(-inset) - lab.width / 2, view.sy(mid) - lab.height / 2,
        lab.width, lab.height);
      ctx.restore();
      strikeFigure(ctx, view, struck(100 * b.share), "", inset, mid, a * cut * 0.7, 18);
    });

    // What the definition is worth, in the piece's own terms.
    const g = w.contest.gather_rule;
    if (g.changed_share !== null) {
      // `voice`: the piece's thesis, over the image of it - a continuous
      // quantity being cut into four boxes at an instant nobody will name.
      drawSlug(ctx, view, [
        "THE LEAGUE DOES NOT PUBLISH WHICH INSTANT IT MEANS",
        `READ AT THE GATHER INSTEAD, ${struck(100 * g.changed_share)}% CHANGE CATEGORY`,
        ...(w.bias.scope ? [w.bias.scope] : []),
      ], { x: 0, y: 330 }, a * cut * 0.5, "voice");
    }
  }
}

/**
 * THE CLOSE — the corpus's last archive. Everything goes but the figures.
 *
 * This slug used to read `date_last` above "THE PUBLIC FEED CLOSES", which
 * converted a corpus terminus into a proven shutdown date. It is not one. The
 * last archive anyone holds is dated `window.json:corpus.date_last`; the
 * earliest artifact showing the endpoint already dead is a GitHub issue dated
 * `facts.json:external.endpoint_known_dead_by`. The day it actually closed is
 * between the two and nobody outside recorded it.
 *
 * So the piece shows both dates and explains neither. The gap is the content.
 */
function beatClose(f: Frame, w: WindowFile, k: number, m: Measures | null): void {
  const { ctx, view, remains } = f;
  const remain = Math.max(0, 1 - k / 0.7);
  // This beat used to open at full strength while the one before it had just
  // faded to nothing, so the plate went from empty to three times the flood in
  // a single second - a hard arrival, where the piece's only cut is 2010-11. It
  // ramps in like every other beat now; it still does not fade OUT, because
  // what it hands over to is the end of the act.
  const a = remains * Math.min(1, k / 0.01);

  if (m && m.n && remain > 0) {
    const upto = Math.round(m.n * remain);
    const from = Math.max(0, upto - CALIPER_BUDGET);
    for (let i = from; i < upto; i++) {
      caliper(ctx, view, m.x[i]!, m.y[i]!, m.dx[i]!, m.dy[i]!,
        a * CLOSE_ALPHA * remain, CALIPER_SERIF_CLOSE);
    }
  }

  w.contest.buckets.forEach((b, i) => {
    const slot = figureSlot(i, w.contest.buckets.length);
    strikeFigure(ctx, view, struck(100 * b.share), b.name.toUpperCase(),
      slot.x, slot.y, a * 0.7, 20);
  });
  // What survives the close is a proportion of the recovered subset, and it
  // survives for the rest of the loop. It says so.
  if (w.bias.scope) drawSlug(ctx, view, [w.bias.scope], { x: 0, y: 250 }, a * 0.4);

  const closing = Math.max(0, (k - 0.55) / 0.45);
  if (closing > 0 && w.corpus.date_last) {
    const deadBy = factExternal<string>(f.data.facts, "endpoint_known_dead_by");
    drawSlug(ctx, view, [
      `${w.corpus.date_last} · THE LAST GAME THE RECORD HOLDS`,
      `${deadBy} · THE ENDPOINT WAS ALREADY DEAD`,
    ], { x: 0, y: 330 }, a * closing * 0.55);
  }
}

// --- the hand ----------------------------------------------------------------

export function drawMeasureHand(f: Frame): void {
  const { ctx, view, st, data, remains } = f;
  const w = data.window;

  if (st.act === 3 && w) {
    // The field recedes almost entirely: for the whole of the window's dilated
    // segment the caliper is the subject and the dots are only where it lands.
    drawSeasonField(f, { dim: remains * 0.3, reveal: true });
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
