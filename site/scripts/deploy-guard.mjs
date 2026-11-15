#!/usr/bin/env node
/**
 * Stand between the build and the publish, and refuse anything but the build
 * that was signed off.
 *
 * `gh-pages -d dist` publishes whatever `dist/` holds, and `npm run build`
 * fills `dist/` from whatever happens to be checked out. Chained with nothing
 * in front of them, the two would put a half-finished branch, a tree carrying
 * uncommitted edits, or a commit that was never pushed onto the live site,
 * whether or not the acceptance gate had ever run on it. The probes and the
 * eye judge one particular build. The bytes that were probed and signed off
 * must be the bytes that ship, and this is the only thing that makes it so.
 *
 *   node scripts/deploy-guard.mjs seal    after the build that gets probed
 *   node scripts/deploy-guard.mjs pre     before the publishing build
 *   node scripts/deploy-guard.mjs post    after it, before the publish
 *
 * SEAL writes down what was signed off: the git object ids of the three paths
 * a published build is made from, the Node major that built it, and a sha256
 * for every file under `dist/` that the publisher would upload - the bundle
 * and the artifacts copied in beside it alike, since a tree that is clean when
 * the seal is taken does not show that `dist/` was built from it. It names
 * objects, not a commit, so a seal taken on a branch still holds after that
 * branch is merged, as long as the merge changed none of the three. It refuses
 * while any of them carries an uncommitted edit, because the seal would then
 * name sources the build was not made from.
 *
 * PRE refuses unless the checkout is the release branch, clean, and exactly
 * what the remote holds; a BARE run of the acceptance gate ends green (any
 * flag makes the gate print a reduced verdict, and a reduced verdict is not
 * the gate); a seal exists; the three sealed objects are HEAD's; and this is
 * the Node major the seal was built on. The cheap local facts are read first,
 * so a wrong branch is turned away before the remote is asked and before the
 * gate is run, and read again once the gate has ended, so an edit made while
 * it ran is not waved through.
 *
 * POST hashes the build that `pre` let through and refuses unless it is,
 * file for file, the sealed one. It leans on the bundler writing the same
 * bytes from the same sources on the same Node major, which was established
 * by building one tree twice and comparing. Should that ever stop holding,
 * `post` goes red on an honest tree, and the remedy is to publish the sealed
 * `dist/` without rebuilding it - never to loosen the comparison.
 *
 * THERE IS NO OVERRIDE. No flag, no second argument, and no environment
 * variable the guard reads. Git is asked about this checkout with the
 * variables that would point it at another one withheld, and with the
 * untracked-file policy spelled out, so neither the caller's shell nor its
 * git configuration can quiet a refusal. A refusal is answered by making the
 * condition true.
 *
 * IT GOES RED ON EVERY USE. A guard that has only ever said yes is not known
 * to be able to say no. So the decision is one pure function, `verdict`, and
 * before any real state is read it is handed one seeded defect per condition
 * and one sound input per subcommand. A seeded defect that passes, one that
 * is refused for the wrong reason, or a sound input that is refused, ends the
 * run there.
 *
 * FAILING CLOSED. The exit code starts as a failure and is cleared only where
 * a complete verdict came back clean, so a crash, an unreadable seal, a git
 * command that did not answer, or a path nobody thought of all refuse.
 */

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const SITE = resolve(dirname(SELF), "..");
const REPO = resolve(SITE, "..");
const DIST = join(SITE, "dist");
/** Beside the probe verdicts it vouches for, and gitignored with them: a seal
 *  describes one machine's build, and a committed one would dirty the very
 *  objects it names. */
const SEAL_PATH = join(REPO, "docs", "probe", "release-seal.json");

const RELEASE_BRANCH = "master";
const REMOTE = "origin";
/** Branches are named by their full ref, so that a tag sharing the release
 *  branch's name can neither stand in for it nor make git hedge its answer. */
const HEADS = "refs/heads/";
/** Everything a published build is made from: the renderer and its public
 *  files, the artifacts it fetches, and the list of which of them may ship. */
const SEALED_PATHS = ["site", "data/processed", "pipeline/deploy_allowlist.json"];
const GATE = { cmd: "python3", args: ["pipeline/qa.py"] };
/** The gate holds its output back when it writes to a pipe, and the guard
 *  reads it through one. This asks for each line as it is printed; it is not
 *  a flag, so the run is still the bare one. */
const GATE_ENV = { PYTHONUNBUFFERED: "1" };
/** The gate's last line, as its final print writes it. A reduced run says
 *  green too, with the parenthesis in front of the colon. */
const GREEN = "QA GREEN:";
const REDUCED = "(REDUCED";
const NODE_MAJOR = Number(process.versions.node.split(".")[0]);
const INDEX = "index.html";
/** The variables git itself treats as belonging to one repository (its own
 *  `rev-parse --local-env-vars` list). They are withheld from every git call
 *  here, so each answer is about this checkout wherever the caller's shell
 *  happens to point. */
const GIT_REPO_ENV = [
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_CONFIG",
  "GIT_CONFIG_PARAMETERS",
  "GIT_CONFIG_COUNT",
  "GIT_OBJECT_DIRECTORY",
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_IMPLICIT_WORK_TREE",
  "GIT_GRAFT_FILE",
  "GIT_INDEX_FILE",
  "GIT_NO_REPLACE_OBJECTS",
  "GIT_REPLACE_REF_BASE",
  "GIT_PREFIX",
  "GIT_INTERNAL_SUPER_PREFIX",
  "GIT_SHALLOW_FILE",
  "GIT_COMMON_DIR",
];
/** Whether untracked files count is otherwise a matter of configuration, and
 *  a clean tree must not be something a setting can declare. */
const UNTRACKED = "--untracked-files=all";
/** How much of an object id, and how many changed paths, a refusal prints. */
const SHORT_ID = 12;
const STATUS_LINES_SHOWN = 6;

const USAGE =
  "usage: node scripts/deploy-guard.mjs <seal|pre|post>   (no flags; there is no override)";

// ---------------------------------------------------------------------------
// The decision. Pure: everything it knows arrives in `inputs`.
// ---------------------------------------------------------------------------

const isId = (s) => typeof s === "string" && s.length > 0;
const isFileMap = (m) =>
  m !== null &&
  typeof m === "object" &&
  Object.hasOwn(m, INDEX) &&
  Object.values(m).every(isId);

function wellFormedSeal(seal) {
  return (
    seal !== null &&
    typeof seal === "object" &&
    seal.trees !== null &&
    typeof seal.trees === "object" &&
    SEALED_PATHS.every((p) => isId(seal.trees[p])) &&
    Number.isInteger(seal.nodeMajor) &&
    isFileMap(seal.dist)
  );
}

/** Own keys only: a file may carry any name, an inherited one included. */
function distDifferences(sealed, built) {
  const out = [];
  for (const f of Object.keys(sealed).sort()) {
    if (!Object.hasOwn(built, f)) out.push(`${f} is sealed and was not built`);
    else if (built[f] !== sealed[f]) out.push(`${f} differs from the sealed bytes`);
  }
  for (const f of Object.keys(built).sort()) {
    if (!Object.hasOwn(sealed, f)) out.push(`${f} was built and is not sealed`);
  }
  return out;
}

/**
 * @param inputs `{stage, branch, status, head, originHead, gate, seal, trees, nodeMajor, dist}`.
 *   A fact that could not be read arrives as null and is a refusal, never a pass.
 * @returns `{ok, failures: [{condition, why}]}`, one failure per condition that does not hold.
 */
export function verdict(inputs) {
  const failures = [];
  const fail = (condition, why) => failures.push({ condition, why });
  const { stage } = inputs;
  const short = (id) => (isId(id) ? id.slice(0, SHORT_ID) : "unreadable");
  const dirty = (status) =>
    typeof status !== "string"
      ? "git status did not answer"
      : status.split("\n").filter(Boolean).slice(0, STATUS_LINES_SHOWN).join("; ");

  if (stage !== "seal" && stage !== "pre" && stage !== "post") {
    fail("stage", `unknown subcommand ${JSON.stringify(stage)}`);
    return { ok: false, failures };
  }

  if (stage === "seal") {
    // `status` here covers the sealed paths only: an edit elsewhere cannot
    // change what a build is made from.
    if (inputs.status !== "") {
      fail(
        "clean",
        `the sealed paths carry uncommitted changes, so HEAD is not what was built: ${dirty(inputs.status)}`,
      );
    }
    const trees = inputs.trees ?? {};
    const lost = SEALED_PATHS.filter((p) => !isId(trees[p]));
    if (lost.length > 0) fail("trees", `HEAD has no ${lost.join(", ")}`);
    if (!isFileMap(inputs.dist)) fail("dist", `no built ${INDEX} under dist/ - run the build first`);
    return { ok: failures.length === 0, failures };
  }

  if (stage === "pre") {
    const remote = `${REMOTE}/${RELEASE_BRANCH}`;
    if (inputs.branch !== RELEASE_BRANCH) {
      fail("branch", `on ${inputs.branch ?? "a detached HEAD"}, and only ${RELEASE_BRANCH} is published`);
    }
    if (inputs.status !== "") {
      fail("clean", `the working tree is not clean: ${dirty(inputs.status)}`);
    }
    if (!isId(inputs.head)) {
      fail("origin", `HEAD could not be read, so it is not known to be what ${remote} holds`);
    } else if (inputs.head !== inputs.originHead) {
      fail(
        "origin",
        isId(inputs.originHead)
          ? `HEAD is ${short(inputs.head)} and ${remote} is ${short(inputs.originHead)}`
          : `${remote} could not be fetched, so HEAD ${short(inputs.head)} is not known to be pushed`,
      );
    }
    const gate = inputs.gate;
    const line = gate && typeof gate.lastLine === "string" ? gate.lastLine : "";
    if (!gate) {
      fail("gate", "the acceptance gate was not run");
    } else if (gate.exit !== 0) {
      fail("gate", `the acceptance gate exited ${gate.exit}: ${line || "no output"}`);
    } else if (line.includes(REDUCED)) {
      fail("reduced", `the acceptance gate ran reduced, and only a bare run is the gate: ${line}`);
    } else if (!line.startsWith(GREEN)) {
      fail("gate", `the acceptance gate did not end on "${GREEN}": ${line || "no output"}`);
    }
  }

  const seal = inputs.seal;
  if (!wellFormedSeal(seal)) {
    fail("seal", "no readable release seal - build, probe, then run the seal subcommand");
    return { ok: false, failures };
  }
  const trees = inputs.trees ?? {};
  const moved = SEALED_PATHS.filter((p) => trees[p] !== seal.trees[p]);
  if (moved.length > 0) {
    fail("trees", `HEAD is not what was sealed: ${moved.join(", ")} changed since the seal`);
  }
  if (inputs.nodeMajor !== seal.nodeMajor) {
    fail("node", `this is Node ${inputs.nodeMajor} and the seal was built on Node ${seal.nodeMajor}`);
  }
  if (stage === "post") {
    if (!isFileMap(inputs.dist)) {
      fail("dist", `no built ${INDEX} under dist/`);
    } else {
      const diffs = distDifferences(seal.dist, inputs.dist);
      if (diffs.length > 0) fail("dist", `the built dist is not the sealed one: ${diffs.join("; ")}`);
    }
  }
  return { ok: failures.length === 0, failures };
}

// ---------------------------------------------------------------------------
// The demonstration. One sound input per subcommand, and one defect at a time.
// ---------------------------------------------------------------------------

const SEED_ID = (ch) => ch.repeat(SHORT_ID);
/** What every defect below swaps in: an id no sound input carries. */
const SPOILED = SEED_ID("9");
/** One id per sealed path, made from the path so the list may grow freely. */
const SEED_TREES = Object.fromEntries(SEALED_PATHS.map((p) => [p, `seeded:${p}`]));
/** The entry page, a bundled file and a copied artifact: one of each kind of
 *  file a build holds. */
const SEED_ASSET = "assets/index.js";
const SEED_ARTIFACT = "data/seeded.json";
const SEED_DIST = { [INDEX]: SEED_ID("d"), [SEED_ASSET]: SEED_ID("e"), [SEED_ARTIFACT]: SEED_ID("a") };

function soundInput(stage) {
  // Fresh copies throughout: a defect spoils one side of a comparison, and a
  // shared object would spoil both and compare equal.
  return {
    stage,
    branch: RELEASE_BRANCH,
    status: "",
    head: SEED_ID("f"),
    originHead: SEED_ID("f"),
    gate: { exit: 0, lastLine: `${GREEN} seeded` },
    seal: { trees: { ...SEED_TREES }, nodeMajor: NODE_MAJOR, dist: { ...SEED_DIST } },
    trees: { ...SEED_TREES },
    nodeMajor: NODE_MAJOR,
    dist: { ...SEED_DIST },
  };
}

/** `[name, stage, the one condition it must be refused for, the defect]`. */
export const SEEDS = [
  ["wrong branch", "pre", "branch", (i) => (i.branch = "render/seeded")],
  ["detached HEAD", "pre", "branch", (i) => (i.branch = null)],
  ["dirty tree", "pre", "clean", (i) => (i.status = " M site/src/main.ts")],
  ["unreadable tree state", "pre", "clean", (i) => (i.status = null)],
  ["HEAD is not the remote's", "pre", "origin", (i) => (i.originHead = SPOILED)],
  ["remote not fetched", "pre", "origin", (i) => (i.originHead = null)],
  ["HEAD unreadable", "pre", "origin", (i) => (i.head = i.originHead = null)],
  ["gate red", "pre", "gate", (i) => (i.gate = { exit: 1, lastLine: "QA RED: seeded" })],
  ["gate green but a failing exit", "pre", "gate", (i) => (i.gate.exit = 1)],
  ["gate killed before it finished", "pre", "gate", (i) => (i.gate.exit = null)],
  ["gate exits clean without a green line", "pre", "gate", (i) => (i.gate.lastLine = "QA RED: seeded")],
  ["gate exits clean having printed nothing", "pre", "gate", (i) => (i.gate.lastLine = "")],
  ["green that does not open the last line", "pre", "gate", (i) => (i.gate.lastLine = `seeded ${GREEN}`)],
  ["gate not run", "pre", "gate", (i) => (i.gate = null)],
  [
    "gate green (reduced)",
    "pre",
    "reduced",
    (i) => (i.gate.lastLine = `QA GREEN ${REDUCED} - seeded): seeded`),
  ],
  ["missing seal", "pre", "seal", (i) => (i.seal = null)],
  ["seal lacks a sealed path", "pre", "seal", (i) => delete i.seal.trees[SEALED_PATHS[0]]],
  ["seal names no Node major", "pre", "seal", (i) => (i.seal.nodeMajor = String(NODE_MAJOR))],
  ["seal lists no built files", "pre", "seal", (i) => delete i.seal.dist],
  ...SEALED_PATHS.map((p) => [
    `sealed ${p} is not HEAD's`,
    "pre",
    "trees",
    (i) => (i.trees[p] = SPOILED),
  ]),
  ["Node major is not the seal's", "pre", "node", (i) => (i.nodeMajor = NODE_MAJOR + 1)],
  ["missing seal after the build", "post", "seal", (i) => (i.seal = null)],
  ["sources moved under the build", "post", "trees", (i) => (i.trees[SEALED_PATHS[0]] = SPOILED)],
  ["built on another Node major", "post", "node", (i) => (i.nodeMajor = NODE_MAJOR + 1)],
  ["entry page differs", "post", "dist", (i) => (i.dist[INDEX] = SPOILED)],
  ["bundled file differs", "post", "dist", (i) => (i.dist[SEED_ASSET] = SPOILED)],
  ["copied artifact differs", "post", "dist", (i) => (i.dist[SEED_ARTIFACT] = SPOILED)],
  ["dist lacks a sealed file", "post", "dist", (i) => delete i.dist[SEED_ARTIFACT]],
  ["dist holds an unsealed bundle file", "post", "dist", (i) => (i.dist["assets/extra.js"] = SPOILED)],
  ["dist holds an unsealed page", "post", "dist", (i) => (i.dist["seeded.html"] = SPOILED)],
  ["unsealed file named like an inherited key", "post", "dist", (i) => (i.dist.toString = SPOILED)],
  ["nothing built", "post", "dist", (i) => (i.dist = null)],
  ["sealing an edited tree", "seal", "clean", (i) => (i.status = " M site/src/main.ts")],
  ["sealing a path HEAD lacks", "seal", "trees", (i) => (i.trees[SEALED_PATHS[0]] = null)],
  ["sealing with nothing built", "seal", "dist", (i) => (i.dist = null)],
  ["sealing a build with no entry page", "seal", "dist", (i) => delete i.dist[INDEX]],
  ["unknown subcommand", "publish", "stage", () => {}],
];

/** @returns the list of ways the decision failed its own demonstration; empty when it holds. */
export function selfCheck(decide = verdict) {
  const problems = [];
  for (const stage of ["seal", "pre", "post"]) {
    const v = decide(soundInput(stage));
    if (!v.ok) {
      const why = v.failures.map((f) => f.condition).join(", ");
      problems.push(`a sound ${stage} input was refused for [${why}]`);
    }
  }
  for (const [name, stage, expect, spoil] of SEEDS) {
    const input = soundInput(stage);
    spoil(input);
    const v = decide(input);
    const got = v.failures.map((f) => f.condition);
    if (v.ok) problems.push(`seeded defect "${name}" was let through`);
    else if (got.length !== 1 || got[0] !== expect) {
      problems.push(`seeded defect "${name}" was refused for [${got.join(", ")}], not for [${expect}]`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// The shell. It reads facts and reports; it decides nothing.
// ---------------------------------------------------------------------------

const GIT_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !GIT_REPO_ENV.includes(name)),
);

/** A git answer, or null when git refused: null is a refusal downstream. */
function git(...args) {
  const r = spawnSync("git", args, { cwd: REPO, env: GIT_ENV, encoding: "utf8" });
  return r.status === 0 ? r.stdout.replace(/\n+$/, "") : null;
}

/** The checked-out branch by its short name, or null on a detached HEAD. */
function currentBranch() {
  const ref = git("symbolic-ref", "-q", "HEAD");
  return ref !== null && ref.startsWith(HEADS) ? ref.slice(HEADS.length) : null;
}

function headTrees() {
  const id = (p) => git("rev-parse", "--verify", "--quiet", `HEAD:${p}`);
  return Object.fromEntries(SEALED_PATHS.map((p) => [p, id(p)]));
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/** Every file the publisher would upload, by path relative to `dist/`: the
 *  bundle, and the public directory the build copies through beside it. The
 *  copies are hashed as well because nothing else ties them to what was
 *  sealed - the object ids say what HEAD holds, not what `dist/` was filled
 *  from. Names with a leading dot are passed over, as the publisher passes
 *  over them. */
function distHashes() {
  if (!existsSync(join(DIST, INDEX))) return null;
  const out = {};
  const walk = (rel) => {
    const entries = readdirSync(join(DIST, rel), { withFileTypes: true });
    for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (e.name.startsWith(".")) continue;
      const child = rel === "" ? e.name : `${rel}/${e.name}`;
      if (e.isDirectory()) walk(child);
      else out[child] = sha256(join(DIST, child));
    }
  };
  walk("");
  return out;
}

function readSeal() {
  try {
    return JSON.parse(readFileSync(SEAL_PATH, "utf8"));
  } catch {
    return null;
  }
}

/** Run the bare gate, passing its output through as it arrives. */
function runGate() {
  return new Promise((done) => {
    const child = spawn(GATE.cmd, GATE.args, {
      cwd: REPO,
      env: { ...process.env, ...GATE_ENV },
      stdio: ["ignore", "pipe", "inherit"],
    });
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += chunk;
      process.stdout.write(chunk);
    });
    child.on("error", () => done({ exit: null, lastLine: "" }));
    child.on("close", (code) => {
      const lines = out.split("\n").map((l) => l.trimEnd()).filter(Boolean);
      done({ exit: code, lastLine: lines.at(-1) ?? "" });
    });
  });
}

function refuse(stage, failures, note) {
  console.error(`deploy-guard ${stage}: REFUSED`);
  for (const f of failures) console.error(`  ${f.condition}: ${f.why}`);
  if (note) console.error(`  ${note}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(message);
  process.exitCode = 0;
}

function seal() {
  const inputs = {
    stage: "seal",
    status: git("status", "--porcelain", UNTRACKED, "--", ...SEALED_PATHS),
    trees: headTrees(),
    dist: distHashes(),
  };
  const v = verdict(inputs);
  if (!v.ok) return refuse("seal", v.failures, "No seal was written.");
  const record = {
    sealedAt: new Date().toISOString(),
    branch: currentBranch(),
    head: git("rev-parse", "HEAD"),
    nodeMajor: NODE_MAJOR,
    trees: inputs.trees,
    dist: inputs.dist,
  };
  mkdirSync(dirname(SEAL_PATH), { recursive: true });
  writeFileSync(SEAL_PATH, JSON.stringify(record, null, 2) + "\n");
  const count = Object.keys(record.dist).length;
  pass(`deploy-guard seal: ${count} built files sealed on Node ${NODE_MAJOR} -> ${SEAL_PATH}`);
}

/** Everything `pre` can learn without the remote or the gate. */
function checkoutFacts() {
  return {
    branch: currentBranch(),
    status: git("status", "--porcelain", UNTRACKED),
    head: git("rev-parse", "HEAD"),
    seal: readSeal(),
    trees: headTrees(),
    nodeMajor: NODE_MAJOR,
  };
}

async function pre() {
  const inputs = { stage: "pre", ...checkoutFacts(), originHead: null, gate: null };
  // Dearest last. A fact not yet read stays null and so stays a refusal; the
  // only thing set aside is the reporting of it, and only on a path that is
  // already refusing. The pass below is reached by a complete verdict alone.
  const besides = (v, ...pending) => v.failures.filter((f) => !pending.includes(f.condition));
  const untouched = "Nothing was built or published.";

  let early = besides(verdict(inputs), "origin", "gate", "reduced");
  if (early.length > 0) {
    return refuse("pre", early, `Stopped before asking the remote or running the gate. ${untouched}`);
  }

  if (git("fetch", "--quiet", REMOTE, `${HEADS}${RELEASE_BRANCH}`) !== null) {
    inputs.originHead = git("rev-parse", "--verify", "--quiet", "FETCH_HEAD^{commit}");
  }
  early = besides(verdict(inputs), "gate", "reduced");
  if (early.length > 0) {
    return refuse("pre", early, `Stopped before running the gate. ${untouched}`);
  }

  console.log(`deploy-guard pre: running the bare acceptance gate (${GATE.cmd} ${GATE.args.join(" ")})`);
  inputs.gate = await runGate();
  // The gate runs long enough for the checkout to move under it, so the local
  // facts are read afresh and the verdict is on what is there now.
  Object.assign(inputs, checkoutFacts());
  const v = verdict(inputs);
  if (!v.ok) return refuse("pre", v.failures, untouched);
  const at = inputs.head.slice(0, SHORT_ID);
  pass(`deploy-guard pre: ok - ${RELEASE_BRANCH} at ${at} is clean, pushed, gated and sealed`);
}

function post() {
  const inputs = {
    stage: "post",
    seal: readSeal(),
    trees: headTrees(),
    nodeMajor: NODE_MAJOR,
    dist: distHashes(),
  };
  const v = verdict(inputs);
  if (!v.ok) return refuse("post", v.failures, "Nothing was published.");
  pass(`deploy-guard post: ok - the built dist is the sealed one, ${Object.keys(inputs.dist).length} files`);
}

async function main(argv) {
  // A failure until a complete verdict says otherwise.
  process.exitCode = 1;

  const problems = selfCheck();
  if (problems.length > 0) {
    console.error("deploy-guard: the guard failed its own demonstration, so nothing it says can be trusted");
    for (const p of problems) console.error(`  ${p}`);
    return;
  }
  console.log(`deploy-guard: ${SEEDS.length} seeded defects refused, each for its own reason`);

  const commands = { seal, pre, post };
  if (argv.length !== 1 || !Object.hasOwn(commands, argv[0])) {
    console.error(USAGE);
    return;
  }
  await commands[argv[0]]();
}

/** Run unless this file is provably being imported by another script. Any
 *  doubt runs the shell, because the one outcome that must not happen is a
 *  guard that exits clean having checked nothing. With no entry script at all
 *  (code evaluated from the command line), the runtime's own word that this
 *  module is not the entry point is the proof; a runtime that does not say
 *  leaves the doubt, and the shell runs. */
function importedBy(entry) {
  if (entry === undefined) return import.meta.main === false;
  try {
    return realpathSync(entry) !== realpathSync(SELF);
  } catch {
    return false;
  }
}

if (!importedBy(process.argv[1])) await main(process.argv.slice(2));
