#!/usr/bin/env node
/**
 * Exact frames, for looking at.
 *
 * NOT a probe and never a gate: the probes compare pixels and this makes
 * pictures for a person. It exists because a screenshot grabbed off the running
 * clock is not a comparison at all — session 4 mis-diagnosed a paint balance
 * that way — and because "capture the same instant in two builds" has been done
 * by hand in every visual session so far.
 *
 * It drives `renderTo` directly at an exact `t` onto a fixed offscreen surface,
 * the same way the purity probe does, so two runs of the same list are
 * comparable frame for frame.
 *
 *   node scripts/shots.mjs --out docs/shots/5b-census \
 *        --shots "census@32,census@152,census@376"
 *   node scripts/shots.mjs --list prelude          # a named set
 *
 * `--width/--height/--dpr` fix the surface. Defaults are a laptop panel, which
 * is the only surface this piece is judged on (CLAUDE.md, "Where the piece is
 * judged").
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");

/** Named sets, so a session's evidence is a word rather than a paste. */
const LISTS = {
  prelude: ["plate@0", "plate@4", "plate@8", "plate@12", "plate@18", "plate@23"],
  cut: ["plate@176.5", "plate@177.4", "plate@177.8", "plate@178", "plate@178.3", "plate@179"],
  wrap: ["plate@499.98", "plate@0"],
  hands: ["plate@32", "field@32", "ledger@32", "census@32", "measure@32", "hand@32"],
};

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const k = argv[i].slice(2);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) flags[k] = true;
    else { flags[k] = v; i++; }
  }
  return flags;
}

async function waitForServer(url, timeoutMs) {
  const t0 = Date.now();
  for (;;) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up */ }
    if (Date.now() - t0 > timeoutMs) throw new Error(`no server at ${url}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

const flags = parseArgs(process.argv.slice(2));
const shots = (flags.shots ? String(flags.shots).split(",") : LISTS[flags.list] ?? LISTS.hands)
  .map((s) => s.trim()).filter(Boolean);
const outDir = resolve(REPO, String(flags.out ?? "docs/shots"));
const width = Number(flags.width ?? 1512);
const height = Number(flags.height ?? 852);
const dpr = Number(flags.dpr ?? 2);
const port = Number(flags.port ?? 5173);
const talk = Boolean(flags.talk);

const { chromium } = await import("playwright");
await waitForServer(`http://localhost:${port}/`, 30_000);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

// `?probe=shots` is not a probe the runner knows; main.ts returns on any probe
// value after loading, which is exactly what is wanted — the piece loaded, the
// rAF loop never started, and nothing is animating while frames are taken.
await page.goto(`http://localhost:${port}/?probe=shots`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__probeDone !== undefined, null, { timeout: 120_000 });

mkdirSync(outDir, { recursive: true });
for (const spec of shots) {
  // `hand@t` as before, and `stack:lci@t` for THE STACK — the operations after
  // the colon are the same token `?ops=` takes, so a filename says exactly what
  // configuration produced the picture.
  const [where, t] = spec.split("@");
  const [mode, ops = ""] = where.split(":");
  const dataUrl = await page.evaluate(async ({ mode, t, width, height, dpr, talk, ops }) => {
    const png = await window.__shot({ mode, t: Number(t), width, height, dpr, talk, ops });
    return png;
  }, { mode, t, width, height, dpr, talk, ops });
  const name = `${mode}${ops ? `-${ops}` : ""}-${String(t).replace(".", "_")}.png`;
  writeFileSync(join(outDir, name), Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log(`shots: ${join(outDir, name).replace(`${REPO}/`, "")}`);
}
await browser.close();
if (errors.length) {
  console.error(`shots: uncaught page errors: ${errors.join(" | ")}`);
  process.exit(1);
}
