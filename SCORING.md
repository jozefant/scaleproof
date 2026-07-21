# Scaleproof scoring heuristic

Version: `0.8.6-hackathon`

Status: provisional. The heuristic is intentionally simple, visible, and
versioned so it can be calibrated from feedback after the hackathon.

## Principles

1. Deterministic checks own scores and verdicts.
2. GPT-5.6 may propose the order of allowlisted remediation codes. Displayed
   titles, rationale, severity, sources, and verification remain deterministic.
   A scan completes only after a usable proposal; GPT failure returns no partial
   report and never changes the deterministic assessment.
3. Repository evidence is not proof of runtime or organizational behaviour.
4. Documentation earns partial credit but cannot substitute for enforcement.
5. Missing evidence is different from evidence that a control fails.
6. Context changes applicability and severity, not observed facts.
7. `Fundable`, `Fixable`, and `Rewrite` are product labels, not investment advice.

## Check result model

Each check records two independent properties:

### Outcome

| Outcome | Meaning |
| --- | --- |
| `pass` | The expected characteristic or control was found. |
| `fail` | A concrete contrary finding was found. |
| `unknown` | The scanner cannot establish the result. |
| `not_applicable` | The selected context genuinely excludes the control. |

### Evidence tier

| Tier | Meaning | Example |
| --- | --- | --- |
| `enforced` | Code, executable configuration, automated test, or quality gate | A restore test runs in CI. |
| `inferred` | Strong repository evidence exists, but enforcement is incomplete | Modules exist and dependency analysis shows low coupling. |
| `documented` | A policy, ADR, or runbook states the intent | An operations guide promises daily backups. |
| `absent` | Expected repository evidence was not found | No backup configuration or procedure exists. |
| `runtime_only` | The fact cannot be proven from a repository | Whether last night's backup actually succeeded. |

The user interface maps these into readable labels:

| Display label | Internal mapping | Meaning |
| --- | --- | --- |
| Verified | `pass + enforced` | Strong positive evidence |
| Supported by evidence | `pass + inferred` | Positive but not fully enforced |
| Documented only | `pass + documented` | Intent exists; execution is unproven |
| Verified concern | `fail` with concrete evidence | A real negative finding |
| Missing evidence | `unknown + absent` where evidence is expected | Required evidence was not found |
| Not verifiable | `unknown + runtime_only` | A repository cannot prove it |
| Not applicable | `not_applicable` | Excluded from this context |

This separation matters. Finding a hardcoded secret is a **verified concern**;
it must not be confused with a low-confidence or missing-evidence result.

## Detector-strength inventory

Every control pack defines typed metadata beside its evaluator:

- the exact claim;
- applicability;
- required signals;
- disqualifying signals;
- strongest evidence tier the detector can establish;
- confidence limitation;
- remediation code.

The inventory is built only from this static metadata, not from one scan's
result. Verification fails if a control has missing metadata, unused metadata,
duplicate metadata, a remediation mismatch, or contradictory evaluations of
the same factual control. This reconciliation runs before scoring and report
assembly. There is no generic fallback rule.

## P0.8 evidence hardening

- Credential detection recognizes high-confidence private provider prefixes and
  privileged JWT claims in tracked runtime, configuration, and editor settings.
  Bounded text acquisition includes exact `.env`, `.pem`, and `.key` files;
  binary and oversized material remains excluded.
  Supabase `sb_publishable_...` keys and legacy `anon` JWTs are public client
  credentials and do not create a secret finding; `sb_secret_...` and
  `service_role` credentials do. It reports a path only; a matched value is
  never retained in check evidence, reports, logs, or model payloads.
- Each Supabase Edge Function is evaluated only against its own code and
  matching `[functions.<name>]` configuration section. Disabled JWT
  verification, wildcard CORS around provider calls, and request or response
  logging are concrete critical concerns. Positive evidence requires configured
  JWT verification or a token-validation call, restricted CORS, bounded input,
  and timeout signals in that same function. Reading an `Authorization` header
  alone is not authentication evidence.
- Literal browser `/api/*` fetch paths are normalized before matching a visible
  handler, including Next.js dynamic segments such as `[id]`, and must not be
  rewritten to a single-page application document. Catch-all Vercel and Netlify
  SPA rewrites are treated as shadowing a matching handler; fallbacks that
  explicitly exclude `/api/*`, or are preceded by a matching Netlify API rule,
  are not.
- Generated bundles, coverage and browser reports, screenshots, and conversation
  exports are excluded from implementation evidence. Where a conventional
  JavaScript or TypeScript entry point is visible, only statically imported
  source (including configured TypeScript/JavaScript aliases) can earn positive
  source-code evidence; unresolved local imports are recorded as incomplete
  reachability while only proven-reachable files remain eligible. Test files
  earn enforced credit only when a compatible recognized runner is
  invoked by an executable package script or CI workflow, not when it merely
  appears in dependencies or test-tool configuration.

`rel.load-tests` earns enforced evidence only from an executable load test,
benchmark, configured command, or enforced performance budget. A
`performance/README.md` can earn documented evidence when it contains a plan;
its path alone never establishes a repeatable performance test.

## SaaS 10x audit lens

The following is the canonical, versioned SaaS 10x rule catalog. It is adapted
to Scaleproof's repository-only boundary, mapped into the existing seven score
domains, and appears in the evidence dossier; it does not create a competing
score or a fourth intake question.

| Rule | Control | Domain / highest severity | Static audit scope |
| --- | --- | --- | --- |
| Stateless tier | `saas.stateless-tier` | Reliability / High | Session, user, tenant, or job state in memory; request-path stateful local writes only. |
| Database discipline | `saas.database-discipline` | Reliability / High | Unbounded queries, explicit N+1 loop patterns, bounded requests, migrations, query-predicate/index overlap, and read/write-replica readiness where configured. |
| Slow request work | `saas.slow-work` | Reliability / High | HTTP, mail, and similar work in request handlers; queue, worker, scheduler, or asynchronous boundary evidence. |
| Failure safety | `saas.failure-safety` | Reliability / Critical | Timeout and retry/backoff/idempotency evidence at the same call site or from an explicit library-wide default; payment and webhook handlers require local idempotency evidence. |
| Configuration boundary | `saas.config-boundary` | Security / Medium | Non-local endpoints or credential-shaped values in production source; environment-owned configuration and pool settings in source or deployment configuration. |
| Tenant isolation | `saas.tenant-isolation` | Security / Critical | Tenant-owned data, central RLS/filter/repository boundaries, and direct tenant queries without a visible predicate or central boundary. |
| Observability | `saas.observability` | Operations / High | Metrics/tracing plus correlation propagation or independently detected structured logging. |
| Release control | `saas.feature-flags` | Quality / Medium | Feature flags and configuration-gated kill switches for live or scaling applications. |
| CI test gate | `saas.ci-test-gate` | Quality / High | Visible test files linked to a merge-candidate CI workflow that runs a recognized test command. Hosting branch protection remains runtime-only. |
| Critical-area ownership | `saas.critical-bus-factor` | Architecture / High | Anonymous concentration above 70% only for a history module that is also a recognized auth, payment, webhook, or tenant area. |
| Written decisions | `saas.written-decisions` | Architecture / Medium | ADRs or independent decision records. |
| Dependency freshness | `saas.dependency-freshness` | Quality / Info | Dependency manifests are reported, but EOL and freshness stay runtime-only without a maintained dated compatibility catalog. |
| Critical-path tests | `saas.critical-test-distribution` | Quality / High | Each detected auth, payment, webhook, or tenant area must have a matching test-path area; this is distribution, not coverage. |

The rule catalog deliberately has no invented failure state. For example,
dependency EOL is always runtime-only without a dated catalog; tenant isolation
is not applicable when tenant-owned data is absent; and statelessness,
observability, or written decisions remain missing evidence when no direct
contrary pattern is found. Tests assert these neutral states rather than turning
absence into a production claim.

Rule-to-subsection mapping: database discipline covers 2a unbounded queries,
2b explicit N+1 loops, 2c query/index overlap, and 2d replica/read-write
readiness; failure safety covers payment and webhook idempotency, retry/backoff,
and timeout association; tenant isolation covers central enforcement and visible
tenant-query coverage; CI covers tests, merge-candidate workflow linkage, and
the runtime-only branch-protection limitation; and critical-area ownership and
test distribution both operate per recognized critical area, never from a
repository-wide aggregate or generic test count. Statelessness, slow work,
configuration, observability, flags, written decisions, and dependency health
each map one-to-one to the remaining catalog rules.

- The scanner is static and read-only. It never installs dependencies, runs
  scanned code, invokes a package audit, or sends repository content to an
  external service.
- A concrete failure requires direct, bounded repository evidence, such as a
  recognized client call with no visible timeout or process-local session
  state. Missing patterns remain missing evidence, not a claimed production
  defect.
- Tenant isolation is not applicable when no tenant-owned data signal is
  present. An uncertain product stage keeps feature-flag applicability neutral.
- Dependency EOL and lockfile age require a maintained, dated compatibility
  source. Until one is deliberately added, dependency freshness is runtime-only
  and makes no EOL claim.
- The SaaS-audit source patterns are reviewed for TypeScript/JavaScript, Java,
  Python, Ruby, and Go. Other languages retained by the general repository
  scanner remain visible to broader controls but do not create SaaS-audit
  failures until language-specific patterns and regressions are added.
- The audit exposes paths and deterministic summaries only. It never includes
  source snippets, contributor identities, commit text, or runtime metrics.

### Weight treatment and calibration

The 13 controls are intentionally separate from the broader existing controls:
they preserve a founder-readable finding for each SaaS rule and add only their
declared weight to the same domain. This creates deliberate overlap with broad
controls such as `rel.stateless`, `rel.database-foundations`,
`rel.failure-controls`, `ops.observability`, `quality.ci`, and architectural
decision and bus-factor controls. The overlap is not yet externally calibrated;
before changing weights or verdict thresholds, record independent technical and
founder review against the fixed synthetic cases in `TASKS.md` P2.2. Until then,
the heuristic version and its test expectations remain the reviewable baseline.

## Control score

Every control has a domain weight, severity, and context rule.

For a passing control:

| Evidence tier | Credit |
| --- | ---: |
| `enforced` | 100% |
| `inferred` | 70% |
| `documented` | 40% |

For other outcomes:

- `fail`: 0% and apply the finding's severity/cap rule.
- `unknown + absent`: 0%.
- `unknown + runtime_only`: exclude from score; reduce evidence confidence.
- `not_applicable`: exclude from score and confidence.

The domain score is:

```text
earned applicable control weight / scorable applicable control weight * 100
```

Each domain also records positive evidence, concrete negative evidence,
expected but missing repository evidence, and runtime-only evidence as separate
aggregates. The founder-facing number is the **Repository evidence score**.
Missing expected evidence lowers this number but is never reclassified as a
concrete failure.

## Domain weights

| Domain | Overall weight |
| --- | ---: |
| Architecture and team scalability | 16% |
| Quality and delivery | 14% |
| Security and privacy | 18% |
| Observability and operations | 13% |
| Reliability and user scalability | 17% |
| Data resilience and governance | 10% |
| AI-agent readiness | 12% |

The overall score is the weighted sum of the seven domain scores.

## Evidence confidence

Evidence confidence prevents a high score based on a small visible subset.

```text
evidence coverage =
  assessable applicable control weight / all applicable control weight

scan coverage =
  processed relevant files / discovered relevant files

confidence =
  evidence coverage * scan coverage * 100
```

If no repository limit is crossed, scan coverage is `1.0`.

- Confidence below 60 blocks a `Fundable` verdict.
- Relevant-file coverage below 80% blocks a `Fundable` verdict.
- Unknown or withheld context does not count as a failure. It makes
  context-dependent controls `not_applicable` or `not_verifiable` and can reduce
  confidence.

## Base verdict thresholds

| Verdict | Base rule |
| --- | --- |
| `Fundable` | Score 75-100, confidence at least 60, sufficient scan coverage, and no critical blocker |
| `Fixable` | Score 45-74, or an otherwise strong repository with an isolated critical blocker |
| `Rewrite` | Score below 45 with concrete high-confidence structural failures in at least two load-bearing domains |

`Rewrite` must be supported by problems across multiple domains. One exposed
secret, one missing runbook, or one old dependency is not sufficient by itself.
Missing repository evidence never counts toward the required
structural-failure domains.

Only controls that can establish replacement-level structural failure are
eligible to contribute a domain toward `Rewrite`:

- module-boundary failure;
- absence or failure of the executable test and CI foundations;
- concrete authentication or authorization boundary failure;
- instance-local request/session state;
- concrete database-foundation failure;
- concrete backup-and-restore foundation failure.

Exposed credentials, ownership concentration, missing documentation, policy
gaps, and operational hygiene findings may block `Fundable` and produce urgent
actions, but they are not rewrite evidence. The allowlist is encoded in the
scoring policy and covered by regression fixtures.

## Verdict caps

An isolated critical finding caps the verdict at `Fixable`. Examples:

- a likely active secret is present;
- authentication or authorization is absent for a sensitive-data application;
- a production-context application has no recovery design;
- the scan is materially partial or has insufficient evidence confidence.

`Rewrite` requires multiple systemic indicators, such as:

- tightly coupled architecture with no viable module boundaries;
- no meaningful automated tests or delivery gates;
- security controls absent across several attack surfaces;
- persistent state with no migration or recovery path;
- scaling depends on replacing several load-bearing subsystems at once.

Evidence confidence below 40 blocks `Rewrite` as well as `Fundable`; the result
is `Fixable` with limited evidence. A severe product label must not be inferred
from an empty, unsupported, or unrecognized repository surface.

Both `Fundable` and `Rewrite` require at least three scanned implementation or
configuration files. Documentation-only repositories and tiny examples are
capped at `Fixable` because they do not expose enough structural surface for
either strong label.

## Runtime growth assessments

The 10x and 100x labels are architecture-readiness judgments, not performance
guarantees.

### 10x

Evaluate:

- stateless request handling or a documented shared-session strategy;
- database indexes, migrations, connection pooling, and query discipline;
- timeouts, retries, rate limiting, graceful shutdown, and health probes;
- horizontal-scaling assumptions;
- background work separated from request paths where appropriate;
- basic load tests or performance budgets.

Output:

- `Likely ready`
- `Ready with conditions`
- `Blocked by architecture`
- `Insufficient evidence`

`Blocked by architecture` requires a concrete high-confidence `high` or
`critical` finding in the controls used by that horizon. A low score caused by
missing evidence produces `Ready with conditions` or `Insufficient evidence`,
not a blocking claim.

`Likely ready` for 10x additionally requires enforced evidence for dependency
failure controls, lifecycle health, and a repeatable load or performance path.
The 100x label also requires enforced HA/failure-domain evidence. These remain
architecture-readiness judgments, not measured capacity.

### 100x

Evaluate the 10x controls plus:

- explicit capacity assumptions and bottleneck analysis;
- partitioning, caching, queues, asynchronous workloads, and backpressure;
- HA and failure-domain design;
- tested recovery with RPO/RTO;
- observability and operational ownership;
- evidence that the architecture can evolve without replacing every core layer.

The 100x result should usually be more conservative than the 10x result.

## Team-growth assessment

Evaluate whether additional engineers can work independently:

- onboarding and one-command or clearly documented local setup;
- architecture documentation and a configured multi-module layout signal;
- stable API or event contracts between modules;
- ADRs and ownership documentation;
- contribution, review, and release workflow;
- executable CI feedback and verification entry points.

Output:

- `Parallel-friendly`
- `Conditional`
- `Coordination risk`
- `Insufficient evidence`

Do not estimate an exact maximum team size from repository evidence.
The current hackathon detector does not claim dependency-cycle analysis, low
coupling, independent deployability, or measured change blast radius.

## AI-agent readiness

Evaluate whether a coding agent can make bounded changes safely and prove the
result:

- repository instructions exist and state local commands and constraints;
- instructions cover architecture, verification, security, and completion;
- lint, type, test, build, and deeper verification are executable;
- fast feedback and full verification are separate and discoverable;
- tests and CI provide an independent feedback loop;
- dangerous changes, secrets, personal data, commits, and deployments have
  explicit guardrails;
- modules and architecture provide enough context to limit change scope.

Output:

- `Agent-ready`
- `Usable with guardrails`
- `Weak harness`
- `Insufficient evidence`

This assesses the repository environment, not the capability of a particular
agent or model.

## Bus-factor estimate

For a public GitHub scan:

1. Sample up to 100 recent default-branch commits for the repository.
2. Select up to six major code-module paths by scanned file count.
3. Sample up to 100 recent commits touching each module.
4. Immediately convert contributor identifiers into one-way opaque keys.
5. Estimate the bus factor as the smallest number of contributors responsible
   for at least 50% of attributed commits in the sample.

The module request budget is updated after every GitHub response. Sampling
stops when the returned budget reaches zero. If repository history succeeds but
module sampling is rate-limited, the completed repository/module aggregates stay
visible and the overall history availability is reported as `rate_limited`.

| Band | Heuristic |
| --- | --- |
| `High concentration` | Estimated bus factor is 1, or the largest contributor share is at least 65% |
| `Moderate concentration` | Estimated bus factor is 2, or the largest share is at least 45% |
| `Distributed` | Neither concentration condition applies |
| `Insufficient evidence` | Fewer than 10 commits, fewer than half attributable, unavailable history, or rate limiting |

High concentration is a risk signal in the architecture domain. Missing history
is unverified evidence, not a failure. The estimate is recency-biased and does
not measure review knowledge, pair work, uncommitted knowledge, or organizational
succession. Never display or retain names, emails, logins, commit messages, or
commit identifiers.

### Initial Lovable-export adjustment

A bus factor of one is common immediately after a Lovable project is exported.
Scaleproof therefore labels it `Expected for initial Lovable export` and
excludes it from negative scoring only when both conditions hold:

1. At least one explicit Lovable signal is present:
   - a `lovable-tagger` dependency;
   - Lovable metadata;
   - or a repository documentation marker that identifies Lovable.
2. The sampled default-branch history still looks like a compact initial export:
   - no more than 20 commits;
   - and those commits span no more than seven days.

The seven-day rule measures the initial commit burst, not how recently the
repository was created in calendar time. The estimated bus factor remains
visible. It becomes normally scored after the history exceeds either threshold,
even when Lovable provenance remains detectable.

This adjustment contextualizes initial ownership only. It does not excuse
missing tests, CI, module boundaries, onboarding, recovery, security, or
operational controls.

### Recovery evidence wording

Finding database migrations or durable-data libraries makes recovery controls
applicable. Failure to find backup automation, a restore procedure, a restore
test, or RPO/RTO is reported as `Missing evidence`, not as proof that backups do
not exist. Repository analysis can never verify the most recent successful
production restore.

The combined recovery control passes only when evidence exists for both backup
configuration and a restore path. Backup automation alone remains `Missing
evidence`, while its file location is still shown as partial evidence.

Missing recovery evidence is `critical` only for a scaling/production context,
`medium` for an explicitly selected prototype, and `high` otherwise.

### Growth-target action priority

The optional growth target changes only the deterministic order and selection
of non-mandatory action candidates. It never changes checks, evidence tiers,
scores, confidence, verdicts, or growth assessments. Critical concrete
remediation always remains first.

| Target | Preferred non-mandatory remediation themes |
| --- | --- |
| 10x users | Load path, statelessness, failure controls, observability |
| 100x users | HA path, failure controls, recovery, retention |
| Larger engineering team | Module boundaries, knowledge concentration, onboarding, CI, decisions |
| Both | Balance the 10x load path with module and onboarding work |
| Unknown / withheld | Neutral deterministic priority order |

GPT may reorder only the resulting target-aware allowlisted actions. It cannot
add, remove, or alter the deterministic action candidates.

## External-service diagnostics

External calls write one terminal structured event to server logs. The event is
limited to an independently generated correlation ID, provider, operation,
attempt, duration, outcome, HTTP status class, allowlisted error code, and
retry decision. It never serializes an error, request, response, model payload,
repository URL or name, branch, file path, archive bytes, credential, header,
cookie, commit, contributor, or source text.

Successful events use informational logging, cancellations use warning logging,
and failures use error logging. This keeps healthy external calls out of Vercel
error-log queries while retaining diagnosable failure events.

OpenAI synthesis records configuration, authentication, rate-limit, 5xx,
timeout, cancellation, transport, malformed-output, and rejected-priority
outcomes separately. `configuration_missing_OPENAI_API_KEY` is an allowlisted
diagnostic code: it identifies the missing variable without recording any
representation of its value. Local structured-output validation is not retried
or labelled as a provider outage. GitHub metadata, archive download, and
history calls use the same terminal-event contract. Public API errors remain
founder-safe and `no-store`.

## Scan and model limits

- 5,000 relevant text files.
- 50 MB extracted text.
- 80 MB compressed archive; 200 MB or 25,000-entry expanded archive.
- 90 seconds for acquisition and deterministic analysis.
- 12,000-token target and 16,000-token hard cap for the complete OpenAI input.
- 2,000-token maximum model output.

When a repository limit is crossed:

1. Display `Partial scan` at the top of the report.
2. Show discovered and processed file/byte counts and the limit reached.
3. Reduce scan coverage and evidence confidence.
4. Prevent `Fundable` below 80% relevant-file coverage.

When the OpenAI input limit is crossed:

1. Keep all critical and high findings.
2. Keep the highest-priority medium findings.
3. Aggregate low-severity and passing controls by domain.
4. Produce valid structured JSON; never cut a serialized payload blindly.
5. Disclose how many findings were used for AI synthesis.
6. Keep the deterministic score based on every scanned finding.

## Calibration

The executable calibration suite contains six synthetic golden scenarios:
strong enforced evidence, missing repository evidence, concrete multi-domain
failure, partial scan, compact initial Lovable export, and an unrecognized
mixed stack. It pins check dispositions, score bands, verdicts, growth labels,
and top actions.

Detector-specific false-positive cases are attached to their control tests.
The runtime control inventory records each evaluated claim, applicability,
required/disqualifying signals, evidence tier, confidence limitation, and
remediation code. Human calibration remains a separate validation activity;
unreviewed feedback must not silently change weights.

Record the heuristic version in every report. Future changes should be based on:

- false-positive and false-negative review;
- comparison against expert assessments;
- whether the three recommended actions were useful;
- repository type, stage, and stack;
- changes in verdict caused only by missing evidence;
- 10x/100x and team-growth prediction quality.

Do not silently change historical report scores when the heuristic is updated.
