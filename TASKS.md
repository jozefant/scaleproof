# Scaleproof implementation tasks

Updated: 2026-08-24

This file is the current implementation backlog. Product boundaries belong in
`README.md` and `AGENTS.md`; architecture, scoring, and security decisions
belong in their canonical documents. Git history preserves the detailed
architecture review and resolved reviewer comments that previously lived here.

## Open work

### [done] P0.6 Prove growth-target prioritization in the founder-visible flow

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

### [ ] P0.11 Close two test-determinism gaps found while accepting P0.6

Both were raised by the P0.6 reviewer as non-blocking and are recorded here
rather than reopening the accepted task.

1. Growth-target neutrality is proven against one preference only. A bug where
   `unknown`/`withheld` silently inherited a specific target's preference list
   would still pass, because the current assertion only shows they differ from
   `engineering_team` and match each other.
2. [done 2026-10-21: `reuseExistingServer: false`] `playwright.config.ts` sets `reuseExistingServer: !process.env.CI`. Locally,
   an already-running `next dev` on port 3100 without `PLAYWRIGHT_TEST=1` and
   with a real ambient `OPENAI_API_KEY` would be reused, and the browser suite
   would reach the live provider. The failure mode is a red test rather than
   silent billing, but it is the one hole in the blanked-key guarantee.
   `playwright.coverage.config.ts` already sets `reuseExistingServer: false`.

Acceptance:

- Neutral growth targets are proven neutral against an explicit no-preference
  baseline, not against a single non-neutral target.
- The browser suite cannot reach a live provider through a reused server: either
  the reuse is dropped, or the suite asserts the server it connected to is the
  blanked-key test server before running any analysis request.
- `npm run test:e2e` and `npm run verify` pass.

### [done] P0.9 Harden external-provider evidence and prevent security false positives

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

### [done] P0.10 Separate production execution evidence from test, generated, and offline tooling

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

### [done] P1.0 Classify static frontend content separately from deploy-time runtime configuration

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

### [done] P1.1 Assess direct browser-to-BaaS data boundaries without mistaking client code for enforcement

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

### [done] UI.1 Prevent the sticky report header from clipping section titles

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

### [ ] UI.2 Prevent the sticky report header from clipping section kickers

Found while accepting UI.1 and kept separate per the `UI.n` rule. UI.1 fixed the
`h1`/`h2` titles; the small uppercase kicker that sits above them
(`.repository-label`, `.section-kicker`, `.dossier-section-title > div > span`)
still lands on the sticky header boundary and is visibly half-cut in the
desktop and mobile report-summary and evidence artifacts.

Acceptance:

- The kicker above each scrolled-to section title has visible clearance below
  the sticky header at 1440x960 and 390x844.
- The Playwright artifact check measures the kicker's glyph ink, not only the
  title's.
- Saved desktop and mobile artifacts show no clipped kicker and no regression
  in title clearance or the report controls.

Validation:

```bash
npm run test:e2e
npm run verify
```

### [ ] P0.12 Bind the validation parse to a rejection path, not a receiver-name list

Raised by the P0.9 reviewer as non-blocking and recorded here rather than
reopening the accepted task. `NON_VALIDATION_RECEIVER` in
[`src/lib/analysis/controls/security.ts`](./src/lib/analysis/controls/security.ts)
excludes standard parsers by name, which is the same weakness P0.9 removed from
provider detection. Seven common non-validation parsers therefore pass
`security.validation` inside a reachable handler: CSV (`Papa.parse(input)`),
`cookieParser.parse` (the anchored `^cookie$` alternative does not match it),
multipart (`formidable.parse(req)`), date NLP, protobuf, user-agent, and
Markdown. This is a false pass on a security control.

The direction is to require the parsed value to reach a rejection path
(a thrown error, a 4xx response, or a checked `success` discriminant) rather
than to enumerate parsers. Both P0.9 acceptance halves must keep holding: a
declared package still fails, a bounded handler parse still passes.

Also correct the [`SCORING.md`](./SCORING.md) "Server-side enforcement"
sentence that lists "a standard parser that shares the method name" in the
never-passes column as though it were a general rule; the exclusion is a finite
list.

Acceptance:

- The seven parser forms above no longer pass `security.validation`.
- Every P0.9 positive and negative row still holds, proven by mutation.
- SCORING.md describes the rule that the code actually implements.

### [ ] P0.13 Stop re-export edges pulling browser modules into server-execution scope

Raised by the P0.9 reviewer. `serverExecutionPaths` in
[`src/lib/analysis/file-roles.ts`](./src/lib/analysis/file-roles.ts) walks the
import closure of server-surface roots. A shared barrel containing
`export * from "./Badge"` is a module-resolution edge, not an execution edge,
so a browser React component whose only "enforcement" is `user.role === "admin"`
in JSX earns `pass`/`enforced` for `security.authorization`. Barrel files that
re-export components are common, so P0.9 item 2's "do not pass from browser-only
code" leaks along this path.

Direct server imports of a component are a separate and defensible case: in an
SSR framework that component genuinely runs on the server.

Acceptance:

- A server root reaching a `.tsx` component only through an `export *` barrel
  does not place that component in server-execution scope.
- Genuine helper and middleware modules stay in scope (the P0.9 fix round).
- SCORING.md's "a module no server root reaches is not server execution"
  sentence is restated to match the implemented rule.

### [ ] P0.14 Narrow execution-role classification over-reach

Raised by the P0.10 reviewer and implementer. Each item widens the
non-production classification in
[`src/lib/analysis/file-roles.ts`](./src/lib/analysis/file-roles.ts) past what
P0.10 intended, and each moves a file out of production credential or
request-path scope.

1. `GENERATED_BANNER` matches a header such as `# DO NOT EDIT - managed by
   Terraform`, so a real deployment configuration is classified `generated`.
   A deployment-configuration carve-out is needed.
2. `CI_DEFINITION` covers `.github/workflows` only. `.github/actions/*/action.yml`
   composite actions also hold deployment secrets and currently classify as
   `tooling`.
3. `TOOLING_DIRECTORY` matches any `tools/`, `scripts/`, or `bin/` path segment,
   so genuine production code under `src/tools/` loses request-path findings.
4. `*.d.ts` classifies as `generated`. Accepted as defensible during P0.10
   review (a declaration file carries no executable logic and no runtime value),
   recorded here for a second opinion rather than left implicit.
5. Raised by the PR #33 review. The same over-reach applies to more directory names: `GENERATED_DIRECTORY` matches `vendor/`, `target/` and `generated/`, `FIXTURE_DIRECTORY` matches `demo/`, `example/` and `sample/`, and `DOCUMENTATION_DIRECTORY` matches `docs/` and `wiki/`. `app/api/vendor/route.ts` therefore classifies `generated` and `app/docs/[slug]/page.tsx` classifies `documentation`. `DOCUMENTATION_FILE` matches every `.txt`, so a token in a `requirements.txt` index URL is downgraded from a critical production secret to a review signal.

Acceptance:

- A deployment configuration carrying a generated banner stays in production
  credential scope, with a synthetic fixture per item.
- The P0.10 acceptance matrix still holds: test credentials, fixtures,
  generated UI, migrations, and offline scripts still cannot raise a critical
  production secret.

### [ ] P0.15 Repair comment stripping in the shared signal reader

Raised by the P0.9 implementer and confirmed by the reviewer.
`withoutComments` in [`src/lib/analysis/signals.ts`](./src/lib/analysis/signals.ts)
damages content it should preserve:

1. A line beginning with `#` is treated as a comment, which is required for
   Python and YAML but also deletes a JavaScript or TypeScript private class
   member. A credential read in a `#private` field escapes provider detection:
   `class A { #apiKey = Deno.env.get("...") }` reduces to `class A { }`.
2. `//` stripping truncates an unquoted URL, so
   `endpoint: https://api.example.invalid/v1?max_tokens=50` becomes
   `endpoint: https:`. This reaches `evidenceState` guard files
   (`.yaml`, `.yml`, `.conf`). It fails safe - lost evidence becomes `unknown`
   rather than a false pass - but it does so silently.
3. Raised by the PR #33 review. Every `'`, `"` and backtick opens a string, also in JSX text and in prose. One apostrophe (`<p>Don't have access</p>`) flips the quote state for the rest of the file. A later commented-out `// requireRole("admin")` then survives and credits `security.authorization` as enforced. This is a false pass, not a fail-safe loss.

Acceptance:

- Comment stripping is language-aware enough that a `#`-prefixed private field
  and an unquoted URL survive, with both forms pinned as test rows.
- Python and YAML comment handling is unchanged, proven by mutation.

### [ ] P0.16 Correct degenerate and mislabelled detection patterns

Four narrow defects found during P0.9 review. None produces a false pass today;
each measures something other than its name, so each is a latent false result
after an unrelated edit.

1. `RESTRICTED_CORS` (pre-existing since P0.8,
   [`src/lib/analysis/controls/security.ts`](./src/lib/analysis/controls/security.ts))
   matches the closing quote of the header *name*, so any file mentioning
   `Access-Control-Allow-Origin` reads as restricted CORS, and a
   variable-valued origin also reads as restricted. It cannot produce a false
   pass because it is ANDed with `!wildcardCors` and `exposedProviderCall`
   returns `fail` first - it is currently a dead conjunct.
2. `hasPath(/\.[jt]sx$/)` in
   [`src/lib/repository/scanner.ts`](./src/lib/repository/scanner.ts) labels any
   TSX repository "React", including Preact and Solid.
3. `byPath.get(evidence.path.toLowerCase())` in
   [`src/lib/analysis/controls/saas-audit.ts`](./src/lib/analysis/controls/saas-audit.ts)
   compares against `normalizedPath`, which also strips a leading `./`; a
   scanner emitting that form would be dropped silently.
4. `guardFiles` in
   [`src/lib/analysis/external-provider.ts`](./src/lib/analysis/external-provider.ts)
   accepts any non-manifest `.yml`/`.json`/`.sql`/`.toml`, so a CI workflow
   merely mentioning "rate limit" can satisfy `security.provider-abuse-guard`.
   It also still uses the pre-P0.9-fix `isProductionExecutionFile &&
   isServerSurfaceFile` shape, so a rate limiter living only in
   `src/lib/rate-limit.ts` is missed. Confirmed independently by the [Codex review on #33](https://github.com/jozefant/scaleproof/pull/33). The failure mode is a missed pass on an
   evidence-gap control, not a security downgrade.
   The PR #33 review found concrete false passes that make this a security issue: the default `supabase/config.toml` has `[auth.rate_limit]`, which passes `security.provider-abuse-guard`. `.github/dependabot.yml` with `open-pull-requests-limit: 10` passes `security.provider-io-bounds`. Guard files need a role check and provider relevance.

Acceptance: each pattern matches what its name claims, pinned by a negative
test row; no P0.8 or P0.9 outcome changes.

### [ ] P0.17 Make conventional server entry points execution roots

Raised by the PR #33 review. A server-execution root must first pass `isProductionExecutionFile`, which needs reachability from `isSourceEntryPoint` in [`src/lib/analysis/file-roles.ts`](./src/lib/analysis/file-roles.ts). `isSourceEntryPoint` excludes `pages/api/` and does not know Express-style entries such as `src/app.ts` or `src/server.ts`. A pages-router `pages/api/admin.ts` that calls `requireRole(` and an LLM provider is unreachable. `security.authorization` then reports missing enforcement, and the provider controls become `not_applicable`.

Acceptance: `pages/api/**` and the common Node server entry files are roots, pinned by synthetic fixtures; the P0.9 and P0.10 acceptance matrices still hold.

### [ ] P0.18 Count a role property only inside an access decision

From the [Codex review on #33](https://github.com/jozefant/scaleproof/pull/33). `security.authorization` passed on any read of `user.role`, `claims.permissions` or `user.isAdmin`, including `return { role: user.role }`. This was a false pass on a security control. A role-shaped property now counts only in a condition, a negation, a comparison (also with a constant such as `Role.Editor`), or a membership test.

Frozen matrix (`src/lib/analysis/p0-9.test.ts`, handler seam through `evaluateControls`): passes on an admin-flag condition, a role compared with a constant, an admin-flag guard expression, and a permission-set lookup; stays `unknown`/`absent` for a role returned in a response, a role written to a log, permissions copied into a variable, and an admin flag serialized. Every earlier P0.9 row still holds. Mutation: restoring the bare-read pattern fails the four negative rows.

**Ready for review** (2026-10-21). Heuristic `0.8.12-hackathon`.

### [ ] P1.6 Keep documentation and non-production files out of two profile signals

From the [Codex review on #33](https://github.com/jozefant/scaleproof/pull/33). Both produce findings and actions that do not apply to the repository, in the false-fail direction.

1. `hasDurableData` in [`src/lib/analysis/signals.ts`](./src/lib/analysis/signals.ts) searches every file, including a README. A static site whose README mentions PostgreSQL, Prisma or MongoDB loses the static-frontend profile, and server-runtime controls report missing evidence.
2. Public-object detection in [`src/lib/analysis/external-provider.ts`](./src/lib/analysis/external-provider.ts) accepts every non-Markdown file. An upload in a test or fixture makes `res.generated-object-lifecycle` report a missing production lifecycle, which can take one of the three founder actions.

Acceptance: both signals use the production-role and reachability boundary; a README mention and a test-only upload change no outcome; the P0.9, P0.10 and P1.0 matrices still hold.

### [ ] P1.4 Role-scope the configuration boundary and calibrate the non-production credential signal

Raised by the P0.10 implementer. Two loose ends left deliberately outside
P0.10's scope, which named only database, slow-work, and failure-safety.

1. `saas.config-boundary` is not role-scoped (P1.0 owns it). In the P0.10
   non-production fixture it still fails on credential assignments in a
   generated UI primitive, a migration, and an importer - exactly the
   misattribution P0.10 removes elsewhere.
2. A non-production credential review signal currently costs the full weight-5
   security control, identical in score impact to a production failure. A
   `.env.example` holding a placeholder of twenty characters or more trips it.
   The downgrade is deliberate (the signal must still cost something), but the
   weight has not been calibrated against the six golden scenarios.

Acceptance: role scope is consistent across configuration-boundary findings;
the non-production weight is justified in SCORING.md; golden scenarios are
unchanged or the change is explicitly approved.

### [ ] P1.5 Reconsider two provider-applicability judgements

Raised by the P0.9 implementer while building the fixtures; neither blocks
acceptance and both are judgement calls rather than defects.

1. A browser `fetch` with no timeout produces a critical `saas.failure-safety`
   failure. The file is production-role but is not a server surface, so the
   critical severity may overstate it.
2. `saas.slow-work`'s async-boundary evidence is repository-wide: any reachable
   file containing `worker`, `scheduler`, or `queue` satisfies it even when
   unrelated to the provider call that raised the finding.
3. A `Deno.cron`-only Edge Function must still show restricted CORS to earn a
   boundary pass, which is an odd requirement for a function with no HTTP
   surface.

Acceptance: each applicability rule is either justified in SCORING.md or
narrowed, with the P0.9 acceptance matrix unchanged.

### [ ] T.1 Pin the dependency-manifest root exclusion

The P0.9 reviewer proved by mutation that removing the manifest exclusion from
`serverExecutionPaths` in
[`src/lib/analysis/file-roles.ts`](./src/lib/analysis/file-roles.ts) lets a
`package.json` containing `hasRole(user)` and `body.parse(req.body)` reach
`pass`/`enforced` for both `security.authorization` and `security.validation` -
yet the full suite still passes 408 of 408. The guard is load-bearing and
untested. The comment in `src/lib/analysis/p0-9.test.ts` claiming a dependency
manifest is never a server-graph root does not pin it.

Acceptance: a test fails when the exclusion is removed.

### [ ] P1.2 Exclude zero-applicable-weight domains from the weighted score

Raised by the P1.0 implementer as a scoring-model question outside P1.0's
scope, and recorded rather than decided.

`scoreChecks` returns `score: 0` when `assessableWeight === 0`. Under the new
static-frontend profile a static site therefore shows "Reliability 0/100" and
"Observability 0/100" while every control in those domains reads "Not
applicable". This is not a regression - those controls previously scored 0 as
missing evidence - and the 0 is what keeps a static site below `Fundable`
(maximum reachable score 70). But a founder-facing 0 beside all-not-applicable
controls reads as a failure rather than an absence of scope.

Acceptance:

- A domain with no assessable weight is either excluded from the weighted sum
  or displayed as not assessed, never as a 0 score.
- The verdict cap that currently depends on those zeros is preserved
  explicitly, not by accident: a static frontend still cannot reach `Fundable`.
- Golden scenarios are unchanged unless the change is intended and versioned.
- Heuristic version, [`SCORING.md`](./SCORING.md), and focused tests updated
  together; `npm run verify` passes.

### [ ] P1.3 Correct the tenant-isolation summary for a client-only tenant predicate

Raised while accepting P1.1 and recorded rather than folded in, because
changing the predicate test would weaken an existing security control.

A browser query such as `.from("orgs").select("*").eq("organization_id",
org.id)` is now recognized as a real data query, so it can still produce the
concrete `saas.tenant-isolation` failure whose summary reads "this query has
neither a tenant predicate nor a central isolation boundary." With a client
`.eq("organization_id", ...)` visible that sentence is factually wrong, even
though the P1.1 principle holds: a client predicate is not enforcement.

Acceptance:

- A client-only tenant predicate produces an accurate summary - either
  corrected wording or a distinct "client-only tenant predicate, not
  server-side enforcement" state.
- The finding's severity and the principle that a client predicate never earns
  authorization credit are unchanged.
- Golden scenarios unchanged; heuristic version, [`SCORING.md`](./SCORING.md),
  and focused tests updated together.

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

### [done] P2.3 Package Scaleproof as a public-repository CLI

Make the existing public GitHub scan pipeline available as an installable Node
22 command without changing the web app or widening its trust boundary. The
task contains the durable packaging, runtime, and privacy requirements; update
their canonical documentation owners when the feature is merged.

Implementation:

1. Add a sibling CLI adapter under `src/cli/` that parses arguments with
   `node:util`, calls the existing repository acquisition, analysis, and report
   modules directly, and never imports the HTTP route, Next.js, or React.
2. Support exactly one public GitHub repository root URL or `--demo`, the
   existing context enums, Markdown output, JSON stdout, privacy-safe stderr
   progress, exit codes 0/1/2/130, and cleanup on error or SIGINT. Require
   `OPENAI_API_KEY`; accept no credentials as flags and do not add local or
   private-repository scanning.
3. Add the publishable `cli/` directory, strict npm `files` allowlist, small
   Node launcher, bundled Node 22 build, and install/usage documentation. Keep
   the root package private; add no postinstall, telemetry, workspaces,
   platform binaries, auto-update behaviour, or release automation.
4. Bundle only the CLI entry with esbuild, injecting the package version at
   build time. Externalize a dependency only when bundling demonstrably cannot
   work, record the reason, and declare only that dependency in `cli/`.
5. Add CLI build and focused synthetic tests to `npm run verify`. Do not
   publish, commit, or push as part of this task.

Acceptance:

- `npm pack --dry-run` from `cli/` contains only its launcher, bundle, README,
  and LICENSE; the root package remains private.
- Help, version, valid arguments, invalid URLs/enums, conflicting input modes,
  missing API key, cancellation, Markdown output, and JSON output have focused
  automated coverage with the defined exit codes and stdout/stderr separation.
- The CLI reuses the existing deterministic analysis, mandatory GPT-5.6
  ordering, evidence, privacy filtering, limits, and cleanup behaviour; it
  cannot write a partial report after acquisition or synthesis failure.
- A synthetic end-to-end CLI run produces the same schema-valid report and no
  more than three actions. Captured provider payloads retain the existing
  categorical allowlist and contain no source, paths, repository identifiers,
  contributor data, or credentials.
- `npm run verify` passes, including the CLI bundle build, without real
  repository scans or npm publication.

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

### [ ] C.1 Chaos: off-contract model output

Seeded fuzz of 300 proposals (reordered, fewer, unknown code, duplicate, extra, empty, `parsed: null`) in [`src/lib/ai/synthesis.chaos.test.ts`](./src/lib/ai/synthesis.chaos.test.ts). Frozen matrix: a proposal with only candidate codes and every mandatory code succeeds as its de-duplicated order followed by the left-out candidates; any other proposal fails with a clean `MandatorySynthesisError`; every scenario emits exactly one terminal diagnostic event. Mutation-checked against a lenient validator.

**Ready for review** (2026-10-21). Marked `[done]` by its implementer in PR #35, which breaks the finite task-review protocol in [`AGENTS.md`](./AGENTS.md). An independent reviewer owns the transition to `[done]`.

### [ ] C.2 Chaos: live production canary

[`scripts/canary.mjs`](./scripts/canary.mjs) runs one real demo scan; [`.github/workflows/canary.yml`](./.github/workflows/canary.yml) runs it daily and on demand. It catches model-contract drift that fake-model tests cannot see (the 2026-10-20 production 503). Set the `VERCEL_AUTOMATION_BYPASS_SECRET` repository secret if production gets Deployment Protection (see D.1).

**Ready for review** (2026-10-21). Marked `[done]` by its implementer in PR #35, which breaks the finite task-review protocol in [`AGENTS.md`](./AGENTS.md). An independent reviewer owns the transition to `[done]`.

### [ ] C.3 Chaos: provider time faults against the route budget

Found and fixed: acquisition (90 s) plus synthesis (45 s, plus one 8 s attempt) could exceed the route's `maxDuration` of 120 s, so the platform could stop the function before cleanup. The route now passes one request deadline (`REQUEST_BUDGET_MS`, 110 s) into synthesis, and each attempt is capped to the remaining time. Seeded fuzz of 300 fault sequences (hang, 429 with any `Retry-After`, 5xx, connection reset, slow success) checks the deadline, the attempt limit and one terminal event. A hang settles only when the provider's abort signal fires, so the test also proves that the timeout signal reaches the provider ([Codex review on #35](https://github.com/jozefant/scaleproof/pull/35)). Mutation-checked.

**Ready for review** (2026-10-21). Marked `[done]` by its implementer in PR #35, which breaks the finite task-review protocol in [`AGENTS.md`](./AGENTS.md). An independent reviewer owns the transition to `[done]`.

### [ ] C.4 Chaos: hostile repository archive

Inject truncated gzip, `../` and symlink escapes, a decompression bomb, 100k tiny files, one huge file, and file names with `( [ .`, newlines and non-ASCII characters into acquisition. Acceptance: a bounded partial scan or a clean error, the temporary directory is always removed, and no path reaches the report or logs.

### [ ] C.5 Chaos: GitHub failures

Inject 404 and private repository, 403 rate limit, a redirect to another host, a slow-drip body, a connection reset mid-download, and a false `Content-Length`. Acceptance: specific error codes, no request to a non-GitHub host, temporary data removed.

### [ ] C.6 Chaos: cancellation at random points

Abort the NDJSON stream at random points during acquisition, analysis and a synthesis retry wait. Acceptance: the temporary directory is removed, the OpenAI request is aborted, and no unhandled rejection occurs.

### [ ] C.7 Chaos: concurrent scans on one instance

Run 20 scans in parallel in one process, as Fluid Compute does. Acceptance: no data from one scan in another report, no temporary-directory collision, and peak memory under the function limit.

### [ ] D.1 Satisfy the public-deployment security gate

This is conditional work. The local hackathon MVP remains the current product
boundary.

Decision 2026-10-21: Scaleproof stays a protected demo, so this task stays deferred. The production domain was open to anonymous requests until 2026-10-21. Vercel Authentication now covers all deployments (see [`vercel-setup.md`](./vercel-setup.md)), and an anonymous request returns `401`.

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

### [ ] D.4 Unwrap Markdown prose across the repository

Raised by the PR #33 review. The workspace documentation rule forbids hard-wrapped prose, but every Markdown file in this repository wraps paragraphs at about 80 columns. Unwrap all of them in one mechanical commit, so the diff contains no content change. Keep line breaks in lists, tables, headings and code blocks.

Acceptance: no prose paragraph spans more than one line; `git diff --word-diff` shows no word changes.

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
   through real OpenAI synthesis in a protected Vercel deployment.
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
- Node.js 24 passes the full local gate and protected deployment smoke test,
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
- The controlled Vercel Hobby deployment is Ready on Node.js 22 with Functions
  in `iad1`. Its stable URL is protected, and an authenticated synthetic demo
  returned a three-action GPT-5.6 report. Only `OPENAI_API_KEY` is configured;
  recent platform logs contained only privacy-safe external-service diagnostics.
  The deployment remains a controlled demo and does not satisfy D.1.
- Desktop and 390 x 844 browser artifacts were reviewed for landing, selected
  context, processing, report summary, actions, and evidence. Keyboard focus is
  visibly demonstrated, and the mandatory-synthesis retry artifact shows its
  real attempt count plus the cancel control. UI.1 tracks the desktop title
  clipping found under the sticky header in report and evidence views. P0.6
  remains open for its required API/browser boundary test.
