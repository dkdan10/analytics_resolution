#!/usr/bin/env node
/**
 * The address table: which entry each query string opens, and the arithmetic
 * that carries a loop time to a chosen pass.
 *
 * `site/src/route.ts:entryOf` decides what every address serves, the bare one
 * included, and the bare one is where the public arrives. This holds it to a
 * table written here, row by row.
 *
 * THE LANDING IS PINNED. The table's bare rows read EXPECT_LANDING below, not
 * the module's own LANDING, and the first row asserts the two agree. A check
 * that followed the constant would stay green through an accidental change of
 * what `/` serves; this one turns red on it. Moving the landing is two edits
 * made together on purpose: the constant in route.ts and the pin here.
 *
 * THE LIFT. `toPass` must put a local into the pass it was asked for and never
 * a hair before it: a time that folds back just below a stop's start draws the
 * last frame of the span before it, with no error anywhere. So for every pass
 * of the rotation, over a grid of the loop and a seeded set of locals at full
 * float precision, the lifted time must stay in its pass, fold back to no less
 * than its local, and overshoot by no more than a few units in the last place.
 * The loop's length is read from data/processed/facts.json and the pass count
 * from the ROTATION declaration in site/src/modes/index.ts, which imports too
 * much to load here. The fold and the pass are recomputed as timeline.ts
 * writes them, not taken from route.ts, so a wrong fold cannot agree with
 * itself. A local before the loop must lift as its start does, and every
 * lifted time must read back through `passLocal` as that same pass and fold.
 *
 * THE STEP. `stepFrom` walks a small fixed list of stops: forward, back, both
 * wraps, and from a hair before a stop.
 *
 * THE RAIL'S MARGINS. route.ts keeps its own copies of two margins the rail
 * writes inline: how far ahead a stop counts as reached (the stop walk in
 * main.ts) and how far short of the loop's end a seek stops (navigator.ts).
 * `stepFrom` walks as the rail walks only while the copies agree, so both are
 * read from those files' text here and compared.
 *
 * THE CHECK IS SHOWN FAILING ON EVERY RUN. Each seeded defect below is written
 * into a copy of route.ts's own text, loaded the same way, and must be refused
 * by exactly the rows it breaks and no other. A defect let through, one
 * refused for the wrong rows, and one that no longer applies to the source are
 * each a failure of this check.
 *
 * THERE IS NO CLOCK ON THIS CHECK. A `toPass` that loses its bound on turns
 * does not turn it red: the copy with no end clamp then folds below its local
 * for ever, and the run hangs there.
 *
 * Dependency-free, and loaded as zone-gate.mjs loads zone.ts: Node strips the
 * types itself where it can, and esbuild (which vite brings) does it otherwise.
 * route.ts imports nothing, which is what lets a copy of it load on its own.
 *
 *   npm run check:routes    this file alone
 *   npm run gate            with the zone parity gate; npm test and the build run it
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, "../src/route.ts");
const MODES = resolve(here, "../src/modes/index.ts");
const MAIN = resolve(here, "../src/main.ts");
const NAVIGATOR = resolve(here, "../src/navigator.ts");
const FACTS = resolve(here, "../../data/processed/facts.json");

/** What the bare address must serve. Changed only together with LANDING. */
const EXPECT_LANDING = "overview";

/** The landing's place in the table: a row that reads EXPECT_LANDING. */
const L = Symbol("the landing");

/** Query string -> the entry it must open. */
const TABLE = [
  ["", L],
  ["experience=overview", "overview"],
  ["experience=full", "canonical"],
  ["experience=player", L],
  ["experience=bogus", L],
  ["experience=FULL", L],
  ["experience=bogus&experience=overview", L],
  ["experience=bogus&experience=full", L],
  ["talk", "canonical"],
  ["talk&experience=overview", "canonical"],
  ["Talk", L],
  ["nav", "canonical"],
  ["nav=0", "canonical"],
  ["probe=purity", "canonical"],
  ["probe=", "canonical"],
  ["t=300", "canonical"],
  ["t=abc", "canonical"],
  ["t=", "canonical"],
  ["year=2004", "canonical"],
  ["stop=hand.close", "canonical"],
  ["mode=field", "canonical"],
  ["mode", "canonical"],
  ["mode=hand&stop=hand.close", "canonical"],
  ["ops=lci", "canonical"],
  ["experience=overview&t=5", "overview"],
  ["experience=full&display=room", "canonical"],
  ["display=room", L],
  ["autoplay=1", L],
];

const PIN_ROW = "the landing";
const addressOf = (query) => (query ? `/?${query}` : "/");
const LANDING_ROWS = TABLE.filter(([, want]) => want === L).map(([query]) => addressOf(query));
/** The landing a seeded defect moves to: whichever one the pin does not name. */
const OTHER_LANDING = EXPECT_LANDING === "overview" ? "player" : "overview";

/** A TypeScript module by path, as zone-gate.mjs loads zone.ts. */
async function loadTs(file) {
  try {
    return { mod: await import(pathToFileURL(file).href), via: "node type-stripping" };
  } catch {
    const { transformSync } = await import("esbuild");
    const js = transformSync(await readFile(file, "utf8"), { loader: "ts", format: "esm" }).code;
    const url = `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
    return { mod: await import(url), via: "esbuild" };
  }
}

const problems = [];

const { mod: route, via } = await loadTs(SRC);

// --- the loop the lift is checked over ------------------------------------------

/** One loop's length in seconds, as the pipeline derived it. */
const D = JSON.parse(await readFile(FACTS, "utf8")).derived?.["loop.seconds"]?.value;
if (!(Number.isFinite(D) && D > 0)) problems.push(`facts.json gives no loop length (got ${D})`);
const rotation = /const ROTATION: ModeId\[\] = \[([^\]]*)\];/.exec(await readFile(MODES, "utf8"));
/** The rotation's length: one pass of the loop per hand. */
const PASSES = rotation ? (rotation[1].match(/"[a-z]+"/g) ?? []).length : 0;
if (!(PASSES > 0)) problems.push("the ROTATION declaration in modes/index.ts was not found");

/** The fold and the pass, written as timeline.ts:stateAt and passAt write them. */
const foldAsRendered = (t) => ((t % D) + D) % D;
const passAsRendered = (t) => Math.floor(Math.max(0, t) / D);

const GUARD = route.LOOP_END_GUARD_S;
const EDGE = D - GUARD;

/** A seeded generator of doubles at full precision: a grid of round numbers
 *  never needs a lift, so it cannot show one missing. */
function unitSource(seed) {
  let s = seed | 0;
  const u32 = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
  return () => ((u32() >>> 5) * 67108864 + (u32() >>> 6)) / 9007199254740992;
}
const unit = unitSource(20151027);
const LOCALS = [
  ...Array.from({ length: 1000 }, (_, k) => (k * D) / 1000),
  EDGE,
  ...Array.from({ length: 1000 }, () => unit() * EDGE),
];
/** A few units in the last place at the loop's far end: an overshoot no
 *  frame can show, and far below any nudge a person could see. */
const TINY = 4 * PASSES * D * Number.EPSILON;
/** Locals inside the guard and at the loop's end: each must lift as the edge does. */
const PAST_EDGE = [D - GUARD / 2, D];

/** A local before the loop: it must lift as the loop's start does. */
const BEFORE_START = -1;

const liftId = (family, pass, local) => `${family}: pass ${pass}, local ${local}`;
const END_CLAMP_ROWS = [];
for (let pass = 0; pass < PASSES; pass++) {
  for (const local of PAST_EDGE) END_CLAMP_ROWS.push(liftId("end clamp", pass, local));
}

// --- the step -------------------------------------------------------------------

const STOPS = [0, 10, 25, 40];
const HAIR = route.STOP_TOLERANCE_S / 2;
/** name, local, direction, the stop it must land on */
const STEPS = [
  ["step forward from inside a span", 12, 1, 25],
  ["step back from inside a span", 12, -1, 0],
  ["step forward past the last stop wraps to the first", 41, 1, 0],
  ["step back from the first span wraps to the last", 3, -1, 40],
  ["step forward from a hair before a stop", 25 - HAIR, 1, 40],
  ["step back from a hair before a stop", 25 - HAIR, -1, 10],
];
const HAIR_ROWS = STEPS.filter(([name]) => name.includes("hair")).map(([name]) => name);

// --- the rail's own margins -----------------------------------------------------

/** Every number a file's text writes in the place `pattern` captures. */
const written = async (file, pattern) =>
  [...(await readFile(file, "utf8")).matchAll(pattern)].map((m) => Number(m[1]));
/** name, the constant here, the file the rail writes it in, each value written there */
const MARGINS = [
  ["the stop tolerance is the one the rail's stop walk writes", "STOP_TOLERANCE_S", "main.ts",
    await written(MAIN, /starts\[k\]! <= now \+ ([\d.]+)/g)],
  ["the end guard is the one the rail's scrub writes", "LOOP_END_GUARD_S", "navigator.ts",
    await written(NAVIGATOR, /schedule\.duration - ([\d.]+)/g)],
];

// --- the seeded defects ---------------------------------------------------------

/**
 * Defects, each written into route.ts's text. `from` must occur exactly once.
 * `rows` is every row the defect breaks, exactly; `within` names the one family
 * of rows it may break, for a defect whose rows depend on float rounding.
 */
const SEEDS = [
  {
    name: "an entry that forgets probe",
    from: ` || q.has("probe")`,
    to: "",
    rows: ["/?probe=purity", "/?probe="],
  },
  {
    name: "direct keys that lack ops",
    from: `, "ops"]`,
    to: "]",
    rows: ["/?ops=lci"],
  },
  {
    name: "nav=0 read as no nav",
    from: `q.has("nav")`,
    to: `(q.has("nav") && q.get("nav") !== "0")`,
    rows: ["/?nav=0"],
  },
  {
    name: "a landing other than the pinned one",
    from: /LANDING = "\w+" as Landing/g,
    to: `LANDING = "${OTHER_LANDING}" as Landing`,
    rows: [PIN_ROW, ...LANDING_ROWS],
  },
  {
    name: "a lift with no nudge",
    from: "wrapLoop(r, D) < at;",
    to: "false;",
    within: "lift",
  },
  {
    name: "a lift with no end clamp",
    from: "Math.min(Math.max(0, local), D - guard)",
    to: "Math.max(0, local)",
    rows: END_CLAMP_ROWS,
  },
  {
    name: "a pass read as always the first",
    from: "Math.floor(Math.max(0, t) / D) % passes",
    to: "0",
    within: "read back",
  },
  {
    name: "a step with no tolerance",
    from: "local + tolerance",
    to: "local",
    rows: HAIR_ROWS,
  },
];

// --- judging ----------------------------------------------------------------------

/** Every row the module fails, as `{ row, family, detail }`, and what to print. */
function judge(mod) {
  const failures = [];
  const lines = [];
  const fail = (row, family, detail) => failures.push({ row, family, detail });

  const pinned = mod.LANDING === EXPECT_LANDING;
  lines.push({ ok: pinned, row: PIN_ROW, text: `serves ${JSON.stringify(mod.LANDING)}, pinned ${JSON.stringify(EXPECT_LANDING)}` });
  if (!pinned) fail(PIN_ROW, "landing", `LANDING is ${JSON.stringify(mod.LANDING)}`);
  for (const [query, entry] of TABLE) {
    const row = addressOf(query);
    const want = entry === L ? EXPECT_LANDING : entry;
    let got;
    try {
      got = mod.entryOf(new URLSearchParams(query));
    } catch (e) {
      got = `a throw (${e?.message ?? e})`;
    }
    const ok = got === want;
    lines.push({ ok, row, text: ok ? `-> ${got}` : `-> ${got}, expected ${want}` });
    if (!ok) fail(row, "address", `opens ${got}, expected ${want}`);
  }

  // A lift that throws fails its lift row and leaves its pass and near rows
  // unread, so those two count over the lifts that returned.
  const counts = { returned: 0, pass: 0, lift: 0, near: 0, back: 0, clamp: 0, start: 0 };
  let turned = 0;
  for (let pass = 0; pass < PASSES; pass++) {
    for (const local of LOCALS) {
      if (foldAsRendered(pass * D + local) < local) turned++;
      let r;
      try {
        r = mod.toPass(pass, local, D, GUARD);
      } catch (e) {
        fail(liftId("lift", pass, local), "lift", `a throw (${e?.message ?? e})`);
        continue;
      }
      counts.returned++;
      const folded = foldAsRendered(r);
      if (passAsRendered(r) !== pass) fail(liftId("pass", pass, local), "pass", `lands in pass ${passAsRendered(r)}`);
      else counts.pass++;
      if (!(folded >= local)) fail(liftId("lift", pass, local), "lift", `folds to ${folded}, below it by ${local - folded}`);
      else counts.lift++;
      if (!(folded - local <= TINY)) fail(liftId("near", pass, local), "near", `folds to ${folded}, past it by ${folded - local}`);
      else counts.near++;
      const read = mod.passLocal(r, D, PASSES);
      if (read.pass !== passAsRendered(r) % PASSES || read.local !== folded) {
        fail(liftId("read back", pass, local), "read back", `reads back as pass ${read.pass}, local ${read.local}`);
      } else counts.back++;
    }
    try {
      const got = mod.toPass(pass, BEFORE_START, D, GUARD);
      const want = mod.toPass(pass, 0, D, GUARD);
      if (got !== want) fail(liftId("start clamp", pass, BEFORE_START), "start clamp", `lifts to ${got}, the start to ${want}`);
      else counts.start++;
    } catch (e) {
      fail(liftId("start clamp", pass, BEFORE_START), "start clamp", `a throw (${e?.message ?? e})`);
    }
    for (const local of PAST_EDGE) {
      const row = liftId("end clamp", pass, local);
      try {
        const got = mod.toPass(pass, local, D, GUARD);
        const want = mod.toPass(pass, EDGE, D, GUARD);
        if (got !== want) fail(row, "end clamp", `lifts to ${got}, the edge to ${want}`);
        else counts.clamp++;
      } catch (e) {
        fail(row, "end clamp", `a throw (${e?.message ?? e})`);
      }
    }
  }
  const lifts = PASSES * LOCALS.length;
  const clean = (family) => !failures.some((f) => f.family === family);
  lines.push({ ok: clean("pass"), row: "every lift stays in its pass", text: `${counts.pass} of ${counts.returned} returned` });
  lines.push({ ok: clean("lift"), row: "no lift folds below its local", text: `${counts.lift} of ${lifts}; ${turned} needed lifting` });
  lines.push({ ok: clean("near"), row: "no lift folds past its local by more than TINY", text: `${counts.near} of ${counts.returned} returned; TINY is ${TINY.toExponential(1)} s` });
  lines.push({ ok: clean("read back"), row: "every lifted time reads back as its pass and fold", text: `${counts.back} of ${counts.returned} returned` });
  lines.push({ ok: clean("end clamp"), row: "a local past the guard lifts as the edge does", text: `${counts.clamp} of ${END_CLAMP_ROWS.length}` });
  lines.push({ ok: clean("start clamp"), row: "a local before the loop lifts as its start does", text: `${counts.start} of ${PASSES}` });

  for (const [name, local, dir, want] of STEPS) {
    let got;
    try {
      got = mod.stepFrom(STOPS, local, dir, mod.STOP_TOLERANCE_S);
    } catch (e) {
      got = `a throw (${e?.message ?? e})`;
    }
    const ok = got === want;
    lines.push({ ok, row: name, text: ok ? `-> ${got}` : `-> ${got}, expected ${want}` });
    if (!ok) fail(name, "step", `lands on ${got}, expected ${want}`);
  }

  for (const [row, name, where, rail] of MARGINS) {
    const ok = rail.length > 0 && rail.every((v) => v === mod[name]);
    lines.push({
      ok,
      row,
      text: rail.length ? `${name} is ${mod[name]} s; ${where} writes ${[...new Set(rail)].join(", ")} s` : `${where} no longer writes it where it did`,
    });
    if (!ok) fail(row, "margin", rail.length ? `${name} is ${mod[name]}, ${where} writes ${[...new Set(rail)].join(", ")}` : `not found in ${where}`);
  }
  return { failures, lines, lifts };
}

/** Write `from` -> `to` into the source, or say why it cannot be written. */
function spoil(source, from, to) {
  const count =
    typeof from === "string" ? source.split(from).length - 1 : [...source.matchAll(from)].length;
  if (count !== 1) return { problem: `it no longer applies to route.ts (${count} matches, not 1)` };
  return { text: source.replace(from, to) };
}

async function loadSpoiled(text) {
  const dir = await mkdtemp(join(tmpdir(), "route-check-"));
  try {
    const file = join(dir, "route.mts");
    await writeFile(file, text);
    return (await loadTs(file)).mod;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

/** Rows by name while there are few, by family and count once there are many. */
function said(failures) {
  if (failures.length <= 8) return failures.map((f) => f.row).join(", ");
  const by = new Map();
  for (const f of failures) by.set(f.family, (by.get(f.family) ?? 0) + 1);
  return [...by].map(([family, n]) => `${n} ${family} rows`).join(", ");
}

// --- the run --------------------------------------------------------------------

console.log(
  `route-check: site/src/route.ts (${via}); the bare address is pinned to ${EXPECT_LANDING}; ` +
    `a loop of ${D} s, ${PASSES} passes`,
);
const sound = judge(route);
const width = Math.max(...sound.lines.map((l) => l.row.length));
for (const l of sound.lines) console.log(`  ${l.ok ? "PASS" : "FAIL"}  ${l.row.padEnd(width)}  ${l.text}`);
const shown = new Map();
for (const f of sound.failures) {
  const n = (shown.get(f.family) ?? 0) + 1;
  shown.set(f.family, n);
  if (n <= 3) problems.push(`${f.row}: ${f.detail}`);
}
for (const [family, n] of shown) if (n > 3) problems.push(`... ${n - 3} more ${family} rows`);

const source = await readFile(SRC, "utf8");
let caught = 0;
for (const seed of SEEDS) {
  console.log(`  seeded defect: ${seed.name}`);
  const spoiled = spoil(source, seed.from, seed.to);
  if (spoiled.problem) {
    console.log(`         ${spoiled.problem}`);
    problems.push(`seeded defect "${seed.name}": ${spoiled.problem}`);
    continue;
  }
  let refused;
  try {
    refused = judge(await loadSpoiled(spoiled.text)).failures;
  } catch (e) {
    console.log(`         the spoiled copy did not load: ${e?.message ?? e}`);
    problems.push(`seeded defect "${seed.name}" did not load`);
    continue;
  }
  const own = !seed.rows
    ? `${seed.within} rows alone`
    : seed.rows.length <= 8
      ? `exactly ${seed.rows.join(", ")}`
      : `exactly its ${seed.rows.length} rows, ${seed.rows[0]} to ${seed.rows.at(-1)}`;
  const ok = seed.rows
    ? sameSet(refused.map((f) => f.row), seed.rows)
    : refused.every((f) => f.family === seed.within);
  if (refused.length === 0) {
    console.log(`         LET THROUGH, where it must be refused for ${own}`);
    problems.push(`seeded defect "${seed.name}" was let through`);
  } else if (!ok) {
    console.log(`         refused for ${said(refused)}, NOT for ${own}`);
    problems.push(`seeded defect "${seed.name}" was refused for [${said(refused)}], not for ${own}`);
  } else {
    caught++;
    console.log(`         refused for ${said(refused)}: its own rows`);
  }
}

if (problems.length) {
  for (const p of problems) console.error(`route-check: ${p}`);
  console.error(
    `\nROUTES RED: ${sound.failures.length} rows refused, ` +
      `${SEEDS.length - caught} of ${SEEDS.length} seeded defects not refused for their own rows alone`,
  );
  process.exit(1);
}
console.log(
  `\nROUTES GREEN: ${TABLE.length} addresses, the bare address serves ${route.LANDING}, ` +
    `${sound.lifts} lifts over ${PASSES} passes, ` +
    `${SEEDS.length} seeded defects each refused for its own rows`,
);
