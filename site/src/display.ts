/** Viewer-distance configuration.
 *
 * `near` preserves the original laptop/exhibit material. `room` changes only
 * legibility-bearing presentation choices: type floors, essential line
 * contrast and persistent context. It is configuration supplied to a pure
 * frame, never inferred from canvas size inside a hand.
 */
export type DisplayProfile = "near" | "room";

export const ROOM_TEXT_MIN_PX = {
  voice: 18,
  statement: 16,
  aside: 13,
} as const;

const CONTEXT_PROFILE = new WeakMap<CanvasRenderingContext2D, DisplayProfile>();

/** Attach viewer-distance configuration to the destination for shared drawing
 * primitives that do not otherwise receive a Frame. `renderTo` writes it at
 * the top of every pure frame. */
export function setContextDisplay(
  ctx: CanvasRenderingContext2D,
  profile: DisplayProfile,
): void {
  CONTEXT_PROFILE.set(ctx, profile);
}

export function contextDisplay(ctx: CanvasRenderingContext2D): DisplayProfile {
  return CONTEXT_PROFILE.get(ctx) ?? "near";
}

export function displayFromQuery(q: URLSearchParams, talk: boolean): DisplayProfile {
  const requested = q.get("display");
  if (requested === "near" || requested === "room") return requested;
  return talk ? "room" : "near";
}

/** Largest DPR inside the backing-pixel budget while retaining the supported
 * presentation surface's native high-density rendering. */
export function boundedDpr(width: number, height: number, deviceDpr: number): number {
  const cssPixels = Math.max(1, width * height);
  const budgetDpr = Math.sqrt(4_000_000 / cssPixels);
  return Math.min(Math.max(0.5, deviceDpr || 1), 2, budgetDpr);
}

/** The same budget shared across multiple full-viewport compositor surfaces.
 * The overview needs one visible destination and one outgoing-frame surface;
 * canonical full/talk uses `boundedDpr` and retains the supported room DPR. */
export function boundedCompositeDpr(
  width: number,
  height: number,
  deviceDpr: number,
  surfaces: number,
): number {
  const cssPixels = Math.max(1, width * height);
  const count = Math.max(1, surfaces);
  const budgetDpr = Math.sqrt(4_000_000 / (cssPixels * count));
  return Math.min(Math.max(Number.EPSILON, deviceDpr || 1), 2, budgetDpr);
}
