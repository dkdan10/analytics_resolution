/** THE PLATE — evidence.
 *
 * The engraving as originally built, and now also the reference against which
 * the other hands read as interpretations: bone on warm black, each mark placed
 * at the resolution the record actually managed.
 */

import { drawBloom } from "../bloom";
import { drawInscriptions, drawSlug } from "../inscription";
import { drawMarks, drawPin } from "../marks";
import { secondsFor } from "../timeline";
import { terminalShell } from "./shared";
import type { Frame } from "./types";

export function drawPlateHand(f: Frame): void {
  const { ctx, view, dpr, st, data, inscriptions, remains } = f;
  const year = st.year!;
  const season = data.byYear.get(year)!;

  ctx.save();
  ctx.globalAlpha = remains;
  // Cut into the plate, so every later season's shots settle over them.
  drawInscriptions(ctx, view, inscriptions, st.t);
  ctx.restore();

  // Act III dims the field slightly: the rest of the league is still only dots,
  // and the gestures have to be the brightest thing the window holds.
  const inWindow = st.act === 3 && data.traces !== null;
  const fieldDim = (inWindow ? 1 - 0.55 * Math.min(1, st.phase * 4) : 1) * remains;

  // The season being replaced recedes as this one lands, so the plate is never
  // empty and the drift is continuous rather than a pulse at each boundary.
  if (st.prev !== null) {
    const prevSeason = data.byYear.get(st.prev);
    const prevSample = data.samples.get(st.prev);
    if (prevSeason && prevSample) {
      const fading = (1 - st.arrived) * fieldDim;
      drawMarks(ctx, view, prevSample, prevSeason, { dpr, opacity: fading });
      drawPin(ctx, view, prevSample, { dpr, opacity: fading });
    }
  }

  const sample = data.samples.get(year);
  if (sample) {
    drawMarks(ctx, view, sample, season, { dpr, opacity: fieldDim, arrived: st.arrived });
    drawPin(ctx, view, sample, { dpr, opacity: fieldDim, arrived: st.arrived });
  }

  if (inWindow && data.traces) {
    drawBloom(ctx, view, data.traces.traces, { phase: st.phase, duration: secondsFor(year) });
  }

  // The terminal beat. The public feed's last archive is a 32-byte shell: a file
  // that exists and holds nothing. Named, not dramatised — both the filename and
  // the byte count come from the corpus probe.
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
