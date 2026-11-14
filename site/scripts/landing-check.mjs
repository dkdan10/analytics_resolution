#!/usr/bin/env node
/**
 * The player, checked in a browser: what it draws with, where its controls
 * sit, and what a pick and a seek cost.
 *
 * NOT a probe and never a gate: it is not in `npm test` or the build. The
 * smoke run loads every address and refuses one that fails to start; this
 * holds the player at `?experience=player` to what it promises, and makes the
 * pictures and the timings a person needs to judge it.
 *
 *   npm run check:landing [-- --width <css px> --height <css px> --device-dpr <ratio>]
 *                         [--port <n>] [--film] [--pairs] [--sweep] [--delay <ms>]
 *                         [--headed]
 *
 * It needs `npm run dev`: it reads the page's own modules by the addresses the
 * page loaded them from (the rotation, the rail's clock format and stops, the
 * address arithmetic, the backing budget, the ground, the timeline, the data,
 * the renderer's prelude share, the score's stops and the probes' noise rule),
 * and refuses a server that does not serve them. The size is the laptop
 * surface the probes use unless the flags give another; a size that is one of
 * the phones below is opened as that phone, touch and all. The browser is the
 * installed Chrome with the flags the probes pass, headless unless `--headed`.
 * Everything it writes lands under the gitignored docs/shots/landing/.
 *
 * ASSERTED, each by a function that returns its problems:
 *
 *    1  the canvas is the viewport, backed as the full work backs it, and the
 *       body keeps the exhibit class;
 *    2  opened paused at an instant of each pass, the name checked is that
 *       pass's rendering, by the page's own `modeAt`;
 *    3  a frame lifted into a hand's own pass is the frame the first pass draws
 *       at the same point of the loop, drawn on fresh surfaces and judged by
 *       the probes' noise rule against a floor measured by drawing one request
 *       twice;
 *    4  every stop a step can land on, lifted into every pass, lands on or
 *       after that stop;
 *    5  the tab order is the checked name, the three transport buttons, the
 *       scrub, the overview's door, the full work's door and the credit's link;
 *    6  the credit is shown with its link, and meets neither door nor the panel,
 *       at the run's size, a smaller laptop's and each phone's;
 *    7  every text inside the panel that carries a digit is the clock or a
 *       season the record names;
 *    8  the panel's ground is the plate's, at the stylesheet's alpha, and no
 *       rule of the player types the ground;
 *    9  the opening frame is not darker than the frame after it;
 *   10  a name pressed on the first frame shown checks that name and brings the
 *       clock to the first season within the press's time;
 *   11  the full work, and a direct address, show none of the player's chrome
 *       and hide the cursor;
 *   12  every control on the panel, both doors and the loading chip lie inside
 *       the window, and the panel, the doors and the chip meet none of each
 *       other nor the credit, at the same sizes as six. The chip shows only
 *       while a file is pending or has failed, so it is put up for the
 *       measurement and taken down again before anything paints.
 *
 * The assertions read a few looks, each taken from pages opened fresh: a
 * player page at each layout size (one, six, seven, eight and twelve), the paused
 * openings (two and seven), the probe page (three, four and nine), and pages
 * of their own for five, ten and eleven. A check that has only ever seen a
 * healthy player cannot be told from one that passes whatever it is shown, so
 * every run also spoils one look per seed (SEEDS), takes that look again, and
 * judges every assertion over the facts with it replaced: each seed must turn
 * its own assertion red and no other.
 *
 * REPORTED, never judged:
 *
 *   - every run: four timed seeks at the run's size, from the control to the
 *     first animation frame asked for after the piece's own, with the worst
 *     frame in the second after and what the loading chip said;
 *   - `--film`: page captures a set time after the first frame shown, for the
 *     overview (at its own address; the bare one serves the player) and the
 *     player's three openings, filed by opening and size;
 *   - `--pairs`: one capture with reduced motion asked for and one without, at
 *     every layout size, named alike in both arms so `sheet.mjs` flips them;
 *   - `--sweep`: how much ink lies under the panel and each door, frame by
 *     frame through the window and at every season's middle, for every hand,
 *     at four sizes and both display profiles;
 *   - `--delay`: every data request held that long, a name pressed on the
 *     first frame shown, and what the chip said on every frame after.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const OUT = join(REPO, "docs", "shots", "landing");

function die(msg) {
  console.error(`landing: ${msg}`);
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
const VALUED = ["width", "height", "device-dpr", "port", "delay"];
const SWITCHES = ["film", "pairs", "sweep", "headed"];
const PLAIN = /^\d+(\.\d+)?$/;

const flags = parseArgs(process.argv.slice(2));
for (const [k, v] of Object.entries(flags)) {
  if (v === true && VALUED.includes(k)) die(`--${k} needs a value`);
  if (v !== true && SWITCHES.includes(k)) die(`--${k} takes no value (got ${v})`);
  if (!VALUED.includes(k) && !SWITCHES.includes(k)) die(`no such flag: --${k}`);
}
for (const k of VALUED) {
  if (flags[k] !== undefined && !PLAIN.test(flags[k])) die(`--${k} is a plain number: ${flags[k]}`);
}

/** The laptop surface, from the one place it is declared, by the expression
 *  `playback-log.mjs` reads it with. */
function laptopSurface() {
  const src = readFileSync(join(HERE, "..", "src", "probe", "shared.ts"), "utf8");
  const m = /LAPTOP_SURFACE\s*=\s*\{\s*width:\s*(\d+),\s*height:\s*(\d+),\s*deviceDpr:\s*([\d.]+)\s*\}/
    .exec(src);
  if (!m) die("src/probe/shared.ts no longer declares LAPTOP_SURFACE as a width, a height and a ratio");
  return { width: Number(m[1]), height: Number(m[2]), deviceDpr: Number(m[3]) };
}

const LAPTOP = laptopSurface();
/** A phone held upright, as the smoke run opens one, with a finger for a
 *  pointer: the player's coarse-pointer rules are part of what it shows there. */
const PHONE = { width: 390, height: 844, deviceDpr: 3, touch: true };
/** The phones the panel docks on: three held upright and two on their side.
 *  Each has a finger for a pointer, which is what docks a short window. */
const PHONES = [
  PHONE,
  { width: 375, height: 667, deviceDpr: 2, touch: true },
  { width: 320, height: 568, deviceDpr: 2, touch: true },
  { width: 844, height: 390, deviceDpr: 3, touch: true },
  { width: 667, height: 375, deviceDpr: 2, touch: true },
];
/** A smaller laptop window, where the court runs closest to the panel. */
const SMALL_LAPTOP = { width: 1200, height: 800, deviceDpr: LAPTOP.deviceDpr };
/** The other laptop windows the ink under the chrome is swept at. */
const SWEEP_EXTRA = [
  { width: 1280, height: 800, deviceDpr: LAPTOP.deviceDpr },
  { width: 1280, height: 720, deviceDpr: LAPTOP.deviceDpr },
  SMALL_LAPTOP,
];

const asked = {
  width: Number(flags.width ?? LAPTOP.width),
  height: Number(flags.height ?? LAPTOP.height),
  deviceDpr: Number(flags["device-dpr"] ?? LAPTOP.deviceDpr),
};
if (!(asked.width > 0) || !(asked.height > 0) || !(asked.deviceDpr > 0)) die("the size is not a size");
const sameSize = (a, b) => a.width === b.width && a.height === b.height && a.deviceDpr === b.deviceDpr;
/** The run's own size: the laptop's unless the flags give another. */
const SIZE = PHONES.find((p) => sameSize(asked, p)) ?? asked;
const labelOf = (s) => `${s.width}x${s.height}`;
const sizeLine = (s) => `${s.width}x${s.height} at ${s.deviceDpr}${s.touch ? ", touch" : ""}`;
const distinct = (sizes) => sizes.filter((s, i) => sizes.findIndex((o) => labelOf(o) === labelOf(s)) === i);
/** Where the chrome is held inside the window and clear of itself, and where
 *  the reduced-motion pair is shot. */
const LAYOUT_SIZES = distinct([SIZE, SMALL_LAPTOP, ...PHONES]);

const port = Number(flags.port ?? 5173);
const origin = `http://localhost:${port}`;
const headless = !flags.headed;
const delayMs = flags.delay === undefined ? 0 : Number(flags.delay);

/** How long a page may take to show its first frame, counted from the
 *  request, before the run gives up on it. */
const STARTUP_MS = 60_000;
/** How long a page is left drawing after its first frame shown before it is
 *  looked at, so the panel, the doors and the credit have all been written. */
const SETTLE_MS = 1_000;
/** How long a page has to say its files are ready before a seek is timed. */
const READY_MS = 15_000;
/** How often the page is looked at from here. Polled on a timer rather than
 *  with Playwright's own wait, which asks the page for animation frames. */
const POLL_MS = 50;
/** Assertion ten: how long a press on the first frame has to land. */
const FIRST_PRESS_MS = 1_000;
/** Assertion nine: how far after the opening the frame it is held against is. */
const PLATEAU_LATER_S = 2;
/** The comparison seed: how far after the bare instant the spoiled frame is. */
const SEED_LATER_S = 1;
/** The timed seeks: how far into a season or a stop each one starts. */
const INTO_S = 1;
/** The timed seeks: how long the frames after the control are watched. */
const WATCH_MS = 1_000;
/** `--film`: the seconds after the first frame shown at which it captures. */
const FILM_MARKS_S = [0, 5, 10, 20, 30];
/** `--delay`: how long the chip is read, frame by frame, after the first
 *  frame shown. */
const CHIP_WATCH_MS = 10_000;
/** `--pairs`: when the reduced-motion pair is captured, after the first frame
 *  shown. */
const MOTION_PAIR_AFTER_S = 5;

/** The modules read from the page, by the addresses it serves them at. */
const MODULES = {
  modes: "/src/modes/index.ts",
  navigator: "/src/navigator.ts",
  route: "/src/route.ts",
  display: "/src/display.ts",
  palette: "/src/palette.ts",
  timeline: "/src/timeline.ts",
  data: "/src/data.ts",
  render: "/src/render.ts",
  semantic: "/src/semantic.ts",
  shared: "/src/probe/shared.ts",
};
/** The modules one look reads. A player page is never handed a module its
 *  own route does not load, the probes' among them. */
const modulesOf = (...names) => Object.fromEntries(names.map((n) => [n, MODULES[n]]));

/** The tab stops, in the order the player promises them. */
const TAB_ORDER = [
  "the checked name", "#player-prev", "#player-play", "#player-next", "#player-scrub",
  "#overview-entry", "#full-entry", "the credit's link",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(timeoutMs) {
  const t0 = Date.now();
  for (;;) {
    try { if ((await fetch(`${origin}/`)).ok) return; } catch { /* not up */ }
    if (Date.now() - t0 > timeoutMs) die(`no server at ${origin}`);
    await sleep(250);
  }
}

/** A server that does not serve the page's modules as modules is not the dev
 *  server this reads them from. */
async function refuseUnservedModules() {
  const missing = [];
  for (const path of Object.values(MODULES)) {
    let type = "";
    try {
      const res = await fetch(`${origin}${path}`);
      type = res.ok ? res.headers.get("content-type") ?? "" : `status ${res.status}`;
    } catch (e) { type = String(e); }
    if (!/javascript/.test(type)) missing.push(`${path} (${type || "no type"})`);
  }
  if (missing.length) {
    die(`the server at ${origin} does not serve the page's modules: ${missing.join(", ")}. `
      + "This reads them from `npm run dev`");
  }
}

/** How long the page waits on one request before abandoning it, read from the
 *  module it serves. A held request that reached it would fail, which is
 *  another run from a slow one. */
async function fetchTimeoutMs() {
  let src = "";
  try { src = await (await fetch(`${origin}/src/data.ts`)).text(); } catch { /* reported below */ }
  const m = /FETCH_TIMEOUT_MS\s*=\s*([\d_.e]+)/.exec(src);
  const ms = m ? Number(m[1].replaceAll("_", "")) : NaN;
  if (!(ms > 0)) die(`--delay: cannot read FETCH_TIMEOUT_MS from ${origin}/src/data.ts`);
  return ms;
}

/** The season strings the record names, read from the artifact itself. */
function seasonStrings() {
  const file = JSON.parse(readFileSync(join(REPO, "data", "processed", "seasons.json"), "utf8"));
  return new Set(file.seasons.map((s) => String(s.season).toUpperCase()));
}

// --- in the page -----------------------------------------------------------

/**
 * Runs in every page before its own scripts. Self-contained: it is sent as
 * source. It stamps the first frame shown (the startup card hidden), keeps the
 * whole module list in the resource buffer so each module can be reached by
 * the address the page loaded it from, and, when asked, reads the loading
 * chip after every frame the piece draws.
 */
function install(chipWatchMs) {
  try { performance.setResourceTimingBufferSize(8192); } catch { /* the default buffer */ }
  const chipText = () => {
    const chip = document.getElementById("asset-state");
    return chip && !chip.hidden ? chip.textContent : null;
  };
  const stamp = () => {
    const startup = document.getElementById("startup");
    if (!startup) return;
    const seen = () => {
      if (!startup.hidden || window.__firstShown !== undefined) return;
      const first = performance.now();
      window.__firstShown = first;
      if (!(chipWatchMs > 0)) return;
      // Asked for from inside the frame that hid the card, after the piece
      // asked for its next one, so each read follows the piece's own frame.
      const log = (window.__chipLog = []);
      const read = () => {
        const now = performance.now();
        log.push([now - first, chipText()]);
        if (now - first < chipWatchMs) requestAnimationFrame(read);
      };
      requestAnimationFrame(read);
    };
    new MutationObserver(seen).observe(startup, { attributes: true, attributeFilter: ["hidden"] });
    seen();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", stamp);
  else stamp();
  window.addEventListener("pointerdown", () => { window.__pressedAt ??= performance.now(); }, true);

  /** The page's own instance of each module: the one address it loaded the
   *  file from, or the plain address for one it never loaded. */
  window.__landingReach = async (paths) => {
    const loaded = performance.getEntriesByType("resource").map((e) => e.name);
    const mods = {};
    for (const [name, path] of Object.entries(paths)) {
      const urls = [...new Set(loaded.filter((u) => new URL(u).pathname === path))];
      if (urls.length > 1) throw new Error(`${path} was loaded under ${urls.length} addresses`);
      mods[name] = await import(urls[0] ?? new URL(path, location.origin).href);
    }
    return mods;
  };
  /** The schedule, built as the page builds it, from the file it reads. */
  window.__landingSchedule = async (timeline) => {
    const file = await (await fetch(new URL("data/seasons.json", location.href))).json();
    return timeline.buildSchedule(file.seasons);
  };
}

/** Sent to the page as source: whether it has shown a frame or put up the
 *  fault screen. */
function startState() {
  return {
    shown: window.__firstShown !== undefined,
    fault: document.getElementById("fault")?.innerText.replace(/\s+/g, " ").trim() ?? null,
    ready: document.body.dataset.assetState === "ready",
  };
}

/** Sent to the page as source: everything assertions one, six, seven, eight
 *  and twelve read from one player page. */
async function lookAtPlayer(paths) {
  const m = await window.__landingReach(paths);
  const schedule = await window.__landingSchedule(m.timeline);
  const shown = (el) => {
    if (!el || el.hidden) return false;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  };
  const part = (id) => {
    const el = document.getElementById(id);
    return { shown: shown(el), box: el ? box(el) : null };
  };
  const canvas = document.getElementById("plate");
  const width = window.innerWidth;
  const height = window.innerHeight;
  const ratio = window.devicePixelRatio;
  const credit = document.getElementById("credit");
  const link = credit?.querySelector("a[href]") ?? null;
  const controls = [
    ...[...document.querySelectorAll('#player-modes [role="radio"]')].map((el) => ({
      name: `the name ${el.textContent}`, shown: shown(el), box: box(el),
    })),
    ...["player-prev", "player-play", "player-next", "player-scrub"].map((id) => ({ name: `#${id}`, ...part(id) })),
  ];
  // Put up and taken down inside this one task, so no frame ever paints it.
  const chipEl = document.getElementById("asset-state");
  const chipWasHidden = chipEl ? chipEl.hidden : true;
  if (chipEl) chipEl.hidden = false;
  const chip = part("asset-state");
  if (chipEl) chipEl.hidden = chipWasHidden;

  const digits = [];
  const panel = document.getElementById("player");
  if (panel) {
    const walk = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (/\d/.test(n.data)) digits.push({ text: n.data, clock: n.parentElement?.id === "player-clock" });
    }
  }

  // The ground as the stylesheet must never type it: its three channels, as
  // the browser writes a colour back out, or the hex it is declared as.
  const ground = m.palette.GROUND;
  const channels = [1, 3, 5].map((i) => parseInt(ground.slice(i, i + 2), 16));
  const typed = new RegExp(`rgba?\\(\\s*${channels.join("\\s*,\\s*")}\\s*[,)]|${ground}`, "i");
  const literals = [];
  let ruleAlpha = null;
  const visit = (rules) => {
    for (const rule of rules) {
      if (rule.cssRules && !rule.selectorText) { visit(rule.cssRules); continue; }
      if (!rule.selectorText || !/#player\b|body\.player\b/.test(rule.selectorText)) continue;
      if (typed.test(rule.cssText)) literals.push(rule.selectorText);
      if (rule.selectorText === "#player") {
        const bg = rule.style.getPropertyValue("background") || rule.style.getPropertyValue("background-color");
        const a = /,\s*([\d.]+)\s*\)\s*$/.exec(bg);
        if (a) ruleAlpha = Number(a[1]);
      }
    }
  };
  for (const sheet of document.styleSheets) {
    try { visit(sheet.cssRules); } catch { /* a sheet the page cannot read */ }
  }

  return {
    canvas: {
      box: canvas ? box(canvas) : null,
      backing: canvas ? [canvas.width, canvas.height] : null,
      viewport: [width, height],
      ratio,
      bounded: m.display.boundedDpr(width, height, ratio),
      exhibit: document.body.classList.contains("exhibit"),
      coarse: window.matchMedia("(pointer: coarse)").matches,
    },
    layout: {
      viewport: [width, height],
      credit: { ...part("credit"), link: link !== null, linkShown: shown(link) },
      panel: part("player"),
      overviewDoor: part("overview-entry"),
      fullDoor: part("full-entry"),
      chip,
      controls,
    },
    digits,
    loop: m.navigator.fmt(schedule.duration),
    ground: {
      ground,
      computed: panel ? getComputedStyle(panel).backgroundColor : null,
      ruleAlpha,
      literals,
    },
  };
}

/** Sent to the page as source: what the panel names and checks, and what the
 *  page's own `modeAt` says should be checked at `t`. */
async function lookAtNames({ paths, t }) {
  const m = await window.__landingReach(paths);
  const schedule = await window.__landingSchedule(m.timeline);
  const names = [...document.querySelectorAll('#player-modes [role="radio"]')].map((b) => b.textContent);
  const checked = document.querySelector('#player-modes [aria-checked="true"]')?.textContent ?? null;
  const digits = [];
  const panel = document.getElementById("player");
  const walk = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (/\d/.test(n.data)) digits.push({ text: n.data, clock: n.parentElement?.id === "player-clock" });
  }
  return {
    names,
    checked,
    expected: m.modes.MODE_TITLES[m.modes.modeAt(t, schedule, null)].toUpperCase(),
    digits,
    loop: m.navigator.fmt(schedule.duration),
  };
}

/** Sent to the page as source: what has focus, said as the tab order is. */
function focusLabel() {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return "the page";
  if (el.getAttribute("role") === "radio") {
    return el.getAttribute("aria-checked") === "true" ? "the checked name" : `the name ${el.textContent}`;
  }
  if (el.tagName === "A" && el.closest("#credit")) return "the credit's link";
  return el.id ? `#${el.id}` : el.tagName.toLowerCase();
}

/**
 * Sent to the page as source: the probe page's share of the run. Everything
 * the other looks need from the schedule, and the facts of assertions three,
 * four and nine. `later` moves the first pass's side of every lift
 * comparison, which is the seed of assertion three and nothing else.
 */
async function lookAtProbe({ paths, size, later, plateauLater }) {
  const m = await window.__landingReach(paths);
  const data = await m.data.load();
  await data.preloadWindow();
  const schedule = m.timeline.buildSchedule(data.seasons);
  const D = schedule.duration;
  const segs = schedule.segments;
  const windowSeg = schedule.byYear.get(m.timeline.WINDOW_YEAR);
  const nightS = data.slateFile?.span.seconds;
  const stopAt = (id) => m.semantic.semanticTime(m.semantic.semanticStopById(id), schedule, nightS);
  const arriving = (seg) => seg.start + (seg.duration * m.timeline.ARRIVAL_TAIL) / 2;
  const after = segs[segs.indexOf(windowSeg) + 1];
  const seasonOf = (seg) => data.byYear.get(seg.year)?.season ?? String(seg.year);
  const locals = [
    { name: `${seasonOf(segs[0])} arriving`, at: arriving(segs[0]) },
    { name: "the window's crest", at: stopAt("window.crest") },
    { name: `${seasonOf(after)} arriving`, at: arriving(after) },
  ];
  const modes = m.modes.rotationModes();
  const passes = m.modes.ROTATION_PASSES;
  const guard = m.route.LOOP_END_GUARD_S;
  const request = (mode, t, exact = true) => ({
    mode, t, width: size.width, height: size.height, dpr: "bounded", deviceDpr: size.deviceDpr, exact,
  });

  // Three: each hand's own pass against the first pass, at the point of the
  // loop the lift lands on. Not against the bare local: the timeline folds an
  // address a hair below many a local, and the lift never lands below one, so
  // where the picture takes a step at that local exactly (half an arrival is
  // one) the two are a step apart and both are frames the full work draws.
  const lift = [];
  for (const mode of modes) {
    const k = m.modes.passOfMode(mode);
    const a = await window.__shot(request(mode, locals[0].at));
    const b = await window.__shot(request(mode, locals[0].at));
    const f = await window.__diffPng(a, b);
    const floor = { channels: f.channels, maxDelta: f.maxDelta };
    for (const s of locals) {
      const lifted = m.route.toPass(k, s.at, D, guard);
      const against = m.route.wrapLoop(lifted, D) + later;
      const up = await window.__shot(request(mode, lifted));
      const bare = await window.__shot(request(mode, against));
      const d = await window.__diffPng(up, bare);
      lift.push({
        mode, pass: k, local: s.name, at: s.at, lifted, against,
        comparable: d.comparable, channels: d.channels, maxDelta: d.maxDelta, floor,
        above: d.comparable ? m.shared.aboveNoise(d, floor) : true,
      });
    }
  }

  // Four: every stop a step can land on, in every pass.
  const starts = { lifts: 0, violations: [] };
  for (const mode of modes) {
    for (const start of m.navigator.Navigator.starts(schedule, data, mode)) {
      for (let k = 0; k < passes; k++) {
        const r = m.route.toPass(k, start, D, guard);
        starts.lifts++;
        if (m.route.wrapLoop(r, D) < start) starts.violations.push({ mode, pass: k, start, folded: m.route.wrapLoop(r, D) });
      }
    }
  }

  // Nine: the opening against the frame after it.
  const opening = m.timeline.ACT0_SECONDS * m.render.PRELUDE_ENGRAVING;
  const openMode = m.modes.modeAt(opening, schedule, null);
  const statsAt = async (t) => (await window.__frameStats(request(openMode, t))).mean;
  const plateau = {
    mode: openMode,
    opening,
    later: opening + plateauLater,
    meanAt: await statsAt(opening),
    meanLater: await statsAt(opening + plateauLater),
  };

  const lastButOne = segs[segs.length - 2];
  const last = segs[segs.length - 1];
  const middles = segs.filter((s) => s !== windowSeg).map((s) => s.start + s.duration / 2);
  const fine = [];
  for (let t = windowSeg.start; t < windowSeg.start + windowSeg.duration; t += m.navigator.SCRUB_STEP_S) fine.push(t);
  return {
    D,
    loop: m.navigator.fmt(D),
    passes,
    modes,
    titles: Object.fromEntries(modes.map((id) => [id, m.modes.MODE_TITLES[id].toUpperCase()])),
    firstSeasonStart: segs[0].start,
    ground: m.palette.GROUND,
    locals,
    lift,
    starts,
    plateau,
    seeks: {
      handArriving: { at: arriving(lastButOne), season: seasonOf(lastButOne) },
      plateGestures: stopAt("plate.gestures"),
      lastSeason: { start: last.start, season: seasonOf(last), before: seasonOf(lastButOne) },
    },
    sweepInstants: [...fine, ...middles].sort((x, y) => x - y),
  };
}

// --- the decision: facts in, problems out ----------------------------------

const near = (a, b) => Math.abs(a - b) <= 0.5;
const overlaps = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const fmtBox = (b) => (b ? `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)}` : "no box");

/** Seconds into the loop that a clock reading `m:ss / m:ss` shows, or NaN. */
function clockSeconds(text) {
  const m = /^(\d+):(\d{2}) \//.exec(text ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.NaN;
}

const SEASONS = seasonStrings();

/** The parts of the chrome by the names the assertions say them in. */
const PARTS = {
  panel: "the panel",
  overviewDoor: "the overview's door",
  fullDoor: "the full work's door",
  chip: "the loading chip",
  credit: "the credit",
};
/** The pairs assertion twelve holds apart: every pair of the panel, the doors,
 *  the chip and the credit, but the credit's own three, which six holds. */
const APART = [
  ["panel", "overviewDoor"], ["panel", "fullDoor"], ["overviewDoor", "fullDoor"],
  ["chip", "panel"], ["chip", "overviewDoor"], ["chip", "fullDoor"], ["chip", "credit"],
];

const ASSERTIONS = [
  {
    n: 1,
    name: "the canvas is the viewport, backed as the full work backs it, in exhibit",
    problems: (f) => Object.entries(f.player).flatMap(([size, p]) => {
      const c = p.canvas;
      const out = [];
      const [w, h] = c.viewport;
      if (!c.box || !near(c.box.x, 0) || !near(c.box.y, 0) || !near(c.box.w, w) || !near(c.box.h, h)) {
        out.push(`${size}: the canvas's box is ${fmtBox(c.box)}, not the ${w}x${h} viewport`);
      }
      const want = [Math.max(1, Math.floor(w * c.bounded)), Math.max(1, Math.floor(h * c.bounded))];
      if (!c.backing || c.backing.join("x") !== want.join("x")) {
        out.push(`${size}: the canvas is backed ${c.backing?.join("x") ?? "by nothing"}, where boundedDpr gives ${want.join("x")}`);
      }
      if (!c.exhibit) out.push(`${size}: the body has lost the exhibit class`);
      return out;
    }),
  },
  {
    n: 2,
    name: "the name checked at an instant of each pass is that pass's rendering",
    problems: (f) => f.names.flatMap((r) => {
      const out = [];
      const kth = r.names[r.pass] ?? null;
      if (r.checked !== kth) out.push(`${r.address}: ${r.checked ?? "no name"} is checked, where pass ${r.pass} is ${kth}`);
      if (r.checked !== r.expected) out.push(`${r.address}: ${r.checked ?? "no name"} is checked, where modeAt says ${r.expected}`);
      return out;
    }),
  },
  {
    n: 3,
    name: "a frame lifted into its hand's pass is the first pass's frame there",
    problems: (f) => f.probe.lift.filter((c) => c.above).map((c) => (c.comparable
      ? `${c.mode} at ${c.local}: ${c.channels} channels differ, max delta ${c.maxDelta}, `
        + `over a floor of ${c.floor.channels} channels at max delta ${c.floor.maxDelta}`
      : `${c.mode} at ${c.local}: the two frames are not the same size`)),
  },
  {
    n: 4,
    name: "every stop, lifted into every pass, lands on or after itself",
    problems: (f) => f.probe.starts.violations.map((v) => `${v.mode} pass ${v.pass}: the stop at ${v.start} folds to ${v.folded}`),
  },
  {
    n: 5,
    name: "the tab order is the panel's, then the doors', then the credit's",
    problems: (f) => {
      const got = f.tabs.order;
      const first = got.slice(0, TAB_ORDER.length);
      const out = [];
      if (first.join(" > ") !== TAB_ORDER.join(" > ")) out.push(`tabbing went ${first.join(" > ")}`);
      const next = got[TAB_ORDER.length];
      if (next !== "the page" && next !== TAB_ORDER[0]) out.push(`after the credit's link, tabbing went on to ${next}`);
      return out;
    },
  },
  {
    n: 6,
    name: "the credit is shown with its link, clear of both doors and the panel",
    problems: (f) => Object.entries(f.player).filter(([size]) => f.layoutSizes.includes(size)).flatMap(([size, p]) => {
      const l = p.layout;
      const out = [];
      const c = l.credit;
      const [w, h] = l.viewport;
      const inside = c.box && c.box.x >= 0 && c.box.y >= 0 && c.box.x + c.box.w <= w + 0.5 && c.box.y + c.box.h <= h + 0.5;
      if (!c.shown) out.push(`${size}: the credit is not shown`);
      else if (!inside) out.push(`${size}: the credit runs off the window (${fmtBox(c.box)})`);
      if (!c.link || !c.linkShown) out.push(`${size}: the credit ${c.link ? "does not show" : "has lost"} its link`);
      if (c.shown) {
        for (const [part, name] of [["overviewDoor", "the overview's door"], ["fullDoor", "the full work's door"], ["panel", "the panel"]]) {
          if (l[part].shown && overlaps(c.box, l[part].box)) {
            out.push(`${size}: the credit (${fmtBox(c.box)}) meets ${name} (${fmtBox(l[part].box)})`);
          }
        }
      }
      return out;
    }),
  },
  {
    n: 7,
    name: "every digit in the panel is the clock or a season the record names",
    problems: (f) => {
      const seen = [
        ...Object.entries(f.player).flatMap(([size, p]) => p.digits.map((d) => ({ ...d, where: size, loop: p.loop }))),
        ...f.names.flatMap((r) => r.digits.map((d) => ({ ...d, where: r.address, loop: r.loop }))),
      ];
      const out = [];
      for (const d of seen) {
        const text = d.text.trim();
        if (d.clock) {
          const m = /^\d+:\d{2} \/ (\d+:\d{2})$/.exec(text);
          if (!m || m[1] !== d.loop) out.push(`${d.where}: the clock reads "${text}", not a time over ${d.loop}`);
        } else if (!SEASONS.has(text.toUpperCase())) {
          out.push(`${d.where}: "${text}" carries a digit and is neither the clock nor a season`);
        }
      }
      return [...new Set(out)];
    },
  },
  {
    n: 8,
    name: "the panel's ground is the plate's at the stylesheet's alpha, never typed",
    problems: (f) => Object.entries(f.player).flatMap(([size, p]) => {
      const g = p.ground;
      const out = [];
      const want = [1, 3, 5].map((i) => parseInt(g.ground.slice(i, i + 2), 16));
      const got = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/.exec(g.computed ?? "");
      if (g.ruleAlpha === null) out.push(`${size}: the #player rule gives its ground no alpha`);
      if (!got) out.push(`${size}: the panel's ground computes to "${g.computed}"`);
      else {
        const alpha = got[4] === undefined ? 1 : Number(got[4]);
        if (got.slice(1, 4).map(Number).join(",") !== want.join(",") || (g.ruleAlpha !== null && Math.abs(alpha - g.ruleAlpha) > 1e-6)) {
          out.push(`${size}: the panel's ground computes to ${g.computed}, where ${g.ground} at ${g.ruleAlpha} is rgba(${want.join(", ")}, ${g.ruleAlpha})`);
        }
      }
      for (const s of g.literals) out.push(`${size}: the rule "${s}" types the ground`);
      return out;
    }),
  },
  {
    n: 9,
    name: "the opening is not darker than the frame after it",
    problems: (f) => {
      const p = f.probe.plateau;
      return p.meanAt < p.meanLater
        ? [`${p.mode} at ${p.opening}: mean ${p.meanAt.toFixed(3)}, below ${p.meanLater.toFixed(3)} at ${p.later}`]
        : [];
    },
  },
  {
    n: 10,
    name: "a name pressed on the first frame shown lands within the press's time",
    problems: (f) => {
      const c = f.firstClick;
      const out = [];
      if (c.after.checked !== c.want || c.before.checked === c.want) {
        out.push(`${c.before.checked} became ${c.after.checked}, where the press was on ${c.want}`);
      }
      if (!(clockSeconds(c.after.clock) >= c.firstSeasonStart)) {
        out.push(`the clock read ${c.after.clock}, short of the first season at ${c.firstSeasonStart} s`);
      }
      if (!(c.landedMs <= FIRST_PRESS_MS)) out.push(`it had not landed ${FIRST_PRESS_MS} ms after the press`);
      return out;
    },
  },
  {
    n: 11,
    name: "the full work and a direct address show none of the player's chrome",
    problems: (f) => f.closed.flatMap((c) => [
      ...Object.entries(c.shown).filter(([, on]) => on).map(([part]) => `${c.address}: ${part} is shown`),
      ...(c.cursor === "none" ? [] : [`${c.address}: the cursor is ${c.cursor}, not none`]),
    ]),
  },
  {
    n: 12,
    name: "every control lies in the window, and the panel, the doors and the chip stand apart",
    problems: (f) => Object.entries(f.player).filter(([size]) => f.layoutSizes.includes(size)).flatMap(([size, p]) => {
      const l = p.layout;
      const [w, h] = l.viewport;
      const out = [];
      const inside = (b) => b.x >= -0.5 && b.y >= -0.5 && b.x + b.w <= w + 0.5 && b.y + b.h <= h + 0.5;
      for (const [name, part] of [
        ...l.controls.map((c) => [c.name, c]),
        [PARTS.overviewDoor, l.overviewDoor],
        [PARTS.fullDoor, l.fullDoor],
        [PARTS.chip, l.chip],
      ]) {
        if (!part.shown) out.push(`${size}: ${name} is not shown`);
        else if (!inside(part.box)) out.push(`${size}: ${name} runs off the window (${fmtBox(part.box)})`);
      }
      for (const [a, b] of APART) {
        if (l[a].shown && l[b].shown && overlaps(l[a].box, l[b].box)) {
          out.push(`${size}: ${PARTS[a]} (${fmtBox(l[a].box)}) meets ${PARTS[b]} (${fmtBox(l[b].box)})`);
        }
      }
      return out;
    }),
  },
];

const judgeAll = (f) => ASSERTIONS.map((a) => ({ n: a.n, name: a.name, problems: a.problems(f) }));

// --- the shell: it opens pages and writes down what it saw --------------------

const { chromium } = await import("playwright");

let browser;

/** A fresh context and page at a size. A page error, an error on the console
 *  or the fault screen ends the run: what such a page shows is not evidence. */
async function open(size, { reducedMotion = "no-preference", chipWatchMs = 0, delay = 0 } = {}) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: size.deviceDpr,
    hasTouch: Boolean(size.touch),
    isMobile: Boolean(size.touch),
    reducedMotion,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`page error: ${String(e).split("\n")[0]}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text().split("\n")[0]}`); });
  await page.addInitScript(install, chipWatchMs);
  if (delay > 0) {
    await page.route((u) => new URL(u.href).pathname.includes("/data/"), async (route) => {
      await sleep(delay);
      await route.continue();
    });
  }
  const close = () => context.close();
  const check = () => { if (errors.length) throw new Error(errors.join(" | ")); };
  return { page, context, errors, close, check };
}

/** Load `address` and wait for its first frame shown. */
async function arrive(handle, address, { delay = 0 } = {}) {
  const { page } = handle;
  await page.goto(`${origin}/${address}`, { waitUntil: "domcontentloaded", timeout: STARTUP_MS });
  const by = Date.now() + STARTUP_MS + delay * 8;
  for (;;) {
    const s = await page.evaluate(startState);
    if (s.fault !== null) throw new Error(`/${address} put up the fault screen: "${s.fault}" ${handle.errors.join(" | ")}`);
    if (s.shown) break;
    if (Date.now() > by) throw new Error(`/${address} showed no frame in ${STARTUP_MS / 1000} s`);
    await sleep(POLL_MS);
  }
  handle.check();
}

/** Wait until the page says its files are ready, and at least `ms`. */
async function settle(handle, ms = SETTLE_MS) {
  const t0 = Date.now();
  await sleep(ms);
  for (;;) {
    const s = await handle.page.evaluate(startState);
    if (s.fault !== null) throw new Error(`the fault screen: "${s.fault}"`);
    if (s.ready || Date.now() - t0 > READY_MS) break;
    await sleep(POLL_MS);
  }
  handle.check();
}

const twoFrames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

/** One player page at a size, looked at once it has settled, with an
 *  optional spoil applied first. */
async function playerLook(size, spoil = null) {
  const h = await open(size);
  try {
    await arrive(h, "?experience=player");
    await settle(h);
    if (spoil) {
      await h.page.evaluate(spoil);
      await twoFrames(h.page);
    }
    const look = await h.page.evaluate(lookAtPlayer, modulesOf("display", "palette", "navigator", "timeline"));
    h.check();
    return look;
  } finally {
    await h.close();
  }
}

/** The tab order from a fresh player page, a press at a time from the page
 *  itself, one press past the last stop. */
async function tabsLook(spoil = null) {
  const h = await open(SIZE);
  try {
    await arrive(h, "?experience=player");
    await settle(h);
    if (spoil) {
      await h.page.evaluate(spoil);
      await twoFrames(h.page);
    }
    const order = [];
    for (let i = 0; i <= TAB_ORDER.length; i++) {
      await h.page.keyboard.press("Tab");
      order.push(await h.page.evaluate(focusLabel));
    }
    h.check();
    return { order };
  } finally {
    await h.close();
  }
}

/** The probe page's share. */
async function probeLook(later = 0) {
  const h = await open(SIZE);
  try {
    await h.page.goto(`${origin}/?probe=shots`, { waitUntil: "domcontentloaded", timeout: STARTUP_MS });
    const by = Date.now() + STARTUP_MS * 2;
    while (!(await h.page.evaluate(() => typeof window.__shot === "function"))) {
      if (await h.page.evaluate(() => window.__probeDone === false)) throw new Error("?probe=shots did not start");
      if (Date.now() > by) throw new Error("?probe=shots never offered __shot");
      await sleep(POLL_MS * 4);
    }
    const look = await h.page.evaluate(lookAtProbe, {
      paths: MODULES, size: SIZE, later, plateauLater: PLATEAU_LATER_S,
    });
    h.check();
    return look;
  } finally {
    await h.close();
  }
}

/** Assertion two's pages: each pass at each local, opened paused. One
 *  context for all of them, so the files are fetched once. */
async function namesLook(info) {
  const context = await browser.newContext({
    viewport: { width: SIZE.width, height: SIZE.height },
    deviceScaleFactor: SIZE.deviceDpr,
    reducedMotion: "reduce",
  });
  await context.addInitScript(install, 0);
  const rows = [];
  try {
    for (let k = 0; k < info.passes; k++) {
      for (const s of info.locals) {
        const t = k * info.D + s.at;
        const address = `?experience=player&t=${t}`;
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(`page error: ${String(e).split("\n")[0]}`));
        page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text().split("\n")[0]}`); });
        const handle = { page, errors, check: () => { if (errors.length) throw new Error(errors.join(" | ")); } };
        await arrive(handle, address);
        await settle(handle, POLL_MS);
        const look = await page.evaluate(lookAtNames, { paths: modulesOf("modes", "navigator", "timeline"), t });
        handle.check();
        rows.push({ address, pass: k, local: s.name, ...look });
        await page.close();
      }
    }
  } finally {
    await context.close();
  }
  return rows;
}

/** Sent to the page as source: the player's clock and the name it checks. */
function playerState() {
  const checked = document.querySelector('#player-modes [aria-checked="true"]');
  const chip = document.getElementById("asset-state");
  return {
    clock: document.getElementById("player-clock")?.textContent ?? null,
    checked: checked ? checked.textContent : null,
    chip: chip && !chip.hidden ? chip.textContent : null,
  };
}

/**
 * A press on the second name, made as soon as the first frame is shown: the
 * name it checks and the clock it brings, polled for the press's time, with a
 * capture of the frame it lands on. The first frame is captured from a load of
 * its own, so no capture holds the press back. Assertion ten, and under
 * `--delay` the same press, reported.
 */
async function pressLook(info, dir, { delay = 0, chipWatchMs = 0 } = {}) {
  mkdirSync(dir, { recursive: true });
  const first = await open(SIZE, { delay });
  try {
    await arrive(first, "?experience=player", { delay });
    await first.page.screenshot({ path: join(dir, "before.png") });
  } finally {
    await first.close();
  }

  const h = await open(SIZE, { delay, chipWatchMs });
  try {
    await h.page.goto(`${origin}/?experience=player`, { waitUntil: "domcontentloaded", timeout: STARTUP_MS });
    // The names are laid out under the startup card before it goes, so where
    // the second one is can be read while the card is still up.
    const by = Date.now() + STARTUP_MS + delay * 8;
    let target = null;
    for (;;) {
      const s = await h.page.evaluate(() => {
        const el = document.querySelector('#player-modes [role="radio"]:nth-child(2)');
        const r = el?.getBoundingClientRect();
        return {
          shown: window.__firstShown !== undefined,
          fault: document.getElementById("fault") !== null,
          box: r && r.width > 0 ? { x: r.x + r.width / 2, y: r.y + r.height / 2, text: el.textContent } : null,
        };
      });
      if (s.fault) throw new Error(`?experience=player put up the fault screen ${h.errors.join(" | ")}`);
      if (s.box) target = s.box;
      if (s.shown && target) break;
      if (Date.now() > by) throw new Error("?experience=player showed no frame with its names");
      await sleep(POLL_MS / 5);
    }
    const was = await h.page.evaluate(playerState);
    await h.page.mouse.click(target.x, target.y);
    const pressed = Date.now();
    const landed = (s) => s.checked === target.text && clockSeconds(s.clock) >= info.firstSeasonStart;
    const chips = new Set();
    let now = await h.page.evaluate(playerState);
    if (now.chip) chips.add(now.chip);
    while (!landed(now) && Date.now() - pressed < FIRST_PRESS_MS) {
      await sleep(POLL_MS);
      now = await h.page.evaluate(playerState);
      if (now.chip) chips.add(now.chip);
    }
    const landedMs = landed(now) ? Date.now() - pressed : Number.POSITIVE_INFINITY;
    await h.page.screenshot({ path: join(dir, "after.png") });
    const timing = await h.page.evaluate(() => ({ shown: window.__firstShown, pressed: window.__pressedAt }));
    let chipLog = null;
    if (chipWatchMs > 0) {
      const until = Date.now() + chipWatchMs + WATCH_MS;
      while ((await h.page.evaluate(() => window.__chipLog?.at(-1)?.[0] ?? 0)) < chipWatchMs && Date.now() < until) {
        await sleep(POLL_MS * 4);
      }
      chipLog = await h.page.evaluate(() => window.__chipLog ?? []);
    }
    h.check();
    return {
      want: target.text,
      before: was,
      after: now,
      landedMs,
      pressedAfterMs: timing.pressed - timing.shown,
      firstSeasonStart: info.firstSeasonStart,
      chips: [...chips],
      chipLog,
    };
  } finally {
    await h.close();
  }
}

/** Assertion eleven's pages. */
async function closedLook() {
  const out = [];
  for (const address of ["?experience=full", "?t=300"]) {
    const h = await open(SIZE);
    try {
      await arrive(h, address);
      await settle(h);
      const seen = await h.page.evaluate(() => {
        const shown = (id) => {
          const el = document.getElementById(id);
          if (!el || el.hidden) return false;
          const cs = getComputedStyle(el);
          return cs.display !== "none" && cs.visibility !== "hidden";
        };
        return {
          shown: {
            "the panel": shown("player"),
            "the overview's door": shown("overview-entry"),
            "the full work's door": shown("full-entry"),
            "the credit": shown("credit"),
          },
          cursor: getComputedStyle(document.body).cursor,
        };
      });
      h.check();
      out.push({ address: `/${address}`, ...seen });
    } finally {
      await h.close();
    }
  }
  return out;
}

// --- the seeds ----------------------------------------------------------------

/** Pages and comparisons spoiled on purpose. Each names the assertion it must
 *  turn red, alone, and the look it spoils. */
const SEEDS = [
  {
    name: "the exhibit class taken off the player's body",
    assertion: 1,
    look: "player",
    spoil: () => document.body.classList.remove("exhibit"),
  },
  {
    name: "each lift compared with the first pass's frame a second later",
    assertion: 3,
    look: "probe",
  },
  {
    name: "the overview's door moved in front of the panel",
    assertion: 5,
    look: "tabs",
    spoil: () => document.getElementById("player").before(document.getElementById("overview-entry")),
  },
  {
    name: "the credit hidden",
    assertion: 6,
    look: "player",
    spoil: () => { document.getElementById("credit").hidden = true; },
  },
  {
    name: "a digit written into the panel's heading",
    assertion: 7,
    look: "player",
    spoil: () => document.getElementById("player-heading").append(" 12"),
  },
  {
    name: "the panel's ground overwritten",
    assertion: 8,
    look: "player",
    spoil: () => {
      const panel = document.getElementById("player");
      const now = getComputedStyle(panel).getPropertyValue("--player-ground").split(",").map(Number);
      panel.style.setProperty("--player-ground", now.map((c) => 255 - c).join(", "));
    },
  },
  {
    name: "the overview's door set down on the full work's door",
    assertion: 12,
    look: "player",
    spoil: () => {
      const full = getComputedStyle(document.getElementById("full-entry"));
      document.getElementById("overview-entry").style.bottom = full.bottom;
    },
  },
];

/** The facts with the seed's look taken again, spoiled. */
async function seededFacts(seed, base) {
  const f = { ...base, player: { ...base.player } };
  if (seed.look === "player") f.player[labelOf(SIZE)] = await playerLook(SIZE, seed.spoil);
  else if (seed.look === "tabs") f.tabs = await tabsLook(seed.spoil);
  else if (seed.look === "probe") f.probe = await probeLook(SEED_LATER_S);
  else throw new Error(`a seed spoils no look: ${seed.name}`);
  return f;
}

// --- reported, never judged ---------------------------------------------------

/** Sent to the page as source: one control, timed from the moment it is
 *  worked to the end of the first animation frame asked for after it, which
 *  runs after the piece's own frame; then the frames of the second after. */
async function timeControl({ control, watchMs }) {
  const clock = () => document.getElementById("player-clock")?.textContent ?? null;
  const chip = () => {
    const c = document.getElementById("asset-state");
    return c && !c.hidden ? c.textContent : null;
  };
  const el = control.name
    ? [...document.querySelectorAll('#player-modes [role="radio"]')].find((b) => b.textContent === control.name)
    : document.querySelector(control.selector);
  if (!el) throw new Error(`no control ${control.name ?? control.selector}`);
  if (control.key) el.focus();
  const before = clock();
  const t0 = performance.now();
  if (control.key) el.dispatchEvent(new KeyboardEvent("keydown", { key: control.key, bubbles: true, cancelable: true }));
  else el.click();
  const first = await new Promise((r) => requestAnimationFrame(() => r(performance.now())));
  const after = clock();
  const chips = new Set();
  let worst = 0;
  let frames = 0;
  let last = first;
  await new Promise((done) => {
    const tick = () => {
      const now = performance.now();
      worst = Math.max(worst, now - last);
      last = now;
      frames++;
      const c = chip();
      if (c) chips.add(c);
      if (now - t0 < watchMs) requestAnimationFrame(tick);
      else done();
    };
    requestAnimationFrame(tick);
  });
  return {
    before,
    after,
    firstMs: first - t0,
    worstMs: worst,
    frames,
    chips: [...chips],
  };
}

async function timedSeeks(info) {
  const s = info.seeks;
  const hand = info.titles.hand;
  const SEEKS = [
    {
      name: `THE HAND mid-arrival of ${s.handArriving.season}, back one scrub step`,
      address: `?experience=player&mode=hand&t=${s.handArriving.at}`,
      control: { selector: "#player-scrub", key: "ArrowLeft" },
    },
    {
      name: "a cold pick of THE HAND at the window's crest",
      address: "?experience=player&stop=window.crest",
      control: { name: hand },
    },
    {
      name: "THE PLATE a second into the gestures, then previous",
      address: `?experience=player&mode=plate&t=${s.plateGestures + INTO_S}`,
      control: { selector: "#player-prev" },
    },
    {
      name: `THE HAND a second into ${s.lastSeason.season}, back one scrub step into ${s.lastSeason.before}`,
      address: `?experience=player&mode=hand&t=${s.lastSeason.start + INTO_S}`,
      control: { selector: "#player-scrub", key: "ArrowLeft" },
    },
  ];
  const rows = [];
  for (const seek of SEEKS) {
    const h = await open(SIZE, { reducedMotion: "reduce" });
    try {
      await arrive(h, seek.address);
      await settle(h, SETTLE_MS * 2);
      const r = await h.page.evaluate(timeControl, { control: seek.control, watchMs: WATCH_MS });
      h.check();
      rows.push({ ...seek, ...r });
    } finally {
      await h.close();
    }
  }
  return rows;
}

/** `--film`: captures a set time after the first frame shown. */
async function film() {
  const FILMS = [
    { name: "overview", address: "?experience=overview" },
    { name: "card", address: "?experience=player" },
    { name: "start", address: "?experience=player&t=0" },
    { name: "game", address: "?experience=player&stop=plate.game" },
  ];
  const lines = [];
  for (const f of FILMS) {
    const dir = join(OUT, "film", f.name, labelOf(SIZE));
    mkdirSync(dir, { recursive: true });
    const h = await open(SIZE);
    try {
      await arrive(h, f.address);
      const taken = [];
      for (const mark of FILM_MARKS_S) {
        const elapsed = await h.page.evaluate(() => performance.now() - window.__firstShown);
        if (mark * 1000 > elapsed) await sleep(mark * 1000 - elapsed);
        const at = await h.page.evaluate(() => performance.now() - window.__firstShown);
        await h.page.screenshot({ path: join(dir, `at-${String(mark).padStart(2, "0")}.png`) });
        taken.push(`${String(mark).padStart(2, "0")} at ${(at / 1000).toFixed(2)} s`);
      }
      h.check();
      lines.push(`  ${f.name.padEnd(8)} /${f.address}  ${taken.join(", ")}  -> ${rel(dir)}`);
    } finally {
      await h.close();
    }
  }
  return lines;
}

/** `--pairs`: reduced motion on and off. */
async function pairs() {
  const lines = [];
  for (const size of LAYOUT_SIZES) {
    for (const [motion, reducedMotion] of [["on", "reduce"], ["off", "no-preference"]]) {
      const m = await open(size, { reducedMotion });
      try {
        await arrive(m, "?experience=player");
        const elapsed = await m.page.evaluate(() => performance.now() - window.__firstShown);
        await sleep(Math.max(0, MOTION_PAIR_AFTER_S * 1000 - elapsed));
        const dir = join(OUT, "pairs", `reduced-motion-${motion}`);
        mkdirSync(dir, { recursive: true });
        await m.page.screenshot({ path: join(dir, `${labelOf(size)}.png`) });
        m.check();
      } finally {
        await m.close();
      }
    }
    lines.push(`  ${sizeLine(size)}: reduced motion on/off`);
  }
  lines.push(`  -> ${rel(join(OUT, "pairs"))}/reduced-motion-<on|off>/<size>.png`);
  return lines;
}

/** Sent to the page as source: the lit share inside each rectangle of the
 *  chrome, for one hand at every instant, at one size and profile. */
async function inkUnder({ size, display, mode, instants, rects, groundMax }) {
  const rows = [];
  const tile = document.createElement("canvas");
  for (const t of instants) {
    const url = await window.__shot({
      mode, t, width: size.width, height: size.height, dpr: "bounded", deviceDpr: size.deviceDpr, display,
    });
    const bmp = await createImageBitmap(await (await fetch(url)).blob());
    const ratio = bmp.width / size.width;
    const shares = {};
    for (const [name, r] of Object.entries(rects)) {
      if (!r) { shares[name] = null; continue; }
      const x = Math.max(0, Math.floor(r.x * ratio));
      const y = Math.max(0, Math.floor(r.y * ratio));
      const w = Math.min(bmp.width - x, Math.ceil(r.w * ratio));
      const h = Math.min(bmp.height - y, Math.ceil(r.h * ratio));
      if (w <= 0 || h <= 0) { shares[name] = null; continue; }
      tile.width = w;
      tile.height = h;
      const c = tile.getContext("2d", { willReadFrequently: true });
      c.drawImage(bmp, x, y, w, h, 0, 0, w, h);
      const d = c.getImageData(0, 0, w, h).data;
      let lit = 0;
      for (let i = 0; i < d.length; i += 4) if (Math.max(d[i], d[i + 1], d[i + 2]) > groundMax + 1) lit++;
      shares[name] = lit / (w * h);
    }
    bmp.close();
    rows.push({ t, ...shares });
  }
  return rows;
}

/** `--sweep`: ink under the panel and the doors. */
async function sweep(info) {
  const sizes = distinct([SIZE, ...SWEEP_EXTRA]);
  const groundMax = Math.max(...[1, 3, 5].map((i) => parseInt(info.ground.slice(i, i + 2), 16)));
  const rectsBySize = {};
  for (const size of sizes) {
    const look = await playerLook(size);
    const l = look.layout;
    const r = (p) => (p.shown ? p.box : null);
    rectsBySize[labelOf(size)] = { panel: r(l.panel), overviewDoor: r(l.overviewDoor), fullDoor: r(l.fullDoor) };
  }
  const h = await open(SIZE);
  const table = [];
  try {
    await h.page.goto(`${origin}/?probe=shots`, { waitUntil: "domcontentloaded", timeout: STARTUP_MS });
    while (!(await h.page.evaluate(() => typeof window.__shot === "function"))) await sleep(POLL_MS * 4);
    for (const size of sizes) {
      for (const display of ["near", "room"]) {
        for (const mode of info.modes) {
          const rows = await h.page.evaluate(inkUnder, {
            size, display, mode, instants: info.sweepInstants, rects: rectsBySize[labelOf(size)], groundMax,
          });
          for (const row of rows) table.push({ size: labelOf(size), display, mode, ...row });
        }
      }
    }
    h.check();
  } finally {
    await h.close();
  }
  const dir = join(OUT, "sweep");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `ink-under-chrome-${labelOf(SIZE)}.json`);
  writeFileSync(file, `${JSON.stringify({
    is: "the share of pixels above the ground inside each rectangle of the player's chrome, "
      + "drawn through ?probe=shots at the size's bounded ratio",
    rects: rectsBySize,
    instants: info.sweepInstants,
    rows: table,
  }, null, 1)}\n`);
  const lines = [];
  const pct = (v) => `${(v * 100).toFixed(2)}%`;
  for (const size of sizes) {
    for (const display of ["near", "room"]) {
      const rows = table.filter((r) => r.size === labelOf(size) && r.display === display);
      const parts = [];
      for (const [name, label] of [["panel", "panel"], ["overviewDoor", "overview door"], ["fullDoor", "full door"]]) {
        const vals = rows.filter((r) => r[name] !== null);
        if (!vals.length) { parts.push(`${label} not shown`); continue; }
        const worst = vals.reduce((a, b) => (b[name] > a[name] ? b : a));
        const sorted = vals.map((r) => r[name]).sort((a, b) => a - b);
        const inked = vals.filter((r) => r[name] > 0).length;
        parts.push(inked === 0 ? `${label} no ink in ${vals.length} frames`
          : `${label} worst ${pct(worst[name])} (${worst.mode} @ ${worst.t}), `
            + `median ${pct(sorted[Math.floor(sorted.length / 2)])}, ink in ${inked} of ${vals.length} frames`);
      }
      lines.push(`  ${labelOf(size).padEnd(9)} ${display.padEnd(4)}  ${parts.join("; ")}`);
    }
  }
  lines.push(`  -> ${rel(file)}`);
  return lines;
}

const rel = (p) => p.replace(`${REPO}/`, "");

// --- the run ----------------------------------------------------------------

await waitForServer(30_000);
await refuseUnservedModules();
if (delayMs > 0) {
  const timeoutMs = await fetchTimeoutMs();
  if (delayMs >= timeoutMs) die(`--delay ${delayMs} reaches the page's fetch timeout (${timeoutMs} ms): every file would fail`);
}

// The same flags the probes, the shots and the smoke run pass: under software
// rasterisation the page is not the one a visitor's machine draws.
browser = await chromium.launch({
  channel: "chrome",
  headless,
  args: ["--use-gl=angle", "--enable-gpu-rasterization", "--ignore-gpu-blocklist"],
});
console.log(`landing: chrome ${browser.version()}, ${headless ? "headless" : "headed"}, ${origin}; `
  + `the run's size ${sizeLine(SIZE)}; layout at ${LAYOUT_SIZES.map(sizeLine).join(", ")}`);

const reported = [];
let red = false;
try {
  const probe = await probeLook();
  const player = {};
  for (const size of LAYOUT_SIZES) player[labelOf(size)] = await playerLook(size);
  for (const [size, p] of Object.entries(player)) {
    console.log(`landing: ${size}: canvas ${p.canvas.backing.join("x")} at ${p.canvas.bounded.toFixed(4)}, `
      + `pointer ${p.canvas.coarse ? "coarse" : "fine"}, panel ${fmtBox(p.layout.panel.box)}, `
      + `credit ${fmtBox(p.layout.credit.box)}, doors ${fmtBox(p.layout.overviewDoor.box)} and ${fmtBox(p.layout.fullDoor.box)}, `
      + `chip ${fmtBox(p.layout.chip.box)}`);
  }
  const facts = {
    probe,
    player,
    layoutSizes: LAYOUT_SIZES.map(labelOf),
    tabs: await tabsLook(),
    names: await namesLook(probe),
    firstClick: await pressLook(probe, join(OUT, "first-press", labelOf(SIZE))),
    closed: await closedLook(),
  };
  console.log(`landing: the locals: ${probe.locals.map((s) => `${s.name} (${s.at})`).join(", ")}; `
    + `${probe.lift.length} lift comparisons, ${probe.starts.lifts} stop lifts, ${facts.names.length} paused openings`);
  console.log(`landing: tab order ${facts.tabs.order.join(" > ")}`);
  const fc = facts.firstClick;
  console.log(`landing: first press ${Math.round(fc.pressedAfterMs)} ms after the first frame shown: `
    + `${fc.before.checked} at ${fc.before.clock} to ${fc.after.checked} at ${fc.after.clock}`
    + `${Number.isFinite(fc.landedMs) ? ` within ${fc.landedMs} ms` : ""}; chip ${fc.chips.length ? fc.chips.join(", ") : "never shown"}`
    + ` -> ${rel(join(OUT, "first-press", labelOf(SIZE)))}`);

  const verdicts = judgeAll(facts);
  for (const v of verdicts) {
    console.log(`landing: ${v.problems.length ? "NO" : "ok"}  ${String(v.n).padStart(2)}  ${v.name}`);
    for (const p of v.problems) console.log(`              ${p}`);
  }
  const failing = verdicts.filter((v) => v.problems.length);

  const seedProblems = [];
  for (const seed of SEEDS) {
    const seeded = judgeAll(await seededFacts(seed, facts)).filter((v) => v.problems.length);
    const got = seeded.map((v) => v.n);
    const own = got.length === 1 && got[0] === seed.assertion;
    console.log(`landing: seeded failure: ${seed.name}`);
    for (const v of seeded) for (const p of v.problems) console.log(`              ${v.n}: ${p}`);
    console.log(`              ${!got.length ? `LET THROUGH, where assertion ${seed.assertion} must refuse it`
      : own ? `caught by assertion ${seed.assertion} alone`
        : `red for [${got.join(", ")}], NOT for [${seed.assertion}] alone`}`);
    if (!own) seedProblems.push(seed.name);
  }

  const seeks = await timedSeeks(probe);
  console.log(`landing: timed seeks at ${sizeLine(SIZE)}, opened paused; from the control to the `
    + "first animation frame asked for after the piece's own (a wait for the display's next tick "
    + `included), and the longest frame in the ${WATCH_MS / 1000} s after`);
  for (const r of seeks) {
    console.log(`  ${r.name}`);
    console.log(`      /${r.address}  ${r.before} to ${r.after}  first frame ${r.firstMs.toFixed(1)} ms  `
      + `longest after ${r.worstMs.toFixed(1)} ms over ${r.frames} frames  `
      + `chip ${r.chips.length ? r.chips.join(", ") : "never shown"}`);
  }
  reported.push("timed seeks");

  if (flags.film) {
    console.log(`landing: film at ${sizeLine(SIZE)}, seconds after the first frame shown`);
    for (const line of await film()) console.log(line);
    reported.push("film");
  }
  if (flags.pairs) {
    console.log(`landing: pairs, the opening ${MOTION_PAIR_AFTER_S} s after the first frame shown, reduced motion asked for and not`);
    for (const line of await pairs()) console.log(line);
    reported.push("pairs");
  }
  if (delayMs > 0) {
    const dir = join(OUT, `delay-${delayMs}`, labelOf(SIZE));
    const d = await pressLook(probe, dir, { delay: delayMs, chipWatchMs: CHIP_WATCH_MS });
    console.log(`landing: every data request held ${delayMs} ms; the second name pressed `
      + `${Math.round(d.pressedAfterMs)} ms after the first frame shown: ${d.before.checked} at ${d.before.clock} `
      + `to ${d.after.checked} at ${d.after.clock}${Number.isFinite(d.landedMs) ? ` within ${d.landedMs} ms` : ", not landed in time"}`);
    console.log(`landing: the chip on each frame for ${CHIP_WATCH_MS / 1000} s after the first frame shown`);
    const runs = [];
    for (const [at, text] of d.chipLog) {
      const last = runs.at(-1);
      if (last && last.text === text) { last.to = at; last.frames++; } else runs.push({ text, from: at, to: at, frames: 1 });
    }
    for (const r of runs) {
      console.log(`  ${(r.from / 1000).toFixed(3)} to ${(r.to / 1000).toFixed(3)} s  ${r.text ?? "(not shown)"}  ${r.frames} frames`);
    }
    console.log(`  -> ${rel(dir)}`);
    reported.push(`delay ${delayMs} ms`);
  }
  // Last, as the longest by far.
  if (flags.sweep) {
    console.log(`landing: ink under the chrome at ${probe.sweepInstants.length} instants per hand `
      + "(the window by the scrub's step, every other season at its middle)");
    for (const line of await sweep(probe)) console.log(line);
    reported.push("sweep");
  }

  for (const s of seedProblems) console.log(`landing: seeded failure "${s}" was not caught by its own assertion alone`);
  if (failing.length || seedProblems.length) {
    red = true;
    console.log(`LANDING RED: ${failing.length} of ${ASSERTIONS.length} assertions failed, `
      + `${seedProblems.length} of ${SEEDS.length} seeded failures not caught by their own alone; `
      + `reported: ${reported.join(", ")}`);
  } else {
    console.log(`LANDING GREEN: ${ASSERTIONS.length} assertions, ${SEEDS.length} seeded failures each caught; `
      + `reported: ${reported.join(", ")}`);
  }
} catch (e) {
  red = true;
  console.error(`landing: ${String(e).split("\n")[0]}`);
  console.log("LANDING RED: the run did not finish");
} finally {
  await browser.close();
}
if (red) process.exitCode = 1;
