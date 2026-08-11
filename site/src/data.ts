/** Loading and typing of the pipeline's derived JSON.
 *
 * Everything the piece can say comes from here. No figure is ever written into
 * the source (CLAUDE.md honesty rule) - if a number is on screen, it resolves to
 * a key in data/processed/.
 */

/** How finely the record could draw a given season. Measured, not assigned. */
import type { TracesFile } from "./bloom";
import { decodePoints, decodePointsByDay, type DayPoints, type Points } from "./field";

export type Regime =
  | "uniformly_blind"
  | "uneven"
  | "uniformly_sighted"
  | "categorical_refusal";

/**
 * WHERE the record refuses to place a rim shot — which is not always (0,0).
 *
 * The busiest restricted-area coordinate of the season, and how far it leads
 * the runner-up. Every rim-blindness claim this project made was once read off
 * `origin_snapped` beside it, which counts EXACTLY the origin and is therefore
 * blind to a refusal filed anywhere else — which is what six seasons do. The
 * pin follows THIS.
 */
export interface RimSentinel {
  /** Tenths of a foot, hoop at origin — the plate's own frame. */
  coord: [number, number];
  n: number;
  share_of_season: number;
  share_of_rim: number;
  runner_up_coord: [number, number] | null;
  runner_up_n: number;
  lead_ratio: number | null;
  /** Read from `lead_ratio` against a threshold in the middle of an empty band.
   *  False in 2010-11..2013-14, the only seasons that place every rim shot. */
  is_refusal: boolean;
  at_origin: boolean | null;
  pile_n: number;
  /** The record's own names for what sits on the pile. `share_of_type` is how
   *  much of the season's WHOLE population of that name the pile holds. */
  composition: Record<
    string,
    { n: number; share_of_pile: number; share_of_type: number }
  >;
  fg_pct: number;
  fg_pct_off_sentinel: number | null;
  /** Which refusal this is, from two measured bands: the rim swallowed whole,
   *  a dunk convention, or a tip-and-putback one. null when not a refusal. */
  kind: "wholesale" | "dunk" | "tip_putback" | null;
}

export interface Resolution {
  origin_snapped: number;
  origin_snapped_share: number;
  ra_attempts: number;
  ra_origin_snapped: number;
  ra_origin_share: number;
  /** The head of `rim_sentinel.composition`, and empty when the season refuses
   *  nothing. Derived at the sentinel, not at the origin — an origin-derived
   *  answer beside a sentinel-drawn pin put two populations in one caption. */
  refused_action_types: Record<string, number>;
  regime: Regime;
  arena_spread_pp: number;
  origin_arena_spread_pp: number;
  full_resolution_arenas: string[];
  n_full_resolution_arenas: number;
  full_resolution_games: number;
  n_games_with_ra: number;
  /** Null only if a season's restricted area is empty, which no season's is. */
  rim_sentinel: RimSentinel | null;
}

/** How much the record has to say about what a shot WAS - the second curve,
 *  and the mirror of the first: as it stops saying where, it learns to say what. */
export interface Vocabulary {
  /** Distinct ACTION_TYPE values that season. It grows: the record learns
   *  adjectives as it stops saying where. */
  words: number;
  /** How many are needed to account for most of a season's shots - the honest
   *  measure of how varied the description actually is, and what drives THE
   *  LEDGER's label density. It grows several-fold across the corpus. */
  words_covering_90pct: number;
  mean_words_per_shot: number;
  mean_chars_per_shot: number;
  longest: string;
  most_common: string;
  words_list: string[];
  /** How many categories of EACH taxonomy account for the bulk of the
   *  season, which is how many words THE CENSUS strikes into the floor for
   *  whichever one it is filing. `covering_90pct.DESCRIPTION` IS
   *  `words_covering_90pct` above - one measurement, gated, so the two hands'
   *  text density cannot disagree. */
  covering_90pct: Record<string, number>;
  /** Distinct values per classification field. */
  taxonomies: Record<string, number>;
  /** Every taxonomy's distinct values added up - the size of the machine's
   *  whole vocabulary for saying what a shot was. */
  categories_total: number;
}

/**
 * The facts no dump records, and the display facts derived from them.
 *
 * Written by pipeline/facts.py. `external` is history with a citation - the
 * league's founding, the date the moment endpoint was already dead, the line in
 * force through 1996-97, the measures the league publishes instead of the
 * geometry. `derived` is computed from another artifact or from the schedule
 * constants in timeline.ts, and carries `from` naming what it came out of.
 *
 * The piece reads both and restates neither. Loaded with `await`, NOT through
 * the optional-stage try/catch below: display copy depends on it, and a silent
 * null would put the piece back to authoring its own numbers at runtime.
 */
export interface ExternalFact<T = unknown> {
  value: T;
  statement: string;
  source: string;
  note?: string;
}

export interface DerivedFact {
  value: number | string;
  from: string;
}

export interface FactsFile {
  generated_by: string;
  generated_at: string;
  external: Record<string, ExternalFact>;
  derived: Record<string, DerivedFact>;
}

/** A derived display fact, as a number. Throws rather than returning a
 *  fallback: a missing key means the piece would print something nobody
 *  measured, and failing loudly is the whole point of the chain. */
export function factNum(facts: FactsFile, key: string): number {
  const e = facts.derived[key];
  if (!e || typeof e.value !== "number") {
    throw new Error(`facts.json: derived.${key} missing or not a number`);
  }
  return e.value;
}

export function factText(facts: FactsFile, key: string): string {
  const e = facts.derived[key];
  if (!e) throw new Error(`facts.json: derived.${key} missing`);
  return String(e.value);
}

export function factExternal<T>(facts: FactsFile, key: string): T {
  const e = facts.external[key];
  if (!e) throw new Error(`facts.json: external.${key} missing`);
  return e.value as T;
}

/** 1996-97 only: the taxonomy's reading against the line then in force. */
export interface Contemporaneous {
  /** The radius of the line actually in force, in feet. External history, so
   *  it is declared once in the pipeline and read here - both the words the
   *  plate prints and the arc it draws come from this key. */
  line_ft: number;
  taxonomy_mid_attempts: number;
  taxonomy_mid_share: number;
  misfiled_threes: number;
  contemporaneous_mid_attempts: number;
  contemporaneous_mid_share: number;
  three_attempts_by_type: number;
  three_attempts_by_zone: number;
  note: string;
}

/**
 * Where one category of the record sits on the floor.
 *
 * POLAR, and that is not a formatting choice: the Cartesian centroid of an
 * annular category is pulled toward the hoop and lands outside the band it is
 * named for. `dist_ft` is the mean of the record's own SHOT_DISTANCE and
 * `bearing_rad` the CIRCULAR mean of the coordinates' angle.
 *
 * `n_placed` is how many of the category's `n` shots the record actually gave a
 * place. It is not bookkeeping: in the blind era it is a few per cent, which is
 * the piece's four-regime finding arriving inside the census.
 */
export interface Place {
  n: number;
  n_placed: number;
  /** Absent when `n_placed` is 0 - the record named the category and placed
   *  none of it, so there is nowhere to strike the word. */
  dist_ft?: number;
  bearing_rad?: number;
  /** The resultant length: 1 is a ray, 0 is a category with no direction at
   *  all. A category symmetric about the centreline has a meaningless bearing
   *  sitting near pi/2, and this is what says so. */
  bearing_concentration?: number;
}

export interface Season {
  year: number;
  season: string;
  attempts: number;
  made: number;
  fg_pct: number;
  mid_attempts: number;
  mid_share: number;
  three_attempts: number;
  three_share: number;
  mean_distance_ft: number;
  n_games: number;
  n_teams: number;
  date_min: string;
  date_max: string;
  resolution: Resolution;
  vocabulary: Vocabulary;
  /** The season's whole classification, counted in full: taxonomy -> category
   *  -> count. THE CENSUS reads these, so its figures equal the ones the plate
   *  strikes into the floor instead of estimating them from a sample. */
  classification: Record<string, Record<string, number>>;
  /** WHERE each of those categories sits on this floor: the mean of the
   *  record's own SHOT_DISTANCE and the CIRCULAR mean of atan2(LOC_Y, LOC_X)
   *  over that category's placed shots. THE CENSUS strikes one word per
   *  category HERE, so there is no authored position anywhere in that hand.
   *  A category with no placed shots carries `n_placed: 0` and no position at
   *  all, rather than a default one. */
  classification_place: Record<string, Record<string, Place>>;
  /** Which of the six THE CENSUS files this season. DERIVED BY THE PIPELINE
   *  from two measurements it already makes - the era's own three-point line
   *  and whether the vocabulary moved - so there is one implementation of the
   *  rule and qa.py gates it. The renderer reads the answer; it does not decide
   *  it. Overridden only in the window, which files all six in sequence. */
  active_taxonomy: string;
  contemporaneous: Contemporaneous | null;
  note: string | null;
  /** Declared only by the window season: the shape of its shipped calendar
   *  (`points_by_day/season_YYYY.bin`). A season without this block ships no
   *  calendar and is never asked for one. */
  points_by_day?: PointsByDayMeta;
}

export interface PointsByDayMeta {
  records: number;
  bytes: number;
  day0: string;
  window_last_day: number;
  window_days: number;
  last_day: number;
  days_present: number;
  order: string;
}

export interface SeasonsFile {
  generated_by: string;
  generated_at: string;
  provenance: Record<string, string>;
  /** Taxonomy title -> the record's own column name. */
  taxonomy_columns: Record<string, string>;
  definitions: Record<string, string>;
  seasons: Season[];
}

/** A season's fixed-seed dot sample, with per-dot provenance for the renderer. */
export interface Sample {
  season: string;
  n: number;
  of_halfcourt_attempts: number;
  x: number[];
  y: number[];
  made: number[];
  three: number[];
  /** 1 where the record filed the shot at the origin - drawn as the pile. */
  pin: number[];
  /** 1 where the shot came from an arena that recorded rim coordinates. */
  hires: number[];
  /** Index into `zone_names` — the NBA's own category, filed by the pipeline. */
  zone: number[];
  /** Index into `action_vocab` — what the record says the shot was. */
  action: number[];
  /** Indices into `range_names` / `area_names` — the rest of the machine's
   *  classification of the same shot. Six taxonomies in all. */
  range: number[];
  area: number[];
  zone_names: string[];
  action_vocab: string[];
  range_names: string[];
  area_names: string[];
}

export type { Trace, TracesFile } from "./bloom";

/**
 * The window, recomputed.
 *
 * Every other season in this piece is a record of endpoints: one point and a
 * handful of categories per shot. For the span in `corpus` the optical feed
 * itself was public, and these are the measures the league still publishes
 * today, remade from the geometry it stopped releasing after the corpus's last
 * archive.
 *
 * The definitions are authored by the pipeline, not the league — theirs are not
 * published — which is why every measure carries a second reading under a
 * second defensible rule. `definitions` ships with the artifact and says so.
 */
export interface DefenderBucket {
  name: string;
  lo_ft: number;
  hi_ft: number | null;
  attempts: number;
  made: number;
  share: number;
  fg_pct: number | null;
}

export interface HeroShot {
  bucket: number;
  bucket_name: string;
  date: string;
  action: string;
  zone: string;
  made: number;
  dist: number;
  dist_gather: number | null;
  residual: number;
  hz: number;
  track: (number[] | null)[];
}

export interface WindowFile {
  definitions: Record<string, string>;
  corpus: {
    archives_listed: number;
    empty_shells: string[];
    misnamed_archives: string[];
    games_parsed: number;
    date_first: string | null;
    date_last: string | null;
    season_games: number;
  };
  recovery: {
    joined_shots: number;
    measured: number;
    rate: number;
    failures: Record<string, number>;
    anchor_residual_median_ft: number | null;
    anchor_residual_p95_ft: number | null;
    anchor_residual_over_max: number;
    attribution_agreement: number | null;
    attribution_disagreements: number;
    /** The per-game join calibration: `tracking eventId == GAME_EVENT_ID` is
     *  off by a small constant in a minority of games, so each game's offset is
     *  settled by its own shots. Shipped so the correction is visible. */
    event_offsets: Record<string, number>;
    games_offset: number;
    weak_joins: { archive: string; offset: number; margin: number }[];
    n_weak_joins: number;
  };
  /** What the instrument prefers, measured and stated rather than carried.
   *
   *  A release is only found by following the ball back from the rim, so the
   *  recovered set over-represents shots that reach it — and every made shot
   *  reaches it. Anything taken from this subset inherits that, which is why
   *  `scope` and `disclosure` are drawn wherever a recovered-set proportion is.
   *  Both are templated by the pipeline from the figures beside them; the site
   *  renders them and never composes its own. */
  bias: {
    measured_attempts: number;
    season_attempts: number;
    share_of_season: number;
    fg_pct_measured: number | null;
    fg_pct_season: number;
    fg_pct_gap: number | null;
    why: string;
    /** One short line, for beside a figure. */
    scope: string | null;
    /** Two lines, for the plate. */
    disclosure: string[];
  };
  contest: {
    buckets: DefenderBucket[];
    /** The continuous quantity the four categories are cut out of, before the
     *  cut. `p99` is the reference THE HAND scales a splotch's radius against —
     *  a measured property of the distribution being drawn, where a storage
     *  ceiling used to stand. */
    caliper_ft: { n: number; p50: number; p90: number; p99: number; max: number };
    /** The continuous quantity the four categories are cut out of: mean
     *  closest-defender distance, sampled 2 s back at 25 Hz. */
    approach_curve_ft: (number | null)[];
    approach_hz: number;
    approach_seconds_before_release: number;
    /** Four shots, one per published category, with their real per-frame
     *  geometry for the 2 s before release: [shooter x, shooter y, defender x,
     *  defender y] in the shot record's own frame. The opening beat closes a
     *  caliper on these rather than animating the aggregate curve, which would
     *  be inventing motion no single shot performed. */
    heroes: HeroShot[];
    /** What the definition is worth: how many shots change category when "the
     *  time of the shot" is read as the gather instead of the release. */
    gather_rule: {
      shots: number;
      changed_bucket: number;
      changed_share: number | null;
      mean_delta_ft: number | null;
    };
  };
  /** The archive against itself: how far apart the coordinate a scorer filed
   *  and the position the optical feed gives the ball at release actually sit. */
  disagreement: {
    n: number;
    median_ft: number | null;
    p25_ft: number | null;
    p75_ft: number | null;
    p90_ft: number | null;
    within_3ft: number | null;
    within_6ft: number | null;
    beyond_15ft: number | null;
    by_action: Record<string, { n: number; agree: number; rate: number }>;
  };
  occupancy: {
    bands: { lo_ft: number; hi_ft: number | null; frames: number; share: number }[];
    frames_total: number;
    grid: Record<string, number>;
  };
  /** THE WASH (session 15): one body-occupancy raster per game day, the dried
   *  ground of the four scales. A cell is a count of tracked positions on the
   *  1-ft lattice, nothing else; clients fold the days — there is deliberately
   *  no corpus-wide second grid. */
  wash: {
    path: string;
    day0: string | null;
    days_played: number;
    /** Window-day index of each raster, in the raster order of the file. */
    days: number[];
    rows: number;
    cols: number;
    x0: number;
    y0: number;
    cell_ft: number;
    dtype: string;
    order: string;
    bytes: number;
    positions_total: number;
    fold: string;
    note: string;
  };
  inventory: {
    moments: number;
    body_positions: number;
    miles_run: number;
    hours_tracked: number;
    shots_measured: number;
    touches: number;
    touches_alt_radius: number;
    passes: number;
    drives: number;
    mean_seconds_per_touch: number | null;
    per_game: { touches: number | null; passes: number | null; drives: number | null };
  };
  measures_bin: {
    /** The struct format the pipeline packed with, so the reader below can
     *  assert against what was written rather than against its own memory. */
    record: string;
    path: string;
    records: number;
    bytes: number;
    bytes_per_record: number;
    day0: string | null;
  };
  quarrel_bin: {
    record: string;
    path: string;
    records: number;
    bytes: number;
    bytes_per_record: number;
    day0: string | null;
    /** Records with an endpoint outside the plate box — published, not
     *  enforced: the record files backcourt heaves and the feed follows the
     *  ball there. A renderer clips the drawing, never the data. */
    off_plate: number;
    /** "detected" — every shot both instruments spoke about, the disagreement
     *  summary's own population. NOT the recovered subset, which is screened
     *  at 6 ft and would show the quarrel with its fringe adjudicated away. */
    population: string;
    /** Display-bound, templated by the pipeline from the figures it quotes —
     *  the bias sentence's idiom. The site draws it and never composes its
     *  own, so a re-run updates the wall text. */
    scope: string;
  };
}

/**
 * The paint: strokes lifted from the bodies the record could not keep.
 *
 * Each stroke is one body's measured path over the five seconds before one
 * verified shot. Every vertex is a position the machine recorded — nothing here
 * is simulated, and no stroke is a particle. Two measurements ride on each
 * vertex and they are what make the paint honest: `dt`, the frames since the
 * previous vertex, and `arc`, the distance the body actually covered over that
 * span, summed at the full 25 Hz *before* simplification. Speed is arc/dt and
 * is therefore the true measured mean, however few control points survive.
 */
export interface PaintFile {
  definitions: Record<string, string>;
  /** The shape of the two binaries. Session 1 re-encoded both to stop `arc`
   *  clipping and to carry the canvas and body a split run belongs to; the
   *  reader below refuses anything it does not recognise rather than
   *  best-effort a layout it was not written for. */
  format_version: number;
  canvases: number;
  strokes: number;
  vertices: number;
  days_covered: number;
  /** The day index's own calendar: `day_dates[d]` is the date `day == d` stands
   *  for, and `day_offsets[d]` is that date's distance in days from the corpus's
   *  first. Both are dense from zero - the pipeline refuses to ship a mapping
   *  with a hole in it - which is what lets a renderer put a stroke on the
   *  window's calendar without parsing a date or interpolating one. */
  day_dates: string[];
  day_offsets: number[];
  seconds_painted: number;
  stroke_seconds: number;
  simplify_ft: number;
  vertices_outside_plate: number;
  speed_ft_s: { p10: number; p25: number; p50: number; p75: number; p90: number; p99: number };
  /** Share of painted SECONDS spent in each of the league's seven regions —
   *  ink is deposited per unit time, so this is where the paint actually goes. */
  ink_by_zone: Record<string, number>;
  files: {
    vertices: BinaryFile;
    index: BinaryFile;
  };
}

/** What the pipeline says it wrote: the struct format, the record width, and
 *  how many records the file holds. Every one of them is asserted before a
 *  byte is read - a decoder that trusts its own constant is a decoder that
 *  cannot notice the pipeline moved underneath it. */
export interface BinaryFile {
  path: string;
  record: string;
  records: number;
  bytes: number;
  bytes_per_record: number;
}

/** Decoded strokes. Flat arrays: a stroke is a slice, never an object. */
export interface Strokes {
  n: number;
  /** Per stroke. */
  first: Uint32Array;
  count: Uint16Array;
  /** Which possession this run was lifted from - the key into the private
   *  provenance manifest, and half of the identity that makes Rule 7 checkable.
   *  One canvas is one corroborated possession: every body on the floor, and
   *  the ball. `paint.json:bodies_per_canvas` says how many that is. */
  canvas: Uint16Array;
  /** 0 = a body, 1 = the ball — the only row the feed gave a third dimension. */
  kind: Uint8Array;
  /** The body slot within that canvas, stable across the runs of one body.
   *  After session 1 split every path at its discontinuities a body CAN be
   *  several strokes, so a body is `(canvas, body)` and never a stroke count. */
  body: Uint8Array;
  /** Index into the corroborated corpus's own GAME-days - NOT days since the
   *  window opened, which is what `Measures.day` counts. The two scales differ
   *  by the days nobody played: `paint.json:days_covered` game-days spread over
   *  `facts.json:window.days_inclusive` calendar days. Nothing in either file's
   *  name says so, and a hand pacing off both was pacing off two clocks.
   *  `PaintFile.day_dates` maps this index back to its own date and
   *  `day_offsets` to its distance from the first, both measured. */
  day: Uint8Array;
  /** Per vertex, in the plate's own frame (tenths, hoop at origin). */
  x: Int16Array;
  y: Int16Array;
  /** Frames since the previous vertex; 0 on a stroke's first vertex. */
  dt: Uint16Array;
  /** Tenths the body actually covered over that span, summed at the full 25 Hz
   *  BEFORE simplification, so speed is the true measured mean however few
   *  control points survived. Widened from one byte in session 1: 24 stored
   *  values had been pinned at the old ceiling. Nothing here may re-impose one. */
  arc: Uint16Array;
}

// The layouts the pipeline writes, mirrored here as literals so qa.py's
// decoder-parity check can read them out of this source and compare them with
// what the artifacts declare. They are ALSO asserted against the artifact at
// decode time below - the constant is what the check reads, the assertion is
// what makes it safe.
const VERTEX_REC = 8;
const STROKE_REC = 11;
const VERTEX_LAYOUT = "<hhHH";
const STROKE_LAYOUT = "<IHHBBB";
const PAINT_FORMAT_VERSION = 2;

/** A declared binary against the bytes that actually arrived.
 *
 *  Nothing type-checks a byte layout: the site decoded 6- and 8-byte paint
 *  records for two sessions after the pipeline moved to 8 and 11, and both
 *  `tsc --noEmit` and `npm run build` stayed clean while THE HAND rendered a
 *  starburst of garbage. So the reader states what it expects and stops. */
function assertLayout(
  what: string,
  file: BinaryFile,
  buf: ArrayBuffer,
  record: string,
  bytesPerRecord: number,
): void {
  const said: string[] = [];
  if (file.record !== record) said.push(`format ${file.record} not ${record}`);
  if (file.bytes_per_record !== bytesPerRecord) {
    said.push(`${file.bytes_per_record} B per record, this reader decodes ${bytesPerRecord}`);
  }
  if (buf.byteLength !== file.records * bytesPerRecord) {
    said.push(`${buf.byteLength} bytes on the wire, ${file.records} x ${bytesPerRecord} declared`);
  }
  if (said.length) throw new Error(`${what} (${file.path}): ${said.join("; ")}`);
}

export function decodeStrokes(
  vbuf: ArrayBuffer,
  ibuf: ArrayBuffer,
  paint: PaintFile,
): Strokes {
  if (paint.format_version !== PAINT_FORMAT_VERSION) {
    throw new Error(
      `paint.json declares format_version ${paint.format_version}; this reader `
      + `decodes ${PAINT_FORMAT_VERSION} and will not guess at another`,
    );
  }
  assertLayout("the paint's vertices", paint.files.vertices, vbuf, VERTEX_LAYOUT, VERTEX_REC);
  assertLayout("the paint's index", paint.files.index, ibuf, STROKE_LAYOUT, STROKE_REC);

  const nv = paint.files.vertices.records;
  const ns = paint.files.index.records;
  const vd = new DataView(vbuf);
  const id = new DataView(ibuf);
  const x = new Int16Array(nv);
  const y = new Int16Array(nv);
  const dt = new Uint16Array(nv);
  const arc = new Uint16Array(nv);
  for (let i = 0; i < nv; i++) {
    const o = i * VERTEX_REC;
    x[i] = vd.getInt16(o, true);
    y[i] = vd.getInt16(o + 2, true);
    dt[i] = vd.getUint16(o + 4, true);
    arc[i] = vd.getUint16(o + 6, true);
  }
  const first = new Uint32Array(ns);
  const count = new Uint16Array(ns);
  const canvas = new Uint16Array(ns);
  const kind = new Uint8Array(ns);
  const body = new Uint8Array(ns);
  const day = new Uint8Array(ns);
  for (let i = 0; i < ns; i++) {
    // `canvas` sits BETWEEN count and kind. A reader that merely widened the
    // record from 8 to 11 bytes and kept the old offsets would read the two
    // halves of `canvas` as `kind` and `day`, and every stroke would become a
    // body or a ball at random on a nonsense day, with no error anywhere.
    const o = i * STROKE_REC;
    first[i] = id.getUint32(o, true);
    count[i] = id.getUint16(o + 4, true);
    canvas[i] = id.getUint16(o + 6, true);
    kind[i] = id.getUint8(o + 8);
    body[i] = id.getUint8(o + 9);
    day[i] = id.getUint8(o + 10);
    const last = first[i]! + count[i]!;
    if (last > nv) {
      throw new Error(
        `${paint.files.index.path}: stroke ${i} runs to vertex ${last} of ${nv}`,
      );
    }
  }
  return { n: ns, first, count, canvas, kind, body, day, x, y, dt, arc };
}

/** One shot's caliper, decoded from window_measures.bin. */
export interface Measures {
  n: number;
  /** Shooter, in the shot record's own frame (tenths, hoop at origin). */
  x: Int16Array;
  y: Int16Array;
  /** The nearest defender, same frame. The segment between is the statistic. */
  dx: Int16Array;
  dy: Int16Array;
  /** Caliper length in tenths of a foot, never clipped.
   *
   *  This was one byte, so every distance past the byte's range was filed at
   *  its ceiling and read back as that distance, while the two endpoints stored
   *  beside it described a much longer one (audit F-05). It is now uint16 and
   *  the pipeline stops rather than clips, so there is no ceiling to normalise
   *  against and nothing may divide by one. `contest.caliper_ft` carries the
   *  measured distribution a renderer should scale against instead. */
  dist: Uint16Array;
  bucket: Uint8Array;
  made: Uint8Array;
  /** Days since the window opened — the flood runs as the corpus did. */
  day: Uint8Array;
}

const MEASURE_REC = 13;
const MEASURE_LAYOUT = "<hhhhHBBB";

/** One shot, twice: the archive's two words about where it happened. */
export interface Quarrel {
  n: number;
  /** The coordinate the scorer filed — the record's own integers, in the shot
   *  frame (tenths, hoop at origin). */
  fx: Int16Array;
  fy: Int16Array;
  /** Where the optical feed says the ball left the hand, same frame, rounded
   *  into tenths at the pack. The segment between the two points is the entire
   *  content; the residual is deliberately not stored (it is the distance
   *  between them, and qa.py recomputes it from these bytes). */
  bx: Int16Array;
  by: Int16Array;
  /** Days since the window opened — the flood runs as the corpus did. */
  day: Uint8Array;
}

const QUARREL_REC = 9;
const QUARREL_LAYOUT = "<hhhhB";

/** THE SLATE's summary: one found span of the slate night (`slate.json:date`). */
export interface SlateFile {
  date: string;
  /** Calendar days since the window opened — the measures' own day scale. */
  day: number;
  day0: string;
  span: {
    seconds: number;
    hz: number;
    start_utc: string;
    games_fully_live: number;
    games_present: number;
    archives: number;
  };
  paths: number;
  ball_paths: number;
  vertices: number;
  files: { slate_strokes: BinaryFile; slate_index: BinaryFile };
}

/** The slate decoded: every trackable body's folded path over the one span.
 *  No player, no game, no event, no clock — a path carries only its start
 *  offset inside the anonymous span, because simultaneity is the subject. */
export interface Slate {
  n: number;
  first: Uint32Array;
  count: Uint16Array;
  /** Frames from the span's open — what keeps the bodies moving together. */
  start: Uint16Array;
  /** 1 = the ball, 0 = a body; the ball is the only lit row, as in the paint. */
  kind: Uint8Array;
  x: Int16Array;
  y: Int16Array;
  dt: Uint16Array;
  arc: Uint16Array;
}

const SLATE_REC = 9;
const SLATE_LAYOUT = "<IHHB";

export function decodeSlate(vbuf: ArrayBuffer, ibuf: ArrayBuffer, s: SlateFile): Slate {
  assertLayout("the slate's vertices", s.files.slate_strokes, vbuf, VERTEX_LAYOUT, VERTEX_REC);
  assertLayout("the slate's index", s.files.slate_index, ibuf, SLATE_LAYOUT, SLATE_REC);
  const nv = s.files.slate_strokes.records;
  const np = s.files.slate_index.records;
  const vd = new DataView(vbuf);
  const id = new DataView(ibuf);
  const x = new Int16Array(nv);
  const y = new Int16Array(nv);
  const dt = new Uint16Array(nv);
  const arc = new Uint16Array(nv);
  for (let i = 0; i < nv; i++) {
    const o = i * VERTEX_REC;
    x[i] = vd.getInt16(o, true);
    y[i] = vd.getInt16(o + 2, true);
    dt[i] = vd.getUint16(o + 4, true);
    arc[i] = vd.getUint16(o + 6, true);
  }
  const first = new Uint32Array(np);
  const count = new Uint16Array(np);
  const start = new Uint16Array(np);
  const kind = new Uint8Array(np);
  for (let i = 0; i < np; i++) {
    const o = i * SLATE_REC;
    first[i] = id.getUint32(o, true);
    count[i] = id.getUint16(o + 4, true);
    start[i] = id.getUint16(o + 6, true);
    kind[i] = id.getUint8(o + 8);
    const last = first[i]! + count[i]!;
    if (last > nv) {
      throw new Error(`${s.files.slate_index.path}: path ${i} runs to vertex ${last} of ${nv}`);
    }
  }
  return { n: np, first, count, start, kind, x, y, dt, arc };
}

/** THE GAME's summary (`game.json`): one archive found by the disclosed
 *  corroboration argmax, every body and the ball at the paint's treatment.
 *  The matchup is re-derivable and ships in the selection block (flagged
 *  identity-spectrum ruling); no body is ever named — a stroke carries a
 *  per-period first-appearance slot, the ball at pipeline/game.py:BALL_BODY. */
export interface GameFile {
  date: string;
  /** Calendar days since the window opened — the measures' own day scale. */
  day: number;
  day0: string;
  archive: string;
  hz: number;
  mode_ms: number;
  selection: {
    rule: string;
    counts: Record<string, number>;
    chosen: string;
    corroborated: number;
    margin: number;
  };
  /** Period order and frame extents — what recovers the game's own order from
   *  the index's period-relative starts. */
  periods: { period: number; frames: number }[];
  paths: number;
  vertices: number;
  painted_frames: number;
  arc_tenths_total: number;
  off_plate_vertices: number;
  off_plate_share: number;
  dt_max: number;
  bodies_per_period: Record<string, number>;
  fold: {
    rule: string;
    hysteresis_ft: number;
    segments: number;
    hysteresis_alt_ft: number;
    segments_alt: number;
  };
  events: {
    shots: GameEvent[];
    passes: GameEvent[];
    n_shots: number;
    n_passes: number;
    pass_rule: string;
  };
  carriers: {
    spans: { p: number; f0: number; f1: number }[];
    n_touch: number;
    note: string;
  };
  possession: {
    p: number;
    f0: number;
    f1: number;
    frames: number;
    residual: number;
    /** Index into events.shots — the release the clip ends at. */
    shot: number;
    rule: string;
  };
  game_grid: { grid: Record<string, number>; total: number; fold: string };
  files: { game_strokes: BinaryFile; game_index: BinaryFile };
}

/** One measured annotation on the game: period-relative frame and the folded
 *  position. Shots additionally carry made and the corroboration residual. */
export interface GameEvent {
  p: number;
  f: number;
  x: number;
  y: number;
  made?: number | null;
  residual?: number;
}

/** The game decoded: the paint's vertex under a period-relative index. */
export interface Game {
  n: number;
  first: Uint32Array;
  count: Uint16Array;
  /** Frames from the period's first tracked moment (uint16 — a whole game of
   *  wall clock does not fit; a period always does). */
  start: Uint16Array;
  period: Uint8Array;
  /** 1 = the ball, 0 = a body. */
  kind: Uint8Array;
  /** Per-period first-appearance slot; the ball files at
   *  pipeline/game.py:BALL_BODY, and `kind` is the way to ask. */
  body: Uint8Array;
  x: Int16Array;
  y: Int16Array;
  dt: Uint16Array;
  arc: Uint16Array;
}

const GAME_REC = 11;
const GAME_LAYOUT = "<IHHBBB";

export function decodeGame(vbuf: ArrayBuffer, ibuf: ArrayBuffer, gf: GameFile): Game {
  assertLayout("the game's vertices", gf.files.game_strokes, vbuf, VERTEX_LAYOUT, VERTEX_REC);
  assertLayout("the game's index", gf.files.game_index, ibuf, GAME_LAYOUT, GAME_REC);
  const nv = gf.files.game_strokes.records;
  const np = gf.files.game_index.records;
  const vd = new DataView(vbuf);
  const id = new DataView(ibuf);
  const x = new Int16Array(nv);
  const y = new Int16Array(nv);
  const dt = new Uint16Array(nv);
  const arc = new Uint16Array(nv);
  for (let i = 0; i < nv; i++) {
    const o = i * VERTEX_REC;
    x[i] = vd.getInt16(o, true);
    y[i] = vd.getInt16(o + 2, true);
    dt[i] = vd.getUint16(o + 4, true);
    arc[i] = vd.getUint16(o + 6, true);
  }
  const first = new Uint32Array(np);
  const count = new Uint16Array(np);
  const start = new Uint16Array(np);
  const period = new Uint8Array(np);
  const kind = new Uint8Array(np);
  const body = new Uint8Array(np);
  for (let i = 0; i < np; i++) {
    const o = i * GAME_REC;
    first[i] = id.getUint32(o, true);
    count[i] = id.getUint16(o + 4, true);
    start[i] = id.getUint16(o + 6, true);
    period[i] = id.getUint8(o + 8);
    kind[i] = id.getUint8(o + 9);
    body[i] = id.getUint8(o + 10);
    const last = first[i]! + count[i]!;
    if (last > nv) {
      throw new Error(`${gf.files.game_index.path}: path ${i} runs to vertex ${last} of ${nv}`);
    }
  }
  return { n: np, first, count, start, period, kind, body, x, y, dt, arc };
}

/** THE WASH decoded: [day][row][col] uint32 counts, day order as declared. */
export interface Wash {
  days: number;
  rows: number;
  cols: number;
  /** Row-major per day: cell (d, r, c) at data[(d * rows + r) * cols + c]. */
  data: Uint32Array;
}

const WASH_CELL = 4;
const WASH_DTYPE = "<u4";

export function decodeWash(buf: ArrayBuffer, w: WindowFile): Wash {
  const ws = w.wash;
  const per = ws.rows * ws.cols * WASH_CELL;
  const said: string[] = [];
  if (buf.byteLength !== ws.days.length * per) {
    said.push(`holds ${buf.byteLength} B, the declaration says ${ws.days.length * per}`);
  }
  if (ws.dtype !== WASH_DTYPE) {
    said.push(`dtype ${ws.dtype}, this reader speaks ${WASH_DTYPE}`);
  }
  if (said.length) throw new Error(`the wash (${ws.path}): ${said.join("; ")}`);
  return {
    days: ws.days.length,
    rows: ws.rows,
    cols: ws.cols,
    data: new Uint32Array(buf),
  };
}

export function decodeQuarrel(buf: ArrayBuffer, w: WindowFile): Quarrel {
  assertLayout("the quarrel", w.quarrel_bin, buf, QUARREL_LAYOUT, QUARREL_REC);
  const n = w.quarrel_bin.records;
  const dv = new DataView(buf);
  const fx = new Int16Array(n);
  const fy = new Int16Array(n);
  const bx = new Int16Array(n);
  const by = new Int16Array(n);
  const day = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * QUARREL_REC;
    fx[i] = dv.getInt16(o, true);
    fy[i] = dv.getInt16(o + 2, true);
    bx[i] = dv.getInt16(o + 4, true);
    by[i] = dv.getInt16(o + 6, true);
    day[i] = dv.getUint8(o + 8);
  }
  return { n, fx, fy, bx, by, day };
}

export function decodeMeasures(buf: ArrayBuffer, w: WindowFile): Measures {
  assertLayout("the window's calipers", w.measures_bin, buf, MEASURE_LAYOUT, MEASURE_REC);
  const n = w.measures_bin.records;
  const dv = new DataView(buf);
  const x = new Int16Array(n);
  const y = new Int16Array(n);
  const dx = new Int16Array(n);
  const dy = new Int16Array(n);
  const dist = new Uint16Array(n);
  const bucket = new Uint8Array(n);
  const made = new Uint8Array(n);
  const day = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * MEASURE_REC;
    x[i] = dv.getInt16(o, true);
    y[i] = dv.getInt16(o + 2, true);
    dx[i] = dv.getInt16(o + 4, true);
    dy[i] = dv.getInt16(o + 6, true);
    dist[i] = dv.getUint16(o + 8, true);
    bucket[i] = dv.getUint8(o + 10);
    made[i] = dv.getUint8(o + 11);
    day[i] = dv.getUint8(o + 12);
  }
  return { n, x, y, dx, dy, dist, bucket, made, day };
}

export interface Corpus {
  archive_count: number;
  total_bytes: number;
  empty_32B_shells: string[];
  empty_shell_bytes: number;
  misnamed_archives: string[];
  date_range: [string, string];
}

export interface Loaded {
  seasons: Season[];
  /** External history and derived display facts. Never null: every hand draws
   *  copy out of it, so a failure to load is a failure to run. */
  facts: FactsFile;
  byYear: Map<number, Season>;
  samples: Map<number, Sample>;
  /** Every shot, per season, fetched on demand. `points(year)` returns what is
   *  already here and starts a fetch if it is not; the piece renders without it
   *  and gains it a frame or two later, rather than blocking the first paint on
   *  4 MB. */
  points(year: number): Points | null;
  /** The window season's calendar for the same points: per-day count deltas,
   *  the re-clock's artifact. Null for every season that ships no calendar and
   *  while the fetch is in flight; the base falls back to the shared arrival
   *  envelope rather than blocking. */
  pointsByDay(year: number): DayPoints | null;
  corpus: Corpus | null;
  /** Act III's gestures; null if the bloom stage has not been run. */
  traces: TracesFile | null;
  /** The window recomputed; null if the window stage has not been run.
   *  THE MEASURE degrades to the bare category names without it, which is
   *  exactly what every era outside the window looks like anyway. */
  window: WindowFile | null;
  /** Every caliper, fetched on demand like the points — the piece renders
   *  without it and gains it a frame or two later. */
  measures(): Measures | null;
  /** The quarrel — the two instruments' claims about where, per detected
   *  shot — fetched on demand like the calipers. */
  quarrel(): Quarrel | null;
  /** The paint stage's summary; null if it has not been run. */
  paint: PaintFile | null;
  /** The strokes themselves, fetched on demand. THE HAND draws splotches
   *  without them and gains the motion a frame or two later. */
  strokes(): Strokes | null;
  /** THE SLATE's summary — the found span of the Dec 5 night; null if the
   *  slate stage has not been run. */
  slateFile: SlateFile | null;
  /** The slate's paths, fetched on demand like the strokes. The night beat
   *  draws its day-keyed material without them and gains the bodies a frame
   *  or two later. */
  slate(): Slate | null;
  /** THE GAME's summary — the found archive of the four scales; null if the
   *  game stage has not been run. */
  gameFile: GameFile | null;
  /** The game's paths, fetched on demand like the strokes. */
  game(): Game | null;
  /** THE WASH — one body-occupancy raster per game day, fetched on demand.
   *  The scales dry into it; the piece renders without it and gains the
   *  ground a frame or two later. */
  wash(): Wash | null;
  /** Every lazily-fetched asset whose latest attempt failed, with why. Failures
   *  do not retry from the animation loop; the visible RETRY action owns that
   *  state change, so this remains finite and inspectable. */
  assetErrors(): string[];
  /** Every lazily-fetched asset a frame has ASKED for that has not yet
   *  arrived (session 17, THE FEED readout): the rail says the piece is
   *  still filling rather than leaving a cold seek to read as a sparse
   *  record. Probing NEVER fetches — only assets some draw call already
   *  requested appear — and the list empties on completion. */
  pendingAssets(): string[];
  /** Presentation-facing state for the assets behind the current rendering.
   *  `degraded` is deliberately distinct from `ready`: an optional stage may
   *  be absent and the piece can still draw, but a presenter must never mistake
   *  that sparse drawing for the intended frame. */
  assetState(): AssetState;
  /** Make every asset used by the dilated Window resident before a talk jumps
   *  into it. Safe to call more than once. */
  preloadWindow(): Promise<AssetState>;
  /** Re-attempt every failed optional or lazy asset. Failures stay visible if
   *  the retry also fails. */
  retryAssets(): Promise<AssetState>;
  provenance: Record<string, string>;
  /**
   * `seasons.json:definitions` — the pipeline's own sentence for each key it
   * ships. Carried into the site by session 6 because THE STACK's rail states,
   * beside every operation, what the artifact behind it means; and a definition
   * copied into a TypeScript string is a definition that will go stale, which is
   * the honesty rule applied to prose rather than to a number. `window.json` and
   * `paint.json` already reached the site with theirs.
   */
  seasonDefinitions: Record<string, string>;
  /** Which database column each of the six taxonomies IS — `DESCRIPTION` is
   *  `ACTION_TYPE`. THE CENSUS strikes the machine's own field name into the
   *  floor, and a name the record uses is a name the record has to supply. Its
   *  KEY ORDER is the record's own and is what the window's beats run through. */
  taxonomyColumns: Record<string, string>;
}

export type AssetStatus = "loading" | "ready" | "degraded" | "failed";

export interface AssetState {
  status: AssetStatus;
  pending: string[];
  errors: string[];
}

const BASE = import.meta.env.BASE_URL;

/** A presentation machine should never wait forever on a half-open request.
 *  One retry absorbs a transient server/cache miss; the second failure is
 *  surfaced through the loader/rail instead of disappearing into a sparse
 *  rendering. */
const FETCH_TIMEOUT_MS = 15_000;
const FETCH_ATTEMPTS = 2;

async function getResponse(path: string): Promise<Response> {
  let last: unknown = new Error(`failed to load data/${path}`);
  for (let attempt = 0; attempt < FETCH_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(`${BASE}data/${path}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`failed to load data/${path}: ${res.status}`);
      return res;
    } catch (err: unknown) {
      last = err;
    } finally {
      window.clearTimeout(timer);
    }
  }
  const reason = last instanceof Error ? last.message : String(last);
  throw new Error(`${reason} (after ${FETCH_ATTEMPTS} attempts)`);
}

async function getJSON<T>(path: string): Promise<T> {
  const res = await getResponse(path);
  return (await res.json()) as T;
}

/**
 * A binary, or a loud failure - never a silently mis-decoded one.
 *
 * `fetchStrokes` used to hand the response body straight to the decoder without
 * checking `Response.ok`, so a not-found page's HTML was decoded as paint. Every
 * lazy fetch here also swallowed its rejection into `.catch(() => undefined)`
 * while resetting its in-flight flag in `finally`, which let the animation loop
 * re-issue the same doomed request on every frame for the rest of the run.
 *
 * So: the status is checked, and a failure LATCHES. The piece degrades to what
 * it can draw without the asset - which for THE HAND is the splotches, exactly
 * the state every era outside the window is in anyway - and says once, loudly,
 * what it could not read.
 */
async function getBinary(path: string): Promise<ArrayBuffer> {
  const res = await getResponse(path);
  return await res.arrayBuffer();
}

/** One lazily-fetched asset: absent, arriving, arrived, or failed until an
 * explicit retry. */
interface Lazy<T> {
  get(): T | null;
  load(): Promise<T | null>;
  retry(): Promise<T | null>;
  error(): string | null;
  /** True while a request is in flight. A probe, never a trigger. */
  pending(): boolean;
}

function lazy<T>(name: string, fetcher: () => Promise<T>): Lazy<T> {
  let value: T | null = null;
  let failure: string | null = null;
  let inFlight = false;
  let request: Promise<T | null> | null = null;
  const begin = (force: boolean): Promise<T | null> => {
    if (value) return Promise.resolve(value);
    if (request) return request;
    if (failure && !force) return Promise.resolve(null);
    if (force) failure = null;
    inFlight = true;
    request = fetcher()
      .then((v) => {
        value = v;
        failure = null;
        return v;
      })
      .catch((e: unknown) => {
        failure = e instanceof Error ? e.message : String(e);
        // eslint-disable-next-line no-console
        console.error(`FADEAWAY: ${name} will not be drawn - ${failure}`);
        return null;
      })
      .finally(() => {
        inFlight = false;
        request = null;
      });
    return request;
  };
  return {
    get(): T | null {
      if (!value && !failure && !inFlight) void begin(false);
      return value;
    },
    load: () => begin(false),
    retry: () => begin(true),
    error: () => failure,
    pending: () => inFlight,
  };
}

export async function load(): Promise<Loaded> {
  // Both are REQUIRED. getJSON throws on a non-ok response, and that is
  // deliberate here: the optional stages below degrade to null and the piece
  // still runs, but a piece that cannot read its own facts would fall back to
  // authoring numbers, which is the one thing it may not do.
  const [file, facts] = await Promise.all([
    getJSON<SeasonsFile>("seasons.json"),
    getJSON<FactsFile>("facts.json"),
  ]);
  const seasons = file.seasons;

  // Samples are required by every hand, but they need not stand in front of
  // every optional summary. Start every sample request and optional JSON
  // together; the static first-paint surface remains visible while the single
  // concurrent startup wave resolves.
  const samples = new Map<number, Sample>();
  const sampleRequest = Promise.all(
    seasons.map(async (s) => {
      samples.set(s.year, await getJSON<Sample>(`samples/season_${s.year}.json`));
    }),
  );

  type OptionalKey = "corpus" | "traces" | "window" | "paint" | "slate" | "game";
  const optionalErrors = new Map<OptionalKey, string>();
  const optionalLoaders: Record<OptionalKey, () => Promise<unknown>> = {
    corpus: async () =>
      (await getJSON<{ corpus_listing: Corpus | null }>("sportvu_probe.json")).corpus_listing,
    traces: () => getJSON<TracesFile>("traces.json"),
    window: () => getJSON<WindowFile>("window.json"),
    paint: () => getJSON<PaintFile>("paint.json"),
    slate: () => getJSON<SlateFile>("slate.json"),
    game: () => getJSON<GameFile>("game.json"),
  };
  const optionalKeys = Object.keys(optionalLoaders) as OptionalKey[];
  const optionalRequest = Promise.allSettled(optionalKeys.map((key) => optionalLoaders[key]()));

  const [, optionalResults] = await Promise.all([sampleRequest, optionalRequest]);
  const optionalValues = new Map<OptionalKey, unknown>();
  optionalResults.forEach((result, i) => {
    const key = optionalKeys[i]!;
    if (result.status === "fulfilled") optionalValues.set(key, result.value);
    else {
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      optionalErrors.set(key, reason);
    }
  });

  // The corpus probe and traces are Act III's evidence. The piece can still
  // draw if one is absent, but the degraded state remains visible and retryable.
  let corpus = (optionalValues.get("corpus") as Corpus | null | undefined) ?? null;
  let traces = (optionalValues.get("traces") as TracesFile | undefined) ?? null;
  // Not named `window`: that would shadow the DOM global for the rest of this
  // function, and the next person to reach for window.devicePixelRatio here
  // would get a data artifact instead.
  let windowFile = (optionalValues.get("window") as WindowFile | undefined) ?? null;

  const pointLoaders = new Map<number, Lazy<Points>>();
  const fetchPoints = (year: number): Points | null => {
    let l = pointLoaders.get(year);
    if (!l) {
      l = lazy(`points/season_${year}.bin`,
        () => getBinary(`points/season_${year}.bin`).then(decodePoints));
      pointLoaders.set(year, l);
    }
    return l.get();
  };

  // Only the window season ships a calendar; every other year answers null
  // without fetching, so a caller probing the wrong season costs nothing. The
  // seasons row's own points_by_day block is the door - self-describing, no
  // year literal.
  const dayPointLoaders = new Map<number, Lazy<DayPoints>>();
  const fetchPointsByDay = (year: number): DayPoints | null => {
    if (!seasons.find((s) => s.year === year)?.points_by_day) return null;
    let l = dayPointLoaders.get(year);
    if (!l) {
      l = lazy(`points_by_day/season_${year}.bin`,
        () => getBinary(`points_by_day/season_${year}.bin`).then(decodePointsByDay));
      dayPointLoaders.set(year, l);
    }
    return l.get();
  };

  let paintFile = (optionalValues.get("paint") as PaintFile | undefined) ?? null;

  const strokeLoader = lazy("the paint", async (): Promise<Strokes> => {
    const [v, i] = await Promise.all([
      getBinary("paint_strokes.bin"),
      getBinary("paint_index.bin"),
    ]);
    return decodeStrokes(v, i, paintFile!);
  });
  const fetchStrokes = (): Strokes | null => (paintFile ? strokeLoader.get() : null);

  const measureLoader = lazy("the calipers",
    () => getBinary("window_measures.bin").then((b) => decodeMeasures(b, windowFile!)));
  const fetchMeasures = (): Measures | null => (windowFile ? measureLoader.get() : null);

  const quarrelLoader = lazy("the quarrel",
    () => getBinary("quarrel.bin").then((b) => decodeQuarrel(b, windowFile!)));
  const fetchQuarrel = (): Quarrel | null => (windowFile ? quarrelLoader.get() : null);

  let slateFile = (optionalValues.get("slate") as SlateFile | undefined) ?? null;

  const slateLoader = lazy("the slate", async (): Promise<Slate> => {
    const [v, i] = await Promise.all([
      getBinary("slate_strokes.bin"),
      getBinary("slate_index.bin"),
    ]);
    return decodeSlate(v, i, slateFile!);
  });
  const fetchSlate = (): Slate | null => (slateFile ? slateLoader.get() : null);

  let gameFile = (optionalValues.get("game") as GameFile | undefined) ?? null;

  const gameLoader = lazy("the game", async (): Promise<Game> => {
    const [v, i] = await Promise.all([
      getBinary("game_strokes.bin"),
      getBinary("game_index.bin"),
    ]);
    return decodeGame(v, i, gameFile!);
  });
  const fetchGame = (): Game | null => (gameFile ? gameLoader.get() : null);

  const washLoader = lazy("the wash",
    () => getBinary("wash.bin").then((b) => decodeWash(b, windowFile!)));
  const fetchWash = (): Wash | null =>
    (windowFile && windowFile.wash ? washLoader.get() : null);

  let preloadingWindow = false;
  let preloadRequest: Promise<AssetState> | null = null;
  let loaded!: Loaded;

  const lazyEntries = (): [string, Lazy<unknown>][] => [
    ...[...pointLoaders].map(([y, l]) => [`points/${y}`, l] as [string, Lazy<unknown>]),
    ...[...dayPointLoaders].map(
      ([y, l]) => [`points_by_day/${y}`, l] as [string, Lazy<unknown>]),
    ["strokes", strokeLoader],
    ["measures", measureLoader],
    ["quarrel", quarrelLoader],
    ["slate", slateLoader],
    ["game", gameLoader],
    ["wash", washLoader],
  ];

  const errors = (): string[] => [
    ...[...optionalErrors].map(([name, reason]) => `${name}: ${reason}`),
    ...lazyEntries()
      .filter(([, l]) => l.error() !== null)
      .map(([name, l]) => `${name}: ${l.error()!}`),
  ];
  const pending = (): string[] => [
    ...(preloadingWindow ? ["the window"] : []),
    ...lazyEntries().filter(([, l]) => l.pending()).map(([name]) => name),
  ];
  const state = (): AssetState => {
    const p = pending();
    const e = errors();
    return { status: p.length > 0 ? "loading" : e.length > 0 ? "degraded" : "ready",
      pending: p, errors: e };
  };

  const applyOptional = (key: OptionalKey, value: unknown): void => {
    switch (key) {
      case "corpus":
        corpus = value as Corpus | null;
        loaded.corpus = corpus;
        break;
      case "traces":
        traces = value as TracesFile;
        loaded.traces = traces;
        break;
      case "window":
        windowFile = value as WindowFile;
        loaded.window = windowFile;
        break;
      case "paint":
        paintFile = value as PaintFile;
        loaded.paint = paintFile;
        break;
      case "slate":
        slateFile = value as SlateFile;
        loaded.slateFile = slateFile;
        break;
      case "game":
        gameFile = value as GameFile;
        loaded.gameFile = gameFile;
        break;
    }
  };

  const retryOptionals = async (): Promise<void> => {
    const keys = [...optionalErrors.keys()];
    await Promise.all(keys.map(async (key) => {
      try {
        const value = await optionalLoaders[key]();
        applyOptional(key, value);
        optionalErrors.delete(key);
      } catch (err: unknown) {
        optionalErrors.set(key, err instanceof Error ? err.message : String(err));
      }
    }));
  };

  const retryAssets = async (): Promise<AssetState> => {
    await retryOptionals();
    await Promise.all(lazyEntries()
      .filter(([, l]) => l.error() !== null)
      .map(([, l]) => l.retry()));
    return state();
  };

  const preloadWindow = (): Promise<AssetState> => {
    if (preloadRequest) return preloadRequest;
    preloadRequest = (async () => {
      preloadingWindow = true;
      try {
        // Startup already gave every optional summary one retry inside its
        // bounded request. Do not silently start a second retry cycle here:
        // a failed summary must reach the visible DEGRADED state within that
        // contract, and only the presenter's RETRY action may try it again.
        const windowIndex = seasons.findIndex((s) => s.points_by_day);
        const windowYear = windowIndex >= 0 ? seasons[windowIndex]!.year : undefined;
        const requests: Promise<unknown>[] = [];
        if (windowYear !== undefined) {
          // The Window opens with the preceding season still present for its
          // scored entry withdrawal. Preload BOTH sides of that
          // handoff; otherwise a direct Window stop can paint its first frame
          // without the outgoing field and only request it after the audience
          // is already looking.
          const pointYears = [windowYear, seasons[windowIndex - 1]?.year]
            .filter((year): year is number => year !== undefined);
          for (const year of pointYears) {
            fetchPoints(year);
            const p = pointLoaders.get(year);
            if (p) requests.push(p.load());
          }
          fetchPointsByDay(windowYear);
          const d = dayPointLoaders.get(windowYear);
          if (d) requests.push(d.load());
        }
        if (paintFile) requests.push(strokeLoader.load());
        if (windowFile) {
          requests.push(measureLoader.load(), quarrelLoader.load());
          if (windowFile.wash) requests.push(washLoader.load());
        }
        if (slateFile) requests.push(slateLoader.load());
        if (gameFile) requests.push(gameLoader.load());
        await Promise.all(requests);
      } finally {
        preloadingWindow = false;
        preloadRequest = null;
      }
      return state();
    })();
    return preloadRequest;
  };

  loaded = {
    seasons,
    facts,
    byYear: new Map(seasons.map((s) => [s.year, s])),
    samples,
    points: fetchPoints,
    pointsByDay: fetchPointsByDay,
    corpus,
    traces,
    window: windowFile,
    measures: fetchMeasures,
    quarrel: fetchQuarrel,
    paint: paintFile,
    strokes: fetchStrokes,
    slateFile,
    slate: fetchSlate,
    gameFile,
    game: fetchGame,
    wash: fetchWash,
    assetErrors: errors,
    pendingAssets: pending,
    assetState: state,
    preloadWindow,
    retryAssets,
    provenance: file.provenance,
    seasonDefinitions: file.definitions,
    taxonomyColumns: file.taxonomy_columns,
  };
  return loaded;
}
