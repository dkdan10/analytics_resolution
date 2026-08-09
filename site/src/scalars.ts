/** The material register — one source of truth for every number behind a mark.
 *
 * CLAUDE.md's third rule: grain is a measurement, not a mood. Every material
 * property of a mark derives from a measured property of the record, and any
 * scalar that genuinely cannot be measured is NAMED, ISOLATED AND DISCLOSED.
 *
 * The first two-thirds of that were only half true. Radius multipliers, falloff
 * exponents, luminance floors, opacity caps, bead caps, pooling multipliers and
 * gradient stops sat inline in five renderers, and THE HAND announced DRIP as
 * "the one authored scalar in this hand" eight lines above a comment recording
 * that BORE had been looked at by eye. The last third — disclosure — did not
 * exist at all.
 *
 * So every material scalar in the mark layers is declared here, exactly once,
 * with three things:
 *
 *   class      measured   it comes from data/processed/. These carry NO value:
 *                         they name the artifact key and the renderer reads it,
 *                         because a measurement copied into source is not a
 *                         measurement any more.
 *              geometry   it is the floor, the rule book, or physics. Not
 *                         chosen and not measurable from the record - the arc
 *                         is 23'9" because the NBA drew it there.
 *              authored   nobody measured it. It is a decision, and this is the
 *                         only place in the piece one may be written down.
 *   material   does moving it change a MARK - its radius, width, alpha, colour,
 *              bead count, pooling, falloff or tone? Some entries here are
 *              pacing or typography and say so.
 *   controls   one line: what a viewer sees change when this moves. This is the
 *              disclosure, and `npm run disclose` renders it.
 *
 * ENFORCEMENT. `site/scripts/check-numbers.mjs` fails the build when a material
 * literal appears inline in a mark layer — read `MARK_LAYERS` there for the
 * list rather than trusting a sentence here, which is how this one came to omit
 * `prefix.ts` and then `inscription.ts`. It cannot be bypassed by writing a new
 * renderer: add a file to that list and its scalars have to come from here.
 *
 * SCOPE IS DELIBERATELY PARTIAL AND SAYING SO IS PART OF THE DISCLOSURE. The
 * list covers the layers that deposit marks, plus (since V-08) the type ranks
 * the piece speaks at. It does NOT cover composition — where a slug sits, how
 * long a numeral holds before it migrates, which act a thing appears in. Those
 * are session 5b's, and widening the list is how they come in.
 *
 * SESSION 4, READ THIS. THE HAND is rebuilt against F-04 and V-07 and nearly
 * every scalar below marked `hand` will be rewritten. New material scalars go
 * HERE, with a class and a `controls` line. The check is what stops the rebuild
 * from quietly undoing this.
 */

type Entry =
  | { class: "authored" | "geometry"; value: number; material: boolean; controls: string }
  | { class: "measured"; material: boolean; controls: string; from: string };

export const SCALARS = {
  // --- field.ts — every shot, baked into one image -------------------------
  TONE_K: {
    class: "authored",
    value: 35000,
    material: true,
    controls:
      "the tone curve's slope: how fast a coordinate's share of its season " +
      "saturates toward full brightness. Lower and the record's long tail sinks " +
      "into the ground while a handful of dense cells carry the image; higher and " +
      "the whole plate flattens to a uniform glow.",
  },
  TONE_CEILING: {
    class: "authored",
    value: 0.92,
    material: true,
    controls:
      "the brightest any cell may reach, held below 1 so nothing clips before " +
      "the per-frame dim is applied — clipping first would darken exactly the " +
      "dense rim the piece's argument lives on.",
  },
  SPLAT_MIN_PX: {
    class: "authored",
    value: 1.5,
    material: true,
    controls:
      "the smallest splat radius in device pixels, so a coordinate still deposits " +
      "something at small window sizes.",
  },
  SPLAT_SPACING_K: {
    class: "authored",
    value: 1.45,
    material: true,
    controls:
      "splat radius as a multiple of the lattice spacing — how far neighbouring " +
      "coordinates bleed together. Below about 1 the field reads as a mechanical " +
      "dot-screen of the record's grid rather than as a photographic density.",
  },
  FALLOFF_DISC_INTEGRAL: {
    class: "geometry",
    value: 0.5,
    material: true,
    controls:
      "the overlap normaliser. The peak-1 paraboloid falloff integrates to " +
      "pi*R^2/2 over its own disc, so dividing by that keeps a coordinate's " +
      "DENSITY setting its brightness and leaves SPLAT_SPACING_K controlling " +
      "smoothness only. Derived, not chosen: change the falloff and this changes " +
      "with it.",
  },

  // --- bloom.ts — Act III's traces -----------------------------------------
  RIM_FT: {
    class: "geometry",
    value: 10,
    material: true,
    controls:
      "the rim's height above the floor, the scale the ball's third dimension is " +
      "normalised against. The rule book's number, not a choice.",
  },
  TRACE_LIT_FLOOR: {
    class: "authored",
    value: 0.1,
    material: true,
    controls: "how lit a trace is at floor level, before the ball's height adds any.",
  },
  TRACE_LIT_RANGE: {
    class: "authored",
    value: 0.62,
    material: true,
    controls:
      "how much luminance the ball's measured height adds between the floor and " +
      "the rim. This is the one channel the machine saw in three dimensions, so " +
      "it is the only channel that changes along a trace.",
  },
  TRACE_HEIGHT_CLAMP: {
    class: "authored",
    value: 1.4,
    material: true,
    controls:
      "how far above the rim a ball may go on brightening; above this the arc " +
      "stops getting lighter.",
  },
  TRACE_W_IN_FLIGHT: {
    class: "authored",
    value: 1.5,
    material: true,
    controls: "stroke width of the shot itself, relative to the approach.",
  },
  TRACE_W_APPROACH: {
    class: "authored",
    value: 1.0,
    material: true,
    controls: "stroke width of the gesture before release.",
  },
  TRACE_W_SCALE: {
    class: "authored",
    value: 0.55,
    material: true,
    controls: "how fast trace width grows with the plate, so a gesture keeps its weight across window sizes.",
  },
  TRACE_APPROACH_DIM: {
    class: "authored",
    value: 0.72,
    material: true,
    controls: "how much quieter the approach is than the flight after release.",
  },
  TRACE_ANCHOR_ALPHA: {
    class: "authored",
    value: 0.8,
    material: true,
    controls: "the dot a trace grew out of, held brighter than the field around it.",
  },
  TRACE_ANCHOR_MIN_PX: {
    class: "authored",
    value: 1.2,
    material: true,
    controls: "smallest anchor-dot radius in pixels, so it survives a small window.",
  },
  TRACE_ANCHOR_SCALE: {
    class: "authored",
    value: 0.9,
    material: true,
    controls: "anchor-dot radius as a multiple of the plate scale.",
  },

  // --- marks.ts — the dot ladder and the pin -------------------------------
  INK: {
    class: "authored",
    value: 9.0,
    material: true,
    controls:
      "the light ONE mark deposits, in CSS px^2 of alpha. Ink is conserved: a " +
      "season's shots lay down the same total however finely they were recorded, " +
      "so resolution changes how the light is SPREAD and never how much there is. " +
      "Every stamp is normalised to this by measuring what its sprite actually " +
      "deposits rather than by deriving it.",
  },
  INK_REFERENCE_MARKS: {
    class: "authored",
    value: 2000,
    material: true,
    controls:
      "how many marks a season's ink budget is reckoned in, which sets the pin's " +
      "radius against the baked field. This was the sample size the ink rule was " +
      "calibrated on, kept when THE FIELD switched from the 2,000-dot sample to " +
      "every shot so that the pin's weight did not move. It is a calibration " +
      "reference now and no longer reads anything, which session 5 may want to " +
      "re-derive from the layer it is balanced against.",
  },
  PIN_CORE_ALPHA: {
    class: "authored",
    value: 0.62,
    material: true,
    controls:
      "the pin's centre opacity. The pin is the densest thing on the plate " +
      "because it is a pile, and its radius is solved from this so that its area " +
      "carries exactly the ink of the shots inside it.",
  },
  PIN_MEAN_ALPHA_K: {
    class: "authored",
    value: 0.7,
    material: true,
    controls:
      "the gradient's mean opacity as a fraction of its core, which is what turns " +
      "the pin's ink budget into a radius. Move it and the pile changes size " +
      "without changing how much light it lays down.",
  },
  PIN_STOP_MID: {
    class: "authored",
    value: 0.72,
    material: true,
    controls: "where the pin's gradient begins to fall — a definite edge, not a bloom.",
  },
  PIN_STOP_MID_ALPHA_K: {
    class: "authored",
    value: 0.92,
    material: true,
    controls: "opacity at that stop, as a fraction of the core.",
  },
  PIN_STOP_OUTER: {
    class: "authored",
    value: 0.9,
    material: true,
    controls: "where the pin's edge turns over into its final falloff.",
  },
  PIN_STOP_OUTER_ALPHA_K: {
    class: "authored",
    value: 0.45,
    material: true,
    controls: "opacity at the outer stop, as a fraction of the core.",
  },
  STAMP_MIN_R_PX: {
    class: "authored",
    value: 0.6,
    material: true,
    controls: "smallest stamp radius in CSS pixels, so a mark never vanishes entirely.",
  },
  STAMP_GRAD_MIN_R: {
    class: "authored",
    value: 0.5,
    material: true,
    controls:
      "floor on the stamp gradient's outer radius, so a sub-pixel mark still has " +
      "a gradient to normalise rather than a degenerate one.",
  },
  STAMP_CORE_ALPHA: {
    class: "authored",
    value: 0.55,
    material: true,
    controls: "the stamp gradient's mid stop — how hard or soft a dot's own edge reads.",
  },
  STAMP_MIN_CORE: {
    class: "authored",
    value: 0.02,
    material: true,
    controls: "floor on the gradient's core stop, so the fully diffuse hand still has one.",
  },
  STAMP_MAX_GAIN: {
    class: "authored",
    value: 0.95,
    material: true,
    controls:
      "opacity ceiling on a normalised stamp, so a very small sprite cannot be " +
      "asked for more light than an 8-bit channel can carry.",
  },
  SHARP_R: {
    class: "authored",
    value: 1.7,
    material: true,
    controls:
      "radius, in court tenths, of a mark the record placed to the tenth of a " +
      "foot. Court units and not pixels: the era's grain must not change with the " +
      "window it is shown on.",
  },
  SHARP_SOFTNESS: {
    class: "authored",
    value: 0.3,
    material: true,
    controls: "edge diffusion of that mark — how definitely the record placed this KIND of shot.",
  },
  COARSE_R: {
    class: "authored",
    value: 3.3,
    material: true,
    controls: "radius of a mark this era's record placed only loosely — the same ink, spread wide.",
  },
  COARSE_SOFTNESS: {
    class: "authored",
    value: 0.95,
    material: true,
    controls: "edge diffusion of the coarse hand.",
  },

  // --- modes/hand.ts — the paint -------------------------------------------
  DRIP: {
    class: "authored",
    value: 0.055,
    material: true,
    controls:
      "paint deposited per tracked frame. The brush's flow rate, and the scalar " +
      "every width and opacity in the paint is derived from: ink is conserved " +
      "against TIME, so w*a = DRIP/v and a body that runs lays a thin faint " +
      "filament while one that pivots pools.",
  },
  BORE: {
    class: "authored",
    value: 1.15,
    material: true,
    controls:
      "the filament's radius in court tenths at the median measured speed — the " +
      "brush's width. Set by eye against the canvas's own accumulation: paint " +
      "COVERS, so at 2.4 with a heavier DRIP the plate went to opaque mush and a " +
      "stroke laid last could no longer be seen on top of the ones before it.",
  },
  RAYLEIGH: {
    class: "geometry",
    value: 9.02,
    material: true,
    controls:
      "Plateau-Rayleigh: the fastest-growing instability on a falling stream has " +
      "a wavelength of 9.02 radii, so past it a filament cannot wet a continuous " +
      "line and beads instead. Physics, not a tuning knob — it is what makes the " +
      "fastest bodies dotted.",
  },
  FILAMENT_ALPHA_CAP: {
    class: "authored",
    value: 0.95,
    material: true,
    controls: "opacity ceiling on one filament segment, so the slowest bodies cannot go fully opaque.",
  },
  FILAMENT_ALPHA_K: {
    class: "authored",
    value: 0.5,
    material: true,
    controls: "how much of DRIP reaches opacity rather than width when ink is split between the two.",
  },
  BEAD_CAP: {
    class: "authored",
    value: 24,
    material: true,
    controls:
      "the most beads one broken segment may lay. A bound on work, not on " +
      "physics: past it the beads are closer than a pixel anyway.",
  },
  POOL_EXCESS_K: {
    class: "authored",
    value: 0.5,
    material: true,
    controls: "how much of the ink a capped filament refuses becomes a blot, for a body standing still.",
  },
  POOL_V_FLOOR: {
    class: "authored",
    value: 0.05,
    material: true,
    controls: "speed floor in the pooling term, so a body at rest gives a finite blot rather than an infinite one.",
  },
  POOL_ALPHA_CAP: {
    class: "authored",
    value: 0.9,
    material: true,
    controls: "opacity ceiling on a blot.",
  },
  POOL_ALPHA_K: {
    class: "authored",
    value: 1.1,
    material: true,
    controls: "how much darker a blot is than the filament it grew out of.",
  },
  POOL_R_CAP: {
    class: "authored",
    value: 3.2,
    material: true,
    controls: "the widest a blot may spread, as a multiple of the filament's radius.",
  },
  SPLOTCH_INK: {
    class: "authored",
    value: 9000,
    material: true,
    controls:
      "ink for the window's drop layer, divided equally between its shots, so " +
      "the layer weighs the same whatever the recovered set turns out to hold. " +
      "Conserved the way marks.ts conserves it for dots. The seasons outside " +
      "the window conserve theirs by AREA instead and use DROP_AREA.",
  },
  SPLOTCH_MIN_R: {
    class: "authored",
    value: 2.6,
    material: true,
    controls:
      "radius, in court tenths, of the most tightly contested shot in the window " +
      "— and of every shot outside it, where the record does not say how open " +
      "anyone was.",
  },
  SPLOTCH_MAX_R: {
    class: "authored",
    value: 9.0,
    material: true,
    controls:
      "radius of the most open shot the transfer function draws. Deliberately fat: " +
      "THE FIELD already draws every shot as a photographic density, and at the " +
      "same size this hand would simply BE THE FIELD with a different caption.",
  },
  SPLOTCH_ALPHA_CAP_WINDOW: {
    class: "authored",
    value: 0.34,
    material: true,
    controls:
      "opacity ceiling on a drop inside the window. A MATERIAL cap - the most " +
      "ink one mark may hold - and no longer a fade cap: the frame's own alpha " +
      "used to be folded in before it, so how hard it bound depended on how far " +
      "the coda had receded. It is now applied to the unmultiplied value and the " +
      "frame's alpha multiplies the finished layer.",
  },
  DROP_AREA: {
    class: "authored",
    value: 250000,
    material: true,
    controls:
      "the total area of paint one season lays down outside the window, in court " +
      "tenths squared, divided between its coordinates in proportion to their " +
      "SHARE of that season. It is what makes a drop's radius carry how many " +
      "shots landed there. Fixed across all thirty seasons and reckoned in share " +
      "rather than count, for the reason field.ts:tone gives: normalising each " +
      "season to its own maximum would falsely equalise them, and the lockout " +
      "years and the bubble are short, not sparse.",
  },
  DROP_MIN_R: {
    class: "authored",
    value: 1.0,
    material: true,
    controls:
      "the smallest drop the brush makes, in court tenths. A coordinate whose " +
      "share would spread thinner than this still deposits all of its ink - what " +
      "area refuses goes to opacity instead - so nothing the record filed is " +
      "dropped and the conservation stays exact at both ends of the range.",
  },
  DROP_MAX_R: {
    class: "authored",
    value: 20,
    material: true,
    controls:
      "the widest a drop may spread. It binds only where the record piles an " +
      "extraordinary share of a season onto one coordinate, which it does: past " +
      "this the mark would read as a region of the floor rather than as a place.",
  },
  DROP_ALPHA: {
    class: "authored",
    value: 0.19,
    material: true,
    controls:
      "how wet one drop is, outside the window - and it is CONSTANT, which is " +
      "this layer's whole material argument. THE FIELD varies brightness at a " +
      "fixed size and adds light; this varies size at a fixed opacity and " +
      "COVERS. At the same size and a varying opacity the two hands would be the " +
      "same picture with a different caption.",
  },
  KEPT_OVER_PAINT: {
    class: "authored",
    value: 0.55,
    material: true,
    controls:
      "how strongly the kept coordinates come back up over the painting through " +
      "THE INSTANT. Five seconds of body were recorded and one point was filed, " +
      "and this is that point asserting itself over the gesture it stands for. " +
      "Nothing new is drawn at all: it is the same layer composited a second " +
      "time, above instead of below.",
  },
  SPLOTCH_VISIBLE: {
    class: "authored",
    value: 0.004,
    material: true,
    controls: "below this opacity a splotch is skipped — it would deposit less than one 8-bit level.",
  },
  SPLOTCH_SCALE_AT: {
    class: "measured",
    material: true,
    controls:
      "THE SPLOTCH TRANSFER FUNCTION'S REFERENCE. A splotch's radius rises with " +
      "how open the shooter was, and this is the caliper length that reaches " +
      "SPLOTCH_MAX_R; the ~1% of shots beyond it draw at the maximum. It used to " +
      "be 255 — the old one-byte STORAGE CEILING of window_measures.bin, a " +
      "property of the file format and not of basketball (audit F-05). It is now " +
      "the 99th percentile of the measured distribution the hand is drawing.",
    from: "window.json:contest.caliper_ft.p99",
  },
  PAINT_SPEED_REGIMES: {
    class: "measured",
    material: true,
    controls:
      "the three paint regimes' boundaries — below p10 the filament caps and " +
      "pools, above p90 it beads. The record's own measured speed percentiles, " +
      "never chosen numbers.",
    from: "paint.json:speed_ft_s.p10 / .p50 / .p90",
  },

  // --- modes/measure.ts — the caliper --------------------------------------
  CALIPER_SERIF: {
    class: "authored",
    value: 3.2,
    material: true,
    controls:
      "half-length of the serif at each end of a caliper, in pixels. The serifs " +
      "are what make the segment read as a measurement rather than as a line.",
  },
  CALIPER_SERIF_FLOOD: {
    class: "authored",
    value: 1.8,
    material: true,
    controls: "the same serif during the flood, where 150 calipers are on the plate at once.",
  },
  CALIPER_SERIF_CLOSE: {
    class: "authored",
    value: 2.2,
    material: true,
    controls: "the serif over the closing beat, as the calipers come back off the floor.",
  },
  DEFENDER_RING_R: {
    class: "authored",
    value: 9,
    material: true,
    controls:
      "the defender's ring, in court tenths — open and never filled, because the " +
      "feed gave the ball a third dimension and the players none.",
  },
  HERO_ALPHA: {
    class: "authored",
    value: 0.85,
    material: true,
    controls: "the opening beat's caliper strength, where one shot is being watched.",
  },
  HERO_RING_ALPHA: {
    class: "authored",
    value: 0.7,
    material: true,
    controls: "the defender ring's strength against its caliper.",
  },
  HERO_PATH_ALPHA: {
    class: "authored",
    value: 0.16,
    material: true,
    controls: "the ground the defender has already covered, faint enough that the closing reads as the subject.",
  },
  HERO_TAIL: {
    class: "authored",
    value: 0.35,
    material: true,
    controls: "how long a hero shot fades out over, as a fraction of its own quarter of the beat.",
  },
  FLOOD_ALPHA_BASE: {
    class: "authored",
    value: 0.045,
    material: true,
    controls:
      "the strength of an accumulated caliper behind the flood's leading edge — " +
      "low enough that the eye follows the writing rather than swimming in the tangle.",
  },
  FLOOD_ALPHA_FRESH: {
    class: "authored",
    value: 0.34,
    material: true,
    controls: "the extra strength of the newest caliper at the flood's edge.",
  },
  CLOSE_ALPHA: {
    class: "authored",
    value: 0.25,
    material: true,
    controls: "the calipers' strength over the closing beat, as the plate is emptied.",
  },
  INSTANT_LINE_ALPHA: {
    class: "authored",
    value: 0.7,
    material: true,
    controls:
      "the hairline out from the hoop whose length IS the mean closest-defender " +
      "distance — the continuous quantity, before it is cut into four boxes.",
  },
  INSTANT_CUT_ALPHA: {
    class: "authored",
    value: 0.6,
    material: true,
    controls: "the three boundaries struck across that hairline: the moment the number is made.",
  },
  // Typography inside a mark layer. Declared here because these two modules
  // are in the check's scope and every draw-affecting number in them should be
  // findable in one place - but `material: false` says what they are: the type
  // beside a mark, not the mark. The rest of the piece's typography is
  // composition and is out of scope until session 5 (see check-numbers.mjs).
  FIGURE_SUB_ALPHA: {
    class: "authored",
    value: 0.55,
    material: false,
    controls: "the small caption under a struck figure, against the figure itself.",
  },
  NAMES_ONLY_ALPHA: {
    class: "authored",
    value: 0.5,
    material: false,
    controls:
      "Act II's four category names, struck with no figures beside them - the " +
      "league has begun publishing the measure and nobody outside can make it.",
  },
  BUCKET_LABEL_ALPHA: {
    class: "authored",
    value: 0.55,
    material: false,
    controls: "the four category names beside the boundaries, as the boxes are cut.",
  },
  // --- modes/ledger.ts — the scatter, and the register above it ------------
  SCATTER_TENTHS: {
    class: "authored",
    value: 4.75,
    material: false,
    controls:
      "the size of a label on a datapoint, in court tenths. NUMERICALLY WHAT IT " +
      "HAS ALWAYS BEEN - it was written as a multiple of the viewport's scale, " +
      "which happens to come to the same thing and hid the fact that a label is " +
      "half a foot tall on the floor. Expressed in court units so it cannot " +
      "drift from the marks it annotates.",
  },
  SCATTER_MIN_PX: {
    class: "authored",
    value: 8,
    material: false,
    controls: "a CSS-pixel floor for the scatter, so it survives a small window.",
  },
  SCATTER_ALPHA: {
    class: "authored",
    value: 0.3,
    material: false,
    controls:
      "the scatter's alpha ceiling, dropped from what it was so it sits UNDER " +
      "the spoken register rather than competing with it. This is the audit's " +
      "'secondary residue', and it is still every label the hand ever drew - " +
      "what changed is that there is now something above it.",
  },
  TERM_HEAD_TENTHS: {
    class: "authored",
    value: 30,
    material: false,
    controls:
      "the size of the head phrase AT THE REFERENCE SHARE, in court tenths - " +
      "the top of the type ladder. Every head term is this scaled by the square " +
      "root of its own share against the largest share any season reaches, so " +
      "AREA is proportional to the shots the word names, which is the law the " +
      "pin already obeys. The reference share itself is computed over the " +
      "corpus at load and is never written down.",
  },
  TERM_BIRTH_TENTHS: {
    class: "authored",
    value: 20,
    material: false,
    controls:
      "the size of a phrase the record is filing for the FIRST time. Authored " +
      "rather than share-scaled on purpose, and the margin line beneath it " +
      "discloses exactly what it is: most births are under one per cent, so " +
      "sizing the moment the archive learned a word by that word's share would " +
      "whisper it.",
  },
  TERM_NINETY_TENTHS: {
    class: "authored",
    value: 12,
    material: false,
    controls:
      "any phrase inside the season's ninety-per-cent set that is not the head.",
  },
  TERM_TAIL_TENTHS: {
    class: "authored",
    value: 9,
    material: false,
    controls:
      "anything outside it. Rarity is expressed as rarity of UTTERANCE, not as " +
      "smallness: shares span five decades and every continuous map of them - " +
      "root, log, linear - drops most of the vocabulary below the acuity limit. " +
      "A rare phrase is rare because the plate almost never says it, and when " +
      "it does it is said legibly.",
  },
  TERM_MARGIN_SCALE: {
    class: "authored",
    value: 0.3,
    material: false,
    controls: "the disclosure line under a birth, as a fraction of the term above it.",
  },
  TERM_HOLD_SECONDS: {
    class: "authored",
    value: 3,
    material: false,
    controls:
      "how long a spoken term stays on the plate. The one pacing scalar the " +
      "spoken register adds, and the reason the hand is readable at all: a " +
      "scatter label in the calmest season lives about a sixth of a second, " +
      "because the arrival edge moves far faster than a reader.",
  },
  TERM_CLEAR_PAD: {
    class: "authored",
    value: 0.35,
    material: false,
    controls:
      "cap heights of empty floor demanded around a spoken term before another " +
      "may be placed. Local emptiness is what makes a large word read; the " +
      "collision test is on boxes in court tenths, because a twelve-tenth " +
      "phrase is over a hundred tenths WIDE and point exclusion misses that.",
  },
  TERM_ALPHA_FRESH: {
    class: "authored",
    value: 0.85,
    material: false,
    controls: "a spoken term's ink when it is struck.",
  },
  TERM_ALPHA_AGED: {
    class: "authored",
    value: 0.4,
    material: false,
    controls:
      "and when it is about to go. It never reaches invisibility: a term that " +
      "fades to nothing reads as a fault rather than as a word being replaced.",
  },
  TERM_TIE_ALPHA: {
    class: "authored",
    value: 0.28,
    material: false,
    controls:
      "the hairline from the mark to the word. This is what keeps a three-foot " +
      "phrase reading as an ANNOTATION of one datapoint rather than as a " +
      "headline laid over the floor - the tie between description and shot, " +
      "made explicit.",
  },
  LEAGUE_NAME_TENTHS: {
    class: "authored",
    value: 13,
    material: false,
    controls:
      "the twelve names the league publishes instead of the geometry, all at " +
      "ONE size, and that is the argument: every other word on this plate is " +
      "sized by how many shots it names, and these cannot be, because the " +
      "record beneath them is not public. They were drawn at scatter size, " +
      "among two hundred action labels, so Act V's claim was invisible.",
  },
  LEAGUE_VALUE_SCALE: {
    class: "authored",
    value: 0.62,
    material: false,
    controls:
      "the recomputed figure under a league name in Act III, as a fraction of " +
      "the name. It was nearly the same size as the name and did not read as " +
      "subordinate to it.",
  },
  INSTANT_BAND_HALF_W: {
    class: "authored",
    value: 90,
    material: true,
    controls:
      "how far either side of the centreline a category boundary is drawn, in " +
      "court tenths - how wide the four boxes are. It carries NO measurement: " +
      "the boundary's DISTANCE from the hoop is the measured axis and is " +
      "untouched by this. At the foot and a half it used to be, the one image " +
      "this piece calls its whole argument read as a small ladder near the rim " +
      "instead of as a continuous quantity being divided (audit V-06).",
  },
  BUCKET_NAME_TENTHS: {
    class: "authored",
    value: 6.6,
    material: false,
    controls:
      "the size of a category name inside its own band, in court tenths. It was " +
      "set at the size of a label on a datapoint, against a tick, and could not " +
      "be read; it now matches the statement rank the rest of the piece speaks " +
      "at. Typography, not grain.",
  },

  // --- inscription.ts — how loudly the plate is allowed to speak (V-08) -----
  //
  // `drawSlug` is the only way the piece says anything in words, and until now
  // it had ONE size and ONE alpha for every place it is called from: the
  // sentence the piece opens on, alone over bare stone, was set exactly like
  // a date stamp ticking past during the flood. The register below is that
  // single voice given three ranks. It changes no word — every string still
  // resolves to data/processed/ or to a cited entry in facts.json.
  //
  // Sizes are in COURT TENTHS, like every other grain in the piece, so type does
  // not change with the window. The inventory that assigns every drawn string in
  // the piece to a rank is docs/typography-inventory.md.
  SLUG_VOICE_TENTHS: {
    class: "authored",
    value: 9,
    material: false,
    controls:
      "the four sentences the piece is ABOUT - the prelude's, the one that names " +
      "what a caliper measures, the one that says the league will not name the " +
      "instant, and the one that says the record keeps only endpoints. At most " +
      "one is ever on the plate, and it is the loudest thing on it.",
  },
  SLUG_STATEMENT_TENTHS: {
    class: "authored",
    value: 6.6,
    material: false,
    controls:
      "every other statement: disclosures, dates, counts, the act slugs. Reads " +
      "without effort on a laptop at a normal viewing distance, which is the only " +
      "surface this piece has been judged on.",
  },
  SLUG_ASIDE_TENTHS: {
    class: "authored",
    value: 5.5,
    material: false,
    controls:
      "an annotation subordinate to a mark beside it - the category name under a " +
      "struck numeral, and the counter-reading's margin line. Unchanged from the " +
      "one size the piece used everywhere, so these stay put while the sentences " +
      "around them grow.",
  },
  SLUG_MIN_PX: {
    class: "authored",
    value: 9,
    material: false,
    controls:
      "a floor in CSS pixels, the one place slug type is NOT in court units: " +
      "below it the mono face stops resolving at all and the statement is simply " +
      "lost. It binds only on a small window.",
  },
  SLUG_VOICE_ALPHA: {
    class: "authored",
    value: 0.78,
    material: false,
    controls: "how far the loudest rank is lifted out of the ground it sits on.",
  },
  SLUG_STATEMENT_ALPHA: {
    class: "authored",
    value: 0.62,
    material: false,
    controls:
      "the ordinary rank's ink. Every slug in the piece used to be multiplied by " +
      "the aside value below, whatever its caller asked for.",
  },
  SLUG_ASIDE_ALPHA: {
    class: "authored",
    value: 0.5,
    material: false,
    controls: "the subordinate rank's ink, and the value every slug used to take.",
  },
  STRIKE_FACE_ALPHA: {
    class: "authored",
    value: 0.62,
    material: true,
    controls:
      "the dull face of a struck numeral, under the shadowed wall above it. " +
      "Raising it turns a cut in the floor into a label laid on top of it.",
  },
  STRIKE_SHADOW_K: {
    class: "authored",
    value: 1.1,
    material: true,
    controls:
      "how much darker the numeral's upper wall is than its face - the whole of " +
      "the illusion that the figure is cut rather than printed.",
  },
  STRIKE_SHADOW_MAX: {
    class: "authored",
    value: 0.85,
    material: true,
    controls:
      "a ceiling on that shadow, so a numeral at full strength does not punch a " +
      "hole of pure black through the plate.",
  },
} as const satisfies Record<string, Entry>;

// --- the values, for the renderers ------------------------------------------
// Widened to `number` on the way out: the register is `as const` so a reader
// gets the literal type, and a parameter defaulted from one would then REJECT
// any other value at its call sites. The register keeps the literal; the piece
// gets a number.
//
// Named exports rather than lookups: these sit inside per-vertex loops that
// already cost THE HAND a tenth of a second a frame (audit F-14), and a
// property read per mark is not a thing to add there. `measured` entries have
// no value and deliberately appear nowhere below — the renderer reads them from
// the artifact, which is what makes them measurements.

export const TONE_K: number = SCALARS.TONE_K.value;
export const TONE_CEILING: number = SCALARS.TONE_CEILING.value;
export const SPLAT_MIN_PX: number = SCALARS.SPLAT_MIN_PX.value;
export const SPLAT_SPACING_K: number = SCALARS.SPLAT_SPACING_K.value;
export const FALLOFF_DISC_INTEGRAL: number = SCALARS.FALLOFF_DISC_INTEGRAL.value;

export const RIM_FT: number = SCALARS.RIM_FT.value;
export const TRACE_LIT_FLOOR: number = SCALARS.TRACE_LIT_FLOOR.value;
export const TRACE_LIT_RANGE: number = SCALARS.TRACE_LIT_RANGE.value;
export const TRACE_HEIGHT_CLAMP: number = SCALARS.TRACE_HEIGHT_CLAMP.value;
export const TRACE_W_IN_FLIGHT: number = SCALARS.TRACE_W_IN_FLIGHT.value;
export const TRACE_W_APPROACH: number = SCALARS.TRACE_W_APPROACH.value;
export const TRACE_W_SCALE: number = SCALARS.TRACE_W_SCALE.value;
export const TRACE_APPROACH_DIM: number = SCALARS.TRACE_APPROACH_DIM.value;
export const TRACE_ANCHOR_ALPHA: number = SCALARS.TRACE_ANCHOR_ALPHA.value;
export const TRACE_ANCHOR_MIN_PX: number = SCALARS.TRACE_ANCHOR_MIN_PX.value;
export const TRACE_ANCHOR_SCALE: number = SCALARS.TRACE_ANCHOR_SCALE.value;

export const INK: number = SCALARS.INK.value;
export const INK_REFERENCE_MARKS: number = SCALARS.INK_REFERENCE_MARKS.value;
export const PIN_CORE_ALPHA: number = SCALARS.PIN_CORE_ALPHA.value;
export const PIN_MEAN_ALPHA_K: number = SCALARS.PIN_MEAN_ALPHA_K.value;
export const PIN_STOP_MID: number = SCALARS.PIN_STOP_MID.value;
export const PIN_STOP_MID_ALPHA_K: number = SCALARS.PIN_STOP_MID_ALPHA_K.value;
export const PIN_STOP_OUTER: number = SCALARS.PIN_STOP_OUTER.value;
export const PIN_STOP_OUTER_ALPHA_K: number = SCALARS.PIN_STOP_OUTER_ALPHA_K.value;
export const STAMP_MIN_R_PX: number = SCALARS.STAMP_MIN_R_PX.value;
export const STAMP_GRAD_MIN_R: number = SCALARS.STAMP_GRAD_MIN_R.value;
export const STAMP_CORE_ALPHA: number = SCALARS.STAMP_CORE_ALPHA.value;
export const STAMP_MIN_CORE: number = SCALARS.STAMP_MIN_CORE.value;
export const STAMP_MAX_GAIN: number = SCALARS.STAMP_MAX_GAIN.value;
export const SHARP_R: number = SCALARS.SHARP_R.value;
export const SHARP_SOFTNESS: number = SCALARS.SHARP_SOFTNESS.value;
export const COARSE_R: number = SCALARS.COARSE_R.value;
export const COARSE_SOFTNESS: number = SCALARS.COARSE_SOFTNESS.value;

export const DRIP: number = SCALARS.DRIP.value;
export const BORE: number = SCALARS.BORE.value;
export const RAYLEIGH: number = SCALARS.RAYLEIGH.value;
export const FILAMENT_ALPHA_CAP: number = SCALARS.FILAMENT_ALPHA_CAP.value;
export const FILAMENT_ALPHA_K: number = SCALARS.FILAMENT_ALPHA_K.value;
export const BEAD_CAP: number = SCALARS.BEAD_CAP.value;
export const POOL_EXCESS_K: number = SCALARS.POOL_EXCESS_K.value;
export const POOL_V_FLOOR: number = SCALARS.POOL_V_FLOOR.value;
export const POOL_ALPHA_CAP: number = SCALARS.POOL_ALPHA_CAP.value;
export const POOL_ALPHA_K: number = SCALARS.POOL_ALPHA_K.value;
export const POOL_R_CAP: number = SCALARS.POOL_R_CAP.value;
export const SPLOTCH_INK: number = SCALARS.SPLOTCH_INK.value;
export const SPLOTCH_MIN_R: number = SCALARS.SPLOTCH_MIN_R.value;
export const SPLOTCH_MAX_R: number = SCALARS.SPLOTCH_MAX_R.value;
export const SPLOTCH_ALPHA_CAP_WINDOW: number = SCALARS.SPLOTCH_ALPHA_CAP_WINDOW.value;
export const DROP_AREA: number = SCALARS.DROP_AREA.value;
export const DROP_MIN_R: number = SCALARS.DROP_MIN_R.value;
export const DROP_MAX_R: number = SCALARS.DROP_MAX_R.value;
export const DROP_ALPHA: number = SCALARS.DROP_ALPHA.value;
export const KEPT_OVER_PAINT: number = SCALARS.KEPT_OVER_PAINT.value;
export const SPLOTCH_VISIBLE: number = SCALARS.SPLOTCH_VISIBLE.value;

export const CALIPER_SERIF: number = SCALARS.CALIPER_SERIF.value;
export const CALIPER_SERIF_FLOOD: number = SCALARS.CALIPER_SERIF_FLOOD.value;
export const CALIPER_SERIF_CLOSE: number = SCALARS.CALIPER_SERIF_CLOSE.value;
export const DEFENDER_RING_R: number = SCALARS.DEFENDER_RING_R.value;
export const HERO_ALPHA: number = SCALARS.HERO_ALPHA.value;
export const HERO_RING_ALPHA: number = SCALARS.HERO_RING_ALPHA.value;
export const HERO_PATH_ALPHA: number = SCALARS.HERO_PATH_ALPHA.value;
export const HERO_TAIL: number = SCALARS.HERO_TAIL.value;
export const FLOOD_ALPHA_BASE: number = SCALARS.FLOOD_ALPHA_BASE.value;
export const FLOOD_ALPHA_FRESH: number = SCALARS.FLOOD_ALPHA_FRESH.value;
export const CLOSE_ALPHA: number = SCALARS.CLOSE_ALPHA.value;
export const INSTANT_LINE_ALPHA: number = SCALARS.INSTANT_LINE_ALPHA.value;
export const INSTANT_CUT_ALPHA: number = SCALARS.INSTANT_CUT_ALPHA.value;
export const FIGURE_SUB_ALPHA: number = SCALARS.FIGURE_SUB_ALPHA.value;
export const NAMES_ONLY_ALPHA: number = SCALARS.NAMES_ONLY_ALPHA.value;
export const BUCKET_LABEL_ALPHA: number = SCALARS.BUCKET_LABEL_ALPHA.value;
export const SCATTER_TENTHS: number = SCALARS.SCATTER_TENTHS.value;
export const SCATTER_MIN_PX: number = SCALARS.SCATTER_MIN_PX.value;
export const SCATTER_ALPHA: number = SCALARS.SCATTER_ALPHA.value;
export const TERM_HEAD_TENTHS: number = SCALARS.TERM_HEAD_TENTHS.value;
export const TERM_BIRTH_TENTHS: number = SCALARS.TERM_BIRTH_TENTHS.value;
export const TERM_NINETY_TENTHS: number = SCALARS.TERM_NINETY_TENTHS.value;
export const TERM_TAIL_TENTHS: number = SCALARS.TERM_TAIL_TENTHS.value;
export const TERM_MARGIN_SCALE: number = SCALARS.TERM_MARGIN_SCALE.value;
export const TERM_HOLD_SECONDS: number = SCALARS.TERM_HOLD_SECONDS.value;
export const TERM_CLEAR_PAD: number = SCALARS.TERM_CLEAR_PAD.value;
export const TERM_ALPHA_FRESH: number = SCALARS.TERM_ALPHA_FRESH.value;
export const TERM_ALPHA_AGED: number = SCALARS.TERM_ALPHA_AGED.value;
export const TERM_TIE_ALPHA: number = SCALARS.TERM_TIE_ALPHA.value;
export const LEAGUE_NAME_TENTHS: number = SCALARS.LEAGUE_NAME_TENTHS.value;
export const LEAGUE_VALUE_SCALE: number = SCALARS.LEAGUE_VALUE_SCALE.value;
export const INSTANT_BAND_HALF_W: number = SCALARS.INSTANT_BAND_HALF_W.value;
export const BUCKET_NAME_TENTHS: number = SCALARS.BUCKET_NAME_TENTHS.value;

export const SLUG_VOICE_TENTHS: number = SCALARS.SLUG_VOICE_TENTHS.value;
export const SLUG_STATEMENT_TENTHS: number = SCALARS.SLUG_STATEMENT_TENTHS.value;
export const SLUG_ASIDE_TENTHS: number = SCALARS.SLUG_ASIDE_TENTHS.value;
export const SLUG_MIN_PX: number = SCALARS.SLUG_MIN_PX.value;
export const SLUG_VOICE_ALPHA: number = SCALARS.SLUG_VOICE_ALPHA.value;
export const SLUG_STATEMENT_ALPHA: number = SCALARS.SLUG_STATEMENT_ALPHA.value;
export const SLUG_ASIDE_ALPHA: number = SCALARS.SLUG_ASIDE_ALPHA.value;
export const STRIKE_FACE_ALPHA: number = SCALARS.STRIKE_FACE_ALPHA.value;
export const STRIKE_SHADOW_K: number = SCALARS.STRIKE_SHADOW_K.value;
export const STRIKE_SHADOW_MAX: number = SCALARS.STRIKE_SHADOW_MAX.value;
