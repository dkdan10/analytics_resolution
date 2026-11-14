/**
 * Which entry an address opens.
 *
 * Import-free and written in erasable syntax only, so the address table can be
 * checked in Node with no bundler: `scripts/route-check.mjs` loads this file
 * as it stands.
 */

/** The keys that address a frame directly. Any one of them keeps the visitor
 *  on the canonical work, so a bookmark to a frame always opens that frame. */
export const DIRECT_KEYS = ["t", "year", "stop", "mode", "ops"] as const;

export type Landing = "overview" | "player";
export type Entry = "canonical" | Landing;

/** What the bare address serves. The cast keeps the type wider than the
 *  value, so a comparison with the other landing stays legal while this one is
 *  in force. `route-check.mjs` pins it: changing it alone turns that check red. */
export const LANDING = "overview" as Landing;

/**
 * Existing direct-frame and working addresses stay on the canonical work: the
 * presenter's keys, the rail, a probe, an explicit request for the full work,
 * and any direct key. Only an explicit request for the overview, or an address
 * that asks for none of these, chooses otherwise, and the bare address serves
 * `LANDING`.
 */
export function entryOf(q: URLSearchParams): Entry {
  if (q.has("talk") || q.has("nav") || q.has("probe")) return "canonical";
  if (q.get("experience") === "full") return "canonical";
  if (q.get("experience") === "overview") return "overview";
  if (DIRECT_KEYS.some((key) => q.has(key))) return "canonical";
  return LANDING;
}
