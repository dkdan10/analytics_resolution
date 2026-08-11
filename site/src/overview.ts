/** The separate 96-second guided entry.
 *
 * It does not alter the canonical score. Each chapter samples a named semantic
 * Window stop through the same renderer used by the full work; this module only
 * maps overview time to canonical time, hand and a one-second crossfade.
 */

import type { ModeId } from "./modes";
import { semanticStopById, semanticTime } from "./semantic";
import { ACT0_SECONDS, CODA_SECONDS, type Schedule } from "./timeline";

export const OVERVIEW_INTRO_SECONDS = 6;
export const OVERVIEW_CHAPTER_SECONDS = 14;
export const OVERVIEW_CODA_SECONDS = 6;
export const OVERVIEW_CROSSFADE_SECONDS = 1;

export const OVERVIEW_CHAPTERS = [
  { stop: "plate.game", mode: "plate", title: "THE PLATE · THE GAME" },
  { stop: "field.season", mode: "field", title: "THE FIELD · THE SEASON" },
  { stop: "ledger.crest", mode: "ledger", title: "THE LEDGER · THE CREST" },
  { stop: "census.machine-saw-build", mode: "census", title: "THE CENSUS · MACHINE SAW" },
  { stop: "measure.one", mode: "measure", title: "THE MEASURE · ONE" },
  { stop: "hand.night", mode: "hand", title: "THE HAND · THE NIGHT" },
] as const satisfies readonly { stop: string; mode: ModeId; title: string }[];

export const OVERVIEW_SECONDS =
  OVERVIEW_INTRO_SECONDS
  + OVERVIEW_CHAPTERS.length * OVERVIEW_CHAPTER_SECONDS
  + OVERVIEW_CODA_SECONDS;

export interface OverviewSample {
  time: number;
  mode: ModeId | null;
}

export interface OverviewFrame {
  current: OverviewSample;
  previous: OverviewSample | null;
  mix: number;
  title: string;
  section: "intro" | "chapter" | "coda";
  elapsed: number;
}

function smoothstep(x: number): number {
  const p = Math.min(1, Math.max(0, x));
  return p * p * (3 - 2 * p);
}

function chapterAnchor(
  index: number,
  schedule: Schedule,
  handNightSeconds?: number,
): number {
  const chapter = OVERVIEW_CHAPTERS[index]!;
  const stop = semanticStopById(chapter.stop);
  return stop ? semanticTime(stop, schedule, handNightSeconds) ?? 0 : 0;
}

export function overviewAt(
  seconds: number,
  schedule: Schedule,
  handNightSeconds?: number,
): OverviewFrame {
  const elapsed = ((seconds % OVERVIEW_SECONDS) + OVERVIEW_SECONDS) % OVERVIEW_SECONDS;
  if (elapsed < OVERVIEW_INTRO_SECONDS) {
    return {
      current: { time: (elapsed / OVERVIEW_INTRO_SECONDS) * ACT0_SECONDS, mode: "plate" },
      previous: null,
      mix: 1,
      title: "FADEAWAY · AN OVERVIEW",
      section: "intro",
      elapsed,
    };
  }

  const chapterElapsed = elapsed - OVERVIEW_INTRO_SECONDS;
  const chapterTotal = OVERVIEW_CHAPTERS.length * OVERVIEW_CHAPTER_SECONDS;
  if (chapterElapsed < chapterTotal) {
    const index = Math.floor(chapterElapsed / OVERVIEW_CHAPTER_SECONDS);
    const local = chapterElapsed - index * OVERVIEW_CHAPTER_SECONDS;
    const chapter = OVERVIEW_CHAPTERS[index]!;
    const anchor = chapterAnchor(index, schedule, handNightSeconds);
    let previous: OverviewSample;
    if (index === 0) {
      previous = { time: ACT0_SECONDS, mode: "plate" };
    } else {
      const prior = OVERVIEW_CHAPTERS[index - 1]!;
      previous = {
        time: chapterAnchor(index - 1, schedule, handNightSeconds) + OVERVIEW_CHAPTER_SECONDS,
        mode: prior.mode,
      };
    }
    return {
      current: { time: anchor + local, mode: chapter.mode },
      previous,
      mix: smoothstep(local / OVERVIEW_CROSSFADE_SECONDS),
      title: chapter.title,
      section: "chapter",
      elapsed,
    };
  }

  const local = chapterElapsed - chapterTotal;
  const prior = OVERVIEW_CHAPTERS[OVERVIEW_CHAPTERS.length - 1]!;
  return {
    current: {
      time: schedule.lastEnds + (local / OVERVIEW_CODA_SECONDS) * CODA_SECONDS,
      mode: "hand",
    },
    previous: {
      time: chapterAnchor(
        OVERVIEW_CHAPTERS.length - 1,
        schedule,
        handNightSeconds,
      ) + OVERVIEW_CHAPTER_SECONDS,
      mode: prior.mode,
    },
    mix: smoothstep(local / OVERVIEW_CROSSFADE_SECONDS),
    title: "THE FULL WORK CONTINUES",
    section: "coda",
    elapsed,
  };
}
