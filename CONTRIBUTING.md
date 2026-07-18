# Contributing to Scaleproof

## Local setup

Use Node.js 22.11 or newer:

```bash
npm ci
npm run dev
```

No OpenAI key is required for deterministic local operation. If GPT-5.6
synthesis is being tested, provide `OPENAI_API_KEY` through the current process
environment. Never store credentials in repository files.

## Verification

Run the complete local gate before opening or updating a pull request:

```bash
npm run verify
```

The command runs, in order:

1. ESLint
2. TypeScript with no emit
3. Vitest
4. The production Next.js build

GitHub Actions runs the same command on every pull request and every push to
`main`. The required status-check name is `verify`.

## Pull requests

- Keep each pull request focused and explain the founder-visible impact.
- Use synthetic repositories and data in tests and examples.
- Update tests and documentation with behavior changes.
- For scoring changes, update the heuristic version and
  [SCORING.md](./SCORING.md).
- State privacy, security, or data-flow effects explicitly.
- Resolve review conversations before merge.
- Use squash or rebase merge to preserve linear history.

Read [AGENTS.md](./AGENTS.md) for the full product, evidence, privacy, and
verification invariants.
