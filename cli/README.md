# Scaleproof CLI

Evidence-based scale readiness for **one public GitHub repository**, from the
terminal. The CLI runs the same pipeline as the Scaleproof web app: strict
public-repository acquisition, deterministic controls and scoring, mandatory
GPT-5.6 action prioritization, and the versioned public report contract.

Every result is an automated snapshot, not an audit or a compliance
certification.

## Requirements

- Node.js 22.11 or newer.
- `OPENAI_API_KEY` exported in the environment. Action prioritization is
  mandatory, so the command cannot produce a report without it.

The CLI accepts **no credentials as flags**.

## Install

```bash
npm install -g scaleproof
```

Or run it without installing:

```bash
npx scaleproof https://github.com/owner/repository
```

## Usage

```bash
export OPENAI_API_KEY=...

# Markdown report on stdout
scaleproof https://github.com/owner/repository

# JSON report on stdout
scaleproof https://github.com/owner/repository --format json

# Answer the founder context questions
scaleproof https://github.com/owner/repository \
  --stage live_early \
  --data-sensitivity basic_personal \
  --growth-target users_10x

# Write the report to a file instead of stdout
scaleproof https://github.com/owner/repository --output report.md
```

### Input

Pass exactly one public GitHub repository **root** URL
(`https://github.com/owner/repository`), or `--demo`. Passing both, passing
neither, or passing more than one URL is a usage error.

Branch, file, issue, and pull-request URLs are rejected. Private repositories,
uploaded archives, local directories, and arbitrary fetch URLs are not
supported and are not planned for this edition.

### Options

| Option | Values | Default |
| --- | --- | --- |
| `--demo` | flag | off |
| `--stage` | `prototype`, `live_early`, `scaling_production`, `unknown`, `withheld` | `unknown` |
| `--data-sensitivity` | `none`, `basic_personal`, `sensitive_regulated`, `unknown`, `withheld` | `unknown` |
| `--growth-target` | `users_10x`, `users_100x`, `engineering_team`, `users_and_team`, `unknown`, `withheld` | `unknown` |
| `--format` | `markdown`, `json` | `markdown` |
| `--output` | file path | stdout |
| `-h`, `--help` | flag | — |
| `-v`, `--version` | flag | — |

`unknown` and `withheld` are neutral. They may lower reported confidence; they
are never treated as a failure.

`--demo` analyzes a small synthetic repository that is compiled into the
command itself. It works from any working directory, needs no files on disk,
and makes no network request during acquisition. Use it to see the report shape
before scanning a real repository.

### Streams

- **stdout** carries the report, the help text, and the version. Nothing else.
- **stderr** carries progress lines and allowlisted external-service
  diagnostics. It never contains the repository URL, repository name, file
  paths, source text, commit data, contributor identities, or credentials.

Piping stdout to a file or to `jq` is therefore safe:

```bash
scaleproof https://github.com/owner/repository --format json | jq '.verdict'
```

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | A complete report was produced. |
| `1` | The scan started but could not complete. Retrying may succeed. |
| `2` | The invocation or environment is wrong. Retrying identically will not help. |
| `130` | The scan was cancelled with `Ctrl+C`. |

The report is rendered only after the analysis returns a schema-valid result.
An acquisition or synthesis failure can never leave a partial report on stdout
or at the `--output` path.

`Ctrl+C` aborts repository acquisition, deterministic traversal, and any
in-flight prioritization request, then deletes the temporary directory. A
second `Ctrl+C` exits immediately.

## Privacy and limits

- Only public GitHub repository root URLs are accepted.
- The archive is downloaded to an owner-only temporary directory and deleted in
  all cases, including failure and cancellation.
- Archive size, archive entries, extracted text, relevant-file count, and total
  scan time are capped. A partial scan is reported explicitly.
- **No source text, file paths, repository identifiers, secrets, commit data,
  or contributor identities are sent to OpenAI.** The model receives only an
  allowlisted categorical structure and may propose the order of at most three
  deterministic remediation codes. Requests use `store: false`; this is not
  claimed as Zero Data Retention.
- Secret matches report a file location only. The matched value is never
  retained.
- Git-history identities are reduced to one-way opaque keys before analysis;
  only aggregate contributor counts and concentration bands reach the report.

Do not scan a repository that should not already be public. A public repository
can still contain accidentally exposed credentials or personal data; Scaleproof
minimizes handling but cannot make that publication safe.

## Packaging

The published package ships four files: this README, the licence, the
launcher `bin/scaleproof.mjs`, and the single self-contained ESM bundle
`dist/scaleproof.mjs`. `npm pack` lists five, because npm always injects the
manifest `package.json` into every tarball and no `files` entry can exclude it.

- The bundle is produced by esbuild from one entry point and **externalizes no
  dependency**, so the package declares no runtime dependencies.
- The package version and the synthetic `--demo` repository are injected into
  the bundle at build time; nothing is read from a manifest or a fixture
  directory at runtime. `--demo` unpacks its embedded copy into a temporary
  directory, scans it through the same code path as a real repository, and
  deletes that directory in all cases.
- There is no postinstall script, no telemetry, no auto-update check, and no
  platform-specific binary.

## Licence

MIT. See [LICENSE](./LICENSE).

Jozef Antony
