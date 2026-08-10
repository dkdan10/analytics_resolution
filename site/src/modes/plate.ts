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
import { drawSeasonField } from "./fieldlayer";
import { HAND_PHASES } from "./hand";
import { terminalShell } from "./shared";
import { drawQuarrel } from "./stack";
import type { Frame } from "./types";

/** Where in the window's phase the terminal shell strikes. Exported for the
 *  talk rail's PLATE interior (THE SECOND SCORE) — one definition, two
 *  readers, the `WINDOW_BEATS` discipline. Paired with `bloom.ts:SPREAD`. */
export const SHELL_PHASE = 0.9;

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
  // depth RELEASES across the close (third audit D-01): ordinary light comes
  // back while the window's layers wash off, so the boundary at the window's
  // exit is an ordinary season boundary and never a second cut — the piece's
  // law is one cut, at the burst.
  const inWindow = st.act === 3 && data.traces !== null;
  const pClose = HAND_PHASES[4];
  const closeU = st.act === 3
    ? Math.max(0, Math.min(1, (st.phase - pClose.from) / (pClose.to - pClose.from)))
    : 0;
  const fieldDim =
    (inWindow ? 1 - 0.55 * Math.min(1, st.phase * 4) * (1 - closeU) : 1) * remains;

  // THE GAME'S SHARE's clock, computed BEFORE the field goes down: the entry
  // yield mask (session 17) needs the same reach the strokes below will
  // draw, and one computation serving both is what keeps the wake and the
  // stroke from drifting apart.
  const gf = data.gameFile;
  const gm = st.act === 3 ? data.game() : null;
  const p = st.phase;
  const clock = gm && gf && st.act === 3
    ? (() => {
        const pGame = HAND_PHASES[1];
        const total = gameTotalFrames(gf);
        const gameU = Math.max(0, Math.min(1, (p - pGame.from) / (pGame.to - pGame.from)));
        const gameFrame = gameU > 0 ? gameClock(gameU) * total : 0;
        const sp = strokeSpans(gm, gf);
        const pos = possessionFrames(gf);
        const oneFrames = p * secondsFor(year) * gf.hz;
        return {
          total, gameFrame, sp, pos,
          dryFrame: gameFrame + Math.max(0, p - pGame.to) * secondsFor(year) * gf.hz,
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
  // residence's own cell-splat radius. Recomputed from scratch every frame —
  // pure in t.
  const yieldMask = clock && gm && st.arrived < 1
    ? (mctx: CanvasRenderingContext2D): void => {
        const R = residenceSplatRadius(view, dpr);
        mctx.lineCap = "round";
        mctx.lineJoin = "round";
        const passes: Array<[number, number]> = [
          [YIELD_PENUMBRA_W * R, OLD_YIELD_STRENGTH * YIELD_PENUMBRA_A],
          [YIELD_CORE_W * R, OLD_YIELD_STRENGTH],
        ];
        for (const [wDev, strength] of passes) {
          mctx.strokeStyle = `rgba(0, 0, 0, ${strength})`;
          mctx.lineWidth = wDev / dpr;
          for (let i = 0; i < gm.n; i++) {
            const at0 = clock.sp.start[i]!;
            const end = at0 + clock.sp.dur[i]!;
            if (at0 < clock.gameFrame) {
              if (strokePath(mctx, view, gm, i, timeFrac(gm, i, clock.gameFrame - at0))) {
                mctx.stroke();
              }
            } else if (at0 < clock.clipUpto && end > clock.pos.f0) {
              const drawn = timeFrac(gm, i, clock.clipUpto - at0);
              if (drawn > 0 && strokePath(mctx, view, gm, i, drawn,
                timeFrac(gm, i, clock.pos.f0 - at0))) {
                mctx.stroke();
              }
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
  // brighter and wider — with pass beads and shot anchors, phased by the
  // hand's exported HAND_PHASES: the possession at true rate through "one",
  // the full game on its eased clock through "the game", held dried through
  // the window, washed at the close. The ratified ball residence beneath is
  // untouched, and there is deliberately NO body wash on this plate — two
  // densities under one field would compete (rival flagged in the packet).
  let tracesDim = 1;
  if (gm && gf && clock) {
    const pGame = HAND_PHASES[1];
    const pNight = HAND_PHASES[2];
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
    const env = remains * (1 - closeU);

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

    // The 32 curated traces YIELD while the game holds the plate: an
    // index-spread schedule and a date-anchored game are two clocks, and one
    // surface may not run both. The coexist rival is one constant away and is
    // flagged in the session-15 packet. EASED at both edges over one second of
    // the window (third audit D-05): a trace mid-flight at a yield boundary
    // dims over a beat instead of popping in a frame; inside the span the
    // yield still reaches exactly zero.
    const yieldRamp = 1 / secondsFor(year);
    tracesDim = Math.max(0, Math.min(1,
      Math.max(pGame.from - p, p - pNight.to) / yieldRamp));
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
