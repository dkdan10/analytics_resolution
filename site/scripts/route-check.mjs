#!/usr/bin/env node
/**
 * The address table: which entry each query string opens.
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
 * THE CHECK IS SHOWN FAILING ON EVERY RUN. Each seeded defect below is written
 * into a copy of route.ts's own text, loaded the same way, and must be refused
 * by exactly the rows it breaks and no other. A defect let through, one
 * refused for the wrong rows, and one that no longer applies to the source are
 * each a failure of this check.
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
  ["talk", "canonical"],
  ["talk&experience=overview", "canonical"],
  ["nav", "canonical"],
  ["nav=0", "canonical"],
  ["probe=purity", "canonical"],
  ["probe=", "canonical"],
  ["t=300", "canonical"],
  ["t=abc", "canonical"],
  ["year=2004", "canonical"],
  ["stop=hand.close", "canonical"],
  ["mode=field", "canonical"],
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

/**
 * Defects, each written into route.ts's text. `from` must occur exactly once,
 * and `rows` is every row the defect breaks: the check must refuse those and
 * nothing else.
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
];

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

/** Every row the module fails, as `{ row, detail }`. Decides nothing else. */
function judge(mod) {
  const failures = [];
  const results = [];
  const pinned = mod.LANDING === EXPECT_LANDING;
  results.push({ row: PIN_ROW, ok: pinned, text: `serves ${JSON.stringify(mod.LANDING)}, pinned ${JSON.stringify(EXPECT_LANDING)}` });
  if (!pinned) failures.push({ row: PIN_ROW, detail: `LANDING is ${JSON.stringify(mod.LANDING)}` });
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
    results.push({ row, ok, text: ok ? `-> ${got}` : `-> ${got}, expected ${want}` });
    if (!ok) failures.push({ row, detail: `opens ${got}, expected ${want}` });
  }
  return { failures, results };
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

const problems = [];

const { mod: route, via } = await loadTs(SRC);
console.log(`route-check: site/src/route.ts (${via}); the bare address is pinned to ${EXPECT_LANDING}`);
const sound = judge(route);
const width = Math.max(...sound.results.map((r) => r.row.length));
for (const r of sound.results) {
  console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.row.padEnd(width)}  ${r.text}`);
}
for (const f of sound.failures) problems.push(`${f.row}: ${f.detail}`);

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
    refused = judge(await loadSpoiled(spoiled.text)).failures.map((f) => f.row);
  } catch (e) {
    console.log(`         the spoiled copy did not load: ${e?.message ?? e}`);
    problems.push(`seeded defect "${seed.name}" did not load`);
    continue;
  }
  if (refused.length === 0) {
    console.log(`         LET THROUGH, where it must be refused for ${seed.rows.join(", ")}`);
    problems.push(`seeded defect "${seed.name}" was let through`);
  } else if (!sameSet(refused, seed.rows)) {
    console.log(`         refused for ${refused.join(", ")}, NOT for exactly ${seed.rows.join(", ")}`);
    problems.push(`seeded defect "${seed.name}" was refused for [${refused.join(", ")}], not for [${seed.rows.join(", ")}]`);
  } else {
    caught++;
    console.log(`         refused for ${refused.join(", ")}: its own rows`);
  }
}

if (problems.length) {
  for (const p of problems) console.error(`route-check: ${p}`);
  console.error(
    `\nROUTES RED: ${sound.failures.length} of ${TABLE.length + 1} rows refused, ` +
      `${SEEDS.length - caught} of ${SEEDS.length} seeded defects not refused for their own rows alone`,
  );
  process.exit(1);
}
console.log(
  `\nROUTES GREEN: ${TABLE.length} addresses, the bare address serves ${route.LANDING}, ` +
    `${SEEDS.length} seeded defects each refused for its own rows`,
);
