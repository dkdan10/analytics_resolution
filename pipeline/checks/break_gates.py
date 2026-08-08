#!/usr/bin/env python3
"""Reintroduce each defect on a COPY of the repo and require qa.py to go red.

A gate you cannot break is not evidence. Session 1 shipped four gates carrying
its own acceptance criteria that could not fail under any mutation:

  D1  a hard tautology - one term a count >= 0, the other an `all()` over a
      sequence decide_offset empties before it is written
  D2  a count that is zero by construction, standing in for the count that
      would actually reveal a search too narrow to see its own peak
  D3  "the figure exists and at least one game was testable"
  D4  paint.py's reported maximum compared against paint.py's reported threshold
  D5  nothing decoded paint_strokes.bin at all

Session 2 found seven more of the same kind - the window and paint stages could
be DELETED from disk, or served as equal-length runs of zeros, and the gate
still printed GREEN.

This file is the end-to-end half of the demonstration. The defect catalogue
lives in checks/mutations.py and is shared:

  qa.py --mutations      the same cases, in-process, against a copy of
                         data/processed/. Seconds. Part of every gate run.
  break_gates.py         the same cases, each through a REAL `python3 qa.py`
                         subprocess on a mutated repo root. Slower, and the
                         stronger claim: it is the command a person runs.

Every gate added to qa.py belongs in that catalogue. The real data/processed/ is
never touched: a mutation root is assembled with its own copy of the processed
tree and symlinks to the private and bulk directories.

Usage: python3 pipeline/checks/break_gates.py [--case NAME] [--keep] [--list]
"""

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import REPO_ROOT, require_env  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mutations import BY_NAME, CASES  # noqa: E402


def build_root(tmp):
    """A repo root whose data/processed/ is a copy and whose bulk and private
    directories are the real ones. qa.py resolves REPO_ROOT from its own path,
    so pipeline/ must be a real copy - a symlink would resolve back. site/ comes
    too, because the decoder-parity check reads the site's own source."""
    root = Path(tmp) / "root"
    (root / "data").mkdir(parents=True)
    shutil.copytree(REPO_ROOT / "pipeline", root / "pipeline",
                    ignore=shutil.ignore_patterns("__pycache__"))
    shutil.copytree(REPO_ROOT / "data" / "processed", root / "data" / "processed")
    (root / "site").mkdir()
    shutil.copytree(REPO_ROOT / "site" / "src", root / "site" / "src")
    for name in ("shots", "raw", "window"):
        src = REPO_ROOT / "data" / name
        if src.exists():
            (root / "data" / name).symlink_to(src)
    for name in (".python-version", "requirements.txt"):
        if (REPO_ROOT / name).exists():
            shutil.copy2(REPO_ROOT / name, root / name)
    return root


def run_qa(root):
    # --no-mutations, or every subprocess would run the whole catalogue again
    # inside itself. This file IS the outer loop.
    r = subprocess.run([sys.executable, str(root / "pipeline" / "qa.py"), "--no-mutations"],
                       capture_output=True, text=True, cwd=str(root))
    return r.returncode, r.stdout + r.stderr


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--case", choices=sorted(BY_NAME))
    ap.add_argument("--keep", action="store_true")
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()
    require_env()

    if args.list:
        for c in CASES:
            print(f"{c.name:<18} [{','.join(c.groups)}] {c.why}")
            print(f"{'':<18} -> {c.catches}")
        return

    cases = [BY_NAME[args.case]] if args.case else CASES
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
        for c in cases:
            shutil.rmtree(root / "data" / "processed")
            shutil.copytree(pristine, root / "data" / "processed")
            c.mutate(root / "data" / "processed")
            code, out = run_qa(root)
            named = any(ln.startswith("  FAIL") and c.catches in ln for ln in out.splitlines())
            good = code != 0 and named
            results.append((c.name, good))
            print(f"  {'RED (good)' if good else 'STILL GREEN':<12} {c.name:<18} exit {code}  "
                  f"-> {c.catches!r}{'' if named else '   <-- that check did NOT fail'}")

        if args.keep:
            keep = REPO_ROOT / "data" / "window" / "break_gates_root"
            shutil.rmtree(keep, ignore_errors=True)
            shutil.copytree(root / "data" / "processed", keep)
            print(f"  mutated copy kept at {keep}")

    bad = [n for n, good in results if not good]
    print(f"\n{len(results) - len(bad)}/{len(results)} defects make qa.py go red")
    if bad:
        print(f"GATES RED-BLIND: {', '.join(bad)}")
        sys.exit(1)
    print("BREAK-GATES GREEN: every gate listed fails when its defect returns.")


if __name__ == "__main__":
    main()
