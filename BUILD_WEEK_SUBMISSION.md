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

`/feedback` has been run in the primary thread. Copy the Session ID shown by
Codex into Devpost. The value produced by `/feedback` is the authoritative
submission value; compare it with the primary thread ID above.

## Project

- **Name:** Scaleproof
- **Pitch:** Find out whether your codebase can carry 10x more users and a real
  engineering team.
- **Intended category:** Developer Tools
- **Creator:** Jozef Antony
- **Repository URL:** [github.com/jozefant/scaleproof](https://github.com/jozefant/scaleproof)
- **Deployed app URL:** Optional; pending

## Devpost additional information (judges and organizers only)

Enter the following values in Devpost's **Additional info** section.

| Devpost field | Submission value |
| --- | --- |
| Upload a file | No file upload. The public repository contains the complete source, README, verification instructions, and media. |
| Submitter Type | Individual |
| Country of Residence | Slovakia (select **Slovakia**, not **Slovak Republic**) |
| Category | Developer Tools |
| Public or private code repo | https://github.com/jozefant/scaleproof |
| Project URL / credentials | No deployed URL or credentials are required. Use the local test instructions below. |
| `/feedback` Session ID | `019f74a7-b675-7cb1-896a-2d3f6bc27ef3` |

The listed session is the primary Codex session where most implementation was
completed. If `/feedback` displays a different Session ID in that thread, use
the value printed by `/feedback`; it is authoritative.

### Instructions for judges

Scaleproof is a local Next.js application. It requires Node.js 22.11 or newer
and npm; macOS, Linux, and Windows are supported where those prerequisites and
the Playwright browser dependencies are available.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000` and click **Run the synthetic demo**. This is the
recommended judge path: it is deterministic, requires no credentials, does not
scan a live repository, and shows the full report flow. To run the verification
gate instead:

```bash
npm run verify
```

The public README documents how Codex and GPT-5.6 were used. No account,
environment file, API key, or other credentials are needed for the synthetic
demo or verification suite.

## Devpost project story

Paste the following into Devpost's **About the project** field.

```markdown
## Inspiration

Founders need quick technical insight into whether a codebase is ready for
growth. Scaleproof evaluates a public GitHub repository as Fundable, Fixable, or
Rewrite and provides up to three actionable next steps.

## What it does

Scaleproof evaluates architecture, quality, security, observability,
reliability, data resilience, and AI readiness. It checks anonymous contributor
concentration, provides scaling signals, and generates a downloadable report.
It is an automated snapshot rather than an audit, and it keeps missing evidence
separate from verified failures.

## How I built it

Scaleproof uses Next.js and TypeScript with separate repository acquisition,
deterministic analysis, AI synthesis, and report layers. It scans public
repository URLs, applies bounded static checks, aggregates anonymous contributor
data, and creates a schema-validated report. AI may prioritize allowlisted
remediation steps but cannot change deterministic outcomes.

I used Codex in multiple sessions for research, architecture, implementation,
tests, browser QA, documentation, and independent review. The reviewer found
additional defects that were fixed and reverified before release.

## Challenges I faced

Establishing trust was the central challenge. I kept missing evidence separate
from verified issues, bounded all scanning, and prevented repository content
from entering the AI payload.

## What I learned

AI is most useful here for prioritizing constrained, evidence-backed actions,
not replacing technical evaluation. Privacy and transparent evidence states
must be architectural decisions rather than report-writing details.
```

## Built with

Use these Devpost tags:

`TypeScript`, `Next.js`, `React`, `Node.js`, `OpenAI API`, `GPT-5.6`, `Codex`,
`GitHub API`, `GitHub Actions`, `Tailwind CSS`, `Zod`, `Vitest`, `Playwright`,
`ESLint`, `Recharts`, `npm`.

## Devpost links and media

- **Try it out / source:** [github.com/jozefant/scaleproof](https://github.com/jozefant/scaleproof)
- **Demo site:** Pending. Do not enter an invented URL.
- **Video:** Pending public YouTube upload; it must be shorter than three
  minutes and include spoken explanation of both Codex and GPT-5.6 use.
- **Gallery:** Capture 3:2 screenshots from the synthetic demo only: the
  landing/intake page, a completed verdict with the three actions,
  growth-readiness and bus-factor sections, the evidence dossier, and the
  Markdown-download action. Do not use a real scanned repository in public
  screenshots.

## Submission checklist

- [x] Working local application
- [x] README with setup, verification, Codex, and GPT-5.6 usage
- [x] Primary Codex thread ID recorded
- [x] Standalone Git repository initialized with default branch `main`
- [x] GitHub Actions verification gate prepared and passing on `main`
- [x] Project licensed under MIT
- [x] Run `/feedback` in the primary thread and confirm the Session ID
- [x] Repository visibility chosen: public
- [x] Publish the repository (public; judge sharing is not required)
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
