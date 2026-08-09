# The material register

*Generated from `site/src/scalars.ts` by `npm run disclose`. Do not edit: edit the register.*

Grain is a measurement, not a mood. Every material property of a mark in FADEAWAY — its radius, stroke width, opacity, colour, bead count, pooling, falloff or tone — derives from a measured property of the record. Where one genuinely cannot be measured, it is named here, in one place, with what it controls.

**133 scalars**, 91 of them material: 2 measured, 3 geometry, 128 authored.

A renderer in the mark layers — `field.ts`, `bloom.ts`, `marks.ts`, `modes/hand.ts`, `modes/measure.ts`, `prefix.ts`, `inscription.ts`, `modes/ledger.ts`, `modes/census.ts`, `palette.ts`, `modes/stack.ts`, `modes/operations.ts`, `modes/fieldlayer.ts` — may not write a material number inline; `npm run check:numbers` fails the build if one appears.

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
- **SPLAT_SPACING_K** — **1.8494**  
  splat radius as a multiple of the lattice spacing — how far neighbouring coordinates bleed together. THE OLD DISCLOSURE MISDESCRIBED ITS OWN FAILURE: it said the artefact appears 'below about 1', and the failure is not smallness. The falloff is a peak-1 paraboloid on a disc of radius K*spacing, so its response at the lattice's own fundamental is PROPORTIONAL TO J2(2*pi*K), whose argument is K and nothing else — the spacing cancels because the radius is a multiple of it. That response has ZEROS at 0.8174, 1.3396, 1.8494 and 2.3548 (j2,n / 2*pi) and SIDELOBES BETWEEN THEM. The old 1.45 sat on a sidelobe, which is why sessions 5a and 5b both reported the record's own grid beating through the field at every window size and neither could say why. This is the third zero: the lowest that also INCREASES neighbour bleed, which is the other half of what this scalar is for. Two limits, stated because an earlier version of this line overclaimed both. The K-only result is a CONTINUOUS one and the kernel is pixel-sampled, so at low device ratios — where the radius is only two or three device pixels — the null is shallower than the algebra promises. And ink is CONSERVED, not identical: replaying the bake over the shipped season_2015.bin, total deposited light varies under one per cent across K in [1.0, 3.0], because FALLOFF_DISC_INTEGRAL normalises the splat's own overlap. So this is smoothness, to within that. Still `authored`: WHERE the zeros are follows from the falloff and the lattice, but WHICH one to sit on is a judgement.
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
- **SCATTER_TENTHS** — **4.75** *(not material)*  
  the size of a label on a datapoint, in court tenths. NUMERICALLY WHAT IT HAS ALWAYS BEEN - it was written as a multiple of the viewport's scale, which happens to come to the same thing and hid the fact that a label is half a foot tall on the floor. Expressed in court units so it cannot drift from the marks it annotates.
- **SCATTER_MIN_PX** — **8** *(not material)*  
  a CSS-pixel floor for the scatter, so it survives a small window.
- **SCATTER_ALPHA** — **0.3** *(not material)*  
  the scatter's alpha ceiling, dropped from what it was so it sits UNDER the spoken register rather than competing with it. This is the audit's 'secondary residue', and it is still every label the hand ever drew - what changed is that there is now something above it.
- **TERM_HEAD_TENTHS** — **30** *(not material)*  
  the size of the head phrase AT THE REFERENCE SHARE, in court tenths - the top of the type ladder. Every head term is this scaled by the square root of its own share against the largest share any season reaches, so AREA is proportional to the shots the word names, which is the law the pin already obeys. The reference share itself is computed over the corpus at load and is never written down.
- **TERM_BIRTH_TENTHS** — **20** *(not material)*  
  the size of a phrase the record is filing for the FIRST time. Authored rather than share-scaled on purpose, and the margin line beneath it discloses exactly what it is: most births are under one per cent, so sizing the moment the archive learned a word by that word's share would whisper it.
- **TERM_NINETY_TENTHS** — **12** *(not material)*  
  any phrase inside the season's ninety-per-cent set that is not the head.
- **TERM_TAIL_TENTHS** — **9** *(not material)*  
  anything outside it. Rarity is expressed as rarity of UTTERANCE, not as smallness: shares span five decades and every continuous map of them - root, log, linear - drops most of the vocabulary below the acuity limit. A rare phrase is rare because the plate almost never says it, and when it does it is said legibly.
- **TERM_MARGIN_SCALE** — **0.3** *(not material)*  
  the disclosure line under a birth, as a fraction of the term above it.
- **TERM_HOLD_SECONDS** — **3** *(not material)*  
  how long a spoken term stays on the plate. The one pacing scalar the spoken register adds, and the reason the hand is readable at all: a scatter label in the calmest season lives about a sixth of a second, because the arrival edge moves far faster than a reader.
- **TERM_CLEAR_PAD** — **0.35** *(not material)*  
  cap heights of empty floor demanded around a spoken term before another may be placed. Local emptiness is what makes a large word read; the collision test is on boxes in court tenths, because a twelve-tenth phrase is over a hundred tenths WIDE and point exclusion misses that.
- **TERM_ALPHA_FRESH** — **0.85** *(not material)*  
  a spoken term's ink when it is struck.
- **TERM_ALPHA_AGED** — **0.4** *(not material)*  
  and when it is about to go. It never reaches invisibility: a term that fades to nothing reads as a fault rather than as a word being replaced.
- **TERM_TIE_ALPHA** — **0.28** *(not material)*  
  the hairline from the mark to the word. This is what keeps a three-foot phrase reading as an ANNOTATION of one datapoint rather than as a headline laid over the floor - the tie between description and shot, made explicit.
- **LEAGUE_NAME_TENTHS** — **13** *(not material)*  
  the twelve names the league publishes instead of the geometry, all at ONE size, and that is the argument: every other word on this plate is sized by how many shots it names, and these cannot be, because the record beneath them is not public. They were drawn at scatter size, among two hundred action labels, so Act V's claim was invisible.
- **LEAGUE_VALUE_SCALE** — **0.62** *(not material)*  
  the recomputed figure under a league name in Act III, as a fraction of the name. It was nearly the same size as the name and did not read as subordinate to it.
- **TERM_MARGIN_ALPHA** — **0.7** *(not material)*  
  the FIRST FILED line under a birth term, against the term itself. It discloses what the size above it is claiming, so it has to be readable and must not compete.
- **LEAGUE_NAME_ALPHA** — **0.62** *(not material)*  
  a published measure's name, where the league's words hold the emptied mid-range.
- **LEAGUE_VALUE_ALPHA** — **0.5** *(not material)*  
  the recomputed figure beneath it, inside the window only. Below the name it belongs to, because the name is the claim and the figure is this project's reconstruction of it.
- **LEAGUE_ARRIVAL_K** — **0.5** *(not material)*  
  how fast a league name reaches full ink as the act accumulates them - the newest is half-struck while the one before it is whole, so the arc reads as filling rather than as appearing. Pacing, not grain.
- **ENGRAVING_ALPHA** — **0.085**  
  the engraved court - baseline, sidelines, lane, free-throw circle and the three-point line. Never brighter than the marks it holds: above roughly a tenth the floor reads as a diagram with data on it rather than as a plate the record is accumulating on.
- **ENGRAVING_FAINT_ALPHA** — **0.05**  
  the apparatus at the centre of the record - backboard, rim and the restricted arc. Fainter than the rest of the engraving because it sits exactly where the density is highest, and at the same weight it would cut a visible ring through the one region every act is about.
- **STRIKE_MAX_TENTHS** — **55**  
  the cap height, in court tenths, a category holding ONE HUNDRED PER CENT of a season would be struck at. Every word is this times the square root of its own share, so the word's AREA is proportional to the shots it names - the law drawPin already obeys. Raise it and the biggest categories run off the floor; lower it and the census stops being monumental and goes back to being a list.
- **STRIKE_FLOOR_TENTHS** — **4.75**  
  the smallest a struck word may be. A category whose share would draw it under this is a tick and a number in the footer instead. DELIBERATELY THE SAME VALUE AS SCATTER_TENTHS, which is the rule rather than a coincidence: a struck category is never smaller than a label on a single datapoint, because below that it has stopped being a monument and become THE LEDGER's grain. AT THIS VALUE IT BINDS ON NOTHING, and that is the artist's decision, taken against a measurement. It was first set high enough to keep only the three or four largest words - which cost DESCRIPTION most of its vocabulary while the five fixed taxonomies lost nothing - and the ruling was to have the whole named set on the floor and accept the smaller type. So `vocabulary.covering_90pct` is what decides the count again, exactly as the direction specifies, and this only stops a degenerate case: the smallest member of any season's ninety-per-cent set measures 4.89 tenths, just above it.
- **WORD_CLEAR_PAD** — **0.22**  
  cap heights of clear floor a struck word demands around itself before another may be laid. The collision test is done in POLAR terms because the words are laid tangent to the hoop, so this pads a radial gap and an angular one at once.
- **ROTATE_STEP_RAD** — **0.11**  
  the bearing step a word is moved by when it collides. BEARING IS THE ONLY FREE VARIABLE: distance from the basket is the quantity this entire piece is about and is never perturbed, and the disclosure line on the plate says so. Smaller steps find more room and cost more tries.
- **ROTATE_MAX_RAD** — **1.5708**  
  how far around its own radius a word may be moved before the plate gives up and does not strike it at all. A quarter turn: past that the word is describing a different part of the floor from the one the record put it in. What it refuses is counted in the footer rather than hidden.
- **SIXFOLD_SECONDS** — **2.2** *(not material)*  
  how long ALL SIX taxonomies are struck at once at a season's opening before five withdraw. It is the 31-to-75 growth made a single perceivable event that recurs thirty times, and it is the only pacing scalar this hand adds.
- **SIXFOLD_ALPHA** — **0.3**  
  how strongly the other five are struck during that moment. Low enough that the floor reads as covered rather than as legible - the point is the DENSITY of six overlapping vocabularies, not any one of them.
- **CENSUS_FIELD_DIM** — **0.5**  
  how far the season's marks are held back beneath the filing. The census is about the marks, so they have to be there; the words are cut into the plate underneath and the marks settle over them.
- **CENSUS_TICK_TENTHS** — **9**  
  the arm length of the incised cross struck at EVERY category's place, named or not. The tick count is the taxonomy's whole size, so five constellations never change their count across thirty seasons while the sixth breeds - the growth seen rather than read.
- **CENSUS_TICK_ALPHA** — **0.3**  
  how deeply a tick is cut, against the words above it.
- **CENSUS_TICK_WEIGHT** — **1.4**  
  a tick's stroke width as a multiple of the plate scale, so the incision keeps its weight across window sizes. Heavier than the engraving it is cut beside, because a tick stands for a whole category of the record.
- **CENSUS_WORD_ALPHA** — **0.92**  
  the struck word's own strength, before the frame's fade. Near the top of the range because these ARE the hand - the tables they replaced were the brightest thing on the plate and read as an overlay.
- **MACHINE_SAW_SCALE** — **0.6**  
  the window's seventh beat - the count of body positions the machine held - as a fraction of the largest a category may be struck at. It is the strongest content the census has and it used to be set in the smallest type on screen, in a gutter. Struck below a full-share word because it is a count and not a share, and nothing here is entitled to the whole floor.
- **CENSUS_SHARE_SCALE** — **0.32** *(not material)*  
  the share numeral riding under each word, as a fraction of the word. Subordinate on purpose: the word's own SIZE already carries the share, and the numeral only says exactly how much.
- **CENSUS_HEAD_ALPHA** — **0.75** *(not material)*  
  the tally's own heading line - the season and the count classified so far.
- **CENSUS_ROW_ALPHA** — **0.72** *(not material)*  
  a tally row's ink - the receipt column in the gallery, and every row of the full apparatus behind the rail. Above the headings it sits under, because the rows are the content and the heading only says what kind.
- **CENSUS_SUB_ALPHA** — **0.45** *(not material)*  
  the line beneath it, naming how many categories in how many taxonomies. Subordinate, because it describes the machine rather than counting shots.
- **INSTANT_BAND_HALF_W** — **90**  
  how far either side of the centreline a category boundary is drawn, in court tenths - how wide the four boxes are. It carries NO measurement: the boundary's DISTANCE from the hoop is the measured axis and is untouched by this. At the foot and a half it used to be, the one image this piece calls its whole argument read as a small ladder near the rim instead of as a continuous quantity being divided (audit V-06).
- **BUCKET_NAME_TENTHS** — **6.6** *(not material)*  
  the size of a category name inside its own band, in court tenths. It was set at the size of a label on a datapoint, against a tick, and could not be read; it now matches the statement rank the rest of the piece speaks at. Typography, not grain.
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
- **STACK_FIELD_DIM** — **0.78**  
  how bright the one shot-material base is under a stack of operations. At full strength the field is the whole image and the six layers over it read as decoration on a picture that was already finished; held here, the marks stay the ground the other operations are applied TO.
- **STACK_INSCRIPTION_DIM** — **0.72** *(not material)*  
  the struck season numerals' ink in the composite. In THE PLATE the figure is the thing the frame is about; here it is one operation of seven, and at its own weight it dominates every layer a presenter adds after it. Typography, not grain.
- **STACK_DISCLOSURE_INSET** — **18** *(not material)*  
  how far inside the plate's far edge a disclosure line sits, in court tenths. Composition: it moves a sentence, never a mark.
- **STACK_WINDOW_FIELD_DIM** — **0.4**  
  how far the shot-material base yields when a WINDOW operation is applied over it — the painted possession or the calipers. Both are thin by measurement rather than by choice (ink is conserved against time, and one possession is one possession), so against a field at full weight neither is visible at all. THE PLATE dims its own field through Act III for the same reason and this is that rule, applied when the presenter names the operation instead of when the act arrives. Raise it and CONNECT THE BODY stops changing the plate when it is switched on.
- **STACK_NAME_DIM** — **0.8** *(not material)*  
  the spoken term's ink in the composite. Its SIZE is not touched — area is proportional to the shots the word names, which is the measurement THE LEDGER's register is built on — so ink is the only lever that can make it one voice among seven rather than the loudest thing on the plate. Typography, not grain.
- **STACK_CALIPER_ALPHA** — **0.55**  
  the four hero calipers' ink. A caliper is a hairline the length of the floor, and four of them at full strength read as engraving rather than as one operation applied over others.
- **STACK_TICK_ALPHA** — **0.8**  
  the census tick's ink relative to THE CENSUS's own. The ticks are the one part of COUNT THE EVENT that lands on the floor, and their COUNT is the measurement — how many categories the taxonomy has — so they have to stay individually countable against a lit field without becoming a second population of marks.
- **STACK_GUTTER_TENTHS** — **7.5** *(not material)*  
  the tally's type size in the exterior gutter, in court tenths — so the margin's type scales with the floor like every other string in the piece and does not change with the window. Typography, not grain.
- **STACK_GUTTER_PAD_TENTHS** — **24** *(not material)*  
  how far outside the plate's sideline the tally is set, in court tenths. Composition: it holds the count clear of the court so COUNT THE EVENT never occupies the floor the way NAME THE ACTION does.
- **STACK_GUTTER_ROW_ALPHA** — **0.46** *(not material)*  
  a tally row's ink in the margin. Typography, not grain.
- **STACK_GUTTER_SUB_ALPHA** — **0.3** *(not material)*  
  the margin's subordinate lines — the record's own column name above the tally, and the tick-and-a-count tail below it.
