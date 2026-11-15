/** THE PLATE — evidence.
 *
 * The engraving as originally built, and now also the reference against which
 * the other hands read as interpretations: bone on warm black, each mark placed
 * at the resolution the record actually managed.
 */

import { drawBloom } from "../bloom";
import {
  drawGameEvents,
  drawGameEventsWet,
  GAME_PREFIX_STEPS,
  gameAssetId,
  gameClock,
  gameTotalFrames,
  gameWetness,
  plateInk,
  plateStroke,
  possessionFrames,
  strokeReach,
  strokeSpans,
  STROKE_START,
  wetExcess,
  WHOLE_STROKE,
  type Reach,
} from "../game";
import { drawInscriptions, drawSlug } from "../inscription";
import { prefixSurface } from "../prefix";
import { GAME_DRIED, PLATE_WINDOW_FIELD_DIM } from "../scalars";
import { secondsFor, WINDOW_YEAR } from "../timeline";
import {
  PLATE_GAME_FROM_PHASE,
  PLATE_GAME_TO_PHASE,
  PLATE_SHELL_FULL_PHASE,
  PLATE_SHELL_SPAN,
  PLATE_WITHDRAW_SPAN,
  WINDOW_BEATS,
  progressInWindowSpan,
  windowOneClipSeconds,
} from "../window-score";
import { drawSeasonField } from "./fieldlayer";
import { drawActCue } from "./shared";
import { drawQuarrel } from "./stack";
import type { Frame } from "./types";

/**
 * How much of the field THE PLATE keeps while the window stands over it, at
 * one instant of the window. The depth comes on with the window, releases
 * across the early close, and holds once the shell is whole: the receipt
 * needs a stable field behind it rather than a background still changing
 * during its terminal hold. One definition for the window's own frames and
 * for the season after it, which recedes the field at the depth the close
 * left it at.
 */
function windowFieldKept(phase: number): number {
  const pClose = WINDOW_BEATS[3];
  const release = Math.max(0, Math.min(1,
    (Math.min(phase, PLATE_SHELL_FULL_PHASE) - pClose.from)
    / (pClose.to - pClose.from)));
  return 1 - PLATE_WINDOW_FIELD_DIM * Math.min(1, phase * 4) * (1 - release);
}

export function drawPlateHand(f: Frame): void {
  const { ctx, view, dpr, st, data, inscriptions, remains } = f;
  const year = st.year!;

  ctx.save();
  ctx.globalAlpha = remains;
  // Cut into the plate, so every later season's shots settle over them.
  drawInscriptions(ctx, view, inscriptions, st.t);
  ctx.restore();

  // Act III dims the field slightly: the rest of the league is still only dots,
  // and the gestures have to be the brightest thing the window holds
  // (`windowFieldKept`).
  const inWindow = st.act === 3 && data.traces !== null;
  // The season after the window, while the window's season recedes under it.
  const leaving = st.prev === WINDOW_YEAR && data.traces !== null;
  const withdrawU = st.act === 3
    ? progressInWindowSpan(st.phase, PLATE_WITHDRAW_SPAN)
    : 0;
  const fieldDim = (inWindow ? windowFieldKept(st.phase) : 1) * remains;
  // The window's season leaves at the depth its close held it at, so the
  // season after it arrives over the plate the close left and the field does
  // not come up in one frame as the window ends.
  const recedingDim = leaving ? windowFieldKept(1) * remains : fieldDim;

  // THE GAME'S SHARE's clock. The three reaches the strokes below draw to are
  // defined here and nowhere else: the live head on the game's clock, and the
  // possession clip's two ends on the clip's.
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
        const oneFrames = windowOneClipSeconds(p) * gf.hz;
        const clipUpto = Math.min(pos.f1, pos.f0 + oneFrames);
        return {
          total, gameFrame, sp, pos,
          // Seconds on the screen since the eased clock passed a share of the
          // game phase, and still counting after the phase is over.
          ageOf: (u: number): number =>
            (p - (PLATE_GAME_FROM_PHASE
              + u * (PLATE_GAME_TO_PHASE - PLATE_GAME_FROM_PHASE))) * secondsFor(year),
          clipUpto,
          liveHead: (i: number, at0: number): Reach =>
            strokeReach(gm, i, gameFrame - at0),
          clipHead: (i: number, at0: number): Reach =>
            strokeReach(gm, i, clipUpto - at0),
          clipTail: (i: number, at0: number): Reach =>
            strokeReach(gm, i, pos.f0 - at0),
        };
      })()
    : null;

  // Every shot in the season — arriving mark by mark in the record's own
  // emphasis order (stage B), with the one it replaces receding beneath it so
  // the plate is never empty and the drift stays continuous.
  // In the window, THE RESIDENCE goes down beneath it all: where the ball
  // lived, under where the shots ended. The preceding season recedes on the
  // window's shared entry span (THE FIELD and THE LEDGER, which draw nothing
  // of their own in the first beat, give it the whole beat instead), and the
  // one possession waits out its lead, so the first stroke is laid over a
  // field that has already sunk.
  drawSeasonField(f, {
    dim: fieldDim, previousDim: recedingDim, residence: true, reveal: true, prewarm: true,
  });

  // THE GAME'S SHARE (THE PLATE's brief, above all others: ALL the
  // information on the plate). The found game's every body and the ball, in
  // bone at the traces' own weights — bodies fainter and thinner, the ball
  // brighter and wider — with pass beads and shot anchors, phased by THE
  // PLATE's score: the preceding season's lead, the possession at true rate,
  // the possession held clean, then the full
  // game on its eased clock through the shared season boundary, held dried
  // through the window and washed at the close. The ball residence beneath is
  // untouched, and there is deliberately NO body wash on this plate — two
  // densities under one field would compete.
  if (gm && gf && clock) {
    const { total, gameFrame, sp, pos, ageOf, clipUpto } = clock;
    const { liveHead, clipHead, clipTail } = clock;
    // DRYING IS COUNTED ON THE SCREEN (`ageOf`), not on the feed. A stroke
    // starts to dry at the instant the eased clock passes its last recorded
    // frame and reaches GAME_DRIED over GAME_WET_SECONDS, whatever rate the
    // feed is running at and whether or not the game phase is over — so the
    // buzzer's stroke settles like every other. Only drying reads that age;
    // the drawn prefix and the clip keep `gameFrame`, so no stroke gains
    // vertices it has not earned. All computed once, above, with the clock.
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
          if (end >= a && end < b) plateStroke(c, view, gm, i, WHOLE_STROKE, 1);
        }
      },
    );
    if (baked && env > 0.002) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, env * GAME_DRIED);
      ctx.drawImage(baked, 0, 0, view.width, view.height);
      ctx.restore();
    }

    // The live edge of the game phase, and the possession clip of "one".
    // The clip holds until the game's own clock has walked the whole
    // possession, and gives way to the walk a vertex at a time: while a
    // stroke's live head is inside the possession the clip draws only what
    // lies ahead of it, so the two meet at the head and every part of the
    // possession is drawn by one of them on every frame. The clip cannot
    // simply end when the walk reaches a stroke's first vertex: a stroke that
    // began long before the possession would then stand undrawn until the
    // walk had covered that whole pre-history.
    const bakedBefore = gSteps * stepFrames;
    for (let i = 0; i < gm.n; i++) {
      const at0 = sp.start[i]!;
      const end = at0 + sp.dur[i]!;
      if (at0 < gameFrame) {
        // Full ink at the edge, settling to GAME_DRIED behind it.
        const wetness = gameWetness(ageOf(sp.endU[i]!));
        if (end < bakedBefore) {
          // Already in the baked surface, which goes down at the dried
          // register: lay only what is still wet over it, so a stroke that
          // is baked while wet goes on drying instead of dropping to dried.
          if (wetness > 0) {
            plateStroke(ctx, view, gm, i, WHOLE_STROKE,
              env * wetExcess(plateInk(gm, i), wetness, env));
          }
          continue;
        }
        plateStroke(ctx, view, gm, i, liveHead(i, at0),
          env * (GAME_DRIED + (1 - GAME_DRIED) * wetness));
      }
      if (gameFrame < clipUpto && at0 < clipUpto && end > pos.f0) {
        // A TIME-clip on both sides, the hand's own rule. A stroke the clip
        // has not entered has its two ends at one place and draws nothing,
        // and so does one the walk has already carried past the clip's head.
        const from = clipTail(i, at0);
        const walked = at0 < gameFrame ? liveHead(i, at0) : STROKE_START;
        plateStroke(ctx, view, gm, i, clipHead(i, at0), env,
          walked > from ? walked : from);
      }
    }
    // ALL the annotations persist on this plate (its brief, above), but they
    // DRY with the motion they mark: every mark at the dried register, then
    // each one that is still wet over it at its own wetness, on the strokes'
    // own drying time, and the possession's own held whole until the game's
    // clock reaches them.
    drawGameEvents(ctx, view, gf, gameFrame, env * GAME_DRIED);
    drawGameEventsWet(ctx, view, gf, gameFrame, env,
      { from: pos.f0, to: clipUpto }, (u) => gameWetness(ageOf(u)));

  }

  if (inWindow && data.traces) {
    drawBloom(ctx, view, data.traces.traces,
      { phase: st.phase, duration: secondsFor(year) });
  }

  // THE QUARREL CANDIDATE, and nothing else. Reachable only through the shots
  // probe's request field (`types.ts:Frame.candidate`) — no URL parameter
  // feeds it, so the gallery and the talk cannot show this frame. Whether the
  // quarrel lives here or stays in THE STACK's rail is an open composition
  // decision; this exists so that decision can be made from captured frames.
  if (f.candidate === "quarrel" && inWindow) drawQuarrel(f);

  // The terminal beat: the last day of public tracking data. The date is the
  // corpus probe's last game day in the public files, and the line under it
  // says only that: no later day was ever public. When the feed itself was
  // switched off is a later date, which this receipt does not claim.
  //
  // After the window it leaves as it came: over as many seconds as it took to
  // arrive, counted from the window's end, while the field it stood over
  // begins to sink under the next season.
  const shellSeconds = (PLATE_SHELL_SPAN.to - PLATE_SHELL_SPAN.from) * secondsFor(WINDOW_YEAR);
  const receipt = st.act === 3
    ? progressInWindowSpan(st.phase, PLATE_SHELL_SPAN)
    : st.prev === WINDOW_YEAR
      ? 1 - Math.min(1, st.phase * secondsFor(year) / shellSeconds)
      : 0;
  if (data.corpus && receipt > 0) {
    // The receipt arrives while the last gesture is still fading — the plate
    // hands itself from the corpus's last trace to its last public day with no
    // dead interval between them. Both anchors live in window-score.
    drawSlug(
      ctx,
      view,
      [data.corpus.date_range[1], "THE LAST DAY OF PUBLIC TRACKING DATA"],
      // Set up from its last line, which stands above the three-point arc's
      // crown and the settled numeral annulus: whatever size the display
      // profile gives the type, the receipt crosses neither during the hold.
      { x: 0, y: 250 },
      receipt,
      "statement",
      0,
      0,
      true,
    );
  }

  // The act boundaries named, over everything: the plate has no native
  // boundary event at either act.
  drawActCue(f, 2);
  drawActCue(f, 5);
}
