/** FADEAWAY - one rAF loop over one float.
 *
 * Modes: exhibit by default (wall clock, no chrome), talk with ?talk (keys).
 * Both call the same render(t); nothing is reachable in one mode that the
 * other cannot reach.
 */

import { drawBloom } from "./bloom";
import { exhibitClock, TalkClock, type Clock } from "./clock";
import { load, type Corpus, type Loaded } from "./data";
import {
  buildInscriptions,
  drawInscriptions,
  drawSlug,
  type Inscription,
} from "./inscription";
import { drawMarks, drawPin } from "./marks";
import { GROUND } from "./palette";
import { drawPlate, makeView, SHORTENED_THREE_R, type View } from "./plate";
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
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  view = makeView(w, h);
}

/** The empty archive dated the day the window closed.
 *
 *  Selected by parsing the MM.DD.YYYY prefix against the corpus's own last
 *  date, never by sorting the filenames: those strings are month-first, so
 *  lexicographic order is not chronological and a shell from December would
 *  sort after one from January. */
function terminalShell(corpus: Corpus): string | null {
  const iso = corpus.date_range[1];
  for (const name of corpus.empty_32B_shells) {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})\./.exec(name);
    if (m && `${m[3]}-${m[1]}-${m[2]}` === iso) return name;
  }
  return null;
}

function render(t: number, data: Loaded, schedule: Schedule, inscriptions: Inscription[]): void {
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
  const season = data.byYear.get(year)!;

  // The arc carries the geometry in force: 1996-97 played to a 22-ft line that
  // the modern taxonomy has since drawn over.
  const threeR = year === 1996 ? SHORTENED_THREE_R : undefined;
  drawPlate(ctx, view, threeR);

  // The coda empties the plate back to bare stone so the loop turns over
  // without a seam - everything the piece drew recedes, the engraving stays.
  const remains = 1 - st.coda;
  if (remains <= 0.001) return;

  ctx.save();
  ctx.globalAlpha = remains;
  // Cut into the plate, so every later season's shots settle over them.
  drawInscriptions(ctx, view, inscriptions, st.t);
  ctx.restore();

  // Act III dims the field slightly: the rest of the league is still only dots,
  // and the gestures have to be the brightest thing the window holds.
  const inWindow = st.act === 3 && data.traces !== null;
  const fieldDim = (inWindow ? 1 - 0.55 * Math.min(1, st.phase * 4) : 1) * remains;

  const sample = data.samples.get(year);
  if (sample) {
    const opacity = (1 - st.blend) * fieldDim;
    drawMarks(ctx, view, sample, season, { dpr, opacity });
    drawPin(ctx, view, sample, { dpr, opacity });
  }

  if (st.blend > 0 && st.next !== null) {
    const nextSeason = data.byYear.get(st.next);
    const nextSample = data.samples.get(st.next);
    if (nextSeason && nextSample) {
      drawMarks(ctx, view, nextSample, nextSeason, { dpr, opacity: st.blend * remains });
      drawPin(ctx, view, nextSample, { dpr, opacity: st.blend * remains });
    }
  }

  if (inWindow && data.traces) {
    drawBloom(ctx, view, data.traces.traces, {
      phase: st.phase,
      duration: secondsFor(year),
    });
  }

  // The terminal beat. The public feed's last archive is a 32-byte shell: a
  // file that exists and holds nothing. It is named, not dramatised - both the
  // filename and the byte count come from the corpus probe.
  if (st.act === 3 && data.corpus) {
    const last = terminalShell(data.corpus);
    if (last) {
      const closing = Math.max(0, Math.min(1, (st.phase - 0.93) / 0.05));
      drawSlug(
        ctx,
        view,
        [data.corpus.date_range[1], last, `${data.corpus.empty_shell_bytes} BYTES · NO CONTENT`],
        { x: 0, y: 210 },
        closing,
      );
    }
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
  const year = q.get("year");
  if (year !== null) return seekTo(Number(year), schedule);
  const t = q.get("t");
  if (t !== null) return Number(t);
  return 0;
}

async function main(): Promise<void> {
  const data = await load();
  const schedule = buildSchedule(data.seasons);

  const talk = new URLSearchParams(location.search).has("talk");
  const offset = startOffset(schedule);
  let clock: Clock;
  if (talk) {
    const tc = new TalkClock(offset);
    bindTalkKeys(tc, schedule);
    clock = tc;
  } else {
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
    render(clock.at(now), data, schedule, inscriptions);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void main();
