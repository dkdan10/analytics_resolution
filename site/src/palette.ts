/** The plate's materials.
 *
 * A warm near-black ground that reads as a silver-gelatin shadow rather than
 * screen black, bone marks, and hairlines faint enough that the court is
 * recognised a beat after the image is - which is the piece's first event.
 */

export const GROUND = "#0b0a09";
export const BONE = "#e8e2d6";
export const BONE_RGB = "232, 226, 214";

/** The engraving. Never brighter than the marks it holds. */
export const LINE = `rgba(${BONE_RGB}, 0.085)`;
export const LINE_FAINT = `rgba(${BONE_RGB}, 0.05)`;

export function bone(alpha: number): string {
  return `rgba(${BONE_RGB}, ${alpha})`;
}

/**
 * THE FIELD's hues — one per SHOT_ZONE_BASIC category, in the pipeline's own
 * ZONES order.
 *
 * The categories are the NBA's, not the artist's, and the wall text says so;
 * which hue stands for which is authored, and named and disclosed here:
 * colouring by zone does not add a classification, it exposes one the league
 * already imposed. Hue is therefore a measurement like every other material
 * property here, which is the only footing on which this piece may use colour
 * at all.
 *
 * The assignment runs warm through the middle of the floor and cool along the
 * arc, so the corpus carries the image from warm-centred to cool-edged as a
 * consequence of the migration rather than as a second, invented channel. The
 * split is warm-versus-cool rather than red-versus-green, and lightness varies
 * with hue, so the seven stay separable for colour-blind viewers and survive a
 * bright room.
 */
export const ZONE_RGB: string[] = [
  "255, 196, 107", // Restricted Area      — gold, the brightest thing on the floor
  "242, 146, 78",  // In The Paint (Non-RA) — orange
  "224, 90, 65",   // Mid-Range             — rust; the colour that drains away
  "89, 184, 201",  // Left Corner 3         — cyan
  "79, 163, 212",  // Right Corner 3        — cool blue
  "125, 146, 224", // Above the Break 3     — indigo; the colour that floods in
  "143, 138, 132", // Backcourt             — grey; heaves, and almost never seen
];

/** Struck numerals: cut into the floor, not laid on top of it. */
export const INSCRIPTION_FAMILY =
  '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
export const SLUG_FAMILY =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';
