/**
 * The player: a small panel of controls over the full work's own canvas.
 *
 * It holds no canvas context and draws nothing. The frame on screen is the
 * full work's, drawn by the same call from the same clock; the panel only
 * pauses that clock or moves it. Every move keeps the pass the clock is in
 * and changes only where in the loop it is, so a visitor changes when the
 * picture is and never which rendering draws it, and every frame the panel
 * can bring up is one the full work's own address reaches.
 *
 * `update` runs on every frame, so it writes the DOM only when a value it
 * shows has changed.
 */

import { ROTATION_PASSES } from "./modes";
import { fmt, SCRUB_COARSE_S, SCRUB_STEP_S } from "./navigator";
import { GROUND } from "./palette";
import { LOOP_END_GUARD_S, passLocal, toPass } from "./route";
import type { Schedule } from "./timeline";

/** What the panel moves: the full work's clock, and nothing else. */
export interface PlayerTransport {
  seek(seconds: number): void;
  togglePause(): void;
  isPaused(): boolean;
  position(): number;
}

/**
 * How long, in milliseconds, a dragged pointer rests on the scrub before the
 * picture follows it; a release always commits.
 *
 * The constructor writes it to `document.body.dataset.dwell`, and every move
 * reads it back from there, so the rule can be changed from the console with
 * no rebuild: zero follows every move, and `Infinity` follows on release only.
 */
export const SCRUB_DWELL_MS = 120;

/** The plate's ground as three channels, so the panel's ground can carry an
 *  alpha of its own. Parsed from `palette.ts:GROUND` the way the shots probe
 *  parses it, so the panel cannot drift from the plate. */
function groundChannels(hex: string): string {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ");
}

export class Player {
  private readonly loop: number;
  private readonly play: HTMLButtonElement;
  private readonly fill: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly scrubEl: HTMLElement;
  /** The instant under a dragged pointer, while a drag is in progress: the
   *  clock and the fill show it in place of the transport's position. */
  private dragLocal: number | null = null;
  private restTimer: number | undefined;
  private shownFill = "";
  private shownClock = "";
  private shownSecond = Number.NaN;
  private shownPaused: boolean | null = null;

  constructor(
    root: HTMLElement,
    schedule: Schedule,
    private readonly transport: PlayerTransport,
  ) {
    this.loop = schedule.duration;
    root.style.setProperty("--player-ground", groundChannels(GROUND));
    document.body.dataset.dwell = String(SCRUB_DWELL_MS);

    // The rail's glyphs and spoken names, so the panel says nothing new.
    const button = (id: string, glyph: string, name: string): HTMLButtonElement => {
      const b = root.querySelector<HTMLButtonElement>(id)!;
      b.textContent = glyph;
      b.title = name;
      b.setAttribute("aria-label", name);
      return b;
    };
    const prev = button("#player-prev", "◀◀", "previous segment");
    this.play = button("#player-play", "❚❚", "pause or resume");
    const next = button("#player-next", "▶▶", "next segment");
    this.play.title = "pause or resume (Space)";
    this.play.setAttribute("aria-keyshortcuts", "Space");
    // The panel walks no stops: these two keep the transport's shape and
    // take no press.
    prev.disabled = true;
    next.disabled = true;
    this.play.addEventListener("click", (e) => {
      this.togglePause();
      // A press from a pointer leaves no focus behind, so Space goes on
      // meaning pause rather than pressing the last thing clicked.
      if (e.detail !== 0) this.play.blur();
    });

    const scrub = root.querySelector<HTMLElement>("#player-scrub")!;
    this.scrubEl = scrub;
    this.fill = scrub.querySelector<HTMLElement>(".fill")!;
    scrub.setAttribute("aria-label", "position in the loop");
    scrub.setAttribute("aria-valuemin", "0");
    scrub.setAttribute("aria-valuemax", String(Math.round(this.loop)));
    scrub.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowUp") this.nudge(true, e.shiftKey);
      else if (e.key === "ArrowLeft" || e.key === "ArrowDown") this.nudge(false, e.shiftKey);
      else if (e.key === "Home") this.home();
      else if (e.key === "End") this.seekLocal(this.loop);
      else return;
      e.preventDefault();
    });
    // The scrub's own pointer capture, so a drag belongs to it from press to
    // release however far the pointer drifts off its strip.
    scrub.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      scrub.setPointerCapture(e.pointerId);
      this.drag(this.localAt(e));
    });
    scrub.addEventListener("pointermove", (e) => {
      if (scrub.hasPointerCapture(e.pointerId)) this.drag(this.localAt(e));
    });
    scrub.addEventListener("pointerup", (e) => {
      if (!scrub.hasPointerCapture(e.pointerId)) return;
      this.release(this.localAt(e));
      scrub.blur();
    });
    // A capture lost without a release, as when the browser takes the
    // gesture: the drag ends where it was last committed.
    scrub.addEventListener("lostpointercapture", () => this.endDrag());

    this.clock = root.querySelector<HTMLElement>("#player-clock")!;
    root.hidden = false;
  }

  /** Pause or resume: the play button, Space and a click on the canvas. */
  togglePause(): void {
    this.transport.togglePause();
    this.syncPlay();
  }

  /** Back or forward by the scrub's step, the coarse one with Shift, inside
   *  the pass on screen. */
  nudge(forward: boolean, coarse: boolean): void {
    const step = coarse ? SCRUB_COARSE_S : SCRUB_STEP_S;
    this.seekLocal(this.localNow() + (forward ? step : -step));
  }

  /** The start of the pass on screen. */
  home(): void {
    this.seekLocal(0);
  }

  /** Called every frame. */
  update(t: number): void {
    const local = this.dragLocal ?? passLocal(t, this.loop, ROTATION_PASSES).local;
    const fill = `${(local / this.loop) * 100}%`;
    if (fill !== this.shownFill) {
      this.shownFill = fill;
      this.fill.style.width = fill;
    }
    const clock = `${fmt(local)} / ${fmt(this.loop)}`;
    if (clock !== this.shownClock) {
      this.shownClock = clock;
      this.clock.textContent = clock;
    }
    const second = Math.floor(local);
    if (second !== this.shownSecond) {
      this.shownSecond = second;
      this.scrubEl.setAttribute("aria-valuenow", String(second));
      this.scrubEl.setAttribute("aria-valuetext", fmt(local));
    }
    this.syncPlay();
  }

  /**
   * The one way the panel moves the clock: to `local` in the pass the clock is
   * in now. The lift lands on `local` and never a hair before it, and holds it
   * short of the loop's end, so no seek leaves its pass or its rendering.
   */
  private seekLocal(local: number): void {
    const { pass } = passLocal(this.transport.position(), this.loop, ROTATION_PASSES);
    this.transport.seek(toPass(pass, local, this.loop, LOOP_END_GUARD_S));
  }

  private localNow(): number {
    return passLocal(this.transport.position(), this.loop, ROTATION_PASSES).local;
  }

  private localAt(e: PointerEvent): number {
    const r = this.scrubEl.getBoundingClientRect();
    const p = r.width > 0 ? (e.clientX - r.left) / r.width : 0;
    return Math.min(1, Math.max(0, p)) * this.loop;
  }

  /** The rest a drag waits before it commits: the body's `dwell`, or the
   *  default where that is not a number of milliseconds. */
  private dwell(): number {
    const ms = Number(document.body.dataset.dwell);
    return ms >= 0 ? ms : SCRUB_DWELL_MS;
  }

  private drag(local: number): void {
    this.dragLocal = local;
    window.clearTimeout(this.restTimer);
    const dwell = this.dwell();
    if (dwell === 0) this.seekLocal(local);
    else if (Number.isFinite(dwell)) {
      this.restTimer = window.setTimeout(() => this.seekLocal(local), dwell);
    }
  }

  private release(local: number): void {
    this.endDrag();
    this.seekLocal(local);
  }

  private endDrag(): void {
    window.clearTimeout(this.restTimer);
    this.dragLocal = null;
  }

  private syncPlay(): void {
    const paused = this.transport.isPaused();
    if (paused === this.shownPaused) return;
    this.shownPaused = paused;
    this.play.textContent = paused ? "▶" : "❚❚";
    this.play.setAttribute("aria-pressed", String(paused));
  }
}
