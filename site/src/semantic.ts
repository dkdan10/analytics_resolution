/** Stable, human-readable addresses into the Window score. */

import type { ModeId } from "./modes";
import { WINDOW_YEAR, type Schedule } from "./timeline";
import {
  handWindowPhases,
  WINDOW_SEMANTIC_STOPS,
  type WindowSemanticStop,
} from "./window-score";

/** Compatibility name retained for presenter and navigation callers. */
export type SemanticStop = WindowSemanticStop;

/** Mode-specific entries precede shared aliases so CITE chooses the most
 * descriptive address for the hand on screen. */
export const SEMANTIC_STOPS: readonly SemanticStop[] = WINDOW_SEMANTIC_STOPS;

export function semanticStopById(id: string | null): SemanticStop | null {
  if (!id) return null;
  return SEMANTIC_STOPS.find((stop) => stop.id === id) ?? null;
}

/** Resolve the one artifact-derived semantic boundary without changing the
 * stable stop registry. Shipped Slate metadata is authoritative for Hand NIGHT
 * in the renderer, rail, overview, probes, and durable URLs alike. */
export function semanticPhase(stop: SemanticStop, handNightSeconds?: number): number {
  if (stop.id === "hand.night" && Number.isFinite(handNightSeconds)) {
    return handWindowPhases(handNightSeconds)[2].from;
  }
  return stop.phase;
}

export function semanticTime(
  stop: SemanticStop,
  schedule: Schedule,
  handNightSeconds?: number,
): number | null {
  const window = schedule.byYear.get(WINDOW_YEAR);
  return window
    ? window.start + semanticPhase(stop, handNightSeconds) * window.duration
    : null;
}

export function semanticAt(
  time: number,
  mode: ModeId,
  schedule: Schedule,
  handNightSeconds?: number,
  toleranceSeconds = 0.075,
): SemanticStop | null {
  for (const stop of SEMANTIC_STOPS) {
    if (stop.mode !== null && stop.mode !== mode) continue;
    const at = semanticTime(stop, schedule, handNightSeconds);
    if (at !== null && Math.abs(time - at) <= toleranceSeconds) return stop;
  }
  return null;
}
