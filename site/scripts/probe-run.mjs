#!/usr/bin/env node
/**
 * Drive the renderer's probes headlessly, and record what they said.
 *
 * For a long time after the probes existed there was no completed, calibrated
 * purity result for five of the six hands, because running one meant a person
 * sitting in front of a browser tab for minutes and then copying a JSON blob
 * out of a `<pre>`. Nothing repeatable ever drove them. This does.
 *
 *   npm run probe:purity  -- [--mode hand] [--beat window-many] [--exact]
 *   npm run probe:purity  -- --range plate.game,hand.game [--samples <n>]
 *   npm run probe:purity  -- --t <seconds>[,<seconds>] --mode plate
 *   npm run probe:purity  -- --against <name>[,<name>] [--expect-unchanged hand]
 *   npm run probe:perf    -- [--mode hand,plate] [--t 292] [--frames 20]
 *   npm run probe:perf    -- --range plate.game,hand.game [--step <s>] [--warmup <n>]
 *   npm run probe:perf    -- [--surface probe|laptop|overview] [--pace <ms>|raf]
 *   npm run probe:perf    -- --against <name>,<name>,<name> [--assert-no-regression]
 *                            [--assert-presentation]
 *   npm run probe:continuity -- [--range plate.game,hand.game] [--fps <n>]
 *                               [--surface laptop|probe|overview] [--crop court]
 *                               [--pairs marks] [--no-control] [--assert-continuity]
 *   npm run probe:continuity -- --from <name> [--against <name>] [--assert-continuity]
 *   npm run probe:continuity -- --write-budget <range> --from <name> [--fields <f,...>]
 *   npm run probe:continuity -- --init-budgets
 *
 * DELIBERATELY NOT WIRED INTO `npm run build`. A full purity sweep is minutes,
 * and performance numbers are a property of the machine that took them, so a
 * build that ran either would be slow and non-deterministic. It is a thing you
 * run, on purpose, before changing a renderer - and the verdict it writes is
 * the evidence the next change is judged against.
 *
 * WHAT IT ASSERTS BEFORE IT BELIEVES A ROW
 *   - the probe finished (`window.__probeDone`), rather than the page merely
 *     still being alive. A crash and a slow run look identical from outside;
 *     `#probe-error` and the `__probeDone === false` flag are what tell them
 *     apart.
 *   - every lazily-fetched asset is resident and none failed. Without
 *     `npm run sync-data` the binaries 404 and the probes report them under
 *     `residency.missing` rather than failing, so an unchecked run measures a
 *     piece drawing nothing at all.
 *   - the run produced rows, and produced them for every hand asked for.
 *
 *   - the report is of the sweep that was asked for. A probe that does not
 *     know a flag ignores it and sweeps its default, and a default sweep is a
 *     believable table: so `--range`, `--t`, `--stop` and `--view` are each
 *     checked against what the report says it drew, and a flag given without
 *     its value, or one this driver does not know, is refused before launch.
 *   - for a purity sweep of ranges or instants, that every row was judged
 *     against a floor measured inside its own range. A floor is a property of
 *     the frame, and one borrowed from another passage turns the browser's
 *     jitter on a heavy frame into a finding about the piece.
 *
 * WHAT IT RECORDS, because a measurement without its instrument is not one:
 * the browser and channel, whether it was headless, the viewport and DPR, the
 * URL, the elapsed time, and - for purity - the noise floor that run measured
 * for itself.
 *
 * ONE PERF RUN IS NOT A BASELINE, AND ONE SLOW ROW IS NOT A REGRESSION.
 * Two runs of one build disagree, row for row, by more than most changes are
 * worth: a collection pause lands in one beat this time and another the next.
 * So perf `--against` takes several verdicts and compares each row's mean
 * frame with their median. When a row stands above it the WHOLE sweep is
 * taken again, in a browser of its own, and the row is called REGRESSED only
 * when it is above in every one of those too. The whole sweep and not the row
 * alone, because a row costs something different by itself than it does
 * after the rows before it - measured, and by more than the rule's own
 * margin - so a row retaken alone is a different measurement from the
 * baseline it is held against. The same rule is run between the baseline
 * verdicts themselves and the count printed, so a first-pass flag can be
 * read against how often an unchanged build earns one. It reports, and with
 * `--assert-no-regression` it fails the run. `--assert-presentation` holds
 * its absolute limits the same way: a row outside one fails when it is
 * outside one in every sweep taken again as well.
 *
 * THE LADDER (`--against`), AND WHY IT IS NOT A HASH COMPARISON.
 * "Did this change move a pixel?" looks like one hash against another, and it
 * is not: the same build, probed twice a few minutes apart, has produced two
 * different `direct` hashes for one row, because an accelerated canvas is not
 * bit-stable across memory pressure and a full sweep is exactly that pressure.
 * So a single mismatch is evidence of nothing. The ladder asks instead:
 *
 *   reference     the SET of direct hashes the named verdicts hold for a row,
 *                 counting only rows whose own control was stable. Name the
 *                 full sweep and its single-row reruns together and the set
 *                 holds every face the unchanged build is known to show.
 *   unchanged     the row's hash, or any re-capture's, is in that set.
 *   re-capture    a row that is not is taken again ALONE, in a fresh browser,
 *                 up to a fixed number of times - alone, because a single row
 *                 is free of the pressure that moved the hash in the sweep.
 *                 Every try is spent before a row is called anything but
 *                 unchanged: a later try can still land on a face the
 *                 reference holds, and stopping early would foreclose it.
 *   MOVED         confirmed: every try was spent, no capture is in the set,
 *                 and at least one re-capture taken alone had a stable
 *                 control. The sweep's own capture never confirms by itself -
 *                 it is the single mismatch described above.
 *   unstable-control   re-captures were taken and none had a stable control,
 *                 so nothing was measured alone.
 *   recapture-failed   no re-capture could be taken at all: every try failed
 *                 or returned something other than this row.
 *   not-comparable     the reference holds no stable capture of the row, or
 *                 the row carries no hash.
 *
 * `--expect-unchanged <hand | hand/beat, ...>` exits 1 only on a confirmed
 * MOVED among the rows it names. It exits 2 when the expectation could not be
 * established: a name that selects no row, or a named row that ended anywhere
 * but unchanged or MOVED. That is not a finding about the piece, and it is not
 * a pass either - a row compared against nothing has not been shown unchanged.
 * The proof that a change moved no pixel is still the diff of the renderer's
 * source; this is corroboration, and it is the only kind a hash can give.
 *
 * The sweep's verdict is on disk before the first re-capture, marked
 * incomplete, so a browser that will not launch a fourth time costs a try
 * and not the minutes the sweep took.
 *
 * CONTINUITY, AND WHO JUDGES WHAT.
 * The page captures a range's frames and judges structure only: one cut in
 * the cut's range, none anywhere else, and a control - the last frame drawn
 * again - that makes the range INCONCLUSIVE when two draws of one instant
 * disagree. This driver holds the rest: it runs the seeded self-test before
 * any browser is launched and refuses to launch on a failure, it always takes
 * the two standing controls beside whatever was asked (`plate.cut`, which must
 * show exactly one cut, and `plate.close`, which must show none), and it
 * applies the budgets with the page's own `judge`.
 *
 * BUDGETS ARE GENERATED, NEVER TYPED. `continuity-budgets.json` is written
 * only here, from a named verdict: what the range achieved, and that value
 * with a stated headroom as what it is held to from then on. An entry is keyed
 * by range, cadence and surface, because the same passage has a different
 * still share at another cadence by construction. A write that would loosen
 * an entry is refused unless `--ruling` says a person decided it, and the entry
 * then says so, and goes on saying so however it is rewritten. A budget is
 * taken only from a verdict of the gallery's own condition - the shared View,
 * the near display, the accelerated canvas - whose two standing controls were
 * both taken and both good. The file carries a fingerprint of the metric
 * thresholds: a budget is a statement about those definitions, so when they
 * change every budget is void, the driver says so, and none is applied -
 * structure still is. Void budgets fail `--assert-continuity`: a budget that
 * exists and was not applied is not a pass, whatever the reason.
 *
 * `--from <name>` judges a stored continuity verdict again, launching
 * nothing; `--against <name>` lays this run's per-frame statistics beside
 * another's. How many frame hashes differ between the two is printed as
 * information only, for the reason the ladder exists.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, "..");
const REPO = resolve(SITE, "..");
/** Not data/processed/ (any unknown file there fails qa.py). This directory is
 *  gitignored: a verdict is machine output, regenerated by re-running the probe. */
const OUT_DIR = join(REPO, "docs", "probe");
/** The continuity budgets: tracked, and written by this script alone. */
export const BUDGETS_FILE = join(HERE, "continuity-budgets.json");
const SELFTEST = join(HERE, "continuity-selftest.mjs");
const METRICS = join(SITE, "src", "probe", "continuity-metrics.ts");

function parseArgs(argv) {
  const out = { flags: {}, bools: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out.bools.add(key);
    else {
      out.flags[key] = next;
      i++;
    }
  }
  return out;
}

/**
 * Every flag this driver reads. One outside both lists, or a valued one given
 * bare, used to be dropped in silence - and the run it left behind was a
 * default sweep filed under whatever name the caller chose.
 */
const VALUED = ["mode", "beat", "t", "stop", "display", "frames", "playback", "ops",
  "range", "samples", "view", "out", "timeout", "channel", "port",
  "against", "expect-unchanged", "warmup", "step", "pace",
  "surface", "fps", "crop", "pairs", "write-budget", "from", "fields"];
const SWITCHES = ["exact", "headed", "assert-presentation", "assert-no-regression",
  "no-control", "assert-continuity", "ruling", "init-budgets"];
/** The valued flags that travel to the page as its query. */
const FORWARDED = ["mode", "beat", "t", "stop", "display", "frames", "playback", "ops",
  "range", "samples", "view", "warmup", "step", "pace"];
/** Flags only the perf probe reads. */
const PERF_ONLY = ["warmup", "step", "pace", "assert-no-regression"];
/** The one continuity flag the perf probe reads as well. It travels to the
 *  page from the perf path alone: the purity probe shares the list above and
 *  draws on one surface. */
const PERF_ALSO = "surface";
/** The pace that waits on the browser's animation frame, and the longest wait
 *  in milliseconds any other may be: past it the unit was mistyped, and a walk
 *  of a passage would hold the page for hours. */
const PERF_PACE_RAF = "raf";
const PERF_PACE_MAX_MS = 1000;
/** The longest a frame's step may be asked to be, and the shortest: a pass of
 *  the piece is minutes, and a step outside these is a mistyped unit. */
const PERF_STEP_MAX_S = 60;
const PERF_STEP_MIN_S = 1e-3;
/** What a perf range does not go with: it is walked whole, from its own first
 *  instant, so each of these names another start or another length. */
const NOT_WITH_PERF_RANGE = ["beat", "t", "stop", "frames"];
/** The same for the continuity probe, which reads a different set. */
const CONTINUITY_FORWARDED = ["range", "mode", "surface", "fps", "crop", "pairs",
  "view", "display"];
/** Flags that mean something to the continuity probe alone. */
const CONTINUITY_ONLY = ["surface", "fps", "crop", "pairs", "write-budget", "from", "fields",
  "no-control", "assert-continuity", "ruling", "init-budgets"];
/** Flags the continuity probe does not read. Forwarded, each would be a
 *  default run filed under its name. */
const NOT_CONTINUITY = ["beat", "t", "stop", "frames", "playback", "ops", "samples",
  "expect-unchanged", "assert-presentation", "warmup", "step", "pace",
  "assert-no-regression"];
/** Flags that shape a capture, and so mean nothing to a run that launches
 *  no browser. */
const CAPTURE_FLAGS = ["range", "mode", "surface", "fps", "crop", "pairs", "view", "display",
  "exact", "no-control", "headed", "channel", "port", "timeout"];
/** What the continuity probe can be asked for, said here so a misspelling
 *  costs a second and not a browser. */
const SURFACES = ["probe", "laptop", "overview"];
const CROPS = ["court"];
const PAIRS = ["marks"];
/** The ranges every continuity run takes beside what it was asked for. */
export const CONTINUITY_CONTROLS = ["plate.cut", "plate.close"];
/** The page every probe is loaded in. The probes draw on offscreen surfaces of
 *  their own, so this sets nothing that is measured; it is what the browser
 *  had to composite meanwhile, and a verdict records it. */
const PAGE_VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 1 };
/** The condition the gallery shows the piece in, as a report states it. A
 *  budget is taken in it and applied to runs of it. */
const GALLERY = { view: "shared", display: "near" };
/** How a report's rasteriser line begins when the canvas was pinned to the
 *  software path. */
const SOFTWARE = "software";

/** What is wrong with the flags themselves, before anything is launched. */
export function flagProblems(kind, { flags, bools }) {
  const out = [];
  for (const k of bools) {
    if (VALUED.includes(k)) out.push(`--${k} needs a value`);
    else if (!SWITCHES.includes(k)) out.push(`no such flag: --${k}`);
  }
  for (const k of Object.keys(flags)) {
    if (SWITCHES.includes(k)) out.push(`--${k} takes no value (got ${flags[k]})`);
    else if (!VALUED.includes(k)) out.push(`no such flag: --${k}`);
    // An empty value parses as a zero or as no names at all, and either is a
    // run nobody asked for.
    else if (String(flags[k]).trim() === "") out.push(`--${k} needs a value`);
  }
  const given = (k) => flags[k] !== undefined || bools.has(k);
  const oneOf = (k, have) => {
    if (flags[k] !== undefined && !have.includes(flags[k])) {
      out.push(`no such ${k}: ${flags[k]} (have ${have.join(", ")})`);
    }
  };
  if (kind === "perf") {
    // The perf probe walks a range whole and takes no samples of one, so
    // forwarding the count would be a walk filed under a sampling's name.
    if (flags.samples !== undefined) {
      out.push("--samples is a purity flag; the perf probe walks a range whole");
    }
    if (flags.range !== undefined) {
      for (const k of NOT_WITH_PERF_RANGE) {
        if (given(k)) out.push(`--${k} does not go with --range: a range is walked whole`);
      }
    }
    if (flags.step !== undefined
      && !(Number(flags.step) >= PERF_STEP_MIN_S && Number(flags.step) <= PERF_STEP_MAX_S)) {
      out.push(`--step is seconds per frame, from ${PERF_STEP_MIN_S} to ${PERF_STEP_MAX_S}: `
        + `${flags.step}`);
    }
    if (bools.has("assert-no-regression") && flags.against === undefined) {
      out.push("--assert-no-regression needs --against: regressed from what?");
    }
    if (flags.warmup !== undefined
      && !(Number.isInteger(Number(flags.warmup)) && Number(flags.warmup) >= 0)) {
      out.push(`--warmup is not a count of frames: ${flags.warmup}`);
    }
    if (flags.pace !== undefined && flags.pace !== PERF_PACE_RAF
      && !(Number(flags.pace) > 0 && Number(flags.pace) <= PERF_PACE_MAX_MS)) {
      out.push(`--pace is milliseconds between frames, up to ${PERF_PACE_MAX_MS}, `
        + `or ${PERF_PACE_RAF}: ${flags.pace}`);
    }
    oneOf(PERF_ALSO, SURFACES);
    if (flags["expect-unchanged"] !== undefined) {
      out.push("--expect-unchanged holds purity hashes still; the perf probe has none");
    }
  }
  if (kind === "purity") {
    for (const k of PERF_ONLY) {
      if (given(k)) out.push(`--${k} is a perf flag; the purity probe does not read it`);
    }
    if (bools.has("assert-presentation")) {
      out.push("--assert-presentation judges frame times; the purity probe has none");
    }
  }
  if (kind !== "continuity") {
    for (const k of CONTINUITY_ONLY) {
      if (kind === "perf" && k === PERF_ALSO) continue;
      if (given(k) && VALUED.includes(k) === (flags[k] !== undefined)) {
        out.push(`--${k} is a continuity flag; the ${kind} probe does not read it`);
      }
    }
    return out;
  }
  for (const k of NOT_CONTINUITY) {
    if (given(k)) out.push(`--${k} is not a continuity flag; the continuity probe does not read it`);
  }
  oneOf("surface", SURFACES);
  oneOf("crop", CROPS);
  oneOf("pairs", PAIRS);
  if (flags.fps !== undefined && !(Number(flags.fps) > 0)) {
    out.push(`--fps is not a cadence: ${flags.fps}`);
  }
  // The three that launch nothing: a stored verdict judged again, a budget
  // written from one, and the empty budgets file.
  const writing = flags["write-budget"] !== undefined;
  const stored = flags.from !== undefined;
  const initing = bools.has("init-budgets");
  if (writing && !stored) out.push("--write-budget needs --from: a budget is taken from a named verdict");
  if (flags.fields !== undefined && !writing) out.push("--fields chooses what --write-budget budgets");
  if (bools.has("ruling") && !writing && !initing) {
    out.push("--ruling records a decision about a budget: give it with --write-budget or --init-budgets");
  }
  if (initing && (writing || stored)) out.push("--init-budgets writes the empty file and does nothing else");
  if (writing || stored || initing) {
    for (const k of CAPTURE_FLAGS) {
      if (given(k)) out.push(`--${k} shapes a capture, and this run launches none`);
    }
    if (flags.out !== undefined) out.push("--out names a capture's verdict, and this run takes none");
  }
  if ((writing || initing) && (given("against") || given("assert-continuity"))) {
    out.push("a budget write judges nothing: --against and --assert-continuity belong to a run");
  }
  return out;
}

/** Exit 1 is a failure with a finding or a refusal behind it. */
function die(msg, code = 1) {
  console.error(`probe-run: ${msg}`);
  process.exit(code);
}

/** The exit for an expectation that could not be established either way. */
const EXIT_NOT_ESTABLISHED = 2;

/** Wait for a port to answer, so the run does not race the dev server. */
async function waitForServer(url, timeoutMs) {
  const t0 = Date.now();
  for (;;) {
    try {
      const r = await fetch(url, { method: "GET" });
      if (r.ok) return;
    } catch {
      // not up yet
    }
    if (Date.now() - t0 > timeoutMs) die(`no server answering at ${url}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

/** How a row is named, in a table and as a ladder key. THE STACK's rows carry
 *  their configuration, because one beat is a different frame under each. */
export function rowName(row) {
  return `${handName(row)}/${row.beat}`;
}

/** The hand a row was drawn by, with THE STACK's configuration when it has one. */
function handName(row) {
  return row.config && row.config !== "-" ? `${row.mode}[${row.config}]` : row.mode;
}

/** Whether `--expect-unchanged`'s selector names this row: a hand, a hand and
 *  a beat, or either with the configuration, which is how the tables here
 *  print THE STACK's rows and so how somebody will copy one. */
export function selects(sel, row) {
  return sel === row.mode || sel === handName(row)
    || sel === `${row.mode}/${row.beat}` || sel === rowName(row);
}

/** How many times a row whose hash is not in the reference is taken again. */
export const RECAPTURE_LIMIT = 3;

/** Row times are rounded to a tenth of a millisecond before they are written,
 *  so a floor beat exactly on its range's edge can read just outside it. */
const TIME_SLACK_S = 1e-3;

/**
 * The reference for every row: each direct hash a named verdict holds for it,
 * from rows whose control was stable. An unstable row contributes nothing -
 * its hash is one the instrument itself did not reproduce.
 */
export function referenceSet(verdicts) {
  const ref = new Map();
  for (const v of verdicts) {
    for (const row of v.rows ?? []) {
      if (row.controlStable !== true || !row.hashes?.direct) continue;
      const key = rowName(row);
      if (!ref.has(key)) ref.set(key, new Set());
      ref.get(key).add(row.hashes.direct);
    }
  }
  return ref;
}

/**
 * Where a row stands on the ladder, or null while another capture could still
 * change the answer.
 *
 * `captures` is the sweep's own capture of the row followed by each re-capture
 * that succeeded, as `{ direct, controlStable }`; `triesLeft` is how many more
 * may be attempted. A failed re-capture spends a try and adds nothing here,
 * so "the tries ran out" and "something was measured" are separate facts, and
 * MOVED needs both: every try spent, and a re-capture taken alone whose
 * control was stable. The sweep's own capture is never enough - one hash
 * outside the reference is what an unchanged build also produces.
 */
export function ladderStatus(reference, captures, triesLeft) {
  if (!reference || reference.size === 0) return "not-comparable";
  if (!captures.length || !captures[0].direct) return "not-comparable";
  if (captures.some((c) => reference.has(c.direct))) return "unchanged";
  if (triesLeft > 0) return null;
  const alone = captures.slice(1);
  if (!alone.length) return "recapture-failed";
  return alone.some((c) => c.controlStable === true) ? "MOVED" : "unstable-control";
}

/** The statuses that leave a named expectation neither met nor refuted. */
const SETTLED = ["unchanged", "MOVED"];

/**
 * What became of `--expect-unchanged`: the names that select no row, the
 * selected rows that MOVED, and the selected rows that were never compared.
 * The last two are different failures and exit differently; before the third
 * list existed a named row with no reference passed by matching nothing it
 * could be held against.
 */
export function expectation(asked, rows) {
  const mine = rows.filter((r) => asked.some((sel) => selects(sel, r)));
  return {
    asked,
    unmatched: asked.filter((sel) => !rows.some((r) => selects(sel, r))),
    moved: mine.filter((r) => r.status === "MOVED").map(rowName),
    uncompared: mine.filter((r) => !SETTLED.includes(r.status))
      .map((r) => `${rowName(r)} (${r.status})`),
  };
}

/**
 * Whether the report is of the sweep that was asked for.
 *
 * The page decides what it sweeps, and a page whose probe does not read a
 * flag answers with its default sweep and no complaint. So what was asked is
 * held against what the report says it drew: its kind of sweep, the range or
 * instant on every row, and the View arrangement. For the continuity probe
 * that is the ranges and the standing controls, the surface, the cadence, the
 * crop, the straddle pairs and the rasteriser - each stated by the report, and
 * each as asked. `switches` is the bare flags that were given, which only the
 * continuity check reads.
 */
export function sweepProblems(report, flags, kind = "purity", controls = [], switches = []) {
  if (kind === "continuity") return continuitySweepProblems(report, flags, controls, switches);
  const out = [];
  const list = (s) => String(s).split(",").map((x) => x.trim()).filter(Boolean);
  const rows = report.rows ?? [];
  const drew = report.sweep ?? "default";
  if (flags.view !== undefined && report.view !== flags.view) {
    out.push(`asked for --view ${flags.view}; the probe drew on `
      + `${report.view ?? "a View arrangement it does not state"}`);
  }
  if (flags.range !== undefined) {
    const asked = list(flags.range);
    if (report.sweep !== "range") {
      out.push(`the page's probe ignored --range: it reports a ${drew} sweep`);
    } else {
      const strays = rows.filter((r) => !asked.includes(r.range)).map(rowName);
      if (strays.length) out.push(`rows outside the ranges asked for: ${strays.join(", ")}`);
      // `--beat` narrows the samples, so a range may rightly have none left.
      const absent = flags.beat !== undefined
        ? [] : asked.filter((id) => !rows.some((r) => r.range === id));
      if (absent.length) out.push(`no rows for requested range(s): ${absent.join(", ")}`);
    }
  } else if (flags.t !== undefined) {
    const asked = list(flags.t).map((x) => `t=${Number(x)}`);
    if (report.sweep !== "t") {
      out.push(`the page's probe ignored --t: it reports a ${drew} sweep`);
    } else {
      const strays = rows.filter((r) => !asked.includes(r.beat)).map(rowName);
      if (strays.length) out.push(`rows at instants not asked for: ${strays.join(", ")}`);
      const absent = flags.beat !== undefined
        ? [] : asked.filter((id) => !rows.some((r) => r.beat === id));
      if (absent.length) out.push(`no rows for requested instant(s): ${absent.join(", ")}`);
    }
  } else if (flags.stop !== undefined && report.sweep !== undefined && report.sweep !== "stop") {
    // Only where the report states its sweep: a probe from before it did
    // resolves a stop correctly and says nothing about it.
    out.push(`--stop ${flags.stop} did not resolve: the probe reports a ${drew} sweep`);
  }
  return out;
}

/**
 * Rows judged against a floor from outside their own range.
 *
 * A sweep of ranges or instants floors each group on a beat of its own and
 * says which on every row. This is the check that the saying is true: the
 * floor beat is a sample of the row's own range and lies inside it, as does
 * the row; an instant is floored on itself, by name and by time; and no such
 * row arrives without one. `sweep` is what was ASKED for where the caller
 * knows it, because a report that leaves its own kind out would otherwise
 * excuse itself from the whole check.
 */
export function floorProblems(report, sweep = report.sweep) {
  const out = [];
  const perRow = sweep === "range" || sweep === "t";
  const offset = report.passOffset ?? 0;
  const ranges = new Map((report.ranges ?? []).map((r) => [r.id, r]));
  for (const row of report.rows ?? []) {
    const name = rowName(row);
    if (row.noiseFloorBeat === undefined) {
      if (perRow) out.push(`${name}: no noise floor beat recorded for a ${sweep} sweep`);
      continue;
    }
    if (sweep === "range" && !row.range) {
      out.push(`${name}: no range recorded for a range sweep`);
      continue;
    }
    if (row.range) {
      const r = ranges.get(row.range);
      if (!r) {
        out.push(`${name}: its range ${row.range} is not in the report`);
        continue;
      }
      const inside = (t) => Number.isFinite(t)
        && t >= offset + r.from - TIME_SLACK_S && t <= offset + r.to + TIME_SLACK_S;
      if (!String(row.noiseFloorBeat).startsWith(`${row.range}@`)) {
        out.push(`${name}: floored on ${row.noiseFloorBeat}, which is no sample of ${row.range}`);
      }
      if (!inside(row.noiseFloorT)) {
        out.push(`${name}: floored on ${row.noiseFloorBeat} at ${row.noiseFloorT}s, `
          + `outside ${row.range} (${offset + r.from}..${offset + r.to}s)`);
      }
      if (!inside(row.t)) out.push(`${name}: drawn at ${row.t}s, outside ${row.range}`);
    } else if (row.noiseFloorBeat !== row.beat) {
      out.push(`${name}: an instant floored on another one (${row.noiseFloorBeat})`);
    } else if (!(Math.abs(row.noiseFloorT - row.t) <= TIME_SLACK_S)) {
      out.push(`${name}: drawn at ${row.t}s and floored at ${row.noiseFloorT}s`);
    }
  }
  return out;
}

/** Whether two verdicts' direct hashes are hashes of the same thing: the same
 *  surface, the same display profile, the same rasteriser. */
export function sameInstrument(a, b) {
  const face = (r) => JSON.stringify([
    r.surface?.width, r.surface?.height, r.surface?.dpr, r.display ?? null,
    String(r.rasterisation ?? "").split(" ")[0],
  ]);
  return face(a) === face(b);
}

const listOf = (s) => String(s).split(",").map((x) => x.trim()).filter(Boolean);

// --- perf: asked against got, and one run against several ---------------------

/** The step and warm-up a perf report without the fields was taken at: what
 *  the probe used before either could be set, and uses now when neither is.
 *  The surface and the pace likewise: a report that names neither drew on the
 *  one surface there was and waited for nothing between frames. */
const PERF_DEFAULT_STEP = 1 / 60;
const PERF_DEFAULT_WARMUP = 5;
const PERF_DEFAULT_SURFACE = "probe";
const PERF_DEFAULT_PACE = null;

/**
 * Whether a perf report is of the run that was asked for: the ranges, the
 * step, the warm-up, the pace and the surface, each stated by the report and
 * each as asked. A page whose probe reads none of them times its default beats
 * and says nothing. A pace is held to one thing more: the page was visible
 * throughout, because a hidden page is handed its timers and animation frames
 * slowly, and the pace asked for is then not the pace kept.
 */
export function perfSweepProblems(report, flags) {
  const out = [];
  const rows = report.rows ?? [];
  if (flags.range !== undefined) {
    const asked = listOf(flags.range);
    if (report.sweep !== "range") {
      out.push(`the page's probe ignored --range: it reports a ${report.sweep ?? "default"} sweep`);
    } else {
      const strays = rows.filter((r) => !asked.includes(r.range)).map(perfKey);
      if (strays.length) out.push(`rows outside the ranges asked for: ${strays.join(", ")}`);
      const absent = asked.filter((id) => !rows.some((r) => r.range === id));
      if (absent.length) out.push(`no rows for requested range(s): ${absent.join(", ")}`);
    }
  }
  if (flags.step !== undefined && report.stepSeconds !== Number(flags.step)) {
    out.push(`asked for --step ${flags.step}; the probe stepped by `
      + `${report.stepSeconds ?? "a length it does not state"}`);
  }
  if (flags.warmup !== undefined
    && (report.sweep === undefined || report.warmupFrames !== Number(flags.warmup))) {
    // A probe from before the warm-up could be set reports the fixed count it
    // used and no sweep; asked for that same count it would otherwise read as
    // having obeyed.
    out.push(`asked for --warmup ${flags.warmup}; the probe `
      + (report.sweep === undefined ? "does not read it" : `discarded ${report.warmupFrames}`));
  }
  if (flags.pace !== undefined) {
    const asked = flags.pace === PERF_PACE_RAF ? PERF_PACE_RAF : Number(flags.pace);
    if (report.pace !== asked) {
      out.push(`asked for --pace ${flags.pace}; the probe `
        + (report.pace === undefined ? "does not read it"
          : report.pace === null ? "waited for nothing between frames"
            : `kept a pace of ${report.pace}`));
    } else if (report.visibilityState !== "visible") {
      out.push(`--pace ${flags.pace}: the page was `
        + `${report.visibilityState ?? "in a state the report does not give"}, `
        + "and only a visible page is handed the pace it asks for");
    } else if (asked === PERF_PACE_RAF) {
      // The usual interval is the run's own reading of what it was given, so
      // a row without one was paced by nothing that can be checked.
      const bare = rows.filter((r) => !(r.intervalModalMs > 0)).map(perfKey);
      if (bare.length) out.push(`--pace ${flags.pace}: no frame intervals on ${bare.join(", ")}`);
    }
  }
  if (flags.surface !== undefined && report.surface?.name !== flags.surface) {
    out.push(`asked for --surface ${flags.surface}; the probe drew on `
      + `${report.surface?.name ?? "a surface it does not name"}`);
  }
  return out;
}

/** How a perf row is named. THE STACK is always timed at its densest
 *  configuration, so a hand and a beat (or a range) are the whole address. */
export function perfKey(row) {
  return `${row.mode}/${row.beat}`;
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * A row has regressed when its mean frame stands above the baseline's by both
 * a share and an amount. Either alone flags noise: most rows cost a fraction
 * of a millisecond, where a fifth more is a rounding step, and the few costly
 * rows wander by half a millisecond between two runs of one build.
 */
export const PERF_REGRESS_RATIO = 1.2;
export const PERF_REGRESS_MS = 0.5;

export function perfRegressed(base, meanMs) {
  return meanMs > base.median * PERF_REGRESS_RATIO && meanMs - base.median > PERF_REGRESS_MS;
}

/** Whether two perf verdicts timed the same thing the same way. */
export function perfComparable(a, b) {
  const face = (r) => JSON.stringify([
    r.surface?.width, r.surface?.height, r.surface?.dpr, r.display ?? null,
    r.framesPerBeat ?? null, r.warmupFrames ?? PERF_DEFAULT_WARMUP,
    r.stepSeconds ?? PERF_DEFAULT_STEP, r.sweep === "range" ? "range" : "instants",
    r.surface?.name ?? PERF_DEFAULT_SURFACE, r.pace ?? PERF_DEFAULT_PACE,
    /[?&]exact=1/.test(r.instrument?.url ?? "") || r.exact === true,
  ]);
  return face(a) === face(b);
}

/**
 * The baseline for every row: the median of its mean frame time over the
 * named verdicts. One run is not a baseline - two runs of one build disagree
 * by more than most changes are worth - so a row any verdict lacks has none.
 */
export function perfBaseline(verdicts) {
  const base = new Map();
  if (!verdicts.length) return base;
  const tables = verdicts.map((v) => new Map((v.rows ?? []).map((r) => [perfKey(r), r])));
  for (const key of tables[0].keys()) {
    if (!tables.every((t) => t.has(key))) continue;
    const means = tables.map((t) => t.get(key).meanMs);
    // A verdict that does not carry the figure is not one of the runs.
    if (!means.every(Number.isFinite)) continue;
    base.set(key, { means, median: median(means) });
  }
  return base;
}

/**
 * Where a row stands against its baseline, or null while another capture
 * could still change the answer.
 *
 * `means` is the row's mean in the sweep, followed by its mean in each sweep
 * successfully taken again. A row is REGRESSED only when it regressed in the
 * sweep and in EVERY one of those and every try was spent; one back inside
 * the baseline settles it as noise at once, because a build that is slower is
 * slower each time it is asked.
 */
export function perfStatus(base, means, triesLeft) {
  if (!base || !means.length || !means.every(Number.isFinite)) return "not-comparable";
  if (!perfRegressed(base, means[0])) return "within";
  const alone = means.slice(1);
  if (alone.some((m) => !perfRegressed(base, m))) return "noise";
  if (triesLeft > 0) return null;
  return alone.length ? "REGRESSED" : "recapture-failed";
}

/**
 * How often the rule's first pass flags a row when nothing changed: each
 * baseline run judged against the others. Printed beside every comparison, so
 * a first-pass flag is read against how often one costs nothing. Null with
 * fewer than three runs, where there are no others to take a median of.
 */
export function perfSameCodeRate(verdicts) {
  if (verdicts.length < 3) return null;
  let flagged = 0;
  let rows = 0;
  for (let i = 0; i < verdicts.length; i++) {
    const base = perfBaseline(verdicts.filter((_, j) => j !== i));
    for (const row of verdicts[i].rows ?? []) {
      const b = base.get(perfKey(row));
      if (!b) continue;
      rows++;
      if (perfRegressed(b, row.meanMs)) flagged++;
    }
  }
  return { flagged, rows };
}

/**
 * What `--assert-no-regression` makes of a comparison: the rows that
 * REGRESSED, and the rows the comparison never settled - no baseline for
 * them, or no sweep could be taken again. The second list is not a pass: a
 * comparison against nothing usable would otherwise succeed by comparing
 * nothing.
 */
export function perfAssertion(differential) {
  const rows = differential?.rows ?? [];
  return {
    regressed: rows.filter((r) => r.status === "REGRESSED").map((r) => r.row),
    unsettled: rows.filter((r) => !["within", "noise", "REGRESSED"].includes(r.status))
      .map((r) => `${r.row} (${r.status})`),
    compared: rows.length,
  };
}

/** The absolute limits `--assert-presentation` holds every row to. */
export const PRESENTATION_LIMITS = { p95MsBelow: 16.67, maxMsBelow: 33.3, noFrameAboveMs: 50 };

/** Why a row is outside the presentation limits, or nothing. */
export function presentationReasons(row, limits = PRESENTATION_LIMITS) {
  const reasons = [];
  if (!(row.p95Ms < limits.p95MsBelow)) reasons.push(`p95 ${row.p95Ms}ms`);
  if (!(row.maxMs < limits.maxMsBelow)) reasons.push(`max ${row.maxMs}ms`);
  if (row.maxMs > limits.noFrameAboveMs) reasons.push(`frame above ${limits.noFrameAboveMs}ms`);
  return reasons;
}

/**
 * Whether a row that broke a limit in the sweep has failed, given what it did
 * in each sweep taken again (`{ reasons }` each, or `{ error }`), or null
 * while another is owed. One clean retake clears it: a single slow frame in a
 * sweep of thousands is what a collection pause looks like, and the same
 * sweep on the same build produces one about as often as not. A row fails
 * when every retake broke a limit too, or none could be taken.
 */
export function presentationStatus(retakes, triesLeft) {
  if (retakes.some((r) => !r.error && r.reasons.length === 0)) return "cleared";
  if (triesLeft > 0) return null;
  return "failed";
}

// --- continuity ---------------------------------------------------------------

/**
 * Whether a continuity report is of the run that was asked for.
 *
 * The same standard purity's flags are held to, for the same reason: a page
 * that does not read `surface` draws on its default and returns a table that
 * looks like any other. So the report has to STATE its surface, cadence, crop
 * and pairs, and each has to be the one asked for; its rows have to be the
 * ranges asked for and the standing controls, no more and no fewer; and what a
 * flag promises per row - a court summary, a straddle pair per mark - has to
 * be on the rows.
 */
function continuitySweepProblems(report, flags, controls, switches) {
  const out = [];
  const rows = report.rows ?? [];
  if (report.probe !== "continuity") {
    out.push(`the page answered as ${report.probe ?? "no probe it names"}, not continuity`);
  }
  // Both ways: a pinned canvas nobody asked for is as much another run as an
  // accelerated one under --exact's name.
  const exact = switches.includes("exact");
  if (typeof report.rasterisation !== "string") {
    out.push("the report does not state its rasteriser");
  } else if (report.rasterisation.startsWith(SOFTWARE) !== exact) {
    out.push(exact
      ? `the page's probe ignored --exact: it drew ${report.rasterisation}`
      : "no --exact was asked for and the probe drew on the software rasteriser");
  }
  if (flags.view !== undefined && report.view !== flags.view) {
    out.push(`asked for --view ${flags.view}; the probe drew on `
      + `${report.view ?? "a View arrangement it does not state"}`);
  }
  if (flags.display !== undefined && report.display !== flags.display) {
    out.push(`asked for --display ${flags.display}; the probe drew ${report.display ?? "one it does not state"}`);
  }

  const s = report.surface;
  if (!s || typeof s.name !== "string" || !(s.dpr > 0)
    || !(s.backingWidth > 0) || !(s.backingHeight > 0)) {
    out.push("the report does not state the surface it drew on");
  } else if (flags.surface !== undefined && s.name !== flags.surface) {
    out.push(`the page's probe ignored --surface ${flags.surface}: it drew on ${s.name}`);
  }
  if (!(report.fps > 0)) out.push("the report does not state its cadence");
  else if (flags.fps !== undefined && report.fps !== Number(flags.fps)) {
    out.push(`the page's probe ignored --fps ${flags.fps}: it drew at ${report.fps}`);
  }

  const cropped = report.crop ?? null;
  if ((flags.crop ?? null) !== cropped) {
    out.push(flags.crop !== undefined
      ? `the page's probe ignored --crop ${flags.crop}: it reports ${cropped ?? "no crop"}`
      : `no crop was asked for and the probe reports ${cropped}`);
  } else if (cropped) {
    const bare = rows.filter((r) => !r.court || !r.perFrame?.court).map((r) => r.range);
    if (bare.length) out.push(`--crop ${cropped}: no cropped summary on ${bare.join(", ")}`);
  }

  const paired = report.pairs ?? null;
  if ((flags.pairs ?? null) !== paired) {
    out.push(flags.pairs !== undefined
      ? `the page's probe ignored --pairs ${flags.pairs}: it reports ${paired ?? "no pairs"}`
      : `no pairs were asked for and the probe reports ${paired}`);
  } else if (paired) {
    const taken = report.straddle?.rows;
    if (!Array.isArray(taken)) out.push(`--pairs ${paired}: the report carries no pair rows`);
    else {
      for (const r of rows) {
        const mine = taken.filter((p) => p.range === r.range).length;
        if (mine !== (r.marks ?? 0)) {
          out.push(`--pairs ${paired}: ${r.range} carries ${r.marks ?? 0} mark(s) and ${mine} pair(s)`);
        }
      }
      if (!rows.some((r) => (r.marks ?? 0) > 0)) {
        out.push(`--pairs ${paired}: no range in the run carries a mark`);
      }
    }
  }

  const got = rows.map((r) => r.range);
  const absentControls = controls.filter((id) => !got.includes(id));
  if (absentControls.length) out.push(`no rows for the control range(s): ${absentControls.join(", ")}`);
  const unmarked = rows.filter((r) => controls.includes(r.range) !== (r.control === true))
    .map((r) => r.range);
  if (unmarked.length) out.push(`rows that disagree about being a control: ${unmarked.join(", ")}`);
  if (flags.range !== undefined) {
    const asked = listOf(flags.range);
    const strays = got.filter((id) => !asked.includes(id) && !controls.includes(id));
    if (strays.length) out.push(`rows outside the ranges asked for: ${strays.join(", ")}`);
    const absent = asked.filter((id) => !got.includes(id));
    if (absent.length) out.push(`no rows for requested range(s): ${absent.join(", ")}`);
  } else if (flags.mode !== undefined) {
    const hands = listOf(flags.mode);
    const strays = rows.filter((r) => !hands.includes(r.mode) && !controls.includes(r.range))
      .map((r) => r.range);
    if (strays.length) out.push(`rows drawn by hands not asked for: ${strays.join(", ")}`);
  }
  const twice = got.filter((id, i) => got.indexOf(id) !== i);
  if (twice.length) out.push(`ranges reported more than once: ${twice.join(", ")}`);

  for (const r of rows) {
    if (!r.summary || !r.controlDraw || typeof r.controlDraw.maxDelta !== "number") {
      out.push(`${r.range}: no summary, or no control draw`);
      continue;
    }
    const frames = r.perFrame?.t?.length;
    // A pair across a boundary that has a range of its own is drawn, listed
    // and left out of the summary.
    const pairs = r.frames - 1 - (r.seamPairs?.length ?? 0);
    if (!(r.frames > 1) || frames !== r.frames || r.summary.pairs !== pairs) {
      out.push(`${r.range}: ${r.frames} frame(s) stated, ${frames ?? 0} listed, `
        + `${r.summary.pairs} pair(s) summarised`);
    }
  }
  return out;
}

/**
 * Whether what came back from the page is a continuity run at all, before
 * anything is read off it.
 *
 * The residency block is required outright here. The other probes forgive a
 * report without one; this one draws passages whose every mark is a lazily
 * fetched asset, and frames of an empty game are all still and all green.
 */
export function captureProblems(taken, flags, controls = [], switches = []) {
  const out = [];
  const report = taken.report ?? {};
  const res = report.residency;
  if (!res || !Array.isArray(res.resident) || !res.resident.length) {
    out.push("the report carries no residency block: nothing says the assets were there");
  } else {
    if ((res.missing ?? []).length) {
      out.push(`assets never became resident: ${res.missing.join(", ")} `
        + "(run `npm run dev`, not `vite` - `dev` runs sync-data first)");
    }
    if ((res.errors ?? []).length) out.push(`asset failures: ${res.errors.join("; ")}`);
  }
  if (!Array.isArray(report.rows) || report.rows.length === 0) {
    out.push("the probe produced no rows");
  } else {
    out.push(...sweepProblems(report, flags, "continuity", controls, switches));
  }
  if ((taken.pageErrors ?? []).length) {
    out.push(`uncaught page errors: ${taken.pageErrors.join(" | ")}`);
  }
  return out;
}

/**
 * Load the metrics the page uses, in Node: the definitions, `judge`, and the
 * thresholds. The two-step the register's own script uses - Node strips types
 * by itself where it can, and the bundler's transformer is already installed
 * for where it cannot.
 */
export async function loadMetrics() {
  try {
    return await import(pathToFileURL(METRICS).href);
  } catch {
    const { transformSync } = await import("esbuild");
    const js = transformSync(readFileSync(METRICS, "utf8"), { loader: "ts", format: "esm" }).code;
    return await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
  }
}

/** One short name for a set of thresholds, whatever order they are written in. */
export function fingerprintOf(thresholds) {
  const stable = JSON.stringify(Object.keys(thresholds).sort().map((k) => [k, thresholds[k]]));
  return createHash("sha256").update(stable).digest("hex").slice(0, 16);
}

/**
 * How an achieved value becomes a budget. Data, and written into every entry,
 * so the file says how each of its numbers was reached without pointing at
 * anything outside itself.
 *
 * A BOUND IS NEVER LEFT LYING ON WHAT WAS ACHIEVED. A factor leaves nothing
 * above an achieved nothing, and two captures of one build do not agree to
 * the last pair: an accelerated canvas moves a channel between two draws of an
 * instant, which is enough to tip one pair across a definition. So every
 * bound stands at least one rounding step above its achieved value, and a
 * share of pairs at least one pair above it.
 *
 * AND NEVER WHERE IT HOLDS NOTHING. A quantity that cannot pass one is not
 * given a bound of one or more; that field is left unjudged and the entry
 * says so by leaving it null, in place of a budget no run could break.
 */
export const HEADROOM = {
  shares: {
    fields: ["stillShare", "flickerLowFrameShare", "flickerHighFrameShare", "dipDepth",
      "markStepRatio"],
    times: 1.25,
    roundedUpTo: 0.001,
    atLeast: {
      steps: 1,
      pairs: 1,
      ofPairs: ["stillShare", "flickerLowFrameShare", "flickerHighFrameShare"],
    },
    notJudgedFrom: {
      bound: 1,
      fields: ["stillShare", "flickerLowFrameShare", "flickerHighFrameShare", "dipDepth"],
    },
  },
  counts: { fields: ["longestStillRunS"], unit: "frames", plus: 1 },
};

/** Guards the round-up against a product that is a whole step only in exact
 *  arithmetic and a hair over it in floating point. */
const ROUNDING_SLACK = 1e-9;

/** One achieved value with its headroom, or null where the bound it would
 *  get holds nothing. `pairs` is how many pairs the value is a share of. */
export function withHeadroom(field, achieved, fps, pairs = 0) {
  if (HEADROOM.counts.fields.includes(field)) {
    // Seconds on the page, frames here: one more frame than was achieved.
    return (Math.round(achieved * fps) + HEADROOM.counts.plus) / fps;
  }
  const { times, roundedUpTo: step, atLeast, notJudgedFrom } = HEADROOM.shares;
  const onePair = atLeast.ofPairs.includes(field) && pairs > 0 ? atLeast.pairs / pairs : 0;
  const wanted = Math.max(achieved * times, achieved + onePair);
  const steps = Math.max(
    Math.ceil(wanted / step - ROUNDING_SLACK),
    Math.floor(achieved / step + ROUNDING_SLACK) + atLeast.steps,
  );
  const bound = Number((steps * step).toFixed(String(step).length));
  return notJudgedFrom.fields.includes(field) && bound >= notJudgedFrom.bound ? null : bound;
}

export const budgetKey = (e) => `${e.range} @ ${e.fps} fps on ${e.surface}`;

/** The file as it is generated before any budget exists. */
export function emptyBudgets(fingerprint) {
  return { thresholds: fingerprint, entries: [] };
}

export function readBudgets(path = BUDGETS_FILE) {
  if (!existsSync(path)) return null;
  const unreadable = () =>
    new Error(`${path} is not a budgets file: it is generated, so generate it again`);
  let file;
  try {
    file = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw unreadable();
  }
  const entry = (e) => e && typeof e.range === "string" && typeof e.fps === "number"
    && typeof e.surface === "string" && typeof e.crop === "string"
    && e.budget && typeof e.budget === "object";
  if (!file || typeof file.thresholds !== "string" || !Array.isArray(file.entries)
    || !file.entries.every(entry)) {
    throw unreadable();
  }
  return file;
}

const budgetsText = (file) => `${JSON.stringify(file, null, 2)}\n`;

/**
 * The budgets that may be applied: all of them, or none.
 *
 * A budget is a number about the metric definitions it was taken under. Under
 * any other thresholds it bounds a different quantity, and applying it would
 * be judging with a ruler nobody has read - so a file whose fingerprint is not
 * the code's has no budgets in force, however many it lists.
 */
export function budgetsInForce(file, fingerprint) {
  if (!file) return { void: false, entries: [], voided: [], listed: 0 };
  const ok = file.thresholds === fingerprint;
  return {
    void: !ok,
    entries: ok ? file.entries : [],
    // Kept apart, so a row whose budget was voided can be told from a row
    // that never had one.
    voided: ok ? [] : file.entries,
    listed: file.entries.length,
  };
}

/** Which of a row's two summaries a crop names. */
const summaryOf = (row, crop) => (crop === "court" ? row.court : row.summary);

/**
 * A budget entry from one row of a verdict.
 *
 * Plain values and nothing else: what was measured, on what, and the rule
 * that turned the one into the other. No name of the verdict it came from, no
 * date and no path - those are facts about a file that is not in the tree,
 * and the entry has to mean the same thing to a reader who has only the tree.
 * The backing size is recorded because a surface's name outlives its
 * numbers: the same name over another window is another picture.
 */
export function entryFrom(row, report, metrics, fields = null) {
  const crop = report.crop === "court" ? "court" : "full";
  const summary = summaryOf(row, crop);
  const wanted = fields ?? metrics.BUDGET_FIELDS;
  const achieved = {};
  const budget = {};
  for (const f of metrics.BUDGET_FIELDS) {
    const value = summary[f] ?? null;
    achieved[f] = value;
    const excused = row.expect === "held" && metrics.STILL_FIELDS.includes(f);
    budget[`${f}Max`] = value === null || excused || !wanted.includes(f)
      ? null : withHeadroom(f, value, report.fps, summary.pairs);
  }
  return {
    range: row.range,
    fps: report.fps,
    surface: report.surface.name,
    backing: { width: report.backing.width, height: report.backing.height },
    crop,
    achieved,
    budget,
    headroom: HEADROOM,
  };
}

/** Why writing `next` over `old` would let more through, or [] if it would not. */
export function loosens(old, next) {
  const out = [];
  if (old.crop !== next.crop) out.push(`judged on the ${next.crop} frame where it was the ${old.crop}`);
  const size = (e) => (e.backing ? `${e.backing.width}x${e.backing.height}` : "an unstated backing");
  if (size(old) !== size(next)) out.push(`taken on ${size(next)} where it was ${size(old)}`);
  for (const [k, was] of Object.entries(old.budget)) {
    const now = next.budget[k] ?? null;
    if (was === null) continue;
    if (now === null) out.push(`${k} ${was} -> not judged`);
    else if (now > was) out.push(`${k} ${was} -> ${now}`);
  }
  return out;
}

/**
 * The file with one entry written into it, or the reasons it was not.
 *
 * Budgets ratchet: a rewrite may tighten an entry freely and may loosen it
 * only when somebody has ruled that it should, in which case the entry says
 * it was ruled - and every entry written over it says so too, because the
 * same loosened budget written a second time loosens nothing and would
 * otherwise wipe the record that a ruling was ever made. A file taken under
 * other thresholds is not amended at all - its entries are void together,
 * and are cleared together or not at all. An entry that would judge no field
 * is not written: the range would read as budgeted and be held to nothing.
 */
export function withEntry(file, entry, fingerprint, { ruling = false } = {}) {
  const base = file ?? emptyBudgets(fingerprint);
  if (base.thresholds !== fingerprint && base.entries.length) {
    return {
      refused: [`the file's ${base.entries.length} budget(s) were taken under other thresholds `
        + "and are void; --init-budgets --ruling clears them"],
    };
  }
  if (!Object.values(entry.budget).some((max) => max !== null)) {
    return {
      refused: [`${budgetKey(entry)}: no field would be judged, and an entry that bounds `
        + "nothing is not written"],
    };
  }
  const old = base.entries.find((e) => budgetKey(e) === budgetKey(entry));
  const looser = old ? loosens(old, entry) : [];
  if (looser.length && !ruling) {
    return {
      refused: [
        ...looser.map((l) => `${budgetKey(entry)} would loosen: ${l}`),
        "a looser budget is a decision: --ruling records that it was made",
      ],
    };
  }
  const written = looser.length || old?.ruled ? { ...entry, ruled: true } : entry;
  const entries = [...base.entries.filter((e) => e !== old), written]
    .sort((a, b) => (budgetKey(a) < budgetKey(b) ? -1 : budgetKey(a) > budgetKey(b) ? 1 : 0));
  return { file: { thresholds: fingerprint, entries }, loosened: looser };
}

/** Whether a budget entry is for this row of this report. */
const budgetFor = (e, row, report) =>
  e.range === row.range && e.fps === report.fps && e.surface === report.surface?.name;

/** Why a budget on file cannot be held against this row, or null if it can. */
function unappliable(entry, row, report) {
  if (!summaryOf(row, entry.crop)) return `it was taken on the ${entry.crop} crop, which this run did not take`;
  const b = report.backing;
  if (entry.backing && (b?.width !== entry.backing.width || b?.height !== entry.backing.height)) {
    return `it was taken on a ${entry.backing.width}x${entry.backing.height} backing and this run `
      + `drew ${b?.width}x${b?.height} under the same surface name`;
  }
  if (report.view !== GALLERY.view) return "this run drew on a View per target, which the gallery never does";
  if (report.display !== GALLERY.display) return `this run drew the ${report.display} display`;
  return null;
}

/**
 * Every row of a continuity report, judged: structure always, and its budget
 * where one is in force for this range, cadence and surface.
 *
 * `status` says which of the things a reader needs to tell apart happened:
 *   budgeted     a budget was applied, on the frame it was taken on
 *   unbudgeted   none exists; the verdict is structure alone
 *   report-only  the range is listed and never budgeted
 *   void         one exists and was taken under other thresholds. Not a pass.
 *   unjudged     one exists and could not be applied: this run did not take
 *                the crop it was taken on, drew another size of surface under
 *                the same name, is not the gallery's condition, or the entry
 *                bounds nothing this range is asked. `why` says which. Not a
 *                pass.
 */
export function judgeRows(report, inForce, metrics) {
  return (report.rows ?? []).map((row) => {
    const mine = (entries) => (row.reportOnly ? null
      : (entries ?? []).find((e) => budgetFor(e, row, report)) ?? null);
    const entry = mine(inForce.entries);
    const voided = entry ? null : mine(inForce.voided);
    let why = entry ? unappliable(entry, row, report) : null;
    const applicable = entry && !why;
    const j = metrics.judge(row.summary, row.expect, null, row.cutPairs ?? null,
      row.controlDraw?.maxDelta ?? null);
    let reasons = [...j.reasons];
    let judged = [];
    if (applicable && j.verdict !== "INCONCLUSIVE") {
      const b = metrics.judge(summaryOf(row, entry.crop), row.expect, entry.budget,
        row.cutPairs ?? null, null);
      // Structure is read off the full frame above; only the budget's own
      // reasons are taken from the frame the budget names.
      reasons = [...reasons, ...b.reasons.filter((r) => r !== "cutEvents")];
      judged = b.judged;
      // An entry written here always bounds something its range is asked.
      // One that no longer does - the range has since become a hold - would
      // otherwise read as a budget applied.
      if (!judged.length) why = "none of the fields it bounds is asked of this range";
    }
    return {
      range: row.range,
      verdict: j.verdict === "INCONCLUSIVE" ? j.verdict : reasons.length ? "red" : "green",
      reasons,
      judged,
      status: row.reportOnly ? "report-only" : voided ? "void" : !entry ? "unbudgeted"
        : why ? "unjudged" : "budgeted",
      ...(entry ? { crop: entry.crop } : {}),
      ...(why ? { why } : {}),
    };
  });
}

/**
 * What `--assert-continuity` holds a run to: no red, no range that measured
 * nothing, no budget that exists and was not applied - to one row, or to any
 * because the thresholds moved under all of them - and both standing controls
 * present: a run without them has not shown that it can see a cut or that it
 * can leave a rounding step alone. Unbudgeted ranges are listed, not failed:
 * there is no budget to hold them to yet.
 *
 * Two more lists are information. `seamsNotTaken`: a range ended on a step of
 * a cut's weight, which is the seam range's to judge, and the seam range was
 * not in the run - so nothing here judged it. `budgetsNotTaken`: budgets in
 * force for this cadence and surface whose ranges the run did not draw.
 */
export function assertion(report, judged, inForce = null) {
  const of = (v) => judged.filter((j) => j.verdict === v).map((j) =>
    `${j.range}${j.reasons.length ? ` (${j.reasons.join(", ")})` : ""}`);
  const rows = report.rows ?? [];
  const got = rows.map((r) => r.range);
  const out = {
    red: of("red"),
    inconclusive: of("INCONCLUSIVE"),
    unjudged: judged.filter((j) => j.status === "unjudged").map((j) => `${j.range}: ${j.why}`),
    voidBudgets: inForce?.void && inForce.listed > 0
      ? [`${inForce.listed} on file, taken under other thresholds`] : [],
    missingControls: CONTINUITY_CONTROLS.filter((id) => !got.includes(id)),
    unbudgeted: judged.filter((j) => j.status === "unbudgeted").map((j) => j.range),
    seamsNotTaken: rows
      .filter((r) => r.summary?.seamEvents?.length && r.seam && !got.includes(r.seam))
      .map((r) => `${r.range} -> ${r.seam}`),
    budgetsNotTaken: (inForce?.entries ?? [])
      .filter((e) => e.fps === report.fps && e.surface === report.surface?.name
        && !got.includes(e.range))
      .map((e) => e.range),
  };
  return {
    ...out,
    passed: !out.red.length && !out.inconclusive.length && !out.unjudged.length
      && !out.voidBudgets.length && !out.missingControls.length,
  };
}

/**
 * Why a budget may not be taken from this verdict's row, or [] if it may.
 *
 * A budget is what the gallery's picture is held to, so it is taken from the
 * gallery's condition and from a run whose instrument was shown working: the
 * code's thresholds, the shared View, the near display, the accelerated
 * canvas, the range itself green on structure, and both standing controls
 * taken and green beside it. Any other verdict is a true measurement of
 * something else.
 */
export function budgetSourceProblems(report, range, metrics, fingerprint) {
  if (fingerprintOf(report.thresholds ?? {}) !== fingerprint) {
    return ["it was taken under other thresholds; take it again"];
  }
  const row = (report.rows ?? []).find((r) => r.range === range);
  if (!row) return [`it holds no range ${range}`];
  if (row.reportOnly) return [`${range} is report-only and is never budgeted`];
  const out = [];
  const judged = judgeRows(report, budgetsInForce(null, fingerprint), metrics);
  const said = (j) => `${j.verdict}${j.reasons.length ? ` (${j.reasons.join(", ")})` : ""}`;
  const mine = judged.find((j) => j.range === range);
  if (mine.verdict !== "green") {
    out.push(`${range} is ${said(mine)} there: a budget is not taken from a range that failed `
      + "or measured nothing");
  }
  if (report.view !== GALLERY.view) out.push("it drew on a View per target, which the gallery never does");
  if (report.display !== GALLERY.display) {
    out.push(`it drew the ${report.display ?? "unstated"} display; budgets are taken on ${GALLERY.display}`);
  }
  if (String(report.rasterisation ?? SOFTWARE).startsWith(SOFTWARE)) {
    out.push("it drew on the software rasteriser; a budget is taken as the gallery draws");
  }
  for (const id of CONTINUITY_CONTROLS) {
    const control = judged.find((j) => j.range === id);
    if (!control) out.push(`it does not hold the control ${id}, so nothing shows the instrument was working`);
    else if (control.verdict !== "green") out.push(`its control ${id} is ${said(control)}`);
  }
  return out;
}

/** Whether two continuity verdicts are of the same picture taken the same
 *  way: cadence, surface and its size, display, View arrangement, rasteriser.
 *  The crop is not among them - it narrows the statistics a verdict adds, and
 *  the full-frame columns compared here are the same with or without it. */
function sameCapture(a, b) {
  const face = (r) => JSON.stringify([
    r.fps, r.surface?.name, r.backing?.width, r.backing?.height, r.display ?? null,
    r.view ?? null, String(r.rasterisation ?? "").split(" ")[0],
  ]);
  return face(a) === face(b);
}

/**
 * Two continuity verdicts, frame against frame.
 *
 * Statistics, not hashes: the mean, the changed-pixel count and the energy of
 * each frame are properties of the picture that survive a channel moving by
 * one, and a hash is not. How many hashes differ is counted and reported as
 * information - on an accelerated canvas it is not zero for an unchanged
 * build, which is the whole reason the purity ladder exists.
 */
export function compareContinuity(before, after) {
  const same = sameCapture(before, after);
  const sameDefinitions = fingerprintOf(before.thresholds ?? {})
    === fingerprintOf(after.thresholds ?? {});
  const farthest = (a, b) => {
    let worst = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] === null || b[i] === null) continue;
      worst = Math.max(worst, Math.abs(a[i] - b[i]));
    }
    return worst;
  };
  return (after.rows ?? []).map((row) => {
    const was = (before.rows ?? []).find((r) => r.range === row.range);
    if (!was) return { range: row.range, comparable: false, why: "not in the other verdict" };
    if (!same) {
      return {
        range: row.range,
        comparable: false,
        why: "another surface, cadence, display, View arrangement or rasteriser",
      };
    }
    if (was.frames !== row.frames) {
      return { range: row.range, comparable: false, why: `${was.frames} frames against ${row.frames}` };
    }
    const a = was.perFrame;
    const b = row.perFrame;
    // A summary is the per-frame figures read through the thresholds. Two
    // verdicts taken under different ones would show the instrument's change
    // as the picture's, so their summaries are not laid side by side at all;
    // the per-frame figures below do not pass through a threshold.
    const summary = sameDefinitions ? {} : null;
    for (const k of Object.keys(sameDefinitions ? row.summary : {})) {
      if (k === "cutEvents" || k === "seamEvents") continue;
      summary[k] = [was.summary[k] ?? null, row.summary[k] ?? null];
    }
    return {
      range: row.range,
      comparable: true,
      frames: row.frames,
      hashesMoved: b.hash.filter((h, i) => h !== a.hash[i]).length,
      maxMeanDelta: farthest(a.mean, b.mean),
      maxChangedPxDelta: farthest(a.changedPx, b.changedPx),
      maxEnergyDelta: farthest(a.energy, b.energy),
      summary,
    };
  });
}

const num = (x, places) => (x === null || x === undefined ? "-" : Number(x).toFixed(places));

/** One line per range, and one more per range for the crop where it was taken. */
function printContinuity(report, judged) {
  const head = ["range", "expect", "frames", "still", "longest s", "flick lo", "flick hi",
    "dip", "mark step", "cuts", "verdict"];
  const line = (name, expect, frames, s, verdict) => [
    name, expect, String(frames), num(s.stillShare, 3), num(s.longestStillRunS, 3),
    num(s.flickerLowFrameShare, 3), num(s.flickerHighFrameShare, 3), num(s.dipDepth, 4),
    num(s.markStepRatio, 2),
    `${s.cutEvents.length}${s.seamEvents.length ? ` (+${s.seamEvents.length} seam)` : ""}`,
    verdict,
  ];
  const lines = [head];
  for (const row of report.rows) {
    const j = judged.find((x) => x.range === row.range);
    const why = j.reasons.length ? `: ${j.reasons.join(", ")}` : "";
    const tag = j.status === "budgeted" ? "" : ` [${j.status}]`;
    lines.push(line(row.range + (row.control ? " *" : ""), row.expect, row.frames, row.summary,
      `${j.verdict}${why}${tag}`));
    if (row.court) lines.push(line("  court crop", "", "", row.court, ""));
  }
  const widths = head.map((_, c) => Math.max(...lines.map((l) => l[c].length)));
  for (const l of lines) {
    console.log(`  ${l.map((cell, c) => (c < 2 ? cell.padEnd(widths[c]) : cell.padStart(widths[c]))).join("  ").trimEnd()}`);
  }
  if (report.rows.some((r) => r.control)) console.log("  * a standing control");
  for (const row of report.rows) {
    if (!row.summary.seamEvents.length) continue;
    // Said, not just counted: the step is real and belongs to another range.
    const taken = report.rows.some((r) => r.range === row.seam);
    console.log(`  ${row.range}: a cut-weight step on its last pair, across the boundary `
      + `${row.seam} is there to judge; not counted against ${row.range}`
      + `${taken ? "" : `. ${row.seam} was not taken in this run, so nothing here judged the step`}`);
  }
}

function printPairs(report) {
  const rows = report.straddle?.rows ?? [];
  if (!rows.length) return;
  console.log(`probe-run: straddle pairs, ${report.straddle.feedFrames} of a feed frame either side of each mark`);
  for (const range of [...new Set(rows.map((p) => p.range))]) {
    const mine = rows.filter((p) => p.range === range);
    const above = mine.filter((p) => p.aboveNoise);
    const fell = mine.filter((p) => p.fellPx > 0);
    // The pair beside each straddle: the same width of feed with no step in
    // it. If those are above noise too, a straddle's difference is not the
    // step's alone.
    const idle = mine.filter((p) => p.beside?.aboveNoise);
    const worst = mine.reduce((a, p) => (p.maxFall > a.maxFall ? p : a), mine[0]);
    console.log(`  ${range}: ${mine.length} pair(s), ${above.length} above noise, `
      + `${fell.length} with a pixel that fell; largest fall ${worst.maxFall} level(s) `
      + `at mark ${worst.mark} (${worst.fellPx} px); `
      + `${idle.length} of the pairs beside them above noise`);
    for (const p of above) {
      const b = p.box;
      console.log(`    mark ${String(p.mark).padStart(2)}: ${p.channels} channel(s), max delta ${p.maxDelta}, `
        + `${p.fellPx} px fell by up to ${p.maxFall}`
        + (b ? `, in ${b.x0},${b.y0}..${b.x1},${b.y1}` : "")
        + ` (floor ${p.floor.channels} at ${p.floor.maxDelta})`);
    }
  }
}

function printAgainst(name, compared) {
  console.log(`probe-run: against ${name}, per frame (hashes moved is information only)`);
  for (const c of compared) {
    if (!c.comparable) {
      console.log(`  ${c.range}: not comparable - ${c.why}`);
      continue;
    }
    console.log(`  ${c.range}: ${c.frames} frames, ${c.hashesMoved} hash(es) moved; `
      + `max change in mean ${num(c.maxMeanDelta, 4)}, in changed px ${c.maxChangedPxDelta}, `
      + `in energy ${num(c.maxEnergyDelta, 4)}`);
    const moved = Object.entries(c.summary ?? {}).filter(([, [a, b]]) => a !== b)
      .map(([k, [a, b]]) => `${k} ${num(a, 4)} -> ${num(b, 4)}`);
    if (moved.length) console.log(`    ${moved.join("; ")}`);
  }
  if (compared.some((c) => c.comparable && c.summary === null)) {
    console.log("probe-run: the two verdicts were taken under different thresholds, so their "
      + "summaries are not compared: a share that moved would be the instrument's doing");
  }
}

function readVerdict(name, what) {
  const file = join(OUT_DIR, `${name.replace(/\.json$/, "")}.json`);
  if (!existsSync(file)) die(`${what} ${name}: no such verdict (${file})`);
  const verdict = JSON.parse(readFileSync(file, "utf8"));
  if (verdict.probe !== "continuity") die(`${what} ${name}: not a continuity verdict`);
  return verdict;
}

/** Everything the continuity kind does, capture or not. */
async function continuityMain({ flags, bools }) {
  // The definitions are shown failing before anything is measured with them.
  const selftest = spawnSync(process.execPath, [SELFTEST], { encoding: "utf8" });
  if (selftest.status !== 0) {
    process.stderr.write(`${selftest.stdout ?? ""}${selftest.stderr ?? ""}`);
    die("the continuity self-test failed; nothing launched");
  }
  console.log(`probe-run: ${(selftest.stdout ?? "").trim().split("\n").pop()}`);

  const metrics = await loadMetrics();
  const fingerprint = fingerprintOf(metrics.THRESHOLDS);

  // Read before anything is launched: the file is tracked and can arrive
  // broken by a merge, and finding that out after the capture would cost the
  // capture.
  let onFile = null;
  let unreadable = null;
  try {
    onFile = readBudgets();
  } catch (e) {
    unreadable = e instanceof Error ? e.message : String(e);
  }

  if (bools.has("init-budgets")) {
    if (unreadable && !bools.has("ruling")) {
      die(`${unreadable}; writing over a file that cannot be read needs --ruling`);
    }
    if (onFile?.entries.length && !bools.has("ruling")) {
      die(`${onFile.entries.length} budget(s) are on file; emptying them needs --ruling`);
    }
    writeFileSync(BUDGETS_FILE, budgetsText(emptyBudgets(fingerprint)));
    console.log(`probe-run: wrote ${BUDGETS_FILE.replace(`${REPO}/`, "")}: no entries, thresholds ${fingerprint}`);
    return;
  }
  if (unreadable) die(`${unreadable}; nothing launched`);

  if (flags["write-budget"] !== undefined) {
    const report = readVerdict(flags.from, "--from");
    const unfit = budgetSourceProblems(report, flags["write-budget"], metrics, fingerprint);
    if (unfit.length) {
      unfit.forEach((u) => console.error(`probe-run: --from ${flags.from}: ${u}`));
      die("nothing written");
    }
    const row = report.rows.find((r) => r.range === flags["write-budget"]);
    let fields = null;
    if (flags.fields !== undefined) {
      fields = listOf(flags.fields);
      const unknown = fields.filter((f) => !metrics.BUDGET_FIELDS.includes(f));
      if (unknown.length || !fields.length) {
        die(`--fields: no such field(s): ${unknown.join(", ")} (have ${metrics.BUDGET_FIELDS.join(", ")})`);
      }
    }
    const entry = entryFrom(row, report, metrics, fields);
    const done = withEntry(onFile, entry, fingerprint, { ruling: bools.has("ruling") });
    if (done.refused) {
      done.refused.forEach((r) => console.error(`probe-run: ${r}`));
      die("nothing written");
    }
    writeFileSync(BUDGETS_FILE, budgetsText(done.file));
    const written = done.file.entries.find((e) => budgetKey(e) === budgetKey(entry));
    console.log(`probe-run: budget for ${budgetKey(entry)}, on the ${entry.crop} frame`
      + `${written.ruled ? " (ruled: an entry here was loosened by a ruling)" : ""}`);
    for (const f of metrics.BUDGET_FIELDS) {
      const max = entry.budget[`${f}Max`];
      const asked = (fields ?? metrics.BUDGET_FIELDS).includes(f);
      const excused = row.expect === "held" && metrics.STILL_FIELDS.includes(f);
      // Asked for, measured, not excused and still null: the bound it would
      // have got is one no run could break.
      const vacuous = max === null && asked && !excused && entry.achieved[f] !== null;
      console.log(`  ${f.padEnd(22)} achieved ${num(entry.achieved[f], 6).padStart(10)}  `
        + `budget ${max !== null ? max : vacuous ? "not judged: its bound would hold nothing" : "not judged"}`);
    }
    console.log(`probe-run: wrote ${BUDGETS_FILE.replace(`${REPO}/`, "")}`);
    return;
  }

  let against = null;
  if (flags.against !== undefined) {
    const names = listOf(flags.against);
    if (names.length !== 1) die("--against compares this run with one continuity verdict: name one");
    against = { name: names[0], verdict: readVerdict(names[0], "--against") };
  }

  const controls = bools.has("no-control") || flags.from !== undefined ? [] : CONTINUITY_CONTROLS;
  let report;
  let instrument = null;
  let path = null;
  if (flags.from !== undefined) {
    report = readVerdict(flags.from, "--from");
    console.log(`probe-run: judging ${flags.from} again; nothing launched`);
  } else {
    const channel = flags.channel ?? "chrome";
    const headless = !bools.has("headed");
    const port = Number(flags.port ?? 5173);
    const timeoutMs = Number(flags.timeout ?? 3600) * 1000;
    const q = new URLSearchParams({ probe: "continuity" });
    for (const k of CONTINUITY_FORWARDED) {
      if (flags[k] !== undefined) q.set(k, flags[k]);
    }
    if (controls.length) q.set("control", controls.join(","));
    if (bools.has("exact")) q.set("exact", "1");
    const url = `http://localhost:${port}/?${q}`;
    await waitForServer(`http://localhost:${port}/`, 30_000);

    let taken;
    try {
      taken = await capture("continuity", url, { channel, headless, timeoutMs });
    } catch (e) {
      die(`the continuity probe could not be driven: ${e instanceof Error ? e.message : e}`);
    }
    if (!taken.ok) {
      console.error(taken.error);
      die("the continuity probe failed");
    }
    report = taken.report;
    if (!report) die("the continuity probe finished but published no report");

    const problems = captureProblems(taken, flags, controls, [...bools]);
    if (problems.length) {
      problems.forEach((p) => console.error(`probe-run: ${p}`));
      die("the run is not believable; nothing written");
    }
    instrument = {
      driver: "site/scripts/probe-run.mjs",
      browser: "chromium",
      channel,
      headless,
      playwright: (await import("playwright/package.json", { with: { type: "json" } }))
        .default.version,
      node: process.version,
      platform: `${process.platform} ${process.arch}`,
      url,
      elapsedSeconds: Math.round(taken.elapsedMs / 100) / 10,
      // The probe draws onto its own offscreen surface, stated in the report;
      // this is only what the browser had to composite meanwhile.
      pageViewport: PAGE_VIEWPORT,
    };
    const narrowed = CONTINUITY_FORWARDED.some((k) => flags[k] !== undefined)
      || bools.has("exact") || bools.has("no-control");
    path = join(OUT_DIR, flags.out ? `${flags.out}.json` : `continuity${narrowed ? "-partial" : ""}.json`);
  }

  // --- judge ----------------------------------------------------------------
  const sameThresholds = fingerprintOf(report.thresholds ?? {}) === fingerprint;
  // A verdict taken under other thresholds is held to no budget either: its
  // summaries are of other definitions than the budgets'.
  const inForce = budgetsInForce(onFile, sameThresholds ? fingerprint : null);
  const judged = judgeRows(report, inForce, metrics);
  const compared = against ? compareContinuity(against.verdict, report) : null;
  const held = assertion(report, judged, inForce);

  if (path) {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(path, `${JSON.stringify({
      ...report,
      judged: {
        thresholds: fingerprint,
        budgets: { onFile: inForce.listed, void: inForce.void, applied: inForce.entries.length },
        rows: judged,
        assertion: held,
      },
      ...(compared ? { against: { name: against.name, rows: compared } } : {}),
      instrument,
    }, null, 2)}\n`);
  }

  const s = report.surface;
  console.log(`probe-run: ${report.rows.length} range(s)`
    + `${instrument ? ` in ${instrument.elapsedSeconds}s` : ""} at ${report.fps} fps on ${s.name} `
    + `(${s.width}x${s.height} css at dpr ${num(s.dpr, 4)}, backing ${s.backingWidth}x${s.backingHeight})`
    + `${report.crop ? `, statistics also on the ${report.crop} crop` : ""}`);
  if (!sameThresholds) {
    console.log("probe-run: this verdict was taken under other thresholds than the code's; "
      + "its summaries are not held to any budget");
  } else if (!onFile) {
    console.log("probe-run: no budgets file; --init-budgets writes the empty one");
  } else if (inForce.void && inForce.listed) {
    console.log(`probe-run: EVERY BUDGET IS VOID: the ${inForce.listed} on file were taken under `
      + "other thresholds. None is applied; structure and the controls still are");
  } else if (inForce.void) {
    console.log("probe-run: the budgets file was generated under other thresholds and holds "
      + "no entries; --init-budgets stamps it again");
  }
  printContinuity(report, judged);
  if (judged.some((j) => j.verdict === "INCONCLUSIVE")) {
    // Two draws of one instant disagreed by more than the still level, which
    // an accelerated canvas does under load. Nothing about the range follows.
    console.log("probe-run: an INCONCLUSIVE range measured nothing: its control, the last frame "
      + "drawn again, came back different. Take it again alone (--range <id>), or with --exact");
  }
  for (const j of judged.filter((x) => x.status === "unjudged")) {
    console.log(`probe-run: ${j.range} [unjudged]: it has a budget, and ${j.why}. `
      + "It was held to structure only, which is not a pass");
  }
  if (report.crop) {
    // Said wherever the two summaries are printed side by side, so the crop
    // is not read as leaving out more than it does.
    console.log(`probe-run: the ${report.crop} crop leaves out the plate's margin and nothing `
      + "else: lettering a hand sets inside the court is inside the crop");
  }
  if (report.pairs) printPairs(report);
  if (compared) printAgainst(against.name, compared);
  if (held.unbudgeted.length) {
    console.log(`probe-run: unbudgeted (structure only): ${held.unbudgeted.join(", ")}`);
  }
  if (held.budgetsNotTaken.length) {
    const whole = flags.range === undefined && flags.mode === undefined && flags.from === undefined;
    console.log(`probe-run: ${held.budgetsNotTaken.length} budget(s) on file are for ranges this `
      + `run did not take${whole ? `: ${held.budgetsNotTaken.join(", ")}` : ""}`);
  }
  if (path) console.log(`probe-run: wrote ${path.replace(`${REPO}/`, "")}`);

  if (bools.has("assert-continuity") && !held.passed) {
    for (const r of held.red) console.error(`probe-run: red: ${r}`);
    for (const r of held.inconclusive) console.error(`probe-run: INCONCLUSIVE: ${r}`);
    for (const r of held.unjudged) console.error(`probe-run: budget not applied: ${r}`);
    // Void for one of two reasons, and the remedy differs: the budgets are
    // stale, or the verdict is. Telling somebody to clear good budgets because
    // an old verdict was read back would throw away what was signed off.
    if (!sameThresholds && held.voidBudgets.length) {
      console.error("probe-run: this verdict was taken under other thresholds than the code's "
        + "and cannot be held to the budgets on file: take it again");
    } else {
      for (const r of held.voidBudgets) {
        console.error(`probe-run: budgets void: ${r}. Take them again, or clear them with `
          + "--init-budgets --ruling");
      }
    }
    for (const r of held.missingControls) console.error(`probe-run: control not taken: ${r}`);
    die(`continuity assertion failed${path ? "; failing report was written" : ""}`);
  }
}

/**
 * One page load of one probe URL, in a browser of its own.
 *
 * A fresh browser each time, not a fresh tab: a re-capture exists to take a
 * row free of the memory pressure a sweep builds up, and a tab in the sweep's
 * own browser inherits its GPU process and whatever state that was left in.
 */
async function capture(kind, url, { channel, headless, timeoutMs, quiet = false }) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    channel,
    headless,
    // The gallery does not run on a software rasteriser and neither should the
    // instrument that says whether the gallery fits in its frame budget.
    args: ["--use-gl=angle", "--enable-gpu-rasterization", "--ignore-gpu-blocklist"],
  });
  try {
    const { deviceScaleFactor, ...viewport } = PAGE_VIEWPORT;
    const page = await browser.newPage({ viewport, deviceScaleFactor });

    page.on("console", (m) => {
      if (process.env.PROBE_VERBOSE) console.log(`  [page] ${m.text()}`);
    });
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));

    if (!quiet) {
      console.log(`probe-run: ${kind} -> ${url}`);
      console.log(`probe-run: ${channel}, headless=${headless}, timeout=${timeoutMs / 1000}s`);
    }
    const t0 = Date.now();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });

    // The probe's own completion flag, not a DOM node that never appears when it
    // throws. `false` means it failed and said so; the error node carries why.
    await page.waitForFunction(() => window.__probeDone !== undefined, null,
      { timeout: timeoutMs, polling: 500 });
    const elapsedMs = Date.now() - t0;
    const ok = await page.evaluate(() => window.__probeDone);

    if (!ok) {
      const error = await page.evaluate(() => {
        const p = document.querySelector("#probe-error");
        return p ? p.textContent : "(no #probe-error node)";
      });
      return { ok: false, error, elapsedMs, pageErrors };
    }

    // Hyphenated, because `shared.ts:emit` keys the global by the same string it
    // gives the DOM node. `window.probePurity` does not exist and reads undefined.
    const report = await page.evaluate((k) => window[`probe-${k}`], kind);
    return { ok: true, report, elapsedMs, pageErrors };
  } finally {
    await browser.close();
  }
}

async function main() {
  const [kind, ...rest] = process.argv.slice(2);
  if (kind !== "purity" && kind !== "perf" && kind !== "continuity") {
    die("usage: probe-run.mjs <purity|perf> [--mode ids] [--beat ids] [--t s[,s]] "
      + "[--range ids] [--samples n] [--view fresh] "
      + "[--stop semantic-id] [--display near|room] [--frames n] [--exact] "
      + "[--against names] [--expect-unchanged hand|hand/beat,...] "
      + "[--assert-presentation] [--timeout s] [--headed] [--channel name] [--port n]\n"
      + "       probe-run.mjs perf [--range ids] [--step s] [--warmup n] "
      + "[--surface probe|laptop|overview] [--pace ms|raf] [--against names] "
      + "[--assert-no-regression]\n"
      + "       probe-run.mjs continuity [--range ids] [--mode ids] [--fps n] "
      + "[--surface laptop|probe|overview] [--crop court] [--pairs marks] [--view fresh] "
      + "[--display near|room] [--exact] [--no-control] [--against name] "
      + "[--assert-continuity] [--timeout s] [--headed] [--channel name] [--port n]\n"
      + "       probe-run.mjs continuity --from name [--against name] [--assert-continuity]\n"
      + "       probe-run.mjs continuity --write-budget range --from name "
      + "[--fields f,...] [--ruling]\n"
      + "       probe-run.mjs continuity --init-budgets [--ruling]");
  }
  const { flags, bools } = parseArgs(rest);
  const refused = flagProblems(kind, { flags, bools });
  if (refused.length) {
    refused.forEach((p) => console.error(`probe-run: ${p}`));
    die("nothing launched");
  }
  if (kind === "continuity") {
    await continuityMain({ flags, bools });
    return;
  }

  // The ladder's inputs are read before anything is launched: a misspelt
  // verdict name should cost a second, not a sweep.
  const against = [];
  if (flags.against !== undefined) {
    const names = flags.against.split(",").map((x) => x.trim()).filter(Boolean);
    if (!names.length) die("--against needs the name of at least one verdict in docs/probe/");
    for (const name of names) {
      const file = join(OUT_DIR, `${name.replace(/\.json$/, "")}.json`);
      if (!existsSync(file)) die(`--against ${name}: no such verdict (${file})`);
      let verdict;
      try {
        verdict = JSON.parse(readFileSync(file, "utf8"));
      } catch {
        die(`--against ${name}: the file does not parse as a verdict (${file})`);
      }
      if (verdict.probe !== kind) die(`--against ${name}: not a ${kind} verdict`);
      against.push({ name, verdict });
    }
  }
  const expected = [];
  if (flags["expect-unchanged"] !== undefined) {
    if (!against.length) die("--expect-unchanged needs --against: unchanged from what?");
    expected.push(...flags["expect-unchanged"]
      .split(",").map((x) => x.trim()).filter(Boolean));
    if (!expected.length) die("--expect-unchanged needs a hand, or hand/beat");
  }

  // Which browser, said out loud in the verdict. Headless Chromium falls back
  // to SwiftShader, which is exactly NOT the rasterisation pipeline a gallery
  // machine runs, so the performance numbers are taken on the real Chrome with
  // the GPU left alone. Purity is self-calibrating either way - it measures its
  // own noise floor - but the browser still goes in the report.
  const channel = flags.channel ?? "chrome";
  const headless = !bools.has("headed");
  const port = Number(flags.port ?? 5173);
  const timeoutMs = Number(flags.timeout ?? (kind === "purity" ? 3600 : 900)) * 1000;

  const q = new URLSearchParams({ probe: kind });
  // `ops` narrows THE STACK's configuration axis the way `mode` and `beat`
  // narrow the other two. Without it a stack run always sweeps every
  // configuration, which is right for a verdict and slow for an iteration.
  for (const k of FORWARDED) {
    if (flags[k] !== undefined) q.set(k, flags[k]);
  }
  if (kind === "perf" && flags[PERF_ALSO] !== undefined) q.set(PERF_ALSO, flags[PERF_ALSO]);
  if (bools.has("exact")) q.set("exact", "1");
  const url = `http://localhost:${port}/?${q}`;

  await waitForServer(`http://localhost:${port}/`, 30_000);

  let taken;
  try {
    taken = await capture(kind, url, { channel, headless, timeoutMs });
  } catch (e) {
    // A browser that will not launch, or a page that never finished: said in
    // one line, as every other refusal here is.
    die(`the ${kind} probe could not be driven: ${e instanceof Error ? e.message : e}`);
  }
  if (!taken.ok) {
    console.error(taken.error);
    die(`the ${kind} probe failed`);
  }
  const { report, elapsedMs, pageErrors } = taken;

  if (!report) die(`the ${kind} probe finished but published no report`);

  // --- refuse a run that measured the wrong thing --------------------------
  const problems = [];
  const res = report.residency ?? {};
  if ((res.missing ?? []).length) {
    problems.push(`assets never became resident: ${res.missing.join(", ")} `
      + "(run `npm run dev`, not `vite` - `dev` runs sync-data first)");
  }
  if ((res.errors ?? []).length) problems.push(`asset failures: ${res.errors.join("; ")}`);
  if (!Array.isArray(report.rows) || report.rows.length === 0) {
    problems.push("the probe produced no rows");
  }
  if (flags.mode) {
    const asked = flags.mode.split(",").map((s) => s.trim()).filter(Boolean);
    const got = new Set(report.rows.map((r) => r.mode));
    const absent = asked.filter((m) => !got.has(m));
    if (absent.length) problems.push(`no rows for requested hand(s): ${absent.join(", ")}`);
  }
  if (pageErrors.length) problems.push(`uncaught page errors: ${pageErrors.join(" | ")}`);
  if (kind === "purity") {
    problems.push(...sweepProblems(report, flags));
    const asked = flags.range !== undefined ? "range" : flags.t !== undefined ? "t" : report.sweep;
    for (const p of floorProblems(report, asked)) problems.push(`noise floor: ${p}`);
  }
  if (kind === "perf") problems.push(...perfSweepProblems(report, flags));
  if (problems.length) {
    problems.forEach((p) => console.error(`probe-run: ${p}`));
    die("the run is not believable; nothing written");
  }

  // The sweep taken again, whole, in a browser of its own, and kept: the
  // comparison and the absolute limits both ask "and the next time?", and the
  // answer to both is the same few sweeps. Whole, because a row timed alone
  // is not the row timed after the rows before it. Believed on the sweep's own
  // terms or not at all - it finished, its assets were resident, the page
  // threw nothing, and it is the sweep that was asked for, row for row.
  const reruns = [];
  const rerun = async (i) => {
    while (reruns.length <= i) {
      const n = reruns.length + 1;
      let got;
      try {
        got = await capture(kind, url, { channel, headless, timeoutMs, quiet: true });
      } catch (e) {
        got = { ok: false, error: e instanceof Error ? e.message : String(e), pageErrors: [] };
      }
      const why = !got.ok ? String(got.error)
        : got.pageErrors.length ? `page errors: ${got.pageErrors.join(" | ")}`
          : ((got.report?.residency?.missing ?? []).length
            || (got.report?.residency?.errors ?? []).length)
            ? "assets were not resident"
            : perfSweepProblems(got.report, flags)[0]
              ?? ((got.report?.rows ?? []).length !== report.rows.length
                ? "it did not return the sweep's rows" : null);
      console.log(`probe-run: the sweep taken again, ${n}/${RECAPTURE_LIMIT}: `
        + (why ? `failed (${why})` : `${got.report.rows.length} row(s) in `
          + `${Math.round(got.elapsedMs / 100) / 10}s`));
      reruns.push(why ? { error: why }
        : { rows: new Map(got.report.rows.map((r) => [perfKey(r), r])) });
    }
    return reruns[i];
  };
  const perfAgain = async (row, i) => {
    const r = await rerun(i);
    if (r.error) return { error: r.error };
    const mine = r.rows.get(perfKey(row));
    return mine ? { row: mine } : { error: "the sweep taken again did not return this row" };
  };

  // --- the absolute limits, held under the same every-retake rule ------------
  let presentation = null;
  if (kind === "perf" && bools.has("assert-presentation")) {
    const retaken = [];
    for (const row of report.rows) {
      const reasons = presentationReasons(row);
      if (!reasons.length) continue;
      const retakes = [];
      let status = presentationStatus(retakes, RECAPTURE_LIMIT);
      while (status === null) {
        const next = await perfAgain(row, retakes.length);
        retakes.push(next.error ? { error: next.error } : {
          p95Ms: next.row.p95Ms, maxMs: next.row.maxMs, reasons: presentationReasons(next.row),
        });
        status = presentationStatus(retakes, RECAPTURE_LIMIT - retakes.length);
        const last = retakes[retakes.length - 1];
        console.log(`probe-run: ${perfKey(row)} outside the limits (${reasons.join(", ")}); `
          + `retake ${retakes.length}/${RECAPTURE_LIMIT} -> `
          + (last.error ? `failed (${last.error})`
            : last.reasons.length ? last.reasons.join(", ") : "inside")
          + (status ? ` (${status})` : ""));
      }
      retaken.push({ row: perfKey(row), reasons, status, retakes });
    }
    const failures = retaken.filter((r) => r.status === "failed")
      .map((r) => `${r.row}: ${r.reasons.join(", ")}, and in every retake`);
    presentation = {
      limits: PRESENTATION_LIMITS,
      rule: "a row fails when it is outside a limit in the sweep and in every sweep taken again",
      retakeLimit: RECAPTURE_LIMIT,
      passed: failures.length === 0,
      failures,
      retaken,
    };
  }

  // --- what is written, and where --------------------------------------------
  const instrument = {
    driver: "site/scripts/probe-run.mjs",
    browser: "chromium",
    channel,
    headless,
    playwright: (await import("playwright/package.json", { with: { type: "json" } }))
      .default.version,
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    url,
    elapsedSeconds: Math.round(elapsedMs / 100) / 10,
    // The probe draws onto an offscreen surface of its OWN, the one its report
    // states, so the page's viewport does not set what was measured. Recorded
    // anyway: it is what the browser had to composite while the run was going
    // on.
    pageViewport: PAGE_VIEWPORT,
  };
  let differential = null;
  const stamp = (ladder) => ({
    ...report,
    ...(ladder ? { ladder } : {}),
    ...(differential ? { differential } : {}),
    ...(presentation ? { presentationAcceptance: presentation } : {}),
    instrument,
  });

  mkdirSync(OUT_DIR, { recursive: true });
  // `--out` names the file, so a "before" measurement is not overwritten by the
  // "after" that is supposed to be compared with it. Unnamed narrowed runs are
  // marked partial rather than posing as a full sweep.
  const suffix = flags.mode || flags.beat || flags.t || flags.stop || flags.display || flags.ops
    || flags.range || flags.samples || flags.view || flags.warmup || flags.step
    || flags.pace || flags.surface || flags.frames || bools.has("exact")
    ? "-partial" : "";
  const path = join(OUT_DIR, flags.out ? `${flags.out}.json` : `${kind}${suffix}.json`);
  const write = (ladder) => writeFileSync(path, `${JSON.stringify(stamp(ladder), null, 2)}\n`);

  // --- the ladder -----------------------------------------------------------
  let ladder = null;
  if (kind === "perf" && against.length) {
    const usable = against.filter((a) => perfComparable(a.verdict, { ...report, instrument }));
    for (const a of against) {
      if (!usable.includes(a)) {
        console.error(`probe-run: --against ${a.name} was timed on another surface, display, `
          + "rasteriser, step, warm-up, pace or frame count; it is not used");
      }
    }
    const verdicts = usable.map((a) => a.verdict);
    const base = perfBaseline(verdicts);
    const rows = [];
    for (const row of report.rows) {
      const key = perfKey(row);
      const b = base.get(key);
      const means = [row.meanMs];
      const recaptures = [];
      let status = perfStatus(b, means, RECAPTURE_LIMIT);
      while (status === null) {
        let next = await perfAgain(row, recaptures.length);
        if (!next.error && !Number.isFinite(next.row.meanMs)) {
          next = { error: "the sweep taken again carries no mean for this row" };
        }
        recaptures.push(next.error ? { error: next.error } : { meanMs: next.row.meanMs });
        if (!next.error) means.push(next.row.meanMs);
        status = perfStatus(b, means, RECAPTURE_LIMIT - recaptures.length);
        console.log(`probe-run: ${key} above its baseline; taken again `
          + `${recaptures.length}/${RECAPTURE_LIMIT} -> `
          + `${next.error ? `failed (${next.error})` : `${next.row.meanMs} ms`}`
          + `${status ? ` (${status})` : ""}`);
      }
      rows.push({
        row: key,
        status,
        meanMs: row.meanMs,
        baselineMedianMs: b ? b.median : null,
        baselineMeansMs: b ? b.means : [],
        ...(recaptures.length ? { recaptures } : {}),
      });
    }
    const counts = {};
    for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
    differential = {
      against: against.map((a) => ({ name: a.name, used: usable.includes(a) })),
      rule: {
        ratio: PERF_REGRESS_RATIO,
        ms: PERF_REGRESS_MS,
        recaptureLimit: RECAPTURE_LIMIT,
        says: "REGRESSED when the row stands above the median of the baselines by both "
          + "the ratio and the amount in the sweep and in every sweep taken again",
      },
      sameCodeFirstPass: perfSameCodeRate(verdicts),
      counts,
      rows,
    };
  }
  if (kind === "purity" && against.length) {
    const usable = against.filter((a) => sameInstrument(a.verdict, report));
    for (const a of against) {
      if (!usable.includes(a)) {
        console.error(`probe-run: --against ${a.name} was taken on another surface, display `
          + "or rasteriser; its hashes are of a different picture and are not used");
      }
    }
    const named = against.map((a) => ({
      name: a.name,
      used: usable.includes(a),
      rows: (a.verdict.rows ?? []).length,
      stableRows: (a.verdict.rows ?? []).filter((r) => r.controlStable === true).length,
      url: a.verdict.instrument?.url,
    }));
    // The sweep is minutes of work and the re-captures below each launch a
    // browser. What the sweep found goes to disk first, and says of itself
    // that its ladder was not finished.
    write({ complete: false, against: named, recaptureLimit: RECAPTURE_LIMIT });

    const reference = referenceSet(usable.map((a) => a.verdict));
    // A row taken again alone: the sweep's own address, narrowed to the row.
    const sweep = report.sweep ?? (flags.stop ? "stop" : "beats");
    const again = async (row) => {
      const one = new URLSearchParams(q);
      one.set("mode", row.mode);
      if (row.config && row.config !== "-") one.set("ops", row.config);
      if (sweep === "t") {
        one.set("t", row.beat.replace(/^t=/, ""));
        one.delete("beat");
      } else if (sweep !== "stop") {
        one.set("beat", row.beat);
        if (row.range) one.set("range", row.range);
      }
      // A re-capture is believed on the sweep's own terms or not at all: it
      // finished, its assets were resident, the page threw nothing, and it
      // returned this row and only this row with a hash on it. Anything else,
      // a browser that would not launch included, is a try spent and no
      // capture - two re-captures that both drew without an asset would
      // otherwise agree with each other and confirm a move nobody made.
      let got;
      try {
        got = await capture(kind, `http://localhost:${port}/?${one}`,
          { channel, headless, timeoutMs, quiet: true });
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
      if (!got.ok) return { error: String(got.error) };
      if (got.pageErrors.length) return { error: `page errors: ${got.pageErrors.join(" | ")}` };
      const res = got.report?.residency ?? {};
      if ((res.missing ?? []).length || (res.errors ?? []).length) {
        return { error: "assets were not resident for the re-capture" };
      }
      const mine = (got.report?.rows ?? []).filter((r) => rowName(r) === rowName(row));
      if (mine.length !== 1 || got.report.rows.length !== 1) {
        return { error: "the re-capture did not return this row alone" };
      }
      if (!mine[0].hashes?.direct) return { error: "the re-capture carries no hash" };
      return {
        direct: mine[0].hashes.direct,
        controlStable: mine[0].controlStable === true,
        verdict: mine[0].verdict,
      };
    };

    const rows = [];
    for (const row of report.rows) {
      const name = rowName(row);
      const ref = reference.get(name);
      const captures = [{ direct: row.hashes?.direct, controlStable: row.controlStable === true }];
      const recaptures = [];
      let status = ladderStatus(ref, captures, RECAPTURE_LIMIT);
      while (status === null) {
        const next = await again(row);
        recaptures.push(next);
        if (!next.error) captures.push(next);
        status = ladderStatus(ref, captures, RECAPTURE_LIMIT - recaptures.length);
        console.log(`probe-run: ${name} not in the reference; re-capture `
          + `${recaptures.length}/${RECAPTURE_LIMIT} -> `
          + `${next.error ? `failed (${next.error})` : next.direct}`
          + `${status ? ` (${status})` : ""}`);
      }
      rows.push({
        mode: row.mode,
        config: row.config,
        beat: row.beat,
        status,
        direct: row.hashes?.direct,
        controlStable: row.controlStable === true,
        reference: ref ? [...ref] : [],
        ...(recaptures.length ? { recaptures } : {}),
      });
    }
    const counts = {};
    for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
    ladder = {
      complete: true,
      against: named,
      recaptureLimit: RECAPTURE_LIMIT,
      counts,
      ...(expected.length ? { expectUnchanged: expectation(expected, rows) } : {}),
      rows,
    };
  }

  const stamped = stamp(ladder);
  write(ladder);

  console.log(`probe-run: ${report.rows.length} row(s) in ${stamped.instrument.elapsedSeconds}s`);
  if (kind === "purity") {
    console.log(`probe-run: verdict ${report.verdict}; noise floor `
      + `${report.noiseFloor?.channels} channels at max delta ${report.noiseFloor?.maxDelta}`
      + (report.noiseFloorBeat === "per row" ? " (the worst of the per-row floors)" : ""));
    const bad = report.rows.filter((r) => r.verdict !== "pure" && r.verdict !== "within-noise");
    for (const r of bad) console.log(`  ${r.verdict}  ${r.mode}/${r.beat}`);
    if (bad.some((r) => r.verdict === "INCONCLUSIVE")) {
      // The control is compared by hash, and an accelerated canvas can move a
      // channel between two draws of one frame. That is the instrument, and
      // the two ways to hold it still are these.
      console.log("probe-run: an INCONCLUSIVE row measured nothing: take it again alone "
        + "(--mode, --beat), or with --exact");
    }
    if (ladder) {
      console.log(`probe-run: against ${ladder.against.map((a) => a.name).join(", ")}: `
        + Object.entries(ladder.counts).map(([k, n]) => `${n} ${k}`).join(", "));
      for (const r of ladder.rows) {
        if (r.status !== "unchanged") console.log(`  ${r.status}  ${rowName(r)}`);
      }
    }
  } else {
    const on = report.surface ?? {};
    console.log(`probe-run: timed on ${on.name ?? PERF_DEFAULT_SURFACE} `
      + `(${on.width}x${on.height} css at dpr ${num(on.dpr, 4)}), `
      + (report.pace === PERF_PACE_RAF ? "one animation frame waited for after each frame"
        : report.pace ? `${report.pace} ms waited after each frame`
          : "the frames back to back"));
    for (const [mode, s] of Object.entries(report.byMode ?? {})) {
      console.log(`  ${mode.padEnd(8)} worst mean ${String(s.worstMeanMs).padStart(8)} ms  `
        + `worst max ${String(s.worstMaxMs).padStart(8)} ms  `
        + `over budget ${s.overBudgetFrames}/${s.totalFrames}`);
    }
    if (report.sweep === "range") {
      for (const r of report.rows) {
        console.log(`  ${perfKey(r).padEnd(34)} ${String(r.frames).padStart(5)} frames  `
          + `mean ${String(r.meanMs).padStart(7)}  p95 ${String(r.p95Ms).padStart(7)}  `
          + `max ${String(r.maxMs).padStart(8)} ms at ${r.worstAt}`
          + (r.coldMs !== undefined ? `  cold ${r.coldMs} ms` : "")
          + (r.intervalModalMs !== undefined
            ? `  intervals usually ${r.intervalModalMs} ms, ${r.longIntervals} long, `
              + `longest ${r.intervalMaxMs} ms` : ""));
      }
    }
    if (differential) {
      const used = differential.against.filter((a) => a.used).map((a) => a.name);
      console.log(`probe-run: against the median of ${used.join(", ") || "nothing usable"}: `
        + Object.entries(differential.counts).map(([k, n]) => `${n} ${k}`).join(", "));
      const same = differential.sameCodeFirstPass;
      console.log(same
        ? `probe-run: the same rule's first pass flags ${same.flagged} of ${same.rows} rows `
          + "between the baseline runs themselves"
        : "probe-run: fewer than three baseline runs, so how often the first pass flags "
          + "an unchanged build is not known");
      if (used.length < 3) {
        console.log("probe-run: a baseline is the median of three runs; this one has "
          + `${used.length}`);
      }
      for (const r of differential.rows) {
        if (r.status !== "within") {
          console.log(`  ${r.status}  ${r.row}  ${r.meanMs} ms against ${r.baselineMedianMs}`);
        }
      }
    }
  }
  console.log(`probe-run: wrote ${path.replace(`${REPO}/`, "")}`);
  if (differential) {
    const held = perfAssertion(differential);
    const asserting = bools.has("assert-no-regression");
    if (held.regressed.length && !asserting) {
      console.log("probe-run: reported, not asserted: --assert-no-regression fails the run "
        + "on a REGRESSED row");
    }
    if (asserting && held.regressed.length) {
      for (const name of held.regressed) console.error(`probe-run: REGRESSED: ${name}`);
      die("rows cost more than their baseline in every sweep; failing report was written");
    }
    if (asserting && (held.unsettled.length || held.compared === 0)) {
      for (const name of held.unsettled) console.error(`probe-run: never compared: ${name}`);
      die("the comparison was not established, which is not a pass; report was written",
        EXIT_NOT_ESTABLISHED);
    }
  }
  if (stamped.presentationAcceptance && !stamped.presentationAcceptance.passed) {
    for (const failure of stamped.presentationAcceptance.failures) {
      console.error(`probe-run: presentation threshold failed: ${failure}`);
    }
    die("presentation performance acceptance failed; failing report was written");
  }
  const held = stamped.ladder?.expectUnchanged;
  if (held?.moved.length) {
    for (const name of held.moved) console.error(`probe-run: expected unchanged, MOVED: ${name}`);
    die("rows expected unchanged have moved; failing report was written");
  }
  if (held?.unmatched.length || held?.uncompared.length) {
    for (const sel of held.unmatched) console.error(`probe-run: --expect-unchanged names no row: ${sel}`);
    for (const name of held.uncompared) {
      console.error(`probe-run: expected unchanged, never compared: ${name}`);
    }
    die("the expectation was not established, which is not a pass; report was written",
      EXIT_NOT_ESTABLISHED);
  }
}

// Run only when invoked, so the pure parts above can be imported and shown
// going red without launching a browser. Compared as real paths: a silent
// no-op behind a symlink would look like a probe that found nothing.
if (process.argv[1]
  && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  await main();
}
