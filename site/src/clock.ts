/** Two modes, one function.
 *
 * Exhibit and talk differ only in how the float advances: a wall clock, or a
 * pair of hands. Neither can produce a state the other cannot, which is the
 * point - the gallery loop and the symposium performance are the same work.
 */

export type Mode = "exhibit" | "talk";

export interface Clock {
  mode: Mode;
  /** Seconds into the loop at wall-time `now` (ms). */
  at(now: number): number;
}

/** The wall clock anchors on the first frame it is asked for, not on load: a
 *  tab opened in the background gets no animation frames, so anchoring at load
 *  would return the viewer to the middle of the piece. Elapsed time is clamped
 *  at zero so the first frame can never wrap to the coda. */
export function exhibitClock(offset = 0): Clock {
  let startedAt: number | null = null;
  return {
    mode: "exhibit",
    at: (now) => {
      startedAt ??= now;
      return offset + Math.max(0, now - startedAt) / 1000;
    },
  };
}

/** Seconds the fermata takes to draw the drift to a stop, and to release it. */
const FERMATA_EASE = 1.6;

/**
 * Talk mode: the presenter conducts.
 *
 * Every control is a toggle. Nothing depends on a key being held, because a
 * dropped keyup would freeze the piece mid-talk with no way back - the failure
 * is silent, looks like a crash from the audience, and cannot be explained from
 * the lectern. The fermata's character lives in its easing, not its mechanics.
 */
export class TalkClock implements Clock {
  readonly mode = "talk";
  private position = 0;
  private lastNow: number | null = null;
  private paused: boolean;
  private fermata = false;
  /** Eased 0..1 multiplier on the passage of time. */
  private rate = 1;

  constructor(offset = 0, startPaused = false) {
    this.position = offset;
    this.paused = startPaused;
  }

  at(now: number): number {
    if (this.lastNow === null) this.lastNow = now;
    const dt = Math.min(0.25, (now - this.lastNow) / 1000);
    this.lastNow = now;

    const target = this.fermata ? 0 : 1;
    if (this.rate !== target) {
      const step = dt / FERMATA_EASE;
      this.rate = target > this.rate
        ? Math.min(target, this.rate + step)
        : Math.max(target, this.rate - step);
    }

    if (!this.paused) {
      // Smootherstep on the rate so the ritard has weight at both ends.
      const r = this.rate * this.rate * (3 - 2 * this.rate);
      this.position += dt * r;
    }
    return this.position;
  }

  /** Read the position without advancing it. `at()` mutates - calling it from a
   *  button handler would step the clock an extra frame on every click. */
  get seconds(): number {
    return this.position;
  }

  get held(): boolean {
    return this.paused;
  }

  /** Space always means "go", whatever stopped the piece. If it only cleared
   *  the pause it would appear dead after a fermata, and the presenter would be
   *  pressing the obvious key while nothing moved. */
  togglePause(): void {
    if (this.paused || this.fermata) {
      this.paused = false;
      this.fermata = false;
      return;
    }
    this.paused = true;
  }

  toggleFermata(): void {
    this.fermata = !this.fermata;
    if (!this.fermata) this.paused = false;
  }

  get inFermata(): boolean {
    return this.fermata;
  }

  /** Jumps move the playhead; they do not decide whether the piece is running.
   *  An explicit pause survives a seek, so the rail can step and scrub through a
   *  held frame exactly as `,`/`.` already do. The fermata does not survive: it
   *  is an ease out of the frame it was called on, so a jump lands at full rate
   *  and can never leave the piece drifting for reasons nobody chose. */
  seek(seconds: number): void {
    this.position = seconds;
    this.fermata = false;
    this.rate = 1;
  }

  nudge(seconds: number): void {
    this.position += seconds;
  }
}
