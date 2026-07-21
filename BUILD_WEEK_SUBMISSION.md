# OpenAI Build Week submission record

Submission guidance and materials last reviewed: 21 July 2026.

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

```markdown
##Inspiration  
Founders need quick technical insights on codebases to determine its readiness for growth. Scaleproof provides an instant evaluation of a public GitHub repository, giving a clear guidance, if the codebase is 'Fundable', 'Fixable', or needs a 'Rewrite'.  Scaleproof recommends three actionable steps.

##What it does  
Scaleproof evaluates a GitHub repository in seven areas: architecture, quality, security, observability, reliability, data resilience, and AI readiness. It checks contributor activity and provides signals for scaling, along with a downloadable report. This tool offers a rapid analysis rather than a full audit, keeping missing evidence distinct from failures.

##How I built it  
Scaleproof is developed in Next.js and TypeScript, ensuring a clear separation of functions. It scans public repository URLs, performs static checks, gathers contributor data, and creates a validated report. GPT plays a supportive role, recommending remediation steps without dictating outcomes.

I used Codex in at least two distinct sessions. The primary implementation session runs the research, architecture, implementation, tests, browser QA, and documentation. A separate Codex 'reviewer' session independently reviewed the results. The reviewer repeatedly found additional issues, which implementer fixed. That implementation-and-review loop made the final product more robust than a single-agent pass.

##Challenges I faced
Establishing trust was crucial, so I ensured a clear distinction between missing evidence and verified issues. This was done with Codex/GPT help. The app scoring needs to be ballanced and refined further.

Creating an appealing UI was another hurdle, which I overcame by guiding Codex to mimic a successful design and refining it through testing.

##What I learned
GPT implementer/reviewer combo worked well, as they both used the same task list.
GPT also helped with admin tasks like generating Readme, License files etc.
Clear separation between the repo scan, which is done without AI and the eval, which is GPT's job, is a useful pattern.
```

## Built with

Use these Devpost tags:

`TypeScript`, `Next.js`, `React`, `Node.js`, `OpenAI API`, `GPT-5.6`, `Codex`,
`GitHub API`, `GitHub Actions`, `Tailwind CSS`, `Zod`, `Vitest`, `Playwright`,
`ESLint`, `Recharts`, `npm`.

## Devpost links and media

- **Try it out / source:** [github.com/jozefant/scaleproof](https://github.com/jozefant/scaleproof)
- **Demo site:** Pending. Do not enter an invented URL.
- **Video:** [Scaleproof demo on YouTube](https://youtu.be/QODx74zGVTI).
  Paste this public or unlisted link into Devpost's **Video demo link** field.
  Before submitting, watch it once to confirm clear audio and a spoken
  explanation of what was built, how Codex was used, and how GPT-5.6 was used.
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
- [x] Upload the YouTube demo and paste its link in Devpost: https://youtu.be/QODx74zGVTI
- [ ] Watch the published video: confirm clear voiceover covers the product,
  Codex contribution, and GPT-5.6 use, and that it is no longer than three minutes
- [x] Complete the Devpost description and submitter details
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
