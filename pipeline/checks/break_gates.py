#!/usr/bin/env python3
"""Reintroduce each defect on a COPY of data/processed/ and require qa.py to go red.

A gate you cannot break is not evidence. Session 1 shipped four gates carrying
its own acceptance criteria that could not fail under any mutation:

  D1  a hard tautology - one term a count >= 0, the other an `all()` over a
      sequence decide_offset empties before it is written
  D2  a count that is zero by construction, standing in for the count that
      would actually reveal a search too narrow to see its own peak
  D3  "the figure exists and at least one game was testable"
  D4  paint.py's reported maximum compared against paint.py's reported threshold
  D5  nothing decoded paint_strokes.bin at all

Each case below states the mutation, the gate it must redden, and the exact
check name that has to appear as FAIL. The real data/processed/ is never
touched: a mutation root is assembled with its own copy of data/processed/ and
symlinks to the private and bulk directories, and qa.py is run there.

Usage: python3 pipeline/checks/break_gates.py [--case NAME] [--keep]
"""

import argparse
import json
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import REPO_ROOT, require_env  # noqa: E402


def mutate_d1(d):
    """D1: a non-zero offset accepted on far too few votes.

    The old gate read `votes.games_under_min >= 0 and all(... for k, v in
    event_offsets if abs(k) == 12)`. The first term is a count and cannot be
    negative; the second filters the offset distribution to the search
    boundary, which decide_offset converts to zero before counting, so `all()`
    ran over nothing. Setting games_under_min to 631 left 97 checks passing.
    """
    w = json.loads((d / "window.json").read_text())
    rec = w["recovery"]
    rec["votes"]["all_games_under_min"] = 631
    rec["votes"]["under_min"] = 631
    if rec["accepted_offsets"]:
        rec["accepted_offsets"][0]["votes"] = 3
        rec["min_votes_accepted"] = 3
    (d / "window.json").write_text(json.dumps(w))
    return "no accepted shift falls below the minimum vote count"


def mutate_d1b(d):
    """D1: an accepted shift with no lift over the straight join."""
    w = json.loads((d / "window.json").read_text())
    a = w["recovery"]["accepted_offsets"]
    a[0]["at_zero"] = a[0]["votes"]
    (d / "window.json").write_text(json.dumps(w))
    return "every accepted shift clears the straight join by the declared factor"


def mutate_d2(d):
    """D2: four hundred games whose argmax landed on the search boundary.

    The shipped gate reads offsets_on_search_boundary, which is zero however
    narrow the search is. The number that reveals it was printed, never gated.
    """
    w = json.loads((d / "window.json").read_text())
    w["recovery"]["offsets_rejected_by_reason"]["argmax on the search boundary"] = 400
    (d / "window.json").write_text(json.dumps(w))
    return "no game's argmax was refused for landing on the search boundary"


def mutate_d3(d):
    """D3: one testable game, agreeing essentially never.

    The old gate asked only that held_out_agreement was not None and
    held_out_games > 0.
    """
    w = json.loads((d / "window.json").read_text())
    rec = w["recovery"]
    rec["held_out_agreement"] = 0.0001
    rec["held_out_games"] = 1
    for k in rec["held_out_by_outcome"]:
        rec["held_out_by_outcome"][k] = {"games": 0, "agree": 0, "rate": 0.0}
    (d / "window.json").write_text(json.dumps(w))
    return "the held-out split is drawn from most of the corpus"


def mutate_d3b(d):
    """D3: the headline agreement moved without the evidence moving."""
    w = json.loads((d / "window.json").read_text())
    w["recovery"]["held_out_agreement"] = 0.99
    (d / "window.json").write_text(json.dumps(w))
    return "the held-out aggregate is the split it summarises"


def mutate_d4(d):
    """D4: canvases eighty times past the corroboration threshold.

    The old gate compared paint.json's reported max against paint.json's
    reported max_allowed, so raising both left it green - and the
    informational line printed "residual median 260.0 ft" beneath it.
    """
    p = json.loads((d / "paint.json").read_text())
    p["anchor_residual_ft"].update({"max": 480.0, "max_allowed": 500.0,
                                    "median": 260.0, "p90": 400.0})
    (d / "paint.json").write_text(json.dumps(p))
    return "no canvas ships an anchor residual over the corroboration threshold"


def mutate_d5(d):
    """D5: sixty vertices drawing forty-foot chords against a tenth of arc.

    paint_strokes.bin was never opened by the gate, so this shipped green.
    """
    p = json.loads((d / "paint.json").read_text())
    rec = p["files"]["vertices"]["record"]
    size = struct.calcsize(rec)
    path = d / "paint_strokes.bin"
    raw = bytearray(path.read_bytes())
    n = 0
    for i in range(1, len(raw) // size):
        x, y, dt, _arc = struct.unpack_from(rec, raw, i * size)
        if dt == 0:
            continue
        struct.pack_into(rec, raw, i * size, min(32000, x + 400), y, dt, 1)
        n += 1
        if n >= 60:
            break
    path.write_bytes(bytes(raw))
    return "no drawn segment exceeds the arc measured for it"


def mutate_b(d):
    """B: two body slots of one canvas that are one detection reported twice.

    A merged track is perfectly continuous, so every check session 1 added -
    including the full-rate realignment in check_strokes - passes on it.
    """
    p = json.loads((d / "paint.json").read_text())
    srec = p["files"]["index"]["record"]
    vrec = p["files"]["vertices"]["record"]
    ssz, vsz = struct.calcsize(srec), struct.calcsize(vrec)
    iraw = (d / "paint_index.bin").read_bytes()
    vraw = bytearray((d / "paint_strokes.bin").read_bytes())
    strokes = [struct.unpack_from(srec, iraw, i * ssz) for i in range(len(iraw) // ssz)]

    first_of = {}
    for s in strokes:
        first_of.setdefault((s[2], s[4]), s)
    canvas0 = strokes[0][2]
    bodies = sorted(k[1] for k in first_of if k[0] == canvas0 and first_of[k][3] == 0)
    src, dst = first_of[(canvas0, bodies[0])], first_of[(canvas0, bodies[1])]
    n = min(src[1], dst[1])
    for k in range(n):
        vraw[(dst[0] + k) * vsz:(dst[0] + k + 1) * vsz] = \
            vraw[(src[0] + k) * vsz:(src[0] + k + 1) * vsz]
    (d / "paint_strokes.bin").write_bytes(bytes(vraw))
    return "no canvas draws two bodies inside one coordinate quantum"


def mutate_b2(d):
    """B: a shipped canvas whose two closest bodies sat inside the rule.

    The byte gate above works at the storage quantum, because simplification
    moves the drawn line; this is the rule at the precision it was measured at.
    """
    p = json.loads((d / "paint.json").read_text())
    p["coincidence_ft"]["shipped_min"] = 0.0
    (d / "paint.json").write_text(json.dumps(p))
    return "no shipped canvas holds two bodies closer than the rule allows"


def mutate_c1(d):
    """C1: the paint stops three weeks short of the window's closure."""
    p = json.loads((d / "paint.json").read_text())
    p["date_last"] = "2016-01-03"
    (d / "paint.json").write_text(json.dumps(p))
    return "the paint reaches the window's opening and its closure"


def mutate_a1(d):
    """A1: games decided on the anchor-keyed vector, where zero cannot lose."""
    w = json.loads((d / "window.json").read_text())
    total = sum(w["recovery"]["searched"].values())
    w["recovery"]["searched"] = {"full": total - 445, "direct": 445}
    (d / "window.json").write_text(json.dumps(w))
    return "every game's offset was decided on the full release set"


CASES = {
    "D1-votes": mutate_d1,
    "D1-lift": mutate_d1b,
    "D2-boundary": mutate_d2,
    "D3-heldout": mutate_d3,
    "D3-aggregate": mutate_d3b,
    "D4-residual": mutate_d4,
    "D5-chord": mutate_d5,
    "B-coincident": mutate_b,
    "B-shipped-min": mutate_b2,
    "C1-terminus": mutate_c1,
    "A1-searched": mutate_a1,
}


def build_root(tmp):
    """A repo root whose data/processed/ is a copy and whose bulk and private
    directories are the real ones. qa.py resolves REPO_ROOT from its own path,
    so pipeline/ must be a real copy - a symlink would resolve back."""
    root = Path(tmp) / "root"
    (root / "data").mkdir(parents=True)
    shutil.copytree(REPO_ROOT / "pipeline", root / "pipeline",
                    ignore=shutil.ignore_patterns("__pycache__"))
    shutil.copytree(REPO_ROOT / "data" / "processed", root / "data" / "processed")
    for name in ("shots", "raw", "window"):
        src = REPO_ROOT / "data" / name
        if src.exists():
            (root / "data" / name).symlink_to(src)
    for name in (".python-version", "requirements.txt"):
        if (REPO_ROOT / name).exists():
            shutil.copy2(REPO_ROOT / name, root / name)
    return root


def run_qa(root):
    r = subprocess.run([sys.executable, str(root / "pipeline" / "qa.py")],
                       capture_output=True, text=True, cwd=str(root))
    return r.returncode, r.stdout + r.stderr


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--case")
    ap.add_argument("--keep", action="store_true")
    args = ap.parse_args()
    require_env()

    cases = {args.case: CASES[args.case]} if args.case else CASES
    with tempfile.TemporaryDirectory() as tmp:
        root = build_root(tmp)
        pristine = Path(tmp) / "pristine"
        shutil.copytree(root / "data" / "processed", pristine)

        code, out = run_qa(root)
        print(f"baseline (unmutated copy): exit {code}, "
              f"{out.count('  PASS')} PASS, {out.count('  FAIL')} FAIL")
        if code != 0:
            print(out[-3000:])
            sys.exit("the unmutated copy is already red - fix that first")

        results = []
        for name, fn in cases.items():
            shutil.rmtree(root / "data" / "processed")
            shutil.copytree(pristine, root / "data" / "processed")
            want = fn(root / "data" / "processed")
            code, out = run_qa(root)
            named = any(ln.startswith("  FAIL") and want in ln for ln in out.splitlines())
            good = code != 0 and named
            results.append((name, good, code, want))
            print(f"  {'RED (good)' if good else 'STILL GREEN'}  {name:14} exit {code}  "
                  f"-> {want!r}{'' if named else '   <-- that check did NOT fail'}")

        if args.keep:
            keep = REPO_ROOT / "data" / "window" / "break_gates_root"
            shutil.rmtree(keep, ignore_errors=True)
            shutil.copytree(root / "data" / "processed", keep)
            print(f"  mutated copy kept at {keep}")

    bad = [n for n, good, _, _ in results if not good]
    print(f"\n{len(results) - len(bad)}/{len(results)} defects make qa.py go red")
    if bad:
        print(f"GATES RED-BLIND: {', '.join(bad)}")
        sys.exit(1)
    print("BREAK-GATES GREEN: every gate listed fails when its defect returns.")


if __name__ == "__main__":
    main()
