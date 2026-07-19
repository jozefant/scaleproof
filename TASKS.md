# Scaleproof architecture review and implementation tasks

Review date: 2026-07-18

Status: independent implementation review completed 2026-07-19; all 10
reviewed implementation tasks and the four selected follow-up findings are
applied. P2.2 and D.1 remain open.

## Selected follow-up findings applied - 2026-07-19

- [done] **Restrict `Rewrite` to explicit replacement-level failures.**
  Scoring now uses a documented allowlist of rewrite-eligible controls.
  Exposed credentials plus ownership concentration remain urgent and can block
  `Fundable`, but cannot recommend replacing a remediable codebase. The
  heuristic is now `0.5.0-hackathon`.
- [done] **Build action claims from the actual failing or missing checks.**
  Grouped actions name only their actionable source-check summaries and IDs;
  passing checks cannot contribute missing-control copy.
- [done] **Propagate client cancellation through analysis and GPT synthesis.**
  The request signal now reaches repository acquisition, deterministic
  orchestration, and the OpenAI request. Cancellation returns the existing
  no-store `cancelled` response instead of leaving model work running.
- [done] **Preserve module-history rate-limit state.** The remaining GitHub
  budget is updated after every history response, module calls stop on
  exhaustion, completed aggregates remain visible, and the report exposes
  `rate_limited` instead of claiming full availability.

Regression coverage includes the remediable secret/concentration combination,
contradictory pass/missing action groups, cancellation during synthesis, a
rate-limited first module, and exhaustion after a successful module.

Final verification:

- `OPENAI_API_KEY= npm run verify`: lint, TypeScript, 12 files / 91 tests,
  production build, and all 7 Playwright tests passed.
- `git diff --check`: passed.

## Implementation review - 2026-07-19

The implementer's `[done]` marker is accepted only where the implementation
meets the task's acceptance criteria. The review comments below preserve the
independent review record; the table and section suffixes show current status.

| Task | Review status | Decision |
| --- | --- | --- |
| P0.1 | Accepted | Missing evidence is separated from concrete failure in scoring and labels. |
| P0.2 | Fixed | All 52 controls have typed detector metadata; load documentation cannot earn enforced evidence. |
| P0.3 | Fixed | Mixed action evidence is partitioned accurately and every source check is keyboard-navigable. |
| P0.4 | Fixed | GPT proposes remediation-code order only; all displayed action claims remain deterministic. |
| P0.5 | Accepted | Mobile intake, download, truthful wait, cancellation, warning, and URL preservation are implemented and browser-tested. |
| P1.1 | Fixed | Repository limits are repository-owned; UI consumes only public report-contract types; dependency tests enforce both boundaries. |
| P1.2 | Fixed | Public source links use strict GitHub-root semantics and Markdown escapes untrusted prose, labels, and code spans. |
| P1.3 | Accepted | Ordering, limits, cancellation, cleanup, and rate-limit states meet the stated acceptance criteria. |
| P1.4 | Fixed | API and browser tests cannot use ambient OpenAI credentials; empty-key and dummy-key gates pass offline. |
| P2.1 | Fixed | Intake/report styles are colocated CSS modules; global CSS is reduced to tokens, base, shared shell, and landing layout. |

Verification evidence:

- `npm test`: 12 files and 70 tests passed.
- `npm run verify` with the developer environment: failed because
  `src/app/api/analyze/route.test.ts` reached live synthesis and the partial-scan
  test timed out after 5 seconds.
- A minimal `store: false` GPT-5.6 Responses API call with the same configured
  key succeeded in 4.164 seconds, confirming that the failure is test isolation
  and latency, not invalid credentials or missing model access.
- `OPENAI_API_KEY= npm run verify`: lint, TypeScript, 70 tests, production
  build, and all 6 Playwright tests passed.
- `git diff --check`: passed.

Follow-up verification after the seven fixes:

- `OPENAI_API_KEY= npm run verify`: lint, TypeScript, 12 files / 85 tests,
  production build, and all 7 Playwright tests passed.
- `OPENAI_API_KEY=dummy-nonempty-key npm run verify`: the same gate passed
  without constructing an OpenAI client or making a model request.
- `src/app/globals.css` is 377 lines; intake and report rules are in colocated
  CSS modules, and progress/error presentation is extracted from the intake
  state owner.
- The heuristic is `0.4.0-hackathon`; `SCORING.md` documents static detector
  metadata and enforced-versus-documented load evidence.

## Goal

Make the primary founder journey reliable and easy:

```text
public GitHub URL -> understandable wait -> trustworthy verdict ->
three evidence-linked actions -> saved/shareable report
```

The hackathon boundary remains unchanged. Scaleproof accepts public GitHub
repository root URLs only. Do not add private-repository access, accounts,
stored scans, analytics, lead capture, a job queue, or sales calls to action.

## Initial review conclusion - 2026-07-18

The desktop experience is visually strong and the URL-to-report path works. A
live scan of `Foundation-s-r-o/tech-demo-test` completed in 5.8 seconds and
returned a founder brief with three actions. The privacy boundary, temporary
acquisition, deterministic fallback, and report hierarchy are good foundations.

The main architectural risk is not performance or visual design. It is trust:

1. Missing repository evidence receives zero scoring credit and can help produce
   `Rewrite` or `Blocked by architecture`, even when no concrete failure was
   detected.
2. Several positive controls award broad readiness credit from one filename,
   directory layout, or keyword. The documentation claims deeper analysis such
   as dependency cycles, coupling, change blast radius, and query discipline.
3. The three founder actions are generic and are not linked to the checks or
   evidence that caused them.
4. GPT can currently supply the displayed severity and can omit a critical
   remediation even though the deterministic engine is meant to own risk.
5. On mobile, the repository input is below the first viewport and the report
   download is hidden.

Fix those five issues before expanding the number of controls. More heuristics
would increase apparent rigor without improving founder trust or actionability.

## Architecture observed before implementation

```text
ScaleproofApp
  -> POST /api/analyze
     -> GitHub metadata + archive acquisition
     -> temporary extraction + text scan + history aggregation
     -> deterministic controls
     -> scoring and growth labels
     -> GPT action selection/phrasing or deterministic fallback
  -> in-memory founder report + client-side Markdown export
```

Current load-bearing modules:

| Area | Current observation | Main risk |
| --- | --- | --- |
| Intake and report | One 921-line client component plus 1,455-line global stylesheet | Critical founder behavior has no component or browser tests |
| API route | Validation, acquisition, orchestration, error mapping, and response handling in one route | The transport layer owns too much workflow policy |
| Repository scan | Safe temporary acquisition with explicit caps and cleanup | File traversal is not explicitly deterministic and cancellation is not propagated |
| Controls | 52 checks in one 1,694-line file | Presence-based signals are easy to over-credit and hard to calibrate independently |
| Scoring | Deterministic and versioned | Missing evidence can contribute to severe negative labels |
| GPT synthesis | Allowlisted input and deterministic fallback | Model output still controls severity and critical-action inclusion |
| Report contract | Shared TypeScript interfaces | Client validation checks only for a `verdict` property |

## Findings summary

| Priority | Finding | Implementation task |
| --- | --- | --- |
| P0 | Missing evidence can produce severe labels | P0.1 |
| P0 | Documented claims exceed actual detectors | P0.2 |
| P0 | Founder actions are detached from evidence | P0.3 |
| P0 | GPT can change action severity or omit critical work | P0.4 |
| P0 | Mobile and waiting states obstruct the core journey | P0.5 |
| P1 | Analysis directly depends on the OpenAI layer | P1.1 |
| P1 | Public report schema and context assumptions are weak | P1.2 |
| P1 | Scan ordering, cancellation, and GitHub rate use need explicit policy | P1.3 |
| P1 | The end-to-end founder journey is untested | P1.4 |
| P2 | Control and UI modules are too large to evolve safely | P2.1 |
| P2 | The heuristic lacks a representative calibration suite | P2.2 |
| Deployment gate | Public operation lacks external abuse and concurrency controls | D.1 |

## P0 - Correct before adding more checks

### [ ] P0.1 Separate missing evidence from concrete failure in verdicts and growth labels [done]

> **Implementation review - ACCEPTED.**
>
> The scoring model now records positive, concrete-negative, missing, and
> runtime-only weights independently. `Rewrite` requires concrete failures in
> at least two load-bearing domains, and growth blocking requires a concrete
> enforced or inferred high/critical failure. The UI and Markdown consistently
> say `Repository evidence score`. The focused scoring suite and complete
> key-free verification gate passed.

Why:

- `scoreChecks()` gives both `fail` and `unknown + absent` zero credit
  (`src/lib/analysis/scoring.ts:45`).
- `baseVerdict()` counts domains below 40 without checking whether the weakness
  came from concrete failures or missing evidence
  (`src/lib/analysis/scoring.ts:245`).
- `readinessFromChecks()` can return `Blocked by architecture` from a low score
  created by missing evidence alone (`src/lib/analysis/scoring.ts:76`).
- This conflicts with the product rule that absence of evidence is not proof
  that an operational control fails.

Implementation:

1. Keep the current independent outcome and evidence-tier model.
2. Derive separate aggregates for:
   - positive evidence;
   - concrete negative evidence;
   - expected but missing repository evidence;
   - runtime-only or insufficient evidence.
3. Allow `Rewrite` only when at least two load-bearing domains contain concrete,
   high-confidence structural failures. `unknown + absent` may lower the
   repository-evidence score and cap the result at `Fixable`; it must not count
   as a structural failure.
4. Allow `Blocked by architecture` only from a concrete blocking finding.
   Otherwise use `Ready with conditions` or `Insufficient evidence`.
5. Rename the visible `Readiness score` to `Repository evidence score`, or add
   equally prominent copy explaining that missing repository evidence lowers
   the number.
6. Bump the heuristic version and update `SCORING.md` in the same change.

Acceptance criteria:

- A repository with at least three implementation files and only
  `unknown + absent` checks cannot receive `Rewrite`.
- Missing load-test or recovery evidence alone cannot produce
  `Blocked by architecture`.
- A repository with concrete failures across multiple load-bearing domains can
  still receive `Rewrite`.
- Tests cover all-missing, runtime-unknown, one-critical, multi-domain-failure,
  partial-scan, and documentation-only cases.
- UI and downloaded Markdown use the same evidence wording.

Validation:

```bash
npm test -- src/lib/analysis/scoring.test.ts
npm run verify
```

### [ ] P0.2 Align every claim with detector strength [done]

> **Implementation review - CHANGES REQUIRED. Previously marked `[done]`; reopened.**
>
> What is good: the seven named composite controls were narrowed, the 10x
> enforced-signal gate was added, and their focused false-positive cases pass.
>
> Remaining issues:
>
> 1. `src/lib/analysis/control-inventory.ts` has detector-specific rules for
>    only 8 of 52 controls. The other 44 receive `DEFAULT_RULE`, so the
>    inventory test proves only that an entry exists, not that the entry
>    describes the implemented detector.
> 2. `rel.load-tests` merges path and content matches as alternatives. A file
>    such as `performance/README.md` can therefore become `pass + enforced`
>    without an executable load test, benchmark, command, or enforced
>    performance budget.
> 3. The current inventory is generated from one runtime result. Its
>    `evidenceTier` records that scan's disposition rather than the strongest
>    tier the detector can legitimately establish, which makes it unsuitable
>    as the detector source of truth.
>
> Fix before restoring `[done]`:
>
> - Define typed detector metadata beside every control and build the inventory
>   from that metadata; remove `DEFAULT_RULE`.
> - Require an executable/configured performance path for
>   `rel.load-tests` enforced evidence. Keep documentation as `documented`.
> - Add a false-positive fixture containing only
>   `performance/README.md`, plus a positive executable fixture.
> - Make the inventory test fail when any control uses missing or placeholder
>   metadata.

Why:

- `arch.onboarding` passes when any README exists because README and setup
  evidence are merged before evaluation (`src/lib/analysis/controls.ts:128`).
- `arch.module-boundaries` passes from directory shape or three source areas
  without dependency-cycle or coupling analysis
  (`src/lib/analysis/controls.ts:188`).
- `rel.failure-controls` passes when any one broad keyword such as `timeout`,
  `retry`, or `backpressure` appears (`src/lib/analysis/controls.ts:1297`).
- `SCORING.md` says team growth evaluates dependency cycles, shared-core
  concentration, independent build loops, CI feedback speed, and change blast
  radius. Those capabilities are not implemented.

Implementation:

1. Create a control inventory that records for each control:
   - claim;
   - applicability;
   - required signals;
   - disqualifying signals;
   - evidence tier;
   - confidence limitation;
   - remediation code.
2. Replace broad "one signal means pass" controls with explicit composite
   predicates. Start with onboarding, module boundaries, authentication,
   failure controls, observability, recovery, and 10x readiness.
3. Where deeper analysis is not justified for the hackathon, narrow the label
   and summary. For example, report `Module layout signal found` rather than
   claiming independent team boundaries.
4. Do not show `Likely ready` for 10x without a minimum enforced signal set and
   repeatable load/performance evidence. Continue to state that this is
   architecture readiness, not measured capacity.
5. Add false-positive and false-negative fixtures for every changed control.
6. Bump the heuristic version and update `SCORING.md` whenever behavior changes.

Acceptance criteria:

- A README without setup and verification commands does not pass onboarding.
- Multiple folders alone do not prove low coupling or parallel-friendly work.
- One timeout occurrence does not prove the complete dependency-failure policy.
- Every sentence in the founder report maps to implemented signals.
- Unsupported claims are removed from product copy until their detectors exist.

Validation:

```bash
npm test -- src/lib/analysis/controls.test.ts
npm test -- src/lib/analysis/scoring.test.ts
npm run verify
```

### [ ] P0.3 Make each founder action traceable and executable [done]

> **Implementation review - CHANGES REQUIRED. Previously marked `[done]`; reopened.**
>
> The contract, deterministic evidence references, verification condition, and
> Markdown linkage are implemented. Two grouped-action cases still violate the
> acceptance criteria:
>
> 1. `toAction()` uses `results.some(outcome === "fail")` to label the whole
>    group as concrete. When one remediation groups a concrete failure with an
>    `unknown + absent` check, `whyNow` says concrete evidence triggered both
>    check IDs. That overstates the missing check.
> 2. The action button focuses only `sourceCheckIds[0]`. A grouped action can
>    identify several source checks, but the founder cannot navigate to the
>    remaining exact dossier rows from the action.
>
> Fix before restoring `[done]`:
>
> - Partition source checks into concrete findings and missing-evidence checks,
>   then describe each set accurately in deterministic `whyNow` text.
> - Render every source check as a keyboard-operable dossier link, or provide a
>   small expanded source list with one focus target per check.
> - Add a browser test for a mixed grouped action with at least two source
>   checks; assert both wording and navigation.

Why:

- `FounderAction` contains no domain, source check IDs, evidence references, or
  verification target (`src/lib/analysis/types.ts:166`).
- Action cards are visually presented with an arrow but are inert articles
  (`src/components/scaleproof-app.tsx:711`).
- The live reference scan returned useful themes, but the actions did not show
  which checks or repository locations justified them.

Implementation:

1. Extend the public action contract with:
   - `domain`;
   - `sourceCheckIds`;
   - deterministic `whyNow`;
   - up to three evidence locations when they exist;
   - a short completion/verification condition.
2. Build these fields deterministically from the selected checks. GPT may
   improve plain-language phrasing but must not create the evidence linkage.
3. Make each action card open or focus its exact evidence-dossier checks.
4. Remove the arrow affordance if the card is not interactive.
5. Include the same linkage and verification condition in the Markdown export.
6. Keep the founder brief at no more than three top-level actions.

Acceptance criteria:

- Every action identifies at least one source check.
- Clicking an action reaches the relevant dossier row and preserves keyboard
  focus.
- An action based on missing evidence says what evidence to establish; it does
  not claim the underlying runtime control failed.
- UI and Markdown output contain the same three actions and sources.

Validation:

```bash
npm test -- src/lib/analysis/actions.test.ts
npm run test:e2e
npm run verify
```

### [ ] P0.4 Make deterministic policy authoritative over GPT output [done]

> **Implementation review - CHANGES REQUIRED. Previously marked `[done]`; reopened.**
>
> Severity, sources, evidence, and verification now remain deterministic, and
> unknown, duplicate, or omitted remediation codes fall back safely. However,
> `reconcileActionProposal()` still copies arbitrary model `title` and
> `rationale` strings into the report. Prompt instructions are not validation,
> so the required fallback for unsupported claims is not implemented.
> `src/lib/ai/synthesis.test.ts` also exercises payload construction only; it
> does not mock malformed or adversarial model responses through the synthesis
> boundary.
>
> Fix before restoring `[done]`:
>
> - For the hackathon, prefer a model proposal containing remediation codes
>   only; keep displayed title and rationale in deterministic templates. This
>   is the smallest reliable way to prevent unsupported claims.
> - If model phrasing is retained, define and test a deterministic claim
>   validator; a prompt prohibition alone is insufficient.
> - Mock the OpenAI response boundary and test malformed structured output,
>   unsupported phrasing, omitted mandatory work, duplication, unknown codes,
>   and API failure.
> - Define the policy for more than three distinct critical remediation codes;
>   mandatory-code reconciliation currently cannot satisfy that case.

Why:

- GPT returns `severity`, and `normalizeModelActions()` copies it into the
  founder report (`src/lib/ai/synthesis.ts:194`).
- The only hard validation is that the remediation code is in the allowlist.
- GPT can return an allowed lower-priority action while omitting a critical
  action. The prompt asks it not to, but the code does not enforce the rule.

Implementation:

1. Remove severity from the model-owned output. Resolve severity from the
   highest-priority deterministic check behind each remediation code.
2. Compute mandatory remediation codes before calling GPT. At minimum, concrete
   critical findings must remain in the final three.
3. Treat GPT output as an ordering and phrasing proposal, then reconcile it with
   deterministic mandatory actions and source checks.
4. Fall back when GPT duplicates codes, omits mandatory codes, returns unsupported
   claims, or produces fewer usable actions than policy requires.
5. Use the exported heuristic-version constant in the payload instead of a
   second hardcoded literal.

Acceptance criteria:

- GPT cannot raise or lower displayed severity.
- A critical exposed-secret action cannot be omitted.
- GPT cannot select a remediation code that has no actionable source check.
- Model failure or invalid output produces the same deterministic risk order.
- Tests cover omission, duplication, severity manipulation, unknown codes, and
  malformed structured output.

Validation:

```bash
npm test -- src/lib/ai/synthesis.test.ts
npm run verify
```

### [ ] P0.5 Put the scan action and report handoff first on mobile [done]

> **Implementation review - ACCEPTED.**
>
> The 390 x 844 browser test confirms that the URL field and `Analyze` button
> are in the first viewport and that report download remains available. The UI
> uses an indeterminate started-at/90-second state rather than fabricated
> phases, cancellation restores the usable form without an error alert, the
> public-repository warning is present, and invalid nested URLs remain
> preserved with the specific correction.

Why:

- At 390 x 844, the first viewport contains only the hero; the repository input
  begins below it.
- The mobile stylesheet explicitly hides the Markdown download
  (`src/app/globals.css:1333`).
- Scan phases advance every 2.1 seconds independently of server state
  (`src/components/scaleproof-app.tsx:303`). A fast scan can skip phases and a
  slow scan can display `04/04` long before completion.
- The client request has no `AbortController`
  (`src/components/scaleproof-app.tsx:313`).

Implementation:

1. At widths below 760 px, place the repository input and primary `Analyze`
   action in the first viewport. Preserve the editorial dossier aesthetic; do
   not redesign the product.
2. Keep `Download .md` available on mobile, using an overflow menu only if
   necessary.
3. Replace fabricated phase completion with either:
   - real server-reported phases; or
   - a truthful indeterminate state with elapsed time and the 90-second limit.
   Prefer the indeterminate option for the hackathon.
4. Add `Cancel scan` with `AbortController`, and propagate request cancellation
   into GitHub fetches and scanning where practical.
5. Put this warning beside the input:
   `Public repositories only. Do not submit code that should not already be public.`
6. Preserve the entered URL and context after recoverable validation or network
   errors.

Acceptance criteria:

- The URL input and `Analyze` button are visible without scrolling at 390 x 844.
- Mobile users can download the report.
- The UI never claims a backend phase it cannot observe.
- Cancel returns the form to a usable state without showing a failure alert.
- Invalid nested GitHub URLs still produce the current specific correction.

Validation:

```bash
npm run test:e2e
npm run verify
```

## P1 - Strengthen architecture after the trust fixes

### [ ] P1.1 Restore the documented dependency direction and privacy-by-construction boundary [done]

> **Implementation review - CHANGES REQUIRED. Previously marked `[done]`; reopened.**
>
> The pure analysis/application split and raw-file clearing before synthesis
> are good. The implemented graph still contradicts the target graph and
> `docs/ARCHITECTURE.md`:
>
> - `src/lib/repository/{scanner,github,history}.ts` import scan/history limits
>   from `src/lib/analysis/constants.ts`, so repository acquisition depends on
>   the downstream analysis layer.
> - `src/components/intake.tsx`, `readiness-chart.tsx`, and
>   `report/evidence-dossier.tsx` import analysis types directly instead of
>   consuming public request/report contracts.
> - The architecture test permits both violations; it checks only one specific
>   repository-to-analysis type import and does not check UI dependencies.
>
> Fix before restoring `[done]`:
>
> - Move acquisition and history limits to the repository boundary or a truly
>   lower-level shared policy module.
> - Export UI-facing inferred types from the request/report contracts; remove
>   direct component imports from analysis.
> - Strengthen the dependency test to reject every
>   `repository -> analysis` and `components -> analysis/repository/ai/application`
>   import.

Why:

- `src/lib/analysis/analyze.ts` imports and calls the OpenAI synthesis layer.
- `docs/ARCHITECTURE.md` states that deterministic analysis has no OpenAI
  dependency.
- Repository types and public report types share one analysis-owned file, so
  acquisition, scoring, AI, and UI all depend on the same type module.
- Raw file content remains reachable through the snapshot while GPT synthesis
  is awaited, even though GPT receives only allowlisted fields.

Target dependency direction:

```text
repository acquisition -> repository snapshot
repository snapshot -> pure deterministic analysis draft
analysis draft -> optional AI action proposal
draft + proposal -> public report
API route -> application orchestrator only
UI -> public report contract only
```

Implementation:

1. Add an application orchestration module, for example
   `src/lib/application/analyze-repository.ts`.
2. Make deterministic evaluation and scoring synchronous/pure with no OpenAI
   import.
3. Move repository snapshot types into the repository/domain boundary.
4. Move the public report schema into a dedicated report contract module.
5. Ensure the AI phase receives an analysis draft that cannot reference raw
   repository file content.
6. Keep `src/app/api/analyze/route.ts` responsible only for transport validation,
   calling the orchestrator, and safe HTTP mapping.
7. Add an architecture test or dependency rule preventing `analysis -> ai`,
   `analysis -> components`, and `repository -> components`.

Acceptance criteria:

- `src/lib/analysis` has no import from `src/lib/ai`.
- The value passed to synthesis contains no `RepositoryFile` or content field.
- The API route does not know control or scoring details.
- Existing privacy-boundary tests continue to pass.

### [ ] P1.2 Version and validate the public report contract [done]

> **Implementation review - CHANGES REQUIRED. Previously marked `[done]`; reopened.**
>
> The complete versioned schema, server/client parsing, context display, and
> pure Markdown renderer are implemented. The promised safe-link boundary is
> not complete:
>
> - `sourceUrl` uses `z.string().url()`, which accepts schemes such as
>   `javascript:` and does not enforce the product's strict public GitHub root
>   URL invariant.
> - Markdown rendering interpolates evidence paths and other untrusted strings
>   inside code spans and prose without escaping backticks or line breaks. A
>   hostile public repository path can alter the downloaded report's Markdown
>   structure.
>
> Fix before restoring `[done]`:
>
> - Refine `sourceUrl` to `https://github.com/owner/repository` using the same
>   strict semantics as intake, while preserving `null` for the demo.
> - Add Markdown escaping helpers for prose, link labels, and code spans; treat
>   repository-derived paths and model-derived phrasing as untrusted.
> - Add contract/renderer tests with `javascript:` URLs, backticks, brackets,
>   and embedded line breaks.

Why:

- The client type guard checks only whether `verdict` exists
  (`src/components/scaleproof-app.tsx:90`).
- A partial or incompatible response can be accepted and fail later during
  rendering or Markdown export.
- The selected stage, data sensitivity, and growth target affect applicability
  or severity but are not visible in the web report or Markdown report.

Implementation:

1. Define a Zod schema for the complete public `AnalysisReport`.
2. Add `schemaVersion` independently from `heuristicVersion`.
3. Parse the assembled report on the server and parse the response again at the
   client boundary.
4. Show the three context assumptions near the verdict and in the Markdown
   export, including `I don't know` and `Prefer not to say`.
5. Show the public source repository as a safe link when `sourceUrl` exists.
6. Return a founder-safe compatibility error for invalid or newer schemas.
7. Move Markdown rendering into a pure, tested report module.

Acceptance criteria:

- A payload containing only `verdict` is rejected safely.
- UI, API, and Markdown export use one report contract.
- Shared reports state the context that affected prioritization or severity.
- Report rendering tests cover all enum states and partial scans.

### [ ] P1.3 Make scanning deterministic, cancellable, and GitHub-rate-aware [done]

> **Implementation review - ACCEPTED.**
>
> Traversal and processing are sorted by explicit priority, oversized files
> are recorded without hiding later manifests, cancellation reaches metadata,
> archive, extraction, scan, and history work, and cleanup remains in
> `finally`. History requests are sequential and budgeted from rate/deadline
> information, and the report distinguishes `rate_limited` from
> `insufficient_history` without exposing raw identities or paths. The focused
> repository tests passed.

Why:

- Directory entries and discovered files are not sorted before limit-based
  processing (`src/lib/repository/scanner.ts:131` and
  `src/lib/repository/scanner.ts:212`).
- Under file, byte, or time limits, filesystem ordering can change which
  evidence is scanned and therefore change the score.
- Repository plus module history uses up to seven parallel commit requests per
  scan (`src/lib/repository/github.ts:362`).
- History failures are collapsed into one generic unavailable state, so rate
  exhaustion and ordinary absence are indistinguishable.

Implementation:

1. Sort traversal deterministically and define priority classes for manifests,
   CI, security configuration, architecture docs, tests, and source files.
2. Add an individual-file read cap. Skip and record oversized text files rather
   than allowing one file to consume the remaining text budget.
3. Record discovered, processed, skipped-binary, skipped-oversized, and
   unprocessed counts separately.
4. Accept an `AbortSignal` throughout acquisition, history calls, and scanning.
5. Read GitHub rate-limit headers and expose a privacy-safe reason enum:
   `available`, `insufficient_history`, `rate_limited`, `unavailable`.
6. Budget module-history requests. Do not launch all six when the remaining
   rate budget or deadline cannot support them.
7. Preserve the rule that no identity, commit text, commit ID, or raw module
   path reaches the report or OpenAI.

Acceptance criteria:

- Repeated scans of the same archive under the same limits process the same
  files in the same order.
- A large early file cannot hide all later manifests and workflows.
- Cancellation stops network reads and returns cleanup through `finally`.
- The report distinguishes rate-limited history from genuinely insufficient
  history without exposing identifiers.

### [ ] P1.4 Add contract and founder-journey tests to the technical completion gate [done]

> **Implementation review - CHANGES REQUIRED. Previously marked `[done]`; reopened.**
>
> The six Playwright journeys, API contract tests, cleanup tests, schema tests,
> and architecture tests are valuable and are included in `npm run verify`.
> The gate is not deterministic or isolated from external services:
>
> - With the developer's existing `OPENAI_API_KEY`, `npm run verify` failed in
>   `preserves partial-scan output through the public contract` after 5 seconds.
> - The same key successfully completed a minimal `store: false` GPT-5.6
>   Responses API call in 4.164 seconds. The timeout is therefore not evidence
>   of an invalid key; it is evidence that the completion gate reaches a live,
>   latency-variable external service.
> - Route tests use the real `analyzeRepository`; only one test temporarily
>   deletes the key. Later tests can therefore call live OpenAI, incur cost, and
>   pass or fail based on network/model latency.
> - With `OPENAI_API_KEY` explicitly blank, the entire gate passed: 70 tests,
>   production build, and 6 browser tests.
>
> Fix before restoring `[done]`:
>
> - Mock or inject the synthesis boundary for the whole API test file. Unit and
>   integration tests must never depend on ambient credentials or live
>   network services.
> - Add a guard test that fails if the OpenAI client is constructed or an
>   external request is attempted.
> - Run `npm run verify` once with a dummy/non-empty key and once without a key;
>   both must pass without network access.

Why:

- Current Vitest configuration runs Node tests only and includes
  `src/**/*.test.ts` (`vitest.config.ts:5`).
- There are no tests for `/api/analyze`, `ScaleproofApp`, the Markdown download,
  responsive intake, or the complete browser journey.
- The visual review found two regressions that lint, types, unit tests, and the
  production build do not detect.

Implementation:

1. Add API integration tests with mocked GitHub and OpenAI boundaries for:
   validation, status mapping, no-store headers, partial scans, fallback, and
   cleanup after success and failure.
2. Add browser tests for:
   - landing -> demo -> verdict -> three actions;
   - valid public URL -> report;
   - invalid nested URL -> preserved form and specific error;
   - action -> evidence linkage;
   - Markdown download;
   - cancel;
   - 390 x 844 CTA visibility and report download.
3. Add a report-schema contract test between API output and UI input.
4. Add an architecture dependency test from P1.1.
5. Include the stable critical-path suite in `npm run verify`.

Acceptance criteria:

- A broken primary scan journey fails CI.
- Mobile CTA and download regressions fail CI.
- Cleanup and privacy-boundary regressions fail CI.
- Tests use only synthetic repositories and mocked external responses.

## P2 - Improve maintainability only after behavior is protected

### [ ] P2.1 Split the control and UI monoliths along existing boundaries [done]

> **Implementation review - CHANGES REQUIRED. Previously marked `[done]`; reopened.**
>
> Domain control packs, the registry, report sections, and the small app shell
> are successfully split without a new framework. The style boundary in step 4
> is not implemented: `src/app/globals.css` is now 1,559 lines and still owns
> section-specific intake, action, dossier, chart, and responsive report
> styling. Progress and error presentation also remain inside the 295-line
> intake component.
>
> Fix before restoring `[done]`:
>
> - Keep tokens, reset/base rules, and genuinely cross-page layout in
>   `globals.css`.
> - Move report/intake section rules into colocated CSS modules without a
>   visual redesign.
> - Extract progress/error presentation if doing so reduces the intake
>   component's responsibility; do not add state management.
> - Preserve the passing calibration and Playwright outputs during this
>   behavior-preserving refactor.

Do this after P1.4 so the refactor is behavior-preserving.

Implementation:

1. Split `controls.ts` into domain packs:
   `architecture`, `quality`, `security`, `operations`, `reliability`,
   `resilience`, and `agent-readiness`.
2. Keep a small registry responsible for ordering and evaluation.
3. Split `scaleproof-app.tsx` into intake, progress/error state, report cover,
   actions, readiness, bus factor, evidence dossier, and export modules.
4. Keep design tokens and true global styles in `globals.css`; colocate
   section-specific styles without changing the visual system.
5. Keep one public report contract and avoid duplicating display-label mapping
   between UI and Markdown.

Acceptance criteria:

- No domain control pack imports another domain pack.
- Deterministic output is unchanged for the calibration fixtures.
- Report sections can be tested independently.
- The refactor does not add a state-management library or component framework.

### [ ] P2.2 Build a small calibration suite before increasing heuristic breadth

Implementation:

1. Add representative synthetic fixtures for:
   - strong enforced evidence;
   - missing repository evidence;
   - concrete multi-domain structural failure;
   - partial scan;
   - compact initial Lovable export;
   - unrecognized or mixed stack.
2. Store expected check dispositions, score band, verdict cap, growth labels,
   and top actions as golden assertions.
3. Have at least three technical reviewers independently assess the fixtures.
4. Record disagreements as heuristic issues before changing weights.
5. Test whether founders can explain:
   - why they received the verdict;
   - why each of the three actions matters;
   - what evidence would change the result.

Acceptance criteria:

- Heuristic changes cannot silently alter established fixture outcomes.
- False-positive and false-negative cases are attached to the control they
  calibrate.
- No analytics or stored scan history is added to the hackathon app.

## D - Conditional public-deployment gate

### [ ] D.1 Block public deployment until operational controls in SECURITY.md are implemented

This is conditional work, not part of the local hackathon MVP.

Required before a public URL:

- distributed per-IP rate limiting;
- global and per-instance concurrency limits;
- platform request and temporary-disk caps;
- outbound egress restricted to GitHub and OpenAI;
- privacy-safe success, failure, limit, rate, and cleanup metrics;
- alerts for cleanup failures, abnormal archive rejection, errors, and quota
  exhaustion;
- incident response and service-shutdown procedure;
- dependency, secret, and application-security CI scans;
- a privacy notice matching the real hosting and OpenAI data controls.

Acceptance criteria:

- The deployment review checks every item in `SECURITY.md` rather than copying
  the list into a second source of truth.
- Load and abuse tests prove concurrency and archive caps fail closed.
- No repository identifier, path, source, contributor identity, or secret
  appears in logs or metrics.

## Explicitly deferred

Do not implement these as part of this review:

- private GitHub repository access;
- accounts or saved scans;
- server-side report storage or share links;
- analytics;
- background jobs or distributed queues before measured demand;
- additional readiness domains;
- visual redesign of the editorial dossier;
- lead-generation or sales features.
