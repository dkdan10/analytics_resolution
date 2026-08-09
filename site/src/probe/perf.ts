/** Harness B — what one frame of each hand actually costs.
 *
 * Audit finding F-14: THE HAND's splotches iterate tens of thousands of records
 * and issue an individual `beginPath`/`arc`/`fill` per mark, every animation
 * frame. The audit estimated the cost with a controlled browser proxy; this
 * harness measures it directly, and measures it far worse, because the proxy
 * was not drawing at the gallery's device pixel ratio. Run it rather than
 * quoting it — the numbers live in the report this prints, not in this comment.
 * The fix is session 4's; this is the instrument it will be graded against.
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
 */

import { renderTo } from "../render";
import { opsToken, type StackOps } from "../modes/operations";
import type { ModeId } from "../modes";
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
  warmUp,
  type Env,
} from "./shared";

const STEP = 1 / 60;
const DEFAULT_FRAMES = 45;
/** Frames rendered and thrown away before timing starts, so the first-frame
 *  cost of filling a cache is not charged to the steady state. */
const WARMUP = 5;

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
  // `MODES.filter((m) => m === only)` yielded an empty table and no error on a
  // typo, so a driver read "no rows" as "nothing over budget". An unmatched
  // name now throws and reaches the probe's error path.
  const modes = narrow("hand", MODES, q.get("mode"), (m) => m);
  const beats = narrow("beat", beatsOf(schedule), q.get("beat"), (b) => b.id);
  // `q.has` first: Number(null) is 0 and Number.isFinite(0) is true, so parsing
  // an absent `t` silently collapses a twelve-beat sweep onto second zero of
  // Act 0 - a frame that draws nothing and times at a hundredth of a
  // millisecond. The same trap `startOffset` guards against in main.ts.
  const atSeconds = Number(q.get("t"));
  const chosen = q.has("t") && Number.isFinite(atSeconds)
    ? [{ id: `t=${atSeconds}`, at: atSeconds }]
    : beats;

  const target = makeTarget();
  const base = schedule.duration;

  /**
   * THE STACK IS TIMED AT ITS DENSEST CONFIGURATION, NEVER AT ITS DEFAULT.
   *
   * Its default is bare stone — every operation off, by the artist's ruling —
   * which is the cheapest frame in the whole piece. Timing it there would report
   * a hand that costs nothing and say nothing about the frame a presenter can
   * actually build, and the acceptance criterion is explicitly about the densest
   * configuration shipped. So the perf probe asks for ALL RENDERINGS: seven
   * operations composited at once, which is the most this view can ever be asked
   * to draw. Every other hand ignores the argument and is timed exactly as it
   * was before session 6.
   */
  const dense = (m: ModeId): StackOps => {
    const cs = configsOf(m);
    return cs[cs.length - 1]!.ops;
  };
  // Same warm-up as the purity probe: a first-use cost charged to one beat is
  // not that beat's cost.
  warmUp((t, m) => renderTo(target, t, data, schedule, inscriptions, m, false, dense(m)),
         chosen, base, modes);

  // What the record makes available to a hand at this beat. The draw-op counts
  // below are exact; this is the population they are drawn from.
  const resident = {
    measures: data.measures()?.n ?? 0,
    strokeVertices: data.strokes() ? data.paint?.vertices ?? 0 : 0,
    strokes: data.strokes()?.n ?? 0,
  };

  const rows: unknown[] = [];
  for (const mode of modes) {
    for (const beat of chosen) {
      // Yield between beats, so the page stays answerable while it works.
      await new Promise((r) => setTimeout(r, 0));
      const t0 = base + beat.at;

      cold();
      for (let i = 0; i < WARMUP; i++) {
        renderTo(target, t0 + i * STEP, data, schedule, inscriptions, mode as ModeId,
                 false, dense(mode as ModeId));
      }
      const ms: number[] = [];
      for (let i = 0; i < frames; i++) {
        const t = t0 + (WARMUP + i) * STEP;
        const a = performance.now();
        renderTo(target, t, data, schedule, inscriptions, mode as ModeId,
                 false, dense(mode as ModeId));
        ms.push(performance.now() - a);
      }
      const q4 = quantiles(ms);

      // Counted separately, so the Proxy never taxes the timing.
      const { proxy, counts } = countingCtx(target.ctx);
      renderTo({ ...target, ctx: proxy }, t0 + WARMUP * STEP, data, schedule,
               inscriptions, mode as ModeId, false, dense(mode as ModeId));
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
        t: Number(t0.toFixed(4)),
        frames,
        meanMs: r2(q4.mean),
        p50Ms: r2(q4.p50),
        p95Ms: r2(q4.p95),
        maxMs: r2(q4.max),
        overBudget: ms.filter((v) => v > FRAME_BUDGET_MS).length,
        drawOps,
        calls: counts,
        recordsResident: { ...resident, pointCellsThisSeason: pointsHere },
      });
    }
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
    frameBudgetMs: r2(FRAME_BUDGET_MS),
    framesPerBeat: frames,
    warmupFrames: WARMUP,
    residency,
    // The `caveat` field that stood here through session 3 said the `hand` rows
    // were measured on a stale decode of paint_strokes.bin and were not a valid
    // baseline. That was true and is not any more: session 4 landed the reader,
    // and `decodeStrokes` now asserts the layout against paint.json before it
    // reads a byte. An instrument that goes on disclaiming a defect it no longer
    // has is the same class of error this project audits itself for, so the
    // field is GONE rather than reworded - and its absence is the claim.
    byMode,
    rows,
  };
}

export function emitPerf(report: unknown): void {
  emit("probe-perf", report);
}
