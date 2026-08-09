/** FADEAWAY - one rAF loop over one float.
 *
 * Modes: exhibit by default (wall clock, no chrome), talk with ?talk (keys).
 * Both call the same render(t); nothing is reachable in one mode that the
 * other cannot reach.
 */

import { exhibitClock, TalkClock, type Clock } from "./clock";
import { load } from "./data";
import { buildInscriptions } from "./inscription";
import { isModeId, modeAt, MODE_IDS, MODE_TITLES, type ModeId } from "./modes";
import { Navigator } from "./navigator";
import { makeView } from "./plate";
import { renderTo, type Target } from "./render";
import { clearAtlas } from "./textatlas";
import {
  ACT0_SECONDS,
  buildSchedule,
  secondsFor,
  seekAct,
  seekTo,
  WINDOW_YEAR,
  type Act,
  type Schedule,
} from "./timeline";

const canvas = document.getElementById("plate") as HTMLCanvasElement;
const ctx = canvas.getContext("2d", { alpha: false })!;

const target: Target = { ctx, view: makeView(1, 1), dpr: 1 };

function resize(): void {
  target.dpr = Math.min(window.devicePixelRatio || 1, 2);
  // Measure the canvas's own box, not the window's: with the navigator open the
  // plate has the rail beside it and would otherwise be drawn off-centre.
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  canvas.width = Math.round(w * target.dpr);
  canvas.height = Math.round(h * target.dpr);
  ctx.setTransform(target.dpr, 0, 0, target.dpr, 0, 0);
  target.view = makeView(w, h);
  // Every atlas key carries its size, so a resize invalidates all of them.
  clearAtlas();
}

/**
 * The presenter's keyboard.
 *
 * Two gaps V-09 names, both closed here: the window's four beats had no key at
 * all — the one segment long enough to have an inside, and the only way in was
 * to find it with a mouse — and neither did the hand. Beats take the digits
 * straight after the acts, so the number row reads as the piece's own order:
 * 0 the start, 1-5 the acts, then the inside of act 3.
 *
 * `cycleMode` is passed in rather than reached for, because the rail owns the
 * mode override and there is exactly one of it.
 */
function bindTalkKeys(clock: TalkClock, schedule: Schedule, cycleMode: () => void): void {
  const beats = Navigator.starts(schedule).filter((s) => {
    const w = schedule.byYear.get(WINDOW_YEAR);
    return w ? s >= w.start && s < w.start + w.duration : false;
  });
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
        clock.nudge(secondsFor(2000));
        break;
      case ",":
        clock.nudge(-secondsFor(2000));
        break;
      case "w":
        clock.seek(seekTo(2015, schedule));
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

/** Deterministic entry: ?t=<seconds> or ?year=<season start year>.
 *  Lets the talk open on a beat, and lets any frame be re-examined exactly. */
function startOffset(schedule: Schedule): number {
  const q = new URLSearchParams(location.search);
  // A bad value must never reach the clock: NaN propagates through every
  // downstream comparison, freezes the piece on one frame, and in exhibit mode
  // there is no key to press to get it back.
  const year = Number(q.get("year"));
  if (Number.isFinite(year) && schedule.byYear.has(year)) return seekTo(year, schedule);
  // Not wrapped into a single loop: `stateAt` already takes the modulo, and the
  // un-wrapped value is what selects the pass, so `?t=` can reach a later hand.
  const t = Number(q.get("t"));
  if (Number.isFinite(t)) return Math.max(0, t);
  return 0;
}

async function main(): Promise<void> {
  const data = await load();
  const schedule = buildSchedule(data.seasons);

  const q = new URLSearchParams(location.search);

  // The probes, and the only place they are reachable from.
  //
  // Dynamically imported, so the gallery build never fetches the chunk and the
  // exhibit path cannot arrive here by accident. They return instead of
  // starting the loop: a probe run is not the piece running, it is the piece
  // being measured, and it must not also be animating while it is measured.
  const probe = q.get("probe");
  if (probe) {
    const { runProbe } = await import("./probe");
    await runProbe(probe, q, {
      data,
      schedule,
      inscriptions: buildInscriptions(data.seasons, schedule),
    });
    return;
  }
  // The rail belongs to the working and lectern modes. Exhibit shows nothing
  // that looks like it wants to be touched, so it never gets one.
  const wantsNav = (q.has("talk") || q.has("nav")) && q.get("nav") !== "0";
  const offset = startOffset(schedule);

  // With no override the loop rotates hands, so the mode axis stays a pure
  // function of the same float and the rail keeps scrubbing it. Pinning one is
  // the presenter's affordance, not the gallery's.
  const requested = q.get("mode");
  let modeOverride: ModeId | null = isModeId(requested) ? requested : null;

  let clock: Clock;
  let nav: Navigator | null = null;
  if (q.has("talk") || wantsNav) {
    const tc = new TalkClock(offset);
    // The hand key and the rail's hand row are the same action, so they share
    // one implementation rather than two that can drift.
    const cycleMode = () => {
      const i = modeOverride === null ? 0 : MODE_IDS.indexOf(modeOverride) + 1;
      modeOverride = i >= MODE_IDS.length ? null : MODE_IDS[i]!;
    };
    bindTalkKeys(tc, schedule, cycleMode);
    clock = tc;
    if (wantsNav) {
      document.body.classList.remove("exhibit");
      const starts = Navigator.starts(schedule);
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
        // Steps through the hands and then back to letting the loop rotate,
        // so the gallery behaviour is always one click away. Same function the
        // H key calls.
        cycleMode,
        nudgeSegment: (dir) => {
          const now = ((tc.seconds % schedule.duration) + schedule.duration) % schedule.duration;
          // Step by segment INDEX, never by elapsed seconds. A seek leaves the
          // clock running, so any time-window test makes each press depend on
          // how long ago the last one was: presses more than the window apart
          // kept re-seeking to the segment you were already in, and rewinding
          // only worked if you drummed the button.
          let i = 0;
          for (let k = 0; k < starts.length; k++) if (starts[k]! <= now + 0.01) i = k;
          tc.seek(starts[i + dir] ?? (dir === 1 ? 0 : starts[starts.length - 1]!));
        },
      }, data.facts);
    }
  } else {
    document.body.classList.add("exhibit");
    clock = exhibitClock(performance.now(), offset);
  }

  resize();
  window.addEventListener("resize", resize);

  console.log(
    `FADEAWAY - ${data.seasons.length} seasons, runtime ${Math.round(schedule.duration)}s ` +
      `(Act 0 ${ACT0_SECONDS}s), mode ${clock.mode}`,
  );

  const inscriptions = buildInscriptions(data.seasons, schedule);
  const frame = (now: number) => {
    const t = clock.at(now);
    renderTo(target, t, data, schedule, inscriptions, modeOverride, wantsNav);
    nav?.update(t);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/**
 * The one thing a viewer should ever see go wrong (audit F-15).
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
 * This is for initialisation only. A merely-slow asset never reaches here —
 * `data.ts` fetches the lazy binaries on demand and latches a failed one, so a
 * gallery that is still loading is a plate with fewer marks on it, which is what
 * the piece looks like at the start of every season anyway.
 */
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
