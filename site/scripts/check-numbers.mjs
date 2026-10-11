/**
 * The honesty check, at source level.
 *
 * The first rule (README, The rules) is that every displayed or quoted number comes from a
 * script output and never from a keystroke, and its third is that every material
 * property of a mark derives from a measurement. Neither was enforced by
 * anything, and both had failed in the shipped source: "ELEVEN WEEKS" for a
 * corpus spanning 89 days, "a 514-second loop" for a schedule totalling 500, a
 * comment claiming 2,772 strokes against an artifact holding 2,739.
 *
 * Three passes, each with its own committed allowlist and a one-line
 * justification per entry (numbers-allowlist.json):
 *
 *   1  DISPLAY   a string or template literal carrying a digit. If the piece
 *                prints it, it must come from an artifact.
 *   2  COMMENTS  a number in a comment that also appears in data/processed/.
 *                If the number is in an artifact, read it from the artifact -
 *                a comment restating one is a copy that will go stale, and two
 *                already had.
 *   3  MATERIAL  a numeric literal reaching a material sink - anything that
 *                sets a mark's radius, stroke width, alpha, colour, bead count,
 *                pooling or falloff - outside site/src/scalars.ts. Grain is a
 *                measurement, so the number behind one has to be declared,
 *                classified and disclosed rather than sitting inline.
 *
 * SCOPE. site/src/**\/*.ts, minus:
 *   scalars.ts    it IS the register; the literals live there on purpose
 *   probe/**      diagnostics. They never draw a gallery frame, they exist to
 *                 grade renderers, and a check that fails on an instrument is
 *                 failing on the wrong thing. Their surface constants (1280,
 *                 720, DPR 2, 16.67 ms) are the instrument's calibration and
 *                 are meaningless to the piece. Pass 2 still runs on them,
 *                 because a probe quoting a stale pipeline figure is exactly
 *                 as wrong as a renderer doing it.
 *
 * Composition literals - fade windows, phase thresholds, slug positions, column
 * widths - are deliberately NOT in scope for pass 3: they are composition, not
 * material, and they move whenever the piece is recomposed. The register is
 * built so that scope can be widened by adding sinks rather than by
 * redesigning anything.
 *
 * Usage: npm run check:numbers   (also runs inside npm run build, before tsc)
 */

import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, "../src");
const PROCESSED = resolve(here, "../../data/processed");
const ALLOWLIST = resolve(here, "numbers-allowlist.json");

const SKIP_DISPLAY = [/^scalars\.ts$/, /^probe\//];

/**
 * THE MARK LAYERS. Pass 3 runs here and nowhere else, and the limit is
 * deliberate rather than incidental.
 *
 * These modules deposit the marks that stand for measurements, and "grain is a
 * measurement, not a mood" is a claim about exactly them. The list began as the
 * files where inline material literals were first found, plus marks.ts (whose
 * INK reaches the live pin through INK_TOTAL) and modes/measure.ts (whose
 * caliper is the most literal mark-as-measurement in the piece), and it has
 * been widened each time a renderer file was added.
 *
 * THE COUNT IS NOT WRITTEN HERE. This sentence once said "these five modules"
 * long after the array below had twelve entries — a stale count inside the
 * file that IS the source of truth for the list. Read the array.
 *
 * OUT OF SCOPE when the list began, recorded as a limit rather than an
 * oversight: typography (inscription.ts, textatlas.ts), the engraving
 * (plate.ts), the tallies and labels (census.ts, ledger.ts), the rail, and every
 * composition literal - fade windows, phase thresholds, slug positions, column
 * widths. Several of those files have since been added below, which is the
 * point: the list widens without redesigning anything - add a file here, add
 * its scalars to src/scalars.ts.
 */
const MARK_LAYERS = [
  /^field\.ts$/,
  /^bloom\.ts$/,
  /^marks\.ts$/,
  /^modes\/hand\.ts$/,
  /^modes\/measure\.ts$/,
  // THE HAND's accumulating layers live here. It declares no material scalar
  // today - it is caching machinery - but it is the file a future rebuild would
  // most naturally hide one in, which is exactly what this list is for.
  /^prefix\.ts$/,
  // Typography is a material property too, so this list reaches it:
  // `drawSlug`'s three ranks and the struck numeral's face and shadow are
  // authored, so they belong in the register like any other mark's alpha. The
  // file's composition literals - the strike/hold/migrate beats, the annulus,
  // the weight curve - reach no material sink and stay out of pass 3's scope.
  /^inscription\.ts$/,
  // These three were added BEFORE the literals they are there to catch.
  //
  // The failure this closes is invisible: the build stays green while rule 3's
  // enforcement quietly stops reaching new code, so a scalar written into an
  // uncovered file is not caught by anything and looks exactly like one that was
  // checked. modes/ledger.ts once had fifteen authored scalars registered while
  // the file itself sat outside this list, which is that gap in its purest form.
  //
  // ledger.ts — THE LEDGER's spoken register.
  // census.ts — the filing: every word's size is a measured share and
  //   the strike's own material lives in scalars.ts, not in the renderer.
  // palette.ts — THE FIELD's seven hues. These reach `rgba(` by
  //   definition, and the point of the palette artifact is that the values are
  //   no longer written here at all.
  /^modes\/ledger\.ts$/,
  /^modes\/census\.ts$/,
  /^palette\.ts$/,
  // These two were added in the commit that CREATES them and before the first
  // material literal either one holds — which is the whole discipline, because
  // the failure is silent in the safe-looking direction. A renderer outside this
  // list ships every inline radius and alpha green, and since nothing fails
  // there is no signal to come back and check.
  //
  // modes/stack.ts       — THE STACK, which composites the other hands' material
  //   over one shared base and therefore declares dims, alphas and widths of its
  //   own for every layer it composites.
  // modes/operations.ts  — the operation table. It holds NO material value today
  //   and is listed anyway: it is the file a material constant would most
  //   naturally be hidden in, sitting one import away from the renderer, and a
  //   list that only covers files that already failed is not a check.
  /^modes\/stack\.ts$/,
  /^modes\/operations\.ts$/,
  // Added in the commit BEFORE the coordinate it exists to catch — the same
  // discipline, and this time the file was already one edit away from holding a
  // hardcoded (0,0).
  //
  // modes/fieldlayer.ts — where the pin's fraction and now its COORDINATE are
  //   derived. It feeds six of the seven views through one `drawSeasonField`
  //   call, so a literal written here is a literal in every hand at once.
  /^modes\/fieldlayer\.ts$/,
  // Draws the act cues. Its pacing and anchor are composition, out
  // of pass-3 scope by the stated rule; the file is listed so a future
  // material literal here cannot hide.
  /^modes\/shared\.ts$/,
  // These two were added in the commit that CREATES them — the same
  // discipline, before the first material literal either one holds.
  //
  // game.ts — THE GAME's timing, plate idiom and event punctuation: line
  //   widths, bead radii and anchor alphas all reach material sinks.
  // wash.ts — THE WASH's tone, splat and lighter blits: the dried ground's
  //   entire materiality lives here.
  /^game\.ts$/,
  /^wash\.ts$/,
];

/** Sinks. A literal on a line that reaches one of these changes a mark. */
const MATERIAL_SINKS = [
  // Canvas material state, and colour.
  /\b(fillStyle|strokeStyle|globalAlpha|lineWidth|shadowBlur)\s*=/,
  /rgba?\(/,
  /createRadialGradient|addColorStop/,
  // A mark's geometry.
  /\.(arc|ellipse|arcTo)\(/,
  /\bview\.s\(/,
  // A material quantity being NAMED. field.ts deposits into a float buffer
  // rather than through the canvas API, so its splat radius, its tone curve and
  // its overlap normaliser reach no sink above - and those three were among the
  // first inline material literals found. A material scalar is material
  // wherever it is declared, so the declaration is a sink too.
  /\b\w*(radius|alpha|width|gain|overlap|tone|ink|drip|bore|splotch|soft|ceiling|bead|excess|lit|rad|serif)\w*\s*=[^=]/i,
];

/** Fragments that carry a digit but say nothing: units, colours, canvas ids. */
const DISPLAY_NOISE = [
  /^\s*$/,
  /^[\d.]+$/,                       // a bare number formatted elsewhere
  /^#[0-9a-fA-F]{3,8}$/,            // hex colour
  /^\d*\.?\d*(px|em|rem|%|s|ms|deg)$/,
  /^2d$/,
  /^0$/,
  /^[0-5]$/,                        // the rail's number-key cases
  /^rgba?\(/,
  /^-?\d+(\.\d+)?(px|%)?\s*$/,
];

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = resolve(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

/**
 * Split TypeScript into code, comments and string literals.
 *
 * Hand-rolled because this script is dependency-free on purpose (the zone gate
 * set that precedent) and because a regex cannot tell a `//` inside a string
 * from a comment - which is the one distinction all three passes rest on.
 * `${...}` inside a template is emitted as CODE, so a number in an interpolated
 * expression is judged as a literal and not as display copy.
 */
function scan(src) {
  const out = [];
  let i = 0;
  let line = 1;
  let codeFrom = 0;
  // A code span can be hundreds of lines long, so it has to remember where it
  // STARTED. Reporting it at the line the scanner happened to reach when the
  // span closed put every material finding at the wrong line.
  let codeLine = 1;
  const push = (kind, from, to, atLine) => {
    if (to > from) out.push({ kind, text: src.slice(from, to), line: atLine });
  };
  const flushCode = (to) => {
    push("code", codeFrom, to, codeLine);
  };
  const openCode = (at, atLine) => {
    codeFrom = at;
    codeLine = atLine;
  };
  // Depth of `${` nesting, so a template's closing backtick is not mistaken
  // for one belonging to an inner expression.
  const stack = [];
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "\n") line++;
    if (c === "/" && d === "/") {
      flushCode(i);
      const start = i;
      const at = line;
      while (i < src.length && src[i] !== "\n") i++;
      push("comment", start, i, at);
      openCode(i, line);
      continue;
    }
    if (c === "/" && d === "*") {
      flushCode(i);
      const start = i;
      const at = line;
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") line++;
        i++;
      }
      i = Math.min(src.length, i + 2);
      push("comment", start, i, at);
      openCode(i, line);
      continue;
    }
    if (c === '"' || c === "'") {
      flushCode(i);
      const quote = c;
      const at = line;
      i++;
      const start = i;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\") i++;
        else if (src[i] === "\n") break;
        i++;
      }
      push("string", start, i, at);
      i++;
      openCode(i, line);
      continue;
    }
    if (c === "`") {
      flushCode(i);
      i++;
      let chunk = i;
      const at = line;
      for (;;) {
        if (i >= src.length) break;
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === "\n") line++;
        if (src[i] === "$" && src[i + 1] === "{") {
          push("string", chunk, i, at);
          i += 2;
          const exprFrom = i;
          let depth = 1;
          while (i < src.length && depth) {
            if (src[i] === "{") depth++;
            else if (src[i] === "}") depth--;
            else if (src[i] === "\n") line++;
            if (depth) i++;
          }
          push("code", exprFrom, i, at);
          i++;
          chunk = i;
          continue;
        }
        if (src[i] === "`") break;
        i++;
      }
      push("string", chunk, i, at);
      i++;
      openCode(i, line);
      continue;
    }
    i++;
  }
  flushCode(src.length);
  return { spans: out, stack };
}

/** Every scalar in every processed artifact, as formatted strings. */
async function artifactNumbers() {
  const seen = new Set();
  const add = (n) => {
    if (typeof n !== "number" || !Number.isFinite(n)) return;
    seen.add(String(n));
    seen.add(n.toLocaleString("en-US"));
    if (!Number.isInteger(n)) {
      for (const dp of [1, 2, 3, 4]) seen.add(n.toFixed(dp));
      for (const dp of [1, 2, 3]) seen.add((100 * n).toFixed(dp));
    }
    if (Number.isInteger(n)) {
      seen.add(String(Math.round(n / 1000) * 1000));
      seen.add((Math.round(n / 1000) * 1000).toLocaleString("en-US"));
    }
  };
  const walkVal = (v) => {
    if (Array.isArray(v)) v.forEach(walkVal);
    else if (v && typeof v === "object") {
      for (const [k, val] of Object.entries(v)) {
        const asNum = Number(k);
        if (Number.isFinite(asNum)) add(asNum);
        walkVal(val);
      }
    } else add(v);
  };
  const files = [];
  const collect = async (dir) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = resolve(dir, e.name);
      if (e.isDirectory()) await collect(p);
      else if (e.name.endsWith(".json")) files.push(p);
    }
  };
  await collect(PROCESSED);
  for (const f of files) {
    try {
      walkVal(JSON.parse(await readFile(f, "utf8")));
    } catch {
      /* a corrupt artifact is qa.py's problem, not this script's */
    }
  }
  return seen;
}

/**
 * Numbers spelled as words. The rule is about the claim, not the glyph:
 * "eleven weeks" was as wrong as "11 weeks" would have been, and it lived
 * as long as it did precisely because nothing looking for digits saw it.
 *
 * NINE AND ABOVE ONLY, and that line is drawn deliberately. Below it the words
 * are overwhelmingly structural rather than quantitative - "one body, one
 * stroke", "two records disagreeing", "the four beats", "six taxonomies" - and
 * flagging them produced 168 findings against a handful of real ones, which is
 * a check nobody reads. From nine up they are almost always a measurement being
 * restated: "nine phrases exist in the whole season", "forty-eight by 2024-25",
 * "twenty needed for the same ninety per cent".
 */
const WORD_NUMBERS =
  /\b(nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million)\b/gi;

/**
 * What this pass CANNOT see, stated rather than implied.
 *
 * A bare one- or two-digit integer in a comment is below the floor: at two
 * digits the false-positive rate swamps the signal, so `9 in 1996-97, 48 by
 * 2024-25` is not caught by the digit rule and is caught, if at all, by the
 * word rule above. Comments of that shape were rewritten by hand when this pass
 * was written; a future one is a reader's job. The check is a floor, not a
 * proof.
 */
const SEASON_LABEL = /\d{4}-\d{2}(?:-\d{2})?/g;

/** A citation, not a quantity: "section 1.4-1.5", "§3.2". */
const SECTION_REF = /(?:section|§)\s*\d+(?:\.\d+)*(?:\s*-\s*\d+(?:\.\d+)*)?/gi;

function commentNumbers(text) {
  // Season labels and ISO dates are IDENTIFIERS - "1996-97" is the record's own
  // name for a season, not a quantity - so they are removed before the scan
  // rather than allowlisted thirty times over.
  const masked = text
    .replace(SECTION_REF, (m) => "#".repeat(m.length))
    .replace(SEASON_LABEL, (m) => "#".repeat(m.length));
  const hits = [];
  // Three or more digits, or anything carrying a decimal point, a thousands
  // comma or a percent sign. Below that the signal drowns: 0..1, 25 Hz, 8-bit.
  const re = /\d{1,3}(?:,\d{3})+|\d+\.\d+\s*%?|\d{3,}|\d+(?:\.\d+)?\s*%/g;
  let m;
  while ((m = re.exec(masked))) hits.push(m[0].trim());
  return hits;
}

function isAllowed(list, file, needle) {
  return list.some(
    (e) =>
      (!e.file || e.file === file) &&
      (e.text === undefined || e.text === needle) &&
      (e.contains === undefined || needle.includes(e.contains)),
  );
}

async function main() {
  const allow = JSON.parse(await readFile(ALLOWLIST, "utf8"));
  const numbers = await artifactNumbers();
  const files = (await walk(SRC)).sort();
  const findings = [];

  for (const abs of files) {
    const file = relative(SRC, abs).split("\\").join("/");
    const src = await readFile(abs, "utf8");
    const { spans } = scan(src);
    const lines = src.split("\n");

    for (const s of spans) {
      // --- 1. display copy ---------------------------------------------------
      if (s.kind === "string" && !SKIP_DISPLAY.some((r) => r.test(file))) {
        const t = s.text;
        if (/\d/.test(t) && !DISPLAY_NOISE.some((r) => r.test(t))) {
          if (!isAllowed(allow.display ?? [], file, t)) {
            findings.push({
              pass: "display",
              file,
              line: s.line,
              what: JSON.stringify(t),
              why: "a printed string carrying a digit: read it from an artifact, or allowlist it with a reason",
            });
          }
        }
      }

      // --- 2. comments quoting the pipeline ----------------------------------
      if (s.kind === "comment") {
        for (const n of new Set(commentNumbers(s.text))) {
          const bare = n.replace(/[\s%]/g, "");
          const inArtifact = numbers.has(bare) || numbers.has(bare.replace(/,/g, ""));
          const looksMeasured = /,|%/.test(n);
          if ((inArtifact || looksMeasured) && !isAllowed(allow.comments ?? [], file, n)) {
            findings.push({
              pass: "comment",
              file,
              line: s.line,
              what: n,
              why: inArtifact
                ? "this number is a value in data/processed/: name the key, never the value"
                : "a measured-looking figure in a comment: name the artifact key instead",
            });
          }
        }
        for (const w of new Set((s.text.match(WORD_NUMBERS) ?? []).map((x) => x.toLowerCase()))) {
          if (!isAllowed(allow.words ?? [], file, w)) {
            findings.push({
              pass: "comment",
              file,
              line: s.line,
              what: w,
              why: "a quantity spelled as a word is still a quantity: derive it or allowlist it",
            });
          }
        }
      }

      // --- 3. material literals ----------------------------------------------
      if (s.kind === "code" && MARK_LAYERS.some((r) => r.test(file))) {
        // Walk the span's own lines so a sink is judged with its context.
        const from = s.line;
        const text = s.text.split("\n");
        text.forEach((chunk, k) => {
          const lineNo = from + k;
          const whole = lines[lineNo - 1] ?? chunk;
          if (!MATERIAL_SINKS.some((r) => r.test(whole))) return;
          // Scientific notation is one token: `1e-6` is a divide-by-zero
          // guard, not a material scalar, and reading `6` out of it is noise.
          const nums = chunk.replace(/\d+e[+-]?\d+/gi, "#")
            .match(/(?<![\w.$])\d+(\.\d+)?/g) ?? [];
          for (const n of new Set(nums)) {
            if (n === "0" || n === "1" || n === "2") continue; // identities and the plane
            if (isAllowed(allow.material ?? [], file, `${lineNo}:${n}`)) continue;
            if (isAllowed(allow.material ?? [], file, whole.trim())) continue;
            findings.push({
              pass: "material",
              file,
              line: lineNo,
              what: n,
              why: "a material literal inline in a renderer: declare it in src/scalars.ts with a class and a `controls` line",
            });
          }
        });
      }
    }
  }

  const byPass = { display: [], comment: [], material: [] };
  for (const f of findings) byPass[f.pass].push(f);

  for (const [pass, list] of Object.entries(byPass)) {
    if (!list.length) continue;
    console.error(`\n${pass.toUpperCase()} — ${list.length} finding(s)`);
    for (const f of list) {
      console.error(`  ${f.file}:${f.line}  ${f.what}`);
      console.error(`      ${f.why}`);
    }
  }

  if (findings.length) {
    console.error(
      `\ncheck-numbers: ${findings.length} finding(s) across ${files.length} files.\n` +
        `Every number the piece shows or quotes resolves to data/processed/ (rule 1, README),\n` +
        `and every material scalar is declared in src/scalars.ts (rule 3).`,
    );
    process.exit(1);
  }
  console.log(
    `check-numbers: clean — ${files.length} files, ${numbers.size} artifact scalars loaded, ` +
      `${(allow.display ?? []).length + (allow.comments ?? []).length + (allow.words ?? []).length + (allow.material ?? []).length} allowlisted.`,
  );
}

await main();
