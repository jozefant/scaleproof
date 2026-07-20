# Scaleproof implementation tasks

Updated: 2026-07-20

This file is the current implementation backlog. Product boundaries belong in
`README.md` and `AGENTS.md`; architecture, scoring, and security decisions
belong in their canonical documents. Git history preserves the detailed
architecture review and resolved reviewer comments that previously lived here.

## Open work

### [ ] P0.6 Prove growth-target prioritization in the founder-visible flow

The deterministic policy is implemented and documented in
[`SCORING.md`](./SCORING.md#growth-target-action-priority): `growthTarget`
changes only eligible non-mandatory action order/selection; checks, evidence,
scores, confidence, verdicts, and growth assessments remain unchanged.

Remaining acceptance: add an API-route or Playwright test that changes only
question C and proves the returned founder-visible action order or selection
changes. It must also prove that score, verdict, confidence, checks, and growth
assessments do not change. Keep critical remediation ahead of every target
preference and keep `unknown` and `withheld` neutral.

Validation:

```bash
npm test -- src/lib/analysis/actions.test.ts src/lib/analysis/analyze.test.ts
npm run test:e2e
npm run verify
```

### [ ] P0.8 Correct scanner evidence gaps exposed by the DeepType comparison

The controlled scan of `mawazawa/deeptype` found two critical false negatives
(tracked external-service credentials and an unauthenticated, wildcard-CORS AI
Edge Function that logs user content), plus reachability and test-evidence
blind spots. Fix the evidence model before tuning weights or verdict thresholds.
Do not add that repository's source, credentials, or history to this project;
use minimal synthetic fixtures only.

Implementation:

1. Detect credential-shaped values in tracked `.env`-like, editor-tool, and
   configuration files, including supported vendor prefixes and JWT-shaped
   publishable tokens. Never retain or display a matched value; return only a
   safe location and remediation code.
2. Add Supabase/Edge cross-file controls for a disabled JWT requirement,
   wildcard CORS, paid-provider calls, request/response logging, input limits,
   authentication, and timeout evidence. Group correlated evidence into one
   founder action.
3. Trace browser `fetch` paths through framework routes, serverless handlers,
   and deployment rewrites. Report a missing or shadowed backend route as a
   concrete integration failure.
4. Add entry-point reachability analysis and exclude generated code dumps,
   conversation history, screenshots, test reports, and other generated
   artefacts from positive implementation evidence. Reconcile controls that
   make the same factual claim so they cannot silently contradict each other.
5. Map discovered test files to a configured runner, package script, and CI
   workflow. Credit test evidence as `enforced` only when an executable command
   or CI workflow invokes that runner.

Acceptance:

- Synthetic fixtures prove each secret family is detected without exposing its
  value, and a concrete secret caps the verdict and takes action precedence.
- A synthetic Supabase function with disabled JWT, wildcard CORS, a provider
  call, and request-body logging yields a concrete security/privacy finding;
  a secured equivalent does not.
- A client API path with no handler or a deployment rewrite to the SPA is a
  verified integration concern; a matching handler passes.
- Unreachable feature code and generated artefacts cannot earn positive
  statelessness, security, or test evidence. Conflicting control outcomes fail
  the inventory/reconciliation test rather than reaching a report.
- Test files without a wired runner remain missing evidence; a runner invoked
  by a package script or CI workflow earns the documented/evidence tier stated
  in `SCORING.md`.
- Update detector metadata, `SCORING.md`, the heuristic version, and regression
  fixtures together. Run no real-repository test unless explicitly requested.

Validation:

```bash
npm test -- src/lib/analysis src/lib/repository src/lib/application
npm run test:e2e
npm run verify
```

### [ ] P2.2 Complete external heuristic calibration

The automated suite already protects six synthetic golden scenarios: strong
enforced evidence, missing evidence, concrete multi-domain failure, partial
scan, compact initial Lovable export, and an unrecognized mixed stack.

Remaining work:

1. Have at least three technical reviewers assess the scenarios independently
   without seeing the golden expectations.
2. Record disagreements as dated issues linked to affected controls before
   changing weights.
3. Ask representative founders to explain the verdict, each action, and what
   evidence would change the result.
4. Group repeated disagreements before changing behaviour; then bump the
   heuristic version and update tests and `SCORING.md`.

Acceptance:

- Reviewer and founder feedback is recorded without adding analytics or stored
  repository scans.
- Heuristic changes remain versioned and cannot silently change golden cases.
- No claim says the heuristic is externally calibrated before this work is
  complete.

### [ ] D.1 Satisfy the public-deployment security gate

This is conditional work. The local hackathon MVP remains the current product
boundary.

Implementation:

1. Use the **Production gate** in `SECURITY.md` as the only checklist; do not
   copy it into another document.
2. Implement and test every required external rate, concurrency, egress,
   observability, incident-response, privacy, and security control.
3. Prove that abuse, archive, concurrency, and cleanup failures fail closed.

Acceptance:

- Every `SECURITY.md` production-gate item has implementation evidence.
- No repository identifier, path, source, contributor identity, or secret
  appears in logs or metrics.
- Deployment happens only after explicit user authorization.

### [ ] D.2 Prepare a controlled hackathon deployment

Publish a protected preview for judges and invited testers, not an unrestricted
public production service. This controlled demo does not replace or satisfy D.1.

Implementation:

1. Use Vercel Hobby with Fluid Compute, Node.js 22, a Frankfurt execution
   region, and a generated `.vercel.app` preview URL.
2. Protect the preview with Vercel Authentication and provide testers with a
   revocable shareable link. Do not create a public production alias or custom
   domain.
3. Configure only `OPENAI_API_KEY`. Do not configure `GITHUB_TOKEN`, Upstash,
   analytics, persistent storage, or other external services.
4. Fund the OpenAI API separately from ChatGPT. Start with $10 prepaid credit
   and disable automatic recharge; do not purchase hosting or a domain.
5. Accept and document that anonymous GitHub access is limited to 60 REST API
   requests per hour per hosting IP, so history evidence may become
   rate-limited during the demo.
6. Confirm that the 120-second analysis route and the repository working set
   fit Vercel's deployed duration, memory, and writable `/tmp` limits.
7. Run the full verification gate, then smoke-test authorized and unauthorized
   access, the demo fixture, one public repository, cancellation, GPT retry
   exhaustion, GitHub rate limiting, cleanup, and rollback.
8. Record how to rotate the OpenAI secret, revoke the shareable link, stop the
   service, and remove the deployment. Revoke access 30 days after launch
   unless continuation is explicitly approved.

Acceptance:

- The deployment is inaccessible without Vercel authentication or the
  revocable shareable link.
- Invited testers can answer the three questions and receive a GPT-backed
  report.
- No hosting, domain, GitHub token, Upstash, analytics, or persistent-storage
  purchase or setup is required.
- No repository identifier, path, source, contributor identity, or secret
  appears in platform logs.
- Any future unrestricted public launch remains blocked on D.1.
- Deployment happens only after explicit user authorization.

## Verification baseline

Verified on 2026-07-20 after closing P1.5, P1.9, and P0.7:

- Lint and TypeScript 6 and 7 passed.
- `npm test`: 13 Vitest files / 125 tests passed.
- `npm run build`: webpack production build passed.
- `npm run test:e2e`: all 10 Playwright journeys passed from a fresh local
  server lifecycle.
- The focused implementation suite passed 45 tests and the independent
  SaaS-audit suite passed all 19 cases, including the evidence-cap,
  configured-instance, no-argument instance, and same-file mixed-instance
  regressions.
- TypeScript 6.0.3 emitted no deprecation warnings. TypeScript 7.0.2 passed in
  default and single-threaded modes; the `ts5to6` migration tool found no
  `baseUrl` or inferred-`rootDir` migration defect.
- The browser suite passed with an empty key and is protected from a dummy or
  ambient `OPENAI_API_KEY`.
- Desktop and 390 x 844 browser artifacts were reviewed for landing, selected
  context, processing, report summary, actions, and evidence. Keyboard focus is
  visibly demonstrated, report-section headings clear the sticky header, and
  the mandatory-synthesis retry artifact shows its real attempt count plus the
  cancel control. P0.6 remains open for its required API/browser boundary test.
