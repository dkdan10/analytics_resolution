/**
 * The player: a small panel of controls over the full work's own canvas.
 *
 * It holds no canvas context and draws nothing. The frame on screen is the
 * full work's, drawn by the same call from the same clock; the panel only
 * pauses that clock or moves it. The full work draws each rendering in a pass
 * of its own, so a name moves the clock to the same instant in that
 * rendering's pass, and every other move keeps the pass the clock is in and
 * changes only where in the loop it is. Either way a visitor changes when the
 * picture is, and every frame the panel can bring up is one the full work's
 * own address reaches.
 *
 * `update` runs on every frame, so it writes the DOM only when a value it
 * shows has changed.
 */

import type { Loaded } from "./data";
import {
  MODE_TITLES,
  modeAt,
  passOfMode,
  ROTATION_PASSES,
  rotationModes,
  type ModeId,
} from "./modes";
import { fmt, Navigator, SCRUB_COARSE_S, SCRUB_STEP_S, windowSubStops } from "./navigator";
import { GROUND } from "./palette";
import {
  LOOP_END_GUARD_S,
  passLocal,
  STOP_TOLERANCE_S,
  stepFrom,
  toPass,
  wrapLoop,
} from "./route";
import { ACT_TITLES, stateAt, WINDOW_YEAR, type Schedule } from "./timeline";

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

/** The panel's heading, which also names the group of names. */
const RENDERINGS = "RENDERINGS";
/** The keys, said in the rail's own words for them, each key with its word.
 *  Each is set in a span the line may not break inside, so a narrow panel
 *  never leaves a key at the end of one line and its word on the next. */
const KEY_LINE = ["SPACE PAUSE", "←→ SCRUB", ", . STOPS"];

/** The plate's ground as three channels, so the panel's ground can carry an
 *  alpha of its own. Parsed from `palette.ts:GROUND` the way the shots probe
 *  parses it, so the panel cannot drift from the plate. */
function groundChannels(hex: string): string {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ");
}

/** How many lines the title has: the act, the season, and the stop inside the
 *  window. */
const TITLE_LINES = 3;

/** A press that does `fn`. A press from a pointer leaves no focus behind, so
 *  Space goes on meaning pause rather than pressing the last thing clicked. */
function onPress(el: HTMLButtonElement, fn: () => void): void {
  el.addEventListener("click", (e) => {
    fn();
    if (e.detail !== 0) el.blur();
  });
}

export class Player {
  private readonly loop: number;
  private readonly play: HTMLButtonElement;
  private readonly fill: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly scrubEl: HTMLElement;
  /** The renderings' names, in the order the full work plays them. */
  private readonly names: { id: ModeId; el: HTMLButtonElement }[] = [];
  /** The title's lines: the act, the season, and the stop inside the window. */
  private readonly titleLines: HTMLElement[] = [];
  /** The instant under a dragged pointer, while a drag is in progress: the
   *  clock, the fill and the title show it in place of the transport's
   *  position. */
  private dragLocal: number | null = null;
  private restTimer: number | undefined;
  private shownFill = "";
  private shownClock = "";
  private shownSecond = Number.NaN;
  private shownPaused: boolean | null = null;
  private shownMode: ModeId | null = null;
  private readonly shownTitle: string[] = [];

  constructor(
    root: HTMLElement,
    private readonly schedule: Schedule,
    private readonly data: Loaded,
    private readonly transport: PlayerTransport,
  ) {
    this.loop = schedule.duration;
    root.style.setProperty("--player-ground", groundChannels(GROUND));
    document.body.dataset.dwell = String(SCRUB_DWELL_MS);

    // The heading is hidden from assistive technology because the group it
    // heads carries the same word as its name.
    const heading = root.querySelector<HTMLElement>("#player-heading")!;
    heading.textContent = RENDERINGS;
    heading.setAttribute("aria-hidden", "true");
    root.querySelector<HTMLElement>("#player-keys")!.replaceChildren(...KEY_LINE.flatMap((words, i) => {
      const key = document.createElement("span");
      key.textContent = words;
      return i === 0 ? [key] : [" · ", key];
    }));

    // The renderings by the names the piece gives them, in the order the full
    // work plays them; THE STACK is in no pass, so it has no name here. A
    // radio group: one tab stop, the arrows move between the names and pick as
    // they go, and the name checked is the rendering on screen.
    const modes = root.querySelector<HTMLElement>("#player-modes")!;
    modes.setAttribute("aria-label", RENDERINGS);
    for (const id of rotationModes()) {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", "false");
      b.tabIndex = -1;
      b.textContent = MODE_TITLES[id].toUpperCase();
      onPress(b, () => this.pick(id));
      modes.append(b);
      this.names.push({ id, el: b });
    }
    modes.addEventListener("keydown", (e) => {
      // A chord is the browser's: with a modifier the arrows are its own
      // shortcuts, going back a page among them.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (dir === 0) return;
      e.preventDefault();
      // Nothing held: each pick is a seek, and the player's keys answer one
      // press at a time.
      if (e.repeat) return;
      const n = this.names.length;
      const at = Math.max(0, this.names.findIndex((name) => name.el === document.activeElement));
      const to = this.names[(at + dir + n) % n]!;
      this.pick(to.id);
      to.el.focus();
    });

    // The lines carry no class: the rail's stylesheet already owns the one a
    // line for the act would take.
    const title = root.querySelector<HTMLElement>("#player-title")!;
    for (let i = 0; i < TITLE_LINES; i++) {
      const line = document.createElement("div");
      title.append(line);
      this.titleLines.push(line);
      this.shownTitle.push("");
    }

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
    onPress(prev, () => this.step(false));
    onPress(this.play, () => this.togglePause());
    onPress(next, () => this.step(true));

    const scrub = root.querySelector<HTMLElement>("#player-scrub")!;
    this.scrubEl = scrub;
    this.fill = scrub.querySelector<HTMLElement>(".fill")!;
    scrub.setAttribute("aria-label", "position in the loop");
    scrub.setAttribute("aria-valuemin", "0");
    scrub.setAttribute("aria-valuemax", String(Math.round(this.loop)));
    scrub.addEventListener("keydown", (e) => {
      // A chord is the browser's here too; Shift alone is the coarse step.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
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

    // The panel's height, for the stylesheet: docked along the bottom edge,
    // the doors and the credit stand on top of it, however many rows its
    // names wrap to.
    new ResizeObserver(() => {
      const h = Math.ceil(root.getBoundingClientRect().height);
      document.body.style.setProperty("--player-height", `${h}px`);
    }).observe(root);
    root.hidden = false;
  }

  /** Pause or resume: the play button, Space and a click on the canvas. */
  togglePause(): void {
    this.transport.togglePause();
    this.syncPlay();
  }

  /**
   * Show the same instant in another rendering: the clock moves to that
   * rendering's pass and keeps where in the loop it is. The prelude draws the
   * same picture in every pass, so there a name moves to the start of the
   * first season in that pass instead, and a press always changes the picture.
   */
  pick(id: ModeId): void {
    const now = this.transport.position();
    const first = this.schedule.segments[0];
    const local = stateAt(now, this.schedule).act === 0 && first
      ? first.start
      : wrapLoop(now, this.loop);
    this.transport.seek(toPass(passOfMode(id), local, this.loop, LOOP_END_GUARD_S));
  }

  /** The rendering after the one on screen, in the full work's order, the
   *  last one followed by the first. */
  nextRendering(): void {
    const order = rotationModes();
    const now = modeAt(this.transport.position(), this.schedule, null);
    this.pick(order[(order.indexOf(now) + 1) % order.length]!);
  }

  /**
   * On to the next stop, or back to the one before, inside the pass on screen.
   * The stops are the ones the rail's step buttons walk for the rendering on
   * screen, the window's own interior included, and the walk goes by index as
   * the rail's does.
   */
  step(forward: boolean): void {
    const mode = modeAt(this.transport.position(), this.schedule, null);
    const starts = Navigator.starts(this.schedule, this.data, mode);
    this.seekLocal(stepFrom(starts, this.localNow(), forward ? 1 : -1, STOP_TOLERANCE_S));
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
    // The name is checked here, with the frame it names, and not when it is
    // pressed. A drag stays in its pass, so the rendering is the clock's own.
    const mode = modeAt(t, this.schedule, null);
    this.syncModes(mode);
    const lines = this.titleAt(local, mode);
    lines.forEach((line, i) => {
      if (line === this.shownTitle[i]) return;
      this.shownTitle[i] = line;
      this.titleLines[i]!.textContent = line;
    });
    this.syncPlay();
  }

  /**
   * The title for an instant: the act; the season, or the words the full
   * work's context label uses where there is none; and inside the window, the
   * stop of the rendering on screen that the instant has reached.
   */
  private titleAt(local: number, mode: ModeId): string[] {
    const st = stateAt(local, this.schedule);
    const season = st.year === null
      ? "NO COORDINATES"
      : this.data.byYear.get(st.year)?.season ?? String(st.year);
    let stop = "";
    if (st.year === WINDOW_YEAR) {
      for (const s of windowSubStops(mode, this.schedule, this.data)) {
        if (s.at <= local + STOP_TOLERANCE_S) stop = s.title;
      }
    }
    return [ACT_TITLES[st.act], season, stop].map((line) => line.toUpperCase());
  }

  /** Check the name of the rendering on screen and make it the group's one
   *  tab stop. */
  private syncModes(mode: ModeId): void {
    if (mode === this.shownMode) return;
    this.shownMode = mode;
    for (const { id, el } of this.names) {
      el.setAttribute("aria-checked", String(id === mode));
      el.tabIndex = id === mode ? 0 : -1;
    }
  }

  /**
   * The one way the panel moves the clock inside a pass: to `local` in the
   * pass the clock is in now. The lift lands on `local` and never a hair
   * before it, and holds it short of the loop's end, so no seek leaves its
   * pass or its rendering.
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
