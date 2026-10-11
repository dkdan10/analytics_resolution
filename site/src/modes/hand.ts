/** THE HAND — the bodies the record could not keep.
 *
 * Every other hand draws what the archive holds. This one draws what it lost.
 *
 * In every season but one a shot is a point and there is nothing between the
 * points, so those seasons are drops and nothing else. For the span of the
 * window the optical feed held the motion too, and only there can the paint
 * that connects the endpoints be laid at all. The painting's subject is the
 * absence everywhere else.
 *
 * THE PAINT IS PHYSICS, NOT TASTE
 *
 * The feed is the brush and its flow rate is 25 Hz, so paint is deposited per
 * unit TIME, never per unit distance:
 *
 *     ink   = DRIP · dt          conserved against time
 *     w · a = ink / arc = DRIP / v
 *
 * A body that runs lays a thin faint filament; a body that pivots on the spot
 * pools. Split as a round filament — a falling stream keeps its cross-section —
 * so radius and alpha each go as 1/sqrt(v). Three regimes fall out of that, and
 * their boundaries are the record's own measured speed percentiles, not chosen
 * numbers:
 *
 *     POOL      below p10   the filament caps and the excess becomes a blot
 *     FILAMENT  p10 to p90  a continuous tapered ribbon
 *     BREAK     above p90   a stream cannot stay a cylinder longer than its
 *                           circumference (Plateau–Rayleigh), so it beads
 *
 * TWO CONSERVATIONS, AND THE DIFFERENCE BETWEEN THEM IS THE ARGUMENT
 *
 * A drop outside the window and a drop inside it both conserve ink, and they
 * split it the other way up, because the thing their radius carries is not the
 * same thing.
 *
 *   OUTSIDE   a drop stands for a COORDINATE and the record says only how many
 *             shots landed there. Radius carries the count — area rises with
 *             it — and opacity is CONSTANT. Every drop is equally wet; they
 *             differ only in size, and where the record concentrated they run
 *             together and cover.
 *   INSIDE    a drop stands for ONE SHOT, and its radius carries something the
 *             record only says here: how open the shooter was. The weight is
 *             the same for every shot, so opacity must absorb what radius
 *             spends — alpha falls as 1/r², and a contested shot is a hot tight
 *             dot while an open one is a broad pale wash.
 *
 * That inversion is also what keeps this hand from being THE FIELD with a
 * different caption. THE FIELD varies BRIGHTNESS at a fixed size, tone-mapped,
 * compositing additively so marks add light. This one varies SIZE at a fixed
 * opacity and composites `source-over`, so marks OCCLUDE. Same measured driver,
 * opposite material, and only one of them can cover.
 *
 * COLOUR IS THE LEAGUE'S OWN MAP
 *
 * Hue is SHOT_ZONE_BASIC read at the vertex. That is legitimate for exactly the
 * reason THE FIELD's colour is: the zones are a partition of the FLOOR the NBA
 * drew, so a body crossing the court crosses the league's own regions, and
 * qa.py gates the reconstruction against the league's own labels (the agreement
 * rate is printed by the gate, not restated here). Colour adds no
 * classification. It exposes one that was already imposed — and one continuous
 * stroke recolours along its own length, indigo to gold, because that is the
 * map the players are moving across.
 *
 * PAINT COVERS
 *
 * Every other hand composites with `lighter`, because a mark there is a deposit
 * of light on a plate. Paint is not light; it occludes. This hand is the one
 * deliberate departure: a stroke crossing an earlier stroke must cover it, or
 * the canvas is a glow instead of a painting.
 *
 * ONE DOCUMENTED EXCEPTION INSIDE THE EXCEPTION: THE WASH — the
 * four scales' dried ground — blits `lighter` inside its own save/restore
 * (src/wash.ts). The wash is not paint; it is the ground the strokes dry
 * into, and a ground that occluded the drops beneath it would invert the
 * record-keeps-endpoints reading. The composite op is set and restored
 * entirely inside wash.ts, so this hand's own regime is untouched around it.
 *
 * PURE, AND NOW ACTUALLY SO
 *
 * This file used to keep one module-level canvas and extend it as the playhead
 * moved forward, calling that "a rebuild, not a memory". It was a memory: the
 * purity probe found `forward` differing from a cold render by tens of
 * thousands of channels at every window beat while `backward` and `continuous`
 * agreed, which is the signature of a surface drawn on across two JS turns.
 * Both layers now accumulate through `src/prefix.ts`, whose one
 * invariant is that a cached surface is built in a single burst onto a cleared
 * canvas and never drawn on again. See that file for why that is the strong
 * form and how the recursion makes forward and backward the same picture.
 *
 * WHAT ARRIVAL IS PACED BY
 *
 * Not the stroke index. `paint_index.bin:day` indexes the corroborated corpus's
 * own game-days and `paint.json:day_offsets` puts each of them on the window's
 * calendar, which is the same clock `window_measures.bin:day` counts on. So the
 * dots and the paint arrive together, on the days they were actually recorded,
 * and the window's own unevenness — some days one possession, some days six,
 * and four days on which nobody played and the painting simply stops — is a
 * measurement rather than an easing curve.
 */

import { factNum, type PaintFile, type Slate, type Strokes, type WindowFile } from "../data";
import {
  drawGameEvents,
  GAME_PREFIX_STEPS,
  GAME_WET_S,
  gameClock,
  gameTotalFrames,
  possessionFrames,
  strokeSpans,
  timeFrac,
} from "../game";
import { drawSlug } from "../inscription";
import { BONE_RGB, ZONE_RGB } from "../palette";
import { COURT, type View } from "../plate";
import { prefixCacheGeneration, prefixSurface } from "../prefix";
import { dayCells, drawWashCells, drawWashFold, gridCells } from "../wash";
// One implementation of the league's map, checked against the Python one
// through a committed fixture. See site/src/zone.ts.
import { zoneAt } from "../zone";
import {
  BEAD_CAP,
  BORE,
  DRIP,
  DROP_ALPHA,
  DROP_AREA,
  DROP_MAX_R,
  DROP_MIN_R,
  FILAMENT_ALPHA_CAP,
  FILAMENT_ALPHA_K,
  ONE_INK,
  GAME_DRIED,
  KEPT_OVER_PAINT,
  POOL_ALPHA_CAP,
  POOL_ALPHA_K,
  POOL_EXCESS_K,
  POOL_R_CAP,
  POOL_V_FLOOR,
  RAYLEIGH,
  SPLOTCH_ALPHA_CAP_WINDOW,
  SPLOTCH_INK,
  SPLOTCH_MAX_R,
  SPLOTCH_MIN_R,
  SPLOTCH_VISIBLE,
} from "../scalars";
import { secondsFor, WINDOW_YEAR } from "../timeline";
import { pinCoordOf } from "./fieldlayer";
import { arrivedThrough, cumulativeByDay, drawActCue, seasonClock } from "./shared";
import type { Frame } from "./types";
import {
  HAND_INVENTORY_FULL_CLOSE_LOCAL,
  HAND_NIGHT_SECONDS,
  HAND_NIGHT_GROUND_ALPHA,
  HAND_WINDOW_PHASES,
  WINDOW_CREST_PHASE,
  handWindowPhases,
} from "../window-score";

const ZONE = ZONE_RGB.map((s) => s.split(",").map((v) => Number(v.trim())));
/** The ball, and the fallback for a coordinate no zone claims: the plate's own
 *  bone, taken from the palette rather than written out a third time. */
const BONE = BONE_RGB.split(",").map((v) => Number(v.trim()));

/**
 * THE AUTHORED SCALARS IN THIS HAND ARE DECLARED IN src/scalars.ts.
 *
 * This file used to announce DRIP as "the one authored scalar", eight lines
 * above a comment recording that BORE had been looked at by eye — which was two
 * claims and only one of them true. DRIP is the brush's flow rate
 * and BORE its width, and both were chosen; the regime boundaries and the
 * splotch scale are measured and come from the artifacts; RAYLEIGH is physics.
 * Each is classified and disclosed in the register, with what it controls.
 *
 * The constants below are NOT material: they quantise how much work one frame
 * may do, and moving them changes no mark's radius, opacity or colour. They are
 * here rather than in the register for that reason, and each says what it buys.
 */

/**
 * How much of a layer one cached step carries.
 *
 * The live tail — everything past the last whole step — is redrawn every frame,
 * so this is the per-frame work bound, and the number of steps is what a cold
 * or backward jump has to walk. Measured on this machine at the probe's
 * surface: a drop costs about a microsecond and a copy about a millisecond and
 * a half, which is what these two are balanced against.
 *
 * Do NOT reach for batching. Grouping the drops into one path per colour and
 * issuing a single `fill` was measured as several times SLOWER than a path per
 * drop, because a path carrying tens of thousands of subpaths pays for
 * tessellation the per-drop version never does.
 */
const DROP_STEP = 2048;
/** The same, for strokes. Smaller, because the tail is also the wet edge — the
 *  gesture still being laid — and it is redrawn at a partial length. */
const STROKE_STEP = 128;
/** How much of a stroke's own length the wet edge has drawn when it is this far
 *  behind the arrival point. A gesture arrives over a few strokes' worth of
 *  time rather than appearing whole. */
const WET_STROKES = 6;

export interface Regimes {
  v10: number;
  v50: number;
  v90: number;
}

/** Radius and alpha for a measured speed, conserving ink against time. */
function filament(v: number, r: Regimes): { rad: number; alpha: number } {
  const k = Math.sqrt(r.v50 / Math.max(v, r.v10));
  return {
    rad: BORE * k,
    alpha: Math.min(FILAMENT_ALPHA_CAP, DRIP * k * FILAMENT_ALPHA_K),
  };
}

// --- identity, so a cache key can name what it was built from ----------------

/**
 * A stable id for a decoded asset.
 *
 * A cache key has to carry the identity of the data it was built from, not just
 * its geometry. The arrays are replaced only when the page reloads them, so an
 * id handed out on first sight and remembered against the object itself is
 * exact: the same array always answers the same, and a different one never
 * collides with it.
 */
const assetIds = new WeakMap<object, number>();
let nextAssetId = 1;

function assetId(o: object): number {
  let id = assetIds.get(o);
  if (id === undefined) {
    id = nextAssetId++;
    assetIds.set(o, id);
  }
  return id;
}

// --- the calendar both layers arrive on --------------------------------------
// `cumulativeByDay` and `arrivedThrough` live in modes/shared.ts since the
// crescendo: THE MEASURE paces its flood on the same table and the same clock,
// and two implementations of one calendar would be the drift this project is
// built against.

/**
 * The order the drops of a season land in — and why it is not the file's.
 *
 * `points/*.bin` is sorted by x: measured on the shipped bytes, every record's
 * x is greater than or equal to the one before it. Taking a prefix of that array
 * as "what has arrived" therefore draws a CURTAIN moving left to right across
 * the floor, and this hand did exactly that for as long as it has existed. The
 * old marks were faint enough to hide it; drops are not.
 *
 * There is no honest fix that keeps the file's order, because the artifact
 * holds no time at all — it is one count per coordinate for a whole season, so
 * no arrival order is the record's. Any order here is authored, which means the
 * only question is which false structure it asserts. Left to right asserts that
 * the season was played across the floor. This asserts nothing: a van der Corput
 * scatter, low-discrepancy by construction, so that at every moment the drops
 * that have landed are spread over the whole plate in the record's own
 * proportions. Deterministic, so the same instant always fills the same way.
 */
const scatter = new WeakMap<object, Int32Array>();

function scatterOrder(owner: object, n: number): Int32Array {
  const have = scatter.get(owner);
  if (have && have.length === n) return have;
  let bits = 1;
  while (1 << bits < n) bits++;
  const out = new Int32Array(n);
  let at = 0;
  for (let k = 0; k < 1 << bits; k++) {
    // Reverse the bits of k: consecutive k land as far apart as the range
    // allows, so a prefix of this sequence covers the whole array evenly.
    let r = 0;
    for (let b = 0; b < bits; b++) r = (r << 1) | ((k >> b) & 1);
    if (r < n) out[at++] = r;
  }
  scatter.set(owner, out);
  return out;
}

// --- the beats ---------------------------------------------------------------

/** The five real stops of this hand's window interior, exported for the rail
 *  (THE SECOND SCORE) — one definition, two readers, the `WINDOW_BEATS`
 *  discipline. Titles are display copy, defined in window-score.ts. */
export const HAND_PHASES = HAND_WINDOW_PHASES;

/** Where the window is, as the five states this hand's interior actually
 *  holds. The rail lists the same five through HAND_PHASES, so a presenter
 *  stepping to "THE NIGHT" lands where this hand agrees the night begins. */
interface Window5 {
  /** 0..1 through the opening phase, where ONE possession plays at true rate. */
  one: number;
  /** 0..1 through the game phase — the found game's own eased clock. */
  game: number;
  /** 0..1 through the night phase — the Dec 5 slate's own clock. */
  night: number;
  /** 0..1 through the season beat, before the authored easing. */
  seasonU: number;
  /** The fractional calendar day the accelerating season has reached. */
  dayFrac: number;
  /** 0..1 as the kept points come up over the paint at the season's crest. */
  kept: number;
  /** 0..1 as the paint is taken back off the plate over the close. */
  wash: number;
  /** 0..1 through the inventory's entrance, then held through the close. */
  inventory: number;
}

function windowAt(
  phase: number,
  span: number,
  phases: ReturnType<typeof handWindowPhases>,
): Window5 {
  const p = Math.min(1, Math.max(0, phase));
  const [beatOne, beatGame, beatNight, beatSeason, beatClose] = phases;
  const seasonU = Math.max(0, Math.min(1,
    (p - beatSeason.from) / (beatSeason.to - beatSeason.from)));
  return {
    one: Math.min(1, p / beatOne.to),
    game: Math.max(0, Math.min(1,
      (p - beatGame.from) / (beatGame.to - beatGame.from))),
    night: Math.max(0, Math.min(1,
      (p - beatNight.from) / (beatNight.to - beatNight.from))),
    seasonU,
    // The whole real calendar, compressed through the register's one authored
    // easing: `span + 1` inclusive days, so the beat opens empty and closes
    // complete, and the four dead days stay dead at speed.
    dayFrac: seasonClock(seasonU) * (span + 1),
    kept: smooth((p - WINDOW_CREST_PHASE) / (beatClose.from - WINDOW_CREST_PHASE)),
    wash: smooth((p - beatClose.from) / (beatClose.to - beatClose.from)),
    inventory: smooth(
      (p - beatClose.from)
      / ((beatClose.to - beatClose.from) * HAND_INVENTORY_FULL_CLOSE_LOCAL),
    ),
  };
}

function smooth(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
}

// --- one stroke --------------------------------------------------------------

/**
 * One stroke, one body, five measured seconds.
 *
 * `drawn` is how much of it has been laid so far, which is what makes the
 * gesture read as a gesture rather than as a shape that appears. `fromDrawn`
 * starts the walk mid-stroke — THE GAME's nested possession is a
 * TIME-clip of a longer record, and a clip that drew a stroke's whole
 * pre-history would show minutes the clip does not claim. Default 0 draws
 * exactly what every existing caller drew.
 */

/** The fields a stroke drawer reads. The paint, the slate and the game each
 *  ship their own stroke table; any of them is drawable as long as it carries
 *  these columns, so the drawers take the shape rather than one file's type. */
export type StrokeGeometry = Pick<Strokes, "n" | "first" | "count" | "kind" | "x" | "y" | "dt" | "arc">;
export function paintStroke(
  ctx: CanvasRenderingContext2D,
  view: View,
  s: StrokeGeometry,
  i: number,
  drawn: number,
  r: Regimes,
  fromDrawn = 0,
  ink = 1,
): void {
  const first = s.first[i]!;
  const n = s.count[i]!;
  if (n < 2) return;
  const upto = Math.max(2, Math.ceil(n * Math.min(1, Math.max(0, drawn))));
  const ball = s.kind[i] === 1;
  const fromK = Math.max(1, 1 + Math.floor(n * Math.min(1, Math.max(0, fromDrawn))));

  for (let k = fromK; k < upto; k++) {
    const a = first + k - 1;
    const b = first + k;
    const dt = s.dt[b]!;
    const arcT = s.arc[b]!;
    if (dt === 0) continue;

    // The true measured mean speed over this span. `arc` was summed at the full
    // 25 Hz before simplification, so this is unaffected by how few control
    // points survived.
    const v = arcT / 10 / (dt / 25);
    const seg = filament(v, r);
    // `ink` is ONE_INK's beat-local envelope (default 1 everywhere else): a
    // lone possession at the conserved flow sat within a hair of the plate's
    // black. The segment ceiling still caps it.
    const rad = seg.rad;
    const alpha = Math.min(FILAMENT_ALPHA_CAP, seg.alpha * ink);

    const x0 = view.sx(s.x[a]!);
    const y0 = view.sy(s.y[a]!);
    const x1 = view.sx(s.x[b]!);
    const y1 = view.sy(s.y[b]!);

    // Hue at the vertex the paint is landing on: the league's own region.
    const rgb = ball ? BONE : (ZONE[zoneAt(s.x[b]!, s.y[b]!)] ?? BONE);
    const col = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, `;

    if (v > r.v90) {
      // BREAK. Beyond the instability the stream cannot wet a continuous line,
      // so the segment is laid as beads one wavelength apart. Nothing is drawn
      // fainter than this: below it paint does not wet at all. The span this
      // walks is a real one — the pipeline cuts a path at every over-long step
      // and every feed break, so no segment here bridges a discarded jump.
      const wl = RAYLEIGH * rad;
      const beads = Math.max(1, Math.min(BEAD_CAP, Math.round(arcT / wl)));
      for (let d = 0; d < beads; d++) {
        const t = (d + 0.5) / beads;
        ctx.beginPath();
        ctx.fillStyle = `${col}${alpha})`;
        ctx.arc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, view.s(rad), 0, Math.PI * 2);
        ctx.fill();
      }
      continue;
    }

    ctx.beginPath();
    ctx.strokeStyle = `${col}${alpha})`;
    ctx.lineWidth = view.s(rad * 2);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    if (v < r.v10) {
      // POOL. The filament is capped, and the ink the cap refuses goes down as
      // a blot: a body standing still for three seconds leaves a real mark.
      const excess = (r.v10 / Math.max(v, POOL_V_FLOOR) - 1) * POOL_EXCESS_K;
      if (excess > POOL_V_FLOOR) {
        ctx.beginPath();
        ctx.fillStyle = `${col}${Math.min(POOL_ALPHA_CAP, alpha * POOL_ALPHA_K)})`;
        ctx.arc((x0 + x1) / 2, (y0 + y1) / 2,
          view.s(rad * Math.min(POOL_R_CAP, 1 + excess)), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

type PaintCommand =
  | { kind: "stroke"; path: Path2D; style: string; width: number }
  | { kind: "fill"; path: Path2D; style: string };

interface PaintPathCache {
  strokes: Array<PaintCommand[] | undefined>;
}

let paintPathGeneration = -1;
let paintPaths = new WeakMap<object, WeakMap<View, Map<string, PaintPathCache>>>();

/**
 * Compile the immutable geometry and material of one completed stroke.
 *
 * The live edge still walks `paintStroke`: its endpoint changes and must remain
 * the original direct Canvas sequence.  Behind that edge, however, the same
 * completed segments were rebuilding thousands of temporary current paths and
 * colour strings every frame.  A `Path2D` replays the identical path on the
 * destination — preserving source-over order and overlap — without allocating
 * its geometry again.  Unlike grouping, this changes neither the number nor
 * the ordering of translucent deposits.
 */
function completedPaintCommands(
  view: View,
  s: StrokeGeometry,
  i: number,
  r: Regimes,
): PaintCommand[] {
  const generation = prefixCacheGeneration();
  if (generation !== paintPathGeneration) {
    paintPaths = new WeakMap();
    paintPathGeneration = generation;
  }

  let byView = paintPaths.get(s);
  if (!byView) {
    byView = new WeakMap();
    paintPaths.set(s, byView);
  }
  let byRegime = byView.get(view);
  if (!byRegime) {
    byRegime = new Map();
    byView.set(view, byRegime);
  }
  const regime = `${r.v10}|${r.v50}|${r.v90}`;
  let cache = byRegime.get(regime);
  if (!cache) {
    cache = { strokes: new Array(s.n) };
    byRegime.set(regime, cache);
  }
  const have = cache.strokes[i];
  if (have) return have;

  const commands: PaintCommand[] = [];
  const first = s.first[i]!;
  const n = s.count[i]!;
  const ball = s.kind[i] === 1;
  for (let k = 1; k < n; k++) {
    const a = first + k - 1;
    const b = first + k;
    const dt = s.dt[b]!;
    const arcT = s.arc[b]!;
    if (dt === 0) continue;

    const v = arcT / 10 / (dt / 25);
    const seg = filament(v, r);
    const rad = seg.rad;
    const alpha = Math.min(FILAMENT_ALPHA_CAP, seg.alpha);
    const x0 = view.sx(s.x[a]!);
    const y0 = view.sy(s.y[a]!);
    const x1 = view.sx(s.x[b]!);
    const y1 = view.sy(s.y[b]!);
    const rgb = ball ? BONE : (ZONE[zoneAt(s.x[b]!, s.y[b]!)] ?? BONE);
    const col = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, `;

    if (v > r.v90) {
      const wl = RAYLEIGH * rad;
      const beads = Math.max(1, Math.min(BEAD_CAP, Math.round(arcT / wl)));
      const style = `${col}${alpha})`;
      for (let d = 0; d < beads; d++) {
        const t = (d + 0.5) / beads;
        const path = new Path2D();
        path.arc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t,
          view.s(rad), 0, Math.PI * 2);
        commands.push({ kind: "fill", path, style });
      }
      continue;
    }

    const path = new Path2D();
    path.moveTo(x0, y0);
    path.lineTo(x1, y1);
    commands.push({
      kind: "stroke",
      path,
      style: `${col}${alpha})`,
      width: view.s(rad * 2),
    });

    if (v < r.v10) {
      const excess = (r.v10 / Math.max(v, POOL_V_FLOOR) - 1) * POOL_EXCESS_K;
      if (excess > POOL_V_FLOOR) {
        const pool = new Path2D();
        pool.arc((x0 + x1) / 2, (y0 + y1) / 2,
          view.s(rad * Math.min(POOL_R_CAP, 1 + excess)), 0, Math.PI * 2);
        commands.push({
          kind: "fill",
          path: pool,
          style: `${col}${Math.min(POOL_ALPHA_CAP, alpha * POOL_ALPHA_K)})`,
        });
      }
    }
  }
  cache.strokes[i] = commands;
  return commands;
}

function drawCompletedPaintStroke(
  ctx: CanvasRenderingContext2D,
  view: View,
  s: StrokeGeometry,
  i: number,
  r: Regimes,
): void {
  for (const command of completedPaintCommands(view, s, i, r)) {
    if (command.kind === "fill") {
      ctx.fillStyle = command.style;
      ctx.fill(command.path);
    } else {
      ctx.strokeStyle = command.style;
      ctx.lineWidth = command.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke(command.path);
    }
  }
}

/**
 * THE SLATE, drawn. Progress is a pure function of the beat's own seconds:
 * each path begins at its span-local start offset and advances vertex by
 * vertex as its measured dt elapses, so one second of beat is one second of
 * night and nothing is eased or compressed. The marks are the paint's own —
 * `paintStroke` with the same measured regimes — because the slate is the
 * same instrument reading the same kind of motion; only the population is
 * the night's. Redrawn live each frame: the night's whole vertex population
 * is small (`slate.json:vertices`), and nothing is cached or remembered.
 */
function drawSlate(ctx: CanvasRenderingContext2D, view: View, sl: Slate,
                   elapsedFrames: number, alpha: number, r: Regimes): void {
  if (elapsedFrames <= 0 || alpha <= 0.002) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  for (let i = 0; i < sl.n; i++) {
    const rel = elapsedFrames - sl.start[i]!;
    if (rel <= 0) continue;
    const first = sl.first[i]!;
    const n = sl.count[i]!;
    let k = 1;
    let cumDt = 0;
    while (k < n && cumDt + sl.dt[first + k]! <= rel) {
      cumDt += sl.dt[first + k]!;
      k++;
    }
    if (k >= n) {
      drawCompletedPaintStroke(ctx, view, sl, i, r);
    } else {
      paintStroke(ctx, view, sl, i, k / n, r);
    }
  }
  ctx.restore();
}

// --- the drops ---------------------------------------------------------------

/**
 * A shot as paint.
 *
 * THE FRAME'S OWN ALPHA IS NO LONGER FOLDED IN HERE, and that is a deliberate
 * change of reading. It used to be multiplied in BEFORE the per-mark clamp, so
 * the clamp bound differently depending on how far the coda had receded — which
 * made the cap a fade cap as well as a material one, and made the layer
 * impossible to cache. The clamp is a MATERIAL cap: how much ink one mark may
 * hold. It is applied to the unmultiplied value here and the frame's alpha
 * multiplies the finished layer at composite time. A dimmed painting is the
 * same painting with the same occlusion, which is also the more defensible
 * reading of what the coda does.
 *
 * THE WINDOW RADIUS IS NOT THE CALIPER AT FLOOR SCALE, and this file used to
 * say it was. A caliper runs the length of the floor (`contest.caliper_ft`) and
 * a drop is under a foot across; literal scale would put a single shot's mark
 * over a large part of the court. THE MEASURE draws the caliper at literal
 * scale, as a line, because that is the hand whose subject it is. What this is
 * instead, said plainly: A MONOTONE AUTHORED MAP of a measured distance onto an
 * authored radius range, whose reference is MEASURED —
 * `window.json:contest.caliper_ft.p99`, the 99th percentile of the very
 * distribution being drawn. It used to be the old one-byte STORAGE CEILING of
 * window_measures.bin, a property of the file format rather than of basketball,
 * which also silently clipped the longest calipers onto one value.
 */
function bakeWindowDrops(
  ctx: CanvasRenderingContext2D,
  view: View,
  m: { x: Int16Array; y: Int16Array; dist: Uint16Array; n: number },
  w: WindowFile,
  from: number,
  to: number,
): void {
  const end = Math.min(to, m.n);
  // Ink per mark, so the layer weighs the same whatever the count. The measured
  // distribution this hand is drawing, in tenths to match the stored caliper:
  // the transfer function reaches its widest radius at the reference, and the
  // tail beyond it draws at that radius rather than past it.
  const per = SPLOTCH_INK / m.n;
  const scaleAt = 10 * w.contest.caliper_ft.p99;
  for (let i = from; i < end; i++) {
    const open = Math.min(1, m.dist[i]! / scaleAt);
    const rad = SPLOTCH_MIN_R + open * (SPLOTCH_MAX_R - SPLOTCH_MIN_R);
    const a = Math.min(SPLOTCH_ALPHA_CAP_WINDOW, per / (rad * rad));
    if (a < SPLOTCH_VISIBLE) continue;
    const rgb = ZONE[zoneAt(m.x[i]!, m.y[i]!)] ?? BONE;
    ctx.beginPath();
    ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
    ctx.arc(view.sx(m.x[i]!), view.sy(m.y[i]!), view.s(rad), 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Every other season: a drop per coordinate, sized by what landed there.
 *
 * The record kept a point and a count and nothing else, so the count is the
 * only thing a drop can carry — and it goes into AREA, not brightness. A
 * coordinate the league's own lattice holds many shots at spreads into a fat
 * wet blot; one it holds a handful at stays a bead. Ink is conserved by
 * construction: area rises with the coordinate's share of its season, so
 * opacity does not have to move at all, and the drops run together and COVER
 * where the record concentrated.
 *
 * Share, never raw count, and against a FIXED reference across every season —
 * the same discipline `field.ts:tone` keeps, and for the same reason.
 * Normalising each season to its own maximum would falsely equalise them, and
 * the lockout years and the bubble are SHORT, not sparse.
 *
 * The pin's cell is skipped: those are the shots the record declined to place,
 * and they are the pin's subject, not paint's. It was hardcoded to the origin
 * until 2026-08-09, which in six seasons skipped an empty cell and drew the
 * refusal as one clamped max-radius blot. THE HAND draws no pin of its own, so
 * in those seasons the record's refusal was simply an ordinary drop.
 */
function bakeSeasonDrops(
  ctx: CanvasRenderingContext2D,
  view: View,
  pts: { x: Int16Array; y: Int16Array; hires: Uint32Array; rest: Uint32Array;
         zone: Uint8Array; n: number; total: number },
  pin: [number, number] | null,
  from: number,
  to: number,
): void {
  const end = Math.min(to, pts.n);
  const total = Math.max(1, pts.total);
  const k = DROP_AREA / (total * Math.PI);
  const order = scatterOrder(pts, pts.n);
  const [pinX, pinY] = pin ?? [NaN, NaN];
  for (let j = from; j < end; j++) {
    const i = order[j]!;
    const cx = pts.x[i]!;
    const cy = pts.y[i]!;
    if (cx === pinX && cy === pinY) continue;
    const count = pts.hires[i]! + pts.rest[i]!;
    if (count === 0) continue;
    const want = Math.sqrt(k * count);
    // Below the smallest drop the brush makes, the coordinate still deposits
    // its ink - it simply cannot spread it, so what area refuses goes to
    // opacity. That keeps every coordinate the record filed on the plate and
    // keeps the conservation exact at both ends of the range.
    const rad = Math.min(DROP_MAX_R, Math.max(DROP_MIN_R, want));
    const a = want >= DROP_MIN_R
      ? DROP_ALPHA
      : DROP_ALPHA * ((want * want) / (DROP_MIN_R * DROP_MIN_R));
    if (a < SPLOTCH_VISIBLE) continue;
    const rgb = ZONE[pts.zone[i]!] ?? BONE;
    ctx.beginPath();
    ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
    ctx.arc(view.sx(cx), view.sy(cy), view.s(rad), 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- the hand ----------------------------------------------------------------

export function drawHandHand(f: Frame): void {
  const { ctx, view, dpr, st, data, remains } = f;
  const paint: PaintFile | null = data.paint;
  const year = st.year!;
  const dw = Math.max(1, Math.round(view.width * dpr));
  const dh = Math.max(1, Math.round(view.height * dpr));
  // Everything about the surface that changes a pixel, including DPR as its own
  // component. The old key was the DEVICE size alone, so a small viewport at a
  // doubled ratio and a large one at a single ratio collided on the same key
  // while the view's own scale differed by a factor of two.
  const geom = `${Math.round(view.width)}x${Math.round(view.height)}|${dpr}`;

  ctx.save();
  // Paint covers. This is the one hand that does not composite additively.
  ctx.globalCompositeOperation = "source-over";

  // The plate is one halfcourt and bodies run the whole floor, so some of the
  // measured vertices sit past the halfcourt line - `vertices_outside_plate`
  // counts them. They are real positions and they stay in the artifact; the
  // canvas is simply the frame the whole piece is composed in, and paint stops
  // at its edge.
  ctx.beginPath();
  ctx.rect(view.sx(COURT.x0), view.sy(COURT.y1),
    view.s(COURT.x1 - COURT.x0), view.s(COURT.y1 - COURT.y0));
  ctx.clip();

  const inWindow = year === WINDOW_YEAR && data.window !== null;
  const handScore = handWindowPhases(data.slateFile?.span.seconds ?? HAND_NIGHT_SECONDS);
  const [, beatGame, beatNight, beatSeason] = handScore;
  const w = data.window;
  const m = inWindow ? data.measures() : null;
  const span = inWindow && m ? m.day[m.n - 1]! : 0;
  const win = inWindow ? windowAt(st.phase, span, handScore) : null;

  // --- the drops the record kept --------------------------------------------
  let dropSurface: HTMLCanvasElement | null = null;
  if (inWindow && m && m.n && w) {
    // Paced by the day the shot was actually recorded on, so the flood runs as
    // the corpus did rather than as a fixed rate over an index — and since the
    // crescendo, through the register's one authored easing of that calendar.
    const cum = cumulativeByDay(m, m.day, m.n, (d) => d, span);
    const upto = arrivedThrough(cum, win!.dayFrac);
    dropSurface = prefixSurface(
      `hand.window|${assetId(m)}|${geom}`,
      Math.floor(upto / DROP_STEP), dw, dh, dpr, DROP_STEP,
      (c, a, b) => bakeWindowDrops(c, view, m, w, a, b),
    );
    if (dropSurface) blit(ctx, dropSurface, view, remains);
    // The live tail: everything past the last whole step, bounded by the step
    // and never by the resident record count.
    ctx.save();
    ctx.globalAlpha = remains;
    bakeWindowDrops(ctx, view, m, w, Math.floor(upto / DROP_STEP) * DROP_STEP, upto);
    ctx.restore();

    // (THE NIGHT's calipers-as-drops over-pass lives BELOW the game surface
    // draw in this function: the record's endpoints must read over the motion
    // ground, not under it. See the block after the strokes.)
  } else {
    // THE PREVIOUS SHEET RECEDES UNDER THE NEW RECORD.
    // The drop layer drew only the current year, so the plate bared to the
    // engraving at every season turnover — unsanctioned mini-cuts in a piece
    // whose one cut is 2010-11, and THE CENSUS documents its identical
    // emptying where this hand had no sentence. Now the outgoing season's
    // COMPLETED sheet fades beneath the incoming season's accumulating drops:
    // the incoming side stays an accumulation (the thing this hand is kept
    // for), only the outgoing is a fade, matching the pin's own linear
    // recession. The sheet reuses the exact prefix key the season had while it
    // was current, so crossing a boundary extends that surface by at most one
    // step and scrubbing backwards rebuilds by src/prefix.ts's recursion. Scoped to
    // the season branch: the boundary INTO the window is Act III's staged
    // opening (bare plate, then one possession laid slowly), a deliberate
    // exception recorded here rather than an omission.
    if (st.prev !== null && st.arrived < 1) {
      const prevSeason = data.byYear.get(st.prev);
      const prevPts = data.points(st.prev);
      if (prevSeason && prevPts) {
        const prevPin = pinCoordOf(prevSeason);
        const sheet = prefixSurface(
          `hand.season|${st.prev}|${assetId(prevPts)}|${prevPin ? prevPin.join(",") : "none"}|${geom}`,
          Math.ceil(prevPts.n / DROP_STEP), dw, dh, dpr, DROP_STEP,
          (c, a, b) => bakeSeasonDrops(c, view, prevPts, prevPin, a, b),
        );
        if (sheet) blit(ctx, sheet, view, remains * (1 - st.arrived));
      }
    }
    const pts = data.points(year);
    if (pts) {
      const upto = Math.round(pts.n * Math.min(1, Math.max(0, st.arrived)));
      // In the key for the same reason `field.ts:layerKey` carries it: a
      // function of the year, and named anyway, because rule 5 asks that a key
      // carry everything affecting its pixels.
      const pin = pinCoordOf(data.byYear.get(year)!);
      dropSurface = prefixSurface(
        `hand.season|${year}|${assetId(pts)}|${pin ? pin.join(",") : "none"}|${geom}`,
        Math.floor(upto / DROP_STEP), dw, dh, dpr, DROP_STEP,
        (c, a, b) => bakeSeasonDrops(c, view, pts, pin, a, b),
      );
      if (dropSurface) blit(ctx, dropSurface, view, remains);
      ctx.save();
      ctx.globalAlpha = remains;
      bakeSeasonDrops(ctx, view, pts, pin, Math.floor(upto / DROP_STEP) * DROP_STEP, upto);
      ctx.restore();
    }
  }
  // --- the bodies the record did not keep -----------------------------------
  const s = inWindow ? data.strokes() : null;
  if (s && s.n && paint && win) {
    const r: Regimes = {
      v10: paint.speed_ft_s.p10,
      v50: paint.speed_ft_s.p50,
      v90: paint.speed_ft_s.p90,
    };

    // THE WASH — the four scales' dried ground, beneath every stroke. It
    // clears WITH the feed material at the close: the drops alone survive,
    // so "the record keeps endpoints" stays literal on the final frames.
    const washFile = data.wash();
    const gf = data.gameFile;
    const wmeta = w ? w.wash : null;
    if (washFile && wmeta && gf) {
      const ground = remains * (1 - win.wash);
      if (win.seasonU > 0 || win.dayFrac > 0) {
        // The season: per-day rasters fold beneath the accelerating calendar,
        // the night's own day pre-seeded and SKIPPED in the sweep (no double
        // add). The handover from the night phase is exact by construction —
        // the fold's ground opens as the seed's own conversion.
        drawWashFold(ctx, view, dpr, washFile, wmeta, gf.day, win.dayFrac, ground);
      } else {
        // The game's own ground rising through its phase, then the night's
        // raster crossing over it — subset -> superset BY MEASURE: the same
        // tone curve against the same corpus total, so the crossfade only
        // ever brightens a cell. Build the fixed game ground during ONE with
        // zero ink: GAME otherwise paid its full kernel conversion on the
        // first visible frame. `drawWashCells` caches the immutable surface and
        // its zero-alpha blit is a no-op, so timing moves and pixels do not.
        const nightIn = smooth(win.night);
        if (nightIn < 1) {
          drawWashCells(ctx, view, dpr, `game|${assetId(gf)}`,
            gridCells(gf.game_grid.grid, wmeta), wmeta.positions_total, wmeta,
            ground * smooth(win.game) * (1 - nightIn));
        }
        if (nightIn > 0) {
          const night = dayCells(washFile, wmeta, gf.day);
          if (night) {
            drawWashCells(ctx, view, dpr, `night|${assetId(washFile)}`,
              night, wmeta.positions_total, wmeta, ground * nightIn);
          }
        }
      }
    }

    // THE GAME — the second scale. The found game lays whole on its own
    // eased clock through the game phase, with the paint's own physics: wet
    // at the edge, drying to GAME_DRIED behind it, cached in prefix steps
    // over the game's own frames (dim applied at blit, never in the key).
    const gm = data.game();
    if (gm && gf) {
      const gameCrop = courtBacking(view, dpr);
      const total = gameTotalFrames(gf);
      const pos = possessionFrames(gf);
      const gameFrame = win.game > 0 ? gameClock(win.game) * total : 0;
      // THE DRYING CLOCK CONTINUES past the game's end,
      // at TRUE RATE — the night's own convention — so the buzzer's strokes
      // and beads settle to the dried register within GAME_WET_S of
      // presentation time instead of standing "just painted" all window.
      // Drawing thresholds keep `gameFrame`; only drying reads this.
      const dryFrame = gameFrame
        + Math.max(0, st.phase - beatGame.to) * secondsFor(WINDOW_YEAR) * gf.hz;
      const gEnv = remains * (1 - win.wash);
      const sp = strokeSpans(gm, gf);
      const wetFrames = GAME_WET_S * gf.hz;
      const stepFrames = Math.ceil(total / GAME_PREFIX_STEPS);
      const gSteps = Math.floor(gameFrame / stepFrames);
      const bakedGame = prefixSurface(
        `hand.game|${assetId(gm)}|court|${geom}`,
        gSteps, gameCrop.dw, gameCrop.dh, dpr, stepFrames,
        (c, a, b) => {
          c.translate(-gameCrop.x, -gameCrop.y);
          for (let i = 0; i < gm.n; i++) {
            const end = sp.start[i]! + sp.dur[i]!;
            if (end >= a && end < b) {
              drawCompletedPaintStroke(c, view, gm, i, r);
            }
          }
        },
      );
      if (bakedGame) blitCrop(ctx, bakedGame, gameCrop, gEnv * GAME_DRIED);

      if (gameFrame > 0) {
        // The live edge: every stroke not both fully baked and fully dried,
        // at its own wetness — full ink at the edge, drying behind it.
        const bakedBefore = gSteps * stepFrames;
        ctx.save();
        for (let i = 0; i < gm.n; i++) {
          const at0 = sp.start[i]!;
          if (at0 >= gameFrame) continue;
          const end = at0 + sp.dur[i]!;
          const age = dryFrame - end;
          if (end < bakedBefore && age >= wetFrames) continue;
          const wetness = Math.max(0, 1 - Math.max(0, age) / wetFrames);
          ctx.globalAlpha = gEnv * (GAME_DRIED + (1 - GAME_DRIED) * wetness);
          const drawn = timeFrac(gm, i, gameFrame - at0);
          if (drawn >= 1) {
            drawCompletedPaintStroke(ctx, view, gm, i, r);
          } else {
            paintStroke(ctx, view, gm, i, drawn, r);
          }
        }
        ctx.restore();
      }

      // ONE — the nested possession: the game artifact time-clipped to the
      // declared span, every body and the ball at TRUE RATE from the
      // window's open, the paint's physics. Once the game phase's clock
      // reaches these frames the walk above draws the same records and each
      // clip stroke leaves this layer — replaced by itself, record for
      // record, no double-deposit and no recede.
      const oneFrames = st.phase * secondsFor(WINDOW_YEAR) * gf.hz;
      const clipUpto = Math.min(pos.f1, pos.f0 + oneFrames);
      // ONE_INK: the beat-local envelope (declared in src/scalars.ts). Full
      // through the ONE beat, fading out across the game phase as the eased
      // walk re-lays the same records at the conserved flow — no pop at the
      // handover, and no boosted segment survives past the beat it argues.
      const oneInk = 1 + (ONE_INK - 1) * (1 - win.game);
      ctx.save();
      ctx.globalAlpha = gEnv;
      for (let i = 0; i < gm.n; i++) {
        const at0 = sp.start[i]!;
        if (at0 < gameFrame || at0 >= clipUpto) continue;
        const end = at0 + sp.dur[i]!;
        if (end <= pos.f0) continue;
        // A TIME-clip on both sides: a stroke that began before the
        // possession draws only from the possession's own first frame.
        const drawn = timeFrac(gm, i, clipUpto - at0);
        if (drawn > 0) {
          paintStroke(ctx, view, gm, i, drawn, r,
            timeFrac(gm, i, pos.f0 - at0), oneInk);
        }
      }
      ctx.restore();

      // The measured annotations: pass beads and shot anchors riding the WET
      // EDGE — each dries away with the motion it marked (the filed record's
      // drops are what persists on this hand; THE PLATE keeps every mark).
      // The possession's own annotations hold until the walk re-lays them.
      drawGameEvents(ctx, view, gf, gameFrame, gEnv,
        { from: pos.f0, to: clipUpto }, dryFrame - wetFrames);
    }

    const offsets = paint.day_offsets;
    const last = offsets[offsets.length - 1] ?? 0;
    const cum = cumulativeByDay(s, s.day, s.n, (d) => offsets[d] ?? 0, last);
    // The paint arrives with the season's calendar alone: the opening
    // beat's material is the game artifact's possession above, and the
    // paint's own first canvas does not double it. The day-exclusive
    // arrival opens the season beat empty, so nothing is resident until the
    // calendar takes over.
    const laid = arrivedThrough(cum, (win.dayFrac / (span + 1)) * (last + 1));

    const steps = Math.floor(laid / STROKE_STEP);
    const baked = prefixSurface(
      `hand.paint|${assetId(s)}|${geom}`,
      steps, dw, dh, dpr, STROKE_STEP,
      (c, a, b) => {
        for (let i = a; i < Math.min(b, s.n); i++) paintStroke(c, view, s, i, 1, r);
      },
    );
    // The close takes the paint back off the plate rather than fading it out.
    const wet = remains * (1 - win.wash);
    if (baked) blit(ctx, baked, view, wet);
    ctx.save();
    ctx.globalAlpha = wet;
    for (let i = steps * STROKE_STEP; i < laid; i++) {
      const drawn = Math.min(1, (laid - i) / WET_STROKES);
      if (drawn >= 1) drawCompletedPaintStroke(ctx, view, s, i, r);
      else paintStroke(ctx, view, s, i, drawn, r);
    }
    ctx.restore();

    // THE NIGHT: the slate — every trackable body of the Dec 5 games at the
    // found span of maximum simultaneous play, moving at true rate (one
    // second of phase is one second of night), laid with the paint's own
    // physics. It PERSISTS once settled (its settling is content, and a
    // recede would be the kind of reset the piece rejects) — the
    // close's wash is the one clearing, through the same `wet` multiplier
    // the paint already carries. The viewer is meant to fail to watch it:
    // one possession at this scale is followable — the opening phase proves
    // that deliberately — and five games at once is the machine's ordinary
    // Saturday night.
    const sl = data.slate();
    const sf = data.slateFile;
    if (sl && sf && win.night > 0) {
      const nightSeconds = Math.max(0, st.phase - beatNight.from)
        * secondsFor(WINDOW_YEAR);
      const nightGround = st.phase >= beatSeason.from ? HAND_NIGHT_GROUND_ALPHA : 1;
      drawSlate(ctx, view, sl, nightSeconds * sf.span.hz, wet * nightGround, r);
    }

    // THE NIGHT's own endings: the slate date's calipers-as-drops, layering
    // through the night phase's sub-ramp — drawn ABOVE the game's dried
    // surface, because the record's endpoints must read over the motion
    // ground, not under it. NO RECEDE (a fade here would be the
    // "preemptive reset" the four scales reject). The season's own
    // prefix re-lays these records byte-exactly as its calendar reaches
    // them, so the over-pass retires by INDEX SUBTRACTION — the range below
    // is empty by arithmetic once the calendar passes the slate's day —
    // never by an alpha fade of filed records. Day bounds come from the
    // artifact's own day key.
    if (m && w && sf && win.night > 0) {
      const mcum = cumulativeByDay(m, m.day, m.n, (d) => d, span);
      const nfrom = sf.day > 0 ? mcum[sf.day - 1]! : 0;
      const nto = mcum[Math.min(span, sf.day)]!;
      const nightUpto = nfrom
        + Math.round((nto - nfrom) * Math.min(1, win.night * 1.1));
      const from2 = Math.max(nfrom, arrivedThrough(mcum, win.dayFrac));
      if (nightUpto > from2) {
        ctx.save();
        const nightGround = st.phase >= beatSeason.from ? HAND_NIGHT_GROUND_ALPHA : 1;
        ctx.globalAlpha = remains * nightGround;
        bakeWindowDrops(ctx, view, m, w, from2, nightUpto);
        ctx.restore();
      }
    }

    // THE CREST: the kept points come up over the paint as the accelerated
    // calendar enters its fastest passage. Five seconds of body were recorded
    // and one coordinate was filed, and this is that coordinate asserting
    // itself over the gesture it stands for — exactly where the machine's
    // pace has outrun a viewer's. Nothing new is drawn - it is the same
    // layer, composited again above instead of below.
    if (dropSurface && win.kept > 0) blit(ctx, dropSurface, view, remains * win.kept * KEPT_OVER_PAINT);

    if (win.inventory > 0) {
      drawSlug(ctx, view, [
        `${paint.strokes.toLocaleString()} STROKES · ${paint.canvases} POSSESSIONS`,
        "EVERY VERTEX A POSITION THE MACHINE RECORDED",
      ], { x: 0, y: 330 }, remains * win.inventory);
    }
  }

  // THE SET THIS IS A PICTURE OF, said where the picture is.
  //
  // These drops are the RECOVERED set, not the season: a release is only found
  // by following the ball back from the rim, and every made shot reaches it. THE
  // MEASURE and THE LEDGER disclose that; this hand presents the same subset as
  // a picture of 2015-16 and would otherwise say nothing. The line is templated by the pipeline
  // from the figures it quotes and drawn verbatim - the piece never composes it.
  // BOUND to the layer it qualifies: the disclosure scopes the DROPS,
  // which persist through the close — so its alpha does not carry
  // (1 - wash), and it stands beside the drops at the close's end when they
  // most resemble a picture of the season. Anchored at the top of the plate,
  // outside the orange mass that made it illegible at the crest.
  if (inWindow && w?.bias.scope && win) {
    drawSlug(ctx, view, [w.bias.scope], { x: 0, y: 370 },
      remains * win.one * 0.42);
  }

  if (!inWindow && st.year === WINDOW_YEAR + 1) {
    // The whole point, said once, on the first season after the window closes.
    const days = factNum(data.facts, "window.days_inclusive");
    // `voice`: the enclosure, named once, on the first season after it closes.
    drawSlug(ctx, view, [
      "THE RECORD KEEPS ENDPOINTS",
      `WHAT HAPPENED BETWEEN THEM WAS PUBLIC FOR ${days} DAYS`,
    ], { x: 0, y: 330 }, remains * Math.min(1, st.phase * 2) * 0.45, "voice");
  }

  ctx.restore();

  // The act boundaries named. The enclosure voice above shares this anchor
  // but stands only on the first post-window season, clear of both cues.
  drawActCue(f, 2);
  drawActCue(f, 5);
}

/** How many strokes the first possession holds. One canvas is one corroborated
 *  possession, and the index is ordered by day and then by canvas, so this is a
 *  prefix — read from the data rather than assumed to be a fixed number, since
 *  after the discontinuity split a body can be several strokes. */
export function firstCanvasStrokes(s: Strokes): number {
  const c0 = s.canvas[0]!;
  let i = 0;
  while (i < s.n && s.canvas[i] === c0) i++;
  return i;
}

/** Composite a cached layer. Alpha is applied HERE and not baked in, which is
 *  what lets one surface serve every frame of a fade. */
function blit(ctx: CanvasRenderingContext2D, el: HTMLCanvasElement,
              view: View, alpha: number): void {
  if (alpha <= 0.002) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(el, 0, 0, view.width, view.height);
  ctx.restore();
}

interface BackingCrop {
  x: number;
  y: number;
  width: number;
  height: number;
  dw: number;
  dh: number;
}

/** Device-aligned backing bounds for the halfcourt clip already on `ctx`. */
function courtBacking(view: View, dpr: number): BackingCrop {
  const left = view.sx(COURT.x0);
  const top = view.sy(COURT.y1);
  const right = left + view.s(COURT.x1 - COURT.x0);
  const bottom = top + view.s(COURT.y1 - COURT.y0);
  const x0 = Math.floor(left * dpr);
  const y0 = Math.floor(top * dpr);
  const x1 = Math.ceil(right * dpr);
  const y1 = Math.ceil(bottom * dpr);
  return {
    x: x0 / dpr,
    y: y0 / dpr,
    width: (x1 - x0) / dpr,
    height: (y1 - y0) / dpr,
    dw: Math.max(1, x1 - x0),
    dh: Math.max(1, y1 - y0),
  };
}

function blitCrop(
  ctx: CanvasRenderingContext2D,
  el: HTMLCanvasElement,
  crop: BackingCrop,
  alpha: number,
): void {
  if (alpha <= 0.002) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(el, 0, 0, el.width, el.height,
    crop.x, crop.y, crop.width, crop.height);
  ctx.restore();
}

/** Drop every cached surface. Imported by the purity probe's `cold()`, and it
 *  must change no pixel — which is the claim that probe exists to test. */
export { clearPrefixes as clearCanvas } from "../prefix";
