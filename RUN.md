# RUN: Scaleproof TASKS.md burn-down + E2E coverage gate

## 1. Mechanism
Goal, because this is one verifiable end state (all in-scope tasks checked off,
`npm run verify` green, and a printed >=60% Playwright coverage number) reached
over an unknown number of attempts; a workflow was rejected because the tasks
contend on shared files (`SCORING.md`, heuristic version, analysis/actions
modules) and there are fewer than ten items.

## 2. Paste this into Claude Code

First, in the terminal (not in Claude):

```bash
cd <path-to-your-scaleproof-clone>
git checkout -b run/tasks-2026-08-24
```

Then start a Claude Code session, switch to **accept-edits / auto mode**
(shift+tab — a goal does not change permission mode), and paste, in order:

```
/goal The transcript shows the "Goal checklist" section of RUN.md printed verbatim, and for every numbered item in that printed checklist the transcript shows the required command output proving it passes. Or stop after 60 turns, or after 2 consecutive rounds in which no previously failing checklist item newly passes.
```

```
Follow RUN.md in this repository: first print its "Goal checklist" section verbatim into the transcript, then execute its "Run instructions" section exactly, keeping NOTES.md as the notebook and respecting the "Boundaries" and "Escalate" sections at all times.
```

Why this works: the goal evaluator reads only the conversation, never files —
so the run's first required action is echoing the checklist into the
transcript, which gives the evaluator the full pass criteria to check against.

## Goal checklist

1. `npm run test:e2e:coverage` prints a line matching
   `E2E line coverage of src/: NN.N%` with NN.N >= 60.0 and exits 0, where the
   coverage is collected only from Playwright E2E execution (browser-side plus
   Next.js server-side V8 coverage), never from Vitest.
2. `npm run verify` exits 0 in one uninterrupted invocation after the final
   code change.
3. TASKS.md shows P0.6, P0.9, P0.10, P1.0, P1.1, UI.1, and P2.3 checked done,
   and each task's own validation commands from TASKS.md were run with passing
   output shown in the transcript.
4. A Node.js 24 migration plan for D.3 exists at
   `docs/node24-upgrade-plan.md` listing every file and Vercel setting that
   must change with owner, command, expected evidence, and rollback step, with
   no runtime change applied.
5. `npm pack --dry-run` run from `cli/` shows only the launcher, bundle,
   README, and LICENSE.
6. `git log --oneline main..HEAD` shows one commit per completed task on the
   `run/tasks-2026-08-24` branch, `git status` shows a clean tree, no commit
   was made on main, nothing was pushed, and no npm package was published.
7. NOTES.md contains a final status table with one row per task and its
   evidence.

## Run instructions

Work through the in-scope TASKS.md backlog on branch `run/tasks-2026-08-24`.
Read AGENTS.md, SCORING.md, SECURITY.md, docs/ARCHITECTURE.md and TASKS.md
before changing anything, and keep NOTES.md as your working notebook (read
before each round, update after).

Order of work:

1. Baseline: run `npm run verify` on the untouched branch and record the
   result in NOTES.md. If it is not green, stop and report.
2. Build the coverage scoreboard FIRST: add a `test:e2e:coverage` npm script
   that runs the existing Playwright suite while collecting BOTH browser-side
   coverage (CDP) and Next.js server-side coverage (`NODE_V8_COVERAGE` on the
   webServer), merges them with sourcemaps (monocart-coverage-reports or c8 —
   dev dependencies only), and prints exactly one summary line
   `E2E line coverage of src/: NN.N%`, exiting non-zero below 60.0. Vitest
   coverage must not leak into this number. Commit when it runs end to end
   (the number may still be below 60 at this point).
3. Then implement tasks in this order, one commit per task, running that
   task's own validation commands plus focused tests before committing:
   UI.1, P0.6, P1.0, P1.1, P0.10, P0.9, P2.3.
4. Extend the Playwright suite as needed while implementing the tasks until
   the coverage line reports >= 60.0% of `src/`. New e2e tests must stay
   deterministic: `OPENAI_API_KEY` stays blanked, synthetic fixtures only.
5. Write `docs/node24-upgrade-plan.md` satisfying D.3's plan-level acceptance
   (inventory, compatibility findings, atomic change definition, rollback
   trigger and procedure). Do NOT install Node 24, change `engines`, or touch
   Vercel.
6. Finish with one full `npm run verify`, the coverage command,
   `npm pack --dry-run` from `cli/`, and the git log/status evidence, all
   printed — then print the Goal checklist section once more with a pass/fail
   mark per item.

For every task, before checking its box in TASKS.md, spawn a critic subagent
that re-reads the task's acceptance list verbatim from TASKS.md and
independently verifies each bullet against the diff and test output; the
critic may pass the work, and its verdict goes into NOTES.md.

## 3. Goal condition
The short `/goal` string in section 2. It is verifiable because the run must
first print the Goal checklist verbatim; the evaluator then checks each item's
printed command output against it. Bounded at 60 turns / 2 stalled rounds.

## 4. How the work is checked
Command(s):
- `npm run verify` (lint + tsc6 + tsc7 + Vitest + production build + Playwright)
- `npm run test:e2e:coverage` (new — built as step 2 of the run)
- Per-task validation commands quoted inside TASKS.md (e.g. P0.6:
  `npm test -- src/lib/analysis/actions.test.ts src/lib/analysis/analyze.test.ts`)
- `npm pack --dry-run` from `cli/`
- `git log --oneline main..HEAD` and `git status`

Pass looks like: every command exits 0 with its output printed; the coverage
command prints `E2E line coverage of src/: NN.N%` with NN.N >= 60.0; pack
output lists only launcher, bundle, README, LICENSE; git log shows one commit
per task on the run branch and a clean tree. The goal condition requires each
result to appear in the transcript, so the evaluator can see them.

## 5. Boundaries
Must not:
- Commit to `main`, push to any remote, or publish to npm.
- Scan real repositories in automated tests or CI; use a real
  `OPENAI_API_KEY` in any test; send source text, paths, or repository
  identifiers to the provider (categorical allowlist stays intact).
- Edit `output/`, `README.md`'s product boundary, or weaken any security
  control to make a check pass.
- Touch Vercel settings, install Node 24, or change `engines` (D.3 is
  plan-only this run).
- Start work on P2.2, F.1, or D.1 beyond notes in NOTES.md.

Allowed to:
- Edit anything under `src/`, `e2e/`, `fixtures/`, `scripts/`, `cli/` (new),
  `docs/`, plus `TASKS.md`, `SCORING.md`, `package.json`, configs, `NOTES.md`.
- Install devDependencies for coverage tooling (e.g.
  `monocart-coverage-reports` or `c8`) and `esbuild` for P2.3.
- Commit once per completed task on `run/tasks-2026-08-24`.

## 6. Budget and stop rules
Turn cap: 60
Wall clock cap: one working day (~8 h); abandon and report if exceeded.
Stop early if: 2 consecutive rounds with no previously failing check newly
passing; `npm run verify` regresses and cannot be restored within one round;
the coverage number plateaus more than 5 points below 60 for 3 rounds
(escalate with the gap analysis instead of grinding).

## 7. Notebook
File: NOTES.md
The run keeps: current best result (which checks pass, current coverage %),
confirmed findings with evidence (commands + output excerpts), failed
approaches and why, open hypotheses, next highest-value test, and the critic
verdict per task. Read before each round, update after.

## 8. Builder and critic
The builder implements each task; before a TASKS.md box is checked, a separate
critic subagent re-reads that task's acceptance bullets verbatim from TASKS.md
and verifies each one against the actual diff and printed test output — not
against the builder's summary. The critic's reference is the acceptance list
itself plus SCORING.md/SECURITY.md invariants (heuristic version bumped, no
source snippets in public reports, golden scenarios unchanged unless
intended). The critic is allowed to pass the work; its verdict is recorded in
NOTES.md either way.

## 9. Escalate to me, do not decide, when
- A golden scenario or public report contract changes in a way the task did
  not explicitly call for.
- Any acceptance bullet is ambiguous enough to change the outcome.
- A dependency outside the named set (coverage tooling, esbuild) appears
  necessary.
- Anything would require deployment, a real API key, network credentials, or
  npm publication.
- The 60% coverage target looks unreachable without violating the
  deterministic-test policy (blanked key, synthetic fixtures).

## 10. Pre-flight checklist
- [ ] On `run/tasks-2026-08-24`, not `main`
- [ ] Working tree clean (`git status` — it was clean at design time)
- [ ] `npm run verify` runs green right now on the untouched code (baseline
      was green 2026-07-21; the run re-proves it as its first step)
- [ ] No client production data or credentials in scope (none found; ambient
      `OPENAI_API_KEY` is blanked by playwright.config.ts)
- [ ] Tried on one slice first: the coverage harness (step 2) is the slice —
      it proves the new scoreboard works before any task implementation
