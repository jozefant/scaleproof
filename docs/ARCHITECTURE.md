# Scaleproof architecture

## Scope

Scaleproof is an anonymous, temporary analysis service for public GitHub
repositories. The hackathon version supports one repository per request and
does not retain scan history.

## Load-bearing invariants

1. Repository content never crosses the OpenAI boundary.
2. The deterministic engine owns checks, scores, confidence, growth labels, and verdicts.
3. GPT may select and phrase allowed remediation actions; it cannot invent a control or change a verdict.
4. Every downloaded archive is deleted after success or failure.
5. Unknown or withheld context is neutral; it may reduce confidence but is not a failure.
6. A partial scan is explicit and cannot silently receive `Fundable` below 80% file coverage.
7. The founder brief contains no more than three immediate actions.
8. Git-history identities and commit text are discarded after anonymous
   concentration counts are calculated.
9. Generated-platform provenance may contextualize a signal only through
   versioned, deterministic criteria; it cannot hide the underlying metric.

## Modules

| Module | Responsibility | May depend on |
| --- | --- | --- |
| `src/lib/repository` | Strict GitHub URL parsing, temporary acquisition, text scanning, stack detection, anonymous history aggregation | Analysis types and limits |
| `src/lib/analysis` | Signals, controls, scoring, verdicts, 10x/100x/team/agent assessments | No UI or OpenAI client |
| `src/lib/ai` | Allowlisted payload, token budget, structured action synthesis, deterministic fallback | Analysis result types |
| `src/app/api` | Request validation, status mapping, no-store response boundary | Repository and analysis orchestration |
| `src/components` | Intake, founder report, chart, evidence dossier, Markdown export | Public report type only |

The dependency direction keeps repository acquisition and UI replaceable without
changing the scoring model.

## Request sequence

1. Validate a small JSON request and a strict public GitHub root URL.
2. Read GitHub metadata to confirm the repository is public and find its default branch.
3. Stream a capped archive to an owner-only temporary file.
4. Extract safely with path preservation disabled.
5. Discover relevant text files while excluding dependencies, generated output, binaries, and lockfile bodies.
6. Sample recent repository and major-module commit history, hash contributor
   identities, aggregate concentration, and discard raw history.
7. Evaluate deterministic controls and calculate domain scores, confidence,
   verdict, growth, agent-readiness, and bus-factor assessments.
8. Build an allowlisted categorical model payload within the target token budget.
9. Ask GPT-5.6 for structured action priorities or use the deterministic fallback.
10. Return a no-store report and delete the temporary directory in all cases.

## 10x and 100x evolution

The application layer is stateless: scan state lives inside one request and the
browser. It can run on multiple instances if the deployment supplies:

- a distributed rate limiter;
- per-instance temporary storage with sufficient capacity;
- consistent egress to GitHub and OpenAI;
- request deadlines of at least the documented scan budget;
- aggregate metrics that never include repository names or paths.

At 10x request volume, horizontal instances and a shared rate limiter are the
expected path. At 100x, repository acquisition and scanning should move to a
bounded job queue with isolated workers, explicit concurrency quotas, and
short-lived result identifiers. That architecture is intentionally not built
for the hackathon because there is no measured demand yet.

## Team evolution

The current boundaries support parallel ownership of repository acquisition,
heuristic controls, GPT synthesis, and frontend/reporting. Before several teams
work concurrently:

- add contract tests around the `AnalysisReport` schema;
- split control packs by stack behind the existing evaluator interface;
- record scoring changes as versioned decision records;
- define ownership for security, privacy, and heuristic calibration;
- keep historical report semantics tied to the recorded heuristic version.

## Failure behaviour

| Failure | Behaviour |
| --- | --- |
| Invalid, non-GitHub, private, or nested URL | Reject before download |
| GitHub metadata/archive failure | Return a safe error without repository content |
| Archive over 80 MB | Cancel the stream and delete temporary data |
| Acquisition limit reached | Return a clear timeout and delete temporary data |
| Scan file/text/time limit reached | Return a visibly partial report and cap the verdict |
| GPT unavailable, invalid, or over budget | Use deterministic actions without changing the score |
| Unexpected analysis failure | Return a generic no-retention error and run cleanup |

## Deliberate non-goals

- Private repository support
- Accounts, stored history, and shared reports
- Runtime performance guarantees
- Legal, GDPR, security, or investment certification
- Distributed jobs before real usage justifies the operational complexity
