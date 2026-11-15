#!/usr/bin/env node
/**
 * Exact frames, for looking at.
 *
 * NOT a probe and never a gate: the probes compare pixels and this makes
 * pictures for a person. It exists because a screenshot grabbed off the running
 * clock is not a comparison at all — a paint balance has already been
 * mis-diagnosed that way — and because "capture the same instant in two builds"
 * is otherwise done by hand, every time.
 *
 * It drives `renderTo` directly at an exact `t` onto a fixed offscreen surface,
 * the same way the purity probe does, so two runs of the same list are
 * comparable frame for frame.
 *
 *   node scripts/shots.mjs --out docs/shots/census \
 *        --shots "census@32,census@152,census@376"
 *   node scripts/shots.mjs --list prelude          # a named set
 *
 * `--width/--height/--dpr` fix the surface. `--display room` exercises the
 * projector-distance profile and `--stop plate.shell` addresses the semantic
 * score without copying its numeric second.
 *
 * `--dpr bounded` draws at the ratio the full work would use for this viewport
 * on a display of `--device-dpr` (two unless said). A plain ratio is not
 * bounded by the piece's pixel budget, so above a certain viewport it makes a
 * frame nobody is ever shown; a frame to be JUDGED is taken bounded.
 *
 *   --shots "plate@settled:2004"     a season at rest, by its starting year
 *   --strip plate@243:275:0.5        a run of instants: from, to, step
 *   --stats                          writes <frame>.json beside each PNG: the
 *                                    instant, the ratio, and what the frame
 *                                    weighs (lit share, mean, peak)
 *   --exact                          the destination pinned to the software
 *                                    rasteriser, which takes the browser's own
 *                                    run-to-run wobble out of most frames. For
 *                                    comparing files, not for looking - it is
 *                                    not how the piece renders on a screen.
 *                                    Layers the renderer caches are still drawn
 *                                    accelerated, so a passage built from them
 *                                    can differ by a level in a few channels
 *                                    between two runs: check with --against
 *                                    before reading two files as one
 *   --against <dir>                  after shooting, says how many channels
 *                                    each frame differs by from the same-named
 *                                    frame in <dir>, and by how much at most
 *
 * `--against` reports and never fails: whether a difference matters is for the
 * person looking at the two frames, which is what `sheet.mjs` is for.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");

/** Named sets, so a recurring comparison is a word rather than a paste. */
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

function die(msg) {
  console.error(`shots: ${msg}`);
  process.exit(1);
}

/** Every flag read here. One outside both lists, or a valued one given bare,
 *  would otherwise be dropped in silence and the run filed as if it had been
 *  obeyed. */
const VALUED = ["shots", "list", "strip", "out", "width", "height", "dpr", "device-dpr",
  "port", "display", "stop", "candidate", "against"];
const SWITCHES = ["talk", "stats", "exact"];

/** An instant as it may be written: plain seconds, so that the name a frame
 *  is filed under is the instant it was asked for and two runs pair by it. */
const PLAIN_SECONDS = /^\d+(\.\d+)?$/;

/** `mode@from:to:step`, or `mode:ops@from:to:step`, as a list of shots. */
function stripOf(spec) {
  const [where, span = "", ...rest] = String(spec).split("@");
  const fields = span.split(":");
  const [from, to, step] = fields.map(Number);
  if (!where || rest.length || fields.length !== 3 || !fields.every((f) => PLAIN_SECONDS.test(f))
    || !(step > 0) || to < from) {
    die(`--strip is mode@from:to:step in plain seconds, with a step above zero: ${spec}`);
  }
  const out = [];
  // Counted, not accumulated: a sum of steps drifts, and the drift would be in
  // the file names two runs are paired by.
  const n = Math.floor((to - from) / step + 1e-9);
  for (let i = 0; i <= n; i++) out.push(`${where}@${Number((from + i * step).toFixed(6))}`);
  // A step finer than a name can say would file two instants under one name,
  // and the second would overwrite the first.
  if (new Set(out).size !== out.length) die(`--strip steps finer than a file name can say: ${spec}`);
  return out;
}

const flags = parseArgs(process.argv.slice(2));
for (const [k, v] of Object.entries(flags)) {
  if (v === true && VALUED.includes(k)) die(`--${k} needs a value`);
  if (v !== true && SWITCHES.includes(k)) die(`--${k} takes no value (got ${v})`);
  if (!VALUED.includes(k) && !SWITCHES.includes(k)) die(`no such flag: --${k}`);
}
if (flags.list !== undefined && !LISTS[flags.list]) {
  die(`no such list: ${flags.list} (have ${Object.keys(LISTS).join(", ")})`);
}
if (["shots", "list", "strip"].filter((k) => flags[k] !== undefined).length > 1) {
  die("--shots, --list and --strip each name the frames: give one");
}
if (flags.display !== undefined && !["near", "room"].includes(flags.display)) {
  die(`no such display: ${flags.display} (have near, room)`);
}
const shots = (flags.strip ? stripOf(flags.strip)
  : flags.shots ? String(flags.shots).split(",") : LISTS[flags.list] ?? LISTS.hands)
  .map((s) => s.trim()).filter(Boolean);
const outDir = resolve(REPO, String(flags.out ?? "docs/shots"));
const width = Number(flags.width ?? 1512);
const height = Number(flags.height ?? 852);
const dpr = flags.dpr === "bounded" ? "bounded" : Number(flags.dpr ?? 2);
const deviceDpr = Number(flags["device-dpr"] ?? 2);
if (dpr !== "bounded" && !(dpr > 0)) die(`--dpr is a ratio or "bounded": ${flags.dpr}`);
if (flags["device-dpr"] !== undefined && dpr !== "bounded") {
  die("--device-dpr is the display a bounded ratio is worked out for: give it with --dpr bounded");
}
if (!(width > 0) || !(height > 0) || !(deviceDpr > 0)) die("the surface is not a size");
const port = Number(flags.port ?? 5173);
const exact = Boolean(flags.exact);
const stats = Boolean(flags.stats);
const againstDir = flags.against ? resolve(REPO, String(flags.against)) : null;
if (againstDir && !existsSync(againstDir)) die(`--against: no such directory: ${againstDir}`);
const talk = Boolean(flags.talk);
const display = flags.display ? String(flags.display) : undefined;
const semanticStop = flags.stop ? String(flags.stop) : undefined;
// A candidate composition (see src/modes/types.ts:Frame.candidate).
// Applies to every shot in the run; the filename says so.
const candidate = flags.candidate ? String(flags.candidate) : null;

/** A shot's address, read before anything is launched: a list with one bad
 *  instant in it should cost a second, not the frames before it. */
function parseShot(spec) {
  const [where, at = ""] = spec.split("@");
  const [mode, ops = ""] = where.split(":");
  const settled = /^settled:(\d+)$/.exec(at);
  const t = Number(at);
  if (!mode) die(`not a shot: ${spec}`);
  if (!settled && !semanticStop && !PLAIN_SECONDS.test(at)) {
    die(`not an instant: ${spec} (mode@seconds, mode@settled:<year>, or --stop)`);
  }
  return { spec, mode, ops, t: settled ? undefined : t, at,
           settled: settled ? Number(settled[1]) : undefined };
}
const parsed = shots.map(parseShot);

/** The name two runs of one list share, whatever candidate either was shot
 *  with. `sheet.mjs` pairs by the same rule. */
function pairKey(file) {
  return file.replace(/-cand-.+?(?=(?:-near|-room)?-(?:stop-[^/]*|settled-\d+|-?\d[\d_]*)\.png$)/, "");
}

const { chromium } = await import("playwright");
await waitForServer(`http://localhost:${port}/`, 30_000);
// The same GPU flags probe-run.mjs passes: under software rasterisation the
// paint renders markedly darker, so a frame captured here would misrepresent
// what a viewer sees. SHOTS_HEADED=1 opens a visible window for comparison.
const browser = await chromium.launch({
  channel: "chrome",
  headless: process.env.SHOTS_HEADED !== "1",
  args: ["--use-gl=angle", "--enable-gpu-rasterization", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

// `?probe=shots` is not a probe the runner knows; main.ts returns on any probe
// value after loading, which is exactly what is wanted — the piece loaded, the
// rAF loop never started, and nothing is animating while frames are taken.
await page.goto(`http://localhost:${port}/?probe=shots`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__probeDone !== undefined, null, { timeout: 120_000 });

// What was asked, held against what this page can do and what it resolves each
// address to - before a frame is written. A page from before a flag existed
// ignores it without complaint: a settled season is drawn as second zero and
// an exact frame is drawn accelerated, each under the name of what was asked.
const able = await page.evaluate(() => ({
  facts: typeof window.__shotFacts === "function",
  diff: typeof window.__diffPng === "function",
}));
const fresh = [
  dpr === "bounded" && "--dpr bounded", exact && "--exact", stats && "--stats",
  parsed.some((p) => p.settled !== undefined) && "a settled season",
].filter(Boolean);
const stop = async (msg) => { await browser.close(); die(msg); };
if (!able.facts && fresh.length) {
  await stop(`the page on port ${port} is older than ${fresh.join(", ")} and would ignore it`);
}
if (againstDir && !able.diff) {
  await stop(`the page on port ${port} cannot compare two frames: shoot it plainly, and give `
    + "--against to the run on the newer page");
}
const requestOf = ({ mode, ops, t, settled }) => ({
  mode, t, stop: semanticStop, settled, width, height, dpr, deviceDpr, exact, talk, ops,
  display, candidate: candidate ?? undefined,
});
if (able.facts) {
  for (const p of parsed) {
    try {
      await page.evaluate((r) => window.__shotFacts(r), requestOf(p));
    } catch (e) {
      await stop(`${p.spec}: ${String(e).split("\n")[0].replace(/^Error: page\.evaluate: /, "")}`);
    }
  }
}

mkdirSync(outDir, { recursive: true });
const written = [];
for (const shot of parsed) {
  const { spec, mode, ops, at, settled } = shot;
  // `hand@t` as before, and `stack:lci@t` for THE STACK — the operations after
  // the colon are the same token `?ops=` takes, so a filename says exactly what
  // configuration produced the picture.
  const request = requestOf(shot);
  const take = () => page.evaluate((r) => window.__shot(r), request);
  let dataUrl;
  try {
    dataUrl = await take();
  } catch (e) {
    // A 42-shot batch twice died on its FIRST frame with a non-finite drawPin
    // gradient, then never again — a nondeterministic race, not a bad t. One
    // retry distinguishes the two: a race passes on the
    // second attempt (loudly, so the flake stays visible in the log), a real
    // defect fails twice and still kills the run.
    console.error(`shots: ${spec} threw once (${e}); retrying that frame`);
    try {
      dataUrl = await take();
    } catch (again) {
      await stop(`${spec} threw twice: ${String(again).split("\n")[0]}`);
    }
  }
  const position = semanticStop ? `stop-${semanticStop.replace(/[^a-z0-9-]+/gi, "-")}`
    : settled !== undefined ? `settled-${settled}` : at.replace(".", "_");
  const name = `${mode}${ops ? `-${ops}` : ""}${candidate ? `-cand-${candidate}` : ""}`
    + `${display ? `-${display}` : ""}-${position}.png`;
  writeFileSync(join(outDir, name), Buffer.from(dataUrl.split(",")[1], "base64"));
  written.push({ name, dataUrl });
  console.log(`shots: ${join(outDir, name).replace(`${REPO}/`, "")}`);
  if (stats) {
    // The same request drawn once more and weighed, on the rasteriser the
    // picture was taken on, with what the surface came out at.
    const facts = await page.evaluate(async (r) => ({
      ...window.__shotFacts(r), ...(await window.__frameStats(r)),
    }), request);
    writeFileSync(join(outDir, name.replace(/\.png$/, ".json")), `${JSON.stringify({
      spec, width, height, deviceDpr: dpr === "bounded" ? deviceDpr : null, exact, ...facts,
    }, null, 2)}\n`);
  }
}

if (againstDir) {
  // Paired by name with the candidate infix left out, so a default run and a
  // candidate run of one list line up. Compared in the page, which already
  // holds the one pixel-difference rule every verdict uses.
  const theirs = new Map(readdirSync(againstDir).filter((f) => f.endsWith(".png"))
    .map((f) => [pairKey(f), f]));
  console.log(`shots: against ${againstDir.replace(`${REPO}/`, "")}`);
  for (const { name, dataUrl } of written) {
    const other = theirs.get(pairKey(name));
    if (!other) {
      console.log(`  ${name}: no such frame there`);
      continue;
    }
    const theirUrl = `data:image/png;base64,${readFileSync(join(againstDir, other)).toString("base64")}`;
    const d = await page.evaluate(([a, b]) => window.__diffPng(a, b), [dataUrl, theirUrl]);
    console.log(d.comparable
      ? `  ${name}: ${d.channels === 0 ? "identical"
        : `${d.channels} channels differ (${(d.share * 100).toFixed(3)}%), max delta ${d.maxDelta}`}`
      : `  ${name}: not the same size (${d.a.join("x")} here, ${d.b.join("x")} there)`);
  }
}
await browser.close();
if (errors.length) {
  console.error(`shots: uncaught page errors: ${errors.join(" | ")}`);
  process.exit(1);
}
