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

### [ ] P0.9 Harden external-provider evidence and prevent security false positives

A public-corpus comparison exposed a material blind spot: a Supabase Edge
Function can invoke an external AI or media provider while visibly disabling
JWT verification and allowing wildcard CORS, yet remain only a missing-evidence
finding. Two adjacent controls can also pass from weak textual matches: an
`authorization` header is not authorization enforcement, and a validation
library dependency is not server-side input validation.

Implementation:

1. Generalize external-provider detection for Supabase Edge Functions. Cover
   provider SDKs such as ElevenLabs, Deno `npm:` SDK imports, and direct
   outbound HTTP calls without treating a fixed provider-name list as the
   security boundary. A reachable external provider call with either
   `verify_jwt = false`, wildcard CORS, or request/response logging must be a
   concrete critical failure; preserve the existing evidence locations and
   never include source snippets in the report.
2. Make `security.authorization` require an enforceable server-side operation
   (for example verified identity, role/permission check, middleware, or
   versioned policy evidence). Do not pass from header names, comments,
   dependency names, or browser-only code. Make `security.validation` require
   a schema parse or equivalent bound in the reachable server handler; a
   library declaration or browser-only form validation remains insufficient.
3. Apply slow-work and failure-safety checks to recognized Edge Function
   provider calls. Detect absent timeout, body/input limit, idempotency or safe
   retry/backpressure evidence without asserting runtime behaviour that the
   repository cannot prove.
4. Add explicit repository-evidence controls for public generated objects and
   paid external-provider abuse: server-side rate/quota or cost guard, bounded
   input/output, and retention/deletion or expiration evidence. Keep deployed
   storage policy, rate-limit state, and provider billing state as
   `runtime_only` unless repository configuration proves them.
5. Improve stack and reachability diagnostics: identify React/Vite, Supabase
   Edge Functions, Deno, and recognized external-provider SDKs in addition to
   the base language; resolve configured aliases consistently and report the
   unresolved local import path only in internal test diagnostics, never in the
   public report.
6. Bump the heuristic version and update [`SCORING.md`](./SCORING.md) for every
   changed control, severity, applicability, or action-selection outcome.

Acceptance:

- Synthetic fixtures cover an Edge Function with an external SDK, disabled JWT,
  wildcard CORS, public object creation, and no request bounds. The boundary
  result is `fail`, `critical`, and `enforced`; `harden-auth-boundary` is a
  mandatory founder action ahead of growth-target preferences.
- A generic `authorization` request header does not pass authorization; a
  handler-level identity or permission check does. A validation package without
  server-side parsing does not pass validation; a bounded handler parse does.
- Edge Function external calls are applicable to slow-work and failure-safety
  controls. Missing timeout/limit/abuse evidence is never silently classified
  as not applicable.
- Public-object lifecycle and paid-provider abuse findings distinguish verified
  source evidence, missing evidence, and runtime-only claims; the report makes
  no unsupported assertion about deployed RLS, storage, rate limits, billing,
  or throughput.
- Stack detection and source-reachability tests cover configured aliases and
  the new platform signals. Public reports retain only safe existing evidence
  paths and summaries.
- Focused synthetic tests, `npm run test:e2e`, and `npm run verify` pass. No
  real repository is used by automated tests or CI.

### [ ] P0.10 Separate production execution evidence from test, generated, and offline tooling

Corpus comparisons show that a security-sensitive multi-module repository can
receive a critical exposed-secret verdict from explicitly non-production test
properties, and request-path scalability findings from integration tests,
generated UI primitives, database-only services, or one-off import scripts.
Those paths remain useful evidence, but they must not be represented as a
production credential leak or synchronous external dependency without
execution-context proof.

Implementation:

1. Add a shared file-role classifier: production source, test/integration-test,
   fixture/demo, generated/vendor, documentation, and offline/admin tooling.
   Preserve the role internally; public reports continue to expose only safe
   paths and summaries.
2. Require `security.exposed-secret` to distinguish a credential-shaped value
   in production/configuration scope from an explicitly non-production fixture.
   Test-only values remain a review signal, but cannot create a critical
   production-secret finding or `remove-exposed-secret` mandatory action unless
   independent production-scope evidence exists.
3. Restrict request-path database, slow-work, and failure-safety findings to
   reachable production handlers and their production call graph. Do not infer
   an external dependency from a database service call, migration, test, or
   offline importer. Preserve real production N+1 and external-client findings.
4. Recognize nested backend/frontend manifests, contract files, CI workflows,
   and documented module boundaries when evaluating a repository-level module
   layout. Do not require a root workspace manifest when the repository has
   independently buildable nested modules.
5. Bump the heuristic version and update [`SCORING.md`](./SCORING.md) for every
   changed applicability, score, severity, or action-selection behaviour.

Acceptance:

- Synthetic multi-module fixtures prove that fixed test credentials, test
  fixtures, generated UI code, migrations, and offline scripts cannot trigger
  a critical production secret or request-path external-work failure by
  themselves.
- Equivalent production configuration or a reachable production external client
  still produces the existing concrete failure and mandatory action where
  applicable.
- A nested backend/frontend fixture with separate manifests, API contract and
  documented boundaries does not receive a missing module-boundaries finding.
- Every changed finding reports its evidence role in internal tests; public
  Markdown contains no role-derived source snippets, secret values, repository
  identifiers, or contributor data.
- Focused synthetic tests and `npm run verify` pass without using real
  repositories in CI.

### [ ] P1.0 Classify static frontend content separately from deploy-time runtime configuration

A static React marketing site with only public image links was scored as having
embedded runtime configuration, and received founder actions for backend-scale
work even though its contact form has no submission path. Public content URLs,
normal hyperlinks, and static asset references are not credentials or runtime
service endpoints.

Implementation:

1. Tighten `saas.config-boundary` so a failure requires a value used as runtime
   configuration, client/service initialization, credential, deployment
   endpoint, or capacity setting. Do not fail it for ordinary `href`, image,
   media, font, documentation, or static-content URLs.
2. Add a static-frontend evidence profile for repositories that show a browser
   bundle but no reachable server route, serverless function, persistence
   client, submission handler, or external data write. Mark server-only
   controls not applicable rather than treating absent backend implementation as
   a production readiness failure.
3. When a visible form has no submit/action/network path, report it as a
   product-completeness signal. Do not invent data handling, authentication, or
   resilience claims.
4. Keep a client application with real API, Supabase, storage, authentication,
   or database calls outside the static profile. Its data-boundary controls must
   remain assessable.

Acceptance:

- A synthetic static landing page with public asset URLs and an inert form does
  not fail runtime-configuration or database/external-work controls; it reports
  the inert form without claiming a backend exists.
- A client constructor, environment-bound endpoint, credential-shaped value, or
  actual network/data call still triggers the appropriate existing control.
- Founder actions for a static profile are relevant to the observed product
  shape and never claim a measured production capacity or deployed backend.
- Update heuristic version, [`SCORING.md`](./SCORING.md), focused tests, and
  `npm run verify` in the same implementation change.

### [ ] P1.1 Assess direct browser-to-BaaS data boundaries without mistaking client code for enforcement

An authenticated browser application can call a BaaS database directly. Client
session state and `user_id` predicates improve UX but do not prove server-side
authorization; deployed row-level policies may be outside the repository. The
scanner needs to state that boundary precisely and detect browser-side privacy
risks without asserting unverified deployment state.

Implementation:

1. Detect direct Supabase (and comparable BaaS) Auth, table, storage, and
  mutation usage in reachable browser code. Record a categorical client-data
  boundary without sending source text to GPT.
2. When direct mutations exist but versioned RLS/storage policy evidence is not
   present, report missing repository evidence for the policy; do not claim the
   deployed policy is absent or broken. Server-side policy/migration evidence
   may improve the state only when it covers the accessed resource.
3. Detect high-confidence browser logging of session, user, email, token, or
   profile data as a privacy/log-redaction concern. Do not treat generic error
   logging as personal-data leakage without a matching value flow.
4. Distinguish real SDK data queries from DOM `select`, UI component names, and
   generated component library text. Apply query-bound and data-lifecycle
   checks only to real data-client operations.

Acceptance:

- Synthetic browser-BaaS fixtures prove that client-side identity predicates do
  not pass server-side authorization, absent versioned policy evidence remains
  an evidence gap, and matching policy evidence is attributed safely.
- A session/email log in reachable browser code creates the intended privacy
  finding; generic error logging and unrelated UI components do not.
- Real client SDK queries remain eligible for bounded-query findings, while
  generated UI `select` components do not contaminate their evidence.
- Tests preserve the no-source/no-path-to-GPT boundary, heuristic version and
  [`SCORING.md`](./SCORING.md) are updated, and `npm run verify` passes.

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

1. Use Vercel Hobby with Fluid Compute, Node.js 22, the accepted Washington,
   D.C. (`iad1`) execution region, and a generated `.vercel.app` preview URL.
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

### [ ] D.3 Plan and de-risk the Node.js 24 upgrade

Prepare a bounded migration plan before changing the production runtime. Keep
Node.js 22 as the executable baseline until Node.js 24 compatibility and
rollback are proven.

Implementation:

1. Inventory every Node.js version declaration and assumption in
   `package.json`, the lockfile, CI, Vercel settings, agent instructions,
   deployment guidance, and local commands. Identify native or optional
   dependencies that may behave differently on Node.js 24.
2. Verify current official support for Node.js 24 across Next.js, the OpenAI
   SDK, TypeScript 6 and 7, Vitest, Playwright, ESLint, and Vercel Hobby. Record
   only concrete incompatibilities, required upgrades, and removed behaviour.
3. Run `npm ci`, `npm run verify`, and the complete Playwright suite under
   Node.js 24. Review saved browser screenshots and exercise the synthetic demo
   through real OpenAI synthesis in a protected Preview deployment.
4. Define one atomic implementation change covering the `engines` constraint,
   lockfile metadata, CI/runtime configuration, and concise documentation. Do
   not mix scanner, scoring, or UI changes into the runtime upgrade.
5. Document the rollback trigger and procedure to restore the last verified
   Node.js 22 deployment if build, runtime, latency, or provider integration
   checks regress.

Acceptance:

- The plan lists every file and Vercel setting that must change, with an owner,
  command, expected evidence, and rollback step; no implicit Node default
  remains.
- Node.js 24 passes the full local gate and protected Preview smoke test,
  including synthetic GPT synthesis, before Production changes.
- Saved Playwright screenshots show no desktop or 390 x 844 regression.
- The production upgrade is a separate explicitly authorized implementation
  step. Node.js 22 remains supported until that step passes and is deployed.

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
