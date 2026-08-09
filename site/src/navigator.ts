/** The side rail: a way to walk the piece.
 *
 * Deliberately absent from exhibit mode - the gallery loop shows nothing that
 * looks like it wants to be touched. This is the working and lectern instrument:
 * every segment listed, any of them one click away, transport for stepping and
 * rewinding, and a scrub for everything in between.
 *
 * It lists what the piece is made of rather than raw times: each season with the
 * mid-range share the plate is about to strike, and a mark on the seasons where
 * the record's own resolution changes.
 */

import { factExternal, type FactsFile, type Loaded, type Season } from "./data";
import {
  ALL_OPS,
  has,
  OPERATIONS,
  type OpId,
  type Operation,
  type StackOps,
} from "./modes/operations";
import { ACT_TITLES, CUT_YEAR, stateAt, WINDOW_BEATS, WINDOW_YEAR, type Act, type Schedule } from "./timeline";

export interface Transport {
  seek(seconds: number): void;
  nudgeSegment(direction: -1 | 1): void;
  togglePause(): void;
  isPaused(): boolean;
  position(): number;
  /** Which hand is drawing right now. */
  mode(): string;
  /** Step to the next hand, pinning it; wraps back to letting the loop rotate. */
  cycleMode(): void;
  /** THE STACK's operation mask, and whether the panel that drives it applies. */
  stack(): StackOps;
  isStack(): boolean;
  toggleOp(id: OpId): void;
  allRenderings(): void;
}

interface Row {
  el: HTMLElement;
  /** null for Act 0, which has no season. */
  year: number | null;
  start: number;
}

function fmt(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Arrow keys on the scrub, and Shift for the coarse step. Presenter comfort,
 *  not material: nothing here reaches a mark. */
const SCRUB_STEP_S = 2;
const SCRUB_COARSE_S = 15;

/** The keys, said in the rail. A shortcut nobody is told about is not one. */
const KEY_HINTS = [
  "SPACE PAUSE · F FERMATA · H HAND",
  "0 START · 1-5 ACTS · 6-9 WINDOW BEATS",
  "W WINDOW · , . SEASON · ←→ SCRUB",
];

/**
 * What an operation's own artifact says the thing it reads IS.
 *
 * Read out of `data/processed/` at run time and never written here. Two reasons,
 * and the second is the one that generalises: a sentence copied into source goes
 * stale exactly the way a number does, and `window.json` and `paint.json` both
 * ship a `definitions` block precisely so a renderer does not have to author
 * one. Where the artifact has not been generated — `paint.json` and
 * `window.json` are both optional stages and the piece runs without them — the
 * row says the stage is absent rather than inventing a definition for it.
 */
function definitionOf(data: Loaded, op: Operation): string {
  const [file, key] = op.definition;
  const block =
    file === "seasons" ? data.seasonDefinitions
      : file === "window" ? data.window?.definitions
        : data.paint?.definitions;
  return block?.[key] ?? `${file}.json has not been generated`;
}

export class Navigator {
  private rows: Row[] = [];
  private current: Row | null = null;
  private fill: HTMLElement;
  private clockEl: HTMLElement;
  private handEl!: HTMLElement;
  private playBtn: HTMLButtonElement;
  private scrubEl!: HTMLElement;
  private shownSecond = -1;
  /** THE STACK's panel: hidden unless THE STACK is the hand now drawing. */
  private stackEl!: HTMLElement;
  private opBtns: { op: Operation; el: HTMLButtonElement; glyph: HTMLElement }[] = [];
  private allBtn!: HTMLButtonElement;
  private shownOps = -1;

  /** The scrolling list. The transport lives outside it, because a rail that
   *  scrolls its own controls off the top leaves the presenter with no mouse
   *  at exactly the point in the run they are furthest from the start. */
  private list!: HTMLElement;

  constructor(
    root: HTMLElement,
    private schedule: Schedule,
    seasons: Season[],
    private transport: Transport,
    data: Loaded,
  ) {
    const facts: FactsFile = data.facts;
    root.hidden = false;
    root.innerHTML = "";

    const head = document.createElement("div");
    head.id = "nav-head";
    root.append(head);

    const title = document.createElement("h1");
    title.textContent = "FADEAWAY";
    head.append(title);

    const meta = document.createElement("p");
    meta.className = "meta";
    meta.textContent = `${seasons.length} seasons · ${fmt(schedule.duration)} loop`;
    head.append(meta);

    // Glyph-only controls with a `title` are a mouse affordance and nothing
    // else: no name for a screen reader, no focus ring, nothing a presenter can
    // reach without leaving the keyboard (audit V-09). Every control in the rail
    // is now a real button with a spoken name, and the stylesheet gives all of
    // them a visible `:focus-visible` ring.
    const bar = document.createElement("div");
    bar.className = "transport";
    const mk = (glyph: string, name: string, key: string, fn: () => void) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = glyph;
      b.title = key ? `${name} (${key})` : name;
      b.setAttribute("aria-label", name);
      if (key) b.setAttribute("aria-keyshortcuts", key);
      b.addEventListener("click", fn);
      bar.append(b);
      return b;
    };
    mk("|◀", "back to the start", "0", () => this.transport.seek(0));
    mk("◀◀", "previous segment", "", () => this.transport.nudgeSegment(-1));
    this.playBtn = mk("❚❚", "pause or resume", "Space", () => {
      this.transport.togglePause();
      this.syncPlay();
    });
    mk("▶▶", "next segment", "", () => this.transport.nudgeSegment(1));
    head.append(bar);

    // A slider a presenter can actually reach: focusable, named, and arrow-key
    // driven. It was a bare div with pointer handlers, so the only way to scrub
    // was to find it with a mouse.
    const scrub = document.createElement("div");
    scrub.id = "scrub";
    scrub.tabIndex = 0;
    scrub.setAttribute("role", "slider");
    scrub.setAttribute("aria-label", "position in the loop");
    scrub.setAttribute("aria-valuemin", "0");
    scrub.setAttribute("aria-valuemax", String(Math.round(schedule.duration)));
    this.scrubEl = scrub;
    this.fill = document.createElement("div");
    this.fill.className = "fill";
    scrub.append(this.fill);
    scrub.addEventListener("keydown", (e) => {
      const now = this.wrapped(this.transport.position());
      const step = e.shiftKey ? SCRUB_COARSE_S : SCRUB_STEP_S;
      let to: number | null = null;
      if (e.key === "ArrowRight" || e.key === "ArrowUp") to = now + step;
      else if (e.key === "ArrowLeft" || e.key === "ArrowDown") to = now - step;
      else if (e.key === "Home") to = 0;
      else if (e.key === "End") to = this.schedule.duration - 0.01;
      if (to === null) return;
      e.preventDefault();
      // Never land on exactly `duration`: it wraps to zero and throws the
      // presenter back to the start when they meant to reach the end.
      this.transport.seek(Math.min(Math.max(0, to), this.schedule.duration - 0.01));
    });
    const scrubTo = (e: PointerEvent) => {
      const r = scrub.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      // Never seek to exactly `duration`: that wraps to zero and jumps the
      // piece to the start when the presenter meant to reach the end.
      this.transport.seek(Math.min(p * this.schedule.duration, this.schedule.duration - 0.01));
    };
    // Pointer capture, so the gesture belongs to the bar from press to release:
    // a 3px strip is left within a pixel of vertical drift, and gating on
    // "some button is down" let any drag crossing the bar steal the playhead.
    scrub.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      scrub.setPointerCapture(e.pointerId);
      scrubTo(e);
    });
    scrub.addEventListener("pointermove", (e) => {
      if (scrub.hasPointerCapture(e.pointerId)) scrubTo(e);
    });
    head.append(scrub);

    this.clockEl = document.createElement("div");
    this.clockEl.id = "clock";
    head.append(this.clockEl);

    // Which hand is drawing. Click or press to pin one, through to hand it back
    // to the loop - the same record, rendered several ways, is the argument.
    const handBtn = document.createElement("button");
    handBtn.type = "button";
    handBtn.id = "hand";
    handBtn.title = "the hand now drawing — change it (H)";
    handBtn.setAttribute("aria-label", "the hand now drawing; change it");
    handBtn.setAttribute("aria-keyshortcuts", "H");
    handBtn.addEventListener("click", () => this.transport.cycleMode());
    this.handEl = handBtn;
    head.append(handBtn);

    // The keys exist and nothing said so. A presenter who has to be told the
    // shortcuts out of band does not have them.
    const keys = document.createElement("div");
    keys.id = "keys";
    for (const line of KEY_HINTS) {
      const p = document.createElement("p");
      p.textContent = line;
      keys.append(p);
    }
    head.append(keys);

    // OUTSIDE the head, and this is V-09's lesson rather than a layout taste.
    // The head is `flex: 0 0 auto`, so anything put in it takes its full height
    // out of the rail: the first build of this panel pushed the whole segment
    // list off the bottom, which is the same failure as a transport that
    // scrolls itself away — the presenter loses the controls exactly when they
    // need them. It scrolls in its own region now, and the transport above and
    // the segments below both keep their room.
    root.append(this.buildStack(data));

    this.list = document.createElement("div");
    this.list.id = "nav-list";
    root.append(this.list);

    // The closing year is the first season the record holds; the opening one is
    // the league's founding, the one date no dump can supply - which is Act 0.
    // Same key the plate reads, so the rail cannot disagree with the slug.
    const founded = factExternal<number>(facts, "league_founded");
    this.addRow("Counts", null, 0, "act");
    this.rows.push({
      el: this.addSeg(`${founded} — ${seasons[0]?.year ?? ""}`, "no coordinates", null, 0, ""),
      year: null,
      start: 0,
    });

    const byYear = new Map(seasons.map((s) => [s.year, s]));
    let act: Act | null = null;
    for (const seg of schedule.segments) {
      if (seg.act !== act) {
        act = seg.act;
        this.addRow(ACT_TITLES[act], null, seg.start, "act");
      }
      const season = byYear.get(seg.year);
      const share = season ? `${(100 * season.mid_share).toFixed(1)}%` : "";
      // A mark where the record's own resolution turns over, and on the window.
      let mark = "";
      let cls = "";
      if (seg.year === WINDOW_YEAR) {
        mark = "◆";
        cls = "window";
      } else if (seg.year === CUT_YEAR) {
        mark = "▲";
        cls = "cut";
      }
      const el = this.addSeg(season?.season ?? String(seg.year), share, mark, seg.start, cls);
      this.rows.push({ el, year: seg.year, start: seg.start });

      // The window is dilated far past any other season and moves through
      // distinct beats, so it gets the only sub-list in the rail: a presenter
      // should be able to reach "the instant" directly rather than scrubbing.
      if (seg.year === WINDOW_YEAR) {
        for (const b of WINDOW_BEATS) {
          const at = seg.start + b.from * seg.duration;
          this.rows.push({
            el: this.addSeg(b.title, `${fmt(b.to * seg.duration - b.from * seg.duration)}`,
              null, at, "beat"),
            year: null,
            start: at,
          });
        }
      }
    }
    this.addRow("Coda", null, schedule.lastEnds, "act");
    this.rows.push({
      el: this.addSeg("the plate empties", "", null, schedule.lastEnds, ""),
      year: null,
      start: schedule.lastEnds,
    });
  }

  /**
   * THE STACK's panel: seven operations, each declaring what it reads.
   *
   * WHAT KEEPS THIS FROM BEING THE SETTINGS PANEL THE AUDIT REFUSED. Every row
   * names an ACT performed on a record rather than a renderer or a visual
   * effect, and every row carries the artifact key it reads and the sentence
   * that artifact ships defining it. A viewer reading this panel is reading a
   * list of interpretations, with their sources — which is the argument, not a
   * preferences dialog with better labels.
   *
   * BUILT ONCE AND HIDDEN, rather than built on demand: the rail is constructed
   * once and `update()` only touches the DOM when something moved, which is the
   * discipline the rest of this file keeps. Only the state glyphs and the
   * hidden flag change per frame, and only when they actually differ.
   *
   * Real buttons throughout, with `aria-pressed` and `aria-keyshortcuts` — the
   * idiom V-09 established, and for its reason: the transport used to be
   * glyph-only divs that no keyboard could reach, and a new panel of clickable
   * divs would put that back one session after it was fixed.
   */
  private buildStack(data: Loaded): HTMLElement {
    const box = document.createElement("div");
    box.id = "stack";
    box.hidden = true;

    const title = document.createElement("p");
    title.className = "stack-title";
    title.textContent = "THE OPERATIONS";
    box.append(title);

    const note = document.createElement("p");
    note.className = "stack-note";
    note.textContent = "nothing is applied until it is named";
    box.append(note);

    for (const op of OPERATIONS) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "op";
      if ("requires" in op) el.classList.add("op-modifier");

      const line = document.createElement("span");
      line.className = "op-line";
      const glyph = document.createElement("span");
      glyph.className = "op-glyph";
      glyph.setAttribute("aria-hidden", "true");
      const name = document.createElement("span");
      name.className = "op-name";
      name.textContent = op.title;
      const key = document.createElement("span");
      key.className = "op-key";
      key.setAttribute("aria-hidden", "true");
      key.textContent = op.key.toUpperCase();
      line.append(glyph, name, key);

      // The artifact key, then the sentence that artifact ships defining it.
      // Two lines, and the spec asks for exactly these two — the rail is narrow
      // and shares its height with the transport and a row per season, so a
      // third line per operation is a third of the rail spent on prose.
      const reads = document.createElement("span");
      reads.className = "op-reads";
      reads.textContent = op.reads.join("  ·  ");
      const def = document.createElement("span");
      def.className = "op-def";
      def.textContent = definitionOf(data, op);
      // Clamped to two lines in the rail; the artifact's whole sentence on hover,
      // because the point of the line is that the record speaks for itself.
      def.title = def.textContent;

      el.append(line, reads, def);
      // What the operation DOES lives here rather than in a third row: spoken
      // by a screen reader, shown on hover, and costing the rail no height.
      el.title = `${op.title} — ${op.does} (${op.key.toUpperCase()})`;
      el.setAttribute("aria-label", `${op.title}: ${op.does}`);
      el.setAttribute("aria-keyshortcuts", op.key.toUpperCase());
      el.addEventListener("click", () => this.transport.toggleOp(op.id));
      this.opBtns.push({ op, el, glyph });
      box.append(el);
    }

    // The argumentative event. It is not a seven-fold convenience: applying
    // every operation at once is the demonstration that maximal rendering is not
    // maximal access, and the plate becomes illegible on purpose. HOLD UNTIL
    // RELEASED, by the artist's ruling — pressing again restores exactly the
    // selection it was applied over.
    this.allBtn = document.createElement("button");
    this.allBtn.type = "button";
    this.allBtn.id = "all-renderings";
    this.allBtn.textContent = "ALL RENDERINGS";
    this.allBtn.title = "apply every operation at once (A) — press again to release";
    this.allBtn.setAttribute("aria-label",
      "apply every operation at once; press again to release");
    this.allBtn.setAttribute("aria-keyshortcuts", "A");
    this.allBtn.addEventListener("click", () => this.transport.allRenderings());
    box.append(this.allBtn);

    this.stackEl = box;
    return box;
  }

  /** The panel's state, written only when the mask actually moved. */
  private syncStack(): void {
    const on = this.transport.isStack();
    if (this.stackEl.hidden === on) this.stackEl.hidden = !on;
    if (!on) return;
    const ops = this.transport.stack();
    if (ops === this.shownOps) return;
    this.shownOps = ops;
    for (const { op, el, glyph } of this.opBtns) {
      const applied = has(ops, op.id);
      glyph.textContent = applied ? "◼" : "◻";
      el.setAttribute("aria-pressed", String(applied));
      el.classList.toggle("on", applied);
      // A modifier with nothing to modify is shown as inert rather than hidden:
      // the dependency is part of what the panel is saying — CLASSIFY re-tints
      // the base LOCATE draws and never draws a field of its own.
      const inert = "requires" in op && !has(ops, op.requires as OpId);
      el.classList.toggle("inert", applied && inert);
    }
    this.allBtn.setAttribute("aria-pressed", String(ops === ALL_OPS));
    this.allBtn.classList.toggle("on", ops === ALL_OPS);
  }

  private addRow(label: string, _x: null, _start: number, cls: string): void {
    const el = document.createElement("div");
    el.className = cls;
    el.textContent = label.toUpperCase();
    this.list.append(el);
  }

  /**
   * A segment row: a real button, not a clickable div.
   *
   * Every stop in the piece is in this list, and until V-09 not one of them
   * could be reached without a mouse - no tab order, no Enter, no name. The
   * markup is also built from nodes rather than from `innerHTML`: the label is
   * a season string out of an artifact, and a renderer that interpolates data
   * into markup is a habit worth not having even when today's data is safe.
   */
  private addSeg(
    label: string,
    share: string,
    mark: string | null,
    start: number,
    cls: string,
  ): HTMLElement {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `seg ${cls}`.trim();
    const left = document.createElement("span");
    const glyph = document.createElement("span");
    glyph.className = "mark";
    glyph.setAttribute("aria-hidden", "true");
    glyph.textContent = mark ?? "";
    left.append(glyph, document.createTextNode(label));
    const right = document.createElement("span");
    right.className = "share";
    right.textContent = share;
    el.append(left, right);
    el.setAttribute("aria-label", `${label}${share ? `, ${share}` : ""}, at ${fmt(start)}`);
    el.addEventListener("click", () => this.transport.seek(start));
    this.list.append(el);
    return el;
  }

  private syncPlay(): void {
    const paused = this.transport.isPaused();
    this.playBtn.textContent = paused ? "▶" : "❚❚";
    this.playBtn.setAttribute("aria-pressed", String(paused));
  }

  /** Where the playhead is inside one turn of the loop. */
  private wrapped(t: number): number {
    const d = this.schedule.duration;
    return ((t % d) + d) % d;
  }

  /** Called every frame; only touches the DOM when something actually moved. */
  update(t: number): void {
    const st = stateAt(t, this.schedule);
    const time = st.t;

    this.fill.style.width = `${(time / this.schedule.duration) * 100}%`;
    // The coda still reports the last season's year, so it has to be tested
    // first or the readout names 2025-26 all the way through the closing fade.
    const label = st.coda > 0 ? "coda" : st.year === null ? "counts" : String(st.year);
    const next = `${fmt(time)} / ${fmt(this.schedule.duration)}  ·  ${label}`;
    if (this.clockEl.textContent !== next) this.clockEl.textContent = next;

    // The slider's spoken value, at the resolution the clock beside it shows.
    // Written only when the second turns over: this runs every frame, and an
    // attribute write per frame is a DOM mutation per frame for nothing.
    const second = Math.floor(time);
    if (second !== this.shownSecond) {
      this.shownSecond = second;
      this.scrubEl.setAttribute("aria-valuenow", String(second));
      this.scrubEl.setAttribute("aria-valuetext", `${fmt(time)}, ${label}`);
    }

    const hand = `▣ ${this.transport.mode()}`;
    if (this.handEl.textContent !== hand) this.handEl.textContent = hand;

    this.syncStack();

    let row: Row | null = null;
    for (const r of this.rows) if (r.start <= time) row = r;
    if (row !== this.current) {
      this.current?.el.classList.remove("current");
      row?.el.classList.add("current");
      row?.el.scrollIntoView({ block: "nearest" });
      this.current = row;
    }
    this.syncPlay();
  }

  /**
   * Every place the step buttons can land.
   *
   * The window's beats are stops in their own right: it runs many times the
   * length of any other season (`secondsFor` in timeline.ts), and a presenter
   * who can only step over it in one jump cannot get to "the instant" at all.
   */
  static starts(schedule: Schedule): number[] {
    const stops = [0, ...schedule.segments.map((s) => s.start), schedule.lastEnds];
    const window = schedule.byYear.get(WINDOW_YEAR);
    if (window) {
      for (const b of WINDOW_BEATS) {
        if (b.from > 0) stops.push(window.start + b.from * window.duration);
      }
    }
    return [...new Set(stops)].sort((a, b) => a - b);
  }
}
