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

export interface Resolution {
  origin_snapped: number;
  origin_snapped_share: number;
  ra_attempts: number;
  ra_origin_snapped: number;
  ra_origin_share: number;
  refused_action_types: Record<string, number>;
  regime: Regime;
  arena_spread_pp: number;
  full_resolution_arenas: string[];
  n_full_resolution_arenas: number;
  full_resolution_games: number;
  n_games_with_ra: number;
}

/** How much the record has to say about what a shot WAS - the second curve,
 *  and the mirror of the first: as it stops saying where, it learns to say what. */
export interface Vocabulary {
  /** Distinct ACTION_TYPE values that season: 9 in 1996-97, 48 by 2024-25. */
  words: number;
  /** How many are needed to account for 90% of shots: 4, then 20. The honest
   *  measure of how varied the description actually is. */
  words_covering_90pct: number;
  mean_words_per_shot: number;
  mean_chars_per_shot: number;
  longest: string;
  most_common: string;
  words_list: string[];
  /** Distinct values per classification field. */
  taxonomies: Record<string, number>;
  /** All six added up: 31 categories in 1996-97, 75 by 2015-16. */
  categories_total: number;
}

/** 1996-97 only: the taxonomy's reading against the line then in force. */
export interface Contemporaneous {
  taxonomy_mid_attempts: number;
  taxonomy_mid_share: number;
  misfiled_threes: number;
  contemporaneous_mid_attempts: number;
  contemporaneous_mid_share: number;
  three_attempts_by_type: number;
  three_attempts_by_zone: number;
  note: string;
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
  contemporaneous: Contemporaneous | null;
  note: string | null;
}

export interface SeasonsFile {
  generated_by: string;
  generated_at: string;
  provenance: Record<string, string>;
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
 * The eleven weeks, recomputed.
 *
 * Every other season in this piece is a record of endpoints: one point and a
 * handful of categories per shot. For 89 days the optical feed itself was
 * public, and these are the measures the league still publishes today, remade
 * from the geometry it stopped releasing on 23 January 2016.
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
  contest: {
    buckets: DefenderBucket[];
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
  canvases: number;
  strokes: number;
  vertices: number;
  days_covered: number;
  seconds_painted: number;
  stroke_seconds: number;
  simplify_ft: number;
  vertices_outside_plate: number;
  speed_ft_s: { p10: number; p25: number; p50: number; p75: number; p90: number; p99: number };
  /** Share of painted SECONDS spent in each of the league's seven regions —
   *  ink is deposited per unit time, so this is where the paint actually goes. */
  ink_by_zone: Record<string, number>;
  files: {
    vertices: { records: number; bytes: number; bytes_per_record: number };
    index: { records: number; bytes: number; bytes_per_record: number };
  };
}

/** Decoded strokes. Flat arrays: a stroke is a slice, never an object. */
export interface Strokes {
  n: number;
  /** Per stroke. */
  first: Uint32Array;
  count: Uint16Array;
  /** 0 = a body, 1 = the ball — the only row the feed gave a third dimension. */
  kind: Uint8Array;
  day: Uint8Array;
  /** Per vertex, in the plate's own frame (tenths, hoop at origin). */
  x: Int16Array;
  y: Int16Array;
  dt: Uint8Array;
  arc: Uint8Array;
}

const VERTEX_REC = 6;
const STROKE_REC = 8;

export function decodeStrokes(vbuf: ArrayBuffer, ibuf: ArrayBuffer): Strokes {
  const nv = Math.floor(vbuf.byteLength / VERTEX_REC);
  const ns = Math.floor(ibuf.byteLength / STROKE_REC);
  const vd = new DataView(vbuf);
  const id = new DataView(ibuf);
  const x = new Int16Array(nv);
  const y = new Int16Array(nv);
  const dt = new Uint8Array(nv);
  const arc = new Uint8Array(nv);
  for (let i = 0; i < nv; i++) {
    const o = i * VERTEX_REC;
    x[i] = vd.getInt16(o, true);
    y[i] = vd.getInt16(o + 2, true);
    dt[i] = vd.getUint8(o + 4);
    arc[i] = vd.getUint8(o + 5);
  }
  const first = new Uint32Array(ns);
  const count = new Uint16Array(ns);
  const kind = new Uint8Array(ns);
  const day = new Uint8Array(ns);
  for (let i = 0; i < ns; i++) {
    const o = i * STROKE_REC;
    first[i] = id.getUint32(o, true);
    count[i] = id.getUint16(o + 4, true);
    kind[i] = id.getUint8(o + 6);
    day[i] = id.getUint8(o + 7);
  }
  return { n: ns, first, count, kind, day, x, y, dt, arc };
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
  /** Caliper length in tenths of a foot. */
  dist: Uint8Array;
  bucket: Uint8Array;
  made: Uint8Array;
  /** Days since the window opened — the flood runs as the eleven weeks did. */
  day: Uint8Array;
}

const MEASURE_REC = 12;

export function decodeMeasures(buf: ArrayBuffer): Measures {
  const n = Math.floor(buf.byteLength / MEASURE_REC);
  const dv = new DataView(buf);
  const x = new Int16Array(n);
  const y = new Int16Array(n);
  const dx = new Int16Array(n);
  const dy = new Int16Array(n);
  const dist = new Uint8Array(n);
  const bucket = new Uint8Array(n);
  const made = new Uint8Array(n);
  const day = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * MEASURE_REC;
    x[i] = dv.getInt16(o, true);
    y[i] = dv.getInt16(o + 2, true);
    dx[i] = dv.getInt16(o + 4, true);
    dy[i] = dv.getInt16(o + 6, true);
    dist[i] = dv.getUint8(o + 8);
    bucket[i] = dv.getUint8(o + 9);
    made[i] = dv.getUint8(o + 10);
    day[i] = dv.getUint8(o + 11);
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
  /** The eleven weeks recomputed; null if the window stage has not been run.
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
  provenance: Record<string, string>;
}

const BASE = import.meta.env.BASE_URL;

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}data/${path}`);
  if (!res.ok) throw new Error(`failed to load data/${path}: ${res.status}`);
  return (await res.json()) as T;
}

export async function load(): Promise<Loaded> {
  const file = await getJSON<SeasonsFile>("seasons.json");
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

  const pointCache = new Map<number, Points>();
  const inFlight = new Set<number>();
  const fetchPoints = (year: number): Points | null => {
    const have = pointCache.get(year);
    if (have) return have;
    if (!inFlight.has(year)) {
      inFlight.add(year);
      void fetch(`${BASE}data/points/season_${year}.bin`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((buf) => pointCache.set(year, decodePoints(buf)))
        .catch(() => undefined)
        .finally(() => inFlight.delete(year));
    }
    return null;
  };

  let paintFile: PaintFile | null = null;
  try {
    paintFile = await getJSON<PaintFile>("paint.json");
  } catch {
    paintFile = null;
  }

  let strokeCache: Strokes | null = null;
  let strokesInFlight = false;
  const fetchStrokes = (): Strokes | null => {
    if (strokeCache) return strokeCache;
    if (!strokesInFlight && paintFile) {
      strokesInFlight = true;
      void Promise.all([
        fetch(`${BASE}data/paint_strokes.bin`).then((r) => r.arrayBuffer()),
        fetch(`${BASE}data/paint_index.bin`).then((r) => r.arrayBuffer()),
      ])
        .then(([v, i]) => {
          strokeCache = decodeStrokes(v, i);
        })
        .catch(() => undefined)
        .finally(() => {
          strokesInFlight = false;
        });
    }
    return null;
  };

  let measureCache: Measures | null = null;
  let measuresInFlight = false;
  const fetchMeasures = (): Measures | null => {
    if (measureCache) return measureCache;
    if (!measuresInFlight && windowFile) {
      measuresInFlight = true;
      void fetch(`${BASE}data/window_measures.bin`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((buf) => {
          measureCache = decodeMeasures(buf);
        })
        .catch(() => undefined)
        .finally(() => {
          measuresInFlight = false;
        });
    }
    return null;
  };

  return {
    seasons,
    byYear: new Map(seasons.map((s) => [s.year, s])),
    samples,
    points: fetchPoints,
    corpus,
    traces,
    window: windowFile,
    measures: fetchMeasures,
    paint: paintFile,
    strokes: fetchStrokes,
    provenance: file.provenance,
  };
}
