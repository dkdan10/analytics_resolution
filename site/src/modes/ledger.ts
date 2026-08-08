/** THE LEDGER — the archive learns adjectives.
 *
 * Every mark carries what the record says it *was*. In the earliest season
 * that is calm: a handful of phrases exist in the whole season and a smaller
 * handful account for ninety per cent of every shot, so the same few words
 * repeat quietly across the floor. By the last, several times as many exist,
 * far more are needed for the same ninety per cent, and each description is
 * longer — "Driving Layup Shot" has become "Turnaround Fadeaway Bank Jump
 * Shot". The text thickens because the vocabulary did. Every count here is in
 * `vocabulary` and none of it is restated in this file.
 *
 * That is the mirror of the piece's first curve. As the record stops saying
 * *where* a shot happened, it becomes fluent in saying *what* it was — and Act
 * V's crowding is substitution, never decay: the shot record's precision is
 * untouched, it is the kind of record that changed.
 *
 * How many labels are shown is itself driven by the measurement rather than by
 * taste: it scales with `words_covering_90pct`, the count of phrases needed to
 * describe the bulk of a season, so the density of description on the plate is
 * proportional to how varied the description actually is.
 */

import { factExternal, factNum, type Loaded, type Sample, type Season, type WindowFile } from "../data";
import { drawSlug } from "../inscription";
import { label } from "../textatlas";
import { drawSeasonField } from "./fieldlayer";
import type { Frame } from "./types";

/** How many labels the calmest season shows, and the vocabulary breadth that
 *  count is pinned to. Composition, not measurement: the density of description
 *  on the plate scales with `words_covering_90pct` from here. */
const LABELS_AT_CALMEST = 44;
const CALMEST_WORDS_90 = 4;
/** Ceiling from the measured frame budget, so the labels stay inside a frame
 *  even during a crossfade. */
const MAX_LABELS = 240;

/**
 * What the league publishes *instead of* the geometry, once the raw feed closes.
 *
 * The names used to be written out here, which is display copy authoring its
 * own content. They now come from `facts.json:external.published_instead`,
 * where each one carries the endpoint it is cited to - PtMeasureType values of
 * LeagueDashPtStats, plus PlayerDashPtShots, SynergyPlayTypes and HustleStats,
 * all from docs/build-plan-v2.md section 1.4-1.5.
 *
 * An earlier version of this slug read "THE VALUES ARE NOT PUBLIC", and that
 * was false. The league does publish values for all of them. What it stopped
 * publishing is the OPTICAL GEOMETRY THEY ARE MADE FROM — and that is the
 * enclosure this piece is about. The window proves it: inside it these can be
 * recomputed from the raw record, and outside it only the names survive.
 *
 * Values shown here are this project's own reconstructions over the window, not
 * the league's figures — their rules are not published, so the two cannot be
 * the same number and the piece never claims they are.
 */
interface PublishedMeasure {
  name: string;
  source: string;
}

function publishedInstead(data: Loaded): string[] {
  return factExternal<PublishedMeasure[]>(data.facts, "published_instead")
    .map((m) => m.name);
}

/**
 * What this project could recompute for the window, keyed by the same names.
 *
 * Only measures actually derived by pipeline/window.py appear; the rest stay
 * bare in every act, which is the honest state of them. Every figure resolves
 * to a key in window.json — none is written here.
 */
function windowValues(w: WindowFile | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!w) return out;
  const inv = w.inventory;
  const widest = w.contest.buckets[w.contest.buckets.length - 1];
  if (widest) {
    // A recovered-set proportion, so it is shown as one: the share carries the
    // scope tag the pipeline templated from its own coverage figure, and the
    // reader is never handed it as if it described the season (audit F-12).
    const scope = w.bias.scope ? ` · ${w.bias.scope}` : "";
    out.set("CLOSEST DEFENDER",
      `${(100 * widest.share).toFixed(1)}% ${widest.name.toUpperCase()}${scope}`);
  }
  out.set("SPEED & DISTANCE", `${inv.miles_run.toLocaleString()} MI`);
  if (inv.per_game.drives !== null) out.set("DRIVES", `${inv.per_game.drives}/GAME`);
  if (inv.per_game.touches !== null) out.set("TOUCHES", `${inv.per_game.touches}/GAME`);
  if (inv.per_game.passes !== null) out.set("PASSING", `${inv.per_game.passes}/GAME`);
  if (inv.mean_seconds_per_touch !== null) {
    out.set("POSSESSIONS", `${inv.mean_seconds_per_touch}S/TOUCH`);
  }
  return out;
}

function labelBudget(season: Season): number {
  const varied = season.vocabulary.words_covering_90pct / CALMEST_WORDS_90;
  return Math.max(12, Math.min(MAX_LABELS, Math.round(LABELS_AT_CALMEST * varied)));
}

export function drawLedgerHand(f: Frame): void {
  const { st, data, remains } = f;
  const year = st.year!;
  const season = data.byYear.get(year)!;
  const sample = data.samples.get(year);

  // The marks recede: here the description is the subject, and the dot is what
  // the description is about.
  drawSeasonField(f, { dim: remains * 0.42 });

  // The labels still address the fixed-seed sample, and must. At full density a
  // label would live a fraction of a frame - the arrival window advances far
  // faster than a reader - so the field beneath is every shot while the writing
  // keeps to a pace a reader can follow.
  if (sample) {
    drawLabels(f, sample, season);
    // The pile, named once. Labels stacked on a single point would be a
    // rendering bug; one line saying how many shots the record declined to
    // place is the fact itself.
    drawPinLabel(f, season);
  }

  // Act III shows the same published names carrying real recomputed values;
  // Act V shows them bare. That contrast IS the argument, so both call the
  // same code.
  if (st.act === 3 || st.act === 5) drawPublishedInstead(f, st.act === 3);
}

function drawLabels(f: Frame, sample: Sample, season: Season): void {
  const { ctx, view, dpr, st, remains } = f;
  const px = Math.max(8, 9.5 * (view.scale / 2));
  const vocab = sample.action_vocab;
  const budget = labelBudget(season);

  // Labels trail the arrival edge: the record is being written, and the scribe
  // annotates what has just landed. Older marks keep their dot and lose their
  // description, which is also how an archive behaves.
  const arrivedCount = Math.ceil(sample.n * Math.min(1, Math.max(0, st.arrived)));
  const from = Math.max(0, arrivedCount - budget);

  ctx.save();
  for (let i = from; i < arrivedCount; i++) {
    // Origin-filed shots are held out; they are named collectively by the pin.
    if (sample.pin[i] === 1) continue;
    const text = vocab[sample.action[i] ?? -1];
    if (!text) continue;

    // Newest are brightest, so the eye follows the writing rather than swimming.
    const age = (arrivedCount - i) / budget;
    const alpha = (1 - age) * 0.85 * remains;
    if (alpha <= 0.02) continue;

    const lab = label(text, px, dpr);
    ctx.globalAlpha = alpha;
    ctx.drawImage(
      lab.canvas,
      view.sx(sample.x[i]!) + px * 0.6,
      view.sy(sample.y[i]!) - lab.height / 2,
      lab.width,
      lab.height,
    );
  }
  ctx.restore();
}

function drawPinLabel(f: Frame, season: Season): void {
  const { ctx, view, st, remains } = f;
  // The season's own measured count of unplaced shots, grown with arrival -
  // `resolution.origin_snapped`, not a number scaled off a sample.
  const count = Math.round(
    season.resolution.origin_snapped * Math.min(1, Math.max(0, st.arrived)),
  );
  if (count === 0) return;

  // What the record refused to place, and what it called those shots. Both come
  // from the season's own measurement.
  const refused = Object.keys(season.resolution.refused_action_types)[0];
  const lines = [`${count.toLocaleString()} SHOTS · NO PLACE GIVEN`];
  if (refused) lines.push(refused.toUpperCase());
  drawSlug(ctx, view, lines, { x: 0, y: -30 }, remains * 0.85);
}

/**
 * The published names, with or without their values.
 *
 * `inWindow` is the whole point. Inside the window the names carry figures this
 * project recomputed from the optical record; after it the same names appear
 * bare, because the geometry that makes them stopped being published. The piece
 * states its Act V claim once and then, for the one season that can,
 * demonstrates it instead.
 */
function drawPublishedInstead(f: Frame, inWindow: boolean): void {
  const { ctx, view, dpr, st, data, remains } = f;
  const px = Math.max(8, 9.5 * (view.scale / 2));
  const values = inWindow ? windowValues(data.window) : new Map<string, string>();
  const names = publishedInstead(data);

  // They accumulate across the act and settle into the mid-range, which by this
  // point in the piece is very nearly empty: the derived measures occupy exactly
  // the space the geometry vacated. Two arcs, because one cannot hold all the
  // phrases without them running off the floor.
  const shown = Math.min(names.length, Math.ceil(st.phase * names.length * 1.4));
  const perArc = Math.ceil(names.length / 2);
  ctx.save();
  for (let i = 0; i < shown; i++) {
    const text = names[i]!;
    const lab = label(text, px, dpr);
    const arc = i < perArc ? 0 : 1;
    const k = arc === 0 ? i : i - perArc;
    const count = arc === 0 ? perArc : names.length - perArc;
    const a = Math.PI - ((k + 0.5) / count) * Math.PI;
    // Both arcs sit inside the mid-range band, which by Act V is very nearly
    // empty - `mid_share` says how nearly. The names occupy that emptiness.
    const r = arc === 0 ? 152 : 212;
    const x = view.sx(r * Math.cos(a));
    const y = view.sy(r * Math.sin(a));
    ctx.globalAlpha = remains * 0.62 * Math.min(1, (shown - i) * 0.5);
    ctx.drawImage(lab.canvas, x - lab.width / 2, y - lab.height / 2, lab.width, lab.height);

    // The value, when there is one to show, struck beneath its own name.
    const v = values.get(text);
    if (v) {
      const vl = label(v, px * 0.92, dpr);
      ctx.globalAlpha = remains * 0.5 * Math.min(1, (shown - i) * 0.5);
      ctx.drawImage(vl.canvas, x - vl.width / 2, y + lab.height * 0.75, vl.width, vl.height);
    }
  }
  ctx.restore();

  // The window's own span, from the corpus's first and last dates - never
  // restated. This slug used to name an interval nobody had checked against
  // them, and it was wrong by nearly two weeks.
  const days = factNum(data.facts, "window.days_inclusive");
  const slug = inWindow
    ? ["RECOMPUTED FROM THE RAW RECORD",
       `${days} DAYS · ONE RECONSTRUCTION, NOT THE LEAGUE'S`]
    : ["PUBLISHED INSTEAD OF THE GEOMETRY", "THE NUMBERS REMAIN · THE RECORD BENEATH THEM DOES NOT"];
  drawSlug(ctx, view, slug, { x: 0, y: 395 }, remains * 0.5);
}
