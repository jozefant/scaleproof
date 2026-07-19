# Scaleproof implementation tasks

Updated: 2026-07-19

This file is the current implementation backlog. Product boundaries belong in
`README.md` and `AGENTS.md`; architecture, scoring, and security decisions
belong in their canonical documents. Git history preserves the detailed
architecture review and resolved reviewer comments that previously lived here.

## Open work

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

## Verification baseline

Verified on 2026-07-19:

- `npm run verify`: ESLint, TypeScript, 12 Vitest files / 91 tests, production
  build, and 7 Playwright tests passed.
- The browser suite passed with an empty key and is protected from a dummy or
  ambient `OPENAI_API_KEY`.
- Seven final-viewport screenshots were reviewed; V.1 is the only remaining
  visual anomaly.
- `git diff --check` passed.
