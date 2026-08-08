/** The probes, and the only door into them.
 *
 * Two diagnostics of the same renderer, not a second renderer:
 *
 *   ?probe=purity   Harness A - is a frame a pure function of one float?
 *   ?probe=perf     Harness B - what does one frame of each hand cost?
 *
 * Both draw through `renderTo` into their own offscreen surface and write a
 * machine-readable verdict into the DOM (`#probe-purity`, `#probe-perf`), the
 * console, and `window.probePurity` / `window.probePerf`.
 *
 * `main.ts` imports this module dynamically and only when `?probe=` is present,
 * so the gallery build never fetches the chunk. The exhibit path has no chrome,
 * no probe DOM and no way to reach any of it, which is the point: a diagnostic
 * that can appear in a gallery is not a diagnostic, it is a fault.
 */

import { emitPerf, perfProbe } from "./perf";
import { emitPurity, purityProbe } from "./purity";
import type { Env } from "./shared";

export async function runProbe(kind: string, q: URLSearchParams, env: Env): Promise<void> {
  if (kind === "purity") {
    emitPurity(await purityProbe(env, q));
    return;
  }
  if (kind === "perf") {
    emitPerf(await perfProbe(env, q));
    return;
  }
  const report = {
    probe: kind,
    error: "unknown probe",
    known: ["purity", "perf"],
    usage: ["?probe=purity", "?probe=perf[&mode=<id>][&t=<seconds>][&frames=<n>]"],
  };
  const pre = document.createElement("pre");
  pre.id = "probe-error";
  pre.textContent = JSON.stringify(report, null, 2);
  document.body.replaceChildren(pre);
  document.body.classList.remove("exhibit");
  // eslint-disable-next-line no-console
  console.error(report);
}
