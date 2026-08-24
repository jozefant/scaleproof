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
- `npm run verify` baseline: **PASS, exit 0** — lint, tsc6, tsc7,
  14 Vitest files / 155 tests, production build, 10 Playwright tests.

### Round 1 — coverage scoreboard (RUN.md step 2)

Built and committed `5a9bf99`.

- `scripts/coverage-server.mjs` runs Next.js in process. `next dev` supervises a
  child and Playwright kills it with SIGTERM, which skips V8's exit-time
  profile write; the in-process server flushes deliberately
  (`/__coverage__/flush` + SIGTERM handler).
- `playwright.coverage.config.ts` sets `NODE_V8_COVERAGE` on the web server and
  `E2E_COVERAGE=1`; `e2e/coverage-fixtures.ts` collects browser CDP coverage.
  Both stay inert for the ordinary `npm run test:e2e`.
- `scripts/e2e-coverage.mjs` merges both sides and prints the summary line.
  Vitest is never invoked by it.
- Dev dependencies added: `monocart-coverage-reports`, `esbuild` (both named in
  RUN.md §5) and `@jridgewell/sourcemap-codec` (needed to flatten indexed maps —
  coverage tooling, in-set).

**First reading: 64.8% (5892 / 9092 lines), gate 60.0, exit 0.**
Below-gate path proven: `--threshold 99` exits 1.

## Current best result

| Check | State |
| --- | --- |
| 1. `test:e2e:coverage` >= 60.0% | **64.8% pass** (re-prove at the end) |
| 2. `npm run verify` green | baseline green; re-prove after last change |
| 3. 7 tasks checked in TASKS.md | UI.1 done (1/7) |
| 4. `docs/node24-upgrade-plan.md` | written, plan-only |
| 5. `npm pack --dry-run` in `cli/` | not started |
| 6. one commit per task, clean tree | not started |
| 7. NOTES.md final status table | this file |

## Confirmed findings

1. Next.js 16 dev uses **turbopack** even though `npm run build` uses
   `--webpack`. Turbopack emits **indexed** source maps (`sections`), which
   monocart-coverage-reports cannot decode (`TypeError: Cannot destructure
   property 'length' of 'n'`). Flattening them first fixes it.
2. monocart under-measures `src/lib/analysis/controls/security.ts`: 86 mapped
   lines against 668 real code lines, while every other module in the same
   chunk maps within ~3% of its file length. Root cause not identified. The
   map itself is correct (651 distinct source lines survive the flatten +
   re-encode round trip), so this is a monocart-side defect.
   Mitigation: the script counts the unmapped shortfall as **uncovered**, which
   can only lower the printed number (72.0% naive -> 69.2% with all-files
   denominator -> 64.8% with the correction).
3. `npm audit` reports one low-severity advisory against `esbuild` nested under
   `tsx` (a pre-existing transitive dev dependency, Windows dev-server file
   read). Not introduced by this run; the directly installed esbuild is 0.28.2,
   above the affected range.

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

### UI.1 — **PASS**

Independent critic subagent, own measurements (throwaway spec, deleted after).

| Acceptance bullet | Verdict | Evidence the critic observed itself |
| --- | --- | --- |
| Visible clearance at 1440x960 and 390x844, after load and when scrolled | MET | ink gap after load 199.5 / 162.5 px; scrolled 16.5 / 17.5 / 20.3 px desktop and 17.5 / 19.0 / 20.6 px mobile. Header measured 85 / 73 px, `scroll-margin-top` resolved 107 / 95 px. Old 88px would have given **-2 px** on the desktop cover h1. |
| Playwright check requires visual clearance, not a touching bounding box | MET | `headingInkClearance` uses `Range.selectNodeContents` ink rect; old bounding-box assertion kept, not replaced. |
| Saved desktop/mobile artifacts show no clipped title, overflow, or control regression | MET | Critic opened four PNGs; titles intact, controls correct, overflow assertion byte-identical in the diff. |
| Presentation-only, no heuristic/scoring/privacy change | MET | diff is 3 files; no scanner, scoring, contract, or security file touched. |

Critic concerns and what was done:

1. Section **kickers** (`.repository-label`, `.section-kicker`) still clip on
   the header boundary. Same defect class, different elements -> filed as a new
   **UI.2** task per the AGENTS.md `UI.n` rule; UI.1 not reopened.
2. `--report-header-height` duplicates a value produced by globals.css padding.
   Accepted: the e2e ink assertion is the guard, and the 760px breakpoint
   matches globals.css exactly. Documented in the CSS comment.
3. Test required 12px while the CSS reserves 16px. **Fixed** —
   `HEADING_CLEARANCE` raised to 15, re-run green.
4. Untracked `e2e/growth-target-priority.spec.ts` seen mid-run: that is P0.6,
   in flight, not part of UI.1.
