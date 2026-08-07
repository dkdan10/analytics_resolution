/** THE LEDGER — the archive learns adjectives.
 *
 * Every mark carries what the record says it *was*. In 1996-97 that is calm:
 * nine phrases exist in the whole season and four of them account for ninety
 * per cent of every shot, so the same few words repeat quietly across the
 * floor. By 2024-25 forty-eight exist, twenty are needed for the same ninety
 * per cent, and each description is half again as long — "Driving Layup Shot"
 * has become "Turnaround Fadeaway Bank Jump Shot". The text thickens because
 * the vocabulary did.
 *
 * That is the mirror of the piece's first curve. As the record stops saying
 * *where* a shot happened, it becomes fluent in saying *what* it was — and Act
 * V's crowding is substitution, never decay: the shot record's precision is
 * untouched, it is the kind of record that changed.
 *
 * How many labels are shown is itself driven by the measurement rather than by
 * taste: it scales with `words_covering_90pct`, the count of phrases needed to
 * describe ninety per cent of a season, so the density of description on the
 * plate is proportional to how varied the description actually is.
 */

import type { Sample, Season } from "../data";
import { drawSlug } from "../inscription";
import { drawMarks, drawPin } from "../marks";
import { label } from "../textatlas";
import type { Frame } from "./types";

/** Labels shown when four phrases cover ninety per cent of a season (1996-97). */
const LABELS_AT_CALMEST = 44;
const CALMEST_WORDS_90 = 4;
/** Ceiling from the measured budget: ~64 labels/ms here, so this stays inside
 *  a 60fps frame even during a crossfade. */
const MAX_LABELS = 240;

/**
 * What the league publishes *instead of* geometry, once the raw feed closes.
 *
 * Names only, and cited: these measures are documented in docs/build-plan-v2.md
 * §1.4-1.5 (LeagueDashPtStats measure types, PlayerDashPtShots, SynergyPlayTypes,
 * HustleStats). Their *values* are not in this project's data, and inventing any
 * to fill a frame would be the one unforgivable move — so the piece shows that
 * they exist and refuses to show numbers it does not hold.
 */
const PUBLISHED_INSTEAD = [
  "SPEED & DISTANCE", "DRIVES", "TOUCHES", "PASSING", "POSSESSIONS",
  "CATCH & SHOOT", "PULL-UP SHOOTING", "CLOSEST DEFENDER", "REBOUNDING",
  "PLAY TYPES", "HUSTLE", "EFFICIENCY",
];

function labelBudget(season: Season): number {
  const varied = season.vocabulary.words_covering_90pct / CALMEST_WORDS_90;
  return Math.max(12, Math.min(MAX_LABELS, Math.round(LABELS_AT_CALMEST * varied)));
}

export function drawLedgerHand(f: Frame): void {
  const { ctx, view, dpr, st, data, remains } = f;
  const year = st.year!;
  const season = data.byYear.get(year)!;
  const sample = data.samples.get(year);

  // The marks recede: here the description is the subject, and the dot is what
  // the description is about.
  const dim = remains * 0.42;
  if (st.prev !== null) {
    const prevSeason = data.byYear.get(st.prev);
    const prevSample = data.samples.get(st.prev);
    if (prevSeason && prevSample) {
      drawMarks(ctx, view, prevSample, prevSeason, { dpr, opacity: (1 - st.arrived) * dim });
    }
  }
  if (sample) {
    drawMarks(ctx, view, sample, season, { dpr, opacity: dim, arrived: st.arrived });
    drawPin(ctx, view, sample, { dpr, opacity: dim, arrived: st.arrived });
    drawLabels(f, sample, season);
  }

  // The pile, named once. Six hundred and eighty labels stacked on one point
  // would be a rendering bug; one label saying how many shots the record
  // declined to place is the fact itself.
  if (sample) drawPinLabel(f, sample, season);

  if (st.act === 5) drawPublishedInstead(f);
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

function drawPinLabel(f: Frame, sample: Sample, season: Season): void {
  const { ctx, view, st, remains } = f;
  const upto = Math.ceil(sample.n * Math.min(1, Math.max(0, st.arrived)));
  let count = 0;
  for (let i = 0; i < upto; i++) if (sample.pin[i] === 1) count++;
  if (count === 0) return;

  // What the record refused to place, and what it called those shots. Both come
  // from the season's own measurement.
  const refused = Object.keys(season.resolution.refused_action_types)[0];
  const lines = [`${count} SHOTS · NO PLACE GIVEN`];
  if (refused) lines.push(refused.toUpperCase());
  drawSlug(ctx, view, lines, { x: 0, y: -30 }, remains * 0.85);
}

function drawPublishedInstead(f: Frame): void {
  const { ctx, view, dpr, st, remains } = f;
  const px = Math.max(8, 9.5 * (view.scale / 2));

  // They accumulate across the act and settle into the mid-range, which by this
  // point in the piece is very nearly empty: the derived measures occupy exactly
  // the space the geometry vacated. Two arcs, because one cannot hold twelve
  // phrases without them running off the floor.
  const shown = Math.min(PUBLISHED_INSTEAD.length, Math.ceil(st.phase * PUBLISHED_INSTEAD.length * 1.4));
  const perArc = Math.ceil(PUBLISHED_INSTEAD.length / 2);
  ctx.save();
  for (let i = 0; i < shown; i++) {
    const text = PUBLISHED_INSTEAD[i]!;
    const lab = label(text, px, dpr);
    const arc = i < perArc ? 0 : 1;
    const k = arc === 0 ? i : i - perArc;
    const count = arc === 0 ? perArc : PUBLISHED_INSTEAD.length - perArc;
    const a = Math.PI - ((k + 0.5) / count) * Math.PI;
    // Both arcs sit inside the mid-range band, 14-22 ft, which by Act V holds
    // 7% of shots against 21% in 1996-97. The names occupy the emptiness.
    const r = arc === 0 ? 152 : 212;
    ctx.globalAlpha = remains * 0.62 * Math.min(1, (shown - i) * 0.5);
    ctx.drawImage(
      lab.canvas,
      view.sx(r * Math.cos(a)) - lab.width / 2,
      view.sy(r * Math.sin(a)) - lab.height / 2,
      lab.width,
      lab.height,
    );
  }
  ctx.restore();

  drawSlug(ctx, view, ["PUBLISHED INSTEAD OF THE GEOMETRY", "NAMES ONLY · THE VALUES ARE NOT PUBLIC"],
    { x: 0, y: 395 }, remains * 0.5);
}
