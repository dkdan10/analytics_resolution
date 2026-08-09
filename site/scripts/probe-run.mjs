#!/usr/bin/env node
/**
 * Drive the renderer's two probes headlessly, and commit what they said.
 *
 * Session 2 built the probes and session 3 could not claim a completed sweep;
 * two sessions passed with no calibrated purity result for five of the six
 * hands, because running one meant a person sitting in front of a browser tab
 * for minutes and then copying a JSON blob out of a `<pre>`. Nothing repeatable
 * ever drove them. This does.
 *
 *   npm run probe:purity  -- [--mode hand] [--beat window-many] [--exact]
 *   npm run probe:perf    -- [--mode hand,plate] [--t 292] [--frames 20]
 *
 * DELIBERATELY NOT WIRED INTO `npm run build`. A full purity sweep is minutes,
 * and performance numbers are a property of the machine that took them, so a
 * build that ran either would be slow and non-deterministic. It is a thing a
 * session runs, on purpose, before it changes a renderer - and the verdict it
 * writes is the evidence the next session reads.
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
 * WHAT IT RECORDS, because a measurement without its instrument is not one:
 * the browser and channel, whether it was headless, the viewport and DPR, the
 * URL, the elapsed time, and - for purity - the noise floor that run measured
 * for itself.
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, "..");
const REPO = resolve(SITE, "..");
/** Not data/processed/ (any unknown file there fails qa.py) and not docs/audits
 *  or docs/prompts (both gitignored). A tracked directory of its own. */
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

function die(msg) {
  console.error(`probe-run: ${msg}`);
  process.exit(1);
}

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

async function main() {
  const [kind, ...rest] = process.argv.slice(2);
  if (kind !== "purity" && kind !== "perf") {
    die("usage: probe-run.mjs <purity|perf> [--mode ids] [--beat ids] [--t s] "
      + "[--frames n] [--exact] [--timeout s] [--headed] [--channel name] [--port n]");
  }
  const { flags, bools } = parseArgs(rest);

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
  for (const k of ["mode", "beat", "t", "frames", "playback", "ops"]) {
    if (flags[k] !== undefined) q.set(k, flags[k]);
  }
  if (bools.has("exact")) q.set("exact", "1");
  const url = `http://localhost:${port}/?${q}`;

  const { chromium } = await import("playwright");
  await waitForServer(`http://localhost:${port}/`, 30_000);

  const browser = await chromium.launch({
    channel,
    headless,
    // The gallery does not run on a software rasteriser and neither should the
    // instrument that says whether the gallery fits in its frame budget.
    args: ["--use-gl=angle", "--enable-gpu-rasterization", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });

  const consoleLines = [];
  page.on("console", (m) => {
    const text = m.text();
    consoleLines.push(text);
    if (process.env.PROBE_VERBOSE) console.log(`  [page] ${text}`);
  });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  console.log(`probe-run: ${kind} -> ${url}`);
  console.log(`probe-run: ${channel}, headless=${headless}, timeout=${timeoutMs / 1000}s`);
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });

  // The probe's own completion flag, not a DOM node that never appears when it
  // throws. `false` means it failed and said so; the error node carries why.
  await page.waitForFunction(() => window.__probeDone !== undefined, null,
    { timeout: timeoutMs, polling: 500 });
  const elapsedMs = Date.now() - t0;
  const ok = await page.evaluate(() => window.__probeDone);

  if (!ok) {
    const err = await page.evaluate(() => {
      const p = document.querySelector("#probe-error");
      return p ? p.textContent : "(no #probe-error node)";
    });
    await browser.close();
    console.error(err);
    die(`the ${kind} probe failed`);
  }

  // Hyphenated, because `shared.ts:emit` keys the global by the same string it
  // gives the DOM node. `window.probePurity` does not exist and reads undefined.
  const report = await page.evaluate((k) => window[`probe-${k}`], kind);
  await browser.close();

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
  if (problems.length) {
    problems.forEach((p) => console.error(`probe-run: ${p}`));
    die("the run is not believable; nothing written");
  }

  const stamped = {
    ...report,
    instrument: {
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
    },
  };

  mkdirSync(OUT_DIR, { recursive: true });
  // `--out` names the file, so a "before" measurement is not overwritten by the
  // "after" that is supposed to be compared with it. Unnamed narrowed runs are
  // marked partial rather than posing as a full sweep.
  const suffix = flags.mode || flags.beat || flags.t || flags.ops ? "-partial" : "";
  const path = join(OUT_DIR, flags.out ? `${flags.out}.json` : `${kind}${suffix}.json`);
  writeFileSync(path, `${JSON.stringify(stamped, null, 2)}\n`);

  console.log(`probe-run: ${report.rows.length} row(s) in ${stamped.instrument.elapsedSeconds}s`);
  if (kind === "purity") {
    console.log(`probe-run: verdict ${report.verdict}; noise floor `
      + `${report.noiseFloor?.channels} channels at max delta ${report.noiseFloor?.maxDelta}`);
    const bad = report.rows.filter((r) => r.verdict !== "pure" && r.verdict !== "within-noise");
    for (const r of bad) console.log(`  ${r.verdict}  ${r.mode}/${r.beat}`);
  } else {
    for (const [mode, s] of Object.entries(report.byMode ?? {})) {
      console.log(`  ${mode.padEnd(8)} worst mean ${String(s.worstMeanMs).padStart(8)} ms  `
        + `worst max ${String(s.worstMaxMs).padStart(8)} ms  `
        + `over budget ${s.overBudgetFrames}/${s.totalFrames}`);
    }
  }
  console.log(`probe-run: wrote ${path.replace(`${REPO}/`, "")}`);
}

await main();
