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

import { ignitePhase } from "./bloom";
import { factExternal, type FactsFile, type Loaded, type Season } from "./data";
import { censusStops } from "./modes/census";
import { LEAGUE_ACCUM_K } from "./modes/ledger";
import {
  ALL_OPS,
  has,
  OPERATIONS,
  type OpId,
  type Operation,
  type StackOps,
} from "./modes/operations";
import { HAND_PHASES } from "./modes/hand";
import { SHELL_PHASE } from "./modes/plate";
import type { ModeId } from "./modes/types";
import {
  ACT_TITLES,
  ARRIVAL_TAIL,
  CUT_YEAR,
  stateAt,
  WINDOW_BEATS,
  WINDOW_YEAR,
  type Act,
  type Schedule,
} from "./timeline";

export interface Transport {
  seek(seconds: number): void;
  nudgeSegment(direction: -1 | 1): void;
  togglePause(): void;
  isPaused(): boolean;
  position(): number;
  /** Which hand is drawing right now. */
  mode(): string;
  /** The pinned hand's id, or null while the loop rotates. THE SECOND SCORE
   *  reads this: the rail's window interior belongs to the pinned hand. */
  pinned(): ModeId | null;
  /** Whether the fermata is drawing the drift to a stop — shown, because a
   *  piece that is stopping on purpose must not read as a piece that hung. */
  inFermata(): boolean;
  /** The frame's citation in the piece's own grammar — `mode@t`, plus the
   *  `?ops=` token while THE STACK is pinned with operations applied. The
   *  same grammar the shots harness and every session's evidence speak. */
  citation(): string;
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
  /** What the row is called, for the next-boundary readout. */
  label: string;
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

/** One subordinate stop inside the window's row: a seek target with the span
 *  it opens. `at`/`end` are absolute seconds in the loop. */
export interface WindowStop {
  title: string;
  at: number;
  end: number;
}

/**
 * THE SECOND SCORE (the second audit's Codex report §4.2; artist ruling
 * 2026-08-10): the rail's
 * window row keeps its shared span, and keys `6`–`9` keep the four shared
 * beats in every hand — but the SUBORDINATE stops are the pinned hand's actual
 * interior, because the rail asserting one four-beat interior for all seven
 * views was the presenter's map disagreeing with the hand's actual score.
 *
 * Every stop is DERIVED from the same constants the hands read — never a typed
 * `t`:
 * - CENSUS: the derived stop table (`census.ts:censusStops` — a floor per
 *   filing, the remainder proportional to each taxonomy's own category
 *   count, MACHINE SAW protected at the equal-split span), the artifact's
 *   own column names in the record's column order.
 * - PLATE: the trace rhythm — the gestures ignite on `bloom.ts:ignitePhase`,
 *   the last at `(n−1)/n` of the spread, and the record's last file strikes at
 *   `SHELL_PHASE`.
 * - FIELD: arrival, then the one unchanged image it holds from `ARRIVAL_TAIL`
 *   to the close — the rail does not invent interior events the hand does not
 *   have.
 * - LEDGER: arrival, then its one late event — the last published heading,
 *   at the phase `LEAGUE_ACCUM_K` puts it.
 * - MEASURE and HAND keep the shared four beats: theirs genuinely are the
 *   window's beats. THE STACK and the released (rotating) rail keep the shared
 *   act map — releasing the pin restores it.
 */
export function windowSubStops(
  pinned: ModeId | null,
  schedule: Schedule,
  data: Loaded,
): WindowStop[] {
  const w = schedule.byYear.get(WINDOW_YEAR);
  if (!w) return [];
  const at = (phase: number): number => w.start + phase * w.duration;
  const span = (stops: { title: string; from: number }[]): WindowStop[] =>
    stops.map((s, i) => ({
      title: s.title,
      at: at(s.from),
      end: at(stops[i + 1]?.from ?? 1),
    }));

  if (pinned === "census" && data.window) {
    // TIME BELONGS TO THE COUNT (session 17): the rail lists the hand's own
    // derived stop table — one definition, two readers, so the presenter's
    // map and the filing cannot disagree about where a beat begins.
    const season = data.byYear.get(WINDOW_YEAR);
    if (season) {
      return span(censusStops(season, data.taxonomyColumns, w.duration)
        .map((s) => ({ title: s.title, from: s.from })));
    }
  }
  if (pinned === "plate" && data.traces) {
    // In time order: the shell begins striking BEFORE the last gesture
    // ignites — the plate hands itself from the corpus's last trace to the
    // record's last file with no dead interval, and the rail says so.
    const n = data.traces.traces.length;
    return span([
      { title: "the gestures, one at a time", from: 0 },
      { title: "the record's last file", from: SHELL_PHASE },
      { title: "the last gesture", from: ignitePhase(n - 1, n) },
    ]);
  }
  if (pinned === "field") {
    return span([
      { title: "arrival", from: 0 },
      { title: "one image, held", from: ARRIVAL_TAIL },
    ]);
  }
  if (pinned === "ledger") {
    const names = factExternal<unknown[]>(data.facts, "published_instead").length;
    return span([
      { title: "arrival", from: 0 },
      { title: "the last published heading", from: (names - 1) / (names * LEAGUE_ACCUM_K) },
    ]);
  }
  if (pinned === "hand" && data.gameFile) {
    // THE FOUR SCALES (session 15): the hand's interior holds five real stops
    // — the shared night beat splits into the game and the night at the
    // hand's own exported anchor. One definition, two readers.
    return span(HAND_PHASES.map((p) => ({ title: p.title, from: p.from })));
  }
  return WINDOW_BEATS.map((b) => ({ title: b.title, at: at(b.from), end: at(b.to) }));
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

  /** THE SECOND SCORE's region: the window's sub-stops, rebuilt only when the
   *  pinned hand changes — the rail's touch-DOM-only-on-change discipline. */
  private windowBox: HTMLElement | null = null;
  private windowRows: Row[] = [];
  private shownPin: ModeId | null | undefined = undefined;

  /** The chrome pass's three read-only surfaces, each written on change only. */
  private readoutEl!: HTMLElement;
  private keysEl!: HTMLElement;
  private shownStackKeys = false;
  private shownFermata = false;

  constructor(
    root: HTMLElement,
    private schedule: Schedule,
    seasons: Season[],
    private transport: Transport,
    private data: Loaded,
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

    // The presenter's readout: the exact t under the playhead, what boundary
    // comes next and how far away it is — and the fermata, said while it acts.
    // The piece's own citation grammar speaks in exact seconds, so the rail
    // should too rather than leaving the presenter to eyeball a 3px bar.
    this.readoutEl = document.createElement("div");
    this.readoutEl.id = "readout";
    head.append(this.readoutEl);

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

    // The copy-frame helper: one press puts the frame on the clipboard in the
    // piece's own citation grammar — `mode@t`, with the `?ops=` token while
    // THE STACK is pinned — the same words the shots harness and every
    // session's evidence use, so a talk can cite the frame it is on. A real
    // button (the clipboard wants a user gesture anyway); fire-and-forget, no
    // async state held.
    const cite = document.createElement("button");
    cite.type = "button";
    cite.id = "cite";
    cite.textContent = "⧉ CITE THIS FRAME";
    cite.title = "copy the frame's citation — the piece's mode@t grammar";
    cite.setAttribute("aria-label", "copy this frame's citation to the clipboard");
    cite.addEventListener("click", () => {
      void navigator.clipboard?.writeText(this.transport.citation());
    });
    head.append(cite);

    // The keys exist and nothing said so. A presenter who has to be told the
    // shortcuts out of band does not have them. CONTEXTUAL: only keys that are
    // live are said — THE STACK's letters appear exactly while THE STACK is
    // pinned, the same gating the keys themselves obey in main.ts.
    this.keysEl = document.createElement("div");
    this.keysEl.id = "keys";
    this.buildKeys(false);
    head.append(this.keysEl);

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
    const countsLabel = `${founded} — ${seasons[0]?.year ?? ""}`;
    this.rows.push({
      el: this.addSeg(countsLabel, "no coordinates", null, 0, ""),
      year: null,
      start: 0,
      label: countsLabel,
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
      const segLabel = season?.season ?? String(seg.year);
      const el = this.addSeg(segLabel, share, mark, seg.start, cls);
      this.rows.push({ el, year: seg.year, start: seg.start, label: segLabel });

      // The window is dilated far past any other season and moves through
      // distinct beats, so it gets the only sub-list in the rail: a presenter
      // should be able to reach "the instant" directly rather than scrubbing.
      // THE SECOND SCORE: the sub-list is a region of its own, rebuilt when
      // the pinned hand changes — its rows are the pinned hand's actual
      // interior, and releasing the pin restores the shared map.
      if (seg.year === WINDOW_YEAR) {
        this.windowBox = document.createElement("div");
        this.list.append(this.windowBox);
        this.buildWindowStops(this.transport.pinned());
      }
    }
    this.addRow("Coda", null, schedule.lastEnds, "act");
    this.rows.push({
      el: this.addSeg("the plate empties", "", null, schedule.lastEnds, ""),
      year: null,
      start: schedule.lastEnds,
      label: "the plate empties",
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

  /** Rebuild the window's sub-stop rows for the pinned hand (or the shared
   *  map when released). Only `update()` calls this, and only on a pin
   *  change, so the rail's DOM is untouched while nothing moved. */
  private buildWindowStops(pin: ModeId | null): void {
    if (!this.windowBox) return;
    this.shownPin = pin;
    if (this.current && this.windowRows.includes(this.current)) this.current = null;
    this.windowBox.textContent = "";
    this.windowRows = [];
    for (const s of windowSubStops(pin, this.schedule, this.data)) {
      const el = this.addSeg(s.title, fmt(s.end - s.at), null, s.at, "beat", this.windowBox);
      this.windowRows.push({ el, year: null, start: s.at, label: s.title });
    }
  }

  /** The key hints, rebuilt only when what is live changes: THE STACK's
   *  letters are said exactly while THE STACK is pinned — the same gating the
   *  keys themselves obey in main.ts, extended to the saying of them. */
  private buildKeys(stackPinned: boolean): void {
    this.shownStackKeys = stackPinned;
    this.keysEl.textContent = "";
    const lines = [...KEY_HINTS];
    if (stackPinned) {
      lines.push(
        `${OPERATIONS.map((o) => o.key.toUpperCase()).join(" ")} OPERATIONS · A ALL`,
      );
    }
    for (const line of lines) {
      const p = document.createElement("p");
      p.textContent = line;
      this.keysEl.append(p);
    }
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
    parent: HTMLElement | null = null,
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
    (parent ?? this.list).append(el);
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

    // THE SECOND SCORE: the window's interior follows the pinned hand. The
    // rows are rebuilt only when the pin actually moved.
    const pin = this.transport.pinned();
    if (pin !== this.shownPin) this.buildWindowStops(pin);

    // The contextual key hints follow THE STACK's pin the same way.
    const stackOn = this.transport.isStack();
    if (stackOn !== this.shownStackKeys) this.buildKeys(stackOn);

    // The readout: exact t, the next boundary and its distance — or the
    // fermata, named while it draws the drift to a stop. The next boundary
    // comes from the same rows the rail shows, sub-stops included, so the
    // countdown and the list can never disagree.
    const fermata = this.transport.inFermata();
    if (fermata !== this.shownFermata) {
      this.shownFermata = fermata;
      this.readoutEl.classList.toggle("fermata", fermata);
    }
    let coming: Row | null = null;
    for (const r of this.rows) {
      if (r.start > time && (coming === null || r.start < coming.start)) coming = r;
    }
    for (const r of this.windowRows) {
      if (r.start > time && (coming === null || r.start <= coming.start)) coming = r;
    }
    const nextAt = coming ? coming.start : this.schedule.duration;
    const nextLabel = coming ? coming.label : "the loop turns over";
    const readout = fermata
      ? `t ${time.toFixed(1)} · FERMATA`
      : `t ${time.toFixed(1)} · ${nextLabel} in ${(nextAt - time).toFixed(1)}s`;
    if (this.readoutEl.textContent !== readout) this.readoutEl.textContent = readout;

    // The current row: the latest stop at or before the playhead, a sub-stop
    // winning a tie with its own season row — the sub-list is the finer map.
    let row: Row | null = null;
    for (const r of this.rows) {
      if (r.start <= time && (row === null || r.start > row.start)) row = r;
    }
    for (const r of this.windowRows) {
      if (r.start <= time && (row === null || r.start >= row.start)) row = r;
    }
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
   *
   * THE SECOND SCORE: given `data` and the pinned hand, the window's interior
   * stops are that hand's own (`windowSubStops`), so the step buttons walk
   * the same score the rail shows. Without `data` the shared four beats
   * stand, which is also what every hand without its own interior gets.
   */
  static starts(schedule: Schedule, data?: Loaded, pinned: ModeId | null = null): number[] {
    const stops = [0, ...schedule.segments.map((s) => s.start), schedule.lastEnds];
    const window = schedule.byYear.get(WINDOW_YEAR);
    if (window) {
      if (data) {
        for (const s of windowSubStops(pinned, schedule, data)) {
          if (s.at > window.start) stops.push(s.at);
        }
      } else {
        for (const b of WINDOW_BEATS) {
          if (b.from > 0) stops.push(window.start + b.from * window.duration);
        }
      }
    }
    return [...new Set(stops)].sort((a, b) => a - b);
  }
}
