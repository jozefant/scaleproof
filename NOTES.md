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
| 3. 7 tasks checked in TASKS.md | UI.1, P0.6, P2.3 done (3/7) |
| 4. `docs/node24-upgrade-plan.md` | written, plan-only |
| 5. `npm pack --dry-run` in `cli/` | passes, see round 3 caveat |
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

- Handing turbopack's indexed source maps straight to monocart. It throws
  `TypeError: Cannot destructure property 'length' of 'n'` in
  `decodeSourceMappings`. Flatten first.
- Running the coverage web server as `next dev`. Playwright terminates it with
  SIGTERM, which skips V8's exit-time profile write, so the server profile came
  back empty. Fixed by running Next programmatically in process.
- Asserting the load-time heading clearance with `window.scrollTo(0, 0)`. The
  page sets `scroll-behavior: smooth`, so the measurement happened mid-animation
  and read -473.5px. Needs `behavior: "instant"`.
- Trusting monocart's line totals unchecked. See confirmed finding 2.

## Round 3 — P2.3 CLI (builder done, critic running)

Builder report: `src/cli/` adapter (main, entry, version, demo-fixture, errors),
`cli/` publishable package, `scripts/build-cli.mjs`, 58 focused tests over 4
files. `build:cli` wired into `verify`.

Escalation resolved rather than deferred: P2.3 item 2 requires `--demo` to work,
item 3 forbids shipping anything but launcher/bundle/README/LICENSE. Those
conflict, because the demo needs `fixtures/scaleproof-demo`. Resolution: embed
the fixture in the bundle at build time (esbuild `define`), materialize to a
temp dir, reuse `acquireDemoRepository` unchanged, clean up in `finally`. Cost
1,280 raw bytes. Both requirements now hold.

**Open item for the final report:** `npm pack --dry-run` lists five files, not
four - launcher, bundle, README, LICENSE **plus `package.json`**, which npm
always includes and no `files` entry can exclude. Checklist item 5 says "only
the launcher, bundle, README, and LICENSE". Reported as-is rather than claimed
clean.

## Round 2 — UI.1 and P0.6

- UI.1 committed `0520f15`, critic PASS (verdicts below). Critic's kicker
  finding filed as new task **UI.2**.
- P0.6: added `e2e/growth-target-priority.spec.ts` at the real HTTP route seam.
  Validation commands from TASKS.md: focused Vitest 2 files / 15 tests pass;
  `npm run test:e2e` 13 passed. Critic running.

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

### P2.3 — **PASS**

Critic ran the built launcher itself from an empty directory to prove the
embedded fixture works: acquisition succeeded, progress reached deterministic
analysis, failure was the expected `4xx / authentication` from the dummy key,
exit 1, stdout empty (no partial report). It also re-derived the provider
payload allowlist from `synthesis.ts` independently and confirmed the test
asserts exact sorted key equality (a positive allowlist, not a deny-list).
Concern taken: `cli/README.md` said "contains four files" while `npm pack`
lists five - reworded to state the manifest is unavoidable.

### P1.0 — **PASS** (mutation-verified)

Critic backed up `saas-audit.ts` (sha256 recorded), neutered
`hasEmbeddedRuntimeConfiguration`, saw **6 tests fail**, restored byte-for-byte
and confirmed 90 passing. Golden scenarios byte-identical
(`git diff -- calibration.test.ts calibration-fixtures.ts` empty). Nothing new
reaches OpenAI - `src/lib/ai/**` untouched, `AllowlistedFinding` unchanged.

Two critic concerns were **not** deferred, because both reintroduce the exact
defect P1.0 exists to remove:

1. `mailto:` anywhere in a file set `submissionPath: true`, ejecting a landing
   page from the static profile and re-enabling all 24 server-runtime failures.
   Sent back for fix.
2. `cdn` / `host` in `RUNTIME_CONFIGURATION_TOKENS` made an asset base URL a
   configuration failure; the fixture only escaped by luck (`logo` token).
   Sent back for fix.

Implementer escalation recorded, not decided: zero-applicable-weight domains
still score 0 -> filed as **P1.2**.

### P0.6 — **PASS** (mutation-verified)

| Acceptance clause | Verdict | Evidence the critic observed itself |
| --- | --- | --- |
| API-route or Playwright test changing only question C | MET | one helper POSTs `/api/analyze` with `stage`/`dataSensitivity` fixed; real HTTP seam, no direct call to `selectDeterministicActions`. |
| Proves founder-visible action order/selection changes | MET | **Mutation test**: neutered `groupPriority` to `return 0` -> 2 of 3 tests failed; restored -> 13 passed. |
| Score, verdict, confidence, checks, growth unchanged | MET | all five asserted, and re-asserted against a baseline for all six enum values. Contract confirms none are vacuous. |
| Critical remediation ahead of every target preference | MET | asserted for the full literal enum, all six values, plus `length <= 3`. |
| `unknown` and `withheld` neutral | MET | both asserted, and neutrality shown distinct from a real preference. |
| Determinism, no live provider | MET | blanked key + `PLAYWRIGHT_TEST=1` -> `testMandatorySynthesis`; demo source is a local directory scan. |
| No heuristic change (test-only task) | MET | `git diff main..HEAD -- SCORING.md src/lib/analysis/constants.ts` empty; version still `0.8.6-hackathon`. |

Critic concerns and what was done:

- Neutrality proven against one preference only -> filed as **P0.11**, task not
  reopened (AGENTS.md review protocol point 4).
- `reuseExistingServer: !process.env.CI` could reuse a real-key dev server ->
  same task **P0.11**. Pre-existing, outside P0.6's scope.
- Local `Report` type said `confidence: string` -> **fixed** to `number`.
- API-only specs pay for an unused Chromium page via the auto coverage fixture.
  Accepted deliberately: using the raw `test` would drop them from the coverage
  gate.

### UI.1 critic concerns and what was done:

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
