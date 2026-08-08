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
 * literal appears inline in a mark layer (field.ts, bloom.ts, marks.ts,
 * modes/hand.ts, modes/measure.ts). It cannot be bypassed by writing a new
 * renderer: add a file to that list and its scalars have to come from here.
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
      "ink for the whole splotch layer, so a season of ~190,000 marks and a window " +
      "of ~48,000 lay down the same paint and neither floods the plate. Conserved " +
      "the way marks.ts conserves it for dots.",
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
  SPLOTCH_FLAT_BONUS_R: {
    class: "authored",
    value: 1.6,
    material: true,
    controls:
      "how much larger every splotch is outside the window than the tightest one " +
      "inside it. Outside, the record says nothing about room, so all of them are " +
      "this one size — and that sameness is the hand's argument.",
  },
  SPLOTCH_ALPHA_CAP_WINDOW: {
    class: "authored",
    value: 0.34,
    material: true,
    controls: "opacity ceiling on a splotch inside the window.",
  },
  SPLOTCH_ALPHA_CAP_SEASON: {
    class: "authored",
    value: 0.3,
    material: true,
    controls: "opacity ceiling on a splotch outside it, where one mark stands for many shots at a coordinate.",
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
export const SPLOTCH_FLAT_BONUS_R: number = SCALARS.SPLOTCH_FLAT_BONUS_R.value;
export const SPLOTCH_ALPHA_CAP_WINDOW: number = SCALARS.SPLOTCH_ALPHA_CAP_WINDOW.value;
export const SPLOTCH_ALPHA_CAP_SEASON: number = SCALARS.SPLOTCH_ALPHA_CAP_SEASON.value;
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
