/** Loading and typing of the pipeline's derived JSON.
 *
 * Everything the piece can say comes from here. No figure is ever written into
 * the source (CLAUDE.md honesty rule) - if a number is on screen, it resolves to
 * a key in data/processed/.
 */

/** How finely the record could draw a given season. Measured, not assigned. */
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
}

export interface Corpus {
  archive_count: number;
  total_bytes: number;
  empty_32B_shells: string[];
  misnamed_archives: string[];
  date_range: [string, string];
}

export interface Loaded {
  seasons: Season[];
  byYear: Map<number, Season>;
  samples: Map<number, Sample>;
  corpus: Corpus | null;
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

  // The corpus probe is Act III's evidence; the piece still runs without it.
  let corpus: Corpus | null = null;
  try {
    const probe = await getJSON<{ corpus_listing: Corpus | null }>("sportvu_probe.json");
    corpus = probe.corpus_listing;
  } catch {
    corpus = null;
  }

  return {
    seasons,
    byYear: new Map(seasons.map((s) => [s.year, s])),
    samples,
    corpus,
    provenance: file.provenance,
  };
}
