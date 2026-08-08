/**
 * The deploy test: what actually reached dist/data.
 *
 * sync-data.mjs decides what to COPY. This checks what a real `vite build`
 * ended up serving, which is not the same claim — a stray file in public/, a
 * stale artifact left behind by an older sync, or an asset rule that copies
 * something else would all get past the copier and still be published.
 *
 * Three assertions, straight from audit F-07's acceptance criteria:
 *
 *   a  every public artifact is present under dist/data
 *   b  no artifact marked private is
 *   c  nothing under dist/data is absent from the list entirely
 *
 * (b) is the one that was failing before session 3, because the copier took the
 * whole directory. That is the point of it.
 *
 * Run by `npm run build` after vite, so a deploy that would publish something
 * nobody listed does not complete.
 *
 * Usage: node scripts/check-public-data.mjs [dir]   (default ../dist/data)
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, "..", process.argv[2] ?? "dist/data");
const allowlistPath = resolve(here, "../../pipeline/deploy_allowlist.json");

try {
  await stat(dist);
} catch {
  console.error(
    `check-public-data: ${dist} missing - run \`npm run build\` first.\n` +
      `  This test grades a real build; it does not stand in for one.`,
  );
  process.exit(1);
}

const allow = JSON.parse(await readFile(allowlistPath, "utf8"));
const publicSet = new Set(allow.public ?? []);
const privateSet = new Set(allow.private ?? []);

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(relative(dist, p).split("\\").join("/"));
  }
  return out;
}

const served = await walk(dist);
const servedSet = new Set(served);

const absent = [...publicSet].filter((f) => !servedSet.has(f));
const leaked = served.filter((f) => privateSet.has(f));
const unlisted = served.filter((f) => !publicSet.has(f) && !privateSet.has(f));

const fail = (title, list, advice) => {
  console.error(`  FAIL  ${title}: ${list.length}`);
  for (const f of list.slice(0, 12)) console.error(`          ${f}`);
  if (list.length > 12) console.error(`          ... and ${list.length - 12} more`);
  console.error(`        ${advice}`);
};

console.log(`check-public-data: ${served.length} files under ${relative(resolve(here, ".."), dist)}`);

let bad = false;
if (absent.length) {
  bad = true;
  fail("every allowlisted artifact is served", absent,
    "the piece will 404 on these - re-run npm run sync-data");
} else {
  console.log(`  PASS  every allowlisted artifact is served: ${publicSet.size}`);
}
if (leaked.length) {
  bad = true;
  fail("no artifact marked private is served", leaked,
    "these are listed public:false in REQUIRED_ARTIFACTS (pipeline/qa.py) and must not ship");
} else {
  console.log(`  PASS  no artifact marked private is served: ${privateSet.size} held back`);
}
if (unlisted.length) {
  bad = true;
  fail("nothing unlisted reached the build", unlisted,
    "add each to REQUIRED_ARTIFACTS with a public decision and a reason, then " +
      "python3 pipeline/qa.py --write-deploy-allowlist");
} else {
  console.log("  PASS  nothing unlisted reached the build");
}

if (bad) {
  console.error(
    "\ncheck-public-data: the deploy would publish something nobody reviewed.\n" +
      "CLAUDE.md data rights: the repo goes public on deploy day, and what it serves is decided.",
  );
  process.exit(1);
}
console.log("DEPLOY GREEN: the build serves exactly the reviewed list.");
