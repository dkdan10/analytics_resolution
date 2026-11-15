/** Is a layer built a slice at a time the layer baked whole?
 *
 * The field can build a layer across many calls (`advancePrewarm`) instead of
 * inside the one frame that needs it, and a frame being a pure function of its
 * instant then rests on a claim no frame can test: that the bytes are the same
 * either way. A frame composites a layer at some weight, over other layers,
 * through a rasteriser, and is judged against a noise floor; a layer wrong in
 * its last few cells would pass all of that. So the claim is tested where it
 * is made, at the layer, by hash, with nothing between the bytes and the
 * comparison.
 *
 * Each case builds one layer through the job and the same layer whole, reads
 * both canvases back and compares the hashes. The variants are the ways a job
 * can be reached: left to run, run with whole bakes of layers of other bytes
 * between its calls (the job's buffers must be its own), finished by the
 * frame that needed it, early and late, sharing its one slot with a second
 * caller, and started after another job was abandoned half built. The
 * residence is built by the same job, and its rows take the same ways in:
 * left to run, with other bakes between its calls, finished by the frame,
 * and abandoned half built for another caller's layer and then built again.
 *
 * A comparison that reported equal whatever it was shown would be worse than
 * none, so each regime carries a control: one layer against the same season a
 * state lower, which must differ. The residence's control lays it against a
 * season's finished layer. A readback that returned nothing, or a hash that
 * saw nothing, reads those two as equal and fails it.
 *
 * COMPARED BY HASH, NEVER THROUGH `aboveNoise`. Nothing here is drawn through
 * a rasteriser: a layer is written by `putImageData` and read by
 * `getImageData`, so there is no floor to excuse a difference with. A case
 * that misses is taken once more, whole. Differing twice is a difference;
 * differing once and equal when taken again is a readback accident, named as
 * unsettled, and is not a pass.
 *
 * A requirement that fails (a counter that did not read what it must, a job
 * that never finished) is a row that says so, never a throw: these rows run
 * at the end of a capture that has taken minutes, and a throw here would lose
 * all of it.
 */

import type { Loaded, Season } from "../data";
import {
  advancePrewarm,
  bakeLayer,
  bakeResidence,
  clearLayers,
  exposureStrength,
  fieldWork,
  grainProfileFor,
  type GrainRegime,
  type Layer,
  type PrewarmRequest,
} from "../field";
import { pinCoordOf } from "../modes/fieldlayer";
import { DEVELOP_STATES } from "../scalars";
import { hashPixels, PROBE_DPR, PROBE_H, PROBE_W, viewOf } from "./shared";

type LayerRequest = Extract<PrewarmRequest, { what: "layer" }>;
type ResidenceRequest = Extract<PrewarmRequest, { what: "residence" }>;
/** What the job builds: a season's layer, or the residence. */
type Built = LayerRequest | ResidenceRequest;

export interface LayerBuildRow {
  season: number;
  regime: string;
  palette: "bone" | "zone";
  /** The ladder state the layer was built at; zero for the residence, which
   *  has no ladder. */
  state: number;
  variant: "sliced" | "interleaved" | "finished-early" | "finished-late"
    | "alternating" | "abandoned" | "control"
    | "residence-sliced" | "residence-interleaved" | "residence-finished"
    | "residence-abandoned" | "residence-control";
  expect: "equal" | "differ";
  /** `advancePrewarm` calls made with this layer's own list. */
  calls: number;
  /** Hash of the job-built layer's bytes. */
  built: string;
  /** Hash of the synchronously baked layer's bytes. */
  whole: string;
  /** The first reading met `expect`. */
  ok: boolean;
  /** Only where an equality reading missed: the same case taken once more. */
  retake?: { built: string; whole: string; equal: boolean };
  note?: string;
}

/** One season to a regime, in the order the record passed through them: the
 *  grain profiles, a pin at the origin, no pin, and a pin off the origin are
 *  all among them. */
const REGIMES: readonly GrainRegime[] = [
  "uniformly_blind", "uneven", "uniformly_sighted", "categorical_refusal",
];

/** The lowest state of the exposure ladder. */
const LOWEST_STATE = 1;

/** Where a job that never finishes is given up on, in calls: far past any
 *  layer's whole build, so reaching it means the job is stuck. */
const CALLS_MAX = 4096;

/** One taking of a case: the two hashes, and the requirement that failed, if
 *  one did. */
interface Reading {
  built: string;
  whole: string;
  calls: number;
  failed?: string;
}

const bakeOf = (r: Built): Layer => r.what === "layer"
  ? bakeLayer(r.year, r.pts, r.coloured, r.view, r.dpr, r.pin, exposureStrength(r.state), r.grain)
  : bakeResidence(r.occ, r.view, r.dpr);

/** A layer's bytes, hashed, and its backing store given back at once:
 *  `clearLayers` only drops the reference, and these rows would otherwise
 *  leave every full-size canvas they made to the collector at the end of a
 *  capture. The caller empties the cache before anything could draw it. */
function hashAndRelease(layer: Layer): string {
  const { canvas } = layer;
  const hash = hashPixels(
    canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data);
  canvas.width = 0;
  canvas.height = 0;
  return hash;
}

/** The layer baked whole, on empty caches. */
function wholeOf(req: Built): { hash: string; failed?: string } {
  clearLayers();
  const layer = bakeOf(req);
  const failed = fieldWork.syncBakes === 1 ? undefined
    : "the whole bake was not counted as one bake on a miss";
  const hash = hashAndRelease(layer);
  clearLayers();
  return { hash, ...(failed ? { failed } : {}) };
}

/** Whether a bake of this request finds the layer already there, which is
 *  what shows a job that stored it under any other key. */
function hitOf(req: Built): { layer: Layer; failed?: string } {
  const { syncBakes, inlineFinishes } = fieldWork;
  const layer = bakeOf(req);
  const hit = fieldWork.syncBakes === syncBakes && fieldWork.inlineFinishes === inlineFinishes;
  return { layer, ...(hit ? {} : { failed: "the built layer was not under the key a bake asks for" }) };
}

/** The layer built by the job alone, on empty caches, `between` run after
 *  each call but the last. */
function jobOf(
  req: Built,
  between?: (calls: number) => void,
): { built: string; calls: number; failed?: string } {
  clearLayers();
  let calls = 0;
  while (fieldWork.prewarmedLayers !== 1) {
    if (calls >= CALLS_MAX) {
      clearLayers();
      return { built: "", calls, failed: "the job never finished its layer" };
    }
    advancePrewarm([req], 1);
    calls++;
    if (fieldWork.prewarmedLayers !== 1) between?.(calls);
  }
  const { layer, failed } = hitOf(req);
  const built = hashAndRelease(layer);
  clearLayers();
  return { built, calls, ...(failed ? { failed } : {}) };
}

/** The job left to run. A layer finished in a call or two was not built in
 *  slices, and its equality would say nothing about slicing. */
function sliced(req: Built): Reading {
  const job = jobOf(req);
  const whole = wholeOf(req);
  const failed = job.failed ?? whole.failed
    ?? (job.calls <= 2 ? "the layer was not built in slices" : undefined);
  return { built: job.built, whole: whole.hash, calls: job.calls, ...(failed ? { failed } : {}) };
}

/**
 * The job with whole bakes of other layers between its calls: after its
 * first call, its middle call and the call before its last. Each is a layer
 * no season has, so each is a real bake on the bakes' own scratch pair, and
 * the job's layer comes out right only if its two buffers are its own.
 *
 * The layer baked between must differ from the job's in its bytes, not only
 * in its key: the year goes into the key and into no pixel, so the job's own
 * layer under another year would leave in a shared image exactly what the
 * job was about to write there, and a job converting into the bakes' image
 * would read equal. So `other` bakes, for its `k`th call, a layer no other
 * call asks for and of other bytes: for a season's layer the same season in
 * the other palette at the lowest state, and for the residence a season's
 * layer at the lowest state. The row fails if what was baked between hashed
 * equal to the job's after all.
 */
function interleaved(req: Built, expected: number, other: (k: number) => Layer): Reading {
  const between: string[] = [];
  const job = jobOf(req, (calls) => {
    if (calls !== 1 && calls !== Math.floor(expected / 2) && calls !== expected - 1) return;
    between.push(hashAndRelease(other(between.length)));
  });
  const whole = wholeOf(req);
  const failed = job.failed ?? whole.failed
    ?? (job.calls < 4 ? "too few calls to bake between" : undefined)
    ?? (between.length === 0 ? "no other layer was baked between the job's calls" : undefined)
    ?? (between.includes(whole.hash)
      ? "a layer baked between the job's calls had the job's own bytes" : undefined);
  return { built: job.built, whole: whole.hash, calls: job.calls, ...(failed ? { failed } : {}) };
}

/** The job caught unfinished by a frame that needs its layer: `after` calls
 *  in, a bake of the same layer must finish the job in place, and count as
 *  that and as nothing else. */
function finished(req: Built, after: number): Reading {
  clearLayers();
  for (let k = 0; k < after; k++) advancePrewarm([req], 1);
  let failed = fieldWork.prewarmedLayers === 0 ? undefined
    : "the job had finished before the frame that was to finish it";
  const layer = bakeOf(req);
  failed ??= fieldWork.inlineFinishes === 1 && fieldWork.syncBakes === 0
    && fieldWork.prewarmedLayers === 0
    ? undefined
    : "finishing the job in place was not counted as that and nothing else";
  const built = hashAndRelease(layer);
  clearLayers();
  const whole = wholeOf(req);
  failed ??= whole.failed;
  return { built, whole: whole.hash, calls: after, ...(failed ? { failed } : {}) };
}

/** Two callers, each with a list of its own, taking the one slot turn about:
 *  both layers must be built, and neither job dropped for the other. */
function alternating(a: LayerRequest, b: LayerRequest): [Reading, Reading] {
  clearLayers();
  let callsA = 0;
  let callsB = 0;
  let failed: string | undefined;
  while (fieldWork.prewarmedLayers !== 2) {
    if (callsA + callsB >= 2 * CALLS_MAX) {
      failed = "the two jobs never finished their layers";
      break;
    }
    advancePrewarm([a], 1);
    callsA++;
    if (fieldWork.prewarmedLayers === 2) break;
    advancePrewarm([b], 1);
    callsB++;
  }
  if (failed) {
    clearLayers();
    return [
      { built: "", whole: "", calls: callsA, failed },
      { built: "", whole: "", calls: callsB, failed },
    ];
  }
  if (fieldWork.prewarmDropped !== 0) failed = "a job was dropped for the other caller's";
  const hitA = hitOf(a);
  const hitB = hitOf(b);
  const builtA = hashAndRelease(hitA.layer);
  const builtB = hashAndRelease(hitB.layer);
  clearLayers();
  const wholeA = wholeOf(a);
  const wholeB = wholeOf(b);
  const failedA = failed ?? hitA.failed ?? wholeA.failed;
  const failedB = failed ?? hitB.failed ?? wholeB.failed;
  return [
    { built: builtA, whole: wholeA.hash, calls: callsA, ...(failedA ? { failed: failedA } : {}) },
    { built: builtB, whole: wholeB.hash, calls: callsB, ...(failedB ? { failed: failedB } : {}) },
  ];
}

/** A job left half built for another caller's layer: the first must be
 *  dropped, once, and the second must come out as if the first had never
 *  been started. */
function abandoned(left: LayerRequest, leftCalls: number, req: LayerRequest): Reading {
  clearLayers();
  for (let k = 0; k < leftCalls; k++) advancePrewarm([left], 1);
  let failed = fieldWork.prewarmedLayers === 0 ? undefined
    : "the job to be abandoned had already finished";
  let calls = 0;
  while (fieldWork.prewarmedLayers !== 1) {
    if (calls >= CALLS_MAX) {
      clearLayers();
      return { built: "", whole: "", calls, failed: failed ?? "the job never finished its layer" };
    }
    advancePrewarm([req], 1);
    calls++;
  }
  failed ??= fieldWork.prewarmDropped === 1 ? undefined
    : "the unfinished job was not dropped exactly once";
  const hit = hitOf(req);
  const built = hashAndRelease(hit.layer);
  clearLayers();
  const whole = wholeOf(req);
  failed ??= hit.failed ?? whole.failed;
  return { built, whole: whole.hash, calls, ...(failed ? { failed } : {}) };
}

/** A job left half built for another caller's layer and then asked for
 *  again: it must be dropped once, and built the second time from its first
 *  row, as if it had never been started, though the job's accumulator then
 *  holds the other layer's sums. `calls` counts the second build's. */
function restarted(req: Built, leftCalls: number, other: LayerRequest): Reading {
  clearLayers();
  for (let k = 0; k < leftCalls; k++) advancePrewarm([req], 1);
  let failed = fieldWork.prewarmedLayers === 0 ? undefined
    : "the job to be abandoned had already finished";
  for (let k = 0; k < CALLS_MAX && fieldWork.prewarmedLayers === 0; k++) {
    advancePrewarm([other], 1);
  }
  failed ??= fieldWork.prewarmedLayers === 1 && fieldWork.prewarmDropped === 1 ? undefined
    : "the unfinished job was not dropped exactly once for the other caller's layer";
  // The other caller's layer is not compared, and its backing is given back.
  const otherLayer = bakeOf(other);
  otherLayer.canvas.width = 0;
  otherLayer.canvas.height = 0;
  let calls = 0;
  while (fieldWork.prewarmedLayers < 2) {
    if (calls >= CALLS_MAX) {
      clearLayers();
      return { built: "", whole: "", calls, failed: failed ?? "the job never finished its layer" };
    }
    advancePrewarm([req], 1);
    calls++;
  }
  const hit = hitOf(req);
  const built = hashAndRelease(hit.layer);
  clearLayers();
  const whole = wholeOf(req);
  failed ??= hit.failed ?? whole.failed;
  return { built, whole: whole.hash, calls, ...(failed ? { failed } : {}) };
}

export async function layerBuildRows(data: Loaded): Promise<{
  what: string;
  /** Rows expecting equality. */
  cases: number;
  /** Of those, differing on both readings, or failing a requirement. */
  failures: number;
  /** Of those, differing once and equal when taken again. */
  unsettled: number;
  controls: number;
  /** Controls that read equal. */
  controlFailures: number;
  rows: LayerBuildRow[];
}> {
  const view = viewOf(PROBE_W, PROBE_H);
  const top = DEVELOP_STATES;
  const seasons = REGIMES.map((regime) => {
    const season = data.seasons.find((s) => s.resolution.regime === regime);
    if (!season) throw new Error(`no season of the regime ${regime}`);
    const pts = data.points(season.year);
    if (!pts) throw new Error(`the points of ${season.year} are not resident`);
    const request = (coloured: boolean, state: number): LayerRequest => ({
      what: "layer",
      year: season.year,
      pts,
      coloured,
      view,
      dpr: PROBE_DPR,
      pin: pinCoordOf(season),
      state,
      grain: grainProfileFor(season.resolution.regime),
    });
    return { season, regime, request };
  });
  type Of = (typeof seasons)[number];
  const windowSeason = data.seasons.find((s) => s.points_by_day);
  if (!windowSeason) throw new Error("no season ships a calendar");
  if (!data.window) throw new Error("the window's occupancy is not resident");
  const windowPts = data.points(windowSeason.year);
  if (!windowPts) throw new Error(`the points of ${windowSeason.year} are not resident`);
  const win = { season: windowSeason, regime: windowSeason.resolution.regime };
  const residence: ResidenceRequest = {
    what: "residence", occ: data.window.occupancy, view, dpr: PROBE_DPR,
  };

  const rows: LayerBuildRow[] = [];
  const rowOf = (
    of: { season: Season; regime: string }, req: Built, variant: LayerBuildRow["variant"],
    first: Reading, again: (() => Reading) | null, note?: string,
  ): LayerBuildRow => {
    const ok = !first.failed && first.built === first.whole;
    // Taken again only where the hashes themselves disagreed. A failed
    // requirement is not a readback accident, and is not excused by one.
    const retake = !first.failed && !ok && again ? again() : null;
    const row: LayerBuildRow = {
      season: of.season.year,
      regime: of.regime,
      palette: req.what === "layer" && req.coloured ? "zone" : "bone",
      state: req.what === "layer" ? req.state : 0,
      variant,
      expect: "equal",
      calls: first.calls,
      built: first.built,
      whole: first.whole,
      ok,
      ...(retake ? {
        retake: {
          built: retake.built,
          whole: retake.whole,
          equal: !retake.failed && retake.built === retake.whole,
        },
      } : {}),
      ...(first.failed ?? note ? { note: first.failed ?? note } : {}),
    };
    rows.push(row);
    const what = req.what === "layer"
      ? `layer ${row.season} ${row.palette} state ${row.state}` : `residence ${row.season}`;
    console.log(`${what} ${variant}: `
      + (ok ? "equal" : row.retake?.equal ? "DIFFERED ONCE" : `DIFFERS${row.note ? ` (${row.note})` : ""}`));
    return row;
  };
  // Hand the main thread back between cases, for the sweep's own reason: a
  // page that cannot answer for this long looks hung rather than busy.
  const breathe = () => new Promise((r) => setTimeout(r, 0));
  const each = async (
    variant: LayerBuildRow["variant"],
    req: (of: Of) => LayerRequest,
    take: (of: Of, req: LayerRequest) => Reading,
  ): Promise<LayerBuildRow[]> => {
    const out: LayerBuildRow[] = [];
    for (const of of seasons) {
      await breathe();
      const r = req(of);
      out.push(rowOf(of, r, variant, take(of, r), () => take(of, r)));
    }
    return out;
  };

  /** One residence case, taken again if its hashes disagreed. */
  const residenceRow = async (
    variant: LayerBuildRow["variant"], take: () => Reading, note?: string,
  ): Promise<LayerBuildRow> => {
    await breathe();
    return rowOf(win, residence, variant, take(), take, note);
  };

  // The order keeps two job builds in a row from ever being the same layer,
  // and the residence's cases sit between the layers' so that it holds for
  // them too. The job's image is reused, so a write one job skipped and the
  // job before it made would be hidden if both had built the same thing.
  const bone: LayerBuildRow[][] = [];
  for (let state = LOWEST_STATE; state <= top; state++) {
    bone.push(await each("sliced", (of) => of.request(false, state), (_, r) => sliced(r)));
  }
  await each("sliced", (of) => of.request(true, top), (_, r) => sliced(r));
  const residenceSliced = await residenceRow("residence-sliced", () => sliced(residence));
  /** How many calls each regime's finished bone layer took to build. */
  const callsOf = new Map(seasons.map((of, i) => [of, bone[top - 1]![i]!.calls]));
  /** How many calls the residence took to build. */
  const residenceCalls = residenceSliced.calls;
  await each("interleaved", (of) => of.request(false, top),
    (of, r) => interleaved(r, callsOf.get(of)!, (k) => bakeLayer(
      -r.year - k, r.pts, !r.coloured, r.view, r.dpr, r.pin,
      exposureStrength(LOWEST_STATE), r.grain)));
  await residenceRow("residence-interleaved", () => interleaved(residence, residenceCalls,
    (k) => bakeLayer(
      -windowSeason.year - k, windowPts, false, view, PROBE_DPR, pinCoordOf(windowSeason),
      exposureStrength(LOWEST_STATE), grainProfileFor(windowSeason.resolution.regime))));
  await each("finished-early", (of) => of.request(false, top), (_, r) => finished(r, 1));
  await each("finished-late", (of) => of.request(false, top),
    (of, r) => finished(r, callsOf.get(of)! - 1));
  await residenceRow("residence-finished",
    () => finished(residence, Math.floor(residenceCalls / 2)));

  const [blind, uneven, sighted, refusal] = seasons as [Of, Of, Of, Of];
  {
    await breathe();
    const a = blind.request(false, top);
    const b = sighted.request(false, top);
    const first = alternating(a, b);
    const missed = first.some((r) => !r.failed && r.built !== r.whole);
    const again = missed ? alternating(a, b) : null;
    rowOf(blind, a, "alternating", first[0], again ? () => again[0] : null);
    rowOf(sighted, b, "alternating", first[1], again ? () => again[1] : null);
  }
  {
    await breathe();
    const left = uneven.request(false, top);
    const req = refusal.request(false, top);
    const take = () => abandoned(left, Math.floor(callsOf.get(uneven)! / 2), req);
    rowOf(refusal, req, "abandoned", take(), take,
      `the job abandoned was building ${uneven.season.year}`);
  }
  await residenceRow("residence-abandoned",
    () => restarted(residence, Math.floor(residenceCalls / 2), blind.request(false, top)),
    `abandoned for ${blind.season.year}'s layer, then built again`);

  // The controls make no canvas: each lays a hash already taken against one
  // that must not match it, the same season a state lower.
  seasons.forEach((of, i) => {
    const finishedRow = bone[top - 1]![i]!;
    const lower = bone[top - 2]![i]!;
    const ok = finishedRow.built !== "" && lower.whole !== "" && finishedRow.built !== lower.whole;
    rows.push({
      season: of.season.year,
      regime: of.regime,
      palette: "bone",
      state: top,
      variant: "control",
      expect: "differ",
      calls: 0,
      built: finishedRow.built,
      whole: lower.whole,
      ok,
    });
    console.log(`layer ${of.season.year} bone state ${top} control: `
      + (ok ? "differs from the state below" : "READ EQUAL TO THE STATE BELOW"));
  });
  // The residence's control lays it against a season's finished layer, of
  // the same size and palette.
  {
    const against = bone[top - 1]![seasons.indexOf(refusal)]!;
    const ok = residenceSliced.built !== "" && against.whole !== ""
      && residenceSliced.built !== against.whole;
    rows.push({
      season: windowSeason.year,
      regime: win.regime,
      palette: "bone",
      state: 0,
      variant: "residence-control",
      expect: "differ",
      calls: 0,
      built: residenceSliced.built,
      whole: against.whole,
      ok,
      note: `against the finished bone layer of ${refusal.season.year}`,
    });
    console.log(`residence ${windowSeason.year} control: `
      + (ok ? "differs from a season's layer" : "READ EQUAL TO A SEASON'S LAYER"));
  }
  clearLayers();

  const equal = rows.filter((r) => r.expect === "equal");
  const controls = rows.filter((r) => r.expect === "differ");
  return {
    what: "a layer, or the residence, built a slice at a time against the same "
      + "baked whole, each read back from its canvas and compared by hash; a control "
      + "lays one layer against the same season a state lower, and the residence "
      + "against a season's finished layer, each of which must differ. A case "
      + "that misses is taken once more: differing twice is a failure, differing "
      + "once is unsettled and not a pass. Compared by hash and NOT through "
      + "aboveNoise: nothing here passes through a rasteriser",
    cases: equal.length,
    failures: equal.filter((r) => !r.ok && !r.retake?.equal).length,
    unsettled: equal.filter((r) => !r.ok && r.retake?.equal).length,
    controls: controls.length,
    controlFailures: controls.filter((r) => !r.ok).length,
    rows,
  };
}
