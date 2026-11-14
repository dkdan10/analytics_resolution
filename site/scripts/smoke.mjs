#!/usr/bin/env node
/**
 * Every public address, opened the way a visitor opens it.
 *
 * NOT a probe, and never part of `npm test` or the build. The probes draw the
 * frames they ask for onto surfaces of their own; none of them loads an
 * address and lets the page start itself, so none of them sees the startup
 * card, the chrome or the frame loop a visitor gets. This opens each address
 * the piece is reached by, at the laptop surface the probes use and at a
 * phone's, and refuses a load that
 *
 *   - threw an uncaught error, or wrote an error to the console;
 *   - put up the fault screen;
 *   - still showed its startup card STARTUP_MS after it was asked for;
 *   - said its files were degraded;
 *   - drew nothing above the ground within INK_MS of the card going.
 *
 * A load is not let go at its first ink. It is watched for SETTLE_MS more, the
 * same listeners on and the same looks taken, so an error thrown once the page
 * is drawing, or a fault put up then, is refused as one at the open is.
 *
 *   npm run smoke [-- --port <n>] [--headed]
 *
 * It needs a server: `npm run dev` on the default port, or, for the built
 * bundle, `npm run build && npm run preview` with `--port 4173`. The browser
 * is the installed Chrome with the flags the probes and the shots pass, and it
 * is headless unless `--headed` opens a window. Every load is a fresh browser
 * context, so no load starts from another's files.
 *
 * `?talk` opens paused on bare stone by design. There the rail is asked to be
 * on screen with its buttons, Space is pressed, and only then is the canvas
 * watched.
 *
 * `?experience=player` is also used, once it has settled. Its panel, both
 * doors and the credit must be on screen, and its canvas the size the full
 * work's is at the same viewport. Then it is worked as a visitor works it, and
 * each step must move the clock it shows as that step should: a click on the
 * second name, made while the prelude plays, checks that name and takes the
 * clock to the first season's start or past it; the play button stops the
 * clock and starts it again; Space stops it; a click on the scrub moves it
 * while it is stopped; the next button moves it on and the previous button
 * back, the name checked staying the same; and Space starts it again.
 *
 * The canvas is read through a small copy taken pixel for pixel, never
 * blended: a sampled pixel keeps its value, so "above the ground" is what
 * `__frameStats` counts as lit - a channel more than one level above the
 * brightest channel of the page's own `--ground` - and the share printed is
 * that rule's share over the sampled grid, at the first look that found ink.
 * It moves with how fast the page came up, so two runs agree on whether a load
 * drew and at what size, not on the share to the last digit.
 *
 * ON THE FAULT SCREEN THE CONSOLE IS THE FAULT'S. `main.ts:fault` writes its
 * reason there and replaces the page with one line, taking the startup card
 * and the canvas with it. A load that faulted is refused for the fault, with
 * what the console said as its reason, and nothing else on the page is asked.
 *
 * A detector that has only ever watched a healthy page cannot be told from one
 * that passes whatever it is shown. So every run also opens pages broken on
 * purpose (SEEDS), in the same browser, and each must be refused for its own
 * reason and no other: a page refused for a second reason fails its seed as
 * surely as one let through.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

function die(msg) {
  console.error(`smoke: ${msg}`);
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
const VALUED = ["port"];
const SWITCHES = ["headed"];

const flags = parseArgs(process.argv.slice(2));
for (const [k, v] of Object.entries(flags)) {
  if (v === true && VALUED.includes(k)) die(`--${k} needs a value`);
  if (v !== true && SWITCHES.includes(k)) die(`--${k} takes no value (got ${v})`);
  if (!VALUED.includes(k) && !SWITCHES.includes(k)) die(`no such flag: --${k}`);
}
if (flags.port !== undefined && !/^\d+$/.test(flags.port)) die(`--port is a plain number: ${flags.port}`);
const port = Number(flags.port ?? 5173);
const headless = !flags.headed;
const origin = `http://localhost:${port}`;

/** How long a page may keep its startup card up, counted from the request. */
const STARTUP_MS = 60_000;
/** How long the canvas has to show ink once the card has gone. */
const INK_MS = 10_000;
/** How long a load is watched on after its canvas first shows ink. */
const SETTLE_MS = 2_000;
/** How long after its startup card goes the seeded frame loop throws: before
 *  the settle ends wherever the first ink falls, and after that ink on a page
 *  that draws as soon as its card has gone. */
const SEED_LATE_MS = SETTLE_MS / 2;
/** How often the page is looked at. Polled from here on a timer rather than
 *  with Playwright's own wait, which asks the page for animation frames. */
const POLL_MS = 100;
/** Columns in the copy the canvas is read through. */
const READBACK_WIDTH = 480;

/** The laptop surface, from the one place it is declared, by the expression
 *  `playback-log.mjs` reads it with. */
function laptopSurface() {
  const src = readFileSync(join(HERE, "..", "src", "probe", "shared.ts"), "utf8");
  const m = /LAPTOP_SURFACE\s*=\s*\{\s*width:\s*(\d+),\s*height:\s*(\d+),\s*deviceDpr:\s*([\d.]+)\s*\}/
    .exec(src);
  if (!m) die("src/probe/shared.ts no longer declares LAPTOP_SURFACE as a width, a height and a ratio");
  return { width: Number(m[1]), height: Number(m[2]), deviceDpr: Number(m[3]) };
}

const SIZES = [laptopSurface(), { width: 390, height: 844, deviceDpr: 3 }];

/** Where the first season starts in the loop: the prelude's length, read from
 *  the one place it is declared, since the schedule lays the first season
 *  straight after it. */
function firstSeasonStart() {
  const src = readFileSync(join(HERE, "..", "src", "timeline.ts"), "utf8");
  const m = /export const ACT0_SECONDS\s*=\s*([\d.]+)\s*;/.exec(src);
  if (!m) die("src/timeline.ts no longer declares ACT0_SECONDS as a number");
  return Number(m[1]);
}

const FIRST_SEASON_S = firstSeasonStart();

/** The public addresses: the bare one, both named experiences, the lectern,
 *  the rail, one direct address of the kind a citation is, and the player.
 *  The player comes after the full work, whose canvas it is held to. */
const ADDRESSES = [
  "",
  "?experience=overview",
  "?experience=full",
  "?talk",
  "?nav",
  "?mode=hand&stop=hand.close",
  "?experience=player",
];
const FULL_WORK = "?experience=full";

/** How long after a press the player's clock is first read: a frame or two
 *  for the press to reach it. */
const PRESS_MS = 300;
/** How long a stopped clock must keep its text. Its text is whole seconds,
 *  so a running clock changes it inside this. */
const HOLD_MS = 1_500;
/** How long a started clock has to change its text. */
const MOVE_MS = 3_000;
/** Where along the scrub the click falls, as a share of its width: far from
 *  the opening instant, so the clock it lands on cannot be the one it left. */
const SCRUB_AT = 0.75;

/** Pages broken on purpose. Each names the one condition it must be refused
 *  for, and is opened at the laptop surface. */
const SEEDS = [
  {
    name: "a frame loop that never starts",
    address: "?probe=shots",
    expect: "empty canvas",
  },
  {
    name: "the seasons file refused",
    address: "?experience=full",
    expect: "fault",
    spoil: (page) => page.route((u) => u.pathname.endsWith("/data/seasons.json"), (r) => r.abort()),
  },
  {
    name: "a script that throws as the page opens",
    address: "?experience=full",
    expect: "page error",
    spoil: (page) => page.addInitScript(() => {
      throw new Error("seeded: a script that throws as the page opens");
    }),
  },
  {
    // The page asks for each frame from the one before, so a frame that throws
    // is the last one: the canvas keeps its ink and nothing draws again.
    name: "a frame loop that throws on a later frame",
    address: "?experience=full",
    expect: "page error",
    spoil: (page) => page.addInitScript((lateMs) => {
      const ask = window.requestAnimationFrame.bind(window);
      let cardGone = null;
      window.requestAnimationFrame = (frame) => ask((now) => {
        if (cardGone === null && document.getElementById("startup")?.hidden) cardGone = now;
        if (cardGone !== null && now - cardGone >= lateMs) {
          throw new Error("seeded: a frame loop that throws on a later frame");
        }
        frame(now);
      });
    }, SEED_LATE_MS),
  },
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

// --- the decision: facts in, refusals out ------------------------------------

/**
 * Why a load is refused, as `{ condition, detail }`, one per condition broken.
 * Decides from the facts alone and reads nothing else.
 */
function judge(f) {
  const out = [];
  const say = (condition, detail) => out.push({ condition, detail });
  if (f.pageErrors.length) say("page error", f.pageErrors.join(" | "));
  if (f.fault !== null) {
    say("fault", `"${f.fault}"${f.consoleErrors.length ? `; the console said: ${f.consoleErrors.join(" | ")}` : ""}`);
    return out;
  }
  if (f.consoleErrors.length) say("console error", f.consoleErrors.join(" | "));
  if (!f.startupHidden) {
    say("startup", `the startup card still read "${f.startupText}" after ${STARTUP_MS / 1000} s`);
  }
  if (f.rail !== null && !(f.rail.shown && f.rail.buttons > 0)) {
    say("rail", f.rail.shown ? "the rail is on screen with no buttons" : "the rail is not on screen");
  }
  if (f.degraded !== null) say("degraded", `the page said "${f.degraded}"`);
  const ink = f.ink;
  if (!ink || ink.canvas === null) say("empty canvas", "no #plate on the page");
  else if (ink.groundMax === null) say("empty canvas", `cannot be told: --ground is not a colour ("${ink.ground}")`);
  else if (!(ink.lit > 0)) {
    say("empty canvas", `nothing above the ground within ${INK_MS / 1000} s (canvas ${ink.canvas.join("x")})`);
  }
  if (f.player) {
    const p = f.player;
    for (const [part, on] of Object.entries(p.shown)) if (!on) say("player", `${part} is not on screen`);
    const here = ink?.canvas ? ink.canvas.join("x") : "none";
    if (!p.fullCanvas) say("player", `no ${FULL_WORK} canvas at this size to hold it to`);
    else if (here !== p.fullCanvas.join("x")) {
      say("player", `canvas ${here}, where ${FULL_WORK}'s is ${p.fullCanvas.join("x")}`);
    }
    for (const s of p.steps) if (!s.ok) say("player", `${s.name}: ${s.saw}`);
  }
  return out;
}

/** What is wrong with the seeded loads: a seed let through, or refused for
 *  anything but its own condition alone. */
function seedProblems(seeded) {
  const problems = [];
  for (const { seed, refusals } of seeded) {
    const got = refusals.map((r) => r.condition);
    if (!got.length) problems.push(`seeded failure "${seed.name}" was let through`);
    else if (got.length !== 1 || got[0] !== seed.expect) {
      problems.push(`seeded failure "${seed.name}" was refused for [${got.join(", ")}], not for [${seed.expect}]`);
    }
  }
  return problems;
}

// --- the shell: it opens pages and writes down what it saw --------------------

/** Sent to the page as source: the state of its chrome. */
function look() {
  // As laid out, so the lines of the fault screen and the card stay apart.
  const text = (el) => el.innerText.replace(/\s+/g, " ").trim();
  const fault = document.getElementById("fault");
  const startup = document.getElementById("startup");
  const chip = document.getElementById("asset-state");
  const door = document.getElementById("full-entry");
  const back = document.getElementById("overview-entry");
  return {
    fault: fault ? text(fault) : null,
    startupHidden: !startup || startup.hidden,
    startupText: startup ? text(startup) : null,
    degraded: document.body.dataset.assetState === "degraded"
      ? (chip && !chip.hidden ? text(chip) : "degraded") : null,
    door: door && !door.hidden ? text(door) : null,
    overviewDoor: back && !back.hidden ? text(back) : null,
  };
}

/** Sent to the page as source: which of the player's parts are on screen. */
function lookAtPlayer() {
  const shown = (id) => {
    const el = document.getElementById(id);
    return el !== null && !el.hidden && getComputedStyle(el).display !== "none";
  };
  return {
    panel: shown("player"),
    "overview door": shown("overview-entry"),
    "full door": shown("full-entry"),
    credit: shown("credit"),
  };
}

/** Sent to the page as source: what the player's clock reads. */
function playerClock() {
  return document.getElementById("player-clock")?.textContent ?? null;
}

/** Sent to the page as source: the player's clock and the name it checks. */
function playerState() {
  const checked = document.querySelector('#player-modes [aria-checked="true"]');
  return {
    clock: document.getElementById("player-clock")?.textContent ?? null,
    checked: checked ? checked.textContent : null,
  };
}

/** Seconds into the loop that a clock reading `m:ss / m:ss` shows, or NaN. */
function clockSeconds(text) {
  const m = /^(\d+):(\d{2}) \//.exec(text ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.NaN;
}

/**
 * The player, worked as a visitor works it. Each step says what the clock
 * read, and whether that is what the step must leave behind. The clock's own
 * text is the witness: a press that reaches nothing leaves it as it was,
 * running or still. The name checked is the witness of the rendering: a name
 * must change it, and a step must not.
 */
async function exercisePlayer(page) {
  const clock = () => page.evaluate(playerClock);
  const state = () => page.evaluate(playerState);
  const steps = [];
  /** A press on `selector` while the clock is stopped: the clock must move
   *  the way `ahead` says, and the name checked must stay as it was. */
  const stepsTo = async (name, selector, ahead) => {
    const before = await state();
    await page.click(selector);
    await sleep(PRESS_MS);
    const after = await state();
    const moved = ahead ? clockSeconds(after.clock) > clockSeconds(before.clock)
      : clockSeconds(after.clock) < clockSeconds(before.clock);
    const kept = after.checked !== null && after.checked === before.checked;
    steps.push({ name, ok: moved && kept,
      saw: `${before.clock} to ${after.clock}, ${before.checked}${kept ? " kept" : ` became ${after.checked}`}` });
  };

  // While the prelude plays, every pass draws the same picture: the name must
  // take the clock out of it, to the first season of that name's pass.
  {
    const second = '#player-modes [role="radio"]:nth-child(2)';
    const before = await state();
    const want = await page.locator(second).textContent();
    await page.click(second);
    const landed = (s) => s.checked === want && clockSeconds(s.clock) >= FIRST_SEASON_S;
    const by = Date.now() + MOVE_MS;
    let after = await state();
    while (!landed(after) && Date.now() < by) {
      await sleep(POLL_MS);
      after = await state();
    }
    const ok = landed(after) && after.checked !== before.checked;
    steps.push({ name: "the second name changes the rendering", ok,
      saw: `${before.checked} at ${before.clock} to ${after.checked} at ${after.clock}` });
  }
  /** The clock must keep one reading for HOLD_MS. */
  const stops = async (name) => {
    await sleep(PRESS_MS);
    const a = await clock();
    await sleep(HOLD_MS);
    const b = await clock();
    steps.push({ name, ok: a !== null && a === b, saw: a === b ? `held at ${a}` : `went from ${a} to ${b}` });
    return b;
  };
  /** The clock must leave `from` within MOVE_MS. */
  const moves = async (name, from) => {
    const by = Date.now() + MOVE_MS;
    let now = await clock();
    while (now === from && Date.now() < by) {
      await sleep(POLL_MS);
      now = await clock();
    }
    steps.push({ name, ok: now !== null && now !== from, saw: now !== from ? `${from} to ${now}` : `still ${now}` });
    return now;
  };

  await page.click("#player-play");
  const paused = await stops("play stops the clock");
  await page.click("#player-play");
  await moves("play starts it again", paused);
  await page.keyboard.press("Space");
  const still = await stops("Space stops it");
  const box = await page.locator("#player-scrub").boundingBox();
  if (!box) {
    steps.push({ name: "a click on the scrub moves it", ok: false, saw: "the scrub has no box" });
  } else {
    await page.mouse.click(box.x + box.width * SCRUB_AT, box.y + box.height / 2);
    await sleep(PRESS_MS);
    const landed = await clock();
    steps.push({ name: "a click on the scrub moves it", ok: landed !== null && landed !== still,
      saw: landed !== still ? `${still} to ${landed}` : `still ${landed}` });
    await stepsTo("next moves it on", "#player-next", true);
    await stepsTo("previous moves it back", "#player-prev", false);
    const stepped = await clock();
    await page.keyboard.press("Space");
    await moves("Space starts it again", stepped);
  }
  return steps;
}

/** Sent to the page as source: the rail, as a presenter would find it. */
function lookAtRail() {
  const nav = document.getElementById("nav");
  return {
    shown: nav !== null && !nav.hidden && getComputedStyle(nav).display !== "none",
    buttons: nav ? nav.querySelectorAll("button").length : 0,
  };
}

/** Sent to the page as source: the canvas, read through a small copy. */
function readback(columns) {
  const plate = document.getElementById("plate");
  if (!(plate instanceof HTMLCanvasElement)) return { canvas: null };
  const ground = getComputedStyle(document.documentElement).getPropertyValue("--ground").trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(ground);
  const canvas = [plate.width, plate.height];
  if (!hex) return { canvas, ground, groundMax: null };
  const groundMax = Math.max(...[0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)));
  const w = Math.min(plate.width, columns);
  const h = Math.max(1, Math.round((plate.height * w) / plate.width));
  const copy = document.createElement("canvas");
  copy.width = w;
  copy.height = h;
  const c = copy.getContext("2d", { willReadFrequently: true });
  // Sampled, not averaged: a thin bright line blended with the ground around
  // it could fall under the threshold it is above on the canvas itself.
  c.imageSmoothingEnabled = false;
  c.drawImage(plate, 0, 0, w, h);
  const d = c.getImageData(0, 0, w, h).data;
  let lit = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (Math.max(d[i], d[i + 1], d[i + 2]) > groundMax + 1) lit++;
  }
  return { canvas, ground, groundMax, lit, share: lit / (w * h) };
}

const pathOf = (address) => `/${address}`;

/** One load of one address at one size: the facts `judge` decides from. */
async function watch(browser, size, address, spoil) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: size.deviceDpr,
  });
  const page = await context.newPage();
  const facts = {
    pageErrors: [], consoleErrors: [], fault: null, startupHidden: true, startupText: null,
    rail: null, degraded: null, ink: null, door: null, overviewDoor: null, player: null,
  };
  page.on("pageerror", (e) => facts.pageErrors.push(String(e).split("\n")[0]));
  page.on("console", (m) => { if (m.type() === "error") facts.consoleErrors.push(m.text().split("\n")[0]); });
  try {
    if (spoil) await spoil(page);
    const startupBy = Date.now() + STARTUP_MS;
    try {
      await page.goto(`${origin}${pathOf(address)}`, { waitUntil: "domcontentloaded", timeout: STARTUP_MS });
    } catch (e) {
      throw new Error(`${pathOf(address)} did not open: ${String(e).split("\n")[0]}`);
    }
    let seen;
    for (;;) {
      seen = await page.evaluate(look);
      facts.degraded ??= seen.degraded;
      if (seen.fault !== null || seen.startupHidden || Date.now() > startupBy) break;
      await sleep(POLL_MS);
    }
    if (seen.fault !== null) {
      facts.fault = seen.fault;
      return facts;
    }
    facts.startupHidden = seen.startupHidden;
    facts.startupText = seen.startupText;

    if (new URLSearchParams(address).has("talk")) {
      facts.rail = await page.evaluate(lookAtRail);
      await page.keyboard.press("Space");
    }

    const inkBy = Date.now() + INK_MS;
    for (;;) {
      facts.ink = await page.evaluate(readback, READBACK_WIDTH);
      if (facts.ink.lit > 0 || Date.now() > inkBy) break;
      await sleep(POLL_MS);
    }

    // Ink is not the end of the load: stay, and keep looking, while the page
    // goes on drawing. A page that never drew has been watched long enough.
    const settleBy = Date.now() + (facts.ink.lit > 0 ? SETTLE_MS : 0);
    let end;
    for (;;) {
      end = await page.evaluate(look);
      facts.degraded ??= end.degraded;
      if (end.fault !== null || Date.now() >= settleBy) break;
      await sleep(POLL_MS);
    }
    if (end.fault !== null) {
      facts.fault = end.fault;
      return facts;
    }
    facts.door = end.door;
    facts.overviewDoor = end.overviewDoor;

    // The player is worked only once it has settled, and looked at once more
    // after, so a fault its transport raised is refused as a fault.
    if (new URLSearchParams(address).get("experience") === "player") {
      const shown = await page.evaluate(lookAtPlayer);
      facts.player = { shown, fullCanvas: null, steps: shown.panel ? await exercisePlayer(page) : [] };
      const after = await page.evaluate(look);
      if (after.fault !== null) facts.fault = after.fault;
    }
    return facts;
  } finally {
    await context.close();
  }
}

const sizeOf = (s) => `${s.width}x${s.height} at ${s.deviceDpr}`;
const pad = Math.max(...[...ADDRESSES, ...SEEDS.map((s) => s.address)].map((a) => pathOf(a).length));

function loadLine(address, size, facts) {
  const ink = facts.ink;
  const canvas = ink?.canvas ? `canvas ${ink.canvas.join("x")}` : "no canvas";
  // Two significant figures: the first look that finds ink often finds a few
  // pixels of it, which a fixed number of places would print as nothing.
  const lit = ink?.share === undefined ? "lit -"
    : `lit ${ink.share === 0 ? "0" : (ink.share * 100).toPrecision(2)}%`;
  return `${pathOf(address).padEnd(pad)}  ${sizeOf(size)}  ${canvas}  ${lit}`
    + `${facts.overviewDoor !== null ? `  door "${facts.overviewDoor}"` : ""}`
    + `${facts.door !== null ? `  door "${facts.door}"` : ""}`;
}

const { chromium } = await import("playwright");
await waitForServer(30_000);
// The same flags the probes, the shots and the playback pass: under software
// rasterisation the page is not the one a visitor's machine draws.
const browser = await chromium.launch({
  channel: "chrome",
  headless,
  args: ["--use-gl=angle", "--enable-gpu-rasterization", "--ignore-gpu-blocklist"],
});
console.log(`smoke: chrome ${browser.version()}, ${headless ? "headless" : "headed"}, ${origin}; `
  + `sizes ${SIZES.map(sizeOf).join(", ")}`);

let refused = 0;
let loads = 0;
try {
  for (const size of SIZES) {
    /** Each load's canvas at this size, by address. */
    const canvases = new Map();
    for (const address of ADDRESSES) {
      const facts = await watch(browser, size, address);
      canvases.set(address, facts.ink?.canvas ?? null);
      if (facts.player) facts.player.fullCanvas = canvases.get(FULL_WORK) ?? null;
      const refusals = judge(facts);
      loads++;
      if (refusals.length) refused++;
      console.log(`smoke: ${loadLine(address, size, facts)}  ${refusals.length ? "REFUSED" : "ok"}`);
      for (const s of facts.player?.steps ?? []) console.log(`         ${s.ok ? "ok" : "NO"}  ${s.name}: ${s.saw}`);
      for (const r of refusals) console.log(`         ${r.condition}: ${r.detail}`);
    }
  }

  const seeded = [];
  for (const seed of SEEDS) {
    const facts = await watch(browser, SIZES[0], seed.address, seed.spoil);
    const refusals = judge(facts);
    seeded.push({ seed, refusals });
    const got = refusals.map((r) => r.condition);
    const own = got.length === 1 && got[0] === seed.expect;
    console.log(`smoke: seeded failure: ${seed.name}`);
    console.log(`         ${loadLine(seed.address, SIZES[0], facts)}`);
    for (const r of refusals) console.log(`         ${r.condition}: ${r.detail}`);
    console.log(`         ${!got.length ? `LET THROUGH, where it must be refused for ${seed.expect}`
      : own ? `caught for ${seed.expect}, its own reason`
        : `refused for [${got.join(", ")}], NOT for [${seed.expect}] alone`}`);
  }
  const problems = seedProblems(seeded);
  for (const p of problems) console.log(`smoke: ${p}`);

  if (refused || problems.length) {
    console.log(`SMOKE RED: ${refused} of ${loads} loads refused, ${problems.length} of ${SEEDS.length} `
      + "seeded failures not caught for their own reason alone");
    process.exitCode = 1;
  } else {
    console.log(`SMOKE GREEN: ${loads} loads, ${SEEDS.length} seeded failures each caught`);
  }
} catch (e) {
  console.error(`smoke: ${String(e).split("\n")[0]}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
