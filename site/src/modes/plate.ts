/** THE PLATE — evidence.
 *
 * The engraving as originally built, and now also the reference against which
 * the other hands read as interpretations: bone on warm black, each mark placed
 * at the resolution the record actually managed.
 */

import { drawBloom } from "../bloom";
import {
  drawGameEvents,
  GAME_PREFIX_STEPS,
  GAME_WET_S,
  gameAssetId,
  gameClock,
  gameTotalFrames,
  plateStroke,
  possessionFrames,
  strokeSpans,
  timeFrac,
} from "../game";
import { drawInscriptions, drawSlug } from "../inscription";
import { prefixSurface } from "../prefix";
import { GAME_DRIED } from "../scalars";
import { secondsFor } from "../timeline";
import { drawSeasonField } from "./fieldlayer";
import { HAND_PHASES } from "./hand";
import { terminalShell } from "./shared";
import { drawQuarrel } from "./stack";
import type { Frame } from "./types";

/** Where in the window's phase the terminal shell strikes. Exported for the
 *  talk rail's PLATE interior (THE SECOND SCORE) — one definition, two
 *  readers, the `WINDOW_BEATS` discipline. Paired with `bloom.ts:SPREAD`. */
export const SHELL_PHASE = 0.9;

export function drawPlateHand(f: Frame): void {
  const { ctx, view, dpr, st, data, inscriptions, remains } = f;
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

  // Every shot in the season — arriving mark by mark in the record's own
  // emphasis order (stage B), with the one it replaces receding beneath it so
  // the plate is never empty and the drift stays continuous.
  // In the window, THE RESIDENCE goes down beneath it all: where the ball
  // lived, under where the shots ended.
  drawSeasonField(f, { dim: fieldDim, residence: true, reveal: true });

  // THE GAME'S SHARE (session 15 — the artist's strongest want: ALL the
  // information on the plate). The found game's every body and the ball, in
  // bone at the traces' own weights — bodies fainter and thinner, the ball
  // brighter and wider — with pass beads and shot anchors, phased by the
  // hand's exported HAND_PHASES: the possession at true rate through "one",
  // the full game on its eased clock through "the game", held dried through
  // the window, washed at the close. The ratified ball residence beneath is
  // untouched, and there is deliberately NO body wash on this plate — two
  // densities under one field would compete (rival flagged in the packet).
  const gf = data.gameFile;
  const gm = st.act === 3 ? data.game() : null;
  let tracesDim = 1;
  if (gm && gf && st.act === 3) {
    const pGame = HAND_PHASES[1];
    const pNight = HAND_PHASES[2];
    const pClose = HAND_PHASES[4];
    const p = st.phase;
    const gameU = Math.max(0, Math.min(1, (p - pGame.from) / (pGame.to - pGame.from)));
    const closeU = Math.max(0, Math.min(1, (p - pClose.from) / (pClose.to - pClose.from)));
    const total = gameTotalFrames(gf);
    const gameFrame = gameU > 0 ? gameClock(gameU) * total : 0;
    const env = remains * (1 - closeU);
    const sp = strokeSpans(gm, gf);
    const pos = possessionFrames(gf);
    const oneFrames = p * secondsFor(year) * gf.hz;
    const clipUpto = Math.min(pos.f1, pos.f0 + oneFrames);

    const dw = Math.max(1, Math.round(view.width * dpr));
    const dh = Math.max(1, Math.round(view.height * dpr));
    const geom = `${Math.round(view.width)}x${Math.round(view.height)}|${dpr}`;
    const stepFrames = Math.ceil(total / GAME_PREFIX_STEPS);
    const gSteps = Math.floor(gameFrame / stepFrames);
    const baked = prefixSurface(
      `plate.game|${gameAssetId(gm)}|${geom}`, gSteps, dw, dh, dpr, stepFrames,
      (c, a, b) => {
        for (let i = 0; i < gm.n; i++) {
          const end = sp.start[i]! + sp.dur[i]!;
          if (end >= a && end < b) plateStroke(c, view, gm, i, 1, 1);
        }
      },
    );
    if (baked && env > 0.002) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, env * GAME_DRIED);
      ctx.drawImage(baked, 0, 0, view.width, view.height);
      ctx.restore();
    }

    // The live edge of the game phase, and the possession clip of "one" —
    // each clip stroke leaves this layer the moment the game's own clock
    // reaches it (replaced by itself, record for record).
    const bakedBefore = gSteps * stepFrames;
    const wetFrames = GAME_WET_S * gf.hz;
    for (let i = 0; i < gm.n; i++) {
      const at0 = sp.start[i]!;
      const end = at0 + sp.dur[i]!;
      if (at0 < gameFrame) {
        if (end < bakedBefore) continue; // dried into the baked surface
        // The live tail dries exactly as the hand's does: full ink at the
        // edge, settling to GAME_DRIED behind it.
        const wetness = Math.max(0, 1 - Math.max(0, gameFrame - end) / wetFrames);
        plateStroke(ctx, view, gm, i, timeFrac(gm, i, gameFrame - at0),
          env * (GAME_DRIED + (1 - GAME_DRIED) * wetness));
      } else if (at0 < clipUpto && end > pos.f0) {
        // A TIME-clip on both sides, the hand's own rule.
        const drawn = timeFrac(gm, i, clipUpto - at0);
        if (drawn > 0) {
          plateStroke(ctx, view, gm, i, drawn, env, timeFrac(gm, i, pos.f0 - at0));
        }
      }
    }
    // ALL the annotations persist on this plate (the artist's want), but they
    // DRY with the motion they mark: every mark at the dried register, then
    // the wet edge's and the possession's own at full, over it.
    drawGameEvents(ctx, view, gf, gameFrame, env * GAME_DRIED);
    drawGameEvents(ctx, view, gf, gameFrame, env,
      { from: pos.f0, to: clipUpto }, gameFrame - wetFrames);

    // The 32 curated traces YIELD while the game holds the plate: an
    // index-spread schedule and a date-anchored game are two clocks, and one
    // surface may not run both. The coexist rival is one constant away and is
    // flagged in the session-15 packet.
    tracesDim = p >= pGame.from && p < pNight.to ? 0 : 1;
  }

  if (inWindow && data.traces) {
    drawBloom(ctx, view, data.traces.traces,
      { phase: st.phase, duration: secondsFor(year), dim: tracesDim });
  }

  // THE PACKET CANDIDATE, and nothing else. Reachable only through the shots
  // probe's request field (`types.ts:Frame.candidate`) — no URL parameter
  // feeds it, so the gallery and the talk cannot show this frame. Whether the
  // quarrel lives here or stays in THE STACK's rail is the artist's call
  // (session-10 packet); this exists so that call can be made from frames.
  if (f.candidate === "quarrel" && inWindow) drawQuarrel(f);

  // The terminal beat. The public feed's last archive is a 32-byte shell: a file
  // that exists and holds nothing. Named, not dramatised — both the filename and
  // the byte count come from the corpus probe.
  if (st.act === 3 && data.corpus) {
    const last = terminalShell(data.corpus);
    if (last) {
      // The shell arrives while the last gesture is still fading — the plate
      // hands itself from the corpus's last trace to the record's last file
      // with no dead interval between them. Paired with `bloom.ts:SPREAD`.
      const closing = Math.max(0, Math.min(1, (st.phase - SHELL_PHASE) / 0.05));
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
