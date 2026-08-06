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

import type { Season } from "./data";
import { ACT_TITLES, CUT_YEAR, stateAt, type Act, type Schedule } from "./timeline";

export interface Transport {
  seek(seconds: number): void;
  nudgeSegment(direction: -1 | 1): void;
  togglePause(): void;
  isPaused(): boolean;
  position(): number;
}

interface Row {
  el: HTMLElement;
  /** null for Act 0, which has no season. */
  year: number | null;
  start: number;
}

const WINDOW_YEAR = 2015;

function fmt(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export class Navigator {
  private rows: Row[] = [];
  private current: Row | null = null;
  private fill: HTMLElement;
  private clockEl: HTMLElement;
  private playBtn: HTMLButtonElement;

  constructor(
    private root: HTMLElement,
    private schedule: Schedule,
    seasons: Season[],
    private transport: Transport,
  ) {
    root.hidden = false;
    root.innerHTML = "";

    const title = document.createElement("h1");
    title.textContent = "FADEAWAY";
    root.append(title);

    const meta = document.createElement("p");
    meta.className = "meta";
    meta.textContent = `${seasons.length} seasons · ${fmt(schedule.duration)} loop`;
    root.append(meta);

    const bar = document.createElement("div");
    bar.className = "transport";
    const mk = (label: string, hint: string, fn: () => void) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.title = hint;
      b.addEventListener("click", fn);
      bar.append(b);
      return b;
    };
    mk("|◀", "back to the start", () => this.transport.seek(0));
    mk("◀◀", "previous segment", () => this.transport.nudgeSegment(-1));
    this.playBtn = mk("❚❚", "pause / resume", () => {
      this.transport.togglePause();
      this.syncPlay();
    });
    mk("▶▶", "next segment", () => this.transport.nudgeSegment(1));
    root.append(bar);

    const scrub = document.createElement("div");
    scrub.id = "scrub";
    this.fill = document.createElement("div");
    this.fill.className = "fill";
    scrub.append(this.fill);
    const scrubTo = (e: MouseEvent) => {
      const r = scrub.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      this.transport.seek(p * this.schedule.duration);
    };
    scrub.addEventListener("click", scrubTo);
    scrub.addEventListener("mousemove", (e) => {
      if (e.buttons & 1) scrubTo(e);
    });
    root.append(scrub);

    this.clockEl = document.createElement("div");
    this.clockEl.id = "clock";
    root.append(this.clockEl);

    this.addRow("Counts", null, 0, "act");
    this.rows.push({ el: this.addSeg("1946 — 1996", "no coordinates", null, 0, ""), year: null, start: 0 });

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
    }
    this.addRow("Coda", null, schedule.lastEnds, "act");
    this.rows.push({
      el: this.addSeg("the plate empties", "", null, schedule.lastEnds, ""),
      year: null,
      start: schedule.lastEnds,
    });
  }

  private addRow(label: string, _x: null, _start: number, cls: string): void {
    const el = document.createElement("div");
    el.className = cls;
    el.textContent = label.toUpperCase();
    this.root.append(el);
  }

  private addSeg(
    label: string,
    share: string,
    mark: string | null,
    start: number,
    cls: string,
  ): HTMLElement {
    const el = document.createElement("div");
    el.className = `seg ${cls}`.trim();
    const left = document.createElement("span");
    left.innerHTML = `<span class="mark">${mark ?? ""}</span>${label}`;
    const right = document.createElement("span");
    right.className = "share";
    right.textContent = share;
    el.append(left, right);
    el.addEventListener("click", () => this.transport.seek(start));
    this.root.append(el);
    return el;
  }

  private syncPlay(): void {
    this.playBtn.textContent = this.transport.isPaused() ? "▶" : "❚❚";
  }

  /** Called every frame; only touches the DOM when something actually moved. */
  update(t: number): void {
    const st = stateAt(t, this.schedule);
    const time = st.t;

    this.fill.style.width = `${(time / this.schedule.duration) * 100}%`;
    const label = st.year === null ? (st.coda > 0 ? "coda" : "counts") : String(st.year);
    const next = `${fmt(time)} / ${fmt(this.schedule.duration)}  ·  ${label}`;
    if (this.clockEl.textContent !== next) this.clockEl.textContent = next;

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

  /** Segment starts, for the transport's step buttons. */
  static starts(schedule: Schedule): number[] {
    return [0, ...schedule.segments.map((s) => s.start), schedule.lastEnds];
  }
}
