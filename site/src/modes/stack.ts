/** THE STACK — the image taken apart, and put back one decision at a time.
 *
 * WHY THIS IS ALLOWED TO EXIST, because the same idea in a slightly different
 * shape is the thing this project is built against.
 *
 * The audit considered a combined view that ran all six renderers together
 * behind six checkboxes and REJECTED it: "the renderers duplicate the same shot
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
 * THE VIEW OPENS ON BARE STONE. Artist's ruling, 2026-08-09: all seven ship OFF.
 * The audit had proposed LOCATE, CLASSIFY and INSCRIBE already on and that
 * proposal is superseded. It matters, and it is not fussiness — the argument
 * only reads if the starting point is the record with nothing done to it, so
 * that everything on the plate afterwards is there because somebody named it. A
 * default that already has three operations applied is a picture the audience is
 * asked to accept before the talk begins.
 *
 * THE RULES THIS FILE OBEYS, all from the audit's composition section, in order:
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
 * `probe/shared.ts:cold()` already empties. If a later session adds one here it
 * must be registered there in the same commit: an unregistered cache does not
 * produce a false IMPURE, it produces a false PURE, because every history then
 * shares the same stale cache and they agree with each other.
 *
 * Every material scalar is declared in src/scalars.ts. This file is in
 * `check-numbers.mjs:MARK_LAYERS`, added before its first literal was written.
 */

import type { HeroShot } from "../data";
import { drawInscriptions, drawSlug } from "../inscription";
import { BONE_RGB, SLUG_FAMILY } from "../palette";
import { COURT } from "../plate";
import {
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
import { firstCanvasStrokes, paintStroke, type Regimes } from "./hand";
import { drawTerms, ledgerUtterances } from "./ledger";
import { caliper } from "./measure";
import { has, type StackOps } from "./operations";
import type { Frame } from "./types";

/**
 * Whether an operation that needs the optical feed can be applied at all here.
 *
 * Two of the seven can only be applied where that feed was public, and this is a
 * MEASURED availability rather than a rendering convenience: the corpus's span is
 * one season. Outside it they draw nothing, and the rail says why rather than
 * leaving a control that does nothing when pressed. An operation that cannot be
 * applied everywhere is this piece's argument turning up in its own controls.
 */
export function inWindow(f: Frame): boolean {
  return f.st.year === WINDOW_YEAR;
}

export function drawStackHand(f: Frame): void {
  const ops: StackOps = f.stack;

  // 2. INSCRIBE THE SEASON — cut into the plate, so anything later settles over
  //    it. Held below its own hand's weight: here the numeral is one layer among
  //    seven rather than the thing the frame is about.
  if (has(ops, "inscribe")) {
    f.ctx.save();
    f.ctx.globalAlpha = f.remains * STACK_INSCRIPTION_DIM;
    drawInscriptions(f.ctx, f.view, f.inscriptions, f.st.t);
    f.ctx.restore();
  }

  // 3 and 4. ONE shot-material base, tinted by the league's regions or not.
  //    `coloured` is the whole of CLASSIFY: the same marks in the same places
  //    with the same counts, given the hue of the region the NBA filed them in.
  if (has(ops, "locate")) {
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
    const yielding = (has(ops, "connect") || has(ops, "measure")) && inWindow(f);
    drawSeasonField(f, {
      coloured: has(ops, "classify"),
      dim: f.remains * STACK_FIELD_DIM * (yielding ? STACK_WINDOW_FIELD_DIM : 1),
    });
  }

  // 5. CONNECT THE BODY — the window's trajectories, and only those. THE HAND's
  //    drops are its material ALTERNATIVE for the base, so offering them here
  //    would be a second rendering of the same shots.
  if (has(ops, "connect") && inWindow(f)) drawConnect(f);

  // 6. MEASURE THE DEFENDER — sparse, and the selection is the pipeline's.
  if (has(ops, "measure") && inWindow(f)) drawMeasure(f);

  // 7. NAME THE ACTION — sparse action labels, over the court.
  if (has(ops, "name")) drawName(f);

  // 8. COUNT THE EVENT — a tick per category on the floor, the tally OUTSIDE it.
  if (has(ops, "count")) drawCount(f);

  // 9. Last, over everything.
  drawDisclosures(f, ops);
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
function drawConnect(f: Frame): void {
  const { ctx, view, st, data, remains } = f;
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
  for (let i = 0; i < n; i++) paintStroke(ctx, view, strokes, i, st.phase, r);
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
 * F-12's disclosure travels with it, always. These four come out of the
 * recovered set, and a proportion from that set shown without its scope is the
 * defect session 3 closed.
 */
function drawMeasure(f: Frame): void {
  const { ctx, view, data, remains } = f;
  const w = data.window;
  if (!w) return;
  const a = remains * STACK_CALIPER_ALPHA;
  for (const h of w.contest.heroes as HeroShot[]) {
    const frames = h.track.filter((p): p is number[] => p !== null);
    const p = frames[frames.length - 1];
    if (!p) continue;
    caliper(ctx, view, p[0]!, p[1]!, p[2]!, p[3]!, a);
    // The league's own name for the category this distance was cut into, at the
    // caliper's midpoint. `aside`: it annotates the mark above it.
    drawSlug(ctx, view, [h.bucket_name.toUpperCase()],
      { x: (p[0]! + p[2]!) / 2, y: (p[1]! + p[3]!) / 2 }, remains, "aside",
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
function drawName(f: Frame): void {
  const year = f.st.year;
  if (year === null) return;
  const u = ledgerUtterances(f, year);
  if (u) drawTerms(f, u.terms, u.elapsed, u.interval, STACK_NAME_DIM);
}

/**
 * COUNT THE EVENT — a tick on the floor, the tally in the margin.
 *
 * THIS IS WHERE TWO OF THE AUDIT'S RULES MEET, and the resolution is the same
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
function drawCount(f: Frame): void {
  const { ctx, view, st, data, remains } = f;
  const season = data.byYear.get(st.year!);
  if (!season) return;
  const columns = Object.keys(data.taxonomyColumns);
  const taxonomy = season.active_taxonomy ?? columns[0]!;
  const zoneNames = data.samples.get(st.year!)?.zone_names ?? [];
  const words = filing(season, taxonomy, st.arrived, zoneNames,
    season.vocabulary.covering_90pct?.[taxonomy] ?? 1);
  // No `layOut`: nothing is struck on the floor, so nothing needs a bearing
  // moved to make room, and the tick sits at the record's own place by
  // construction rather than by `strikeTicks` undoing a nudge.
  strikeTicks(f, words, remains * STACK_TICK_ALPHA);

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
  // Shrinking is the only honest lever. Truncating would cut the record's own
  // words, which is the one thing this operation exists to show; wrapping would
  // turn a tally into a paragraph; and moving the column right would put COUNT
  // on the court, which is precisely what rule 8 and the NAME/COUNT exclusion
  // forbid. So the whole column scales down together and stays outside the
  // floor at every window size.
  ctx.font = `${view.s(STACK_GUTTER_TENTHS)}px ${SLUG_FAMILY}`;
  const widest = rows.reduce((m, r) => Math.max(m, ctx.measureText(r).width), 1);
  const px = view.s(STACK_GUTTER_TENTHS) * Math.min(1, (right - view.s(STACK_GUTTER_PAD_TENTHS)) / widest);
  if (px < 1) {
    ctx.restore();
    return;
  }
  ctx.font = `${px}px ${SLUG_FAMILY}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  let y = view.sy(COURT.y1);
  ctx.fillStyle = `rgba(${BONE_RGB}, ${remains * STACK_GUTTER_SUB_ALPHA})`;
  // Which of the record's own columns this filing IS. The record supplies the
  // name of its own field; this hand does not name it.
  ctx.fillText(data.taxonomyColumns[taxonomy] ?? taxonomy, right, y);
  y += px * 2.2;
  ctx.fillStyle = `rgba(${BONE_RGB}, ${remains * STACK_GUTTER_ROW_ALPHA})`;
  for (const row of rows) {
    ctx.fillText(row, right, y);
    y += px * 1.5;
  }
  // The tail is a count, never a cloud — THE CENSUS's rule, kept.
  const rest = Object.keys(season.classification[taxonomy] ?? {}).length - named.length;
  if (rest > 0) {
    ctx.fillStyle = `rgba(${BONE_RGB}, ${remains * STACK_GUTTER_SUB_ALPHA})`;
    ctx.fillText(`${rest} more · a tick and a count`, right, y + px * 0.6);
  }
  ctx.restore();
}

/**
 * What an applied operation owes the viewer, on the plate.
 *
 * PROVENANCE IS IN THE RAIL (artist's ruling, 2026-08-09) and this is not that.
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
  // F-12, and it travels with the calipers wherever they are drawn. The four
  // heroes come out of the recovered set — a biased subset, over-representing
  // shots that reach the rim, because a release is only found by following the
  // ball back from it. The string is TEMPLATED BY THE PIPELINE from the figures
  // it quotes (`window.json:bias.scope`); the site draws it and never composes
  // its own, so a re-run updates the wall text.
  const scope = has(ops, "measure") && inWindow(f) ? f.data.window?.bias.scope : null;
  if (scope) lines.push(scope);
  if (!lines.length) return;
  // `aside`: subordinate to the marks it describes. docs/build/typography-inventory.md.
  drawSlug(ctx, view, lines, { x: 0, y: COURT.y1 - STACK_DISCLOSURE_INSET },
    remains, "aside");
}
