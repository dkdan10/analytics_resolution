# The material register

*Generated from `site/src/scalars.ts` by `npm run disclose`. Do not edit: edit the register.*

Grain is a measurement, not a mood. Every material property of a mark in FADEAWAY — its radius, stroke width, opacity, colour, bead count, pooling, falloff or tone — derives from a measured property of the record. Where one genuinely cannot be measured, it is named here, in one place, with what it controls.

**82 scalars**, 72 of them material: 2 measured, 3 geometry, 77 authored.

A renderer in the mark layers — `field.ts`, `bloom.ts`, `marks.ts`, `modes/hand.ts`, `modes/measure.ts` — may not write a material number inline; `npm run check:numbers` fails the build if one appears.

## measured

*read from `data/processed/` at runtime. These carry no value here — a measurement copied into source stops being one.*

- **SPLOTCH_SCALE_AT** — `window.json:contest.caliper_ft.p99`  
  THE SPLOTCH TRANSFER FUNCTION'S REFERENCE. A splotch's radius rises with how open the shooter was, and this is the caliper length that reaches SPLOTCH_MAX_R; the ~1% of shots beyond it draw at the maximum. It used to be 255 — the old one-byte STORAGE CEILING of window_measures.bin, a property of the file format and not of basketball (audit F-05). It is now the 99th percentile of the measured distribution the hand is drawing.
- **PAINT_SPEED_REGIMES** — `paint.json:speed_ft_s.p10 / .p50 / .p90`  
  the three paint regimes' boundaries — below p10 the filament caps and pools, above p90 it beads. The record's own measured speed percentiles, never chosen numbers.

## geometry

*the floor, the rule book, or physics. Not chosen, and not measurable from the shot record.*

- **FALLOFF_DISC_INTEGRAL** — **0.5**  
  the overlap normaliser. The peak-1 paraboloid falloff integrates to pi*R^2/2 over its own disc, so dividing by that keeps a coordinate's DENSITY setting its brightness and leaves SPLAT_SPACING_K controlling smoothness only. Derived, not chosen: change the falloff and this changes with it.
- **RIM_FT** — **10**  
  the rim's height above the floor, the scale the ball's third dimension is normalised against. The rule book's number, not a choice.
- **RAYLEIGH** — **9.02**  
  Plateau-Rayleigh: the fastest-growing instability on a falling stream has a wavelength of 9.02 radii, so past it a filament cannot wet a continuous line and beads instead. Physics, not a tuning knob — it is what makes the fastest bodies dotted.

## authored

*nobody measured it. It is a decision, and the register is the only place in the piece one may be written down.*

- **TONE_K** — **35000**  
  the tone curve's slope: how fast a coordinate's share of its season saturates toward full brightness. Lower and the record's long tail sinks into the ground while a handful of dense cells carry the image; higher and the whole plate flattens to a uniform glow.
- **TONE_CEILING** — **0.92**  
  the brightest any cell may reach, held below 1 so nothing clips before the per-frame dim is applied — clipping first would darken exactly the dense rim the piece's argument lives on.
- **SPLAT_MIN_PX** — **1.5**  
  the smallest splat radius in device pixels, so a coordinate still deposits something at small window sizes.
- **SPLAT_SPACING_K** — **1.45**  
  splat radius as a multiple of the lattice spacing — how far neighbouring coordinates bleed together. Below about 1 the field reads as a mechanical dot-screen of the record's grid rather than as a photographic density.
- **TRACE_LIT_FLOOR** — **0.1**  
  how lit a trace is at floor level, before the ball's height adds any.
- **TRACE_LIT_RANGE** — **0.62**  
  how much luminance the ball's measured height adds between the floor and the rim. This is the one channel the machine saw in three dimensions, so it is the only channel that changes along a trace.
- **TRACE_HEIGHT_CLAMP** — **1.4**  
  how far above the rim a ball may go on brightening; above this the arc stops getting lighter.
- **TRACE_W_IN_FLIGHT** — **1.5**  
  stroke width of the shot itself, relative to the approach.
- **TRACE_W_APPROACH** — **1**  
  stroke width of the gesture before release.
- **TRACE_W_SCALE** — **0.55**  
  how fast trace width grows with the plate, so a gesture keeps its weight across window sizes.
- **TRACE_APPROACH_DIM** — **0.72**  
  how much quieter the approach is than the flight after release.
- **TRACE_ANCHOR_ALPHA** — **0.8**  
  the dot a trace grew out of, held brighter than the field around it.
- **TRACE_ANCHOR_MIN_PX** — **1.2**  
  smallest anchor-dot radius in pixels, so it survives a small window.
- **TRACE_ANCHOR_SCALE** — **0.9**  
  anchor-dot radius as a multiple of the plate scale.
- **INK** — **9**  
  the light ONE mark deposits, in CSS px^2 of alpha. Ink is conserved: a season's shots lay down the same total however finely they were recorded, so resolution changes how the light is SPREAD and never how much there is. Every stamp is normalised to this by measuring what its sprite actually deposits rather than by deriving it.
- **INK_REFERENCE_MARKS** — **2000**  
  how many marks a season's ink budget is reckoned in, which sets the pin's radius against the baked field. This was the sample size the ink rule was calibrated on, kept when THE FIELD switched from the 2,000-dot sample to every shot so that the pin's weight did not move. It is a calibration reference now and no longer reads anything, which session 5 may want to re-derive from the layer it is balanced against.
- **PIN_CORE_ALPHA** — **0.62**  
  the pin's centre opacity. The pin is the densest thing on the plate because it is a pile, and its radius is solved from this so that its area carries exactly the ink of the shots inside it.
- **PIN_MEAN_ALPHA_K** — **0.7**  
  the gradient's mean opacity as a fraction of its core, which is what turns the pin's ink budget into a radius. Move it and the pile changes size without changing how much light it lays down.
- **PIN_STOP_MID** — **0.72**  
  where the pin's gradient begins to fall — a definite edge, not a bloom.
- **PIN_STOP_MID_ALPHA_K** — **0.92**  
  opacity at that stop, as a fraction of the core.
- **PIN_STOP_OUTER** — **0.9**  
  where the pin's edge turns over into its final falloff.
- **PIN_STOP_OUTER_ALPHA_K** — **0.45**  
  opacity at the outer stop, as a fraction of the core.
- **STAMP_MIN_R_PX** — **0.6**  
  smallest stamp radius in CSS pixels, so a mark never vanishes entirely.
- **STAMP_GRAD_MIN_R** — **0.5**  
  floor on the stamp gradient's outer radius, so a sub-pixel mark still has a gradient to normalise rather than a degenerate one.
- **STAMP_CORE_ALPHA** — **0.55**  
  the stamp gradient's mid stop — how hard or soft a dot's own edge reads.
- **STAMP_MIN_CORE** — **0.02**  
  floor on the gradient's core stop, so the fully diffuse hand still has one.
- **STAMP_MAX_GAIN** — **0.95**  
  opacity ceiling on a normalised stamp, so a very small sprite cannot be asked for more light than an 8-bit channel can carry.
- **SHARP_R** — **1.7**  
  radius, in court tenths, of a mark the record placed to the tenth of a foot. Court units and not pixels: the era's grain must not change with the window it is shown on.
- **SHARP_SOFTNESS** — **0.3**  
  edge diffusion of that mark — how definitely the record placed this KIND of shot.
- **COARSE_R** — **3.3**  
  radius of a mark this era's record placed only loosely — the same ink, spread wide.
- **COARSE_SOFTNESS** — **0.95**  
  edge diffusion of the coarse hand.
- **DRIP** — **0.055**  
  paint deposited per tracked frame. The brush's flow rate, and the scalar every width and opacity in the paint is derived from: ink is conserved against TIME, so w*a = DRIP/v and a body that runs lays a thin faint filament while one that pivots pools.
- **BORE** — **1.15**  
  the filament's radius in court tenths at the median measured speed — the brush's width. Set by eye against the canvas's own accumulation: paint COVERS, so at 2.4 with a heavier DRIP the plate went to opaque mush and a stroke laid last could no longer be seen on top of the ones before it.
- **FILAMENT_ALPHA_CAP** — **0.95**  
  opacity ceiling on one filament segment, so the slowest bodies cannot go fully opaque.
- **FILAMENT_ALPHA_K** — **0.5**  
  how much of DRIP reaches opacity rather than width when ink is split between the two.
- **BEAD_CAP** — **24**  
  the most beads one broken segment may lay. A bound on work, not on physics: past it the beads are closer than a pixel anyway.
- **POOL_EXCESS_K** — **0.5**  
  how much of the ink a capped filament refuses becomes a blot, for a body standing still.
- **POOL_V_FLOOR** — **0.05**  
  speed floor in the pooling term, so a body at rest gives a finite blot rather than an infinite one.
- **POOL_ALPHA_CAP** — **0.9**  
  opacity ceiling on a blot.
- **POOL_ALPHA_K** — **1.1**  
  how much darker a blot is than the filament it grew out of.
- **POOL_R_CAP** — **3.2**  
  the widest a blot may spread, as a multiple of the filament's radius.
- **SPLOTCH_INK** — **9000**  
  ink for the window's drop layer, divided equally between its shots, so the layer weighs the same whatever the recovered set turns out to hold. Conserved the way marks.ts conserves it for dots. The seasons outside the window conserve theirs by AREA instead and use DROP_AREA.
- **SPLOTCH_MIN_R** — **2.6**  
  radius, in court tenths, of the most tightly contested shot in the window — and of every shot outside it, where the record does not say how open anyone was.
- **SPLOTCH_MAX_R** — **9**  
  radius of the most open shot the transfer function draws. Deliberately fat: THE FIELD already draws every shot as a photographic density, and at the same size this hand would simply BE THE FIELD with a different caption.
- **SPLOTCH_ALPHA_CAP_WINDOW** — **0.34**  
  opacity ceiling on a drop inside the window. A MATERIAL cap - the most ink one mark may hold - and no longer a fade cap: the frame's own alpha used to be folded in before it, so how hard it bound depended on how far the coda had receded. It is now applied to the unmultiplied value and the frame's alpha multiplies the finished layer.
- **DROP_AREA** — **250000**  
  the total area of paint one season lays down outside the window, in court tenths squared, divided between its coordinates in proportion to their SHARE of that season. It is what makes a drop's radius carry how many shots landed there. Fixed across all thirty seasons and reckoned in share rather than count, for the reason field.ts:tone gives: normalising each season to its own maximum would falsely equalise them, and the lockout years and the bubble are short, not sparse.
- **DROP_MIN_R** — **1**  
  the smallest drop the brush makes, in court tenths. A coordinate whose share would spread thinner than this still deposits all of its ink - what area refuses goes to opacity instead - so nothing the record filed is dropped and the conservation stays exact at both ends of the range.
- **DROP_MAX_R** — **20**  
  the widest a drop may spread. It binds only where the record piles an extraordinary share of a season onto one coordinate, which it does: past this the mark would read as a region of the floor rather than as a place.
- **DROP_ALPHA** — **0.19**  
  how wet one drop is, outside the window - and it is CONSTANT, which is this layer's whole material argument. THE FIELD varies brightness at a fixed size and adds light; this varies size at a fixed opacity and COVERS. At the same size and a varying opacity the two hands would be the same picture with a different caption.
- **KEPT_OVER_PAINT** — **0.55**  
  how strongly the kept coordinates come back up over the painting through THE INSTANT. Five seconds of body were recorded and one point was filed, and this is that point asserting itself over the gesture it stands for. Nothing new is drawn at all: it is the same layer composited a second time, above instead of below.
- **SPLOTCH_VISIBLE** — **0.004**  
  below this opacity a splotch is skipped — it would deposit less than one 8-bit level.
- **CALIPER_SERIF** — **3.2**  
  half-length of the serif at each end of a caliper, in pixels. The serifs are what make the segment read as a measurement rather than as a line.
- **CALIPER_SERIF_FLOOD** — **1.8**  
  the same serif during the flood, where 150 calipers are on the plate at once.
- **CALIPER_SERIF_CLOSE** — **2.2**  
  the serif over the closing beat, as the calipers come back off the floor.
- **DEFENDER_RING_R** — **9**  
  the defender's ring, in court tenths — open and never filled, because the feed gave the ball a third dimension and the players none.
- **HERO_ALPHA** — **0.85**  
  the opening beat's caliper strength, where one shot is being watched.
- **HERO_RING_ALPHA** — **0.7**  
  the defender ring's strength against its caliper.
- **HERO_PATH_ALPHA** — **0.16**  
  the ground the defender has already covered, faint enough that the closing reads as the subject.
- **HERO_TAIL** — **0.35**  
  how long a hero shot fades out over, as a fraction of its own quarter of the beat.
- **FLOOD_ALPHA_BASE** — **0.045**  
  the strength of an accumulated caliper behind the flood's leading edge — low enough that the eye follows the writing rather than swimming in the tangle.
- **FLOOD_ALPHA_FRESH** — **0.34**  
  the extra strength of the newest caliper at the flood's edge.
- **CLOSE_ALPHA** — **0.25**  
  the calipers' strength over the closing beat, as the plate is emptied.
- **INSTANT_LINE_ALPHA** — **0.7**  
  the hairline out from the hoop whose length IS the mean closest-defender distance — the continuous quantity, before it is cut into four boxes.
- **INSTANT_CUT_ALPHA** — **0.6**  
  the three boundaries struck across that hairline: the moment the number is made.
- **FIGURE_SUB_ALPHA** — **0.55** *(not material)*  
  the small caption under a struck figure, against the figure itself.
- **NAMES_ONLY_ALPHA** — **0.5** *(not material)*  
  Act II's four category names, struck with no figures beside them - the league has begun publishing the measure and nobody outside can make it.
- **BUCKET_LABEL_ALPHA** — **0.55** *(not material)*  
  the four category names beside the boundaries, as the boxes are cut.
- **SLUG_VOICE_TENTHS** — **9** *(not material)*  
  the four sentences the piece is ABOUT - the prelude's, the one that names what a caliper measures, the one that says the league will not name the instant, and the one that says the record keeps only endpoints. At most one is ever on the plate, and it is the loudest thing on it.
- **SLUG_STATEMENT_TENTHS** — **6.6** *(not material)*  
  every other statement: disclosures, dates, counts, the act slugs. Reads without effort on a laptop at a normal viewing distance, which is the only surface this piece has been judged on.
- **SLUG_ASIDE_TENTHS** — **5.5** *(not material)*  
  an annotation subordinate to a mark beside it - the category name under a struck numeral, and the counter-reading's margin line. Unchanged from the one size the piece used everywhere, so these stay put while the sentences around them grow.
- **SLUG_MIN_PX** — **9** *(not material)*  
  a floor in CSS pixels, the one place slug type is NOT in court units: below it the mono face stops resolving at all and the statement is simply lost. It binds only on a small window.
- **SLUG_VOICE_ALPHA** — **0.78** *(not material)*  
  how far the loudest rank is lifted out of the ground it sits on.
- **SLUG_STATEMENT_ALPHA** — **0.62** *(not material)*  
  the ordinary rank's ink. Every slug in the piece used to be multiplied by the aside value below, whatever its caller asked for.
- **SLUG_ASIDE_ALPHA** — **0.5** *(not material)*  
  the subordinate rank's ink, and the value every slug used to take.
- **STRIKE_FACE_ALPHA** — **0.62**  
  the dull face of a struck numeral, under the shadowed wall above it. Raising it turns a cut in the floor into a label laid on top of it.
- **STRIKE_SHADOW_K** — **1.1**  
  how much darker the numeral's upper wall is than its face - the whole of the illusion that the figure is cut rather than printed.
- **STRIKE_SHADOW_MAX** — **0.85**  
  a ceiling on that shadow, so a numeral at full strength does not punch a hole of pure black through the plate.
