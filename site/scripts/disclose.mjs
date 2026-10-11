/**
 * The disclosure, rendered from the register.
 *
 * The third rule (README, The rules) ends "authored scalars must be named, isolated AND
 * DISCLOSED". A frozen manifest in a TypeScript file satisfies the first two
 * and none of the third — nobody reading the piece can open src/scalars.ts.
 *
 * So this generates docs/material-scalars.md from the register itself. It is
 * GENERATED and never edited: the alternative is the same content maintained in
 * two places, which is precisely how a number in this project goes stale.
 *
 * `npm run build` regenerates it and fails if the committed copy has drifted,
 * so a scalar cannot change without its disclosure changing in the same commit.
 *
 * Usage: npm run disclose          rewrite the page
 *        npm run disclose -- --check   fail if the committed page is stale
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, "../src/scalars.ts");
const OUT = resolve(here, "../../docs/material-scalars.md");
const CHECKER = resolve(here, "check-numbers.mjs");

/**
 * Which files pass 3 actually reaches, read out of the checker itself.
 *
 * Never restated. The line this feeds once hardcoded five module names and fell
 * seven entries stale — in the one script whose entire purpose is to stop
 * a disclosure drifting from the thing it discloses. Parsed rather than imported
 * because check-numbers.mjs runs its whole check on import.
 */
async function markLayers() {
  const src = await readFile(CHECKER, "utf8");
  const block = src.match(/const MARK_LAYERS = \[([\s\S]*?)\n\];/);
  if (!block) throw new Error("disclose: cannot find MARK_LAYERS in check-numbers.mjs");
  return [...block[1].matchAll(/^\s*\/\^(.+?)\$\/,\s*$/gm)]
    .map((m) => m[1].replace(/\\/g, ""));
}

/** Load the register. Same two-step the zone gate uses: Node strips types on
 *  its own from 23 on, and vite already brings esbuild for anything older, so
 *  no network install is involved either way. */
async function loadScalars() {
  try {
    return await import(SRC);
  } catch {
    const { transformSync } = await import("esbuild");
    const js = transformSync(await readFile(SRC, "utf8"), {
      loader: "ts",
      format: "esm",
    }).code;
    const url = `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
    return await import(url);
  }
}

const CLASS_NOTE = {
  measured:
    "read from `data/processed/` at runtime. These carry no value here — a " +
    "measurement copied into source stops being one.",
  geometry:
    "the floor, the rule book, or physics. Not chosen, and not measurable from " +
    "the shot record.",
  authored:
    "nobody measured it. It is a decision, and the register is the only place " +
    "in the piece one may be written down.",
};

function render(scalars, layers) {
  const rows = Object.entries(scalars);
  const byClass = { measured: [], geometry: [], authored: [] };
  for (const [name, e] of rows) byClass[e.class].push([name, e]);
  const material = rows.filter(([, e]) => e.material).length;

  const out = [];
  out.push("# The material register");
  out.push("");
  out.push(
    "*Generated from `site/src/scalars.ts` by `npm run disclose`. Do not edit: " +
      "edit the register.*",
  );
  out.push("");
  out.push(
    "Grain is a measurement, not a mood. Every material property of a mark in " +
      "FADEAWAY — its radius, stroke width, opacity, colour, bead count, " +
      "pooling, falloff or tone — derives from a measured property of the " +
      "record. Where one genuinely cannot be measured, it is named here, in " +
      "one place, with what it controls.",
  );
  out.push("");
  out.push(
    `**${rows.length} scalars**, ${material} of them material: ` +
      `${byClass.measured.length} measured, ${byClass.geometry.length} geometry, ` +
      `${byClass.authored.length} authored.`,
  );
  out.push("");
  // DERIVED FROM THE LIST ITSELF, never restated. This sentence hardcoded five
  // module names and went stale seven entries ago — in a file whose whole job is
  // to keep a disclosure from drifting from what it describes.
  out.push(
    `A renderer in the mark layers — ${layers.map((f) => `\`${f}\``).join(", ")}` +
      " — may not write a material number inline; `npm run check:numbers` fails " +
      "the build if one appears.",
  );

  for (const cls of ["measured", "geometry", "authored"]) {
    const list = byClass[cls];
    if (!list.length) continue;
    out.push("");
    out.push(`## ${cls}`);
    out.push("");
    out.push(`*${CLASS_NOTE[cls]}*`);
    out.push("");
    for (const [name, e] of list) {
      const value = e.class === "measured" ? `\`${e.from}\`` : `**${e.value}**`;
      out.push(`- **${name}** — ${value}${e.material ? "" : " *(not material)*"}  `);
      out.push(`  ${e.controls}`);
    }
  }
  out.push("");
  return out.join("\n");
}

const { SCALARS } = await loadScalars();
const page = render(SCALARS, await markLayers());
const check = process.argv.includes("--check");

let current = null;
try {
  current = await readFile(OUT, "utf8");
} catch {
  current = null;
}

if (check) {
  if (current !== page) {
    console.error(
      "disclose: docs/material-scalars.md is stale.\n" +
        "  A material scalar changed and its disclosure did not. Run `npm run disclose`\n" +
        "  and commit the result alongside the change (rule 3, README: named, isolated\n" +
        "  AND disclosed).",
    );
    process.exit(1);
  }
  console.log(
    `disclose: docs/material-scalars.md is current — ${Object.keys(SCALARS).length} scalars.`,
  );
} else {
  await writeFile(OUT, page);
  console.log(
    `disclose: docs/material-scalars.md written — ${Object.keys(SCALARS).length} scalars.`,
  );
}
