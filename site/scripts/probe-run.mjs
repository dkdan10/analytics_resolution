#!/usr/bin/env node
/**
 * Drive the renderer's two probes headlessly, and record what they said.
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
 */

import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, "..");
const REPO = resolve(SITE, "..");
/** Not data/processed/ (any unknown file there fails qa.py). This directory is
 *  gitignored: a verdict is machine output, regenerated by re-running the probe. */
const OUT_DIR = join(REPO, "docs", "probe");

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
  "against", "expect-unchanged"];
const SWITCHES = ["exact", "headed", "assert-presentation"];
/** The valued flags that travel to the page as its query. */
const FORWARDED = ["mode", "beat", "t", "stop", "display", "frames", "playback", "ops",
  "range", "samples", "view"];

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
  }
  if (kind === "perf") {
    // The perf probe times beats, instants and stops. It reads neither of
    // these, and forwarding them would be a default run under their name.
    for (const k of ["range", "samples"]) {
      if (flags[k] !== undefined) out.push(`--${k} is a purity flag; the perf probe reads no ranges`);
    }
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
 * instant on every row, and the View arrangement.
 */
export function sweepProblems(report, flags) {
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
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });

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
  if (kind !== "purity" && kind !== "perf") {
    die("usage: probe-run.mjs <purity|perf> [--mode ids] [--beat ids] [--t s[,s]] "
      + "[--range ids] [--samples n] [--view fresh] "
      + "[--stop semantic-id] [--display near|room] [--frames n] [--exact] "
      + "[--against names] [--expect-unchanged hand|hand/beat,...] "
      + "[--assert-presentation] [--timeout s] [--headed] [--channel name] [--port n]");
  }
  const { flags, bools } = parseArgs(rest);
  const refused = flagProblems(kind, { flags, bools });
  if (refused.length) {
    refused.forEach((p) => console.error(`probe-run: ${p}`));
    die("nothing launched");
  }

  // The ladder's inputs are read before anything is launched: a misspelt
  // verdict name should cost a second, not a sweep.
  const against = [];
  if (flags.against !== undefined) {
    if (kind !== "purity") die("--against compares purity hashes; perf has none");
    const names = flags.against.split(",").map((x) => x.trim()).filter(Boolean);
    if (!names.length) die("--against needs the name of at least one verdict in docs/probe/");
    for (const name of names) {
      const file = join(OUT_DIR, `${name.replace(/\.json$/, "")}.json`);
      if (!existsSync(file)) die(`--against ${name}: no such verdict (${file})`);
      const verdict = JSON.parse(readFileSync(file, "utf8"));
      if (verdict.probe !== "purity") die(`--against ${name}: not a purity verdict`);
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
  if (problems.length) {
    problems.forEach((p) => console.error(`probe-run: ${p}`));
    die("the run is not believable; nothing written");
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
    // The probe draws onto its OWN fixed offscreen surface, so the page's
    // viewport does not set what was measured. Recorded anyway: it is what
    // the browser had to composite while the run was going on.
    pageViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  };
  const stamp = (ladder) => ({
    ...report,
    ...(ladder ? { ladder } : {}),
    ...(kind === "perf" && bools.has("assert-presentation") ? (() => {
      const limits = {
        p95MsBelow: 16.67,
        maxMsBelow: 33.3,
        noFrameAboveMs: 50,
      };
      const failures = report.rows.flatMap((row) => {
        const reasons = [];
        if (!(row.p95Ms < limits.p95MsBelow)) reasons.push(`p95 ${row.p95Ms}ms`);
        if (!(row.maxMs < limits.maxMsBelow)) reasons.push(`max ${row.maxMs}ms`);
        if (row.maxMs > limits.noFrameAboveMs) reasons.push(`frame above ${limits.noFrameAboveMs}ms`);
        return reasons.length
          ? [`${row.mode}/${row.beat}: ${reasons.join(", ")}`]
          : [];
      });
      return {
        presentationAcceptance: {
          limits,
          passed: failures.length === 0,
          failures,
        },
      };
    })() : {}),
    instrument,
  });

  mkdirSync(OUT_DIR, { recursive: true });
  // `--out` names the file, so a "before" measurement is not overwritten by the
  // "after" that is supposed to be compared with it. Unnamed narrowed runs are
  // marked partial rather than posing as a full sweep.
  const suffix = flags.mode || flags.beat || flags.t || flags.stop || flags.display || flags.ops
    || flags.range || flags.samples || flags.view
    ? "-partial" : "";
  const path = join(OUT_DIR, flags.out ? `${flags.out}.json` : `${kind}${suffix}.json`);
  const write = (ladder) => writeFileSync(path, `${JSON.stringify(stamp(ladder), null, 2)}\n`);

  // --- the ladder -----------------------------------------------------------
  let ladder = null;
  if (against.length) {
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
    for (const [mode, s] of Object.entries(report.byMode ?? {})) {
      console.log(`  ${mode.padEnd(8)} worst mean ${String(s.worstMeanMs).padStart(8)} ms  `
        + `worst max ${String(s.worstMaxMs).padStart(8)} ms  `
        + `over budget ${s.overBudgetFrames}/${s.totalFrames}`);
    }
  }
  console.log(`probe-run: wrote ${path.replace(`${REPO}/`, "")}`);
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
