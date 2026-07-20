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

### [ ] P1.5 Replace the three selects with fast radio choices

The three optional founder questions currently use closed combo boxes. Each
answer requires opening a menu, finding an option, and closing it before moving
on. Replace them with visible radio choices so founders can scan all options
and answer each question with one click or tap.

Design direction:

- Apply the guided-utility theme defined by P1.9; P1.9 supersedes the previous
  hard-border editorial treatment but not this task's interaction and
  accessibility requirements.
- Use compact choice cards with visible radio indicators and an unmistakable
  orange selected state. Do not introduce a component library or decorative
  animation.
- Keep the repository scan as the dominant action and preserve the existing
  `A/B/C` question order unless P1.9 provides an equally clear accessible
  hierarchy.

Implementation:

1. Replace the generic `Question` select renderer with semantic
   `<fieldset>`/`<legend>` radio groups using native `<input type="radio">`
   controls.
2. Make the whole option label clickable. Use at least a 44-pixel tap target,
   a visible focus indicator, sufficient contrast, and clear hover, checked,
   disabled, and keyboard states.
3. Preserve the existing values, labels, defaults, and API contract. `I don't
   know` remains selected by default and `Prefer not to say` remains available
   for every group.
4. Use a compact responsive grid rather than 18 vertically stacked rows.
   Prefer two columns where labels remain readable and fall back to one column
   only when the viewport cannot support the minimum tap width.
5. Keep one primary `Analyze` action reachable after any selection without
   forcing the founder to scroll back to the repository field. On narrow
   screens it may remain sticky within the intake panel, provided it respects
   the safe area and never covers a radio option.
6. Disable every radio while analysis is running and preserve the selected
   state after validation or acquisition errors.
7. Keep the implementation local to the intake component and its CSS module;
   do not add a form library or global state manager.

Acceptance:

- No context question renders a `<select>` or requires opening a menu.
- A founder can select one answer in each group and start the scan using only
  three option taps plus the Analyze action.
- Clicking anywhere on an option selects it, and arrow-key navigation follows
  native radio-group behavior.
- Each group exposes an accessible name, one checked value, and no effect on
  the other two groups.
- The submitted request contains the exact selected `stage`,
  `dataSensitivity`, and `growthTarget` values.
- `unknown` is selected initially, and all selected values survive a
  founder-correctable error.
- At 390 x 844 there is no horizontal overflow, clipped label, covered option,
  or need to scroll back upward to find Analyze.
- Saved desktop and 390 x 844 Playwright screenshots show clear selected,
  unselected, focus, and disabled states without weakening the existing visual
  identity.

Validation:

```bash
npm run test:e2e
npm run verify
```

### [ ] P1.9 Adopt a calm guided-utility UI theme

Refresh the landing, intake, progress, and report presentation using the visual
and interaction principles demonstrated by the
[Lovable Cloud to Supabase Exporter](https://dreamlit.ai/tools/lovable-cloud-to-supabase-exporter).
Use it as a design reference, not as a source of copied brand assets, product
copy, or components. Preserve Scaleproof's product boundary, report contract,
deterministic scoring, privacy constraints, and three-action founder brief.

Main differences to resolve:

| Area | Current Scaleproof UI | Target adaptation |
| --- | --- | --- |
| Visual stance | Editorial technical dossier with cream paper, serif display type, hard black rules, and an oversized verdict stamp | Calm guided technical utility with a light canvas, restrained typography, soft borders, rounded cards, and signal-orange emphasis |
| Entry flow | Large split hero and intake panel compete for the first viewport | Compact value statement, one dominant repository action, a short prerequisites card, and a visible path to the result |
| Interaction model | Form followed by a dense long-form dossier | Progressive `Repository -> Evidence -> Three actions` state model with task-oriented cards and contextual help |
| Hierarchy | Dramatic headings and several visually equal report sections | Moderate headings, generous whitespace, summary first, three actions second, expandable evidence last |
| Trust | Methodology and privacy prose carry most of the trust load | Keep those claims, then reinforce them with concise prerequisites, explicit automated-snapshot language, safe processing states, and evidence locations |
| Mobile | Large type and dense grids create wrapping pressure | One-column cards, compact controls, predictable spacing, and readable repository labels |

Design direction:

- Aesthetic: **calm guided technical utility**.
- Purpose: let a busy founder understand the input, start a scan, recognize the
  current phase, and reach the verdict plus three actions without learning the
  scoring system first.
- Differentiation anchor: a persistent but compact
  `Repository -> Evidence -> Three actions` rail. With the logo removed, this
  rail and the evidence-linked action cards should still identify Scaleproof.
- DFII: aesthetic impact 3, context fit 5, implementation feasibility 4,
  performance safety 5, consistency risk 2; total **15**.

Design system:

- Reuse the bundled Newsreader and Manrope fonts. Use Manrope for operational
  UI and body copy; reserve Newsreader for the hero promise and verdict so the
  interface becomes calmer without losing Scaleproof's identity.
- Replace the paper texture and full-page center rule with a light neutral
  canvas, white/off-white cards, soft gray dividers, signal orange for the
  primary action and current state, and the existing green/red semantics only
  for verified positive and concrete negative results.
- Define the theme through CSS variables. Use one spacing rhythm, consistent
  10-16 pixel card radii, subtle one-level shadows, and no decorative gradients
  or animation.
- Motion is limited to real phase changes, disclosure expansion, and focus or
  hover feedback. Respect `prefers-reduced-motion`.

Implementation:

1. Refactor the global theme tokens and the landing/report CSS modules without
   adding a component library, new font, animation package, or global state
   manager.
2. Replace the split campaign hero with a centered, bounded introduction and a
   prominent scan card. Keep the public GitHub root URL as the first interactive
   element and keep the synthetic demo visibly secondary.
3. Add a compact prerequisites/trust card using only established facts: one
   public repository, no account, scanned code is not executed, and the result
   is an automated snapshot rather than an audit. Do not copy the reference's
   testimonials, usage counts, sign-in, pricing, booking links, or sales CTAs.
4. Implement P1.5 radio choices inside the new card system. Optional context
   must remain visibly optional and must not delay the repository scan.
5. Render the `Repository -> Evidence -> Three actions` rail on intake,
   processing, and report states. Every displayed phase must correspond to a
   real application state; do not invent percentages, durations, or completed
   phases.
6. Recompose the report so the first viewport contains the repository label,
   automated-snapshot qualifier, verdict, score/confidence/coverage summary,
   and a clear route to the three actions. Keep the three actions prominent and
   move domain detail and the evidence dossier into calm, accessible disclosure
   cards below them.
7. Keep `Download .md` and `New scan` available without using a large sticky
   header that covers focused evidence. Preserve keyboard focus when opening a
   supporting check and add the required scroll margin for sticky UI.
8. Complete V.1 in the same change: prefer a line break after the repository
   owner separator and retain emergency wrapping only for an overlong segment.
9. Preserve safe evidence locations, all 13 SaaS checks, the three-action cap,
   cancellation, error recovery, and every existing API/report contract.
10. Update the Playwright journey to save desktop and 390 x 844 screenshots for
    the landing, selected context, processing state, report summary, actions,
    and evidence dossier.

Acceptance:

- The repository URL and primary Analyze action are visible in the first
  desktop viewport and remain easy to reach at 390 x 844.
- The visual hierarchy is value -> repository -> optional context -> progress
  -> verdict -> three actions -> evidence; methodology never competes with the
  first action.
- The new theme uses a light neutral canvas, soft cards, restrained typography,
  orange primary emphasis, and consistent spacing without copying Dreamlit or
  Lovable branding.
- The progress rail reports only real states and remains understandable without
  color.
- The report still exposes the same deterministic verdict, scores, coverage,
  three actions, checks, privacy boundary, Markdown download, and new-scan
  behavior.
- The demo repository label renders as `scaleproof/` plus `demo-startup`; no
  tested label or control creates horizontal overflow.
- Keyboard navigation, focus visibility, semantic headings, disclosure
  controls, form labels, contrast, reduced motion, and 44-pixel touch targets
  remain valid.
- No account, analytics, testimonial, contact capture, booking link, sales CTA,
  copied asset, new font, or new runtime UI dependency is introduced.
- Saved desktop and mobile screenshots show no covered content, clipped labels,
  accidental horizontal scrolling, or inconsistent old-theme sections.
- `npm run verify` passes.

Validation:

```bash
npm run test:e2e
npm run verify
```

### [ ] V.1 Keep repository labels readable on mobile

At 390 x 844, `scaleproof/demo-startup` wraps as `scaleproof/d` plus
`emo-startup` because the report title uses `overflow-wrap: anywhere`.

Implementation:

1. Add a preferred soft break after the GitHub owner separator.
2. Keep an emergency break only for a genuinely overlong owner or repository
   segment.
3. Do not reduce the report title below the established mobile type scale.

Acceptance:

- The demo label renders as `scaleproof/` plus `demo-startup`.
- Long labels cannot create horizontal overflow.
- The saved 390 x 844 Playwright screenshot shows the corrected title and the
  report download remains visible.

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

Verified on 2026-07-20 after the seventh implementation review:

- Lint and TypeScript 6 and 7 passed.
- `npm test`: 13 Vitest files / 113 tests passed.
- `npm run build`: webpack production build passed.
- `npm run test:e2e`: all 7 Playwright journeys passed from a fresh local
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
- Seven final-viewport screenshots were reviewed; V.1 is the only remaining
  visual anomaly.
- `git diff --check` passed.
