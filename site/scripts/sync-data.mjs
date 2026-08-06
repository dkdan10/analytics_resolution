// Copy the pipeline's derived JSON into public/ so the piece ships self-contained.
// Bulk data is never copied - only data/processed/, which is the committed,
// regenerable output of pipeline/ (see CLAUDE.md data rights).
import { cp, rm, mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../../data/processed");
const dest = resolve(here, "../public/data");

try {
  await stat(src);
} catch {
  console.error(`sync-data: ${src} missing - run pipeline/aggregate.py first`);
  process.exit(1);
}

await rm(dest, { recursive: true, force: true });
await mkdir(dirname(dest), { recursive: true });
await cp(src, dest, { recursive: true });
console.log(`sync-data: ${src} -> ${dest}`);
