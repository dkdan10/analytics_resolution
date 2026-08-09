/** THE CENSUS — the machine classifying basketball, live.
 *
 * Every shot that lands on the plate is simultaneously filed under every
 * taxonomy the record applies at once: whether it was a two or a three,
 * whether it went in, which zone, which range, which area, and which of the
 * record's phrases for what the shot *was*. Only that last one grows - see
 * `vocabulary.words` and `vocabulary.categories_total`, which is what the
 * header below counts. The number of taxonomies never moves, and facts.py
 * asserts that across the seasons.
 *
 * The tallies run as the marks arrive, counts and percentages settling as the
 * season fills. Nothing here is summarised after the fact: this is the record
 * deciding what a shot is, at the moment it decides it.
 *
 * Everything is counted from the arrived sample, so the census is a pure
 * function of the scrub float like everything else — scrub backwards and it
 * recounts rather than remembers.
 */

import { factNum, type Season } from "../data";
import { BONE_RGB, SLUG_FAMILY } from "../palette";
import { CENSUS_HEAD_ALPHA, CENSUS_SUB_ALPHA } from "../scalars";
import { drawSeasonField } from "./fieldlayer";
import type { Frame } from "./types";

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

/**
 * The season's own classification, counted in full and grown with arrival.
 *
 * This used to tally the fixed-seed sample, which made the census an estimate:
 * it printed one mid-range share while the plate struck a different one into
 * the floor beside it. These are the record's real counts, so the two figures
 * on screen now agree by construction, and qa.py gates that they do.
 */
function census(season: Season, arrived: number): { groups: Group[]; classified: number } {
  const a = Math.min(1, Math.max(0, arrived));
  const cls = season.classification;
  const classified = Math.round(season.attempts * a);

  const rows = (title: string): Row[] =>
    Object.entries(cls[title] ?? {})
      .map(([name, n]) => ({ name, n: Math.round(n * a) }))
      .filter((r) => r.n > 0)
      .sort((x, y) => y.n - x.n);

  const unplaced = Math.round(season.resolution.origin_snapped * a);
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

export function drawCensusHand(f: Frame): void {
  const { ctx, view, st, data, remains } = f;
  const season = data.byYear.get(st.year!)!;

  // The marks stay, quieter: the census is about them, so they have to be there.
  //
  // The outgoing season is NOT drawn here, unlike every other hand. The tally
  // counts this season's arrived shots, so a field still carrying the previous
  // season's marks would contradict a census reading "3 SHOTS CLASSIFIED".
  // Here the plate empties and refills with the count.
  // No outgoing season here, unlike every other hand: a field still carrying
  // the previous season's shots would contradict a tally counting only this one.
  drawSeasonField(f, { dim: remains * 0.55, withPrevious: false });

  const { groups, classified } = census(season, st.arrived);

  const px = Math.max(8.5, Math.min(11, view.width / 150));
  ctx.save();
  ctx.font = `${px}px ${SLUG_FAMILY}`;
  ctx.textBaseline = "alphabetic";

  const pad = Math.round(px * 1.6);
  const colW = Math.max(150, Math.min(215, view.width * 0.155));
  const top = pad + LINE * 3;
  const bottom = view.height - pad;

  // Left: the season, the size of the machine's vocabulary, and the smaller
  // taxonomies. Right: the description, which is where the growth happens.
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
    left.line(g.title, "", 0.45 * remains, true);
    for (const r of g.rows) {
      const p = g.of ? ((100 * r.n) / g.of).toFixed(1) : "0.0";
      left.line(r.name, `${r.n}  ${p}%`, 0.72 * remains);
    }
    left.gap();
  }

  const desc = groups.find((g) => g.title === "DESCRIPTION")!;
  const rightCols = 2;
  const rightX = view.width - pad - colW * rightCols;
  const right = new Columns(ctx, rightX, top, colW, bottom, rightCols);
  right.line(`DESCRIPTION · ${desc.rows.length} OF ${season.vocabulary.words}`, "", 0.45 * remains, true);
  for (const r of desc.rows) {
    const p = desc.of ? ((100 * r.n) / desc.of).toFixed(1) : "0.0";
    right.line(r.name, `${r.n}  ${p}%`, 0.72 * remains);
  }

  // The window's own inventory, in the one act where the record held more than
  // a category per shot. Everything above counts what the archive SAYS about a
  // shot; this counts what the machine actually saw, and the two are not the
  // same order of magnitude.
  if (st.act === 3 && data.window) {
    drawWindowInventory(f, left);
  }

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
  col.line("THE MACHINE SAW", "", 0.45 * remains, true);
  col.line("Moments", grown(inv.moments), 0.72 * remains);
  col.line("Body positions", grown(inv.body_positions), 0.72 * remains);
  col.line("Miles run", grown(inv.miles_run), 0.72 * remains);
  col.line("Hours tracked", grown(inv.hours_tracked), 0.72 * remains);
  col.line("Touches", grown(inv.touches), 0.72 * remains);
  col.line("Passes", grown(inv.passes), 0.72 * remains);
  col.line("Drives", grown(inv.drives), 0.72 * remains);
  col.gap();
  col.line("THE RECORD KEPT", "", 0.45 * remains, true);
  // Both measured. The record's width per shot is counted from the dump's own
  // header, and the full schedule from the season the window sits inside -
  // neither is a number this file is entitled to know.
  const positions = factNum(data.facts, "schema.positions_per_shot");
  const full = factNum(data.facts, "season.games_full");
  col.line("Positions per shot", String(positions), 0.72 * remains);
  col.line(`Games of ${full.toLocaleString()}`, String(w.corpus.games_parsed), 0.72 * remains);
}
