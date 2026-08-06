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

export function exhibitClock(startedAt: number, offset = 0): Clock {
  return { mode: "exhibit", at: (now) => offset + (now - startedAt) / 1000 };
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
  private paused = false;
  private fermata = false;
  /** Eased 0..1 multiplier on the passage of time. */
  private rate = 1;

  constructor(offset = 0) {
    this.position = offset;
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

  get held(): boolean {
    return this.paused;
  }

  togglePause(): void {
    this.paused = !this.paused;
  }

  toggleFermata(): void {
    this.fermata = !this.fermata;
  }

  /** Jumps always land moving, so a seek can never strand the piece. */
  seek(seconds: number): void {
    this.position = seconds;
    this.paused = false;
    this.fermata = false;
    this.rate = 1;
  }

  nudge(seconds: number): void {
    this.position += seconds;
  }
}
