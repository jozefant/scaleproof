# Scaleproof scoring heuristic

Version: `0.2.0-hackathon`

Status: provisional. The heuristic is intentionally simple, visible, and
versioned so it can be calibrated from feedback after the hackathon.

## Principles

1. Deterministic checks own scores and verdicts.
2. GPT-5.6 may phrase and prioritize actions but cannot change scores.
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
| `Rewrite` | Score below 45 with multiple structural failures |

`Rewrite` must be supported by problems across multiple domains. One exposed
secret, one missing runbook, or one old dependency is not sufficient by itself.

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
- explicit architecture and module boundaries;
- dependency cycles and shared-core concentration;
- independent build and test loops;
- stable API or event contracts between modules;
- ADRs and ownership documentation;
- contribution, review, and release workflow;
- CI feedback speed and scope;
- change blast radius across nominally separate features.

Output:

- `Parallel-friendly`
- `Conditional`
- `Coordination risk`
- `Insufficient evidence`

Do not estimate an exact maximum team size from repository evidence.

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

Record the heuristic version in every report. Future changes should be based on:

- false-positive and false-negative review;
- comparison against expert assessments;
- whether the three recommended actions were useful;
- repository type, stage, and stack;
- changes in verdict caused only by missing evidence;
- 10x/100x and team-growth prediction quality.

Do not silently change historical report scores when the heuristic is updated.
