/**
 * Copy the artifacts the deploy is ALLOWED to serve into public/.
 *
 * This used to be `rm -rf dest` followed by `cp -r src dest`, which meant every
 * file under data/processed/ was published the moment it existed — a future
 * private intermediate, a scratch export, a debug dump. Nobody had decided
 * that (audit F-07). The defect was never the payload; it was
 * publish-by-default.
 *
 * The list is now explicit and reviewed, one row at a time, in
 * `REQUIRED_ARTIFACTS` in pipeline/qa.py — whose `public` column carries the
 * reason for each — and emitted to pipeline/deploy_allowlist.json:
 *
 *     python3 pipeline/qa.py --write-deploy-allowlist
 *
 * qa.py's `deploy` group re-derives that file from the same table on every run,
 * so the Python and Node halves cannot drift. Same cross-toolchain shape the
 * zone fixture already uses: one committed file, two readers, neither running
 * the other's toolchain.
 *
 * AN UNLISTED FILE IS A FAILURE, NOT A SKIP. Silence is exactly how the old bug
 * would come back: a new artifact that quietly did not ship would look like a
 * missing feature, and one that quietly did ship is the thing this replaced.
 */

import { cp, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../../data/processed");
const dest = resolve(here, "../public/data");
const allowlistPath = resolve(here, "../../pipeline/deploy_allowlist.json");

try {
  await stat(src);
} catch {
  console.error(`sync-data: ${src} missing - run pipeline/aggregate.py first`);
  process.exit(1);
}

let allow;
try {
  allow = JSON.parse(await readFile(allowlistPath, "utf8"));
} catch {
  console.error(
    `sync-data: ${allowlistPath} missing or unreadable.\n` +
      `  Generate it with: python3 pipeline/qa.py --write-deploy-allowlist`,
  );
  process.exit(1);
}

const publicSet = new Set(allow.public ?? []);
const privateSet = new Set(allow.private ?? []);

/** Every file actually sitting under data/processed/, dotfiles excluded. */
async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(relative(src, p).split("\\").join("/"));
  }
  return out;
}

const present = await walk(src);
const unknown = present.filter((f) => !publicSet.has(f) && !privateSet.has(f));
const missing = [...publicSet].filter((f) => !present.includes(f));

if (unknown.length) {
  console.error(
    `sync-data: ${unknown.length} file(s) under data/processed/ are on neither list:\n` +
      unknown.map((f) => `    ${f}`).join("\n") +
      `\n  Nothing is published by default. Add each one to REQUIRED_ARTIFACTS in\n` +
      `  pipeline/qa.py with a public: true|false decision and a reason, then run\n` +
      `  python3 pipeline/qa.py --write-deploy-allowlist`,
  );
  process.exit(1);
}
if (missing.length) {
  console.error(
    `sync-data: ${missing.length} allowlisted artifact(s) are missing from ` +
      `data/processed/:\n` +
      missing.map((f) => `    ${f}`).join("\n") +
      `\n  Re-run the stage that writes them.`,
  );
  process.exit(1);
}

await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });
for (const rel of [...publicSet].sort()) {
  const to = resolve(dest, rel);
  await mkdir(dirname(to), { recursive: true });
  await cp(resolve(src, rel), to);
}

console.log(
  `sync-data: ${publicSet.size} allowlisted artifacts -> ${dest} ` +
    `(${privateSet.size} held back: ` +
    `${[...privateSet].map((f) => f.split("/")[0]).filter((v, i, a) => a.indexOf(v) === i).join(", ")})`,
);
