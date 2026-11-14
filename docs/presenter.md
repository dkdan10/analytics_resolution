# Viewing and presenting FADEAWAY

The piece has one canvas and one time value. Everything below is a way of choosing which
instant to look at, and in which rendering.

## Entry points

- A bare `/` opens the player, the public landing page: the full work's own canvas, playing from
  the prelude's card, with a small panel to pause it, scrub it, step through its stops and pick a
  rendering, a door to the overview and a door to the full work. A visitor who asks for reduced
  motion gets it paused. `?experience=player` opens the same, and `&t=`, `&stop=` or `&mode=`
  beside it choose where it opens.
- `?experience=overview` plays the guided overview: a short tour that visits each rendering in
  turn, with a title and a `FULL WORK` link. Escape returns to the player.
- `?experience=full` plays the complete work without chrome, one pass of the loop per rendering. A
  moving pointer shows the cursor briefly; Escape returns to the player.
- `?talk` opens the full work with the presenter rail, paused; add `&autoplay=1` to start it
  moving. `?nav` adds the rail to an autoplaying full view.
- `?display=near|room` selects legibility for viewer distance. Talk mode defaults to `room`.

## Direct addresses

`?t=<seconds>`, `?year=<YYYY>`, `?stop=<semantic-id>`, `?mode=<id>` and `?ops=<letters>` all
compose. `?stop=` is the durable form for citing a frame: the ids are stable across edits to the
schedule where a raw `t` is not. Examples: `hand.game`, `plate.shell`, `ledger.crest`,
`census.machine-saw`, `measure.terminal`, `window.crest`. **CITE THIS FRAME** in the rail copies
the current frame's address to the clipboard.

## The renderings

Six renderings take turns over the same record, one per pass of the loop:

- **the plate**: the evidence, every filed coordinate as a mark;
- **the field**: the same record in the league's own zone colours;
- **the ledger**: the record's vocabulary, each season's action types at their own weight;
- **the census**: the record's counts, including what the tracking machine saw and what the
  record kept;
- **the measure**: one published statistic, closest-defender distance, made in front of you for
  the days it can be made;
- **the hand**: paint, whose strokes are real player trajectories from the tracking window.

A seventh, **the stack**, is presenter-only (`?mode=stack` needs `?talk` or a visible `?nav`). It
composites the others' material one named interpretive operation at a time, and with everything
applied the plate becomes illegible, which is the point. Its eight operations take one letter
each (`l` `c` `i` `b` `d` `n` `e` `j`, and `a` for ALL RENDERINGS), and the same letters form
the URL token, so a configured frame such as `?talk&mode=stack&ops=lcij&stop=window.crest`
reopens exactly.

## Keys

In the player:

| key | action |
|---|---|
| `space` | pause or resume (so does a click on the canvas) |
| `←` `→` | back or forward by the scrub's step; with `shift`, by its coarse step |
| `,` `.` | previous / next stop of the rendering on screen |
| `h` | the same instant in the next rendering |
| `home` | the start of the pass on screen |
| `escape` | from `?experience=full` or `?experience=overview`, back to the player |

With `?talk` or `?nav`:

| key | action |
|---|---|
| `space` | pause |
| `f` | fermata: hold the current frame |
| `0` | the start |
| `1` to `5` | the acts |
| `6` to `9` | the four shared beats inside the tracking window |
| `w` | the window |
| `x` | the cut |
| `,` `.` | previous / next scored stop |
| `h` | cycle the rendering |

## Looking at exact frames

`cd site && npm run shots -- --list hands` renders exact frames to disk through an installed
Chrome, for looking at. It is not a gate and must not become one. The other diagnostics behind
`?probe=` are described in [verification.md](verification.md).
