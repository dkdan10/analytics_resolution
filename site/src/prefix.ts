/** An accumulating layer that is never extended in place.
 *
 * THE DEFECT THIS EXISTS TO REMOVE (audit F-04). THE HAND kept one module-level
 * canvas and, when the playhead moved forward, drew the newly-arrived marks
 * onto it; when the playhead moved back it threw the canvas away and rebuilt.
 * The two paths draw the same marks in the same order onto a surface that
 * started empty, so in exact arithmetic they agree. They do not agree in a
 * browser. Measured by `?probe=purity` on 2026-08-08, at the window beats:
 * `backward` and `continuous` matched a cold `direct` render within the noise
 * floor, while `forward` - the ONE history that extends a surface across a
 * later JS turn - differed by tens of thousands of RGB channels. Canvas2D
 * rasterisation is not stable across command batches; drawing A then later B is
 * not the same as drawing A and B together.
 *
 * So the invariant here is stronger than "the cache is keyed correctly":
 *
 *     EVERY CACHED SURFACE IS PRODUCED BY ONE FIXED SEQUENCE OF OPERATIONS,
 *     IN ONE BURST, ONTO A CLEARED SURFACE, AND IS NEVER DRAWN ON AGAIN.
 *
 * A layer's content at step s is defined recursively and only recursively:
 *
 *     S(0) = empty
 *     S(s) = copy of S(s-1), then the marks of step s
 *
 * Each S(s) is one burst. Arriving at step s by walking forward from s-1 and
 * arriving by rebuilding from zero execute the SAME recursion, so they produce
 * the same bytes; what differs between them is only how much of the recursion
 * had already been paid for. That is the shape the fifth rule asks for -
 * scrubbing backwards REBUILDS, it never remembers - and it is why eviction
 * here can only ever cost time.
 *
 * ONE surface is kept per layer, not one per step: a full-viewport surface is
 * megabytes, and a scheme holding one per block would hold hundreds of megabytes
 * at a gallery resolution. The copy is a 1:1 unscaled `drawImage`, which is a
 * plain pixel copy and costs about the same whatever the layer holds. Every step
 * allocates its own fresh canvas and the previous one is released - see the note
 * on the allocation inside `prefixSurface` for why reuse could not be made
 * bit-stable, which is a measurement and not a preference.
 *
 * THE KEY CARRIES EVERYTHING THAT AFFECTS THE PIXELS. THE HAND's old cache was
 * keyed by `${w}x${h}` in DEVICE pixels alone, so a small viewport at a doubled
 * device ratio and a large one at a single ratio collided on one key while
 * `ctx.scale(dpr, dpr)` and the view's own scale differed by a factor of two -
 * the same key, entirely different pixels. `field.ts:layerKey` already carried
 * DPR as its own component; callers here must do the same.
 */

/** A layer's cached prefix: the surface, and which step it holds. */
interface Layer {
  key: string;
  front: HTMLCanvasElement;
  step: number;
  w: number;
  h: number;
}

const layers = new Map<string, Layer>();

/**
 * The surface holding the first `step` steps of a layer, built or reused.
 *
 * `bake(ctx, from, to)` draws the marks of one step onto a cleared surface
 * whose transform is already scaled by `dpr`, so it may work in CSS pixels the
 * way every other renderer here does. It MUST be a pure function of its
 * arguments and the layer's inputs; anything it reads that is not in `key` is a
 * hole in the invariant above.
 *
 * Returns null for step 0 - there is nothing to composite - so a caller can
 * skip a blit rather than paying for an empty one.
 */
export function prefixSurface(
  key: string,
  step: number,
  w: number,
  h: number,
  dpr: number,
  stepSize: number,
  bake: (ctx: CanvasRenderingContext2D, from: number, to: number) => void,
): HTMLCanvasElement | null {
  if (step <= 0) return null;

  let layer = layers.get(key);
  if (layer && (layer.w !== w || layer.h !== h)) layer = undefined;
  // Going backwards REBUILDS. The recursion has no inverse and this is the
  // whole point: there is no path by which a surface carries something the
  // requested step does not contain.
  if (layer && layer.step > step) layer = undefined;

  while (!layer || layer.step < step) {
    const s = layer ? layer.step + 1 : 1;
    // A FRESH CANVAS FOR EVERY STEP, and this is not fastidiousness.
    //
    // The first version of this ping-ponged two canvases, clearing one and
    // drawing the next step onto it. The recursion was identical either way and
    // an isolated test of it - many generations of copy-then-draw, split across
    // two calls - came back byte-identical. In the running piece it did NOT: the
    // purity probe found `forward` and `backward` differing from a cold render
    // at a mean delta of about one, reproducing to the channel across two runs
    // with a stable control (the counts are in docs/probe/, not here). A
    // canvas that has been drawn on, cleared and drawn on again through a long
    // render sequence is not bit-identical to a virgin one of the same size -
    // the browser moves its backing between paths as pressure changes, and
    // nothing at this level can see that happen.
    //
    // So no surface is ever reused. Every step allocates, is written once, and
    // is read only as the source of the next step. That makes the byte content
    // of step s a function of s and the layer's inputs and of nothing else at
    // all, which is what the fifth rule actually asks for.
    const el = document.createElement("canvas");
    el.width = w;
    el.height = h;
    const ctx = el.getContext("2d")!;
    if (layer) {
      ctx.globalCompositeOperation = "copy";
      ctx.drawImage(layer.front, 0, 0);
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bake(ctx, (s - 1) * stepSize, s * stepSize);
    layer = { key, front: el, step: s, w, h };
  }

  layers.set(key, layer);
  // Only a handful of layers are ever live - two per hand, and one hand at a
  // time. Anything older is a resize or an act the playhead has left.
  if (layers.size > 8) {
    const oldest = layers.keys().next().value;
    if (oldest !== undefined && oldest !== key) layers.delete(oldest);
  }
  return layer.front;
}

/** Drop every cached surface. Called from `cold()` in the probes, and it must
 *  change no pixel anywhere - that is precisely what the purity probe tests. */
export function clearPrefixes(): void {
  layers.clear();
}
