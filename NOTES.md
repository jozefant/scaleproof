# NOTES.md — run/tasks-2026-08-24 notebook

Run driver: RUN.md ("Scaleproof TASKS.md burn-down + E2E coverage gate").
Notebook protocol: read before each round, update after.

## Standing constraints (from RUN.md §5)

- No commits on `main`, no push, no npm publish.
- No real repository scans, no real `OPENAI_API_KEY` in tests.
- No Vercel changes, no Node 24 install, no `engines` change (D.3 plan-only).
- P2.2 / F.1 / D.1: notes only.
- Conflict note: `AGENTS.md` says "commit directly to main, no feature
  branches". RUN.md overrides it for this run (branch `run/tasks-2026-08-24`,
  one commit per task). Recorded, not silently resolved.

## Round log

### Round 0 — baseline

- Branch: `run/tasks-2026-08-24`, tree clean except untracked `RUN.md`/`NOTES.md`.
- `npm run verify` baseline: IN PROGRESS (see next update).

## Current best result

| Check | State |
| --- | --- |
| 1. `test:e2e:coverage` >= 60.0% | not started |
| 2. `npm run verify` green | baseline running |
| 3. 7 tasks checked in TASKS.md | not started |
| 4. `docs/node24-upgrade-plan.md` | not started |
| 5. `npm pack --dry-run` in `cli/` | not started |
| 6. one commit per task, clean tree | not started |
| 7. NOTES.md final status table | this file |

## Confirmed findings

(none yet)

## Failed approaches

(none yet)

## Open hypotheses

- Coverage: Playwright browser CDP coverage + `NODE_V8_COVERAGE` on the Next.js
  dev webServer, merged by monocart-coverage-reports with sourcemaps.
- UI.1: `.dossier-cover h1` / `.do-now h2` / `.evidence-dossier h2` already have
  `scroll-margin-top: 88px` (report.module.css:79) which is ~= sticky header
  height, so headings land flush with 0 clearance. Fix = header height + gap,
  plus an e2e assertion requiring positive clearance.

## Critic verdicts

(none yet)
