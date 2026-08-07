/** Pre-rendered strings, so text costs what a dot costs.
 *
 * The expensive part of a label is not `fillText`, it is assigning `ctx.font`
 * and `ctx.letterSpacing`, which invalidates the shaping cache every time. At
 * two hundred labels a frame that drops frames on a gallery display. So each
 * distinct string is rendered once into its own small canvas and thereafter
 * blitted — exactly what `stamp()` already does for marks.
 *
 * The record uses at most about sixty distinct phrases across all thirty
 * seasons, so one atlas serves the whole piece.
 */

import { BONE_RGB, SLUG_FAMILY } from "./palette";

export interface Label {
  canvas: HTMLCanvasElement;
  /** CSS px. */
  width: number;
  height: number;
}

const atlas = new Map<string, Label>();

export function label(text: string, px: number, dpr: number): Label {
  const key = `${text}|${px.toFixed(2)}|${dpr}`;
  const hit = atlas.get(key);
  if (hit) return hit;

  const font = `${px * dpr}px ${SLUG_FAMILY}`;
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = font;
  const w = Math.ceil(measure.measureText(text).width) + 4;
  const h = Math.ceil(px * dpr * 1.6);

  const c = document.createElement("canvas");
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  const g = c.getContext("2d")!;
  g.font = font;
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.fillStyle = `rgb(${BONE_RGB})`;
  g.fillText(text, 2, h / 2);

  const out: Label = { canvas: c, width: c.width / dpr, height: c.height / dpr };
  atlas.set(key, out);
  return out;
}

/** Resize changes every size key; drop the old ones rather than grow forever. */
export function clearAtlas(): void {
  atlas.clear();
}
