# Scaleproof implementation tasks

Updated: 2026-07-21

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

### [ ] UI.1 Prevent the sticky report header from clipping section titles

The reviewed 1440x960 Playwright report-summary and evidence artifacts show the
repository and evidence titles sitting flush against the sticky report header;
the evidence-title glyphs are visibly clipped. This is a presentation defect
and is intentionally separate from scanner and scoring behaviour.

Acceptance:

- Report and section titles have visible clearance below the sticky header after
  report load and when scrolled into view at both 1440x960 and 390x844.
- Strengthen the Playwright check to require visual clearance, not only that the
  heading bounding box touches the header boundary.
- Saved desktop and mobile report-summary screenshots show no clipped title,
  horizontal overflow, or regression in the report controls.

Validation:

```bash
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

### [ ] F.1 Build a local-first standalone founder edition

This is a future product edition, not an expansion of the current hackathon
service. The hosted app must remain limited to public GitHub root URLs and
temporary analysis. The standalone edition lets a founder download and run
Scaleproof against an explicitly selected local repository, including a private
repository, without uploading source or repository identifiers.

Before implementation, record an ADR selecting the distribution and runtime
model (a signed desktop app is preferred; a local CLI plus localhost UI is an
alternative), supported operating systems, update/signing model, and threat
boundary.

Implementation:

1. Extract the deterministic scanner and application orchestration behind a
   filesystem-repository adapter. Apply the current bounded traversal,
   text/file/time limits, ignored-path rules, evidence model, and safe cleanup;
   reject symlinks that resolve outside the selected root.
2. Provide one local flow to select a repository root, validate it, show
   progress and cancellation, and view or explicitly export a report. Do not
   require a GitHub URL, repository upload, account, cloud storage, or API key
   for deterministic analysis.
3. Keep deterministic analysis and reports entirely local. Make GPT-5.6 action
   prioritization opt-in; when enabled, retain the categorical allowlist,
   explicit consent, `store: false`, and no-source/no-path/no-repository-ID
   boundary. A fully offline deterministic report must remain available.
4. Read local Git metadata only after founder authorization. Reduce identities
   to opaque aggregates in memory; display no names, emails, or commit text;
   and never write repository-derived data to application logs, telemetry,
   crash reports, update checks, or support bundles.
5. Package and sign the distribution. Verify updates separately from analysis
   data and document local storage, deletion, export behaviour, permissions,
   supported platforms, and the security response process.
6. Add cross-platform automated tests using synthetic local repositories,
   including private-looking directories, symlinks, cancellation, limits,
   absent or denied filesystem permissions, offline mode, and opt-in AI payload
   inspection. Do not use customer repositories in tests.

Acceptance:

- A founder can download and install the standalone edition (or use the
  ADR-approved signed CLI), select a local repository, and receive the same
  schema-valid deterministic report without network access or an API key.
- The local edition reads no data outside the explicitly selected repository
  root, follows no symlink outside it, and leaves no source, archive, or report
  data behind except at an explicitly selected export location.
- With AI disabled, no network requests occur. With AI enabled, a captured
  payload proves it contains only the existing categorical allowlist and that
  consent was recorded locally.
- Native packaging and update artefacts are signed; tamper and rollback
  behaviour is documented and tested on every supported operating system.
- `README.md`, `docs/ARCHITECTURE.md`, `SECURITY.md`, and `SCORING.md`
  distinguish the hosted public scan from the local-first edition. The hosted
  public scan receives no private-repository or local-filesystem access.

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

Verified on 2026-07-21:

- Lint and TypeScript 6 and 7 passed.
- `npm test`: 14 Vitest files / 137 tests passed.
- `npm run build`: webpack production build passed.
- `npm run test:e2e`: all 10 Playwright journeys passed from a fresh local
  server lifecycle.
- The focused analysis, repository, and application suite passed 11 files / 101
  tests. The SaaS-audit suite passed all 19 cases, including the evidence-cap,
  configured-instance, no-argument instance, and same-file mixed-instance
  regressions.
- TypeScript 6.0.3 emitted no deprecation warnings. TypeScript 7.0.2 passed in
  default and single-threaded modes; the `ts5to6` migration tool found no
  `baseUrl` or inferred-`rootDir` migration defect.
- The browser suite passed with an empty key and is protected from a dummy or
  ambient `OPENAI_API_KEY`.
- Desktop and 390 x 844 browser artifacts were reviewed for landing, selected
  context, processing, report summary, actions, and evidence. Keyboard focus is
  visibly demonstrated, and the mandatory-synthesis retry artifact shows its
  real attempt count plus the cancel control. UI.1 tracks the desktop title
  clipping found under the sticky header in report and evidence views. P0.6
  remains open for its required API/browser boundary test.
