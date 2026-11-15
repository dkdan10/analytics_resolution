#!/usr/bin/env node
/**
 * Two sets of exact frames, one pair at a time, for a person to judge.
 *
 * NOT a probe and never a gate. `shots.mjs` makes the pictures; this lays two
 * runs of the same list over each other so that the only thing that changes
 * when a key is pressed is the thing being judged.
 *
 * A frame is shown at one image pixel per device pixel and never scaled: the
 * piece is judged on a laptop display at its own size, and a thumbnail, a
 * side-by-side at half width, or a browser-zoomed image is a different picture.
 * When the window is too small to show a frame whole the page says so rather
 * than shrinking it. The footer prints the window this was viewed in, because a
 * judgement about a frame is only as good as the surface it was made on.
 *
 * Both arms are labelled. Nothing here is blind and nothing is tallied: the
 * verdict is the viewer's, in their own words.
 *
 *   node scripts/sheet.mjs --a docs/shots/before --b docs/shots/after \
 *        [--label-a master] [--label-b branch] [--out docs/shots/after/sheet.html]
 *
 * Frames pair by file name. A candidate run's `-cand-<token>` infix is ignored
 * when pairing, so a default run and a candidate run of the same list line up.
 * A `<frame>.json` beside a PNG (written by `shots.mjs --stats`) is printed
 * under that frame.
 *
 *   Space or click   swap arms          1 / 2   show one arm
 *   Left / Right     previous / next    Home    first pair
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");

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

function die(msg) {
  console.error(`sheet: ${msg}`);
  process.exit(1);
}

/** The name two runs of one list share, whatever candidate either was shot with. */
function pairKey(file) {
  return file.replace(/-cand-.+?(?=(?:-near|-room)?-(?:stop-[^/]*|settled-\d+|-?\d[\d_]*)\.png$)/, "");
}

function framesIn(dir) {
  if (!existsSync(dir)) die(`no such directory: ${dir}`);
  const byKey = new Map();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".png")).sort()) {
    const key = pairKey(file);
    if (byKey.has(key)) die(`${dir} holds two frames for ${key}; shoot one run per directory`);
    const statsPath = join(dir, file.replace(/\.png$/, ".json"));
    let stats = null;
    if (existsSync(statsPath)) {
      try { stats = JSON.parse(readFileSync(statsPath, "utf8")); } catch { stats = null; }
    }
    byKey.set(key, { file, stats });
  }
  return byKey;
}

const flags = parseArgs(process.argv.slice(2));
if (!flags.a || !flags.b) {
  die("usage: sheet.mjs --a <dir> --b <dir> [--label-a text] [--label-b text] [--out file.html]");
}
const dirA = resolve(REPO, String(flags.a));
const dirB = resolve(REPO, String(flags.b));
const out = resolve(REPO, String(flags.out ?? join(String(flags.b), "sheet.html")));
const labelA = String(flags["label-a"] ?? basename(dirA));
const labelB = String(flags["label-b"] ?? basename(dirB));

const a = framesIn(dirA);
const b = framesIn(dirB);
const keys = [...a.keys()].filter((k) => b.has(k));
const onlyA = [...a.keys()].filter((k) => !b.has(k));
const onlyB = [...b.keys()].filter((k) => !a.has(k));
if (keys.length === 0) die("the two directories share no frame name; nothing to pair");

const outDir = dirname(out);
mkdirSync(outDir, { recursive: true });
const rel = (dir, file) => relative(outDir, join(dir, file)).split("\\").join("/");
const pairs = keys.map((key) => ({
  key: key.replace(/\.png$/, ""),
  a: { src: rel(dirA, a.get(key).file), stats: a.get(key).stats },
  b: { src: rel(dirB, b.get(key).file), stats: b.get(key).stats },
}));

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]
));

const html = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(labelA)} / ${esc(labelB)}</title>
<style>
  html, body { margin: 0; height: 100%; background: #0b0a09; color: #b8b2a6; overflow: hidden;
    font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
  #stage { position: fixed; inset: 0; display: grid; place-items: center; cursor: pointer; }
  #stage img { display: block; image-rendering: auto; }
  #stage img[hidden] { display: none; }
  .bar { position: fixed; left: 0; right: 0; padding: 6px 12px; background: rgba(11, 10, 9, 0.82);
    display: flex; gap: 18px; align-items: baseline; white-space: nowrap; pointer-events: none; }
  #top { top: 0; }
  #bottom { bottom: 0; justify-content: space-between; }
  #arm { color: #f2ede2; min-width: 12ch; }
  #warn { color: #e0a43a; }
  #warn:empty { display: none; }
</style>
<div id="stage"><img id="img-a" alt=""><img id="img-b" alt="" hidden></div>
<div class="bar" id="top">
  <span id="arm"></span><span id="name"></span><span id="count"></span><span id="stats"></span>
</div>
<div class="bar" id="bottom">
  <span id="keys">SPACE SWAP · 1 2 ARM · ←→ PAIR</span>
  <span id="warn"></span>
  <span id="surface"></span>
</div>
<script>
const PAIRS = ${JSON.stringify(pairs)};
const LABELS = ${JSON.stringify({ a: labelA, b: labelB })};
const UNPAIRED = ${JSON.stringify({ a: onlyA, b: onlyB })};
const $ = (id) => document.getElementById(id);
const imgs = { a: $("img-a"), b: $("img-b") };
let at = 0;
let arm = "a";

function fit() {
  // One image pixel per device pixel, whatever this display's ratio is.
  const dpr = window.devicePixelRatio || 1;
  let cropped = false;
  for (const k of ["a", "b"]) {
    const im = imgs[k];
    if (!im.naturalWidth) continue;
    im.style.width = im.naturalWidth / dpr + "px";
    im.style.height = im.naturalHeight / dpr + "px";
    if (im.naturalWidth / dpr > innerWidth + 0.5 || im.naturalHeight / dpr > innerHeight + 0.5) {
      cropped = true;
    }
  }
  const shown = imgs[arm];
  $("warn").textContent = cropped
    ? "WINDOW SMALLER THAN THE FRAME (" + Math.round(shown.naturalWidth / dpr) + " × "
      + Math.round(shown.naturalHeight / dpr) + ") — ENLARGE IT; THE FRAME IS NOT SCALED"
    : "";
  $("surface").textContent = innerWidth + " × " + innerHeight + " @ " + dpr;
}

function statsLine(s) {
  if (!s) return "";
  return Object.entries(s)
    .filter(([, v]) => typeof v === "number")
    .map(([k, v]) => k + " " + (Number.isInteger(v) ? v : v.toFixed(3)))
    .join("   ");
}

function show() {
  const p = PAIRS[at];
  imgs.a.hidden = arm !== "a";
  imgs.b.hidden = arm !== "b";
  $("arm").textContent = (arm === "a" ? "A · " : "B · ") + LABELS[arm];
  $("name").textContent = p.key;
  $("count").textContent = (at + 1) + " / " + PAIRS.length;
  $("stats").textContent = statsLine(p[arm].stats);
  fit();
}

function load() {
  const p = PAIRS[at];
  imgs.a.src = p.a.src;
  imgs.b.src = p.b.src;
  show();
}

for (const k of ["a", "b"]) imgs[k].addEventListener("load", fit);
addEventListener("resize", fit);
$("stage").addEventListener("click", () => { arm = arm === "a" ? "b" : "a"; show(); });
addEventListener("keydown", (e) => {
  if (e.key === " ") { arm = arm === "a" ? "b" : "a"; show(); e.preventDefault(); }
  else if (e.key === "1") { arm = "a"; show(); }
  else if (e.key === "2") { arm = "b"; show(); }
  else if (e.key === "ArrowRight") { at = (at + 1) % PAIRS.length; load(); }
  else if (e.key === "ArrowLeft") { at = (at + PAIRS.length - 1) % PAIRS.length; load(); }
  else if (e.key === "Home") { at = 0; load(); }
});
if (UNPAIRED.a.length || UNPAIRED.b.length) {
  console.warn("frames without a partner", UNPAIRED);
}
load();
</script>
`;

writeFileSync(out, html);
console.log(`sheet: ${pairs.length} pair(s) -> ${out.replace(`${REPO}/`, "")}`);
if (onlyA.length) console.log(`sheet: only in A (${labelA}): ${onlyA.join(", ")}`);
if (onlyB.length) console.log(`sheet: only in B (${labelB}): ${onlyB.join(", ")}`);
