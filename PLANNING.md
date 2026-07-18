## Project definition

This is a project for Hackathlon https://openai.com/build-week/

Project idea: Vibe-coded MVP due diligence check. Aimed at founders who built their product with AI tools or a cheap outsourced team and now want to raise or scale. It answers one question: can this codebase survive 10x users and a real engineering team? Checks structure, tests, auth, secrets, dependency age. Verdict in investor language: "fundable / fixable / rewrite." Positions you exactly where three of your clients got acquired.


## Planning ideas

Marketing tools convert on the report, not the analysis. Spend half your build time on the output page: clear verdict, one chart, three actions, your name and contact at the bottom. An accurate tool with a wall-of-text report generates zero calls.

ISTJ trap here: you will want the analysis to be rigorous before you ship it. For lead generation, directionally correct and confident beats precise and hedged. Add one honest line, "automated snapshot, not an audit," and stop calibrating.

ISTJ warning, and it is acute here: 4 days means you must ship something 70% done rather than plan something 100% correct. Your instinct will be to spec the architecture on day one. Skip it. Pick tonight, scaffold with Codex tomorrow, record the video Sunday, submit Monday with buffer. The confirmed deadline is 5 pm Pacific on 21 July 2026, which is 02:00 Bratislava time on 22 July 2026. The current [Devpost challenge page](https://openai.devpost.com/) and [official rules](https://openai.devpost.com/rules) are the submission sources of truth.

## Siple UI interface

For founder-focused AI assistant:
Area	Recommendation
UI components	shadcn/ui
Icons	Lucide
CSS	Tailwind CSS
Charts	Recharts or Tremor
Tables	TanStack Table
Fonts	Inter
Animations	Framer Motion (minimal)

This stack produces the same clean visual language seen in products like Linear, Vercel, and Stripe while remaining fully open source, lightweight, and highly maintainable. It is also well suited for AI interfaces that combine chat, reports, dashboards, and action lists without looking cluttered.

## Submission

To submit it, prepare:

- App name and one-line pitch.
- Project description explaining the problem, users, and how it works.
- Technologies used.
- Category:
 Apps for Your Life
 Work & Productivity
 Developer Tools
 Education
- Working code repository.
 Include a README with setup and test instructions.
 Explain where and how Codex and GPT-5.6 were used.
 For a private repo, give access to testing@devpost.com and build-week-event@openai.com.
- Public YouTube demo under 3 minutes.
 Show the app working.
 Explain through audio how Codex and GPT-5.6 were used.
- The Codex /feedback session ID where most of the app was built.
- Optional deployed-app URL and testing credentials.

Devpost also requires your submitter type, country of residence, and category.

The deadline is 22 July 2026 at 02:00 Bratislava time.
The working submission checklist and primary thread ID are stored in
[BUILD_WEEK_SUBMISSION.md](./BUILD_WEEK_SUBMISSION.md).

## Confirmed MVP definition

### Product

**Name:** Scaleproof

**One-line pitch:** Find out whether your codebase can carry 10x more users and a
real engineering team.

Scaleproof is a hackathon product first. It is not a lead-generation funnel in
this version. The report footer shows `Jozef Antony`, but there is no contact,
booking, or sales call to action. Lead-magnet features may be considered only
after the hackathon.

### Input and supported stacks

- Accept one public GitHub repository URL.
- Do not support private repositories, accounts, or saved scan history.
- Temporarily download the repository for deterministic analysis and delete it
  immediately afterward.
- Give first-class checks to Node.js/TypeScript and Java/Spring/Maven.
- Apply generic repository, documentation, CI, dependency, security, and
  operational checks to other stacks.

### Three context questions

Keep setup to no more than three questions. Every question must include both
`I don't know` and `Prefer not to say`; these answers remain neutral and reduce
confidence instead of becoming failures.

1. What stage is the product at?
   - Prototype
   - Live, early product
   - Scaling or production
   - I don't know
   - Prefer not to say
2. What kind of data does it handle?
   - No personal data
   - Basic account or customer data
   - Sensitive or regulated data
   - I don't know
   - Prefer not to say
3. What growth are you preparing for?
   - 10x more users
   - 100x more users
   - A larger engineering team
   - Both users and engineering team
   - I don't know
   - Prefer not to say

Scaleproof still evaluates both runtime and team growth when the third answer is
unknown; the answer changes prioritization, not the underlying evidence.

### Readiness domains

1. **Architecture and team scalability**
   - coherent boundaries and independent modules;
   - coupling, dependency cycles, shared-core concentration, and change blast radius;
   - API contracts, architecture documentation, ADRs, and explicit invariants;
   - onboarding and local setup documentation;
   - contribution workflow, code ownership, test entry points, and the ability
     for multiple teams to work in parallel;
   - repository-wide and major-module bus-factor estimates from recent git
     history, expressed only as aggregate contributor concentration.
2. **Quality and delivery**
   - unit, integration, and end-to-end tests;
   - coverage, lint, type, architecture, and security gates;
   - CI, releases, versioning, dependency maintenance, rollback, and automation.
3. **Security and privacy**
   - authentication, authorization, input validation, secrets, secure
     configuration, threat modelling, dependency security, and telemetry privacy;
   - GDPR readiness evidence such as data inventory, retention, deletion,
     export, consent, access logging, and breach response;
   - never claim that the application is GDPR compliant.
4. **Observability and operations**
   - structured application, security, audit, and access logs;
   - PII and secret redaction, correlation IDs, rotation, and retention;
   - health/readiness/liveness probes, metrics, alerting evidence, incident
     response, and operations runbooks.
5. **Reliability and user scalability**
   - statelessness, horizontal scaling, graceful shutdown, connection pooling,
     timeouts, retries, idempotency, backpressure, caching, and asynchronous work;
   - database indexes and migrations, load tests, performance budgets, HA
     assumptions, failure modes, and capacity documentation;
   - separate derived assessments for a 10x load and a 100x load. These are
     architecture-readiness judgments, not throughput guarantees.
6. **Data resilience and governance**
   - backup automation, encryption, second-location storage, restore procedures
     and rehearsals, RPO/RTO, archival, release rollback, retention, and deletion.
7. **AI-agent readiness**
   - repository-level agent instructions and their coverage of verification,
     architecture, safety, and completion rules;
   - an executable harness for lint, types, tests, builds, and deeper verification;
   - fast and full feedback loops, deterministic failure output, and CI;
   - safety guardrails for secrets, personal data, protected changes, commits,
     and deployments;
   - enough architecture and module context for an agent to complete bounded
     work without tribal knowledge.

The report also derives a **team-growth assessment** from module boundaries,
coupling, onboarding, build/test independence, contracts, ownership, ADRs, and
CI feedback. It reports whether parallel work looks supported, conditional, or
blocked; it does not predict an exact maximum team size.

It separately reports **AI-agent readiness** as `Agent-ready`,
`Usable with guardrails`, `Weak harness`, or `Insufficient evidence`.

For public GitHub repositories, Scaleproof samples up to 100 recent commits for
the repository and up to six major module paths. It estimates the smallest
number of recent contributors responsible for at least half of attributed
changes. This is a directional bus-factor signal, not a judgment of individual
performance or actual knowledge. Contributor names, emails, logins, commit
messages, and commit identifiers are discarded after aggregation. If history
is too small, unavailable, or rate-limited, the result is `Insufficient
evidence` and does not become a failure.

For a compact initial Lovable export, bus factor one is expected rather than a
scored ownership failure. Detect this only from an explicit Lovable marker plus
no more than 20 sampled commits spanning no more than seven days. Keep the
estimate visible and resume normal scoring after either history threshold is
crossed. The history span describes the export commit burst, not calendar age.

### Evidence and verdict

The deterministic scanner owns the score and verdict. GPT-5.6 may prioritize
and rewrite the three founder actions but may not change the score or invent
findings.

The versioned heuristic is documented in [SCORING.md](./SCORING.md). It is
deliberately adjustable after user feedback.

Founder report:

- `Fundable`, `Fixable`, or `Rewrite` verdict;
- overall score and evidence confidence;
- one seven-domain readiness chart;
- a runtime growth horizon for 10x and 100x users;
- a team-growth assessment;
- an AI-agent-readiness and engineering-harness assessment;
- repository-wide and major-module bus-factor concentration;
- Lovable-export provenance when it changes bus-factor interpretation;
- no more than three prioritized actions to do now;
- a separate expandable evidence dossier and downloadable Markdown report;
- the line `Automated snapshot, not an audit`;
- `Jozef Antony` in the footer, without a sales CTA.

### Repository limits

- Maximum 5,000 relevant text files.
- Maximum 50 MB of extracted text.
- Reject archives above 80 MB compressed or 200 MB / 25,000 entries expanded.
- Maximum 90 seconds for repository acquisition and deterministic analysis.
- Skip binaries, generated output, vendored dependencies, dependency caches, and
  lockfile bodies.
- When any limit is crossed, show `Partial scan` prominently with discovered and
  processed counts. Reduce evidence confidence. A scan below 80% relevant-file
  coverage cannot receive a `Fundable` verdict.

### OpenAI privacy and token boundary

Repository files, source text, snippets, repository name, paths, secrets,
personal data, and arbitrary documentation text must never be sent to OpenAI.
Contributor identities, commit messages, commit identifiers, module paths, and
raw history records must also never be sent to OpenAI.

GPT-5.6 receives only an allowlisted JSON structure containing control IDs,
outcomes, severity, numeric scores, confidence, counts, and predefined
remediation codes.

- Target total API input: at most 12,000 tokens.
- Hard total API input cap: 16,000 tokens, including instructions and schema.
- Hard output cap: 2,000 tokens.
- Use the Responses API with structured output and `store: false`.
- Count or conservatively estimate tokens before sending.
- If the allowlisted payload is too large, retain all critical and high findings,
  then the highest-priority medium findings, and aggregate low/pass results into
  counts. Never truncate JSON blindly.
- The deterministic score always uses all scanned findings.
- When the model sees only a subset, disclose, for example:
  `AI summary used 240 of 610 findings; the deterministic score used all 610.`

`store: false` is a request-level control, not a claim of Zero Data Retention.

### Demo and deployment

- Bundle a deterministic synthetic repository with deliberate strengths and flaws.
- Offer the public
  [tech-demo-test](https://github.com/Foundation-s-r-o/tech-demo-test) repository
  as a live reference scan.
- Use [Tolaria](https://github.com/refactoringhq/tolaria/tree/main/docs) as a
  reference for architecture documentation, explicit invariants, ADRs, release
  mechanics, and privacy-aware telemetry.
- Decide deployment after the local MVP is stable. Codex Sites is the preferred
  candidate because it also demonstrates Codex usage, but deployment work is
  explicitly deferred.
