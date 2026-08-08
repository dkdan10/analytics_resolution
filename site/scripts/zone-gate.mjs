/**
 * The TypeScript half of the zone parity gate.
 *
 * `pipeline/common.py:zone_at` and `site/src/zone.ts:zoneAt` are two copies of
 * one rule — the league's seven SHOT_ZONE_BASIC regions read as a partition of
 * the FLOOR. THE HAND colours a stroke by the region it is crossing and THE
 * FIELD colours a mark by the region it landed in, so if the copies drift the
 * colour stops being a measurement (CLAUDE.md Rule 4).
 *
 * Both are checked against one committed fixture, and neither toolchain runs
 * the other's:
 *
 *     python3 pipeline/qa.py --write-zone-fixture   regenerate it
 *     python3 pipeline/qa.py                        the Python side
 *     npm run gate                                  this file
 *
 * Required agreement is 100%. That is parity between two copies of one rule —
 * a different claim from the reconstruction's 99.993% agreement with the
 * league's own labels, which qa.py measures separately over all 207,893 of
 * 2015-16's shots.
 *
 * `npm run build` calls this, so a drifted TypeScript zone cannot ship.
 */

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, "../src/zone.ts");
const FIXTURE = resolve(here, "../../pipeline/checks/zone_fixture.json");

/**
 * Load the module under test.
 *
 * Node 23+ strips types from a .ts import on its own; older Node needs a
 * transform, and vite already brings esbuild, so no network install is
 * involved either way.
 */
async function loadZone() {
  try {
    return { mod: await import(SRC), via: "node type-stripping" };
  } catch {
    const { transformSync } = await import("esbuild");
    const js = transformSync(await readFile(SRC, "utf8"), {
      loader: "ts",
      format: "esm",
    }).code;
    const url = `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
    return { mod: await import(url), via: "esbuild" };
  }
}

const failures = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}: got ${brief(got)}, expected ${brief(want)}`);
  if (!ok) failures.push(name);
}

function brief(v) {
  const s = JSON.stringify(v) ?? String(v);
  return s.length > 110 ? `${s.slice(0, 110)}...` : s;
}

const { mod: zone, via } = await loadZone();
const fx = JSON.parse(await readFile(FIXTURE, "utf8"));

console.log(`zone parity: site/src/zone.ts against ${FIXTURE.split("/").slice(-3).join("/")} (${via})`);

// The constants the fixture was cut against must still be the ones in force.
// CORNER_Y is derived from two of the others in both languages, so this also
// asserts the two runtimes produce the same double from the same expression.
check(
  "the fixture's geometry is the geometry in force",
  {
    RESTRICTED_R: zone.RESTRICTED_R,
    LANE_HALF_W: zone.LANE_HALF_W,
    FREE_THROW_Y: zone.FREE_THROW_Y,
    THREE_R: zone.THREE_R,
    CORNER_X: zone.CORNER_X,
    CORNER_Y: zone.CORNER_Y,
    HALFCOURT_Y: zone.HALFCOURT_Y,
  },
  fx.constants,
);
check("the fixture names the league's seven regions", [...zone.ZONE_NAMES], fx.zone_names);

const { x: xs, y: ys, zones } = fx.grid;
let gridOff = 0;
let firstGrid = null;
for (let iy = 0; iy < ys.length; iy++) {
  for (let ix = 0; ix < xs.length; ix++) {
    const want = Number(zones[iy * xs.length + ix]);
    const got = zone.zoneAt(xs[ix], ys[iy]);
    if (got !== want) {
      gridOff++;
      firstGrid ??= `(${xs[ix]}, ${ys[iy]}) -> ${got}, fixture says ${want}`;
    }
  }
}
check(`zoneAt agrees with the fixture over ${xs.length * ys.length} grid cells`, gridOff, 0);
if (firstGrid) console.log(`        first disagreement: ${firstGrid}`);

let edgeOff = 0;
let firstEdge = null;
for (const [x, y, want] of fx.boundary_cases) {
  const got = zone.zoneAt(x, y);
  if (got !== want) {
    edgeOff++;
    firstEdge ??= `(${x}, ${y}) -> ${zone.ZONE_NAMES[got]}, fixture says ${zone.ZONE_NAMES[want]}`;
  }
}
check(
  `zoneAt agrees with the fixture on ${fx.boundary_cases.length} boundary coordinates`,
  edgeOff,
  0,
);
if (firstEdge) console.log(`        first disagreement: ${firstEdge}`);

// Every region must actually occur, or a fixture that had quietly stopped
// exercising one of them would still read as full agreement.
const seen = new Set();
for (const c of zones) seen.add(Number(c));
for (const [, , z] of fx.boundary_cases) seen.add(z);
check("the fixture reaches all seven regions", [...seen].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6]);

if (failures.length) {
  console.error(
    `\nZONE PARITY RED: ${failures.length} mismatch(es). The TypeScript copy of the ` +
      `league's map has drifted from the Python one, so THE HAND's colour is no longer ` +
      `a measurement. Re-derive with: python3 pipeline/qa.py --write-zone-fixture`,
  );
  process.exit(1);
}
console.log("\nZONE PARITY GREEN: one rule, two implementations, no disagreement.");
