/** THE STACK — the image taken apart, and put back one decision at a time.
 *
 * WHY THIS IS ALLOWED TO EXIST, because the same idea in a slightly different
 * shape is the thing this project is built against.
 *
 * A combined view that ran all six renderers together behind six checkboxes
 * was considered and REJECTED: "the renderers duplicate the same shot
 * geometry, compete for the same pixels, and would convert the gallery work into
 * a settings panel." That judgement stands and this view does not reopen it. The
 * difference is not the number of toggles, it is what the toggles NAME. A
 * control called FIELD names a renderer. A control called CLASSIFY THE FLOOR
 * names an act somebody performed on a list of coordinates — and each one here
 * declares the artifact it reads and the definition that artifact ships. What
 * the audience watches is not six decorative layers arriving; it is
 * interpretation being added to a record, which is what the league does and does
 * not show.
 *
 * THE VIEW OPENS ON BARE STONE. All eight operations ship OFF.
 * An earlier design had LOCATE, CLASSIFY and INSCRIBE already on, and that
 * default is rejected. It matters, and it is not fussiness — the argument
 * only reads if the starting point is the record with nothing done to it, so
 * that everything on the plate afterwards is there because somebody named it. A
 * default that already has three operations applied is a picture the audience is
 * asked to accept before the talk begins.
 *
 * THE RULES THIS FILE OBEYS — the stack's composition order:
 *
 *   1  ground and court engraving       drawn by `renderTo`, before any hand
 *   2  incised season numerals          INSCRIBE
 *   3  exactly ONE shot-material base   LOCATE
 *   4  optional NBA-zone tint on THAT   CLASSIFY (a modifier, never a 2nd field)
 *      base rather than a duplicate
 *   5  window trajectories              CONNECT
 *   6  sparse selected calipers         MEASURE
 *   7  sparse action labels             NAME
 *   8  census in an exterior gutter     COUNT
 *   9  the disclosures each applied     drawn last, over everything
 *      operation owes
 *
 * That order is fixed and total: it is the order of `OPERATIONS`, the order the
 * bits are assigned in, and the order of the calls below. There is no
 * configuration in which one layer overtakes another.
 *
 * HOW THE MUTUAL EXCLUSIONS ARE SATISFIED — by construction, not by a guard:
 *
 *   - "PLATE density, FIELD density and HAND splotches are material
 *     alternatives, not independent overlays." There is one base and it is
 *     `drawSeasonField`. CLASSIFY re-tints that same call; it does not draw a
 *     second field. THE HAND's drops are its own material ALTERNATIVE for the
 *     base and are therefore not offered at all — CONNECT draws only the window's
 *     trajectories, which is composition rule 5 and nothing else. So no operation
 *     duplicates the same shot geometry merely to change an attribute.
 *   - "NAME and full COUNT should not occupy the court simultaneously." COUNT
 *     never occupies the court in this view: it is a tally in the exterior
 *     gutter, which is rule 8, and rule 8 is what makes the exclusion hold in
 *     EVERY configuration including ALL RENDERINGS rather than in most of them.
 *     It also settles the other collision nobody had named — COUNT and INSCRIBE
 *     both strike text into the floor in their own hands, and here only one does.
 *   - "Dense trajectories and dense caliper weather should not both be the
 *     default." Neither is dense and neither is a default.
 *
 * PURITY. This hand holds no cache of its own — deliberately, and it is the
 * cheapest way to be right. Everything it composites is already cached by the
 * module that owns it (`field.ts`'s baked layers, the text atlas, THE LEDGER's
 * utterance memo, THE CENSUS's string ruler), all of which
 * `probe/shared.ts:cold()` already empties. If a later change adds one here it
 * must be registered there in the same commit: an unregistered cache does not
 * produce a false IMPURE, it produces a false PURE, because every history then
 * shares the same stale cache and they agree with each other.
 *
 * Every material scalar is declared in src/scalars.ts. This file is in
 * `check-numbers.mjs:MARK_LAYERS`, added before its first literal was written.
 */

import type { HeroShot } from "../data";
import { contextDisplay, ROOM_TEXT_MIN_PX } from "../display";
import { drawInscriptions, drawSlug } from "../inscription";
import { BONE_RGB, SLUG_FAMILY } from "../palette";
import { COURT } from "../plate";
import {
  QUARREL_ALPHA,
  STACK_CALIPER_ALPHA,
  STACK_DISCLOSURE_INSET,
  STACK_FIELD_DIM,
  STACK_GUTTER_PAD_TENTHS,
  STACK_GUTTER_ROW_ALPHA,
  STACK_GUTTER_SUB_ALPHA,
  STACK_GUTTER_TENTHS,
  STACK_INSCRIPTION_DIM,
  STACK_NAME_DIM,
  STACK_TICK_ALPHA,
  STACK_WINDOW_FIELD_DIM,
} from "../scalars";
import { WINDOW_YEAR } from "../timeline";
import { filing, strikeTicks } from "./census";
import { drawSeasonField } from "./fieldlayer";
import { drawActCue } from "./shared";
import { firstCanvasStrokes, paintStroke, type Regimes } from "./hand";
import { drawTerms, ledgerUtterances } from "./ledger";
import { caliper } from "./measure";
import {
  has,
  operationProgress,
  stackMask,
  type OpId,
  type StackOps,
} from "./operations";
import type { Frame } from "./types";

/**
 * Whether an operation that needs the optical feed can be applied at all here.
 *
 * Three of the eight can only be applied where that feed was public, and this is a
 * MEASURED availability rather than a rendering convenience: the corpus's span is
 * one season. Outside it they draw nothing, and the rail says why rather than
 * leaving a control that does nothing when pressed. An operation that cannot be
 * applied everywhere is this piece's argument turning up in its own controls.
 */
export function inWindow(f: Frame): boolean {
  return f.st.year === WINDOW_YEAR;
}

export function drawStackHand(f: Frame): void {
  const state = f.stack;
  const ops: StackOps = stackMask(state);
  const progress = (id: OpId): number => operationProgress(state, id);

  // 2. INSCRIBE THE SEASON — cut into the plate, so anything later settles over
  //    it. Held below its own hand's weight: here the numeral is one layer among
  //    seven rather than the thing the frame is about.
  const inscribe = progress("inscribe");
  if (inscribe > 0) {
    f.ctx.save();
    f.ctx.globalAlpha = f.remains * STACK_INSCRIPTION_DIM * inscribe;
    drawInscriptions(f.ctx, f.view, f.inscriptions, f.st.t);
    f.ctx.restore();
  }

  // 3 and 4. ONE shot-material base, tinted by the league's regions or not.
  //    `coloured` is the whole of CLASSIFY: the same marks in the same places
  //    with the same counts, given the hue of the region the NBA filed them in.
  const locate = progress("locate");
  const classify = progress("classify");
  if (locate > 0) {
    // THE BASE YIELDS UNDER THE TWO WINDOW OPERATIONS, and this is THE PLATE's
    // own rule rather than a new one: in Act III it dims the field because "the
    // rest of the league is still only dots, and the gestures have to be the
    // brightest thing the window holds". It is not a preference here, it is
    // arithmetic. A possession's paint and a caliper's hairline are thin by
    // measurement — ink is conserved against time, and one possession is one
    // possession — so over a field at full weight they are invisible, and an
    // operation a presenter has just NAMED that visibly does nothing is a broken
    // control. Verified against THE HAND at its own opening beat: the same
    // possession is exactly this faint there, so the answer was never to
    // brighten the paint past what the record deposits.
    const yielding = (progress("connect") > 0 || progress("measure") > 0
      || progress("join") > 0) && inWindow(f);
    const dim = f.remains * STACK_FIELD_DIM * locate
      * (yielding ? STACK_WINDOW_FIELD_DIM : 1);
    // CLASSIFY is a modifier of the one base. During its short response the
    // neutral and coloured cached surfaces crossfade; their weights sum to the
    // same field, so the operation never creates a second-density flash.
    if (classify < 1) drawSeasonField(f, { dim: dim * (1 - classify) });
    if (classify > 0) drawSeasonField(f, { coloured: true, dim: dim * classify });
  }
  // A selected dependency must still answer on the audience canvas. With no
  // located attempts there is honestly nothing to tint, so the visible result
  // is that dependency stated in the plate's disclosure register—not a false
  // coloured field and not a control that appears to do nothing.
  if (classify > 0 && locate <= 0) {
    drawSlug(
      f.ctx,
      f.view,
      ["CLASSIFICATION REQUIRES LOCATED ATTEMPTS"],
      { x: 0, y: COURT.y1 - STACK_DISCLOSURE_INSET * 2 },
      f.remains * classify,
      "aside",
    );
  }

  // 5. CONNECT THE BODY — the window's trajectories, and only those. THE HAND's
  //    drops are its material ALTERNATIVE for the base, so offering them here
  //    would be a second rendering of the same shots.
  const connect = progress("connect");
  if (connect > 0 && inWindow(f)) drawConnect(f, connect);

  // 6. MEASURE THE DEFENDER — sparse, and the selection is the pipeline's.
  const measure = progress("measure");
  if (measure > 0 && inWindow(f)) drawMeasure(f, measure);

  // 7. NAME THE ACTION — sparse action labels, over the court.
  const name = progress("name");
  if (name > 0) drawName(f, name);

  // 8. COUNT THE EVENT — a tick per category on the floor, the tally OUTSIDE it.
  const count = progress("count");
  if (count > 0) drawCount(f, count);

  // 8b. JOIN THE INSTRUMENTS — the archive's two words about where, shot by
  //     shot. Table order is layer order, so the eighth operation draws after
  //     the seventh and before the disclosures, like every bit before it.
  const join = progress("join");
  if (join > 0 && inWindow(f)) drawQuarrel(f, join);

  // 9. Last, over everything.
  drawDisclosures(f, ops);

  // The act boundaries named: the stack composites hands, none of whose
  // layers carry a boundary sign of their own here.
  drawActCue(f, 2);
  drawActCue(f, 5);
}

/**
 * CONNECT THE BODY — one corroborated possession, laid as the window runs.
 *
 * ONE canvas: every body the feed held plus the ball — `paint.json`'s
 * `bodies_per_canvas` says how many that is and this file does not — over the
 * span before one verified shot. THE HAND spends a whole pass accumulating the
 * painting across the window's own calendar and needs a block-prefix cache to
 * afford it; a composite does not want that image and could not carry it. What
 * this operation has to show is that a record which kept ONE POINT per shot was
 * made from a machine that held every position of every body, and one gesture
 * says that at a scale a viewer can follow.
 *
 * `drawn` is the window's own phase, so the paths are laid rather than appearing:
 * the bodies move while the season does.
 *
 * Wrapped in save/restore because `paintStroke` is not: it sets `fillStyle`,
 * `strokeStyle`, `lineWidth`, `lineCap` and `lineJoin` and restores none of
 * them. THE HAND does not notice because it wraps its whole body, and the fix
 * belongs here rather than there — changing a function six committed sweeps were
 * measured through, to suit a new caller, is how a hand gets moved by accident.
 */
function drawConnect(f: Frame, progress: number): void {
  const { ctx, view, data, remains } = f;
  const paint = data.paint;
  const strokes = data.strokes();
  if (!paint || !strokes) return;

  const r: Regimes = {
    v10: paint.speed_ft_s.p10,
    v50: paint.speed_ft_s.p50,
    v90: paint.speed_ft_s.p90,
  };
  const n = firstCanvasStrokes(strokes);
  ctx.save();
  // `source-over`, deliberately, and it is the one operation here that occludes.
  // A stroke crossing an earlier one must COVER it or the canvas is a glow
  // rather than a painting — THE HAND's rule, and the reason it is the only hand
  // that does not composite `lighter`.
  ctx.globalCompositeOperation = "source-over";
  // At `remains`, exactly as THE HAND composites the same strokes. There is no
  // dim knob here on purpose: the paint's weight is DRIP conserving ink against
  // time, and a composite that quietly brightened it would be drawing more ink
  // than the record deposited. What yields is the field underneath.
  ctx.globalAlpha = remains;
  for (let i = 0; i < n; i++) paintStroke(ctx, view, strokes, i, progress, r);
  ctx.restore();
}

/**
 * MEASURE THE DEFENDER — four calipers, one per published category.
 *
 * THE SELECTION IS NOT THIS FILE'S. `window.json:contest.heroes` is four shots
 * the pipeline chose, one per bucket, by tightest corroboration — its own rule,
 * disclosed in its own `definitions.hero`. Picking four calipers here by any
 * rule of mine would be authoring a sample and calling it evidence, and THE
 * MEASURE's flood (`CALIPER_BUDGET` in that hand) is neither sparse nor
 * composable — it is weather over a floor it owns.
 *
 * The caliper is drawn at the RELEASE, which is the last frame of the hero's
 * track: the statistic is defined at the instant the ball leaves the hand, and a
 * composite that showed the whole approach would be drawing THE MEASURE's beat
 * rather than its material.
 *
 * The recovered-set disclosure travels with it, always. These four come out of
 * the recovered set, and a proportion from that set shown without its scope
 * misstates the population it was measured over.
 */
function drawMeasure(f: Frame, progress: number): void {
  const { ctx, view, data, remains } = f;
  const w = data.window;
  if (!w) return;
  const a = remains * STACK_CALIPER_ALPHA * progress;
  for (const h of w.contest.heroes as HeroShot[]) {
    const frames = h.track.filter((p): p is number[] => p !== null);
    const p = frames[frames.length - 1];
    if (!p) continue;
    caliper(ctx, view, p[0]!, p[1]!, p[2]!, p[3]!, a);
    // The league's own name for the category this distance was cut into, at the
    // caliper's midpoint. `aside`: it annotates the mark above it.
    drawSlug(ctx, view, [h.bucket_name.toUpperCase()],
      { x: (p[0]! + p[2]!) / 2, y: (p[1]! + p[3]!) / 2 }, remains * progress, "aside",
      -view.s(STACK_GUTTER_TENTHS));
  }
}

/**
 * NAME THE ACTION — what the record called the shots, as often as it varies.
 *
 * THE LEDGER's spoken register, through `ledgerUtterances`, so both hands speak
 * the same words in the same places from one derivation. How often a season
 * speaks is `vocabulary.words_covering_90pct`: the measured driver, not a rate
 * chosen here. `drawTerms` brings its own scatter-free register — the dimmed
 * label field THE LEDGER draws underneath is that hand's own second register and
 * is NOT composited, because it materialises the same shots the base already
 * has, which is the rule this whole view is built on.
 */
function drawName(f: Frame, progress: number): void {
  const year = f.st.year;
  if (year === null) return;
  const u = ledgerUtterances(f, year);
  // NAME is a response, not a second season clock. Resolve the same measured
  // register THE LEDGER uses to one deterministic final utterance and hold it;
  // only its short operation-local reveal changes after the key press.
  if (u) drawTerms(f, u.terms, u.heldElapsed, u.interval, STACK_NAME_DIM * progress);
}

/**
 * COUNT THE EVENT — a tick on the floor, the tally in the margin.
 *
 * THIS IS WHERE TWO OF THE COMPOSITION RULES MEET, and the resolution is the same
 * one for both. "Census in an exterior gutter" (composition rule 8) and "NAME
 * and full COUNT should not occupy the court simultaneously" (a mutual
 * exclusion) are satisfied by the same decision: the NAMES and the numbers go
 * outside the plate, and what stays on the floor is a tick per category at the
 * record's own measured place for it.
 *
 * That is not a compromise, it is the better half of THE CENSUS. The tick count
 * IS the taxonomy's size, so the constellation on the floor breeds across the
 * corpus while five of the six taxonomies never change their count — the second
 * curve, seen rather than read — and a tick is a mark, so it cannot collide
 * typographically with INSCRIBE's numerals the way a struck category name would.
 * THE CENSUS still strikes the words into the floor in its own hand, where it
 * owns the frame and nothing else is competing for it.
 *
 * The taxonomy is the season's own `active_taxonomy`, always. THE CENSUS files
 * all six in sequence inside the window; a presenter here is holding one
 * operation still while they talk about it, and a filing that changed underneath
 * them six times in one season would be the view arguing with its own controls.
 */
function drawCount(f: Frame, progress: number): void {
  const { ctx, view, st, data, remains } = f;
  const season = data.byYear.get(st.year!);
  if (!season) return;
  const columns = Object.keys(data.taxonomyColumns);
  const taxonomy = season.active_taxonomy ?? columns[0]!;
  const zoneNames = data.samples.get(st.year!)?.zone_names ?? [];
  // COUNT is a static response in THE STACK: derive the completed filing once
  // and reveal that result, rather than replaying THE CENSUS's season clock.
  const words = filing(season, taxonomy, 1, zoneNames,
    season.vocabulary.covering_90pct?.[taxonomy] ?? 1);
  // No `layOut`: nothing is struck on the floor, so nothing needs a bearing
  // moved to make room, and the tick sits at the record's own place by
  // construction rather than by `strikeTicks` undoing a nudge.
  strikeTicks(f, words, remains * STACK_TICK_ALPHA * progress);

  // The margin. The plate hangs rather than fills, so the halfcourt leaves a
  // real gutter either side of it at every window size — the tally is set flush
  // against the plate's edge and grows away from it, so it never crosses the
  // court however narrow the window gets.
  const right = view.sx(COURT.x0) - view.s(STACK_GUTTER_PAD_TENTHS);
  const named = words.filter((x) => x.named);
  const rows = named.map((c) => `${c.name.toLowerCase()}   ${c.n.toLocaleString()}`);
  ctx.save();

  // THE COLUMN FITS THE GUTTER IT ACTUALLY HAS, and the type size is derived
  // rather than fixed. `STACK_GUTTER_TENTHS` is the size the tally takes when
  // there is room; how much room there IS depends on the rail, which takes a
  // fixed slice of the window and leaves the plate a narrower canvas to be
  // centred in. At a lectern width the widest row of the DESCRIPTION taxonomy —
  // the record's longest phrases, which are the whole of the second curve — ran
  // off the left edge and was clipped mid-word.
  //
  // Near mode keeps the full fitted tally. In room mode the same narrow gutter
  // cannot honestly carry the DESCRIPTION taxonomy's longest rows at a 13px
  // floor. The floor was previously paired with `fillText(..., maxWidth)`,
  // which retained nominal height by crushing glyphs to roughly one third of
  // their natural width. At distance that is worse than omission. The audience
  // therefore receives a legible filing summary here while every category's
  // magnitude remains visible in the court's ticks; the near profile retains
  // the complete row-by-row tally.
  ctx.font = `${view.s(STACK_GUTTER_TENTHS)}px ${SLUG_FAMILY}`;
  const widest = rows.reduce((m, r) => Math.max(m, ctx.measureText(r).width), 1);
  const gutterWidth = Math.max(1, right - view.s(STACK_GUTTER_PAD_TENTHS));
  const room = contextDisplay(ctx) === "room";
  const fitted = view.s(STACK_GUTTER_TENTHS) * Math.min(1, gutterWidth / widest);
  const px = room ? Math.max(ROOM_TEXT_MIN_PX.aside, fitted) : fitted;
  if (px < 1) {
    ctx.restore();
    return;
  }
  ctx.font = `${px}px ${SLUG_FAMILY}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  const fillRow = (text: string, x: number, at: number): void => {
    ctx.fillText(text, x, at);
  };
  let y = view.sy(COURT.y1);
  ctx.fillStyle = `rgba(${BONE_RGB}, ${remains * STACK_GUTTER_SUB_ALPHA * progress})`;
  // Which of the record's own columns this filing IS. The record supplies the
  // name of its own field; this hand does not name it.
  fillRow(room ? taxonomy : data.taxonomyColumns[taxonomy] ?? taxonomy, right, y);
  y += px * 2.2;
  ctx.fillStyle = `rgba(${BONE_RGB}, ${remains * STACK_GUTTER_ROW_ALPHA * progress})`;
  // The tail is a count, never a cloud — THE CENSUS's rule, kept.
  const rest = Object.keys(season.classification[taxonomy] ?? {}).length - named.length;
  const shownRows = room
    ? [`${named.length} NAMED`, ...(rest > 0 ? [`${rest} MORE`] : []), "TICK=COUNT"]
    : rows;
  for (const row of shownRows) {
    fillRow(row, right, y);
    y += px * 1.5;
  }
  if (!room && rest > 0) {
    ctx.fillStyle = `rgba(${BONE_RGB}, ${remains * STACK_GUTTER_SUB_ALPHA * progress})`;
    fillRow(`${rest} more · a tick and a count`, right, y + px * 0.6);
  }
  ctx.restore();
}

/**
 * JOIN THE INSTRUMENTS — the archive's two words about where, shot by shot.
 *
 * The record holds two NBA claims about the same shot in the same building on
 * the same night: the coordinate a courtside scorer filed, and where the
 * optical feed says the ball left the hand. The mark is the segment between
 * them — SERIFLESS, because it is not a measurement between bodies, it is a
 * distance between claims, and the caliper's serifs stay on the caliper. No
 * figure per segment, no histogram, no legend: the disclosure is one pipeline-templated statement
 * line (drawDisclosures), and the confession beside the flood carries the true
 * counts the way THE MEASURE's flood confesses its own budget.
 *
 * THE FLOOD DISCIPLINE. Tens of thousands of segments cannot strike at once,
 * so the flood keeps a leading edge: records enter in the order quarrel.bin is
 * packed in — chronological, window.py's own sort, the same day order THE
 * MEASURE's flood walks window_measures.bin in — and at most QUARREL_BUDGET
 * are on the plate at once. The caller supplies the entry progress: THE STACK
 * uses its operation-local clock, while THE PLATE's quarrel candidate
 * defaults to the Window phase. Either way it is a pure render input: no held state accumulates
 * and a backward seek rebuilds a smaller flood. No cache, deliberately — the
 * flood is at most QUARREL_BUDGET lineTo calls
 * from arrays data.ts already decoded, which is cheaper than any surface that
 * would need registering in probe/shared.ts:cold().
 */
const QUARREL_BUDGET = 400;

/** Exported for one caller besides this hand: THE PLATE's quarrel-candidate
 *  composite (`plate.ts`), which only the shots probe can request — the
 *  gallery question of where the quarrel lives is a composition decision
 *  judged from captures, and nothing in the gallery path reaches it. */
export function drawQuarrel(f: Frame, progress = f.st.phase): void {
  const { ctx, view, data, remains } = f;
  const w = data.window;
  const q = data.quarrel();
  if (!w || !q || !q.n) return;
  const entered = Math.max(1, Math.min(q.n, Math.round(progress * q.n)));
  const from = Math.max(0, entered - QUARREL_BUDGET);
  const a = remains * QUARREL_ALPHA;
  if (a <= 0.01) return;
  ctx.save();
  ctx.strokeStyle = `rgba(${BONE_RGB}, ${a})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = from; i < entered; i++) {
    ctx.moveTo(view.sx(q.fx[i]!), view.sy(q.fy[i]!));
    ctx.lineTo(view.sx(q.bx[i]!), view.sy(q.by[i]!));
  }
  ctx.stroke();
  ctx.restore();

  // The true scale, confessed beside the flood — THE MEASURE's idiom: the
  // drawn-against-entered fraction so the sample never implies it is
  // everything, and the population's own count beside it. Every numeral is a
  // count from the artifact or from this frame's arithmetic; none is typed.
  const drawn = entered - from;
  drawSlug(ctx, view, [
    `${drawn.toLocaleString()} DRAWN OF ${entered.toLocaleString()} ENTERED`
    + ` · ${q.n.toLocaleString()} DETECTED`,
  ], { x: 0, y: 330 }, a, "aside");
}

/**
 * What an applied operation owes the viewer, on the plate.
 *
 * Provenance is drawn in the rail (decision, 2026-08-09); see navigator.ts.
 * This is not that.
 * A disclosure is a claim the drawn material would be false without: whose
 * categories a colour exposes, and what population a percentage was measured
 * over. THE FIELD strikes the first and THE MEASURE the second in their own
 * hands, so a composite that dropped them would be quieter about its own
 * material than the hands it composites — the wrong direction for a view whose
 * subject is what a rendering does not tell you.
 */
function drawDisclosures(f: Frame, ops: StackOps): void {
  const { ctx, view, remains } = f;
  const lines: string[] = [];
  // Rule 4: colour exposes a classification the league imposed, it never adds
  // one, and the plate says so wherever it is used. Same sentence THE FIELD
  // strikes, because it is the same claim about the same hues.
  if (has(ops, "locate") && has(ops, "classify")) {
    lines.push("COLOURED BY THE NBA'S OWN ZONES");
  }
  // The recovered-set scope travels with the calipers wherever they are drawn.
  // The four heroes come out of the recovered set — a biased subset,
  // over-representing shots that reach the rim, because a release is only found by following the
  // ball back from it. The string is TEMPLATED BY THE PIPELINE from the figures
  // it quotes (`window.json:bias.scope`); the site draws it and never composes
  // its own, so a re-run updates the wall text.
  const scope = has(ops, "measure") && inWindow(f) ? f.data.window?.bias.scope : null;
  if (scope) lines.push(scope);
  // The quarrel's scope, in the bias sentence's idiom: TEMPLATED BY THE
  // PIPELINE from the figures it quotes (`window.json:quarrel_bin.scope`), so
  // the drawn material's population and its measured centre travel with it and
  // a re-run updates the wall text. The site never composes its own.
  const qScope = has(ops, "join") && inWindow(f) ? f.data.window?.quarrel_bin.scope : null;
  if (qScope) lines.push(qScope);
  if (!lines.length) return;
  // Rank `aside` (drawSlug's rank argument): subordinate to the marks it describes.
  drawSlug(ctx, view, lines, { x: 0, y: COURT.y1 - STACK_DISCLOSURE_INSET },
    remains, "aside");
}
