/** FADEAWAY - one rAF loop over one float.
 *
 * Modes: exhibit by default (wall clock, no chrome), talk with ?talk (keys).
 * Both call the same render(t); nothing is reachable in one mode that the
 * other cannot reach.
 */

import { exhibitClock, TalkClock, type Clock } from "./clock";
import { load, type Loaded } from "./data";
import { buildInscriptions, drawSlug, type Inscription } from "./inscription";
import { drawHand, isModeId, modeAt, MODE_IDS, MODE_TITLES, type ModeId } from "./modes";
import { Navigator } from "./navigator";
import { GROUND } from "./palette";
import { drawPlate, makeView, SHORTENED_THREE_R, type View } from "./plate";
import { clearAtlas } from "./textatlas";
import {
  ACT0_SECONDS,
  buildSchedule,
  secondsFor,
  seekAct,
  seekTo,
  stateAt,
  type Act,
  type Schedule,
} from "./timeline";

/** External history: the league's founding year. Nothing in the shot record
 *  reaches back this far - that is the point of Act 0 - so it cannot be
 *  derived, and it is the only date in the piece that is not a measurement. */
const LEAGUE_FOUNDED = 1946;

const canvas = document.getElementById("plate") as HTMLCanvasElement;
const ctx = canvas.getContext("2d", { alpha: false })!;

let view: View = makeView(1, 1);
let dpr = 1;

function resize(): void {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  // Measure the canvas's own box, not the window's: with the navigator open the
  // plate has the rail beside it and would otherwise be drawn off-centre.
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  view = makeView(w, h);
  // Every atlas key carries its size, so a resize invalidates all of them.
  clearAtlas();
}

function render(
  t: number,
  data: Loaded,
  schedule: Schedule,
  inscriptions: Inscription[],
  modeOverride: ModeId | null,
): void {
  const st = stateAt(t, schedule);

  ctx.fillStyle = GROUND;
  ctx.fillRect(0, 0, view.width, view.height);

  // Act 0 holds no coordinates, so the plate holds no marks. The engraving
  // itself arrives over the prelude - the court before anything is recorded on it.
  if (st.act === 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, st.preludePhase * 1.6);
    drawPlate(ctx, view);
    ctx.restore();
    // Fifty years of basketball and not one coordinate. The plate is bare
    // because the record is - this is the absence, not a stylised version of it.
    // The closing year is the first season the record holds, read from the data;
    // 1946 is the league's founding, external history the dumps cannot supply.
    const p = st.preludePhase;
    const firstCharted = data.seasons[0]?.year;
    drawSlug(
      ctx,
      view,
      [`${LEAGUE_FOUNDED} — ${firstCharted ?? ""}`, "NO SHOT WAS GIVEN A PLACE"],
      { x: 0, y: 200 },
      Math.min(1, p * 4) * Math.min(1, (1 - p) * 5),
    );
    return;
  }

  const year = st.year!;

  // The arc carries the geometry in force: 1996-97 played to a 22-ft line that
  // the modern taxonomy has since drawn over.
  const threeR = year === 1996 ? SHORTENED_THREE_R : undefined;
  // The engraving recedes through the coda too, so the wrap arrives on near-bare
  // stone rather than on a fully drawn court.
  ctx.save();
  ctx.globalAlpha = 1 - 0.85 * st.coda;
  drawPlate(ctx, view, threeR);
  ctx.restore();

  // The coda empties the plate back to bare stone so the loop turns over
  // without a seam - everything the piece drew recedes, the engraving stays.
  const remains = 1 - st.coda;

  // The hand for this moment. Everything above is shared by all of them: the
  // ground, the prelude, the era's arc.
  if (remains > 0.001) {
    drawHand(modeAt(t, schedule, modeOverride), {
      ctx, view, dpr, st, data, schedule, inscriptions, remains,
    });
  }
}

function bindTalkKeys(clock: TalkClock, schedule: Schedule): void {
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    switch (e.key) {
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
    bindTalkKeys(tc, schedule);
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
        cycleMode: () => {
          // Steps through the hands and then back to letting the loop rotate,
          // so the gallery behaviour is always one click away.
          const i = modeOverride === null ? 0 : MODE_IDS.indexOf(modeOverride) + 1;
          modeOverride = i >= MODE_IDS.length ? null : MODE_IDS[i]!;
        },
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
      });
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
    render(t, data, schedule, inscriptions, modeOverride);
    nav?.update(t);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void main();
