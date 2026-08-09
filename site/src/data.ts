/** Loading and typing of the pipeline's derived JSON.
 *
 * Everything the piece can say comes from here. No figure is ever written into
 * the source (CLAUDE.md honesty rule) - if a number is on screen, it resolves to
 * a key in data/processed/.
 */

/** How finely the record could draw a given season. Measured, not assigned. */
import type { TracesFile } from "./bloom";
import { decodePoints, type Points } from "./field";

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
  /** The paint stage's summary; null if it has not been run. */
  paint: PaintFile | null;
  /** The strokes themselves, fetched on demand. THE HAND draws splotches
   *  without them and gains the motion a frame or two later. */
  strokes(): Strokes | null;
  /** Every lazily-fetched asset that failed for good, with why. A failure
   *  latches rather than being retried from the animation loop, so this is a
   *  finite list and the probes assert it is empty before believing a row. */
  assetErrors(): string[];
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

const BASE = import.meta.env.BASE_URL;

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}data/${path}`);
  if (!res.ok) throw new Error(`failed to load data/${path}: ${res.status}`);
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
  const res = await fetch(`${BASE}data/${path}`);
  if (!res.ok) throw new Error(`failed to load data/${path}: ${res.status}`);
  return await res.arrayBuffer();
}

/** One lazily-fetched asset: absent, arriving, arrived, or failed for good. */
interface Lazy<T> {
  get(): T | null;
  error(): string | null;
}

function lazy<T>(name: string, fetcher: () => Promise<T>): Lazy<T> {
  let value: T | null = null;
  let failure: string | null = null;
  let inFlight = false;
  return {
    get(): T | null {
      if (value || failure || inFlight) return value;
      inFlight = true;
      void fetcher()
        .then((v) => {
          value = v;
        })
        .catch((e: unknown) => {
          failure = e instanceof Error ? e.message : String(e);
          // eslint-disable-next-line no-console
          console.error(`FADEAWAY: ${name} will not be drawn - ${failure}`);
        })
        .finally(() => {
          inFlight = false;
        });
      return null;
    },
    error: () => failure,
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

  const samples = new Map<number, Sample>();
  await Promise.all(
    seasons.map(async (s) => {
      samples.set(s.year, await getJSON<Sample>(`samples/season_${s.year}.json`));
    }),
  );

  // The corpus probe and the traces are Act III's evidence. The piece still
  // runs without them - the window simply stays a field of dots, which is what
  // every other era looks like anyway.
  let corpus: Corpus | null = null;
  try {
    const probe = await getJSON<{ corpus_listing: Corpus | null }>("sportvu_probe.json");
    corpus = probe.corpus_listing;
  } catch {
    corpus = null;
  }

  let traces: TracesFile | null = null;
  try {
    traces = await getJSON<TracesFile>("traces.json");
  } catch {
    traces = null;
  }

  // Not named `window`: that would shadow the DOM global for the rest of this
  // function, and the next person to reach for window.devicePixelRatio here
  // would get a data artifact instead.
  let windowFile: WindowFile | null = null;
  try {
    windowFile = await getJSON<WindowFile>("window.json");
  } catch {
    windowFile = null;
  }

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

  let paintFile: PaintFile | null = null;
  try {
    paintFile = await getJSON<PaintFile>("paint.json");
  } catch {
    paintFile = null;
  }

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

  return {
    seasons,
    facts,
    byYear: new Map(seasons.map((s) => [s.year, s])),
    samples,
    points: fetchPoints,
    corpus,
    traces,
    window: windowFile,
    measures: fetchMeasures,
    paint: paintFile,
    strokes: fetchStrokes,
    assetErrors: () => {
      const all: [string, string | null][] = [
        ...[...pointLoaders].map(([y, l]) => [`points/${y}`, l.error()] as [string, string | null]),
        ["strokes", strokeLoader.error()],
        ["measures", measureLoader.error()],
      ];
      return all.filter(([, e]) => e !== null).map(([n, e]) => `${n}: ${e}`);
    },
    provenance: file.provenance,
    seasonDefinitions: file.definitions,
    taxonomyColumns: file.taxonomy_columns,
  };
}
