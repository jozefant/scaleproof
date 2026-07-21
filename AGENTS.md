# Scaleproof agent guide

This file is the repository-level source of truth for coding agents. Keep it
short, accurate, and aligned with the executable verification gate.

## Product boundary

Scaleproof is an OpenAI Build Week hackathon app. It analyzes one public GitHub
repository and gives a busy founder an evidence-based readiness verdict plus no
more than three immediate actions.

- Keep the hackathon goal separate from any future lead-magnet goal.
- Do not add accounts, saved scans, analytics, booking links, contact capture,
  or sales calls to action.
- Brand the report only as `Jozef Antony`.
- English is the only supported language for this edition.
- Describe every result as an automated snapshot, not an audit or compliance
  certification.

## Architecture

| Area | Responsibility |
| --- | --- |
| `src/app` | Next.js routes, page shell, and the analysis API |
| `src/components` | Founder-facing interface and report presentation |
| `src/lib/repository` | Strict GitHub acquisition, scanning, and anonymous history aggregation |
| `src/lib/analysis` | Deterministic controls, scoring, caps, evidence, and action candidates |
| `src/lib/ai` | Mandatory allowlisted GPT-5.6 synthesis with bounded retries |
| `src/lib/application` | Analysis orchestration and raw-content release before synthesis |
| `src/lib/report` | Public report contract and Markdown rendering |
| `fixtures/scaleproof-demo` | Synthetic, stable end-to-end analysis fixture |
| `docs/ARCHITECTURE.md` | Runtime boundaries, dependency direction, and failure behaviour |

Use the documentation authority map in [README.md](./README.md). Read
[SCORING.md](./SCORING.md), [SECURITY.md](./SECURITY.md), or
[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) before changing its respective
boundary. Keep current implementation work in [TASKS.md](./TASKS.md).

## Commands

Use Node.js 22.11 or newer and npm.

```bash
npm ci
npm run dev
npm run verify
```

`npm run verify` is the definition of technically done. It runs ESLint,
TypeScript 6 and 7 compatibility checks, Vitest, the production Next.js build,
and Playwright. TypeScript 6 remains available for API-dependent tooling until
the Next.js and ESLint toolchain can use the TypeScript 7 API. Run focused tests
while iterating, then run the complete gate before handing off code.

## Real-repository final tests

Use synthetic fixtures for focused tests, normal per-change verification,
`npm run verify`, and CI. Do not scan real repositories after routine commits
or builds.

Run the following public-repository corpus only when the user explicitly asks
for a full retest or a test on real repositories:

Repositories:
https://github.com/mawazawa/deeptype
https://github.com/thorwebdev/lovable-supa-elevenlabs-voice-note
https://github.com/ShenSeanChen/yt-Lovable-Supabase-GoogleAuth-Github
https://github.com/NebeyouMusie/Healthcare-Landing-Page

https://github.com/refactoringhq/tolaria/ - this for testing the file limit 
https://github.com/Foundation-s-r-o/tech-demo-test - complex Java + React codebase


Treat these as live network tests, not stable fixtures or CI dependencies. Do
not copy their contents into this repository. For each requested run, record
the test date, analyzed commit SHA when available, scan outcome, and anomalies.

## Non-negotiable rules

- Accept only public GitHub repository root URLs. Do not add private-repository
  access or arbitrary fetch URLs.
- Never send source text, snippets, repository names, file paths, secrets,
  commit data, contributor identities, personal data, or arbitrary
  documentation to OpenAI.
- Keep GPT-5.6 input limited to the allowlisted categorical structure.
- Keep `store: false`; do not describe it as Zero Data Retention.
- Treat downloaded repositories as untrusted. Preserve archive, entry, text,
  file-count, token, output, and time limits plus guaranteed cleanup.
- Never log credentials, repository identifiers, source, paths, commit text,
  contributor identities, secrets, or personal data.
- The deterministic engine owns scores, verdicts, and displayed action copy.
  GPT-5.6 may only propose the order of up to three allowlisted remediation
  codes; synthesis failure returns no report rather than a deterministic fallback.
- Preserve explicit evidence states: verified, documented, configured, inferred,
  missing, insufficient, and not applicable. Absence of evidence is not proof
  that an operational control fails.
- Keep backup and recovery separate: implementation evidence, restore-test
  evidence, RPO/RTO documentation, and applicability are distinct.
- Keep compact initial Lovable export handling narrow and visible. It may reduce
  the penalty for bus factor one; it must never hide the concentration.
- When a heuristic changes, update its version, tests, and [SCORING.md](./SCORING.md)
  in the same change.
- Do not claim measured 10x or 100x capacity without load-test evidence.
- Do not deploy or broaden data access unless the user explicitly asks.

## Change and review expectations

- Keep modules independent so repository acquisition, deterministic analysis,
  AI synthesis, and presentation can evolve in parallel.
- When a review finds a UI or visual problem, add it to `TASKS.md` as a
  standalone `UI.n` task. Do not mix UI findings into business-logic, scanner,
  scoring, security, or deployment tasks; cross-reference separate tasks when
  one change depends on another.
- Add or update tests for behavior changes, limits, scoring, evidence mapping,
  fallbacks, and privacy filters.
- Use synthetic fixtures in tests. Do not place customer, private, or sensitive
  repository data in the project.
- Keep dependency changes intentional and preserve `package-lock.json`.
- Commit directly to `main`; do not create feature branches or pull requests
  unless the user explicitly asks. If branch protection blocks a direct push,
  stop and report the blocker instead of creating a branch.
- Do not stage, commit, push, publish, or change repository settings unless the
  user explicitly authorizes that action.

### Finite task-review protocol

Use this protocol when an implementer and reviewer hand off a `TASKS.md` item:

1. Before the final implementation pass, freeze a finite acceptance matrix in
   the task. State supported inputs, expected outcomes, important negative
   cases, and the highest system seam that must be tested. Use synthetic data.
2. The implementer may record **Ready for review**, but must not change the task
   to `[done]`. A green `npm run verify` is required, but it proves only the
   encoded cases and is not independent acceptance.
3. The reviewer checks the frozen matrix in one pass, preserves resolved work,
   and records only remaining failures. The reviewer owns the transition to
   `[done]` after every frozen case and the complete gate pass.
4. After acceptance, add a newly discovered non-critical edge case as a separate
   prioritized task; do not reopen the accepted task. Reopen it only for a
   regression in the frozen matrix or a security/privacy invariant violation.
5. For scanner or analysis work, test the complete relevant seam—normally
   repository acquisition through analysis and safe evidence—not detector logic
   alone. Do not scan a real repository unless the user explicitly requests it.

## Handoff checklist

- Scope still matches the hackathon boundary.
- Privacy and security invariants remain true.
- Documentation matches changed behavior.
- `npm run verify` passes.
- The pull request explains user impact, evidence, and any residual risk.

## Recurring task: documentation hygiene

Run this review after any material product-scope, architecture, scoring, or
security change, and at least monthly while the project is active:

1. Inventory Markdown and text files with
   `rg --files --hidden -g '*.md' -g '*.txt' -g 'LICENSE' -g '!.git/**'`;
   include root, `docs`, `.github`, and fixture documentation.
2. Verify that every current statement has one canonical owner from the
   [README documentation map](./README.md#documentation-map).
3. Merge unique current facts into that owner and delete superseded plans,
   duplicate instructions, stale review narratives, and one-time setup guides.
   Use Git history as the archive instead of keeping active historical prose.
4. Keep `TASKS.md` limited to open work, acceptance criteria, and a compact
   completed-outcomes record.
5. Preserve Markdown under `fixtures/scaleproof-demo`; it is synthetic scanner
   evidence, not project documentation.
6. Check all relative documentation links and run `npm run verify` when the
   cleanup changes executable configuration or documented behaviour.
