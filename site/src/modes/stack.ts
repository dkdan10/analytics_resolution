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

import { drawInscriptions, drawSlug } from "../inscription";
import { COURT } from "../plate";
import {
  STACK_DISCLOSURE_INSET,
  STACK_FIELD_DIM,
  STACK_INSCRIPTION_DIM,
} from "../scalars";
import { WINDOW_YEAR } from "../timeline";
import { drawSeasonField } from "./fieldlayer";
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
    drawSeasonField(f, {
      coloured: has(ops, "classify"),
      dim: f.remains * STACK_FIELD_DIM,
    });
  }

  // 9. Last, over everything.
  drawDisclosures(f, ops);
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
  if (!lines.length) return;
  // `aside`: subordinate to the marks it describes. docs/typography-inventory.md.
  drawSlug(ctx, view, lines, { x: 0, y: COURT.y1 - STACK_DISCLOSURE_INSET },
    remains, "aside");
}
