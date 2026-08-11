/** THE WINDOW'S SCORE.
 *
 * One normalized score for every reader of Act III: the shared four beats,
 * THE HAND's five scales, and THE PLATE's evidence choreography. Durations are
 * expressed in presentation seconds first and converted here, so renderers,
 * controls, and probes never have to repeat phase arithmetic.
 *
 * `timeline.ts` keeps one literal mirror of WINDOW_DURATION_SECONDS because the
 * Python facts stage deliberately parses that file without executing
 * TypeScript. A runtime guard there makes drift between the mirror and this
 * score fail loudly.
 */

export const WINDOW_DURATION_SECONDS = 150;

/** A normalized interval in any authored score. */
export interface PhaseSpan<Id extends string = string> {
  readonly id: Id;
  readonly title: string;
  readonly from: number;
  readonly to: number;
}

/** Compatibility name retained for existing Window readers. */
export type WindowSpan<Id extends string = string> = PhaseSpan<Id>;

export interface WindowStop<Id extends string = string> {
  readonly id: Id;
  readonly title: string;
  readonly at: number;
}

export function clampWindowPhase(phase: number): number {
  return Math.min(1, Math.max(0, phase));
}

export function phaseAtWindowSecond(second: number): number {
  return clampWindowPhase(second / WINDOW_DURATION_SECONDS);
}

export function windowSecondAtPhase(phase: number): number {
  return clampWindowPhase(phase) * WINDOW_DURATION_SECONDS;
}

export function progressInWindowSpan(phase: number, span: PhaseSpan): number {
  if (span.to <= span.from) return phase >= span.to ? 1 : 0;
  return clampWindowPhase((phase - span.from) / (span.to - span.from));
}

/** Keys 6-9 and every shared hand keep these four boundaries. */
export const WINDOW_BEATS = [
  { id: "one", title: "one", from: 0.0, to: 0.1 },
  { id: "night", title: "the night", from: 0.1, to: 0.28 },
  { id: "season", title: "the season", from: 0.28, to: 0.813 },
  { id: "close", title: "the close", from: 0.813, to: 1.0 },
] as const satisfies readonly PhaseSpan[];

export type WindowBeat = (typeof WINDOW_BEATS)[number];
export type WindowBeatId = WindowBeat["id"];

/** One normalized Window instant, resolved against the shared score. */
export interface WindowFrame {
  readonly phase: number;
  readonly second: number;
  readonly beat: WindowBeatId;
  readonly local: number;
}

/** Resolve a phase once so every reader agrees on its second, beat and local. */
export function windowFrameAtPhase(phase: number): WindowFrame {
  const p = clampWindowPhase(phase);
  const beat = WINDOW_BEATS.find((candidate) => p < candidate.to)
    ?? WINDOW_BEATS[WINDOW_BEATS.length - 1]!;
  return {
    phase: p,
    second: windowSecondAtPhase(p),
    beat: beat.id,
    local: progressInWindowSpan(p, beat),
  };
}

export const WINDOW_SHARED_STOPS = WINDOW_BEATS.map((beat) => ({
  id: beat.id,
  title: beat.title,
  at: beat.from,
})) satisfies readonly WindowStop<WindowBeatId>[];

/** The preceding season leaves during the Window's dedicated entry span. This
 * is intentionally separate from ordinary-season ARRIVAL_TAIL: Act III may
 * dilate its evidence without leaving the prior season beneath it. */
export const WINDOW_ENTRY_SECONDS = 10;
export const WINDOW_ENTRY_SPAN = {
  id: "entry",
  title: "the preceding season withdraws",
  from: 0,
  to: phaseAtWindowSecond(WINDOW_ENTRY_SECONDS),
} as const satisfies PhaseSpan;

export function windowEntryProgress(phase: number): number {
  return progressInWindowSpan(phase, WINDOW_ENTRY_SPAN);
}

export function windowEntryRemnant(phase: number): number {
  return 1 - windowEntryProgress(phase);
}

const BEAT_SEASON = WINDOW_BEATS[2];
const BEAT_CLOSE = WINDOW_BEATS[3];

/** Exact Window second where the filed record re-asserts itself. */
export const WINDOW_CREST_SECONDS = 110;
export const WINDOW_CREST_PHASE = phaseAtWindowSecond(WINDOW_CREST_SECONDS);
/** Beat-local location of the exact crest, for readers working in SEASON. */
export const WINDOW_SEASON_CREST = progressInWindowSpan(WINDOW_CREST_PHASE, BEAT_SEASON);

// --- THE HAND: one (9 s) -> game (18 s) -> night (15 s) --------------------

export const HAND_ONE_SECONDS = 9;
/** Compatibility fallback for a missing Slate summary. The live renderer and
 * rail pass `slate.span.seconds` through `handWindowPhases`, so the artifact is
 * authoritative whenever it exists. */
export const HAND_NIGHT_SECONDS = 15;
export const HAND_ONE_END_PHASE = phaseAtWindowSecond(HAND_ONE_SECONDS);
/** The night is true-rate and must end at the shared season boundary. */
export const HAND_NIGHT_FROM_PHASE =
  BEAT_SEASON.from - phaseAtWindowSecond(HAND_NIGHT_SECONDS);
/** CLOSE-local point by which the Hand's closing inventory is fully present. */
export const HAND_INVENTORY_FULL_CLOSE_LOCAL = 0.65;
/** Completed NIGHT ground retained beneath the arriving season paint. */
export const HAND_NIGHT_GROUND_ALPHA = 0.35;

export function handWindowPhases(nightSeconds: number = HAND_NIGHT_SECONDS) {
  const nightFrom = BEAT_SEASON.from
    - phaseAtWindowSecond(Math.max(0, nightSeconds));
  return [
    { id: "one", title: "one", from: 0, to: HAND_ONE_END_PHASE },
    { id: "game", title: "the game", from: HAND_ONE_END_PHASE, to: nightFrom },
    { id: "night", title: "the night", from: nightFrom, to: BEAT_SEASON.from },
    { id: "season", title: "the season", from: BEAT_SEASON.from, to: BEAT_SEASON.to },
    { id: "close", title: "the close", from: BEAT_CLOSE.from, to: BEAT_CLOSE.to },
  ] as const satisfies readonly PhaseSpan[];
}

export const HAND_WINDOW_PHASES = handWindowPhases();

export type HandWindowPhase = (typeof HAND_WINDOW_PHASES)[number];
export type HandWindowPhaseId = HandWindowPhase["id"];

export const HAND_WINDOW_STOPS = HAND_WINDOW_PHASES.map((span) => ({
  id: span.id,
  title: span.title,
  at: span.from,
})) satisfies readonly WindowStop<HandWindowPhaseId>[];

// --- THE PLATE: evidence in a legible order --------------------------------

export const PLATE_POSSESSION_SECONDS = 5;
export const PLATE_HOLD_END_SECONDS = 10;
export const PLATE_POSSESSION_END_PHASE = phaseAtWindowSecond(PLATE_POSSESSION_SECONDS);
export const PLATE_GAME_FROM_PHASE = phaseAtWindowSecond(PLATE_HOLD_END_SECONDS);
export const PLATE_GAME_TO_PHASE = BEAT_SEASON.from;

export const PLATE_GESTURE_FROM_PHASE = BEAT_SEASON.from;
export const PLATE_GESTURE_LAST_SECONDS = 131.625;
export const PLATE_GESTURE_LAST_PHASE = phaseAtWindowSecond(PLATE_GESTURE_LAST_SECONDS);
export const PLATE_GESTURE_DRAW_SECONDS = 1.3;
export const PLATE_GESTURE_HOLD_SECONDS = 2.2;
export const PLATE_GESTURE_FADE_SECONDS = 2.4;
/** Window numeral dwell; longer than the global inscription hold. */
export const PLATE_NUMERAL_HOLD_SECONDS = 3;
export const PLATE_GESTURE_LIFE_SECONDS =
  PLATE_GESTURE_DRAW_SECONDS + PLATE_GESTURE_HOLD_SECONDS + PLATE_GESTURE_FADE_SECONDS;
export const PLATE_GESTURE_END_PHASE = phaseAtWindowSecond(
  PLATE_GESTURE_LAST_SECONDS + PLATE_GESTURE_LIFE_SECONDS,
);

export const PLATE_SHELL_FROM_PHASE = phaseAtWindowSecond(135);
export const PLATE_SHELL_FULL_PHASE = phaseAtWindowSecond(138);
export const PLATE_SHELL_SPAN = {
  id: "shell",
  title: "the record's last file",
  from: PLATE_SHELL_FROM_PHASE,
  to: PLATE_SHELL_FULL_PHASE,
} as const satisfies PhaseSpan;

/** Motion and residence leave during CLOSE and are gone when the terminal
 * shell becomes fully legible. The remaining terminal span is a true hold,
 * not a transition stretched to the season boundary. */
export const PLATE_WITHDRAW_SPAN = {
  id: "withdraw",
  title: "motion and residence withdraw",
  from: BEAT_CLOSE.from,
  to: PLATE_SHELL_FULL_PHASE,
} as const satisfies PhaseSpan;

/**
 * The trace schedule includes both endpoints: the first trace ignites when the
 * season begins and the last at the authored 131.625-second anchor. With one
 * trace the only honest position is the first anchor.
 */
export function plateGestureIgnitePhase(index: number, count: number): number {
  if (count <= 1) return PLATE_GESTURE_FROM_PHASE;
  const u = Math.min(1, Math.max(0, index / (count - 1)));
  return PLATE_GESTURE_FROM_PHASE
    + u * (PLATE_GESTURE_LAST_PHASE - PLATE_GESTURE_FROM_PHASE);
}

/** Overlapping semantic spans: the shell enters while the last gesture fades. */
export const PLATE_WINDOW_SPANS = [
  {
    id: "possession",
    title: "one possession",
    from: 0,
    to: PLATE_POSSESSION_END_PHASE,
  },
  {
    id: "hold",
    title: "the possession, held",
    from: PLATE_POSSESSION_END_PHASE,
    to: PLATE_GAME_FROM_PHASE,
  },
  {
    id: "game",
    title: "the game",
    from: PLATE_GAME_FROM_PHASE,
    to: PLATE_GAME_TO_PHASE,
  },
  {
    id: "gestures",
    title: "the gestures, one at a time",
    from: PLATE_GESTURE_FROM_PHASE,
    to: PLATE_GESTURE_END_PHASE,
  },
  {
    id: "shell",
    title: "the record's last file",
    from: PLATE_SHELL_FROM_PHASE,
    to: 1,
  },
] as const satisfies readonly PhaseSpan[];

export type PlateWindowSpan = (typeof PLATE_WINDOW_SPANS)[number];
export type PlateWindowSpanId = PlateWindowSpan["id"];

/** Presentation/navigation anchors, including events inside longer spans. */
export const PLATE_WINDOW_STOPS = [
  { id: "possession", title: "one possession", at: 0 },
  { id: "hold", title: "the possession, held", at: PLATE_POSSESSION_END_PHASE },
  { id: "game", title: "the game", at: PLATE_GAME_FROM_PHASE },
  { id: "gestures", title: "the gestures, one at a time", at: PLATE_GESTURE_FROM_PHASE },
  { id: "crest", title: "the filed record returns", at: WINDOW_CREST_PHASE },
  { id: "close", title: "the close", at: BEAT_CLOSE.from },
  { id: "last-gesture", title: "the last gesture", at: PLATE_GESTURE_LAST_PHASE },
  { id: "shell", title: "the record's last file", at: PLATE_SHELL_FROM_PHASE },
  { id: "receipt", title: "the receipt, held", at: PLATE_SHELL_FULL_PHASE },
] as const satisfies readonly WindowStop[];

// --- THE FIELD: attribution, then the shared crescendo ---------------------

export const FIELD_ATTRIBUTION_ENTER_SECONDS = 1;
export const FIELD_ATTRIBUTION_EXIT_SECONDS = 13;
export const FIELD_ATTRIBUTION_END_SECONDS = 15;

export const FIELD_WINDOW_ATTRIBUTION_SPAN = {
  id: "attribution",
  title: "the league's own zones",
  from: 0,
  to: phaseAtWindowSecond(FIELD_ATTRIBUTION_END_SECONDS),
} as const satisfies PhaseSpan;

export const FIELD_WINDOW_ATTRIBUTION_STOPS = [
  { id: "enter", title: "the attribution enters", at: 0 },
  {
    id: "hold",
    title: "the attribution holds",
    at: phaseAtWindowSecond(FIELD_ATTRIBUTION_ENTER_SECONDS),
  },
  {
    id: "exit",
    title: "the attribution leaves",
    at: phaseAtWindowSecond(FIELD_ATTRIBUTION_EXIT_SECONDS),
  },
] as const satisfies readonly WindowStop[];

export const FIELD_WINDOW_STOPS = [
  ...FIELD_WINDOW_ATTRIBUTION_STOPS,
  { id: "night", title: "the night", at: WINDOW_BEATS[1].from },
  { id: "season", title: "the season", at: BEAT_SEASON.from },
  { id: "crest", title: "the crest", at: WINDOW_CREST_PHASE },
  { id: "close", title: "the close", at: BEAT_CLOSE.from },
] as const satisfies readonly WindowStop[];

// --- THE LEDGER: write, hold, reverse-write --------------------------------

export const LEDGER_WINDOW_WRITING_FROM_PHASE = WINDOW_BEATS[1].from;
export const LEDGER_WINDOW_WRITING_TO_PHASE = WINDOW_CREST_PHASE;
export const LEDGER_WINDOW_WITHDRAW_PHASE = BEAT_CLOSE.from;

export const LEDGER_WINDOW_WRITING_SPAN = {
  id: "writing",
  title: "the published headings arrive",
  from: LEDGER_WINDOW_WRITING_FROM_PHASE,
  to: LEDGER_WINDOW_WRITING_TO_PHASE,
} as const satisfies PhaseSpan;

export const LEDGER_WINDOW_STOPS = [
  { id: "first", title: "the first heading", at: LEDGER_WINDOW_WRITING_SPAN.from },
  { id: "crest", title: "the complete ledger", at: LEDGER_WINDOW_WRITING_SPAN.to },
  { id: "withdraw", title: "the ledger withdraws", at: LEDGER_WINDOW_WITHDRAW_PHASE },
] as const satisfies readonly WindowStop[];

// --- THE MEASURE: shared beats, terminal dates inside CLOSE ----------------

export const MEASURE_CLOSE_TERMINAL_FROM = 0.35;
export const MEASURE_CLOSE_TERMINAL_TO = 0.65;

export const MEASURE_WINDOW_TERMINAL_SPAN = {
  id: "terminal-dates",
  title: "the record's two terminal dates",
  from: BEAT_CLOSE.from
    + MEASURE_CLOSE_TERMINAL_FROM * (BEAT_CLOSE.to - BEAT_CLOSE.from),
  to: BEAT_CLOSE.from
    + MEASURE_CLOSE_TERMINAL_TO * (BEAT_CLOSE.to - BEAT_CLOSE.from),
} as const satisfies PhaseSpan;

export const MEASURE_WINDOW_STOPS = [
  { id: "one", title: "one", at: WINDOW_BEATS[0].from },
  { id: "night", title: "the night", at: WINDOW_BEATS[1].from },
  { id: "season", title: "the season", at: BEAT_SEASON.from },
  { id: "crest", title: "the crest", at: WINDOW_CREST_PHASE },
  { id: "close", title: "the close", at: BEAT_CLOSE.from },
  { id: "terminal", title: "terminal dates", at: MEASURE_WINDOW_TERMINAL_SPAN.from },
] as const satisfies readonly WindowStop[];

// --- THE CENSUS: artifact-weighted filings, then MACHINE SAW ---------------

export const MACHINE_SAW_TITLE = "BODY POSITIONS THE MACHINE SAW";
export const CENSUS_FILING_MIN_SECONDS = 6;
export const CENSUS_FILING_COMPLETE = 0.65;
export const CENSUS_FILING_HOLD_TO = 0.92;
export const CENSUS_FILING_FADE = 0.08;
export const MACHINE_SAW_BUILD_SECONDS = 8;

export const CENSUS_MACHINE_SAW_SPAN = {
  id: "machine-saw",
  title: MACHINE_SAW_TITLE,
  from: BEAT_CLOSE.from,
  to: BEAT_CLOSE.to,
} as const satisfies PhaseSpan;

/** The first completed MACHINE SAW frame; CLOSE then holds it for ~20s. */
export const CENSUS_MACHINE_SAW_FULL_PHASE = Math.min(
  CENSUS_MACHINE_SAW_SPAN.to,
  CENSUS_MACHINE_SAW_SPAN.from + MACHINE_SAW_BUILD_SECONDS / WINDOW_DURATION_SECONDS,
);

export const CENSUS_MACHINE_SAW_STOP = {
  id: CENSUS_MACHINE_SAW_SPAN.id,
  title: CENSUS_MACHINE_SAW_SPAN.title,
  at: CENSUS_MACHINE_SAW_SPAN.from,
} as const satisfies WindowStop;

export interface CensusWindowFiling {
  readonly taxonomy: string;
  readonly title: string;
  readonly count: number;
}

export interface CensusWindowStop extends PhaseSpan {
  readonly taxonomy: string | null;
}

/** Divide the pre-close score from artifact counts; no renderer types enter. */
export function censusWindowStops(
  filings: readonly CensusWindowFiling[],
  durationSeconds = WINDOW_DURATION_SECONDS,
): CensusWindowStop[] {
  const duration = Math.max(Number.EPSILON, durationSeconds);
  const filingSeconds = duration * BEAT_CLOSE.from;
  const total = filings.reduce((sum, filing) => sum + filing.count, 0) || 1;
  const spare = Math.max(
    0,
    filingSeconds - CENSUS_FILING_MIN_SECONDS * filings.length,
  );
  const stops: CensusWindowStop[] = [];
  let at = 0;
  filings.forEach((filing, index) => {
    const seconds = CENSUS_FILING_MIN_SECONDS + spare * filing.count / total;
    stops.push({
      taxonomy: filing.taxonomy,
      id: filing.taxonomy,
      title: filing.title,
      from: at / duration,
      to: index === filings.length - 1 ? BEAT_CLOSE.from : (at + seconds) / duration,
    });
    at += seconds;
  });
  stops.push({
    taxonomy: null,
    id: CENSUS_MACHINE_SAW_SPAN.id,
    title: CENSUS_MACHINE_SAW_SPAN.title,
    from: CENSUS_MACHINE_SAW_SPAN.from,
    to: CENSUS_MACHINE_SAW_SPAN.to,
  });
  return stops;
}

// --- THE STACK: UI response belongs to the score too -----------------------

export const STACK_OPERATION_DURATIONS_SECONDS = {
  locate: 0.8,
  classify: 0.4,
  inscribe: 0.8,
  connect: 2,
  measure: 0.6,
  name: 0.6,
  count: 0.8,
  join: 1.2,
} as const;

export type ScoredStackOperationId = keyof typeof STACK_OPERATION_DURATIONS_SECONDS;

// --- Stable semantic addresses ---------------------------------------------

export type WindowSemanticMode =
  | "plate"
  | "field"
  | "ledger"
  | "census"
  | "measure"
  | "hand"
  | "stack";

export interface WindowSemanticStop {
  readonly id: string;
  readonly title: string;
  readonly phase: number;
  readonly mode: WindowSemanticMode | null;
}

/** Mode-specific entries precede shared aliases for the most precise CITE. */
export const WINDOW_SEMANTIC_STOPS = [
  { id: "plate.game", title: "Plate · the full game", phase: PLATE_GAME_FROM_PHASE, mode: "plate" },
  { id: "plate.gestures", title: "Plate · the gestures", phase: PLATE_GESTURE_FROM_PHASE, mode: "plate" },
  // A durable `plate.shell` address names the settled terminal composition,
  // not the first translucent entrance where the final gesture is still
  // withdrawing. The entrance remains a rail stop; the semantic bookmark is
  // the stable frame a presenter can hold.
  { id: "plate.shell", title: "Plate · the terminal shell", phase: PLATE_SHELL_FULL_PHASE, mode: "plate" },
  { id: "field.one", title: "Field · one", phase: 0, mode: "field" },
  { id: "field.attribution-hold", title: "Field · attribution held", phase: FIELD_WINDOW_ATTRIBUTION_STOPS[1].at, mode: "field" },
  { id: "field.attribution-exit", title: "Field · attribution exits", phase: FIELD_WINDOW_ATTRIBUTION_STOPS[2].at, mode: "field" },
  { id: "field.night", title: "Field · the night", phase: WINDOW_BEATS[1].from, mode: "field" },
  { id: "field.season", title: "Field · the season", phase: BEAT_SEASON.from, mode: "field" },
  { id: "field.crest", title: "Field · the crest", phase: WINDOW_CREST_PHASE, mode: "field" },
  { id: "field.close", title: "Field · the close", phase: BEAT_CLOSE.from, mode: "field" },
  { id: "ledger.night", title: "Ledger · published headings", phase: LEDGER_WINDOW_WRITING_FROM_PHASE, mode: "ledger" },
  { id: "ledger.crest", title: "Ledger · completed tableau", phase: LEDGER_WINDOW_WRITING_TO_PHASE, mode: "ledger" },
  { id: "ledger.close", title: "Ledger · withdrawal", phase: LEDGER_WINDOW_WITHDRAW_PHASE, mode: "ledger" },
  { id: "census.machine-saw-build", title: "Census · MACHINE SAW builds", phase: CENSUS_MACHINE_SAW_SPAN.from, mode: "census" },
  { id: "census.machine-saw", title: "Census · MACHINE SAW", phase: CENSUS_MACHINE_SAW_FULL_PHASE, mode: "census" },
  { id: "measure.one", title: "Measure · one", phase: WINDOW_BEATS[0].from, mode: "measure" },
  { id: "measure.crest", title: "Measure · the crest", phase: WINDOW_CREST_PHASE, mode: "measure" },
  { id: "measure.close", title: "Measure · the close", phase: BEAT_CLOSE.from, mode: "measure" },
  { id: "measure.terminal", title: "Measure · terminal dates", phase: MEASURE_WINDOW_TERMINAL_SPAN.to, mode: "measure" },
  { id: "hand.one", title: "Hand · one", phase: HAND_WINDOW_PHASES[0].from, mode: "hand" },
  { id: "hand.game", title: "Hand · the game", phase: HAND_ONE_END_PHASE, mode: "hand" },
  { id: "hand.night", title: "Hand · the night", phase: HAND_NIGHT_FROM_PHASE, mode: "hand" },
  { id: "hand.season", title: "Hand · the season", phase: BEAT_SEASON.from, mode: "hand" },
  { id: "hand.close", title: "Hand · the close", phase: BEAT_CLOSE.from, mode: "hand" },
  { id: "window.crest", title: "Window · crest", phase: WINDOW_CREST_PHASE, mode: null },
] as const satisfies readonly WindowSemanticStop[];

/** The immutable public surface integrations should consume. */
export const WINDOW_SCORE = {
  durationSeconds: WINDOW_DURATION_SECONDS,
  frameAtPhase: windowFrameAtPhase,
  shared: {
    spans: WINDOW_BEATS,
    stops: WINDOW_SHARED_STOPS,
    crestSecond: WINDOW_CREST_SECONDS,
    crestPhase: WINDOW_CREST_PHASE,
    crestLocal: WINDOW_SEASON_CREST,
    entry: WINDOW_ENTRY_SPAN,
  },
  hand: {
    spans: HAND_WINDOW_PHASES,
    spansForNight: handWindowPhases,
    stops: HAND_WINDOW_STOPS,
    inventoryFullCloseLocal: HAND_INVENTORY_FULL_CLOSE_LOCAL,
    nightGroundAlpha: HAND_NIGHT_GROUND_ALPHA,
  },
  plate: {
    spans: PLATE_WINDOW_SPANS,
    stops: PLATE_WINDOW_STOPS,
    numeralHoldSeconds: PLATE_NUMERAL_HOLD_SECONDS,
    gesture: {
      from: PLATE_GESTURE_FROM_PHASE,
      last: PLATE_GESTURE_LAST_PHASE,
      end: PLATE_GESTURE_END_PHASE,
      drawSeconds: PLATE_GESTURE_DRAW_SECONDS,
      holdSeconds: PLATE_GESTURE_HOLD_SECONDS,
      fadeSeconds: PLATE_GESTURE_FADE_SECONDS,
    },
    shell: PLATE_SHELL_SPAN,
    withdraw: PLATE_WITHDRAW_SPAN,
  },
  field: {
    spans: [FIELD_WINDOW_ATTRIBUTION_SPAN],
    stops: FIELD_WINDOW_STOPS,
    attribution: {
      span: FIELD_WINDOW_ATTRIBUTION_SPAN,
      stops: FIELD_WINDOW_ATTRIBUTION_STOPS,
      enterSeconds: FIELD_ATTRIBUTION_ENTER_SECONDS,
      exitSeconds: FIELD_ATTRIBUTION_EXIT_SECONDS,
      endSeconds: FIELD_ATTRIBUTION_END_SECONDS,
    },
  },
  ledger: {
    spans: [LEDGER_WINDOW_WRITING_SPAN],
    stops: LEDGER_WINDOW_STOPS,
    withdrawPhase: LEDGER_WINDOW_WITHDRAW_PHASE,
  },
  census: {
    stopsForFilings: censusWindowStops,
    filing: {
      minimumSeconds: CENSUS_FILING_MIN_SECONDS,
      completeLocal: CENSUS_FILING_COMPLETE,
      holdToLocal: CENSUS_FILING_HOLD_TO,
      fadeLocal: CENSUS_FILING_FADE,
    },
    machineSaw: {
      span: CENSUS_MACHINE_SAW_SPAN,
      stop: CENSUS_MACHINE_SAW_STOP,
      fullPhase: CENSUS_MACHINE_SAW_FULL_PHASE,
      buildSeconds: MACHINE_SAW_BUILD_SECONDS,
    },
  },
  measure: {
    spans: WINDOW_BEATS,
    stops: MEASURE_WINDOW_STOPS,
    terminal: {
      span: MEASURE_WINDOW_TERMINAL_SPAN,
      fromCloseLocal: MEASURE_CLOSE_TERMINAL_FROM,
      toCloseLocal: MEASURE_CLOSE_TERMINAL_TO,
    },
  },
  stack: {
    operationDurationsSeconds: STACK_OPERATION_DURATIONS_SECONDS,
  },
  semantic: {
    stops: WINDOW_SEMANTIC_STOPS,
  },
} as const;

export type WindowScore = typeof WINDOW_SCORE;
