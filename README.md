# Scaleproof

Find out whether a codebase can carry 10x more users and a real engineering
team.

Scaleproof analyzes one public GitHub repository and returns an evidence-based
`Fundable`, `Fixable`, or `Rewrite` verdict, no more than three immediate
actions, an expandable evidence dossier, and a Markdown report.

> Automated snapshot, not an audit.

This is the OpenAI Build Week edition. It has no private-repository access,
accounts, saved scans, analytics, lead capture, booking link, or sales call to
action.

## What it checks

Scaleproof evaluates seven repository-evidence domains:

1. architecture and team scalability;
2. quality and delivery;
3. security and privacy;
4. observability and operations;
5. reliability and user scalability;
6. data resilience and governance;
7. AI-agent readiness.

It also estimates recent repository and major-module contributor
concentration. Node.js/TypeScript and Java/Spring/Maven receive first-class
signals; other stacks receive generic repository, CI, dependency,
documentation, security, and operational checks.

Repository evidence is not proof of runtime behaviour, organizational
practice, measured capacity, compliance, or investment quality. Missing
evidence is kept separate from a concrete failure.

The evidence dossier also includes a versioned SaaS 10x audit lens: stateless
handling, database discipline, slow work, failure safety, configuration,
tenant isolation, observability, feature flags, CI, ownership, decisions,
dependency freshness limits, and critical-path tests. It is static and
read-only: it never runs the scanned repository or claims runtime capacity.

## Run locally

Prerequisites: Node.js 22.11 or newer, npm, and network access to public GitHub.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

No OpenAI key is required. Without one, deterministic policy orders the founder
actions. To enable GPT-5.6 ordering of allowlisted remediation codes:

```bash
export OPENAI_API_KEY="..."
npm run dev
```

An optional `GITHUB_TOKEN` raises GitHub API rate limits. It does not enable
private-repository access. Never store credentials in repository files; this
project intentionally has no environment-file template.

## Verify changes

```bash
npm run verify
```

The completion gate runs ESLint, TypeScript 6 and 7 compatibility checks,
Vitest, a production Next.js build, and Playwright founder-journey tests.
TypeScript 7 is the application CLI checker; the TypeScript 6 compatibility
package remains installed for Next.js and ESLint integrations that still need
the compiler API. Browser tests use the synthetic repository under
[`fixtures/scaleproof-demo`](./fixtures/scaleproof-demo) and cannot use ambient
OpenAI credentials.

## How it works

```mermaid
flowchart TD
    subgraph Browser["Founder browser"]
        A["Public GitHub root URL<br/>+ 3 optional context answers"]
        B["Next.js intake"]
        K["Founder report<br/>verdict, growth readiness, 3 actions, evidence"]
        L["Markdown download"]
        A --> B
        K --> L
    end

    subgraph Scaleproof["Scaleproof application"]
        C["POST /api/analyze"]
        D["Application orchestrator"]
        E["Bounded temporary acquisition<br/>and anonymous history aggregation"]
        F["Deterministic controls and scoring"]
        G["Verdict, domain scores, growth labels,<br/>evidence-linked action candidates"]
        N["Clear raw source content<br/>before optional AI"]
        H{"GPT-5.6 enabled?"}
        I["Order allowlisted remediation codes<br/>categorical data only, store: false"]
        J["Validate and assemble<br/>versioned public report"]
        M["Delete temporary acquisition files"]

        C --> D --> E --> F --> G --> N --> H
        H -- No --> J
        H -- Yes --> I --> J
        E -. finally .-> M
    end

    subgraph External["External services"]
        GH["Public GitHub"]
        OAI["OpenAI Responses API"]
    end

    B --> C
    E <--> GH
    I <--> OAI
    J --> K
```

Source text, snippets, repository names, paths, secrets, personal data,
contributor identities, commit text, and raw history never enter the OpenAI
payload. GPT-5.6 receives categorical control data and remediation codes only;
the request uses structured output and `store: false`. Scores, verdicts,
severity, displayed action copy, evidence links, and completion conditions stay
deterministic.

Repository acquisition, extraction, scanning, history, model input, output, and
time are bounded. See the security and scoring authorities below for exact
behaviour.

## Screenshots

Desktop-only captures from the synthetic demo repository. They contain no
customer or third-party repository data. Regenerate the complete set with:

```bash
npm run capture:media
```

The command starts a dedicated local server on `127.0.0.1:3199`, clears
`OPENAI_API_KEY`, runs the synthetic demo, validates all five images, then
replaces only the named files below. Each image is a 1500 x 1000 PNG (3:2). Set
`SCALEPROOF_CAPTURE_PORT` if that port is busy. Do not substitute a real
repository or add mobile captures to this public gallery.

| Screen | Media |
| --- | --- |
| Landing and GitHub URL intake | [Open PNG](./docs/media/scaleproof-landing.png) |
| Completed report, three immediate actions, and Markdown download | [Open PNG](./docs/media/scaleproof-report-overview.png) |
| Growth-readiness assessment | [Open PNG](./docs/media/scaleproof-growth-readiness.png) |
| Knowledge concentration and estimated bus factor | [Open PNG](./docs/media/scaleproof-knowledge-concentration.png) |
| Expanded evidence dossier | [Open PNG](./docs/media/scaleproof-evidence-dossier.png) |

## Documentation map

These are the active sources of truth:

| Document | Authority |
| --- | --- |
| [README.md](./README.md) | Product boundary, setup, and documentation map |
| [AGENTS.md](./AGENTS.md) | Agent workflow, non-negotiable rules, and recurring maintenance |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Modules, dependency direction, request lifecycle, and failure behaviour |
| [SCORING.md](./SCORING.md) | Versioned heuristic, evidence model, verdicts, and calibration policy |
| [SECURITY.md](./SECURITY.md) | Trust boundary, retention, and public-deployment gate |
| [TASKS.md](./TASKS.md) | Current implementation backlog and concise completion record |
| [BUILD_WEEK_SUBMISSION.md](./BUILD_WEEK_SUBMISSION.md) | Temporary submission and first-publishing checklist |
| [LICENSE](./LICENSE) | MIT terms |

Markdown inside `fixtures/scaleproof-demo` is synthetic scanner input, not
project guidance. Git history is the archive for superseded plans and completed
review detail.

## Codex and GPT-5.6

Codex was used for research, architecture, implementation, tests, browser QA,
and documentation. GPT-5.6 has one narrow runtime role: propose the ordering of
up to three allowlisted remediation codes. Invalid or unavailable model output
falls back to deterministic order.

The required Build Week evidence and primary Codex thread are recorded in
[BUILD_WEEK_SUBMISSION.md](./BUILD_WEEK_SUBMISSION.md).

## Deployment and license

The local MVP is the current goal. Public deployment is blocked until the
controls in [SECURITY.md](./SECURITY.md) are implemented and verified.

Scaleproof is available under the [MIT License](./LICENSE).
