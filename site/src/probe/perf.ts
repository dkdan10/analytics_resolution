/** Harness B — what one frame of each hand actually costs.
 *
 * The cost it was built for: THE HAND's splotches iterate tens of thousands of
 * records and issue an individual `beginPath`/`arc`/`fill` per mark, every
 * animation frame. A first estimate of that cost used a controlled browser
 * proxy; this harness measures it directly, and measures it far worse, because
 * the proxy was not drawing at the gallery's device pixel ratio. Run it rather
 * than quoting it — the numbers live in the report this prints, not in this
 * comment. Any fix to that cost is graded against this instrument.
 *
 * Two passes per beat, deliberately separate:
 *
 *   TIMED     the real `renderTo` against the real 2D context, nothing wrapped,
 *             so the number is the number.
 *   COUNTED   the same frame drawn once more through a context Proxy that
 *             tallies draw calls. It forwards everything and changes no pixel -
 *             which Harness A confirms - but it is not free, so it never runs
 *             inside the timing loop.
 *
 * The clock is synthetic: frames advance by a fixed 1/60 from the beat, so the
 * measurement is of the renderer and not of how long the browser took to hand
 * back a rAF callback.
 *
 * A BEAT IS AN INSTANT, AND SOME COSTS ARE NOT AT ONE. A surface rebuilt when a
 * stroke dries, a layer baked as a season hands over: each is paid on a single
 * frame somewhere inside a passage, and a short run of frames from a beat
 * either lands on it by luck or never sees it. `&range=<ids>` walks a named
 * passage of `rangesOf` from its first instant to its last instead, one row a
 * range. `&step=<seconds>` sets how far the clock moves per frame, so a long
 * passage can be walked coarsely. `&warmup=<frames>` sets how many frames are
 * drawn and thrown away before timing starts; at zero nothing is, the first
 * timed frame is the one drawn on empty caches, and the row says what it cost
 * as `coldMs` - the frame a viewer arriving at that instant actually waits for.
 */

import { renderTo } from "../render";
import { completedStackState, opsToken, type StackOps } from "../modes/operations";
import type { ModeId } from "../modes";
import { displayFromQuery } from "../display";
import { semanticStopById, semanticTime } from "../semantic";
import {
  cold,
  beatsOf,
  configsOf,
  emit,
  forceResidency,
  FRAME_BUDGET_MS,
  makeTarget,
  MODES,
  narrow,
  PROBE_DPR,
  PROBE_H,
  PROBE_W,
  rangesOf,
  warmUp,
  type Env,
  type Range,
} from "./shared";

const DEFAULT_STEP = 1 / 60;
const DEFAULT_FRAMES = 45;
/** Frames rendered and thrown away before timing starts, so the first-frame
 *  cost of filling a cache is not charged to the steady state. */
const DEFAULT_WARMUP = 5;
/** The most frames one row may be asked to time. A walk longer than this is a
 *  step given in the wrong unit, and it would hold the page for hours before
 *  saying so. */
const MAX_FRAMES = 100_000;
/** Slack on a range's frame count, so a length that is a whole number of steps
 *  in arithmetic is not one frame short in floating point. */
const FRAME_SLACK = 1e-9;

/** Every canvas call the hands actually use. */
const COUNTED = [
  "beginPath", "arc", "fill", "stroke", "fillRect", "drawImage",
  "fillText", "moveTo", "lineTo", "closePath", "rect", "save", "restore",
  "getImageData", "putImageData", "createRadialGradient", "ellipse",
] as const;

function countingCtx(ctx: CanvasRenderingContext2D): {
  proxy: CanvasRenderingContext2D;
  counts: Record<string, number>;
} {
  const counts: Record<string, number> = {};
  const proxy = new Proxy(ctx, {
    get(t, prop, recv) {
      const v = Reflect.get(t, prop, recv);
      if (typeof v === "function" && (COUNTED as readonly string[]).includes(prop as string)) {
        return (...args: unknown[]) => {
          counts[prop as string] = (counts[prop as string] ?? 0) + 1;
          return (v as (...a: unknown[]) => unknown).apply(t, args);
        };
      }
      return typeof v === "function" ? (v as () => unknown).bind(t) : v;
    },
    set(t, prop, value) {
      Reflect.set(t, prop, value);
      return true;
    },
  }) as CanvasRenderingContext2D;
  return { proxy, counts };
}

function quantiles(xs: number[]): { mean: number; p50: number; p95: number; max: number } {
  const s = [...xs].sort((a, b) => a - b);
  const at = (f: number) => s[Math.min(s.length - 1, Math.floor(f * s.length))]!;
  return {
    mean: xs.reduce((a, b) => a + b, 0) / xs.length,
    p50: at(0.5),
    p95: at(0.95),
    max: s[s.length - 1]!,
  };
}

const r2 = (x: number) => Number(x.toFixed(2));

export async function perfProbe(env: Env, q: URLSearchParams): Promise<unknown> {
  const { data, schedule, inscriptions } = env;
  const residency = await forceResidency(data, (s) => console.log(s));

  const frames = Number(q.get("frames")) || DEFAULT_FRAMES;
  // Read with `q.has` for the reason `t` is below: an absent parameter must be
  // the default and never a parsed nothing. A step of zero would time one
  // instant for the whole run, and a warm-up that is not a count would discard
  // a fraction of a frame; both are refused rather than rounded.
  const step = q.has("step") ? Number(q.get("step")) : DEFAULT_STEP;
  if (!Number.isFinite(step) || step <= 0) {
    throw new Error(`step is not a length of time: ${q.get("step")}`);
  }
  const warmup = q.has("warmup") ? Number(q.get("warmup")) : DEFAULT_WARMUP;
  if (!Number.isInteger(warmup) || warmup < 0) {
    throw new Error(`warmup is not a count of frames: ${q.get("warmup")}`);
  }
  const ranged = q.has("range");
  if (ranged) {
    // A range is walked whole, from its own first instant. Each of these
    // names another place to start or another length to run, and a run that
    // quietly obeyed one of the two would be filed under both.
    for (const k of ["t", "stop", "beat", "frames"]) {
      if (q.has(k)) throw new Error(`range walks a whole passage: ${k} does not go with it`);
    }
  }
  // `MODES.filter((m) => m === only)` yielded an empty table and no error on a
  // typo, so a driver read "no rows" as "nothing over budget". An unmatched
  // name now throws and reaches the probe's error path.
  const asked = narrow("hand", MODES, q.get("mode"), (m) => m);
  const beats = narrow("beat", beatsOf(schedule), q.get("beat"), (b) => b.id);
  const ranges: readonly Range[] = ranged
    ? narrow("range", rangesOf(schedule, data), q.get("range"), (r) => r.id)
    : [];
  // A range belongs to one hand. A hand asked for that draws none of the
  // ranges, or a range whose hand was not asked for, would be rows silently
  // missing from a table that looks complete.
  if (ranged && q.has("mode")) {
    const strays = ranges.filter((r) => !asked.includes(r.mode));
    if (strays.length) {
      throw new Error(`range not drawn by a hand asked for: ${strays.map((r) => r.id).join(", ")}`);
    }
    const idle = asked.filter((m) => !ranges.some((r) => r.mode === m));
    if (idle.length) throw new Error(`no range asked for is drawn by: ${idle.join(", ")}`);
  }
  const modes = ranged ? asked.filter((m) => ranges.some((r) => r.mode === m)) : asked;
  // `q.has` first: Number(null) is 0 and Number.isFinite(0) is true, so parsing
  // an absent `t` silently collapses a twelve-beat sweep onto second zero of
  // Act 0 - a frame that draws nothing and times at a hundredth of a
  // millisecond. The same trap `startOffset` guards against in main.ts.
  const atSeconds = Number(q.get("t"));
  const semantic = semanticStopById(q.get("stop"));
  const semanticAt = semantic
    ? semanticTime(semantic, schedule, data.slateFile?.span.seconds)
    : null;
  const chosen = semantic && semanticAt !== null
    ? [{ id: semantic.id, at: semanticAt }]
    : q.has("t") && Number.isFinite(atSeconds)
      ? [{ id: `t=${atSeconds}`, at: atSeconds }]
      : beats;
  const sweep = ranged ? "range" : semantic && semanticAt !== null ? "stop"
    : q.has("t") && Number.isFinite(atSeconds) ? "t" : "beats";
  // What is timed: a beat for a fixed count of frames by every hand, or a
  // range from end to end by the hand that draws it.
  interface Run { mode: ModeId; id: string; at: number; frames: number; range: string | null }
  const runs: Run[] = ranged
    ? ranges.map((r) => ({
      mode: r.mode,
      id: r.id,
      at: r.from,
      // Inclusive of the range's last instant, less what the warm-up takes.
      frames: Math.floor((r.to - r.from) / step + FRAME_SLACK) + 1 - warmup,
      range: r.id,
    }))
    : modes.flatMap((mode) => chosen.map((b) => ({
      mode: mode as ModeId, id: b.id, at: b.at, frames, range: null,
    })));
  const long = runs.filter((r) => r.frames > MAX_FRAMES);
  if (long.length) {
    throw new Error("more frames than one row is allowed to time, at this step: "
      + long.map((r) => `${r.id} (${r.frames})`).join(", "));
  }
  const short = runs.filter((r) => r.frames < 1);
  if (short.length) {
    throw new Error("the warm-up leaves no frame to time in: "
      + short.map((r) => r.id).join(", "));
  }
  const display = displayFromQuery(q, false);

  const target = makeTarget();
  const base = schedule.duration;

  /**
   * THE STACK IS TIMED AT ITS DENSEST CONFIGURATION, NEVER AT ITS DEFAULT.
   *
   * Its default is bare stone — every operation off, by design —
   * which is the cheapest frame in the whole piece. Timing it there would report
   * a hand that costs nothing and say nothing about the frame a presenter can
   * actually build, and the acceptance criterion is explicitly about the densest
   * configuration shipped. So the perf probe asks for ALL RENDERINGS: eight
   * operations composited at once, which is the most this view can ever be asked
   * to draw. Every other hand ignores the argument and is timed exactly as it
   * was before THE STACK's configuration axis existed.
   */
  const dense = (m: ModeId): StackOps => {
    const cs = configsOf(m);
    return cs[cs.length - 1]!.ops;
  };
  // Same warm-up as the purity probe: a first-use cost charged to one beat is
  // not that beat's cost.
  warmUp((t, m) => renderTo(target, t, data, schedule, inscriptions, m,
           false, false, completedStackState(dense(m)), null, display),
         ranged ? ranges.map((r) => ({ id: r.id, at: r.from })) : chosen, base, modes);

  // What the record makes available to a hand at this beat. The draw-op counts
  // below are exact; this is the population they are drawn from.
  const resident = {
    measures: data.measures()?.n ?? 0,
    strokeVertices: data.strokes() ? data.paint?.vertices ?? 0 : 0,
    strokes: data.strokes()?.n ?? 0,
  };

  const rows: unknown[] = [];
  for (const run of runs) {
    const { mode, frames } = run;
    const beat = { id: run.id, at: run.at };
    // Yield between beats, so the page stays answerable while it works.
    await new Promise((r) => setTimeout(r, 0));
    const t0 = base + beat.at;

    cold();
    for (let i = 0; i < warmup; i++) {
      renderTo(target, t0 + i * step, data, schedule, inscriptions, mode as ModeId,
               false, false, completedStackState(dense(mode as ModeId)), null, display);
    }
    const ms: number[] = [];
    for (let i = 0; i < frames; i++) {
      const t = t0 + (warmup + i) * step;
      const a = performance.now();
      renderTo(target, t, data, schedule, inscriptions, mode as ModeId,
               false, false, completedStackState(dense(mode as ModeId)), null, display);
      ms.push(performance.now() - a);
    }
    const q4 = quantiles(ms);
    // A loop, not a spread: a long walk is more arguments than a call takes.
    let worst = 0;
    for (let i = 1; i < ms.length; i++) if (ms[i]! > ms[worst]!) worst = i;

    // Counted separately, so the Proxy never taxes the timing.
    const { proxy, counts } = countingCtx(target.ctx);
    renderTo({ ...target, ctx: proxy }, t0 + warmup * step, data, schedule,
             inscriptions, mode as ModeId, false, false,
             completedStackState(dense(mode as ModeId)), null, display);
    const drawOps = (counts.arc ?? 0) + (counts.fill ?? 0) + (counts.stroke ?? 0)
      + (counts.fillText ?? 0) + (counts.drawImage ?? 0) + (counts.fillRect ?? 0);

    const pointsHere = (() => {
      const year = schedule.segments.find(
        (s) => t0 % schedule.duration >= s.start
          && t0 % schedule.duration < s.start + s.duration,
      )?.year;
      return year === undefined ? 0 : data.points(year)?.n ?? 0;
    })();

    rows.push({
      mode,
      // Which operations were applied. `-` for the six hands that ignore the
      // configuration; for THE STACK this is every one of them, so the row is
      // the worst frame the view can produce rather than its default.
      ops: mode === "stack" ? opsToken(dense(mode as ModeId)) : "-",
      beat: beat.id,
      ...(run.range ? { range: run.range } : {}),
      t: Number(t0.toFixed(4)),
      frames,
      meanMs: r2(q4.mean),
      p50Ms: r2(q4.p50),
      p95Ms: r2(q4.p95),
      maxMs: r2(q4.max),
      overBudget: ms.filter((v) => v > FRAME_BUDGET_MS).length,
      // Where in the pass the slowest frame fell, so a stall can be found
      // again and looked at rather than only counted.
      worstAt: Number((t0 + (warmup + worst) * step).toFixed(4)),
      // The frame drawn on empty caches, which only an unwarmed run times.
      ...(warmup === 0 ? { coldMs: r2(ms[0]!) } : {}),
      drawOps,
      calls: counts,
      recordsResident: { ...resident, pointCellsThisSeason: pointsHere },
    });
  }

  const byMode = Object.fromEntries(
    modes.map((m) => {
      const mine = rows.filter((r) => (r as { mode: string }).mode === m) as {
        meanMs: number; maxMs: number; overBudget: number; frames: number;
      }[];
      return [m, {
        worstMeanMs: Math.max(...mine.map((r) => r.meanMs)),
        worstMaxMs: Math.max(...mine.map((r) => r.maxMs)),
        overBudgetFrames: mine.reduce((a, r) => a + r.overBudget, 0),
        totalFrames: mine.reduce((a, r) => a + r.frames, 0),
      }];
    }),
  );

  return {
    probe: "perf",
    surface: { width: PROBE_W, height: PROBE_H, dpr: PROBE_DPR },
    display,
    frameBudgetMs: r2(FRAME_BUDGET_MS),
    framesPerBeat: ranged ? null : frames,
    warmupFrames: warmup,
    // What the run was, said by the run: a driver holds what it asked for
    // against these, because a page that does not read a parameter answers
    // with its defaults and no complaint.
    sweep,
    stepSeconds: step,
    passOffset: base,
    ...(ranged ? { ranges } : {}),
    residency,
    // There is deliberately no `caveat` field. One used to stand here saying
    // the `hand` rows were measured on a stale decode of paint_strokes.bin and
    // were not a valid baseline. That was true and is not any more: the reader
    // was fixed, and `decodeStrokes` now asserts the layout against paint.json
    // before it reads a byte. An instrument that goes on disclaiming a defect it
    // no longer has is the same class of error this project checks itself for,
    // so the field is GONE rather than reworded - and its absence is the claim.
    byMode,
    rows,
  };
}

export function emitPerf(report: unknown): void {
  emit("probe-perf", report);
}
