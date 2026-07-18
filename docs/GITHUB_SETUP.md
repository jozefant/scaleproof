# GitHub setup

The versioned GitHub files prepare Scaleproof for a standalone repository:

- `.github/workflows/ci.yml` provides the `verify` status check.
- `.github/rulesets/main.json` contains the proposed `main` branch ruleset.
- `.github/CODEOWNERS` assigns ownership to `@jozefant`.
- `.github/dependabot.yml` groups weekly minor and patch updates.
- `.github/pull_request_template.md` makes evidence and privacy review explicit.

## Publish safely

This project was developed inside a larger checkout and is now initialized as
a standalone Git repository. Keep that repository boundary when publishing so
it is not accidentally added to the parent repository.

Before the first commit:

1. Decide whether the judging repository will be public or private.
2. Confirm that the repository should remain under its MIT License.
3. Confirm `git rev-parse --show-toplevel` resolves to this project and the
   default branch is `main`.
4. Review `git status --short` and confirm that generated files, dependencies,
   credentials, and local environment files are absent.
5. Run `npm ci` and `npm run verify`.
6. Create the GitHub repository, add its remote, commit, and push only after
   reviewing the full staged file list.

For a private submission repository, grant access to
`testing@devpost.com` and `build-week-event@openai.com`.

## Apply the main ruleset

First push `main` and let the `verify` job complete successfully. Then either
import the settings in GitHub under **Settings > Rules > Rulesets**, or apply
the versioned REST payload from the repository root:

```bash
gh api \
  --method POST \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  "repos/{owner}/{repo}/rulesets" \
  --input .github/rulesets/main.json
```

The solo-hackathon rules require:

- a pull request, with zero mandatory approvals;
- the strict `verify` status check;
- resolved review conversations;
- squash or rebase merge;
- linear history;
- no force pushes or default-branch deletion;
- no bypass actors.

Zero approvals is intentional while there is one contributor. Requiring one
would block the sole author from merging.

When another maintainer joins, update the pull-request rule to require one
approval, enable stale-review dismissal, require a code-owner review, and
require approval of the most recent push.

## Repository settings

- Allow squash merge and rebase merge; disable merge commits.
- Set workflow token permissions to read-only by default.
- Enable Dependabot alerts and security updates.
- Enable secret scanning, push protection, and private vulnerability reporting
  when the repository plan supports them.
- Do not add deployment secrets until deployment is explicitly approved.

GitHub status-check rules use the job name, so the required context is exactly
`verify`.
