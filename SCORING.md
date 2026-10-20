# Scaleproof scoring heuristic

Version: `0.8.11-hackathon`

Status: provisional. The heuristic is intentionally simple, visible, and
versioned so it can be calibrated from feedback after the hackathon.

## Principles

1. Deterministic checks own scores and verdicts.
2. GPT-5.6 may propose the order of allowlisted remediation codes. Displayed
   titles, rationale, severity, sources, and verification remain deterministic.
   A scan completes only after a usable proposal; GPT failure returns no partial
   report and never changes the deterministic assessment.
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

## Detector-strength inventory

Every control pack defines typed metadata beside its evaluator:

- the exact claim;
- applicability;
- required signals;
- disqualifying signals;
- strongest evidence tier the detector can establish;
- confidence limitation;
- remediation code.

The inventory is built only from this static metadata, not from one scan's
result. Verification fails if a control has missing metadata, unused metadata,
duplicate metadata, a remediation mismatch, or contradictory evaluations of
the same factual control. This reconciliation runs before scoring and report
assembly. There is no generic fallback rule.

## P0.8 evidence hardening

- Credential detection recognizes high-confidence private provider prefixes and
  privileged JWT claims in tracked runtime, configuration, and editor settings.
  Bounded text acquisition includes exact `.env`, `.pem`, and `.key` files;
  binary and oversized material remains excluded.
  Supabase `sb_publishable_...` keys and legacy `anon` JWTs are public client
  credentials and do not create a secret finding; `sb_secret_...` and
  `service_role` credentials do. It reports a path only; a matched value is
  never retained in check evidence, reports, logs, or model payloads.
- Each Supabase Edge Function is evaluated only against its own code and
  matching `[functions.<name>]` configuration section. Disabled JWT
  verification, wildcard CORS around provider calls, and request or response
  logging are concrete critical concerns. Positive evidence requires configured
  JWT verification or a token-validation call, restricted CORS, bounded input,
  and timeout signals in that same function. Reading an `Authorization` header
  alone is not authentication evidence.
- Literal browser `/api/*` fetch paths are normalized before matching a visible
  handler, including Next.js dynamic segments such as `[id]`, and must not be
  rewritten to a single-page application document. Catch-all Vercel and Netlify
  SPA rewrites are treated as shadowing a matching handler; fallbacks that
  explicitly exclude `/api/*`, or are preceded by a matching Netlify API rule,
  are not.
- Generated bundles, coverage and browser reports, screenshots, and conversation
  exports are excluded from implementation evidence. Where a conventional
  JavaScript or TypeScript entry point is visible, only statically imported
  source (including configured TypeScript/JavaScript aliases) can earn positive
  source-code evidence; unresolved local imports are recorded as incomplete
  reachability while only proven-reachable files remain eligible. Test files
  earn enforced credit only when a compatible recognized runner is
  invoked by an executable package script or CI workflow, not when it merely
  appears in dependencies or test-tool configuration.

`rel.load-tests` earns enforced evidence only from an executable load test,
benchmark, configured command, or enforced performance budget. A
`performance/README.md` can earn documented evidence when it contains a plan;
its path alone never establishes a repeatable performance test.

## Execution-context file roles

Repository evidence and production-execution evidence are different facts. A
fixed credential in `src/test/resources` is a test property, not a deployed key.
A loop around a repository lookup inside a one-off import script is a batch job,
not a request-path N+1. A generated component-library primitive is vendored
code, not a request handler.

Every file therefore carries one internal execution role:

| Role | Recognized by |
| --- | --- |
| `production` | Everything not matched below: application source and deployment configuration |
| `test` | Build-tool test source sets (`src/test/...`), `tests`, `__tests__`, `spec`, `e2e`, `cypress`, and mock directories; `*.test.*`, `*.spec.*`, `test_*.py`, `*_test.go`, `*_spec.rb`, `conftest.py`, runner configuration; explicitly non-production configuration such as `application-test.properties`, `.env.test`, `.env.example`, `compose.test.yml`; and framework signals such as `@SpringBootTest`, an `org.junit` import, `import pytest`, or a `describe`/`it` suite |
| `fixture` | `fixtures`, `examples`, `samples`, `demo`, and Storybook directories; `*.fixture.*` and `*.stories.*` |
| `generated` | `node_modules`, `vendor`, `third_party`, framework build directories, `target`, `__generated__`; dependency lock files; `*.min.*`, `*.generated.*`, `*.pb.go`, `*_pb2.py`, `*.d.ts`; a generated-artifact banner in the file header; and `components/ui/*` primitives that carry a component-library generator's own dependency signature |
| `documentation` | `docs`, `adr`, and wiki directories; `*.md`, `*.mdx`, `*.rst`, `*.txt`; `LICENSE`, `CHANGELOG`, and similar |
| `tooling` | `scripts`, `tools`, `bin`, `automation`, `migrations`, `seeds`, and CI directories; `Makefile`; seed, backfill, migrate, and importer entry points; numbered SQL migrations |

The role is internal. It changes applicability and severity inside the
deterministic engine and is asserted in tests. It is never added to a check
result, never rendered into the public report, and never sent to a model. The
public report keeps exactly what it had before: safe paths and deterministic
summaries.

### Credential scope

`security.exposed-secret` separates a credential-shaped value in
production or deployment-configuration scope from one in explicitly
non-production scope. Continuous-integration definitions are the deliberate
exception to the role mapping: they are offline tooling for execution purposes,
but they hold real deployment credentials, so they stay in production scope.

| Scope of the match | Outcome | Evidence tier | Severity | Action |
| --- | --- | --- | --- | --- |
| Production or deployment configuration, including CI definitions | `fail` | `enforced` | `critical` | `remove-exposed-secret`, mandatory |
| Only test, fixture, generated, documentation, or offline tooling | `unknown` | `inferred` | `medium` | None; the control earns no positive credit |
| No match | `pass` (`inferred`), or `unknown` (`runtime_only`) on a partial scan | | `critical` | None |

A non-production match is a review signal, not silence: the finding, its safe
paths, and its summary all remain in the evidence dossier, and the control earns
zero credit toward the security domain. It cannot claim a deployed credential
and cannot create a mandatory removal action. When production-scope evidence
exists as well, the finding is the critical one and lists both sets of paths.
Markdown and dependency lock files remain outside the credential scan entirely.
Matched values are never retained.

### Request-path scope

`saas.database-discipline`, `saas.slow-work`, and `saas.failure-safety` describe
what happens while a user waits. They are therefore read only from the reachable
production call graph: implementation evidence, statically reachable from an
application entry point where reachability can be resolved, and classified as
`production`. A test, fixture, generated artifact, migration, seed, or offline
importer cannot create an N+1, unbounded-query, missing-timeout, or synchronous
external-work failure on its own.

A recognized client token is also not an external dependency when it is a method
on a persistence handle: `userRepository.fetch(id)` and `db.fetch(id)` are
database service calls. Real production N+1 patterns and reachable production
external clients still produce the same concrete failures and the same mandatory
actions as before.

Non-production files remain fully usable as what they are. Migrations still
count as migration evidence, tests still count for test distribution and CI
gates, and documentation still earns documented evidence.

### Module layout

`arch.module-boundaries` passes on either of two signals:

1. a workspace or multi-module build definition together with at least two
   module manifests, as before; or
2. at least two independently buildable nested module manifests in distinct
   directories — for example `backend/pom.xml` and `frontend/package.json`.

A root workspace manifest is not required. Manifests in test, fixture, example,
generated, vendored, documentation, or offline-tooling directories are not
modules. When the control passes, machine-readable contracts, per-module CI
definitions, and documented module boundaries are merged into its evidence. The
result stays a layout signal at evidence tier `inferred`; it is never proof of
low coupling or independent deployability.

## External-provider exposure

A serverless edge handler that calls a paid external provider is the shape that
turns an open endpoint into somebody else's invoice. Recognizing that call by
vendor name would only recognize the vendors somebody thought of, so the
detector recognizes the **shape** of the call.

### Provider-call signals

| Signal | Observed |
| --- | --- |
| `runtime_package_import` | A Deno `npm:`, `jsr:`, or CDN module import in a file that also reads a credential which is not the platform's own |
| `outbound_http_request` | A `fetch`/`axios`/`ky`/`got` call to an absolute external URL or an environment-configured endpoint |
| `credentialed_client` | A client constructed with an API key, access token, or client secret read from the environment |
| `credentialed_request_header` | An outbound request carrying an `authorization` or API-key header built from the environment |

Comments are removed before matching, so a commented-out client is not a call.
Two narrowings apply, and both are narrowings of the shape rather than a vendor
allowlist: the platform's own data client (`@supabase/supabase-js` against
`SUPABASE_URL` and its keys) and the project's own platform endpoint are the
project's database handle, assessed by the browser-to-BaaS data boundary; and a
remote module import on its own is a utility import, not a provider call, until
the same file also reads a non-platform credential.

### `security.edge-function-boundary`

Each Supabase Edge Function is still evaluated against its own code and its own
`[functions.<name>]` configuration section. Two things changed:

- The function's evidence now includes sibling modules in its directory and the
  `_shared` modules it references. A wildcard CORS header defined in
  `_shared/cors.ts` belongs to the boundary of every function that imports it,
  and to no other function.
- A provider call is any of the four signals above rather than a match against a
  fixed provider-name list.

| Observation | Outcome | Evidence tier | Severity | Action |
| --- | --- | --- | --- | --- |
| Reachable provider call with `verify_jwt = false`, wildcard CORS, or request/response logging | `fail` | `enforced` | `critical` | `harden-auth-boundary`, mandatory |
| Provider call with verified JWT or a token check, restricted CORS, bounded input, and a timeout | `pass` | `enforced` | `critical` | None |
| Edge Functions without that complete boundary | `unknown` | `absent` | `critical` | `harden-auth-boundary` |
| No Supabase Edge Function | `not_applicable` | `absent` | `critical` | None |

Each disabling condition is sufficient on its own. Evidence remains the function
file, the modules where a provider signal was observed, and `supabase/config.toml`;
no source text, credential name, endpoint, or module specifier is reported.

Because a critical concrete failure is mandatory, `harden-auth-boundary` is
selected ahead of every growth-target preference for this finding.

### Server-side enforcement

`security.authorization` and `security.validation` both require an operation
inside the **reachable production call graph of the server**. That graph is
rooted at every production file which is itself a server surface — a route, an
API handler, a serverless function, a framework or Express entry, a JVM or
Python module — and then follows their static imports, with the same alias
resolution used elsewhere. A dependency manifest is never a root: declaring
`express` is how the static-frontend profile learns a server exists, not code the
server runs.

Scope is a call-graph question, not a filename question. A permission check lives
in `src/lib/authz.ts` or `src/middleware/auth.ts` at least as often as in the
route file, and both are enforcement when a server root imports them. Browser
code stays excluded by construction: a module no server root reaches is not
server execution, so a role branch or a form schema that only the browser
evaluates cannot earn server-side credit. Comments are removed before matching.

| Control | Passes on | Never passes on |
| --- | --- | --- |
| `security.authorization` | A framework annotation or filter chain (`@PreAuthorize`, `authorizeHttpRequests`, `SecurityFilterChain`), an explicit role/permission decision (`hasRole(`, `requirePermission(`, `ability.can(`, `enforcer.enforce(`), or a verified identity used as a decision input (`session.user.role`, `claims.permissions`, `roles.includes(`) — `enforced`. A versioned policy whose predicate references the caller (`create policy … auth.uid()`, `allow read: if request.auth …`) — `inferred` | An `Authorization` request header, a comment, a log line, an authorization package in a manifest, browser-only role display, or a policy with no identity predicate |
| `security.validation` | A parse call applied to a request-derived value (`s.parse(req.body)`, `Item.parse(await request.json())`) whatever the schema variable is named, or a recognized validation API: `safeParse(`, `parseAsync(`, `validateOrReject(`, `@Valid`, `ValidationPipe`, `validationResult(`, a Pydantic model | A validation package in a manifest, a browser form resolver, a comment, a schema module that no reachable handler parses, or a standard parser that shares the method name (`JSON.parse`, `Date.parse`, `path.parse`, `yaml.parse`) |

The receiver's *name* is not part of the validation rule: requiring a
schema-shaped identifier would make the control depend on spelling rather than on
whether the request is actually parsed.

The bare word `authorization` is deliberately absent from the authorization
patterns: `headers: { Authorization: … }` is how a request carries a token, not
how a server decides who may act.

### Request-path applicability for Edge Functions

A Supabase Edge Function *is* the request path, so a recognized provider call
inside one is request-path external work:

- `saas.slow-work` treats it as synchronous external work and fails when no
  queue, worker, scheduler, or other background-work boundary is visible.
- `saas.failure-safety` observes it as an external client, taking its timeout
  evidence from the function's own files and its retry-safety evidence from
  idempotency, backoff, circuit-breaker, or abuse-guard signals in the same
  function.

Missing timeout, input-limit, or abuse evidence for a recognized provider call is
therefore never reported as `not applicable`.

### Provider abuse, bounds, and public generated objects

Three controls ask a repository-evidence question with three separable answers.
`not_applicable` remains available when the repository shows no provider call or
no publicly readable generated object at all.

| State | Outcome | Evidence tier | Meaning |
| --- | --- | --- | --- |
| Repository evidence | `pass` | `enforced` | The guard, bound, or lifecycle path is defined in reachable server code, versioned SQL, or deployment configuration |
| Runtime-only claim | `unknown` | `runtime_only` | Documentation states that the deployed provider, platform, or dashboard holds it; a repository cannot verify deployed state, so it earns no enforcement credit |
| Missing evidence | `unknown` | `absent` | Neither is present. This is an evidence gap, not proof that no limit, policy, or lifecycle rule exists |

| Control | Domain | Severity | Weight | Required repository evidence | Remediation |
| --- | --- | --- | --- | --- | --- |
| `security.provider-abuse-guard` | Security | high | 3 | A server-side rate limit, throttle, quota, credit, or spend guard | `add-failure-controls` |
| `security.provider-io-bounds` | Security | medium | 2 | Both a bounded request input and a bounded requested provider output | `add-failure-controls` |
| `res.generated-object-lifecycle` | Data resilience | high | 3 | Retention, deletion, expiration, signed-URL expiry, or a scheduled cleanup for objects the application creates and exposes without a credential | `define-retention` |

Guard evidence is never read from a dependency manifest: declaring a rate-limiting
package is not rate limiting, exactly as a validation package is not validation.
Deployed storage policy, deployed rate-limit state, and provider billing state
stay outside repository evidence, and no summary asserts them.

### Stack and reachability diagnostics

Detected stacks now name the platform shape beside the base language: `React`,
`Vite`, `Supabase Edge Functions`, `Deno`, and `External provider SDK`. The
provider label is shape-derived and diagnostic only; the security boundary that
acts on provider calls lives in the analysis layer.

Alias resolution reads both `tsconfig.json`/`jsconfig.json` `compilerOptions.paths`
and a bundler `resolve.alias` object in `vite.config.*`, `rollup.config.*`, or
`webpack.config.*`, so a React/Vite application whose alias lives outside the
TypeScript configuration is no longer treated as unreachable source.
Configuration that is JSON with comments or trailing commas is parsed rather than
silently discarded.

Unresolved local import specifiers are recorded as internal diagnostics for
tests. They still mark reachability as incomplete, and the specifier itself never
appears in a check result, the public report, or a model payload.

## Static-frontend evidence profile

A repository can ship a browser bundle and no backend at all. Scoring that
absent backend as a production-readiness failure produced founder actions for
work the product does not contain, so a repository is classified as a
**static frontend** when all of the following hold:

1. A browser bundle is visible: an `index.html`, a recognized bundler or
   framework configuration file, or a browser framework dependency in
   `package.json`, together with at least one browser view file.
2. No server surface: no framework API route, serverless or edge function
   directory, server entry point, server-language source file, container or
   platform deployment descriptor, and no server-runtime code pattern.
3. No persistence client and no durable-data signal.
4. No outbound data call: no `fetch`, HTTP client, WebSocket, data-fetching
   hook, BaaS call, or hosted form service.
5. No submission path leaving the browser: no form element carrying an
   `action` that targets a URL or route, a `post` method, or a hosted form
   service, and no submit handler in a file that also makes an outbound or
   persistence call. A `mailto:`, `tel:`, or `sms:` link hands the visitor to
   another application on their own device; it is a browser hand-off, never an
   outbound data write, and never evidence that a backend exists. `action`,
   `method`, and form-service attributes count only when they sit on a form
   element, not when the same words appear elsewhere in the file.
6. The scan is complete. A partial scan did not read every file, so it cannot prove that no server code exists.

Any one of conditions 2 to 5 removes the repository from the profile. A client
application that calls a real API, Supabase, storage, authentication, or
database therefore stays outside the profile and keeps every data-boundary
control assessable.

In the profile, server-runtime controls report `not_applicable` instead of
`fail` or missing evidence:

| Area | Controls |
| --- | --- |
| Reliability | `rel.stateless`, `rel.database-foundations`, `rel.failure-controls`, `rel.health-lifecycle`, `rel.async-work`, `rel.load-tests`, `rel.ha-path`, `rel.actual-capacity` |
| Operations | `ops.structured-logging`, `ops.log-categories`, `ops.log-redaction`, `ops.observability`, `ops.alerting`, `ops.runbook`, `ops.log-retention`, `ops.alert-delivery` |
| Security | `security.authentication`, `security.authorization` |
| SaaS lens | `saas.stateless-tier`, `saas.database-discipline`, `saas.slow-work`, `saas.failure-safety`, `saas.observability`, `saas.tenant-isolation` |

Control identity, domain, severity, weight, and remediation code are unchanged;
only outcome, evidence tier, evidence, and summary become the not-applicable
form. `saas.config-boundary` is evaluated first and still fails on an embedded
runtime value; it becomes `not_applicable` only when no such value exists and
the repository has no deploy-time configuration or connection-pool surface.

Nothing else is relaxed. Credential detection, client-route reachability, edge
function boundaries, web-security baseline, input validation, the direct
browser-to-BaaS data boundary, browser personal-data logging, quality gates,
architecture, agent readiness, and ownership concentration stay fully
assessable, and `not_applicable` controls are excluded from score and
confidence exactly as before. Because the reliability and operations domains
carry no applicable weight in this profile, their domain scores stay at 0 and
a static frontend cannot reach `Fundable`; growth labels report
`Insufficient evidence` rather than a capacity claim.

### Product completeness

`quality.form-completeness` reports what the product does today, in the quality
domain, at `medium` severity and weight 3:

- `fail` when reachable browser source contains visible `<form>` markup with no
  submit handler, no form-element `action`, `post` method, or form-service
  attribute, no hosted form service, no forwarded form props, no form-state
  hook, and no outbound call in the same file. A form whose own `action` is a
  `mailto:` does submit; a `mailto:` or `tel:` link elsewhere in the file is not
  that form's submission path;
- `pass` (`inferred`) when every visible form has one of those paths;
- `not_applicable` when no visible form markup exists.

The finding states only that input has no path out of the browser. It makes no
claim about data handling, authentication, or resilience, and it never implies
that a backend exists. Its remediation code is `complete-submission-path`.

## Direct browser-to-BaaS data boundary

A browser bundle can call a backend-as-a-service database, storage bucket, or
authentication API directly. Client session state and a `user_id` predicate
improve the user experience but run inside the user's own browser, so they are
never read as server-side authorization. The deployed row-level or storage
policy that would enforce the boundary frequently lives in the provider
console, outside the repository.

The boundary is read only from reachable browser source: application source
that ships to the browser, is not a server surface, and is statically reachable
from an entry point. Server-side BaaS usage stays with the server-runtime
controls. The scanner records a categorical boundary only; no source text
reaches the report or the model payload.

### `security.client-data-boundary`

Security domain, `high` severity, weight 3, remediation `harden-auth-boundary`.

| State | Condition |
| --- | --- |
| `not_applicable` | No direct table, document, or storage operation in reachable browser code. A browser authentication client alone is reported as such and raises no policy question. |
| `pass` (`enforced`) | Versioned policy definitions in this repository cover every accessed resource. |
| `unknown` (`absent`) | Direct browser data access exists and no versioned policy definition covers the accessed resource. This is missing repository evidence. |

Versioned policy evidence is a repository artifact that defines the enforced
boundary: a SQL migration or policy file containing `create policy`,
`alter policy`, or `enable row level security`, or a `firestore.rules`,
`storage.rules`, or `database.rules.json` file. Coverage is matched by resource
name: a policy target table, an RLS-enabled table, a `bucket_id` value, or a
rules `match` path segment must equal the accessed table, collection, or
bucket. Policy evidence that covers a different resource leaves the gap open.

The missing-evidence state says only that repository evidence is absent. It
never says the deployed policy is absent or broken, and repository policy
evidence never proves the deployed project applies it. A client-side identity
predicate such as `.eq("user_id", user.id)` is reported as a user-experience
filter and never earns positive authorization credit here or in
`security.authorization`.

### `security.browser-data-logging`

Security domain, `medium` severity, weight 2, remediation `separate-log-types`.

| State | Condition |
| --- | --- |
| `not_applicable` | No browser bundle. Server-side logging stays with `ops.log-redaction`. |
| `fail` (`enforced`) | A browser log or alert call carries a session, user, email, token, or profile value. |
| `pass` (`inferred`) | No such call was found. |
| `unknown` (`runtime_only`) | The scan was partial, so the repository could not be assessed. |

A finding requires a matching value flow. String literals are removed from the
call's argument expression and template literals are reduced to their
interpolated expressions before identifiers are read, so
`console.error("Failed to load the user profile", error)` is generic error
logging and not personal-data leakage, while `console.log("session", data.session)`
and an interpolated `${session.user.email}` are findings. Cardinality accesses
such as `items.length` and PascalCase component, type, and class names are
excluded.

### Real data queries versus DOM and UI `select`

Query-bound and data-lifecycle checks apply only to real data operations. Text
earns database treatment when it contains either

1. a SQL select statement: `select`, an optional `distinct` / `all` /
   `top n`, a select list, then `from` and a target. The select list accepts
   what SQL actually writes there — `*`, qualified and quoted names, function
   calls such as `count(*)`, `max(created_at)`, `coalesce(a, b)`, or
   `array_agg(id)`, parenthesised expressions, `CASE … END`, arithmetic,
   `::` casts, and explicit `AS` aliases. The target accepts a name, a
   subquery, or a `${table}` template interpolation. Literal `\n`, `\r`, and
   `\t` escapes are normalized first, so SQL embedded in a single-line
   JavaScript, Python, or Java string is recognized. Or
2. a recognized data-client operation: a PostgREST-style `.from("table")`
   handle followed by `select`, `insert`, `upsert`, `update`, or `delete`; a
   `.storage.from("bucket")` handle followed by a storage operation; a
   Firestore document read or write with its collection; or the equivalent
   Appwrite and PocketBase document calls. A file is read as a data client only
   when it also carries a recognized BaaS client signal.

Two rules keep interface text out of the database controls, and nothing else
is excluded:

- an *implicit* alias — two bare words separated only by whitespace — is not a
  select-list term, because that is the shape of English prose ("select an
  option from the list") and of JSX attributes. `AS` aliases are accepted;
- English determiners (`the`, `a`, `an`, `this`, `your`, …) are not `from`
  targets.

A DOM `<select>`, a `<Select>` component, a `react-select` import specifier, a
`import { Select } from "…/ui/select"` specifier, generated component-library
text, and prose containing the word "select" therefore satisfy neither rule and
no longer contaminate `saas.database-discipline` or `saas.tenant-isolation`
evidence. A direct data-client query is itself a durable-data signal, so a
browser application with a hosted database and no migration directory stays
eligible for the bounded-query finding; a query bounded by `limit`, `range`, or
a single-row form does not create one.

### Resource identity

Accessed resources and policy targets are compared in two separate namespaces,
`table:` and `bucket:`, because they are separate provider namespaces: a
row-level-security policy on a table called `notes` is not coverage for a
storage bucket called `notes`. A `storage.objects` policy target is the
provider's own storage table and never covers a user table; the bucket it
covers comes from its `bucket_id` predicate. A `storage.rules` file describes
buckets, a `firestore.rules` file describes collections. Appwrite and
PocketBase collection names are read from their document calls, so a
document-API application can reach the covered state. Where no resource name
can be read at all, coverage cannot be established and the control stays in the
missing-evidence state.

## SaaS 10x audit lens

The following is the canonical, versioned SaaS 10x rule catalog. It is adapted
to Scaleproof's repository-only boundary, mapped into the existing seven score
domains, and appears in the evidence dossier; it does not create a competing
score or a fourth intake question.

| Rule | Control | Domain / highest severity | Static audit scope |
| --- | --- | --- | --- |
| Stateless tier | `saas.stateless-tier` | Reliability / High | Session, user, tenant, or job state in memory; request-path stateful local writes only. |
| Database discipline | `saas.database-discipline` | Reliability / High | Unbounded queries, explicit N+1 loop patterns, bounded requests, migrations, query-predicate/index overlap, and read/write-replica readiness where configured. Failures are read only from the reachable production call graph. |
| Slow request work | `saas.slow-work` | Reliability / High | HTTP, mail, and similar work in reachable production request handlers, including recognized external-provider calls inside Supabase Edge Functions; queue, worker, scheduler, or asynchronous boundary evidence. |
| Failure safety | `saas.failure-safety` | Reliability / Critical | Timeout and retry/backoff/idempotency evidence at the same call site or from an explicit library-wide default, in reachable production source, including recognized external-provider calls inside Supabase Edge Functions; payment and webhook handlers require local idempotency evidence. |
| Configuration boundary | `saas.config-boundary` | Security / Medium | Values used as runtime configuration, client or service initialization, credentials, deployment endpoints, or capacity settings in production source; environment-owned configuration and pool settings in source or deployment configuration. |
| Tenant isolation | `saas.tenant-isolation` | Security / Critical | Tenant-owned data, central RLS/filter/repository boundaries, and direct tenant queries without a visible predicate or central boundary. |
| Observability | `saas.observability` | Operations / High | Metrics/tracing plus correlation propagation or independently detected structured logging. |
| Release control | `saas.feature-flags` | Quality / Medium | Feature flags and configuration-gated kill switches for live or scaling applications. |
| CI test gate | `saas.ci-test-gate` | Quality / High | Visible test files linked to a merge-candidate CI workflow that runs a recognized test command. Hosting branch protection remains runtime-only. |
| Critical-area ownership | `saas.critical-bus-factor` | Architecture / High | Anonymous concentration above 70% only for a history module that is also a recognized auth, payment, webhook, or tenant area. |
| Written decisions | `saas.written-decisions` | Architecture / Medium | ADRs or independent decision records. |
| Dependency freshness | `saas.dependency-freshness` | Quality / Info | Dependency manifests are reported, but EOL and freshness stay runtime-only without a maintained dated compatibility catalog. |
| Critical-path tests | `saas.critical-test-distribution` | Quality / High | Each detected auth, payment, webhook, or tenant area must have a matching test-path area; this is distribution, not coverage. |

The rule catalog deliberately has no invented failure state. For example,
dependency EOL is always runtime-only without a dated catalog; tenant isolation
is not applicable when tenant-owned data is absent; and statelessness,
observability, or written decisions remain missing evidence when no direct
contrary pattern is found. Tests assert these neutral states rather than turning
absence into a production claim.

Rule-to-subsection mapping: database discipline covers 2a unbounded queries,
2b explicit N+1 loops, 2c query/index overlap, and 2d replica/read-write
readiness; failure safety covers payment and webhook idempotency, retry/backoff,
and timeout association; tenant isolation covers central enforcement and visible
tenant-query coverage; CI covers tests, merge-candidate workflow linkage, and
the runtime-only branch-protection limitation; and critical-area ownership and
test distribution both operate per recognized critical area, never from a
repository-wide aggregate or generic test count. Statelessness, slow work,
configuration, observability, flags, written decisions, and dependency health
each map one-to-one to the remaining catalog rules.

- The scanner is static and read-only. It never installs dependencies, runs
  scanned code, invokes a package audit, or sends repository content to an
  external service.
- A concrete failure requires direct, bounded repository evidence, such as a
  recognized client call with no visible timeout or process-local session
  state. Missing patterns remain missing evidence, not a claimed production
  defect.
- Tenant isolation is not applicable when no tenant-owned data signal is
  present. An uncertain product stage keeps feature-flag applicability neutral.
- Unbounded-query and uncovered-tenant-query detection use the real-data-query
  grammar defined in *Direct browser-to-BaaS data boundary*. A DOM `select`, a
  UI component name, and generated component-library text are not queries.
- Database, slow-work, and failure-safety findings apply the request-path scope
  defined in *Execution-context file roles*. A database service call on a
  persistence handle is never read as an external dependency. A Supabase Edge
  Function is production execution, and a recognized provider call inside one is
  request-path external work; see *External-provider exposure*.
- The configuration boundary fails only when a value is used as runtime
  configuration, client or service initialization, a credential, a deployment
  endpoint, or a capacity setting: a connection string, a credential-shaped
  assignment, a URL passed to a client constructor or request call, or a URL
  bound to a runtime-configuration name. Ordinary `href` links, image, media,
  font, documentation, and other static-content URLs, asset file extensions,
  local hosts, comments, and test or fixture paths are not configuration
  findings. Asset and content base URLs are classified by identifier: a name
  built from `cdn`, `static`, `public`, `asset`, `upload`, or any other
  content token is an asset base, not a deploy-time endpoint, so a value such
  as `cdnUrl` or `cdnBase` never fails. Service and infrastructure names such
  as `apiHost`, `gatewayEndpoint`, `redisHost`, `databaseUrl`, or `baseUrl`
  still fail.
- Dependency EOL and lockfile age require a maintained, dated compatibility
  source. Until one is deliberately added, dependency freshness is runtime-only
  and makes no EOL claim.
- The SaaS-audit source patterns are reviewed for TypeScript/JavaScript, Java,
  Python, Ruby, and Go. Other languages retained by the general repository
  scanner remain visible to broader controls but do not create SaaS-audit
  failures until language-specific patterns and regressions are added.
- The audit exposes paths and deterministic summaries only. It never includes
  source snippets, contributor identities, commit text, or runtime metrics.

### Weight treatment and calibration

The 13 controls are intentionally separate from the broader existing controls:
they preserve a founder-readable finding for each SaaS rule and add only their
declared weight to the same domain. This creates deliberate overlap with broad
controls such as `rel.stateless`, `rel.database-foundations`,
`rel.failure-controls`, `ops.observability`, `quality.ci`, and architectural
decision and bus-factor controls. The overlap is not yet externally calibrated;
before changing weights or verdict thresholds, record independent technical and
founder review against the fixed synthetic cases in `TASKS.md` P2.2. Until then,
the heuristic version and its test expectations remain the reviewable baseline.

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

Each domain also records positive evidence, concrete negative evidence,
expected but missing repository evidence, and runtime-only evidence as separate
aggregates. The founder-facing number is the **Repository evidence score**.
Missing expected evidence lowers this number but is never reclassified as a
concrete failure.

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
| `Rewrite` | Score below 45 with concrete high-confidence structural failures in at least two load-bearing domains |

`Rewrite` must be supported by problems across multiple domains. One exposed
secret, one missing runbook, or one old dependency is not sufficient by itself.
Missing repository evidence never counts toward the required
structural-failure domains.

Only controls that can establish replacement-level structural failure are
eligible to contribute a domain toward `Rewrite`:

- module-boundary failure;
- absence or failure of the executable test and CI foundations;
- concrete authentication or authorization boundary failure;
- instance-local request/session state;
- concrete database-foundation failure;
- concrete backup-and-restore foundation failure.

Exposed credentials, ownership concentration, missing documentation, policy
gaps, and operational hygiene findings may block `Fundable` and produce urgent
actions, but they are not rewrite evidence. The allowlist is encoded in the
scoring policy and covered by regression fixtures.

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

`Blocked by architecture` requires a concrete high-confidence `high` or
`critical` finding in the controls used by that horizon. A low score caused by
missing evidence produces `Ready with conditions` or `Insufficient evidence`,
not a blocking claim.

`Likely ready` for 10x additionally requires enforced evidence for dependency
failure controls, lifecycle health, and a repeatable load or performance path.
The 100x label also requires enforced HA/failure-domain evidence. These remain
architecture-readiness judgments, not measured capacity.

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
- architecture documentation and a configured multi-module layout signal;
- stable API or event contracts between modules;
- ADRs and ownership documentation;
- contribution, review, and release workflow;
- executable CI feedback and verification entry points.

Output:

- `Parallel-friendly`
- `Conditional`
- `Coordination risk`
- `Insufficient evidence`

Do not estimate an exact maximum team size from repository evidence.
The current hackathon detector does not claim dependency-cycle analysis, low
coupling, independent deployability, or measured change blast radius.

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

The module request budget is updated after every GitHub response. Sampling
stops when the returned budget reaches zero. If repository history succeeds but
module sampling is rate-limited, the completed repository/module aggregates stay
visible and the overall history availability is reported as `rate_limited`.

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

### Growth-target action priority

The optional growth target changes only the deterministic order and selection
of non-mandatory action candidates. It never changes checks, evidence tiers,
scores, confidence, verdicts, or growth assessments. Critical concrete
remediation always remains first.

| Target | Preferred non-mandatory remediation themes |
| --- | --- |
| 10x users | Load path, statelessness, failure controls, observability |
| 100x users | HA path, failure controls, recovery, retention |
| Larger engineering team | Module boundaries, knowledge concentration, onboarding, CI, decisions |
| Both | Balance the 10x load path with module and onboarding work |
| Unknown / withheld | Neutral deterministic priority order |

GPT may reorder only the resulting target-aware allowlisted actions. It cannot
add, remove, or alter the deterministic action candidates.
The payload names these candidates in `candidateActions`, and the structured-output schema accepts only those codes, each exactly once. A proposal outside that set fails the scan, so the provider must enforce the constraint and not only the prompt.

## External-service diagnostics

External calls write one terminal structured event to server logs. The event is
limited to an independently generated correlation ID, provider, operation,
attempt, duration, outcome, HTTP status class, allowlisted error code, and
retry decision. It never serializes an error, request, response, model payload,
repository URL or name, branch, file path, archive bytes, credential, header,
cookie, commit, contributor, or source text.

Successful events use informational logging, cancellations use warning logging,
and failures use error logging. This keeps healthy external calls out of Vercel
error-log queries while retaining diagnosable failure events.

OpenAI synthesis records configuration, authentication, rate-limit, 5xx,
timeout, cancellation, transport, malformed-output, and rejected-priority
outcomes separately. `configuration_missing_OPENAI_API_KEY` is an allowlisted
diagnostic code: it identifies the missing variable without recording any
representation of its value. Local structured-output validation is not retried
or labelled as a provider outage. GitHub metadata, archive download, and
history calls use the same terminal-event contract. Public API errors remain
founder-safe and `no-store`.

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

The executable calibration suite contains six synthetic golden scenarios:
strong enforced evidence, missing repository evidence, concrete multi-domain
failure, partial scan, compact initial Lovable export, and an unrecognized
mixed stack. It pins check dispositions, score bands, verdicts, growth labels,
and top actions.

Detector-specific false-positive cases are attached to their control tests.
The runtime control inventory records each evaluated claim, applicability,
required/disqualifying signals, evidence tier, confidence limitation, and
remediation code. Human calibration remains a separate validation activity;
unreviewed feedback must not silently change weights.

Record the heuristic version in every report. Future changes should be based on:

- false-positive and false-negative review;
- comparison against expert assessments;
- whether the three recommended actions were useful;
- repository type, stage, and stack;
- changes in verdict caused only by missing evidence;
- 10x/100x and team-growth prediction quality.

Do not silently change historical report scores when the heuristic is updated.
