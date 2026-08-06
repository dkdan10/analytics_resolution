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

/** Struck numerals: cut into the floor, not laid on top of it. */
export const INSCRIPTION_FAMILY =
  '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
export const SLUG_FAMILY =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';
