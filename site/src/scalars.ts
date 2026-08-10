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
 * the piece speaks at, plus (since 5b) `modes/ledger.ts`, `modes/census.ts` and
 * `palette.ts`. It does NOT cover composition — where a slug sits, how long a
 * numeral holds before it migrates, which act a thing appears in.
 *
 * ONE BLIND SPOT IN THE ENFORCEMENT, STATED SO NOBODY MISTAKES COVERAGE FOR
 * PROOF. Pass 3 judges CODE spans, so a material value written inside a STRING
 * is invisible to it: `palette.ts` holds its hues as comma-separated channel
 * strings and its hairlines as interpolated `rgba(...)` templates, and adding
 * that file to the list flagged neither.
 *
 * WHAT V-03 ACTUALLY DID, because this comment claimed the opposite for two
 * sessions: the seven hues ARE still written in source, in `palette.ts:ZONE_RGB`,
 * and that is deliberate — an authored scalar's home is source (rule 3), and
 * `pipeline/palette.py` READS them out of there and measures them, with `qa.py`
 * binding the two in both directions. What moved into an artifact is the CLAIM
 * about them, not the values. Pass 1 sees them as strings and each is waived in
 * `numbers-allowlist.json` with a reason. The two engraving alphas are declared
 * below. The blind spot itself remains: a scalar smuggled into a string literal
 * is caught by nothing.
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
    value: 1.8494,
    material: true,
    controls:
      "splat radius as a multiple of the lattice spacing — how far neighbouring " +
      "coordinates bleed together. THE OLD DISCLOSURE MISDESCRIBED ITS OWN " +
      "FAILURE: it said the artefact appears 'below about 1', and the failure is " +
      "not smallness. The falloff is a peak-1 paraboloid on a disc of radius " +
      "K*spacing, so its response at the lattice's own fundamental is " +
      "PROPORTIONAL TO J2(2*pi*K), whose argument is K and nothing else — the " +
      "spacing cancels because the radius is a multiple of it. That response has " +
      "ZEROS at 0.8174, 1.3396, 1.8494 and 2.3548 (j2,n / 2*pi) and SIDELOBES " +
      "BETWEEN THEM. The old 1.45 sat on a sidelobe, which is why sessions 5a and " +
      "5b both reported the record's own grid beating through the field at every " +
      "window size and neither could say why. This is the third zero: the lowest " +
      "that also INCREASES neighbour bleed, which is the other half of what this " +
      "scalar is for. Two limits, stated because an earlier version of this line " +
      "overclaimed both. The K-only result is a CONTINUOUS one and the kernel is " +
      "pixel-sampled, so at low device ratios — where the radius is only two or " +
      "three device pixels — the null is shallower than the algebra promises. And " +
      "ink is CONSERVED, not identical: replaying the bake over the shipped " +
      "season_2015.bin, total deposited light varies under one per cent across K " +
      "in [1.0, 3.0], because FALLOFF_DISC_INTEGRAL normalises the splat's own " +
      "overlap. So this is smoothness, to within that. Still `authored`: WHERE " +
      "the zeros are follows from the falloff and the lattice, but WHICH one to " +
      "sit on is a judgement.",
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

  // --- the development — the path a season takes to its measured image -----
  //
  // THE DEVELOPMENT (session 8, stage A of the artist's two-stage arrival
  // repair): a season no longer FADES in — it develops, like a print. The
  // layer is baked at a ladder of exposure states, each the same tone curve at
  // a scaled strength, and arrival crossfades up the ladder instead of ramping
  // one finished image's opacity. Because the tone curve is compressive, an
  // under-exposed state holds the dense rim at nearly full brightness while
  // the faint mid-range texture sinks — so the rim flare surfaces first out of
  // the dark, the arc rises next, the faintest texture arrives last, and the
  // outgoing season sinks the same ladder in reverse. THE ENDPOINTS ARE NOT
  // THESE SCALARS': the last exposure state is exactly TONE_K and TONE_CEILING
  // above, so the fully developed frame is byte-identical to the bake those
  // measured constants define. These two shape only the PATH to it — pace and
  // shape of the development, the same kind of claim as ARRIVAL_TAIL.
  DEVELOP_STATES: {
    class: "authored",
    value: 4,
    material: true,
    controls:
      "how many exposure states the development passes through on its way to " +
      "the measured image. The endpoints are fixed — black, and the tone curve " +
      "TONE_K and TONE_CEILING define — so this only sets how finely the path " +
      "between them is sampled: fewer states and the crossfade between " +
      "under-exposures gets coarser; more and the development approaches a " +
      "continuous deepening, at one full-plate bake per state per season.",
  },
  DEVELOP_STEP: {
    class: "authored",
    value: 4,
    material: true,
    controls:
      "the exposure ratio between adjacent states of the development ladder — " +
      "each state's tone strength is this factor below the next, ending at " +
      "exactly the measured curve. Lower and the under-exposed states crowd " +
      "the finished image so the development reads as a plain fade; higher " +
      "and the first state sinks toward rim-flare-only and the mid-range " +
      "texture arrives later and more abruptly.",
  },

  // --- the per-mark arrival — the order the record's emphasis surfaces in --
  //
  // THE PER-MARK ARRIVAL (session 9, stage B of the artist's two-stage arrival
  // repair): during arrival the season's cells no longer surface as one
  // developing image — they ARRIVE, individually at the head and in bands at
  // the tail, each at its full measured tone. THE ORDER IS NOT AUTHORED: cells
  // arrive by descending filed count — the record's own emphasis, the
  // most-filed coordinate first (artist ruling, 2026-08-09) — with ties broken
  // by a stated deterministic rule (nearest the rim first, then y, then x).
  // `points/*.bin` holds no time, so the order claims nothing chronological:
  // it is the record's emphasis, not its calendar. Only the PACE of reveal is
  // composition, and these two scalars are the whole of it.
  REVEAL_STEPS: {
    class: "authored",
    value: 32,
    material: true,
    controls:
      "how many quantized batches a season's per-mark arrival lands in. The " +
      "order within them is the record's own — descending filed count — and " +
      "the population and tones are the measured ones; this only sets the " +
      "grain of the landing. Since session 13 the steps BLEND (artist ruling): " +
      "each batch rises over its interval at the linear fractional part of " +
      "the arrival envelope — no batch strikes whole — and at every integer " +
      "boundary the frame is exactly the folded prefix. Fewer steps and the " +
      "batches are coarser, longer rises; more and the arrival approaches one " +
      "mark per frame, at one full-plate re-quantize per step.",
  },
  REVEAL_CURVE: {
    class: "authored",
    value: 3,
    material: true,
    controls:
      "how sharply the reveal leans into the record's head: the prefix of the " +
      "emphasis order revealed at step s is n·(s/steps) raised to this power. " +
      "At 1 every step lands the same number of cells and the first batch is " +
      "hundreds of marks; higher bends the early steps down to single strikes " +
      "— the most-filed coordinate arriving alone — while the faint tail " +
      "lands in progressively wider bands. Measured against the record: at 3 " +
      "no step deposits more than ~6% of a season's total tone.",
  },

  // --- the residence — the window's ball-occupancy under-layer -------------
  //
  // THE RESIDENCE: where the ball LIVED, under where the shots ENDED, drawn
  // only for the one act whose feed survives (window.json:occupancy — one-foot
  // cells over every parsed ball frame). Both independent display audits named
  // this artifact the most deserving unshown material and proposed the same
  // placement. The layer is bone, always — the ball belongs to no zone — and
  // the only thing t drives is a whole-layer envelope; per-cell animation
  // would author a chronology the aggregate never measured.
  RESIDENCE_TONE_K: {
    class: "authored",
    value: 400,
    material: true,
    controls:
      "how fast a cell's share of the ball's measured time saturates toward " +
      "full glow. Lower and only the densest corridors of the ball's traffic " +
      "survive the tone curve while the mid-floor sinks to nothing; higher and " +
      "the whole window ground flattens toward one undifferentiated sheet, " +
      "which is atmosphere — rule 3's exact failure for this layer.",
  },
  RESIDENCE_ALPHA: {
    class: "authored",
    value: 0.35,
    material: true,
    controls:
      "how much of the stone's light is the ball's time, under the shots' " +
      "endings — the whole-layer weight the beat envelope multiplies. The " +
      "residence may never outshine the record it contextualises: raise it " +
      "and the dwelling starts to compete with the endings for the plate; " +
      "lower it and the window's ground goes back to bare stone.",
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
      "how strongly the kept coordinates come back up over the painting at " +
      "the season beat's crest (hand.ts:KEPT_CREST — THE INSTANT, which this " +
      "line used to name, was cut by the crescendo ruling). Five seconds of " +
      "body were recorded and one point was filed, and this is that point " +
      "asserting itself over the gesture it stands for. Nothing new is drawn " +
      "at all: it is the same layer composited a second time, above instead " +
      "of below.",
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
  // THE INSTANT's scalars (INSTANT_LINE_ALPHA, INSTANT_CUT_ALPHA,
  // INSTANT_BAND_HALF_W, BUCKET_NAME_TENTHS, BUCKET_LABEL_ALPHA, HERO_TAIL)
  // left the register with the beat they controlled — the crescendo's cut
  // ruling, 2026-08-10. An entry whose `controls` line names a drawing that no
  // longer exists is a disclosure lying about the piece.
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
  // Alphas that were inline in modes/ledger.ts. 5a registered that hand's
  // spoken register here and left the FILE outside check-numbers.mjs's
  // MARK_LAYERS, so these were never asked for. They are here because 5b widened
  // the list, which is the only reason anyone found them.
  TERM_MARGIN_ALPHA: {
    class: "authored",
    value: 0.7,
    material: false,
    controls:
      "the FIRST FILED line under a birth term, against the term itself. It " +
      "discloses what the size above it is claiming, so it has to be readable " +
      "and must not compete.",
  },
  LEAGUE_NAME_ALPHA: {
    class: "authored",
    value: 0.62,
    material: false,
    controls: "a published measure's name, where the league's words hold the emptied mid-range.",
  },
  LEAGUE_VALUE_ALPHA: {
    class: "authored",
    value: 0.5,
    material: false,
    controls:
      "the recomputed figure beneath it, inside the window only. Below the name " +
      "it belongs to, because the name is the claim and the figure is this " +
      "project's reconstruction of it.",
  },
  LEAGUE_ARRIVAL_K: {
    class: "authored",
    value: 0.5,
    material: false,
    controls:
      "how fast a league name reaches full ink as the act accumulates them - the " +
      "newest is half-struck while the one before it is whole, so the arc reads " +
      "as filling rather than as appearing. Pacing, not grain.",
  },

  // --- palette.ts — the engraving's two weights ----------------------------
  //
  // The court is drawn at these and nothing else. They are the piece's first
  // event: the plate is recognised a beat AFTER the image is, which only works
  // if the lines sit below the marks rather than framing them.
  ENGRAVING_ALPHA: {
    class: "authored",
    value: 0.085,
    material: true,
    controls:
      "the engraved court - baseline, sidelines, lane, free-throw circle and " +
      "the three-point line. Never brighter than the marks it holds: above " +
      "roughly a tenth the floor reads as a diagram with data on it rather " +
      "than as a plate the record is accumulating on.",
  },
  ENGRAVING_FAINT_ALPHA: {
    class: "authored",
    value: 0.05,
    material: true,
    controls:
      "the apparatus at the centre of the record - backboard, rim and the " +
      "restricted arc. Fainter than the rest of the engraving because it sits " +
      "exactly where the density is highest, and at the same weight it would " +
      "cut a visible ring through the one region every act is about.",
  },

  // --- modes/census.ts — the filing (V-05) ---------------------------------
  //
  // NO POSITION AND NO PROPORTION IS AUTHORED IN THIS HAND. Every place on the
  // plate comes from `seasons.json:classification_place` and every size from a
  // measured share. What is authored is how LARGE the largest thing may be, how
  // much room a word demands, and how long the six-fold strike lasts.
  STRIKE_MAX_TENTHS: {
    class: "authored",
    value: 55,
    material: true,
    controls:
      "the cap height, in court tenths, a category holding ONE HUNDRED PER CENT " +
      "of a season would be struck at. Every word is this times the square root " +
      "of its own share, so the word's AREA is proportional to the shots it " +
      "names - the law drawPin already obeys. Raise it and the biggest " +
      "categories run off the floor; lower it and the census stops being " +
      "monumental and goes back to being a list.",
  },
  STRIKE_FLOOR_TENTHS: {
    class: "authored",
    value: 4.75,
    material: true,
    controls:
      "the smallest a struck word may be. A category whose share would draw it " +
      "under this is a tick and a number in the footer instead. " +
      "DELIBERATELY THE SAME VALUE AS SCATTER_TENTHS, which is the rule rather " +
      "than a coincidence: a struck category is never smaller than a label on a " +
      "single datapoint, because below that it has stopped being a monument and " +
      "become THE LEDGER's grain. " +
      "AT THIS VALUE IT BINDS ON NOTHING, and that is the artist's decision, " +
      "taken against a measurement. It was first set high enough to keep only the " +
      "three or four largest words - which cost DESCRIPTION most of its " +
      "vocabulary while the five fixed taxonomies lost nothing - and the ruling " +
      "was to have the whole named set on the floor and accept the smaller type. " +
      "So `vocabulary.covering_90pct` is what decides the count again, exactly as " +
      "the direction specifies, and this only stops a degenerate case: the " +
      "smallest member of any season's ninety-per-cent set measures 4.89 tenths, " +
      "just above it.",
  },
  WORD_CLEAR_PAD: {
    class: "authored",
    value: 0.22,
    material: true,
    controls:
      "cap heights of clear floor a struck word demands around itself before " +
      "another may be laid. The collision test is done in POLAR terms because " +
      "the words are laid tangent to the hoop, so this pads a radial gap and an " +
      "angular one at once.",
  },
  ROTATE_STEP_RAD: {
    class: "authored",
    value: 0.11,
    material: true,
    controls:
      "the bearing step a word is moved by when it collides. BEARING IS THE ONLY " +
      "FREE VARIABLE: distance from the basket is the quantity this entire piece " +
      "is about and is never perturbed, and the disclosure line on the plate says " +
      "so. Smaller steps find more room and cost more tries.",
  },
  ROTATE_MAX_RAD: {
    class: "authored",
    value: 1.5708,
    material: true,
    controls:
      "how far around its own radius a word may be moved before the plate gives " +
      "up and does not strike it at all. A quarter turn: past that the word is " +
      "describing a different part of the floor from the one the record put it " +
      "in. What it refuses is counted in the footer rather than hidden.",
  },
  SIXFOLD_SECONDS: {
    class: "authored",
    value: 2.2,
    material: false,
    controls:
      "how long ALL SIX taxonomies are struck at once at a season's opening " +
      "before five withdraw. It is the 31-to-75 growth made a single perceivable " +
      "event that recurs thirty times, and it is the only pacing scalar this " +
      "hand adds.",
  },
  SIXFOLD_ALPHA: {
    class: "authored",
    value: 0.3,
    material: true,
    controls:
      "how strongly the other five are struck during that moment. Low enough " +
      "that the floor reads as covered rather than as legible - the point is the " +
      "DENSITY of six overlapping vocabularies, not any one of them.",
  },
  CENSUS_FIELD_DIM: {
    class: "authored",
    value: 0.5,
    material: true,
    controls:
      "how far the season's marks are held back beneath the filing. The census " +
      "is about the marks, so they have to be there; the words are cut into the " +
      "plate underneath and the marks settle over them.",
  },
  CENSUS_TICK_TENTHS: {
    class: "authored",
    value: 9,
    material: true,
    controls:
      "the arm length of the incised cross struck at EVERY category's place, " +
      "named or not. The tick count is the taxonomy's whole size, so five " +
      "constellations never change their count across thirty seasons while the " +
      "sixth breeds - the growth seen rather than read.",
  },
  CENSUS_TICK_ALPHA: {
    class: "authored",
    value: 0.3,
    material: true,
    controls: "how deeply a tick is cut, against the words above it.",
  },
  CENSUS_TICK_WEIGHT: {
    class: "authored",
    value: 1.4,
    material: true,
    controls:
      "a tick's stroke width as a multiple of the plate scale, so the incision " +
      "keeps its weight across window sizes. Heavier than the engraving it is " +
      "cut beside, because a tick stands for a whole category of the record.",
  },
  CENSUS_WORD_ALPHA: {
    class: "authored",
    value: 0.92,
    material: true,
    controls:
      "the struck word's own strength, before the frame's fade. Near the top of " +
      "the range because these ARE the hand - the tables they replaced were the " +
      "brightest thing on the plate and read as an overlay.",
  },
  MACHINE_SAW_SCALE: {
    class: "authored",
    value: 0.6,
    material: true,
    controls:
      "the window's seventh beat - the count of body positions the machine held " +
      "- as a fraction of the largest a category may be struck at. It is the " +
      "strongest content the census has and it used to be set in the smallest " +
      "type on screen, in a gutter. Struck below a full-share word because it is " +
      "a count and not a share, and nothing here is entitled to the whole floor.",
  },
  CENSUS_SHARE_SCALE: {
    class: "authored",
    value: 0.32,
    material: false,
    controls:
      "the share numeral riding under each word, as a fraction of the word. " +
      "Subordinate on purpose: the word's own SIZE already carries the share, " +
      "and the numeral only says exactly how much.",
  },

  // --- modes/census.ts — the tally's own type ------------------------------
  CENSUS_HEAD_ALPHA: {
    class: "authored",
    value: 0.75,
    material: false,
    controls: "the tally's own heading line - the season and the count classified so far.",
  },
  CENSUS_ROW_ALPHA: {
    class: "authored",
    value: 0.72,
    material: false,
    controls:
      "a tally row's ink - the receipt column in the gallery, and every row of " +
      "the full apparatus behind the rail. Above the headings it sits under, " +
      "because the rows are the content and the heading only says what kind.",
  },
  CENSUS_SUB_ALPHA: {
    class: "authored",
    value: 0.45,
    material: false,
    controls:
      "the line beneath it, naming how many categories in how many taxonomies. " +
      "Subordinate, because it describes the machine rather than counting shots.",
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
  // the piece to a rank is docs/build/typography-inventory.md.
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

  // --- modes/stack.ts — THE STACK, seven operations over one base -----------
  // Every one of these is a COMPOSITE weight: how loudly a layer speaks when it
  // is one of seven rather than the whole frame. They are authored, they are
  // material, and the reason they exist at all is that material tuned to own a
  // frame is too loud inside a composite - which is the audit's "an all-on
  // default dissolves the court into proof-of-capability spectacle", answered
  // with numbers rather than with a promise.
  STACK_FIELD_DIM: {
    class: "authored",
    value: 0.78,
    material: true,
    controls:
      "how bright the one shot-material base is under a stack of operations. At " +
      "full strength the field is the whole image and the six layers over it read " +
      "as decoration on a picture that was already finished; held here, the marks " +
      "stay the ground the other operations are applied TO.",
  },
  STACK_INSCRIPTION_DIM: {
    class: "authored",
    value: 0.72,
    material: false,
    controls:
      "the struck season numerals' ink in the composite. In THE PLATE the figure " +
      "is the thing the frame is about; here it is one operation of seven, and at " +
      "its own weight it dominates every layer a presenter adds after it. " +
      "Typography, not grain.",
  },
  STACK_DISCLOSURE_INSET: {
    class: "authored",
    value: 18,
    material: false,
    controls:
      "how far inside the plate's far edge a disclosure line sits, in court " +
      "tenths. Composition: it moves a sentence, never a mark.",
  },
  STACK_WINDOW_FIELD_DIM: {
    class: "authored",
    value: 0.4,
    material: true,
    controls:
      "how far the shot-material base yields when a WINDOW operation is applied " +
      "over it — the painted possession or the calipers. Both are thin by " +
      "measurement rather than by choice (ink is conserved against time, and one " +
      "possession is one possession), so against a field at full weight neither " +
      "is visible at all. THE PLATE dims its own field through Act III for the " +
      "same reason and this is that rule, applied when the presenter names the " +
      "operation instead of when the act arrives. Raise it and CONNECT THE BODY " +
      "stops changing the plate when it is switched on.",
  },
  STACK_NAME_DIM: {
    class: "authored",
    value: 0.8,
    material: false,
    controls:
      "the spoken term's ink in the composite. Its SIZE is not touched — area is " +
      "proportional to the shots the word names, which is the measurement THE " +
      "LEDGER's register is built on — so ink is the only lever that can make it " +
      "one voice among seven rather than the loudest thing on the plate. " +
      "Typography, not grain.",
  },
  STACK_CALIPER_ALPHA: {
    class: "authored",
    value: 0.55,
    material: true,
    controls:
      "the four hero calipers' ink. A caliper is a hairline the length of the " +
      "floor, and four of them at full strength read as engraving rather than as " +
      "one operation applied over others.",
  },
  STACK_TICK_ALPHA: {
    class: "authored",
    value: 0.8,
    material: true,
    controls:
      "the census tick's ink relative to THE CENSUS's own. The ticks are the one " +
      "part of COUNT THE EVENT that lands on the floor, and their COUNT is the " +
      "measurement — how many categories the taxonomy has — so they have to stay " +
      "individually countable against a lit field without becoming a second " +
      "population of marks.",
  },
  STACK_GUTTER_TENTHS: {
    class: "authored",
    value: 7.5,
    material: false,
    controls:
      "the tally's type size in the exterior gutter, in court tenths — so the " +
      "margin's type scales with the floor like every other string in the piece " +
      "and does not change with the window. Typography, not grain.",
  },
  STACK_GUTTER_PAD_TENTHS: {
    class: "authored",
    value: 24,
    material: false,
    controls:
      "how far outside the plate's sideline the tally is set, in court tenths. " +
      "Composition: it holds the count clear of the court so COUNT THE EVENT " +
      "never occupies the floor the way NAME THE ACTION does.",
  },
  STACK_GUTTER_ROW_ALPHA: {
    class: "authored",
    value: 0.46,
    material: false,
    controls: "a tally row's ink in the margin. Typography, not grain.",
  },
  STACK_GUTTER_SUB_ALPHA: {
    class: "authored",
    value: 0.3,
    material: false,
    controls:
      "the margin's subordinate lines — the record's own column name above the " +
      "tally, and the tick-and-a-count tail below it.",
  },
  QUARREL_ALPHA: {
    class: "authored",
    value: 0.45,
    material: true,
    controls:
      "the quarrel hairline's ink — the segment between the two instruments' " +
      "claims about where one shot happened, JOIN THE INSTRUMENTS' only mark. " +
      "Serifless on purpose: it is not a measurement between bodies, it is a " +
      "distance between claims, and the caliper's serifs stay on the caliper. " +
      "The ONE authored alpha the operation holds — the confession struck " +
      "beside the flood rides at the same weight, and the budget of segments " +
      "drawn at once is a count (stack.ts), not a material.",
  },

  SEASON_CLOCK_K: {
    class: "authored",
    value: 3.5,
    material: true,
    controls:
      "the easing of the season beat's clock over the window's REAL calendar " +
      "(the crescendo, session 14): day(u) = (e^(k·u) − 1)/(e^k − 1) of the " +
      "89 inclusive days. The calendar underneath is measured — which marks " +
      "arrive on which day, and the four days nobody played stay dead at " +
      "speed — and only this easing is authored. Material because it decides " +
      "which marks exist on a mid-beat frame, the REVEAL_CURVE reasoning. At " +
      "this value the beat opens near the night's own pace and closes about " +
      "e^k (~33×) faster; smaller flattens the crescendo toward a constant " +
      "rate, larger makes the closing weeks a blur.",
  },

  // --- THE FOUR SCALES (session 15): the game and the wash -------------------
  WASH_TONE_K: {
    class: "authored",
    value: 400,
    material: true,
    controls:
      "the wash's tone curve: how fast a cell's share of the corpus's tracked " +
      "positions saturates toward full brightness, 1 − e^(−k·share) — the " +
      "residence's own idiom at the wash's grain. Every scale reads the SAME " +
      "curve against the SAME corpus total, which is what makes each handoff " +
      "subset→superset by measure. Lower and a single game's ground vanishes " +
      "under the season's; higher and the season flattens to a uniform glow.",
  },
  WASH_ALPHA: {
    class: "authored",
    value: 0.3,
    material: true,
    controls:
      "the dried ground's ceiling: how strongly the wash sits under the wet " +
      "strokes at full arrival. Higher and the ground competes with the " +
      "followable line; lower and thirty nights of bodies read as a stain.",
  },
  GAME_CLOCK_K: {
    class: "authored",
    value: 3.5,
    material: true,
    controls:
      "the easing of the game phase's clock over the found game's own frames: " +
      "frame(u) = (e^(k·u) − 1)/(e^k − 1) of the whole game, SEASON_CLOCK_K's " +
      "curve one scale down. The feed underneath is measured; only the easing " +
      "is authored. Material because it decides which strokes exist on a " +
      "mid-phase frame. A rival ~7.3 (opening at the possession's true rate) " +
      "is packet-flagged, undecided.",
  },
  GAME_DRIED: {
    class: "authored",
    value: 0.12,
    material: true,
    controls:
      "how far a game stroke dims once the wet edge has passed it — the " +
      "drying, distinct from the wash beneath. 1 leaves the whole game as " +
      "bright as its newest gesture and the eye loses the edge; too low and " +
      "the game exists only at its leading seconds. The plan's first value " +
      "was 0.45, and the first frames falsified it: a whole game's strokes " +
      "at that ink saturate into a solid zone-coloured poster that buries " +
      "the filed record beneath — the measured correction is the session-15 " +
      "packet's to ratify.",
  },
  PASS_MARK_R: {
    class: "authored",
    value: 2.5,
    material: true,
    controls:
      "a pass bead's radius in court tenths at view scale: the measured " +
      "instant the ball reached its receiver, punctuated without being " +
      "narrated. Larger and ~580 beads become the drawing; smaller and the " +
      "annotation the artist asked for is invisible.",
  },
  PASS_MARK_ALPHA: {
    class: "authored",
    value: 0.5,
    material: true,
    controls:
      "a pass bead's ink against the stroke it sits on. The bead is bone — " +
      "an annotation of the record, not a zone claim — so only its weight is " +
      "authored here.",
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
export const DEVELOP_STATES: number = SCALARS.DEVELOP_STATES.value;
export const DEVELOP_STEP: number = SCALARS.DEVELOP_STEP.value;
export const REVEAL_STEPS: number = SCALARS.REVEAL_STEPS.value;
export const REVEAL_CURVE: number = SCALARS.REVEAL_CURVE.value;
export const RESIDENCE_TONE_K: number = SCALARS.RESIDENCE_TONE_K.value;
export const RESIDENCE_ALPHA: number = SCALARS.RESIDENCE_ALPHA.value;

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
export const FLOOD_ALPHA_BASE: number = SCALARS.FLOOD_ALPHA_BASE.value;
export const FLOOD_ALPHA_FRESH: number = SCALARS.FLOOD_ALPHA_FRESH.value;
export const CLOSE_ALPHA: number = SCALARS.CLOSE_ALPHA.value;
export const FIGURE_SUB_ALPHA: number = SCALARS.FIGURE_SUB_ALPHA.value;
export const NAMES_ONLY_ALPHA: number = SCALARS.NAMES_ONLY_ALPHA.value;
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
export const TERM_MARGIN_ALPHA: number = SCALARS.TERM_MARGIN_ALPHA.value;
export const LEAGUE_NAME_ALPHA: number = SCALARS.LEAGUE_NAME_ALPHA.value;
export const LEAGUE_VALUE_ALPHA: number = SCALARS.LEAGUE_VALUE_ALPHA.value;
export const LEAGUE_ARRIVAL_K: number = SCALARS.LEAGUE_ARRIVAL_K.value;
export const STRIKE_MAX_TENTHS: number = SCALARS.STRIKE_MAX_TENTHS.value;
export const STRIKE_FLOOR_TENTHS: number = SCALARS.STRIKE_FLOOR_TENTHS.value;
export const WORD_CLEAR_PAD: number = SCALARS.WORD_CLEAR_PAD.value;
export const ROTATE_STEP_RAD: number = SCALARS.ROTATE_STEP_RAD.value;
export const ROTATE_MAX_RAD: number = SCALARS.ROTATE_MAX_RAD.value;
export const SIXFOLD_SECONDS: number = SCALARS.SIXFOLD_SECONDS.value;
export const SIXFOLD_ALPHA: number = SCALARS.SIXFOLD_ALPHA.value;
export const CENSUS_FIELD_DIM: number = SCALARS.CENSUS_FIELD_DIM.value;
export const CENSUS_TICK_TENTHS: number = SCALARS.CENSUS_TICK_TENTHS.value;
export const CENSUS_TICK_ALPHA: number = SCALARS.CENSUS_TICK_ALPHA.value;
export const CENSUS_TICK_WEIGHT: number = SCALARS.CENSUS_TICK_WEIGHT.value;
export const CENSUS_WORD_ALPHA: number = SCALARS.CENSUS_WORD_ALPHA.value;
export const MACHINE_SAW_SCALE: number = SCALARS.MACHINE_SAW_SCALE.value;
export const CENSUS_SHARE_SCALE: number = SCALARS.CENSUS_SHARE_SCALE.value;
export const CENSUS_HEAD_ALPHA: number = SCALARS.CENSUS_HEAD_ALPHA.value;
export const CENSUS_ROW_ALPHA: number = SCALARS.CENSUS_ROW_ALPHA.value;
export const CENSUS_SUB_ALPHA: number = SCALARS.CENSUS_SUB_ALPHA.value;
export const ENGRAVING_ALPHA: number = SCALARS.ENGRAVING_ALPHA.value;
export const ENGRAVING_FAINT_ALPHA: number = SCALARS.ENGRAVING_FAINT_ALPHA.value;

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

export const STACK_FIELD_DIM: number = SCALARS.STACK_FIELD_DIM.value;
export const STACK_INSCRIPTION_DIM: number = SCALARS.STACK_INSCRIPTION_DIM.value;
export const STACK_DISCLOSURE_INSET: number = SCALARS.STACK_DISCLOSURE_INSET.value;
export const STACK_WINDOW_FIELD_DIM: number = SCALARS.STACK_WINDOW_FIELD_DIM.value;
export const STACK_NAME_DIM: number = SCALARS.STACK_NAME_DIM.value;
export const STACK_CALIPER_ALPHA: number = SCALARS.STACK_CALIPER_ALPHA.value;
export const STACK_TICK_ALPHA: number = SCALARS.STACK_TICK_ALPHA.value;
export const STACK_GUTTER_TENTHS: number = SCALARS.STACK_GUTTER_TENTHS.value;
export const STACK_GUTTER_PAD_TENTHS: number = SCALARS.STACK_GUTTER_PAD_TENTHS.value;
export const STACK_GUTTER_ROW_ALPHA: number = SCALARS.STACK_GUTTER_ROW_ALPHA.value;
export const STACK_GUTTER_SUB_ALPHA: number = SCALARS.STACK_GUTTER_SUB_ALPHA.value;
export const QUARREL_ALPHA: number = SCALARS.QUARREL_ALPHA.value;
export const SEASON_CLOCK_K: number = SCALARS.SEASON_CLOCK_K.value;
export const WASH_TONE_K: number = SCALARS.WASH_TONE_K.value;
export const WASH_ALPHA: number = SCALARS.WASH_ALPHA.value;
export const GAME_CLOCK_K: number = SCALARS.GAME_CLOCK_K.value;
export const GAME_DRIED: number = SCALARS.GAME_DRIED.value;
export const PASS_MARK_R: number = SCALARS.PASS_MARK_R.value;
export const PASS_MARK_ALPHA: number = SCALARS.PASS_MARK_ALPHA.value;
