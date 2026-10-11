/** FADEAWAY - one rAF loop over one float.
 *
 * Modes: exhibit by default (wall clock, no chrome), talk with ?talk (keys).
 * Both call the same render(t); nothing is reachable in one mode that the
 * other cannot reach.
 */

import { exhibitClock, TalkClock, type Clock } from "./clock";
import { load } from "./data";
import {
  boundedCompositeDpr,
  boundedDpr,
  displayFromQuery,
  type DisplayProfile,
} from "./display";
import { buildInscriptions } from "./inscription";
import { isGalleryMode, isModeId, modeAt, MODE_IDS, MODE_TITLES, type ModeId } from "./modes";
import {
  bitOf,
  completedStackState,
  NO_OPS,
  opForKey,
  OPERATIONS,
  opsToken,
  parseOps,
  toggle,
  type OpId,
  type StackRenderState,
  type StackOps,
} from "./modes/operations";
import { Navigator } from "./navigator";
import { OVERVIEW_SECONDS, overviewAt } from "./overview";
import { makeView } from "./plate";
import { renderTo, type Target } from "./render";
import { semanticAt, semanticStopById, semanticTime } from "./semantic";
import { clearAtlas } from "./textatlas";
import {
  ACT0_SECONDS,
  ACT_TITLES,
  buildSchedule,
  CUT_YEAR,
  seekAct,
  seekTo,
  stateAt,
  WINDOW_BEATS,
  WINDOW_YEAR,
  type Act,
  type Schedule,
} from "./timeline";

const canvas = document.getElementById("plate") as HTMLCanvasElement;
const ctx = canvas.getContext("2d", { alpha: false })!;

const startup = document.getElementById("startup")!;
const startupState = startup.querySelector(".startup-state")!;
const contextLabel = document.getElementById("context-label")!;
const overviewTitle = document.getElementById("overview-title")!;
const fullEntry = document.getElementById("full-entry") as HTMLAnchorElement;
const credit = document.getElementById("credit")!;
const assetButton = document.getElementById("asset-state") as HTMLButtonElement;

const target: Target = { ctx, view: makeView(1, 1), dpr: 1 };
let displayProfile: DisplayProfile = "near";

interface RenderSurface {
  canvas: HTMLCanvasElement;
  target: Target;
}

function makeSurface(): RenderSurface {
  const surface = document.createElement("canvas");
  const surfaceCtx = surface.getContext("2d", { alpha: false })!;
  return { canvas: surface, target: { ctx: surfaceCtx, view: makeView(1, 1), dpr: 1 } };
}

let overviewExperience = false;
let overviewPrevious: RenderSurface | null = null;

function ensureOverviewPrevious(): RenderSurface {
  if (!overviewPrevious) overviewPrevious = makeSurface();
  return overviewPrevious;
}

function sizeTarget(t: Target, backing: HTMLCanvasElement, w: number, h: number, dpr: number): void {
  t.dpr = dpr;
  // Floor each dimension so the area-derived DPR is a strict pixel budget,
  // including viewports whose ideal backing dimensions are fractional.
  backing.width = Math.max(1, Math.floor(w * dpr));
  backing.height = Math.max(1, Math.floor(h * dpr));
  t.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  t.view = makeView(w, h);
}

function resize(): void {
  // Measure the canvas's own box, not the window's: with the navigator open the
  // plate has the rail beside it and would otherwise be drawn off-centre.
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  const dpr = overviewExperience
    ? boundedCompositeDpr(w, h, window.devicePixelRatio || 1, 2)
    : boundedDpr(w, h, window.devicePixelRatio || 1);
  sizeTarget(target, canvas, w, h, dpr);
  if (overviewPrevious) {
    sizeTarget(overviewPrevious.target, overviewPrevious.canvas, w, h, dpr);
  }
  // Every atlas key carries its size, so a resize invalidates all of them.
  clearAtlas();
}

/**
 * The presenter's keyboard.
 *
 * Two keyboard gaps, both closed here: the window's four beats had no key at
 * all — the one segment long enough to have an inside, and the only way in was
 * to find it with a mouse — and neither did the hand. Beats take the digits
 * straight after the acts, so the number row reads as the piece's own order:
 * 0 the start, 1-5 the acts, then the inside of act 3.
 *
 * THE STACK'S EIGHT OPERATIONS TAKE LETTERS, and the letter is the same one the
 * URL token uses — `operations.ts` holds that alphabet and both readers take it
 * from there, the way `WINDOW_BEATS` is one definition read by the rail and by
 * the hand. `a` applies all eight at once. Those keys are LIVE ONLY WHILE
 * THE STACK IS PINNED: a key that silently mutates a configuration nothing on
 * screen is showing is worse than no key, and `c` belongs to nobody while THE
 * CENSUS is drawing.
 *
 * `cycleMode` and `stack` are passed in rather than reached for, because the
 * rail owns the mode override and the operation mask and there is exactly one
 * of each.
 */
interface StackKeys {
  /** Whether THE STACK is the hand now drawing, so these keys mean anything. */
  active(): boolean;
  toggle(id: Parameters<typeof toggle>[1]): void;
  all(): void;
}

function bindTalkKeys(
  clock: TalkClock,
  schedule: Schedule,
  cycleMode: () => void,
  stack: StackKeys,
  /** The prev/next STOP walk the transport buttons already use: `,`/`.` step
   *  the same score the rail shows — sub-stops included — instead of a fixed
   *  season-length jump. */
  nudgeStop: (dir: -1 | 1) => void,
): void {
  // The four SHARED beats, straight from the one definition. Deliberately not
  // the rail's stop list: under THE SECOND SCORE the rail's window interior
  // follows the pinned hand, and `6`–`9` must NOT — the keys are the
  // presenter's muscle memory and the score depends on them staying put.
  const w = schedule.byYear.get(WINDOW_YEAR);
  const beats = w ? WINDOW_BEATS.map((b) => w.start + b.from * w.duration) : [];
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    // A key pressed while a rail control has focus belongs to that control:
    // Space on a focused button is that button, and the arrows are the scrub's.
    const el = document.activeElement;
    if (el instanceof HTMLElement && el.closest("#nav")
      && (e.key === " " || e.key === "Enter" || e.key.startsWith("Arrow")
        || e.key === "Home" || e.key === "End")) {
      return;
    }
    // THE STACK's own alphabet, before the piece's transport, and only while
    // THE STACK is drawing. `a` is the argumentative event; the other eight are
    // one operation each, keyed in `operations.ts`.
    if (stack.active()) {
      if (e.key === "a") {
        stack.all();
        return;
      }
      const op = opForKey(e.key);
      if (op) {
        stack.toggle(op.id);
        return;
      }
    }
    switch (e.key) {
      case "h":
        cycleMode();
        break;
      case "6":
      case "7":
      case "8":
      case "9": {
        const beat = beats[Number(e.key) - 6];
        if (beat !== undefined) clock.seek(beat);
        break;
      }
      case " ":
        e.preventDefault();
        clock.togglePause();
        break;
      case "f":
        clock.toggleFermata();
        break;
      case ".":
        nudgeStop(1);
        break;
      case ",":
        nudgeStop(-1);
        break;
      case "w":
        clock.seek(seekTo(2015, schedule));
        break;
      // The one cut the piece allows, one key away. `x` — the cut mark; NOT
      // `c`, which is THE STACK's CLASSIFY while the stack is pinned, and a
      // key that changes meaning with the pin is a trap. The key choice is
      // provisional.
      case "x":
        clock.seek(seekTo(CUT_YEAR, schedule));
        break;
      case "0":
        clock.seek(0);
        break;
      case "1":
      case "2":
      case "3":
      case "4":
      case "5":
        clock.seek(seekAct(Number(e.key) as Act, schedule));
        break;
      default:
        break;
    }
  });
}

interface StartSelection {
  offset: number;
  semanticMode: ModeId | null;
}

/** Deterministic entry. A valid semantic stop is the strongest address; legacy
 * numeric year/t links retain their exact behaviour beneath it. */
function startSelection(
  schedule: Schedule,
  q: URLSearchParams,
  handNightSeconds?: number,
): StartSelection {
  const stop = semanticStopById(q.get("stop"));
  if (stop) {
    const at = semanticTime(stop, schedule, handNightSeconds);
    if (at !== null) return { offset: at, semanticMode: stop.mode };
  }
  // A bad value must never reach the clock: NaN propagates through every
  // downstream comparison, freezes the piece on one frame, and in exhibit mode
  // there is no key to press to get it back.
  const year = Number(q.get("year"));
  if (Number.isFinite(year) && schedule.byYear.has(year)) {
    return { offset: seekTo(year, schedule), semanticMode: null };
  }
  // Not wrapped into a single loop: `stateAt` already takes the modulo, and the
  // un-wrapped value is what selects the pass, so `?t=` can reach a later hand.
  const t = Number(q.get("t"));
  if (Number.isFinite(t)) return { offset: Math.max(0, t), semanticMode: null };
  return { offset: 0, semanticMode: null };
}

/** Existing direct-frame and working URLs stay on the canonical work. Only a
 * bare web entry (or an explicit overview request) chooses the guided score. */
function wantsOverview(q: URLSearchParams): boolean {
  if (q.has("talk") || q.has("nav") || q.has("probe")) return false;
  if (q.get("experience") === "full") return false;
  if (q.get("experience") === "overview") return true;
  return !["t", "year", "stop", "mode", "ops"].some((key) => q.has(key));
}

function fmtDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function setStartup(text: string, state: "loading" | "ready" | "degraded" | "failed"): void {
  startup.dataset.state = state;
  startupState.textContent = text;
}

async function main(): Promise<void> {
  const q = new URLSearchParams(location.search);
  const overview = wantsOverview(q);
  overviewExperience = overview;
  if (overview) ensureOverviewPrevious();
  const talkMode = q.has("talk");
  const wantsNav = (talkMode || q.has("nav")) && q.get("nav") !== "0";
  const interactive = talkMode || wantsNav;
  displayProfile = displayFromQuery(q, talkMode);
  document.body.classList.toggle("display-room", displayProfile === "room");
  document.body.classList.toggle("overview", overview);

  setStartup("THE RECORD IS LOADING", "loading");
  const data = await load();
  const schedule = buildSchedule(data.seasons);
  const handNightSeconds = data.slateFile?.span.seconds;
  const selection = startSelection(schedule, q, handNightSeconds);

  // The probes, and the only place they are reachable from.
  //
  // Dynamically imported, so the gallery build never fetches the chunk and the
  // exhibit path cannot arrive here by accident. They return instead of
  // starting the loop: a probe run is not the piece running, it is the piece
  // being measured, and it must not also be animating while it is measured.
  const probe = q.get("probe");
  if (probe) {
    startup.hidden = true;
    const { runProbe } = await import("./probe");
    await runProbe(probe, q, {
      data,
      schedule,
      inscriptions: buildInscriptions(data.seasons, schedule),
    });
    return;
  }

  // Talk and the guided entry never expose a cold Window. A semantic direct
  // link also earns the same guarantee so a rehearsal bookmark cannot land on
  // a sparse frame and fill in after the audience sees it.
  if (talkMode || overview || q.has("stop")) {
    setStartup("THE WINDOW IS LOADING", "loading");
    await data.preloadWindow();
  }

  let shownAssetState = "";
  const syncAssetState = (): void => {
    const state = data.assetState();
    const token = `${state.status}:${state.pending.length}:${state.errors.length}`;
    if (token === shownAssetState) return;
    shownAssetState = token;
    document.body.dataset.assetState = state.status;
    assetButton.dataset.state = state.status;
    document.body.classList.toggle("degraded", state.status === "degraded");
    if (state.status === "ready") {
      assetButton.hidden = true;
    } else {
      assetButton.hidden = false;
      assetButton.disabled = state.status === "loading";
      assetButton.textContent = state.status === "loading"
        ? `LOADING · ${state.pending.length}`
        : `DEGRADED · ${state.errors.length} · RETRY`;
      assetButton.title = state.errors.join("\n");
    }
  };
  assetButton.addEventListener("click", () => {
    assetButton.disabled = true;
    assetButton.textContent = "RETRYING";
    void data.retryAssets().then(async () => {
      if (talkMode || overview || q.has("stop")) await data.preloadWindow();
      shownAssetState = "";
      syncAssetState();
    });
  });
  syncAssetState();

  // With no override the loop rotates hands, so the mode axis stays a pure
  // function of the same float and the rail keeps scrubbing it. Pinning one is
  // the presenter's affordance, not the gallery's.
  //
  // AND ONE OF THE SEVEN IDS MAY NOT BE PINNED WITHOUT A RAIL. `?mode=` used to
  // be honoured anywhere, which was harmless while every id named a hand that
  // draws the whole record. THE STACK opens on bare stone and is driven entirely
  // from the rail and the keyboard, neither of which exists on a wall machine —
  // so `/?mode=stack` there would pin an empty plate with no way out of it.
  // Decision (2026-08-09): require talk or nav. An ignored `?mode=` falls
  // back to the rotation, which is the same thing a misspelt one has always done.
  // A semantic stop is a complete address: it selects both the frame and the
  // hand that makes that frame meaningful. A conflicting legacy `?mode=` may
  // not turn `plate.shell` into a Ledger image at Plate's timestamp.
  const requested = selection.semanticMode ?? q.get("mode");
  let modeOverride: ModeId | null =
    isModeId(requested) && (interactive || isGalleryMode(requested)) ? requested : null;

  /**
   * THE STACK's operation mask — UI state here, mode configuration downstream.
   *
   * Exactly the standing this file already gives `modeOverride`: a variable the
   * rail and the keyboard write, read once per frame, and hand to a `renderTo`
   * that is a pure function of it. Nothing accumulates, and the same
   * `(mask, t)` always produces the same pixels.
   */
  let ops: StackOps = parseOps(q.get("ops"));
  /** URL-loaded operations are complete. Entries appear here only for controls
   * invoked since the page loaded, where the value is their monotonic UI-clock
   * t0. Operation feedback still runs while the score itself is paused. */
  const opStarted = new Map<OpId, number>();
  /** What ALL RENDERINGS was applied over, so releasing it returns to exactly
   *  that. Hold-until-released was chosen over a decaying transient, which
   *  is why the return is a remembered NUMBER and not an arithmetic — restoring
   *  it is byte-identical because it is the same configuration. */
  let beforeAll: StackOps = ops;
  let beforeAllStarted = new Map<OpId, number>();

  const stackRenderAt = (uiSeconds: number): StackRenderState => {
    const progressByOp: StackRenderState["progressByOp"] = {};
    for (const op of OPERATIONS) {
      if ((ops & bitOf(op.id)) === 0) continue;
      const started = opStarted.get(op.id);
      if (started !== undefined) {
        progressByOp[op.id] = Math.min(1, Math.max(0, (uiSeconds - started) / op.durationSeconds));
      }
    }
    return { mask: ops, progressByOp };
  };

  let clock: Clock;
  let nav: Navigator | null = null;
  if (overview) {
    clock = exhibitClock(0);
    credit.hidden = false;
    fullEntry.hidden = false;
    fullEntry.textContent = `FULL ${fmtDuration(schedule.duration * 6)} WORK`;
    const fullUrl = new URL(location.href);
    fullUrl.search = "";
    fullUrl.searchParams.set("experience", "full");
    if (q.get("display")) fullUrl.searchParams.set("display", displayProfile);
    fullEntry.href = fullUrl.toString();
  } else if (interactive) {
    const tc = new TalkClock(selection.offset, talkMode && q.get("autoplay") !== "1");
    // The hand key and the rail's hand row are the same action, so they share
    // one implementation rather than two that can drift.
    const cycleMode = () => {
      const i = modeOverride === null ? 0 : MODE_IDS.indexOf(modeOverride) + 1;
      modeOverride = i >= MODE_IDS.length ? null : MODE_IDS[i]!;
    };
    // The prev/next STOP walk — ONE implementation for the transport buttons
    // and the `,`/`.` keys. Recomputed per press, never
    // captured: the stop list follows the pinned hand (THE SECOND SCORE).
    // Step by segment INDEX, never by elapsed seconds — a seek leaves the
    // clock running, and any time-window test makes each press depend on how
    // long ago the last one was.
    const nudgeStop = (dir: -1 | 1) => {
      const now = ((tc.seconds % schedule.duration) + schedule.duration) % schedule.duration;
      const starts = Navigator.starts(schedule, data, modeOverride);
      let i = 0;
      for (let k = 0; k < starts.length; k++) if (starts[k]! <= now + 0.01) i = k;
      tc.seek(starts[i + dir] ?? (dir === 1 ? 0 : starts[starts.length - 1]!));
    };
    /**
     * Keep the address bar naming the frame on screen.
     *
     * A configuration reachable only by pressing keys is not addressable, and
     * addressability is a purity requirement here rather than a nicety: the
     * harness reaches a frame by direct URL and has to be able to reach a
     * CONFIGURED one. `replaceState` rather than `pushState` — the browser's
     * back button is not a transport for this piece, and a talk's worth of
     * toggles should not be a talk's worth of history entries.
     */
    const address = () => {
      const url = new URL(location.href);
      if (ops === NO_OPS) url.searchParams.delete("ops");
      else url.searchParams.set("ops", opsToken(ops));
      history.replaceState(null, "", url);
    };
    const available = (id: OpId): boolean => {
      const op = OPERATIONS.find((candidate) => candidate.id === id)!;
      return !("windowOnly" in op) || stateAt(tc.seconds, schedule).year === WINDOW_YEAR;
    };
    const stackKeys = {
      active: () => modeOverride === "stack",
      toggle: (id: Parameters<typeof toggle>[1]) => {
        if (!available(id)) return;
        const applying = (ops & bitOf(id)) === 0;
        ops = toggle(ops, id);
        if (applying) opStarted.set(id, performance.now() / 1000);
        else opStarted.delete(id);
        // A single toggle re-bases the release point, so ALL RENDERINGS always
        // returns to the last thing the presenter actually chose rather than to
        // whatever was up several minutes ago.
        beforeAll = ops;
        beforeAllStarted = new Map(opStarted);
        address();
      },
      all: () => {
        // Hold until released, by design: the argumentative event IS the
        // configuration with every bit set, and the presenter decides how long
        // the audience sits in it. Pressing again restores the previous mask.
        const availableMask = OPERATIONS.reduce(
          (mask, op) => available(op.id) ? mask | bitOf(op.id) : mask,
          NO_OPS,
        );
        const allAvailableOn = (ops & availableMask) === availableMask;
        if (allAvailableOn) {
          const unavailable = ops & ~availableMask;
          ops = (beforeAll & availableMask) | unavailable;
          opStarted.clear();
          for (const [id, started] of beforeAllStarted) opStarted.set(id, started);
        } else {
          beforeAll = ops;
          beforeAllStarted = new Map(opStarted);
          for (const op of OPERATIONS) {
            if (available(op.id) && (ops & bitOf(op.id)) === 0) {
              opStarted.set(op.id, performance.now() / 1000);
            }
          }
          ops |= availableMask;
        }
        address();
      },
    };
    bindTalkKeys(tc, schedule, cycleMode, stackKeys, nudgeStop);
    clock = tc;
    if (wantsNav) {
      document.body.classList.remove("exhibit");
      nav = new Navigator(document.getElementById("nav")!, schedule, data.seasons, {
        seek: (s) => tc.seek(s),
        togglePause: () => tc.togglePause(),
        // The rail's glyph must track whether the piece is MOVING, not just
        // whether it is paused - a fermata stops it too, and a button that
        // reads "playing" while nothing moves is worse than no button.
        isPaused: () => tc.held || tc.inFermata,
        position: () => tc.seconds,
        mode: () =>
          modeOverride
            ? MODE_TITLES[modeOverride]
            : `${MODE_TITLES[modeAt(tc.seconds, schedule, null)]} (rotating)`,
        activeMode: () => modeAt(tc.seconds, schedule, modeOverride),
        // THE SECOND SCORE reads the pin itself: the rail's window interior
        // and the step-button stops both follow it.
        pinned: () => modeOverride,
        inFermata: () => tc.inFermata,
        // Prefer a semantic stop; otherwise retain the exact time. Both forms
        // carry the hand actually drawing so a pinned talk frame reopens as the
        // same image, plus the operation token when Stack is configured.
        citation: () => {
          const t = ((tc.seconds % schedule.duration) + schedule.duration) % schedule.duration;
          const mode = modeAt(tc.seconds, schedule, modeOverride);
          const stop = semanticAt(t, mode, schedule, handNightSeconds);
          const url = new URL(location.href);
          url.searchParams.delete("year");
          url.searchParams.delete("t");
          url.searchParams.delete("stop");
          url.searchParams.set("experience", "full");
          url.searchParams.set("mode", mode);
          if (stop) url.searchParams.set("stop", stop.id);
          else url.searchParams.set("t", t.toFixed(2).replace(/\.?0+$/, ""));
          if (ops === NO_OPS) url.searchParams.delete("ops");
          else url.searchParams.set("ops", opsToken(ops));
          return url.toString();
        },
        // Steps through the hands and then back to letting the loop rotate,
        // so the gallery behaviour is always one click away. Same function the
        // H key calls.
        cycleMode,
        // The direct choice: the seven hands as
        // one press each, beside the cycle the muscle memory keeps. Null
        // releases the pin back to the rotation.
        pinMode: (id) => {
          modeOverride = id;
        },
        // THE STACK's operation panel. Same three functions the keyboard calls,
        // for the same reason the hand row and the H key share one: a rail and
        // a key that do the same thing must be the same code or they drift.
        stack: () => ops,
        isStack: () => modeOverride === "stack",
        toggleOp: stackKeys.toggle,
        allRenderings: stackKeys.all,
        nudgeSegment: nudgeStop,
      }, data);
    }
  } else {
    document.body.classList.add("exhibit");
    clock = exhibitClock(selection.offset);
    wakePointer();
    if (q.get("experience") === "full") returnOnEscape(q, displayProfile);
  }

  resize();
  window.addEventListener("resize", resize);

  const initialAssetState = data.assetState();
  setStartup(
    initialAssetState.status === "degraded" ? "THE RECORD IS DEGRADED" : "READY",
    initialAssetState.status,
  );

  console.log(`FADEAWAY - ${data.seasons.length} seasons, runtime `
    + `${Math.round(schedule.duration)}s ` + `(Act 0 ${ACT0_SECONDS}s), `
    + `experience ${overview ? `overview ${OVERVIEW_SECONDS}s` : clock.mode}`);

  const inscriptions = buildInscriptions(data.seasons, schedule);
  let firstFrameComposed = false;
  const frame = (now: number) => {
    const t = clock.at(now);
    if (overview) {
      const scored = overviewAt(t, schedule, handNightSeconds);
      renderTo(
        target, scored.current.time, data, schedule, inscriptions,
        scored.current.mode, false, false, completedStackState(NO_OPS), null, displayProfile,
      );
      if (scored.previous && scored.mix < 0.999) {
        const previous = ensureOverviewPrevious();
        renderTo(
          previous.target, scored.previous.time, data, schedule, inscriptions,
          scored.previous.mode, false, false, completedStackState(NO_OPS), null, displayProfile,
        );
        // Current is already on the visible destination. Source-over the
        // outgoing frame at 1−mix: prev·(1−mix) + current·mix, the same
        // crossfade as the former two-offscreen compositor with one less
        // viewport backing store.
        ctx.save();
        ctx.setTransform(target.dpr, 0, 0, target.dpr, 0, 0);
        ctx.globalAlpha = 1 - scored.mix;
        ctx.drawImage(
          previous.canvas, 0, 0, previous.canvas.width, previous.canvas.height,
          0, 0, target.view.width, target.view.height,
        );
        ctx.restore();
      }
      overviewTitle.hidden = false;
      overviewTitle.textContent = scored.title;
    } else {
      const stack = stackRenderAt(now / 1000);
      renderTo(
        target, t, data, schedule, inscriptions, modeOverride,
        talkMode, wantsNav, stack, null, displayProfile,
      );
      nav?.update(t);
      if (displayProfile === "room" && !wantsNav) {
        const st = stateAt(t, schedule);
        const mode = modeAt(t, schedule, modeOverride);
        const season = st.year === null ? "NO COORDINATES" : data.byYear.get(st.year)?.season ?? String(st.year);
        contextLabel.hidden = false;
        contextLabel.textContent = `${MODE_TITLES[mode].toUpperCase()} · `
          + `${ACT_TITLES[st.act].toUpperCase()} · ${season}`;
      }
    }
    syncAssetState();
    // Keep READY/DEGRADED through the first paint. On the following rAF the
    // destination already contains a committed real frame, so removing the
    // static surface can reveal neither black nor a half-built cache.
    if (!firstFrameComposed) firstFrameComposed = true;
    else if (!startup.hidden) startup.hidden = true;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/**
 * The one thing a viewer should ever see go wrong.
 *
 * `main()` was launched with a bare `void main();`, so an initialisation failure
 * left a black canvas and a console nobody in a gallery is reading. That is the
 * worst of both: it looks like the piece, and it says nothing.
 *
 * A gallery piece may not put a crash report on the wall, so the wall gets one
 * composed line in the piece's own register and nothing else. The REASON goes
 * where somebody can act on it: the console always, and on screen only in the
 * working and lectern modes, which is the same rule the rail already follows.
 *
 * This is for fatal initialisation only. Optional/lazy failures use the visible
 * degraded state and explicit retry surface; they never masquerade as an
 * intentionally sparse plate.
 */
/** Milliseconds of rest before a revealed cursor hides again. */
const POINTER_IDLE_MS = 2000;

/** Exhibit mode hides the cursor. A web visitor who moves a mouse gets it back
 *  until it rests, the way a video player behaves; a wall machine with no
 *  pointer input never sees it. Class toggles only: nothing here touches the
 *  frame. */
function wakePointer(): void {
  let timer: number | undefined;
  window.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || (e.movementX === 0 && e.movementY === 0)) return;
    document.body.classList.add("pointer-awake");
    window.clearTimeout(timer);
    timer = window.setTimeout(() => document.body.classList.remove("pointer-awake"), POINTER_IDLE_MS);
  }, { passive: true });
}

/** On the full work, Escape returns to the overview. Limited to that route so a
 *  direct address (a cited frame) keeps behaving as it always did. */
function returnOnEscape(q: URLSearchParams, display: string): void {
  const home = new URL(location.href);
  home.search = "";
  if (q.get("display")) home.searchParams.set("display", display);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") location.assign(home.toString());
  });
}

function fault(err: unknown): void {
  const reason = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line no-console
  console.error("FADEAWAY did not start:", err);

  const q = new URLSearchParams(location.search);
  if (q.get("probe")) {
    // A probe driver waits on this flag. Without it a failure before the probe
    // module is even reached is indistinguishable from a slow run, and
    // `probe-run.mjs` would sit out its whole timeout waiting for a verdict
    // that is never coming.
    (window as unknown as Record<string, unknown>).__probeDone = false;
    const pre = document.createElement("pre");
    pre.id = "probe-error";
    pre.textContent = `startup failed: ${reason}`;
    document.body.replaceChildren(pre);
    return;
  }

  const el = document.createElement("div");
  el.id = "fault";
  el.dataset.state = "failed";
  el.setAttribute("role", "alert");
  const title = document.createElement("p");
  title.className = "fault-title";
  title.textContent = "FADEAWAY";
  const line = document.createElement("p");
  line.textContent = "THE RECORD DID NOT LOAD";
  el.append(title, line);
  if (q.has("talk") || q.has("nav")) {
    const why = document.createElement("p");
    why.className = "fault-why";
    why.textContent = reason;
    el.append(why);
  }
  document.body.replaceChildren(el);
  // Keep the cursor hidden if this is the wall; show it if somebody is working.
  document.body.classList.toggle("exhibit", !(q.has("talk") || q.has("nav")));
}

void main().catch(fault);
