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
  type HeroShot,
  type Measures,
  type WindowFile,
} from "../data";
import { contextDisplay, ROOM_TEXT_MIN_PX } from "../display";
import { drawSlug } from "../inscription";
import { BONE_RGB, INSCRIPTION_FAMILY } from "../palette";
import type { View } from "../plate";
import {
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
  NAMES_ONLY_ALPHA,
} from "../scalars";
import { label } from "../textatlas";
import {
  MEASURE_CLOSE_TERMINAL_FROM,
  MEASURE_CLOSE_TERMINAL_TO,
  MEASURE_WINDOW_TERMINAL_SPAN,
  WINDOW_BEATS,
  WINDOW_SEASON_CREST,
} from "../window-score";
import { drawSeasonField } from "./fieldlayer";
import { arrivedThrough, cumulativeByDay, drawActCue, seasonClock } from "./shared";
import type { Frame } from "./types";

/** The four beats of Act III. Defined in timeline.ts, because the rail lists
 *  them too and both must agree on where each begins. */
const BEAT = Object.fromEntries(
  WINDOW_BEATS.map((b) => [b.id, [b.from, b.to] as const]),
) as Record<(typeof WINDOW_BEATS)[number]["id"], readonly [number, number]>;

/** Compatibility export; the terminal-date score is centralized. */
export { MEASURE_WINDOW_TERMINAL_SPAN };

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
  ctx.save();
  caliperInBatch(ctx, view, sx, sy, dx, dy, alpha, serif);
  ctx.restore();
}

/** The same exact stroke, for a caller that owns one save/restore around a
 * flood. Per-record save/restore was pure state churn: no caliper changes the
 * transform, clip, composite mode or line cap, and every mutable value it does
 * use is assigned below before drawing. */
function caliperInBatch(
  ctx: CanvasRenderingContext2D,
  view: View,
  sx: number,
  sy: number,
  dx: number,
  dy: number,
  alpha: number,
  serif: number,
): void {
  if (alpha <= 0.01) return;
  const x0 = view.sx(sx);
  const y0 = view.sy(sy);
  const x1 = view.sx(dx);
  const y1 = view.sy(dy);
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const nx = -Math.sin(ang) * serif;
  const ny = Math.cos(ang) * serif;

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
  const room = contextDisplay(ctx) === "room";
  const px = Math.max(room ? 16 : 11, size * (view.scale / 2));
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${px}px ${INSCRIPTION_FAMILY}`;
  ctx.fillStyle = `rgba(${BONE_RGB}, ${alpha})`;
  ctx.fillText(text, view.sx(x), view.sy(y));
  if (sub) {
    const sp = Math.max(room ? 13 : 7, px * 0.32);
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
  const room = contextDisplay(ctx) === "room";
  drawSeasonField(f, { dim: remains * 0.55, reveal: true });

  const names = w ? w.contest.buckets.map((b) => b.name) : [];
  const shown = Math.ceil(st.phase * names.length * 1.5);
  names.forEach((name, i) => {
    if (i >= shown) return;
    const slot = figureSlot(i, names.length);
    const lab = label(
      name.toUpperCase(),
      Math.max(
        8,
        9.5 * (view.scale / 2),
        room ? ROOM_TEXT_MIN_PX.statement : 0,
      ),
      f.dpr,
    );
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

/** ONE — a single shot, its caliper closing in real geometry. SINGULAR because
 *  Act III is scored as a crescendo (decided 2026-08-10): the beat is one
 *  measure made watchable, and the crowd it used to share the beat with (one
 *  hero per category) belongs to the flood now. The first hero is the
 *  mechanical choice — provisional, and one line to change. */
function beatOne(f: Frame, w: WindowFile, k: number): void {
  const { ctx, view, remains } = f;
  const h: HeroShot | undefined = w.contest.heroes[0];
  if (!h) return;

  const a = fade(k) * remains;
  // The closing takes most of the beat; the finished measure holds the rest,
  // so the one number the beat makes is on the plate long enough to be read.
  const t = Math.min(1, k / 0.62);
  const frames = h.track.filter((p): p is number[] => p !== null);
  if (!frames.length) return;
  const idx = Math.min(frames.length - 1, Math.floor(t * (frames.length - 1)));
  const p = frames[idx]!;

  // The path the defender has already covered, so the closing is legible.
  ctx.save();
  ctx.strokeStyle = `rgba(${BONE_RGB}, ${a * HERO_PATH_ALPHA})`;
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

  ring(ctx, view, p[2]!, p[3]!, a * HERO_RING_ALPHA);
  caliper(ctx, view, p[0]!, p[1]!, p[2]!, p[3]!, a * HERO_ALPHA);

  // The number changing as the defender closes — struck along the caliper's
  // PERPENDICULAR, pushed out just far enough that it can never cross the
  // defender's ring (otherwise the terminal state of a Very Tight measure holds
  // the numeral through the ring's stroke for a third of the beat).
  // For a long caliper the offsets reduce to the composition's own 14 and 22.
  const dist = Math.hypot(p[2]! - p[0]!, p[3]! - p[1]!) / 10;
  const mx = (p[0]! + p[2]!) / 2;
  const my = (p[1]! + p[3]!) / 2;
  const clen = Math.hypot(p[2]! - p[0]!, p[3]! - p[1]!);
  let ux = 0;
  let uy = 1;
  if (clen > 0) {
    ux = -(p[3]! - p[1]!) / clen;
    uy = (p[2]! - p[0]!) / clen;
    if (uy < 0) {
      ux = -ux;
      uy = -uy;
    }
  }
  const half = clen / 2;
  const ringClear = DEFENDER_RING_R + 6;
  const clear = Math.sqrt(Math.max(0, ringClear * ringClear - half * half));
  const off = Math.max(14, clear);
  strikeFigure(ctx, view, struck(dist), "", mx + ux * off, my + uy * off, a * 0.75, 15);

  if (t >= 1) {
    const offName = Math.max(22, clear);
    strikeFigure(ctx, view, "", h.bucket_name.toUpperCase(),
      mx - ux * offName, my - uy * offName, a * 0.6, 15);
  }

  // `voice`: what a caliper IS, said once, over the one shot that shows it.
  drawSlug(ctx, view, ["ONE SHOT · THE DISTANCE AT THE MOMENT THE BALL LEAVES THE HAND"],
    { x: 0, y: 330 }, a * 0.45, "voice");
}

/** THE NIGHT — the slate date's measures, layering. The same manufacture the
 *  opening beat showed once, made every few seconds somewhere in the league
 *  for one real evening. The day bound comes from the slate artifact's own
 *  key, never typed here. */
function beatNight(f: Frame, w: WindowFile, k: number, m: Measures | null): void {
  const { ctx, view, remains } = f;
  const sf = f.data.slateFile;
  if (!m || !m.n || !sf) return;
  const a = fade(k) * remains;

  const span = m.day[m.n - 1]!;
  const cum = cumulativeByDay(m, m.day, m.n, (d) => d, span);
  const from = sf.day > 0 ? cum[Math.min(span, sf.day - 1)]! : 0;
  const to = cum[Math.min(span, sf.day)]!;
  const upto = from + Math.round((to - from) * Math.min(1, k * 1.1));

  const lo = Math.max(from, upto - CALIPER_BUDGET);
  ctx.save();
  for (let i = lo; i < upto; i++) {
    const age = (upto - i) / Math.max(1, upto - lo);
    const fresh = (1 - age) * (1 - age);
    const alpha = a * (FLOOD_ALPHA_BASE + FLOOD_ALPHA_FRESH * fresh);
    caliperInBatch(ctx, view, m.x[i]!, m.y[i]!, m.dx[i]!, m.dy[i]!,
      alpha, CALIPER_SERIF_FLOOD);
  }
  ctx.restore();

  // The night's own date, from the record's day byte — the same stamp the
  // season beat sweeps.
  const day0 = w.measures_bin.day0;
  if (day0 && upto > from) {
    const d = new Date(`${day0}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + (m.day[Math.min(upto, m.n) - 1] ?? 0));
    drawSlug(ctx, view, [d.toISOString().slice(0, 10)], { x: 0, y: 360 }, a * 0.5);
  }

  // The count confesses the night's own scale; both figures are the
  // artifact's, composed at runtime like the season beat's counter.
  const drawn = Math.min(CALIPER_BUDGET, upto - from);
  drawSlug(ctx, view, [
    `${drawn.toLocaleString()} DRAWN OF ${(upto - from).toLocaleString()} MEASURED THAT NIGHT`,
    `${sf.span.archives} GAMES · ONE EVENING`,
  ], { x: 0, y: 330 }, a * 0.45);
}

/** THE SEASON — every measure the corpus holds, accelerating into the flood.
 *
 *  The volume beat — this hand is about how much raw data the league gathers
 *  (see THE INSTANT, below, for what was cut to keep it so): the whole recovered
 *  set arrives on its REAL calendar, compressed through the register's one
 *  authored easing (`seasonClock`), so the beat opens near the night's own
 *  pace and closes with weeks passing in a second — the machine's scale
 *  performed rather than stated. The four dead days stay dead at speed. */
function beatSeason(f: Frame, w: WindowFile, k: number, m: Measures | null): void {
  const { ctx, view, remains } = f;
  const a = fade(k) * remains;

  let reached = 0;
  if (m && m.n) {
    const span = m.day[m.n - 1]!;
    const cum = cumulativeByDay(m, m.day, m.n, (d) => d, span);
    const upto = arrivedThrough(cum, seasonClock(k) * (span + 1));
    reached = upto;
    const from = Math.max(0, upto - CALIPER_BUDGET);
    ctx.save();
    for (let i = from; i < upto; i++) {
      // Sharply weighted to the newest, so the eye follows the writing edge
      // instead of swimming in the accumulated tangle behind it.
      const age = (upto - i) / Math.max(1, upto - from);
      const fresh = (1 - age) * (1 - age);
      const alpha = a * (FLOOD_ALPHA_BASE + FLOOD_ALPHA_FRESH * fresh);
      caliperInBatch(ctx, view, m.x[i]!, m.y[i]!, m.dx[i]!, m.dy[i]!,
        alpha, CALIPER_SERIF_FLOOD);
    }
    ctx.restore();

    // The date the leading edge has reached — the corpus traversed as its own
    // calendar, now at the crescendo's pace.
    const day0 = w.measures_bin.day0;
    if (day0 && upto > 0) {
      const d = new Date(`${day0}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + (m.day[upto - 1] ?? 0));
      drawSlug(ctx, view, [d.toISOString().slice(0, 10)], { x: 0, y: 360 }, a * 0.5);
    }
  }

  const drawn = Math.min(CALIPER_BUDGET, reached);
  // The span is the corpus's own, and the second line no longer implies the
  // recovered set stands for the season: it says what the set IS. Both strings
  // are templated by the pipeline from the figures they quote.
  const days = factNum(f.data.facts, "window.days_inclusive");
  drawSlug(ctx, view, [
    `${drawn.toLocaleString()} DRAWN OF ${reached.toLocaleString()} MEASURED`,
    `${w.corpus.games_parsed} GAMES · ${days} DAYS`,
    ...w.bias.disclosure,
  ], { x: 0, y: 330 }, a * 0.45);

  // The figures assemble at the crest, where the calendar is at its fastest —
  // the published statistic condensing out of the flood.
  const settle = Math.max(0, Math.min(1,
    (k - WINDOW_SEASON_CREST) / (1 - WINDOW_SEASON_CREST)));
  if (settle > 0) {
    w.contest.buckets.forEach((b, i) => {
      const slot = figureSlot(i, w.contest.buckets.length);
      strikeFigure(ctx, view, struck(100 * b.share), b.name.toUpperCase(),
        slot.x, slot.y, a * settle * 0.75, 20);
    });
  }
}

// THE INSTANT is not drawn (decided 2026-08-10). When Act III became a
// crescendo, the approach-hairline band-cut drawing and `THE LEAGUE DOES NOT
// PUBLISH WHICH INSTANT IT MEANS` were cut — the reasoning is volume, not
// doubt: this hand shows how much raw data the league gathers, not a nuanced
// claim about what defines a contest. The gather-vs-release finding is not
// lost: it survives as spoken narration in the talk, with its keyed figures
// intact, and the `gather_rule` and `approach_curve_ft` keys stay shipped in
// window.json, undrawn, like the rest of the unshown inventory.

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
    ctx.save();
    for (let i = from; i < upto; i++) {
      caliperInBatch(ctx, view, m.x[i]!, m.y[i]!, m.dx[i]!, m.dy[i]!,
        a * CLOSE_ALPHA * remain, CALIPER_SERIF_CLOSE);
    }
    ctx.restore();
  }

  w.contest.buckets.forEach((b, i) => {
    const slot = figureSlot(i, w.contest.buckets.length);
    strikeFigure(ctx, view, struck(100 * b.share), b.name.toUpperCase(),
      slot.x, slot.y, a * 0.7, 20);
  });
  // What survives the close is a proportion of the recovered subset, and it
  // survives for the rest of the loop. It says so.
  if (w.bias.scope) drawSlug(ctx, view, [w.bias.scope], { x: 0, y: 250 }, a * 0.4);

  const closing = Math.max(0, Math.min(1,
    (k - MEASURE_CLOSE_TERMINAL_FROM)
      / (MEASURE_CLOSE_TERMINAL_TO - MEASURE_CLOSE_TERMINAL_FROM)));
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
    else if (p < BEAT.night[1]) beatNight(f, w, win(p, BEAT.night), m);
    else if (p < BEAT.season[1]) beatSeason(f, w, win(p, BEAT.season), m);
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

  // The Act V boundary named. Act II is omitted: the league's bucket
  // names arriving on the annulus IS this hand's Act II event (drawNamesOnly).
  drawActCue(f, 5);
}
