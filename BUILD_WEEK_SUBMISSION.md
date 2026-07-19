# OpenAI Build Week submission record

Last verified against the challenge website: 18 July 2026.

## Primary Codex thread

**Thread/session ID:** `019f74a7-b675-7cb1-896a-2d3f6bc27ef3`

**Reviewer verification thread/session ID:** `019f767c-02f2-7c62-8e23-c3ce1d4794f7`

This is the primary thread where the majority of Scaleproof's core
functionality was built. The [Build Week FAQ](https://openai.devpost.com/details/faqs)
requires the `/feedback` Session ID from that thread.

The reviewer verification thread independently reviewed the architecture and
verified the implementation produced in the primary thread, including the
resulting fixes and completion checks.

Before submission, run `/feedback` in the primary thread and copy the Session
ID shown by Codex into Devpost. The value produced by `/feedback` is the
authoritative submission value; compare it with the primary thread ID above.

## Project

- **Name:** Scaleproof
- **Pitch:** Find out whether your codebase can carry 10x more users and a real
  engineering team.
- **Intended category:** Developer Tools
- **Creator:** Jozef Antony
- **Repository URL:** Pending
- **Deployed app URL:** Optional; pending

## Submission checklist

- [x] Working local application
- [x] README with setup, verification, Codex, and GPT-5.6 usage
- [x] Primary Codex thread ID recorded
- [x] Standalone Git repository initialized with default branch `main`
- [x] GitHub Actions verification gate prepared
- [x] Project licensed under MIT
- [ ] Run `/feedback` in the primary thread and confirm the Session ID
- [ ] Choose the repository visibility
- [ ] Publish the repository; if private, share it with the two judging accounts
- [ ] Record a public YouTube demo shorter than three minutes with audio
- [ ] Show the product, Codex contribution, and GPT-5.6 use in the demo
- [ ] Complete the Devpost description and submitter details
- [ ] Submit before 21 July 2026 at 17:00 PDT / 22 July 2026 at 02:00 CEST

The [challenge page](https://openai.devpost.com/) and
[official rules](https://openai.devpost.com/rules) remain the source of truth.

## First publishing checklist

Keep this project as a standalone repository; do not accidentally add it to a
parent checkout.

Before the first push:

1. Choose public or private judging visibility.
2. Confirm `git rev-parse --show-toplevel` resolves to this project and the
   default branch is `main`.
3. Review `git status --short` for generated files, dependencies, credentials,
   local environments, and unrelated changes.
4. Run `npm ci` and `npm run verify`.
5. Review the complete staged file list before committing or pushing.
6. If private, grant the judging accounts listed by the official rules.

After the first successful `main` build, apply the versioned
`.github/rulesets/main.json` ruleset. The solo-maintainer policy requires the
`verify` status check, resolved conversations, linear history, pull requests
with zero mandatory approvals, no force pushes, and no default-branch deletion.
Allow squash and rebase merges; disable merge commits. Increase approvals and
enable code-owner review when another maintainer joins.

Also enable Dependabot alerts, security updates, secret scanning, push
protection, and private vulnerability reporting when supported by the selected
repository plan. Do not add deployment secrets until deployment is explicitly
approved.
