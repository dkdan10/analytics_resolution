# quantified-court

**The Analytics Resolution: How Quantifying the NBA Has Changed the Game** — paper and studio
piece (**FADEAWAY**) for "Theories, Methods, and Experiments in Art and AI," Columbia.

Deliberately minimal start: documents only. `CLAUDE.md` carries the ground rules;
`docs/build-plan-v2.md` is the verified reference; `docs/thesis-and-course-resources.md` is the
argument. Everything else gets built here, fresh.

## First session

```bash
claude          # then /context to confirm CLAUDE.md loaded; Shift+Tab twice for plan mode
```

Suggested first prompt:

> Read CLAUDE.md fully, then docs/build-plan-v2.md Part I (the verified data landscape) and
> §3.1-3.2. **Milestone 1 — own the data, fresh.** Do your own deep dive: verify the sources
> live (the shot-record dumps and the 2015-16 SportVU corpus — confirm they exist and inspect
> real files yourself), then design and build the acquisition + aggregation pipeline from
> scratch in `pipeline/` (the plan's Appendix A2 recipe and CLAUDE.md's gotchas are your map;
> the implementation is yours). Output: per-season aggregates + samples in `data/processed/`
> plus a QA script. Acceptance: reproduce the measured table in plan §1.6 exactly.
> When data is green, switch to plan mode and propose 2-3 design directions for FADEAWAY —
> plan Part III is a proven default, not a mandate; I want creative options before we commit.
> Design brief for those proposals: a working prototype exists outside this repo and I like its
> concept and its data — but it reads as an instrument (stat tiles, panels, visible controls).
> Push toward artwork: cinematic pacing, gallery presence, radical restraint in UI chrome —
> numbers arriving like intertitles at act boundaries, not living in a dashboard row. At least
> one proposal should assume two modes from one codebase: an exhibit mode (autoplaying loop,
> zero visible UI) and a talk mode (keyboard-driven for the symposium). Surprise me.

## Structure (grows from here)

```
CLAUDE.md          ground rules + decisions log
docs/              the plan (reference) + the thesis
.claude/           settings (pre-approved routine commands)
pipeline/          data acquisition + aggregation (Milestone 1)
site/              FADEAWAY — the piece itself (Milestone 2+)
data/processed/    committed derived JSON  (raw data is gitignored, never committed)
```
