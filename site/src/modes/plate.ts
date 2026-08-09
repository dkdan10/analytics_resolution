/** THE PLATE — evidence.
 *
 * The engraving as originally built, and now also the reference against which
 * the other hands read as interpretations: bone on warm black, each mark placed
 * at the resolution the record actually managed.
 */

import { drawBloom } from "../bloom";
import { drawInscriptions, drawSlug } from "../inscription";
import { secondsFor } from "../timeline";
import { drawSeasonField } from "./fieldlayer";
import { terminalShell } from "./shared";
import type { Frame } from "./types";

export function drawPlateHand(f: Frame): void {
  const { ctx, view, st, data, inscriptions, remains } = f;
  const year = st.year!;

  ctx.save();
  ctx.globalAlpha = remains;
  // Cut into the plate, so every later season's shots settle over them.
  drawInscriptions(ctx, view, inscriptions, st.t);
  ctx.restore();

  // Act III dims the field slightly: the rest of the league is still only dots,
  // and the gestures have to be the brightest thing the window holds.
  const inWindow = st.act === 3 && data.traces !== null;
  const fieldDim = (inWindow ? 1 - 0.55 * Math.min(1, st.phase * 4) : 1) * remains;

  // Every shot in the season, developing, with the one it replaces receding
  // beneath it so the plate is never empty and the drift stays continuous.
  // In the window, THE RESIDENCE goes down beneath it all: where the ball
  // lived, under where the shots ended.
  drawSeasonField(f, { dim: fieldDim, residence: true });

  if (inWindow && data.traces) {
    drawBloom(ctx, view, data.traces.traces, { phase: st.phase, duration: secondsFor(year) });
  }

  // The terminal beat. The public feed's last archive is a 32-byte shell: a file
  // that exists and holds nothing. Named, not dramatised — both the filename and
  // the byte count come from the corpus probe.
  if (st.act === 3 && data.corpus) {
    const last = terminalShell(data.corpus);
    if (last) {
      // The shell arrives while the last gesture is still fading — the plate
      // hands itself from the corpus's last trace to the record's last file
      // with no dead interval between them. Paired with `bloom.ts:SPREAD`.
      const closing = Math.max(0, Math.min(1, (st.phase - 0.90) / 0.05));
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
