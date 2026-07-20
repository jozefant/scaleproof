# Scaleproof implementation tasks

Updated: 2026-07-20

This file is the current implementation backlog. Product boundaries belong in
`README.md` and `AGENTS.md`; architecture, scoring, and security decisions
belong in their canonical documents. Git history preserves the detailed
architecture review and resolved reviewer comments that previously lived here.

## Open work

### [ ] P0.6 Make the growth target affect deterministic action priorities

The intake says its three optional answers improve prioritization, but changing
only `growthTarget` currently produces identical deterministic checks, score,
verdict, growth assessments, and top-three actions. GPT receives the selected
target, but it may only reorder the same three actions and has no effect when
synthesis uses the deterministic fallback.

Implementation:

1. Pass `growthTarget` into deterministic action selection.
2. Add a small, explicit priority policy:
   - `users_10x`: load testing, statelessness, failure controls, and
     observability;
   - `users_100x`: HA path, asynchronous work, failure domains, and recovery;
   - `engineering_team`: module boundaries, ownership, onboarding, and CI;
   - `users_and_team`: balance runtime and team actions;
   - `unknown` and `withheld`: keep neutral ordering.
3. Apply target preference only among otherwise eligible non-mandatory work.
   Critical security and recovery remediations must retain precedence.
4. Keep checks, severity, evidence, domain scores, confidence, verdict, and
   10x/100x/team assessments independent of the founder's preference.
5. Keep deterministic selection authoritative. GPT may reorder only the
   target-aware allowlisted actions.
6. Document the policy in `SCORING.md` and bump `HEURISTIC_VERSION`.

Acceptance:

- The same synthetic repository can produce a different non-mandatory action
  selection or order for user-scale and engineering-team targets.
- Changing only `growthTarget` leaves checks, score, confidence, verdict, and
  growth assessments unchanged.
- A critical exposed-secret action remains ahead of every target preference.
- `unknown` and `withheld` produce the same neutral deterministic priorities.
- Target-aware deterministic candidates are stable before mandatory GPT
  synthesis and are the only actions the model may reorder.
- Unit tests cover every growth target, and an API or browser test proves that
  changing question C changes the founder-visible priorities.

Validation:

```bash
npm test -- src/lib/analysis/actions.test.ts src/lib/analysis/analyze.test.ts
npm run test:e2e
npm run verify
```

Reviewer verification 2026-07-20: the deterministic policy, critical-action
precedence, neutral targets, heuristic version, scoring documentation, and
unit/application tests are correct. One acceptance item remains: add an API
route or Playwright test that changes only question C and proves the returned
founder-visible action order or selection changes while the score, verdict,
confidence, checks, and growth assessments remain unchanged. Do not change the
priority policy unless that boundary test exposes a defect.

### [ ] P0.7 Make GPT synthesis mandatory with bounded retries

Scaleproof currently returns a successful deterministic fallback report when
OpenAI is not configured, cannot be reached, times out, or returns an unusable
response. The new product policy requires a usable GPT synthesis before any
scan can complete.

GPT remains forbidden from changing the deterministic checks, score, verdict,
severity, evidence, or displayed action copy. If mandatory synthesis cannot be
completed, fail the scan and return no report rather than implying that GPT
produced or validated the score.

Implementation:

1. Replace the successful synthesis fallback with a typed mandatory-synthesis
   failure. A missing API key or permanent authentication/configuration error
   must fail fast.
2. For transient network errors, timeouts, HTTP `408`, `429`, `5xx`, or an
   unusable structured response, make one initial request plus five retries,
   for at most six total attempts.
3. Use abort-aware exponential backoff of approximately `1s`, `2s`, `4s`,
   `8s`, and `16s`, with bounded jitter. Honor a valid `Retry-After` value
   without exceeding the request deadline.
4. Bound each attempt and the complete retry budget so the route stays within
   its 120-second duration limit. Cancellation must stop the active request,
   pending backoff, and all future attempts immediately.
5. After the first transient failure, show a privacy-safe founder message such
   as `OpenAI is temporarily unavailable; retrying mandatory synthesis
   (attempt 2 of 6).` Do not reacquire or rescan the repository between
   synthesis attempts.
6. If all six attempts fail, return a typed `503` response such as
   `synthesis_unavailable` and tell the founder that OpenAI could not be reached
   and the scan must be tried again. Do not return the internally calculated
   draft score or a partial report.
7. Preserve the existing allowlisted payload, token limits, `store: false`,
   raw-source release before synthesis, and privacy-safe logging rules.
8. Keep verification isolated from live OpenAI. Inject request, sleep, clock,
   and test-synthesis boundaries so unit, API, and Playwright tests are
   deterministic and never use ambient credentials or external network calls.
9. Update `README.md`, `AGENTS.md`, `docs/ARCHITECTURE.md`, and `SCORING.md` to
   remove deterministic-fallback claims and document that GPT synthesis is a
   mandatory report-completion dependency, not the scoring authority.

Acceptance:

- Five transient failures followed by a successful sixth attempt return a
  schema-valid report with GPT-ordered allowlisted actions.
- Six transient failures return `503 synthesis_unavailable`, no report, and a
  clear founder-facing retry message.
- Missing credentials and non-retryable `4xx` errors fail without pointless
  backoff.
- The UI exposes retry progress after the first transient failure and remains
  cancellable throughout the retry window.
- Cancellation during a request or backoff produces no further attempts and
  still guarantees repository cleanup.
- Critical mandatory remediation cannot be omitted or replaced by GPT.
- Tests prove the retry count, backoff sequence, deadline cap, `Retry-After`,
  malformed-response handling, cancellation, final error mapping, and
  successful last-attempt recovery without making a live OpenAI request.
- `npm run verify` passes with no usable ambient `OPENAI_API_KEY`.

Validation:

```bash
npm test -- src/lib/ai/synthesis.test.ts src/app/api/analyze/route.test.ts
npm run test:e2e
OPENAI_API_KEY= npm run verify
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

Verified on 2026-07-20 after closing P1.5 and P1.9:

- Lint and TypeScript 6 and 7 passed.
- `npm test`: 13 Vitest files / 119 tests passed.
- `npm run build`: webpack production build passed.
- `npm run test:e2e`: all 9 Playwright journeys passed from a fresh local
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
  visibly demonstrated, and report-section headings clear the sticky header.
  P0.6 remains open for its required API/browser boundary test.
