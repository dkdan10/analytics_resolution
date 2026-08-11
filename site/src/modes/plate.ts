/** THE PLATE — evidence.
 *
 * The engraving as originally built, and now also the reference against which
 * the other hands read as interpretations: bone on warm black, each mark placed
 * at the resolution the record actually managed.
 */

import { drawBloom } from "../bloom";
import { residenceSplatRadius } from "../field";
import {
  drawGameEvents,
  GAME_PREFIX_STEPS,
  GAME_WET_S,
  gameAssetId,
  gameClock,
  gameTotalFrames,
  plateStroke,
  possessionFrames,
  strokePath,
  strokeSpans,
  timeFrac,
} from "../game";
import { drawInscriptions, drawSlug } from "../inscription";
import { prefixSurface } from "../prefix";
import { GAME_DRIED, OLD_YIELD_STRENGTH } from "../scalars";
import { secondsFor } from "../timeline";
import {
  PLATE_GAME_FROM_PHASE,
  PLATE_GAME_TO_PHASE,
  PLATE_SHELL_FROM_PHASE,
  PLATE_SHELL_FULL_PHASE,
  PLATE_SHELL_SPAN,
  PLATE_WITHDRAW_SPAN,
  WINDOW_BEATS,
  progressInWindowSpan,
} from "../window-score";
import { drawSeasonField } from "./fieldlayer";
import { drawActCue, terminalShell } from "./shared";
import { drawQuarrel } from "./stack";
import type { Frame } from "./types";

/** Where in the window's phase the terminal shell strikes. Exported for the
 *  talk rail's PLATE interior (THE SECOND SCORE) — one definition, two
 *  readers. The source is window-score.ts; this alias preserves the rail API. */
export const SHELL_PHASE = PLATE_SHELL_FROM_PHASE;

/**
 * The entry yield's fixed two-width penumbra: the wake erases at full
 * OLD_YIELD_STRENGTH inside CORE_W times the residence's cell-splat radius,
 * and at PENUMBRA_A of it out to PENUMBRA_W — an eased edge with no filters,
 * per the approved session-17 design. The profile is the wake's shape, held
 * constant like the strike beats; the STRENGTH is the one authored scalar,
 * declared in the register.
 */
const YIELD_CORE_W = 2;
const YIELD_PENUMBRA_W = 3.2;
const YIELD_PENUMBRA_A = 0.35;

export function drawPlateHand(f: Frame): void {
  const { ctx, view, dpr, st, data, inscriptions, remains } = f;
  const year = st.year!;

  ctx.save();
  ctx.globalAlpha = remains;
  // Cut into the plate, so every later season's shots settle over them.
  drawInscriptions(ctx, view, inscriptions, st.t);
  ctx.restore();

  // Act III dims the field slightly: the rest of the league is still only dots,
  // and the gestures have to be the brightest thing the window holds. The
  // depth RELEASES across the early close (third audit D-01), then holds once
  // the shell is whole: the receipt needs a stable field behind it rather than
  // a background still changing during its terminal hold.
  const inWindow = st.act === 3 && data.traces !== null;
  const pClose = WINDOW_BEATS[3];
  const withdrawU = st.act === 3
    ? progressInWindowSpan(st.phase, PLATE_WITHDRAW_SPAN)
    : 0;
  // Preserve the existing brightness release only until the terminal shell is
  // fully present, then freeze it. The final scored hold keeps one stable,
  // slightly subordinate field behind the receipt instead of continuing to
  // brighten under text that is supposed to hold.
  const fieldReleaseU = st.act === 3
    ? Math.max(0, Math.min(1,
      (Math.min(st.phase, PLATE_SHELL_FULL_PHASE) - pClose.from)
      / (pClose.to - pClose.from)))
    : 0;
  const fieldDim =
    (inWindow ? 1 - 0.55 * Math.min(1, st.phase * 4) * (1 - fieldReleaseU) : 1) * remains;

  // THE GAME'S SHARE's clock, computed BEFORE the field goes down: the entry
  // yield mask (session 17) needs the same reach the strokes below will
  // draw, and one computation serving both is what keeps the wake and the
  // stroke from drifting apart.
  const gf = data.gameFile;
  const gm = st.act === 3 ? data.game() : null;
  const p = st.phase;
  const clock = gm && gf && st.act === 3
    ? (() => {
        const total = gameTotalFrames(gf);
        const gameU = Math.max(0, Math.min(1,
          (p - PLATE_GAME_FROM_PHASE) / (PLATE_GAME_TO_PHASE - PLATE_GAME_FROM_PHASE)));
        const gameFrame = gameU > 0 ? gameClock(gameU) * total : 0;
        const sp = strokeSpans(gm, gf);
        const pos = possessionFrames(gf);
        const oneFrames = p * secondsFor(year) * gf.hz;
        return {
          total, gameFrame, sp, pos,
          dryFrame: gameFrame
            + Math.max(0, p - PLATE_GAME_TO_PHASE) * secondsFor(year) * gf.hz,
          clipUpto: Math.min(pos.f1, pos.f0 + oneFrames),
        };
      })()
    : null;

  // THE OLD SEASON YIELDS TO THE BODY (session 17, the entry ruling): while
  // the previous season is still receding, its layer dries locally along
  // every body/ball vertex the clock has reached — the exact reach the
  // stroke loop below draws, walked through the same `strokePath`. An
  // accumulating patina in the wake, never a tracking spotlight: strength
  // below 1, an eased two-width penumbra, widths derived from the
  // residence's own cell-splat radius.
  //
  // THE WAKE'S DRIED MASS IS BAKED, NOT RESTROKED (perf, measured this
  // session: restroking the whole web at wake widths twice per frame put
  // plate's window-night mean at 31 ms and window-season at 61 ms). The
  // finished strokes' wake accumulates in a `prefixSurface` mask — the
  // plate.game surface's own steps, the F-04-clean recursion — drawn onto
  // the scratch as ONE `destination-out` blit; only the live edge and the
  // possession clip stroke per frame, the same handful the plate itself
  // draws. Erasure compounding is a product of (1 − a) factors, so grouping
  // the passes into a mask is the same arithmetic as stroking them
  // sequentially; the mask's bytes are a pure function of (asset, geometry,
  // step) and the purity probe's four histories judge exactly that.
  const yieldMask = clock && gm && st.arrived < 1
    ? (mctx: CanvasRenderingContext2D): void => {
        const R = residenceSplatRadius(view, dpr);
        const passes: Array<[number, number]> = [
          [YIELD_PENUMBRA_W * R, OLD_YIELD_STRENGTH * YIELD_PENUMBRA_A],
          [YIELD_CORE_W * R, OLD_YIELD_STRENGTH],
        ];
        // Under destination-out only the source ALPHA erases; in the baked
        // mask the same strokes accumulate that alpha with source-over.
        const wakeStroke = (
          c: CanvasRenderingContext2D, i: number, drawn: number, from = 0,
        ): void => {
          c.lineCap = "round";
          c.lineJoin = "round";
          for (const [wDev, strength] of passes) {
            c.strokeStyle = `rgba(255, 255, 255, ${strength})`;
            c.lineWidth = wDev / dpr;
            if (strokePath(c, view, gm, i, drawn, from)) c.stroke();
          }
        };
        const dw = Math.max(1, Math.round(view.width * dpr));
        const dh = Math.max(1, Math.round(view.height * dpr));
        const geom = `${Math.round(view.width)}x${Math.round(view.height)}|${dpr}`;
        const stepFrames = Math.ceil(clock.total / GAME_PREFIX_STEPS);
        const gSteps = Math.floor(clock.gameFrame / stepFrames);
        const baked = prefixSurface(
          `plate.wake|${gameAssetId(gm)}|${geom}`, gSteps, dw, dh, dpr, stepFrames,
          (c, a, b) => {
            for (let i = 0; i < gm.n; i++) {
              const end = clock.sp.start[i]! + clock.sp.dur[i]!;
              if (end >= a && end < b) wakeStroke(c, i, 1);
            }
          },
        );
        if (baked) mctx.drawImage(baked, 0, 0, view.width, view.height);
        const bakedBefore = gSteps * stepFrames;
        for (let i = 0; i < gm.n; i++) {
          const at0 = clock.sp.start[i]!;
          const end = at0 + clock.sp.dur[i]!;
          if (at0 < clock.gameFrame) {
            if (end < bakedBefore) continue; // dried into the baked mask
            wakeStroke(mctx, i, timeFrac(gm, i, clock.gameFrame - at0));
          } else if (at0 < clock.clipUpto && end > clock.pos.f0) {
            const drawn = timeFrac(gm, i, clock.clipUpto - at0);
            if (drawn > 0) {
              wakeStroke(mctx, i, drawn, timeFrac(gm, i, clock.pos.f0 - at0));
            }
          }
        }
      }
    : undefined;

  // Every shot in the season — arriving mark by mark in the record's own
  // emphasis order (stage B), with the one it replaces receding beneath it so
  // the plate is never empty and the drift stays continuous.
  // In the window, THE RESIDENCE goes down beneath it all: where the ball
  // lived, under where the shots ended.
  drawSeasonField(f, { dim: fieldDim, residence: true, reveal: true, yieldMask });

  // THE GAME'S SHARE (session 15 — the artist's strongest want: ALL the
  // information on the plate). The found game's every body and the ball, in
  // bone at the traces' own weights — bodies fainter and thinner, the ball
  // brighter and wider — with pass beads and shot anchors, phased by THE
  // PLATE's score: five seconds of possession, five held clean, then the full
  // game on its eased clock through the shared season boundary, held dried
  // through the window and washed at the close. The ball residence beneath is
  // untouched, and there is deliberately NO body wash on this plate — two
  // densities under one field would compete (rival flagged in the packet).
  if (gm && gf && clock) {
    const { total, gameFrame, sp, pos, dryFrame, clipUpto } = clock;
    // THE DRYING CLOCK (`dryFrame`) CONTINUES past the game's end (third
    // audit D-02): the buzzer's stroke is not "just happening" for the rest
    // of the window. Past the game phase it advances at TRUE RATE — one
    // second of phase is one second of feed, the night's own convention — so
    // every stroke settles to GAME_DRIED within GAME_WET_S of presentation
    // time after the game ends. Only drying reads that clock; the drawn
    // prefix and the clip keep `gameFrame`, so no stroke gains vertices it
    // has not earned. All computed once, above, where the yield mask shares
    // them.
    const env = remains * (1 - withdrawU);

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
        // edge, settling to GAME_DRIED behind it — on the drying clock, which
        // keeps moving after the game's own clock stops.
        const wetness = Math.max(0, 1 - Math.max(0, dryFrame - end) / wetFrames);
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
      { from: pos.f0, to: clipUpto }, dryFrame - wetFrames);

  }

  if (inWindow && data.traces) {
    drawBloom(ctx, view, data.traces.traces,
      { phase: st.phase, duration: secondsFor(year) });
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
      // with no dead interval between them. Both anchors live in window-score.
      const closing = progressInWindowSpan(st.phase, PLATE_SHELL_SPAN);
      drawSlug(
        ctx,
        view,
        [data.corpus.date_range[1], last, `${data.corpus.empty_shell_bytes} BYTES · NO CONTENT`],
        // Above the settled numeral annulus: the receipt's final line must not
        // cross the evidence it concludes during the terminal hold.
        { x: 0, y: 250 },
        closing,
      );
    }
  }

  // The boundaries named (S1), over everything: the plate has no native
  // boundary event at either act.
  drawActCue(f, 2);
  drawActCue(f, 5);
}
