/** The probes, and the only door into them.
 *
 * Two diagnostics of the same renderer, not a second renderer:
 *
 *   ?probe=purity   Harness A - is a frame a pure function of one float?
 *   ?probe=perf     Harness B - what does one frame of each hand cost?
 *
 * Both draw through `renderTo` into their own offscreen surface and write a
 * machine-readable verdict into the DOM (`#probe-purity`, `#probe-perf`), the
 * console, and the matching window globals.
 *
 *   ?probe=ranges   Not a measurement: the passages `rangesOf` derives from
 *                   the score, published the same way (`#probe-ranges`), so a
 *                   range can be read before it is asked for by name.
 *
 * `&view=fresh` is read here, once, before any target exists: it gives each
 * target a View of its own in place of the shared one, which is a
 * demonstration arm and never the gallery's condition. It reaches the purity
 * and perf probes, whose targets come from `shared.ts`; the shots probe builds
 * its own View for each picture and is the same under either value.
 *
 * THOSE GLOBALS ARE HYPHENATED: `shared.ts:emit` keys them by the same string
 * it gives the DOM node, so they are `window["probe-purity"]` and
 * `window["probe-perf"]` and are NOT reachable as dotted identifiers. This
 * comment and README.md both said `window.probePurity`, which does not exist
 * and silently reads `undefined` in a driver.
 *
 * `window.__probeDone` is set when a run finishes either way - `true` on a
 * verdict, `false` on an error - so a driver can tell a crash from a slow run.
 * Without it the only completion signal was a DOM node that never appears if
 * the probe throws.
 *
 * `main.ts` imports this module dynamically and only when `?probe=` is present,
 * so the gallery build never fetches the chunk. The exhibit path has no chrome,
 * no probe DOM and no way to reach any of it, which is the point: a diagnostic
 * that can appear in a gallery is not a diagnostic, it is a fault.
 */

import { emitPerf, perfProbe } from "./perf";
import { emitPurity, purityProbe } from "./purity";
import { emit, forceResidency, rangesOf, viewsFromQuery, type Env } from "./shared";

function done(ok: boolean): void {
  (window as unknown as Record<string, unknown>).__probeDone = ok;
}

export async function runProbe(kind: string, q: URLSearchParams, env: Env): Promise<void> {
  try {
    viewsFromQuery(q);
    if (kind === "purity") {
      emitPurity(await purityProbe(env, q));
      done(true);
      return;
    }
    if (kind === "perf") {
      emitPerf(await perfProbe(env, q));
      done(true);
      return;
    }
    // Pictures for a person, not a verdict. It installs `window.__shot` and
    // hands control back to the driver, which asks for one frame at a time.
    if (kind === "shots") {
      const { shotsProbe } = await import("./shots");
      await shotsProbe(env);
      done(true);
      return;
    }
    if (kind === "ranges") {
      // Resident first, as for a measurement: the game ranges are read from
      // the game's own summary, and a listing taken without it would be the
      // short list a measuring probe never sees.
      const residency = await forceResidency(env.data, (s) => console.log(s));
      emit("probe-ranges", {
        probe: "ranges",
        // What a probe adds to a range's bounds to reach the pass it draws.
        passOffset: env.schedule.duration,
        residency,
        ranges: rangesOf(env.schedule, env.data),
      });
      done(true);
      return;
    }
    fail({
      probe: kind,
      error: "unknown probe",
      known: ["purity", "perf", "shots", "ranges"],
      usage: [
        "?probe=purity[&mode=<id>][&beat=<id>][&playback=<s>][&exact=1]",
        "?probe=purity&t=<seconds,...>[&mode=<id>]",
        "?probe=purity&range=<id,...>[&samples=<n>][&mode=<id>]",
        "?probe=perf[&mode=<id>][&t=<seconds>][&frames=<n>]",
        "?probe=shots  (driven by scripts/shots.mjs; installs window.__shot)",
        "?probe=ranges  (lists the ranges; measures nothing)",
        "purity or perf: [&view=fresh]  (a View per target; demonstrations only)",
      ],
    });
  } catch (e) {
    // A probe that throws used to look exactly like a probe that is slow: the
    // only completion signal was a DOM node, and `main.ts` ended with a bare
    // `void main();` with no catch, so the rejection went to the console and a
    // driver waited out its timeout.
    fail({
      probe: kind,
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
    });
  }
}

function fail(report: unknown): void {
  const pre = document.createElement("pre");
  pre.id = "probe-error";
  pre.style.cssText =
    "position:fixed;inset:0;margin:0;padding:16px;overflow:auto;background:#0b0a09;"
    + "color:#e8e2d6;font:11px/1.5 ui-monospace,monospace;white-space:pre-wrap;z-index:9";
  pre.textContent = JSON.stringify(report, null, 2);
  document.body.replaceChildren(pre);
  document.body.classList.remove("exhibit");
  console.error(report);
  done(false);
}
