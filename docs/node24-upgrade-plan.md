# Node.js 24 upgrade plan (D.3)

Status: **plan only.** No runtime change is applied by this plan. Node.js 22
(`^22.11.0`, `.nvmrc` = `22`) remains the executable baseline until every
verification step below passes and the separate implementation change is
explicitly authorized.

Owner of the whole plan: **Jozef Antony**. Every row below names the owner who
executes it; there is no implicit Node default anywhere in the inventory.

Baseline recorded on 2026-08-24 with local Node.js `v22.21.1`.

## 1. Inventory — every declaration that must change

| # | File / setting | Current value | Required change | Owner | Command | Expected evidence | Rollback step |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | [`package.json`](../package.json) `engines.node` | `^22.11.0` | `^24.0.0` (single supported major after cut-over) | Jozef Antony | edit, then `npm pkg get engines` | `{"node":"^24.0.0"}` | `git revert` the atomic commit; `npm pkg get engines` shows `^22.11.0` |
| 2 | [`.nvmrc`](../.nvmrc) | `22` | `24` | Jozef Antony | edit, then `node -v` after `nvm use` | `v24.x.y` | restore `22`, `nvm use`, `node -v` shows `v22.x` |
| 3 | [`package-lock.json`](../package-lock.json) root `engines` (mirrors `package.json`) | `{"node":"^22.11.0"}` | regenerated to `^24.0.0` | Jozef Antony | `npm install --package-lock-only` | lockfile root `packages[""].engines.node` = `^24.0.0`, `lockfileVersion` still `3` | `git checkout main -- package-lock.json && npm ci` |
| 4 | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) `actions/setup-node` | `node-version-file: .nvmrc` | no edit needed — it follows `.nvmrc` (row 2) | Jozef Antony | inspect the CI log's "Set up Node.js" step | CI log prints Node `v24.x` | reverting row 2 restores CI to 22 automatically |
| 5 | [`.github/workflows/codeql.yml`](../.github/workflows/codeql.yml) | no Node pin (uses the runner default for `javascript-typescript`) | no edit; confirm the analysis still completes | Jozef Antony | re-run the CodeQL workflow | CodeQL run green on the upgrade branch | none required (no pin changed) |
| 6 | Vercel project setting **Node.js Version** | `22.x` | `24.x` | Jozef Antony | Vercel dashboard -> Project -> Settings -> General -> Node.js Version | Settings page reads `24.x`; a fresh deployment's build log header prints Node `v24.x` | set the field back to `22.x` and redeploy the last verified 22 build |
| 7 | Vercel **Functions** region / max duration for `/api/analyze` | `iad1`, 120 s (documented in [`vercel-setup.md`](../vercel-setup.md)) | unchanged — must be re-confirmed after the runtime change, not edited | Jozef Antony | Vercel -> Deployment -> Functions | region `iad1`, max duration 120 s unchanged | none (no change made); if drifted, restore from `vercel-setup.md` |
| 8 | [`vercel-setup.md`](../vercel-setup.md) lines stating `Node.js 22.x` / `^22.11.0` (project runtime, engines snippet, verification checklist) | `22.x` | `24.x` | Jozef Antony | `grep -n "22" vercel-setup.md` | no stale `22.x` runtime claim remains | `git revert` the atomic commit |
| 9 | [`AGENTS.md`](../AGENTS.md) "Use Node.js 22.11 or newer and npm." | 22.11 | 24.x | Jozef Antony | `grep -n "Node.js" AGENTS.md` | line reads the new baseline | `git revert` the atomic commit |
| 10 | [`README.md`](../README.md) prerequisites line | "Node.js 22.11 or newer" | new baseline | Jozef Antony | `grep -n "Node.js" README.md` | line reads the new baseline | `git revert` the atomic commit |
| 11 | [`BUILD_WEEK_SUBMISSION.md`](../BUILD_WEEK_SUBMISSION.md) prerequisites line | "Node.js 22.11 or newer" | new baseline | Jozef Antony | `grep -n "Node.js" BUILD_WEEK_SUBMISSION.md` | line reads the new baseline | `git revert` the atomic commit |
| 12 | [`TASKS.md`](../TASKS.md) P2.3 "bundled Node 22 build" and the D.3 wording | Node 22 | Node 24 once P2.3's CLI target moves | Jozef Antony | `grep -n "Node 22" TASKS.md` | no stale CLI runtime target | `git revert` the atomic commit |
| 13 | CLI package [`cli/package.json`](../cli/package.json) `engines.node` (added by P2.3) | `>=22.11.0` | `>=24.0.0` only if the CLI target moves with the app | Jozef Antony | `npm pkg get engines --prefix cli` | matches the intended CLI baseline | `git revert` the atomic commit |
| 14 | CLI esbuild bundle target (`scripts/build-cli.mjs`, `target: node22`) | `node22` | `node24` only together with row 13 | Jozef Antony | `grep -n "node2" scripts/build-cli.mjs` | bundle target matches the CLI engines range | `git revert` the atomic commit |

No other Node version assumption exists in the repository. Verified with:

```bash
grep -rn "Node.js 22\|node 22\|Node 22\|22\.11\|node-version" \
  --include='*.md' --include='*.yml' --include='*.json' --include='*.ts' . \
  | grep -v node_modules | grep -v package-lock
```

The only remaining match after that sweep is
`src/lib/repository/github.ts` `X-GitHub-Api-Version: 2022-11-28`, which is a
GitHub API date and **must not** be touched.

## 2. Compatibility findings

Recorded from the installed dependency tree on 2026-08-24
(`node -e 'require("<pkg>/package.json").engines'`). These are declared support
ranges, which is what actually blocks `npm ci` under a stricter engine policy.

| Package | Installed | Declared `engines.node` | Node 24 admitted by the declaration? |
| --- | --- | --- | --- |
| `next` | 16.2.11 | `>=20.9.0` | yes |
| `react` / `react-dom` | 19.2.7 | `>=0.10.0` / none | yes |
| `openai` | 6.48.0 | none declared | yes |
| `typescript` (`@typescript/typescript6`) | 6.0.2 | none declared | yes |
| `typescript-7` | 7.0.2 | `>=16.20.0` | yes |
| `vitest` | 4.1.10 | `^20.0.0 \|\| ^22.0.0 \|\| >=24.0.0` | yes — **and it names 24 explicitly** |
| `@playwright/test` | 1.61.1 | `>=18` | yes |
| `eslint` | 9.39.5 | `^18.18.0 \|\| ^20.9.0 \|\| >=21.1.0` | yes |
| `eslint-config-next` | 16.2.10 | none declared | yes |
| `zod` | 4.4.3 | none declared | yes |
| `tar` | 7.5.22 | `>=18` | yes |
| `esbuild` | 0.28.2 | `>=18` | yes |
| `monocart-coverage-reports` | 2.13.0 | none declared | yes |

**Concrete finding: no declared engine range in the dependency tree excludes
Node.js 24.** Note the gap this leaves — a declared range is not a tested
runtime. It rules out an `npm ci` engine rejection; it does not prove runtime
behaviour.

Native / prebuilt-binary dependencies that resolve per platform and therefore
need an explicit install check on the target runtime, not just a range check:

- `sharp` (pinned to `0.35.3` by the root `overrides`) with its `@img/sharp-*`
  and `@img/sharp-libvips-*` platform packages — used by the Next.js image
  pipeline.
- `@next/swc-*` platform binaries.
- `@esbuild/*` platform binaries (added for the CLI bundle and the coverage
  denominator transform).
- `@tailwindcss/oxide` / `lightningcss` platform binaries, if present in the
  resolved tree for the build platform.

**Open items that require network access and were deliberately not guessed
here.** Each must be recorded with its source URL and check date before the
implementation change is authorized:

| Question | How to answer | Owner |
| --- | --- | --- |
| Does Next.js 16.2.x list Node 24 as officially supported (not merely permitted)? | Next.js release notes / upgrade guide for 16.x | Jozef Antony |
| Does Vercel Hobby offer a `24.x` runtime in the project settings dropdown, and is it GA rather than beta? | Vercel dashboard + Vercel Node.js runtime docs | Jozef Antony |
| Any removed/changed Node 24 behaviour touching this codebase (`node:v8` `takeCoverage`, `NODE_V8_COVERAGE`, `node:util.parseArgs`, `node:fs/promises`, `AbortSignal`, `atob`, `fetch`/undici, `node:tar` streams) | Node.js 24 changelog "Semver-Major" entries | Jozef Antony |
| OpenAI SDK 6.x stated Node support floor and ceiling | OpenAI Node SDK README | Jozef Antony |

## 3. Verification gate (must all pass before the change is authorized)

Run every step on Node.js 24, in this order. Do not mix any scanner, scoring,
or UI change into the same branch.

| # | Step | Command | Expected evidence | Owner |
| --- | --- | --- | --- | --- |
| 1 | Clean install | `nvm use 24 && rm -rf node_modules && npm ci` | exits 0; no `EBADENGINE`; no native rebuild failure for `sharp`, `@next/swc-*`, `@esbuild/*` | Jozef Antony |
| 2 | Full gate | `npm run verify` | exits 0 — ESLint, TypeScript 6, TypeScript 7, Vitest, production build, Playwright | Jozef Antony |
| 3 | TypeScript 7 single-threaded | `npm run typecheck:ts7:single` | exits 0 | Jozef Antony |
| 4 | Complete Playwright suite from a fresh server lifecycle | `npm run test:e2e` | all journeys pass; `OPENAI_API_KEY` stays blanked | Jozef Antony |
| 5 | E2E coverage gate | `npm run test:e2e:coverage` | prints `E2E line coverage of src/: NN.N%` at or above the committed gate and exits 0 | Jozef Antony |
| 6 | CLI bundle + focused CLI tests (P2.3) | `npm run build:cli && npm test -- src/cli` | exits 0; `npm pack --dry-run` from `cli/` still lists only launcher, bundle, README, LICENSE | Jozef Antony |
| 7 | Screenshot review | inspect `test-results/**/desktop-*.png` and `**/mobile-*.png` | no desktop or 390 x 844 regression; no clipped title, no horizontal overflow | Jozef Antony |
| 8 | Protected deployment smoke test | deploy the branch to the **protected** Vercel preview with Node 24 selected, then run the synthetic demo through real OpenAI synthesis | a three-action GPT-5.6 report; platform logs contain only privacy-safe external-service diagnostics; no repository identifier, path, source, or contributor data in any log line | Jozef Antony |
| 9 | Latency comparison | record the demo request duration on the Node 22 and Node 24 protected deployments | Node 24 within the accepted band agreed at step 8 | Jozef Antony |

Steps 8 and 9 require an explicit deployment authorization. They are **not**
part of this plan's execution.

## 4. The atomic implementation change

One commit, one pull request, nothing else in it:

- `package.json` `engines.node`
- `.nvmrc`
- `package-lock.json` (regenerated metadata only, via
  `npm install --package-lock-only`)
- `vercel-setup.md`, `AGENTS.md`, `README.md`, `BUILD_WEEK_SUBMISSION.md`,
  `TASKS.md` runtime lines
- `cli/package.json` `engines` and the esbuild `target`, only if the CLI
  baseline moves in the same step

Explicitly **out** of this change: scanner behaviour, scoring, heuristic
version, evidence model, UI, security controls, the categorical OpenAI
allowlist, and any dependency upgrade that is not required by a recorded
concrete incompatibility.

The Vercel **Node.js Version** setting is changed by hand in the dashboard as
part of the same authorized step, immediately before promoting the build — it
is a project setting, not a repository file, so it cannot ride in the commit.

## 5. Rollback

**Trigger — roll back if any one of these is observed after the change lands:**

1. `npm ci` or `npm run verify` fails on Node 24 on any developer machine or in
   CI.
2. The Vercel build fails, or the deployment does not reach **Ready**.
3. `/api/analyze` returns a non-200 for the synthetic demo on the protected
   deployment, or mandatory GPT-5.6 synthesis stops returning a three-action
   report.
4. Demo request latency regresses beyond the band agreed at gate step 8.
5. Any privacy or security regression appears in platform logs — a repository
   identifier, path, source text, contributor identity, or secret.
6. A desktop or 390 x 844 screenshot regression appears.

**Procedure (target: one deployment cycle):**

1. In the Vercel dashboard set **Node.js Version** back to `22.x`.
2. Promote the last verified Node 22 deployment (the 2026-07-21 baseline build
   or later) back to the stable protected URL. Do not wait for a rebuild.
3. `git revert` the atomic commit on `main`; confirm `npm pkg get engines`
   reads `^22.11.0` and `.nvmrc` reads `22`.
4. `nvm use 22 && rm -rf node_modules && npm ci && npm run verify` — must exit 0.
5. Re-run the synthetic demo against the restored deployment and confirm a
   three-action report plus privacy-safe logs only.
6. Record the trigger, the observed evidence, and the restored deployment in
   `TASKS.md` under D.3 before any second attempt.

Node.js 22 remains supported until the authorized production step passes and is
deployed.
