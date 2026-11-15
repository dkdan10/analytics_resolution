#!/usr/bin/env node
/**
 * The piece's own playback, written down.
 *
 * NOT a probe and never a gate. Every probe draws the frames it asks for, onto
 * a surface of its own, with every file made resident before the first one;
 * none of them is the page a visitor has open. This plays the real route - the
 * full work at an address, on the frame loop the page itself runs, fetching
 * each file when the page first asks for it - and logs what happened:
 *
 *   - every animation frame: the timestamp its callback was given, how long
 *     after that timestamp the callback began, and how long it ran. The page's
 *     clock is that timestamp, so every frame is also an instant `t` of the
 *     piece.
 *   - long animation frames, where the browser reports them.
 *   - what the loading chip said on every frame.
 *   - every request for a file under `data/`: when it was asked for and when
 *     its response ended, in the same clock.
 *   - the whole pieces of work the renderer counts (`fieldWork`, `washWork`),
 *     read after every callback from the page's OWN module instances, so a
 *     long interval can be tied to counted work. A page that counts none is
 *     logged as counting none.
 *
 *   npm run playback -- --out <name> --t <seconds> --seconds <n>
 *                       [--mode <hand>] [--over <ms>] [--delay <ms>]
 *                       [--port <n>] [--headed]
 *
 * `--out` is a NAME; the log lands in the gitignored docs/probe/. `--mode` pins
 * a hand as `?mode=` does; without it the rotation chooses. `--delay` holds
 * every `data/` request, and no other, for that long before letting it through,
 * and is refused where it would reach the page's own fetch timeout: the files
 * would then fail, which is another run. `--port` plays another checkout's dev
 * server. The browser is headless unless `--headed` opens a window, and the log
 * says which it was.
 *
 * Two things are read off every frame, because neither says enough alone. The
 * timestamp a callback is given is the display tick its frame began at, and it
 * is the piece's clock, so the interval from one timestamp to the next is what
 * the piece saw pass. But the next tick is handed out on time while a callback
 * is still running: one that runs past the next tick and ends before the one
 * after leaves the interval at a single tick, and shows only as the following
 * callback beginning late. So each callback's start is logged against its own
 * timestamp, and a frame is HELD when its callback ended after the next tick
 * was due, or when the interval to the next timestamp is long.
 *
 * A long interval is owed to the callback that ran over, which is often the
 * frame before the one the interval starts at. Held frames that follow one
 * another are therefore reported together, under the callback that outlasted a
 * tick or, where none did, under the first of them, with the work counted in
 * each. Intervals are whole ticks, so a stall reads up to a tick shorter in
 * timestamps than the callback behind it; the callback's own time, the ticks
 * lost after it and the browser's long animation frame are printed beside it.
 *
 * The tick is read from the run and never assumed: it is the shortest interval
 * the run kept returning to, and the log says what share of the intervals sat
 * at it. `--over` states one figure for both tests; by default an interval is
 * long past one and a half ticks, and a callback is late past one. A run whose
 * commonest interval is not the tick, or whose page was ever not visible, says
 * so in a warning: it did not keep the display's rate, and its intervals are
 * the browser's throttle more than the piece's work.
 *
 * `t` is counted from the first animation frame, which must be the piece's
 * own. The run is refused if more than one function ever asked for animation
 * frames, if the first frame left no loading state behind it, or if the page
 * loaded more than once - a file saved under `src/` while it plays reloads it.
 *
 * Every run is a fresh page, and a fresh page holds no season's points until a
 * frame asks for them: whatever `--t` is, each boundary it crosses is crossed
 * for the first time. A boundary crossed a second time is reached on one page
 * only, by pinning `--mode` and giving `--seconds` more than one loop of the
 * schedule, so the same boundary comes round again under the same hand. Each
 * boundary's line says which of the two it was.
 *
 * The page is sized as the laptop surface the probes use, and the run is
 * refused if the canvas does not come out at the backing that surface gives on
 * this page. It needs a dev server: the module instances are reached by the
 * addresses the served modules were loaded from.
 *
 * A file is called here when its response has ended. Decoding follows in the
 * same turn and is not timed apart, so a margin of a frame or less against a
 * season's boundary is not a margin.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const OUT_DIR = join(REPO, "docs", "probe");

function die(msg) {
  console.error(`playback: ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) die(`not a flag: ${argv[i]}`);
    const k = argv[i].slice(2);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) flags[k] = true;
    else { flags[k] = v; i++; }
  }
  return flags;
}

/** Every flag read here; anything else, or a valued one given bare, is refused
 *  and never dropped. */
const VALUED = ["out", "t", "seconds", "mode", "over", "delay", "port"];
const SWITCHES = ["headed"];
const PLAIN = /^\d+(\.\d+)?$/;

const flags = parseArgs(process.argv.slice(2));
for (const [k, v] of Object.entries(flags)) {
  if (v === true && VALUED.includes(k)) die(`--${k} needs a value`);
  if (v !== true && SWITCHES.includes(k)) die(`--${k} takes no value (got ${v})`);
  if (!VALUED.includes(k) && !SWITCHES.includes(k)) die(`no such flag: --${k}`);
}
for (const k of ["out", "t", "seconds"]) if (flags[k] === undefined) die(`--${k} is required`);
for (const k of ["t", "seconds", "over", "delay", "port"]) {
  if (flags[k] !== undefined && !PLAIN.test(flags[k])) die(`--${k} is a plain number: ${flags[k]}`);
}
if (!/^[A-Za-z0-9._-]+$/.test(flags.out) || flags.out.endsWith(".json")) {
  die(`--out is a name, not a path: ${flags.out}`);
}
if (flags.mode !== undefined && !/^[a-z]+$/.test(flags.mode)) die(`not a hand: ${flags.mode}`);
const startT = Number(flags.t);
const seconds = Number(flags.seconds);
const delayMs = flags.delay === undefined ? 0 : Number(flags.delay);
const overMs = flags.over === undefined ? null : Number(flags.over);
const port = Number(flags.port ?? 5173);
const mode = flags.mode ?? null;
const headless = !flags.headed;
if (!(seconds > 0)) die("--seconds is how long to play, above zero");
if (overMs !== null && !(overMs > 0)) die("--over is an interval in milliseconds, above zero");

const origin = `http://localhost:${port}`;
const url = `${origin}/?experience=full${mode ? `&mode=${mode}` : ""}&t=${flags.t}`;

/** The laptop surface, from the one place it is declared. */
function laptopSurface() {
  const src = readFileSync(join(HERE, "..", "src", "probe", "shared.ts"), "utf8");
  const m = /LAPTOP_SURFACE\s*=\s*\{\s*width:\s*(\d+),\s*height:\s*(\d+),\s*deviceDpr:\s*([\d.]+)\s*\}/
    .exec(src);
  if (!m) die("src/probe/shared.ts no longer declares LAPTOP_SURFACE as a width, a height and a ratio");
  return { width: Number(m[1]), height: Number(m[2]), deviceDpr: Number(m[3]) };
}
const surface = laptopSurface();

async function waitForServer(timeoutMs) {
  const t0 = Date.now();
  for (;;) {
    try { if ((await fetch(`${origin}/`)).ok) return; } catch { /* not up */ }
    if (Date.now() - t0 > timeoutMs) die(`no server at ${origin}`);
    await sleep(250);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** How long the page under test waits on one request before abandoning it,
 *  read from the module it serves. A held request that reached it would be
 *  logged as a failed file, which is a different run from a slow one. */
async function fetchTimeoutMs() {
  let src = "";
  try { src = await (await fetch(`${origin}/src/data.ts`)).text(); } catch { /* reported below */ }
  const m = /FETCH_TIMEOUT_MS\s*=\s*([\d_.e]+)/.exec(src);
  const ms = m ? Number(m[1].replaceAll("_", "")) : NaN;
  if (!(ms > 0)) die(`--delay: cannot read FETCH_TIMEOUT_MS from ${origin}/src/data.ts`);
  return ms;
}

await waitForServer(30_000);
const timeoutMs = delayMs > 0 ? await fetchTimeoutMs() : null;
if (timeoutMs !== null && delayMs >= timeoutMs) {
  die(`--delay ${delayMs} reaches the page's fetch timeout (${timeoutMs} ms): every file would fail`);
}

/** Whether a request is for one of the piece's data files. The module that
 *  fetches them is `/src/data.ts`, which this must not match. */
const isData = (href) => new URL(href).pathname.includes("/data/");

/**
 * Runs in the page before any of its scripts. Self-contained: it is sent as
 * source.
 */
function observe(modulePaths) {
  const rec = {
    ts: [], late: [], ms: [], chip: [], chips: [], workAt: [], counters: [], missing: [],
    askers: [],
    requests: [], loaf: [], loafSupported: false, visibility: [],
    specs: {}, ambiguous: [], mods: {}, stopped: false,
  };
  window.__playback = rec;
  // The addresses the page's modules were loaded from are read back out of
  // this buffer, which by default is shorter than a dev server's module graph.
  performance.setResourceTimingBufferSize(8192);

  const sawVisibility = () => rec.visibility.push([performance.now(), document.visibilityState]);
  sawVisibility();
  document.addEventListener("visibilitychange", sawVisibility);

  if (PerformanceObserver.supportedEntryTypes?.includes("long-animation-frame")) {
    rec.loafSupported = true;
    new PerformanceObserver((list) => {
      if (rec.stopped) return;
      for (const e of list.getEntries()) {
        rec.loaf.push({
          start: e.startTime, ms: e.duration, renderStart: e.renderStart,
          styleAndLayoutStart: e.styleAndLayoutStart, blockingMs: e.blockingDuration,
          scripts: e.scripts.map((s) => ({
            invoker: s.invoker, type: s.invokerType, source: s.sourceURL,
            fn: s.sourceFunctionName, start: s.startTime, ms: s.duration,
          })),
        });
      }
    }).observe({ type: "long-animation-frame", buffered: true });
  }

  const nativeFetch = window.fetch;
  window.fetch = function (input, ...rest) {
    const p = nativeFetch.call(this, input, ...rest);
    if (rec.stopped) return p;
    let href;
    try { href = new URL(typeof input === "string" ? input : input.url ?? String(input), location.href).href; }
    catch { return p; }
    if (!new URL(href).pathname.includes("/data/")) return p;
    const r = { url: href, start: performance.now(), answered: null, status: null, error: null };
    rec.requests.push(r);
    // Watched on the side: the page is handed the promise the browser made.
    p.then(
      (res) => { r.answered = performance.now(); r.status = res.status; },
      (e) => { r.answered = performance.now(); r.error = String(e); },
    );
    return p;
  };

  // The page's own instances of the modules read here. A second import of a
  // module's file under another address would be a second instance with
  // counters of its own, so each is imported by the one address the page
  // loaded it from, and a file loaded under two is left alone and reported.
  const counters = [];
  let last = [];
  const reachModules = async () => {
    const loaded = performance.getEntriesByType("resource").map((e) => e.name);
    for (const [name, path] of Object.entries(modulePaths)) {
      const urls = [...new Set(loaded.filter((u) => new URL(u).pathname === path))];
      if (urls.length > 1) rec.ambiguous.push(path);
      if (urls.length !== 1) continue;
      rec.specs[name] = urls[0];
      try { rec.mods[name] = await import(urls[0]); } catch { /* left unreached */ }
    }
    for (const [name, exported] of [["field", "fieldWork"], ["wash", "washWork"]]) {
      const work = rec.mods[name]?.[exported];
      if (!work) { rec.missing.push(exported); continue; }
      for (const k of Object.keys(work)) {
        counters.push([work, k]);
        rec.counters.push(rec.counters.includes(k) ? `${exported}.${k}` : k);
      }
    }
    last = counters.map(([work, k]) => work[k]);
  };

  let chipEl = null;
  const chipIndex = new Map();
  const record = (ts, began, ms) => {
    if (rec.stopped) return;
    const frame = rec.ts.push(ts) - 1;
    rec.late.push(began - ts);
    rec.ms.push(ms);
    chipEl ??= document.getElementById("asset-state");
    const shown = chipEl ? !chipEl.hidden : null;
    const chip = { state: document.body.dataset.assetState ?? null, shown,
      text: shown ? chipEl.textContent : null };
    const key = JSON.stringify(chip);
    if (!chipIndex.has(key)) chipIndex.set(key, rec.chips.push(chip) - 1);
    rec.chip.push(chipIndex.get(key));
    let delta = null;
    for (let i = 0; i < counters.length; i++) {
      const v = counters[i][0][counters[i][1]];
      if (v !== last[i]) { (delta ??= {})[rec.counters[i]] = v - last[i]; last[i] = v; }
    }
    if (delta) rec.workAt.push([frame, delta]);
  };

  const nativeRaf = window.requestAnimationFrame.bind(window);
  let reached = null;
  // Every function that asks for a frame, by identity. The piece has one; a
  // second would put frames in the log that are not the piece's.
  const askers = new Map();
  window.requestAnimationFrame = (callback) => {
    if (!rec.stopped) {
      if (!askers.has(callback)) {
        askers.set(callback, rec.askers.push({ name: callback.name || "(unnamed)", asked: 0 }) - 1);
      }
      rec.askers[askers.get(callback)].asked++;
    }
    const wrapped = (ts) => {
      const began = performance.now();
      try { callback(ts); } finally { record(ts, began, performance.now() - began); }
    };
    if (reached === true) return nativeRaf(wrapped);
    // The first request for a frame comes once the page's module graph has
    // run, so this is where its instances can first be reached. That request
    // is held until they are: the counters are then read from the first frame
    // on, and the page's clock starts on that frame whenever it comes.
    reached ??= reachModules().then(() => { reached = true; });
    Promise.resolve(reached).then(() => nativeRaf(wrapped));
    return 0;
  };
}

const { chromium } = await import("playwright");
// The same flags the probes and the shots pass: under software rasterisation
// the page is not the one a visitor's machine draws.
const browser = await chromium.launch({
  channel: "chrome",
  headless,
  args: ["--use-gl=angle", "--enable-gpu-rasterization", "--ignore-gpu-blocklist"],
});
const stop = async (msg) => { await browser.close(); die(msg); };
const page = await browser.newPage({
  viewport: { width: surface.width, height: surface.height },
  deviceScaleFactor: surface.deviceDpr,
});
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
// One page, loaded once, is one playback. A reload starts the observer again
// from nothing, with the files of the first load already in the browser.
let loads = 0;
page.on("domcontentloaded", () => { loads++; });

await page.addInitScript(observe, {
  field: "/src/field.ts", wash: "/src/wash.ts", display: "/src/display.ts",
  timeline: "/src/timeline.ts", modes: "/src/modes/index.ts",
});
if (delayMs > 0) {
  // Routed only when asked for: with no delay nothing stands between the page
  // and the server.
  await page.route((u) => isData(u.href), async (route) => {
    await sleep(delayMs);
    await route.continue();
  });
}

console.log(`playback: ${url}`);
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });

// Polled on a timer from here. Playwright's own wait-for-a-function asks the
// page for animation frames, and every one of those would be logged as the
// piece's.
const firstFrameBy = Date.now() + 90_000 + 4 * delayMs;
for (;;) {
  const seen = await page.evaluate(() => ({
    frames: window.__playback?.ts.length ?? 0,
    fault: document.getElementById("fault") !== null,
  }));
  if (seen.fault) await stop(`the page did not start: ${consoleErrors.join(" | ") || "no reason given"}`);
  if (seen.frames > 0) break;
  if (Date.now() > firstFrameBy) await stop("the page drew no frame");
  await sleep(100);
}

// Held against what this page can do before the passage is played out.
const facts = await page.evaluate(({ surface, mode }) => {
  const rec = window.__playback;
  const canvas = document.getElementById("plate");
  const { display, modes } = rec.mods;
  return {
    canvas: [canvas.width, canvas.height],
    css: [canvas.clientWidth, canvas.clientHeight],
    devicePixelRatio: window.devicePixelRatio,
    bounded: typeof display?.boundedDpr === "function"
      ? display.boundedDpr(surface.width, surface.height, surface.deviceDpr) : null,
    pinned: mode === null ? null
      : typeof modes?.isModeId === "function" && typeof modes?.isGalleryMode === "function"
        ? modes.isModeId(mode) && modes.isGalleryMode(mode) : undefined,
    ambiguous: rec.ambiguous,
    askers: rec.askers,
    firstState: rec.chips[rec.chip[0]]?.state ?? null,
  };
}, { surface, mode });
/** Why this page's frames cannot be laid against the piece's clock, if they
 *  cannot. Asked before the passage is played and again after it. */
function unanchored(askers) {
  if (loads !== 1) {
    return `the page loaded ${loads} times: it reloaded itself, or a file under src/ was saved `
      + "while it played. What was logged is not one playback";
  }
  if (askers.length > 1) {
    return `${askers.length} functions asked for animation frames (${askers.map((a) => a.name).join(", ")}): `
      + "t is counted from the first frame, which is only the piece's when the piece alone asks";
  }
  return null;
}
if (unanchored(facts.askers)) await stop(unanchored(facts.askers));
if (facts.firstState === null) {
  await stop("the first animation frame left no loading state on the page, so it was not the "
    + "piece's frame, and every t would be counted from the wrong instant");
}
if (facts.ambiguous.length) {
  await stop(`the page loaded ${facts.ambiguous.join(", ")} under two addresses: a file was `
    + "saved while it was open. Nothing may be edited during a run");
}
if (facts.bounded === null) {
  await stop(`the page on port ${port} serves no /src/display.ts to size the laptop's canvas by: `
    + "this plays a dev server");
}
// Floored as the page floors its own backing store.
const backing = [surface.width, surface.height].map((css) => Math.max(1, Math.floor(css * facts.bounded)));
if (facts.canvas.join("x") !== backing.join("x") || facts.devicePixelRatio !== surface.deviceDpr
  || facts.css.join("x") !== `${surface.width}x${surface.height}`) {
  await stop(`not the laptop's canvas: ${facts.canvas.join("x")} backing a ${facts.css.join("x")} box `
    + `at ratio ${facts.devicePixelRatio}, where the laptop surface is ${backing.join("x")} backing `
    + `${surface.width}x${surface.height} at ${surface.deviceDpr}`);
}
if (facts.pinned === undefined) await stop(`cannot tell whether the page on port ${port} honours --mode`);
if (facts.pinned === false) {
  await stop(`${mode} is not a hand the full route will pin: the page would play its rotation `
    + "under that name");
}

// Left alone while it plays, then asked how far it got.
await sleep(seconds * 1000 + 500);
const playedBy = Date.now() + 30_000;
for (;;) {
  const span = await page.evaluate(() => {
    const { ts } = window.__playback;
    return ts[ts.length - 1] - ts[0];
  });
  if (loads !== 1) await stop(unanchored([]));
  if (span >= seconds * 1000) break;
  if (Date.now() > playedBy) await stop(`the page stopped drawing ${(span / 1000).toFixed(2)} s in`);
  await sleep(250);
}

const taken = await page.evaluate(async ({ startT, mode }) => {
  const rec = window.__playback;
  rec.stopped = true;
  const { timeline, modes } = rec.mods;
  let schedule = null;
  let hand = null;
  if (typeof timeline?.buildSchedule === "function") {
    const file = await (await fetch(new URL("data/seasons.json", location.href))).json();
    const built = timeline.buildSchedule(file.seasons);
    schedule = {
      duration: built.duration,
      segments: built.segments.map(({ year, start, duration }) => ({ year, start, duration })),
    };
    if (typeof modes?.modeAt === "function") hand = modes.modeAt(startT, built, mode);
  }
  const { mods, stopped, ...plain } = rec;
  return {
    ...plain,
    schedule,
    hand,
    reached: Object.keys(mods),
    resources: performance.getEntriesByType("resource")
      .map((e) => ({ url: e.name, start: e.startTime, end: e.responseEnd })),
  };
}, { startT, mode });
const browserVersion = browser.version();
await browser.close();
if (unanchored(taken.askers)) die(unanchored(taken.askers));

// --- what the run says -----------------------------------------------------
const round = (v, places = 2) => (v === null ? null : Number(v.toFixed(places)));
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

const origin0 = taken.ts[0];
/** The page's clock: its offset, plus the time since the first frame. */
const tOf = (ms) => startT + (ms - origin0) / 1000;
// The frames inside what was asked for, and the one after them, which closes
// the last interval.
let lastFrame = taken.ts.findLastIndex((ts) => ts - origin0 <= seconds * 1000);
if (lastFrame === taken.ts.length - 1) lastFrame--;
const intervals = [];
for (let i = 0; i <= lastFrame; i++) intervals.push(taken.ts[i + 1] - taken.ts[i]);

// Intervals in bins a millisecond wide. The modal interval is the fullest
// bin's; the tick is the shortest bin the run kept returning to, since no
// interval is shorter than the display's and a run that mostly missed its
// ticks has its fullest bin at a multiple of one. A bin counts as returned to
// from a twentieth of the intervals.
const bins = new Map();
for (const d of intervals) bins.set(Math.round(d), [...(bins.get(Math.round(d)) ?? []), d]);
const fullest = [...bins.values()].sort((a, b) => b.length - a.length)[0];
const recurring = [...bins.entries()]
  .filter(([, ds]) => ds.length >= Math.max(3, intervals.length / 20))
  .sort((a, b) => a[0] - b[0]);
const atTick = recurring.length ? recurring[0][1] : fullest;
const modalMs = median(fullest);
const tickMs = median(atTick);
const tickShare = atTick.length / intervals.length;
// A long interval, and a callback that ended late: `--over` states both.
const longMs = overMs ?? tickMs * 1.5;
const lateMs = overMs ?? tickMs;

const boundaries = [];
if (taken.schedule) {
  const { duration, segments } = taken.schedule;
  const endT = startT + seconds;
  for (let pass = Math.floor(startT / duration); pass <= Math.floor(endT / duration); pass++) {
    for (const seg of segments) {
      const at = seg.start + pass * duration;
      if (at > startT && at <= endT) boundaries.push({ year: seg.year, t: at });
    }
  }
}

const workByFrame = new Map(taken.workAt);
/** How long after its own timestamp a frame's callback ended. */
const endedAfter = (i) => taken.late[i] + taken.ms[i];
const isHeld = (i) => endedAfter(i) > lateMs || intervals[i] > longMs;
/** Whether the callback alone outlasted a tick, wherever it began. */
const ranOver = (i) => taken.ms[i] > tickMs;
const frameRow = (i) => ({
  frame: i,
  t: round(tOf(taken.ts[i]), 3),
  intervalMs: round(intervals[i]),
  callbackMs: round(taken.ms[i]),
  beganLateMs: round(taken.late[i]),
  endedPastTickMs: round(Math.max(0, endedAfter(i) - tickMs)),
  work: workByFrame.get(i) ?? null,
});
// Held frames, grouped. A group opens at a callback that outlasted a tick, or
// at a held frame with none before it, and takes in the held frames after it
// until one is not held or another callback outlasts a tick.
const held = [];
let open = null;
for (let i = 0; i <= lastFrame; i++) {
  if (!isHeld(i)) { open = null; continue; }
  if (open !== null && !ranOver(i)) { open.then.push(frameRow(i)); continue; }
  const t = tOf(taken.ts[i]);
  const crossed = boundaries.filter((b) => b.t <= t).at(-1);
  open = {
    ...frameRow(i),
    ranOver: ranOver(i),
    ...(crossed ? { afterBoundary: { year: crossed.year, seconds: round(t - crossed.t, 3) } } : {}),
    then: [],
  };
  held.push(open);
}
for (const h of held) {
  const frames = [h, ...h.then];
  const until = taken.ts[frames.at(-1).frame + 1];
  // Ticks the timestamps skipped across the group: none where a callback ran
  // past its tick and the next was still handed out on time.
  h.ticksLost = frames.reduce((n, f) => n + Math.round(intervals[f.frame] / tickMs) - 1, 0);
  const counted = {};
  for (const f of frames) for (const [k, n] of Object.entries(f.work ?? {})) counted[k] = (counted[k] ?? 0) + n;
  h.workInAll = Object.keys(counted).length ? counted : null;
  h.longAnimationFrames = taken.loaf
    .filter((l) => l.start < until && l.start + l.ms > taken.ts[h.frame])
    .map((l) => ({
      t: round(tOf(l.start), 3), ms: round(l.ms), blockingMs: round(l.blockingMs),
      scripts: l.scripts.map((s) => ({ invoker: s.invoker, fn: s.fn, ms: round(s.ms) })),
    }));
}
const heldFrames = new Set(held.flatMap((h) => [h.frame, ...h.then.map((f) => f.frame)]));

// The chip, as the stretches of frames over which it said one thing.
const chipRuns = [];
for (let i = 0; i <= lastFrame; i++) {
  const run = chipRuns.at(-1);
  if (run && run.index === taken.chip[i]) { run.toT = round(tOf(taken.ts[i]), 3); run.frames++; }
  else {
    chipRuns.push({ index: taken.chip[i], ...taken.chips[taken.chip[i]],
      fromT: round(tOf(taken.ts[i]), 3), toT: round(tOf(taken.ts[i]), 3), frames: 1 });
  }
}
for (const run of chipRuns) delete run.index;

// Each request made up to the last frame logged is paired with the browser's
// own record of the same address, in order, for when its response ended.
const ends = taken.resources.filter((r) => isData(r.url));
const fileOf = (href) => new URL(href).pathname.split("/data/").pop();
const requests = taken.requests.filter((r) => r.start <= taken.ts[lastFrame + 1]).map((r) => {
  const at = ends.findIndex((e) => e.url === r.url && e.start >= r.start - 5);
  const end = at < 0 ? null : ends.splice(at, 1)[0].end;
  const inPlay = r.start >= origin0;
  return {
    file: fileOf(r.url),
    // Before the first frame the page's clock has not started.
    askedT: inPlay ? round(tOf(r.start), 3) : null,
    endedT: end !== null && inPlay ? round(tOf(end), 3) : null,
    askedMs: round(r.start - origin0),
    endedMs: end === null ? null : round(end - origin0),
    tookMs: end === null ? null : round(end - r.start),
    status: r.status,
    error: r.error,
  };
});
const firstAsked = {};
for (const r of requests) firstAsked[r.file] ??= { askedT: r.askedT, askedMs: r.askedMs };

const others = taken.resources.filter((r) => !isData(r.url)).map((r) => r.end - r.start);
const dataTook = requests.map((r) => r.tookMs).filter((ms) => ms !== null);

const passOf = (t) => (taken.schedule ? Math.floor(t / taken.schedule.duration) : 0);
const arriving = boundaries.map((b) => {
  const boundaryMs = (b.t - startT) * 1000;
  const mine = requests.filter((r) => r.file === `points/season_${b.year}.bin`);
  const asked = mine[0] ?? null;
  const ended = mine.find((r) => r.endedMs !== null && r.status === 200) ?? null;
  // A request that was answered with something other than the file, or
  // rejected, has ended: it failed, which is not the same as still being out.
  const failed = mine.filter((r) => r.error !== null || (r.status !== null && r.status !== 200))
    .map((r) => r.error ?? `status ${r.status}`);
  return {
    year: b.year,
    boundaryT: round(b.t, 3),
    askedBeforeBoundaryMs: asked ? round(boundaryMs - asked.askedMs) : null,
    endedBeforeBoundaryMs: ended ? round(boundaryMs - ended.endedMs) : null,
    failed,
    hereBeforeBoundary: ended !== null && ended.endedMs < boundaryMs,
    // Whether this page had already asked for the file on an earlier time
    // round the loop. A fresh page never has.
    askedInAnEarlierPass: asked !== null && passOf(startT + asked.askedMs / 1000) < passOf(b.t),
  };
});

const stateAtFirstFrame = taken.visibility.filter(([at]) => at <= origin0).at(-1)?.[1] ?? null;
const visibilityChanges = taken.visibility
  .filter(([at]) => at > origin0 && at <= taken.ts[lastFrame + 1])
  .map(([at, state]) => ({ t: round(tOf(at), 3), state }));

const warnings = [];
if (atTick !== fullest) {
  warnings.push(`the commonest interval (${round(modalMs)} ms) is not the tick (${round(tickMs)} ms, `
    + `${(tickShare * 100).toFixed(1)}% of intervals): this run did not keep the display's rate`);
}
if (stateAtFirstFrame !== "visible" || visibilityChanges.length) {
  warnings.push("the page was not visible throughout: a page that is not is given frames at a "
    + "rate of the browser's choosing, and these intervals are that rate");
}

const log = {
  probe: "playback",
  url,
  hand: taken.hand,
  pinned: mode,
  fromT: startT,
  seconds,
  frames: lastFrame + 1,
  interval: {
    tickMs: round(tickMs), atTick: round(tickShare, 4),
    modalMs: round(modalMs), medianMs: round(median(intervals)),
    maxMs: round(Math.max(...intervals)),
    longOverMs: round(longMs), lateOverMs: round(lateMs),
    overIs: overMs === null ? "an interval over one and a half ticks, a callback ended over one tick "
      + "after its timestamp" : "--over, for both",
  },
  callback: {
    medianMs: round(median(taken.ms.slice(0, lastFrame + 1))),
    medianBeganLateMs: round(median(taken.late.slice(0, lastFrame + 1))),
  },
  visibilityState: stateAtFirstFrame,
  visibilityChanges,
  warnings,
  askers: taken.askers,
  held,
  work: {
    counters: taken.counters,
    missing: taken.missing,
    at: taken.workAt.filter(([frame]) => frame <= lastFrame)
      .map(([frame, delta]) => ({ frame, t: round(tOf(taken.ts[frame]), 3), ...delta })),
  },
  chip: chipRuns,
  requests,
  firstAsked,
  arriving,
  delay: delayMs > 0
    ? { ms: delayMs, fetchTimeoutMs: timeoutMs, on: "requests under data/ only" } : null,
  requestDurations: {
    data: { count: dataTook.length, medianMs: round(median(dataTook)),
      minMs: dataTook.length ? round(Math.min(...dataTook)) : null },
    other: { count: others.length, medianMs: round(median(others)),
      maxMs: others.length ? round(Math.max(...others)) : null },
  },
  longAnimationFrames: taken.loafSupported
    ? taken.loaf.filter((l) => l.start >= origin0 && l.start <= taken.ts[lastFrame + 1])
      .map((l) => ({ t: round(tOf(l.start), 3), ms: round(l.ms), blockingMs: round(l.blockingMs),
        scripts: l.scripts.map((s) => ({ invoker: s.invoker, fn: s.fn, source: s.source, ms: round(s.ms) })) }))
    : "not reported by this browser",
  schedule: taken.schedule ? "from the page's own timeline" : "the page serves no /src/timeline.ts",
  loop: taken.schedule
    ? { seconds: round(taken.schedule.duration, 3), passes: [passOf(startT), passOf(startT + seconds)] }
    : null,
  pageErrors,
  consoleErrors,
  frameLog: {
    is: "each callback's timestamp in milliseconds since the first frame, how long after its "
      + "timestamp it began, and how long it ran",
    at: taken.ts.slice(0, lastFrame + 2).map((ts) => round(ts - origin0, 3)),
    beganLateMs: taken.late.slice(0, lastFrame + 2).map((ms) => round(ms)),
    callbackMs: taken.ms.slice(0, lastFrame + 2).map((ms) => round(ms)),
  },
  instrument: {
    driver: "site/scripts/playback-log.mjs",
    browser: `chrome ${browserVersion}`,
    headless,
    playwright: (await import("playwright/package.json", { with: { type: "json" } })).default.version,
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    viewport: surface,
    canvas: facts.canvas,
    modules: taken.specs,
  },
};

mkdirSync(OUT_DIR, { recursive: true });
const path = join(OUT_DIR, `${flags.out}.json`);
writeFileSync(path, `${JSON.stringify(log, null, 2)}\n`);

const at = (t) => (t === null ? "before the first frame" : `t ${t.toFixed(3)}`);
const workOf = (w) => (w ? Object.entries(w).map(([k, n]) => `${k} ${n}`).join(", ") : "no counted work");
console.log(`playback: chrome ${browserVersion}, ${headless ? "headless" : "headed"}, `
  + `${surface.width}x${surface.height} at ${surface.deviceDpr}, canvas ${facts.canvas.join("x")}`);
console.log(`playback: ${log.hand ?? "the hand is not known"}${mode ? " (pinned)" : ""}, `
  + `${log.frames} frames from t ${startT} for ${seconds} s`);
console.log(`playback: tick ${log.interval.tickMs} ms (${(tickShare * 100).toFixed(1)}% of intervals), `
  + `interval modal ${log.interval.modalMs} ms, median ${log.interval.medianMs} ms, `
  + `longest ${log.interval.maxMs} ms; visibilityState ${stateAtFirstFrame}`
  + `${visibilityChanges.length ? `, changed ${visibilityChanges.length} times` : ""}`);
console.log(`playback: callbacks ran a median ${log.callback.medianMs} ms and began a median `
  + `${log.callback.medianBeganLateMs} ms after their timestamps`);
for (const w of warnings) console.log(`playback: WARNING ${w}`);
console.log(taken.counters.length
  ? `playback: counted work read each frame (${taken.counters.join(", ")})`
    + `${taken.missing.length ? `; this page has no ${taken.missing.join(", ")}` : ""}`
  : `playback: this page counts no work (no ${taken.missing.join(", ")})`);
const counted = (w) => (taken.counters.length ? workOf(w) : "work not counted");
const timing = (f) => `interval ${f.intervalMs} ms  callback ${f.callbackMs} ms, began ${f.beganLateMs} ms `
  + `late${f.endedPastTickMs > 0 ? `, ended ${f.endedPastTickMs} ms past the next tick` : ""}`;
console.log(`playback: ${held.length} held, alone or in a run: a callback ended more than ${log.interval.lateOverMs} ms `
  + `after its timestamp, or an interval ran over ${log.interval.longOverMs} ms`
  + `${overMs === null ? "" : " (--over)"}`);
for (const h of held) {
  console.log(`  ${at(h.t)}  frame ${h.frame}  ${timing(h)}  ${counted(h.work)}`
    + `${h.ranOver ? "" : "  (began late: the callback alone fits a tick)"}`
    + `${h.afterBoundary ? `  (${h.afterBoundary.seconds} s into ${h.afterBoundary.year})` : ""}`);
  for (const f of h.then) console.log(`      then ${at(f.t)}  ${timing(f)}  ${counted(f.work)}`);
  const longest = h.longAnimationFrames.reduce((m, l) => Math.max(m, l.ms), 0);
  console.log(`      ${h.ticksLost} tick${h.ticksLost === 1 ? "" : "s"} lost in the timestamps`
    + `${h.longAnimationFrames.length ? `; long animation frame ${longest} ms` : ""}`);
}
const quiet = log.work.at.filter((w) => !heldFrames.has(w.frame));
if (quiet.length) console.log("playback: counted work in frames whose callbacks ended inside their tick");
for (const counter of taken.counters) {
  const frames = quiet.filter((w) => w[counter] !== undefined);
  if (!frames.length) continue;
  const total = frames.reduce((sum, w) => sum + w[counter], 0);
  console.log(`  ${counter} ${total} in ${frames.length} frame${frames.length === 1 ? "" : "s"}, `
    + `${frames.length > 6 ? `${at(frames[0].t)} to ${frames.at(-1).t.toFixed(3)}`
      : `t ${frames.map((w) => w.t.toFixed(3)).join(", ")}`}`);
}
console.log("playback: the loading chip");
for (const run of chipRuns) {
  console.log(`  ${at(run.fromT)} to ${run.toT.toFixed(3)}  ${run.state}`
    + `${run.shown ? `, showing "${run.text}"` : run.shown === null ? ", no chip on this page" : ""}`);
}
const early = requests.filter((r) => r.askedT === null);
console.log(`playback: ${requests.length} data requests, ${early.length} of them before the first frame`
  + `${delayMs > 0 ? `, each held ${delayMs} ms` : ""}`);
for (const r of requests.filter((q) => q.askedT !== null)) {
  console.log(`  ${r.file}  asked ${at(r.askedT)}  `
    + `${r.endedMs === null ? "not ended" : `ended t ${tOf(origin0 + r.endedMs).toFixed(3)} (${r.tookMs} ms)`}`
    + `${r.error ? `  ${r.error}` : r.status !== 200 && r.status !== null ? `  status ${r.status}` : ""}`);
}
console.log(`playback: request durations - data median ${log.requestDurations.data.medianMs} ms, `
  + `shortest ${log.requestDurations.data.minMs} ms; everything else median `
  + `${log.requestDurations.other.medianMs} ms, longest ${log.requestDurations.other.maxMs} ms`);
if (!taken.schedule) console.log("playback: season boundaries are not known on this page");
else {
  console.log(`playback: one loop is ${log.loop.seconds} s, and this page `
    + `${log.loop.passes[0] === log.loop.passes[1] ? "stayed inside one: nothing it crossed was crossed before"
      : `played from pass ${log.loop.passes[0]} into pass ${log.loop.passes[1]}`}`);
}
const against = (ms) => `${Math.abs(ms)} ms ${ms >= 0 ? "before" : "after"}`;
const outcome = (a) => (a.endedBeforeBoundaryMs !== null ? `ended ${against(a.endedBeforeBoundaryMs)}`
  : a.failed.length ? `failed (${[...new Set(a.failed)].join(", ")}${a.failed.length > 1 ? `, ${a.failed.length} requests` : ""})`
    : "did not end");
for (const a of arriving) {
  console.log(`playback: ${a.year} arrives at t ${a.boundaryT.toFixed(3)}: its points were `
    + `${a.askedBeforeBoundaryMs === null ? "never asked for"
      : `asked for ${against(a.askedBeforeBoundaryMs)}`
        + `${a.askedInAnEarlierPass ? ", in an earlier pass of this page," : ""} and ${outcome(a)}`}`
    + ` - ${a.hereBeforeBoundary ? "here" : "NOT here"} before the boundary`
    + `${a.askedInAnEarlierPass ? "" : " (a first crossing)"}`);
}
console.log(`playback: ${path.replace(`${REPO}/`, "")}`);
if (pageErrors.length) {
  console.error(`playback: uncaught page errors: ${pageErrors.join(" | ")}`);
  process.exit(1);
}
