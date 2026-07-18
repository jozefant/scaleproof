# Security and privacy

Scaleproof treats repository contents as untrusted and potentially sensitive,
even though the hackathon version accepts public repositories only.

## Supported boundary

- Public `https://github.com/owner/repository` root URLs only
- No private repositories, uploaded archives, Git credentials, or arbitrary fetch URLs
- No accounts, cookies, saved scans, database, or analytics SDK
- No source text or repository identifiers sent to OpenAI
- No contributor identities, commit text, commit IDs, or module paths sent to OpenAI
- No claims of security, GDPR, or investment compliance

Do not submit a repository that should not already be public. Public
repositories can still contain accidentally exposed credentials or personal
data; Scaleproof minimizes handling but cannot make that publication safe.

## Implemented controls

- Strict URL parsing prevents arbitrary server-side requests.
- Downloads use fixed GitHub API and codeload hosts.
- Request bodies, compressed and expanded archive size, archive entries,
  extracted text, relevant-file count, and total scan time are capped.
- Path-preserving archive extraction is disabled; symlinks are not followed by the scanner.
- Temporary directories are removed in `finally` after success and failure.
- Secret matches return a file location only; the matched value is never retained in the report.
- Git-history identities are immediately reduced to one-way opaque keys; only
  aggregate contributor counts and concentration bands reach the report.
- OpenAI input uses an explicit allowlist, structured output, a conservative token budget, and `store: false`.
- API responses use `Cache-Control: no-store`.
- Global responses set anti-framing, MIME-sniffing, referrer, opener, and browser-permission headers.
- Credentials are read from process environment variables and never logged.

## Data and log retention

| Data class | Hackathon handling | Retention |
| --- | --- | --- |
| Repository archive and extracted files | Operating-system temporary directory | Deleted when the request ends |
| File content in scanner memory | Current request only | Released when the request ends |
| Evidence locations and result | Returned to the browser | Browser memory only; no server history |
| Git contributor and commit metadata | In-memory aggregation only | Identities and commit text discarded before analysis |
| OpenAI categorical payload | Sent with `store: false` | Subject to the account's OpenAI data controls; not claimed as ZDR |
| Application logs | Framework diagnostics only | Must not include URL, repository name, path, content, token, secret, or personal data |

Production logging, if enabled later, must keep separate:

- operational logs for request state, duration bucket, and anonymous error code;
- security logs for rate-limit and invalid-input events;
- audit logs only if accounts or administrative actions are introduced.

Each log type needs an explicit owner, access boundary, retention period, and
redaction test before production use.

## Production gate

Deployment is deferred. Before exposing Scaleproof publicly:

- add distributed per-IP and global concurrency limits;
- cap platform request duration and temporary disk;
- restrict outbound network access to GitHub and OpenAI endpoints;
- add privacy-safe metrics for success, failure class, limit crossings, and cleanup failures;
- alert on cleanup failure, abnormal archive rejection, elevated errors, and quota exhaustion;
- document incident response, breach handling, and service shutdown;
- verify backup requirements remain `not applicable` while no durable application data exists;
- perform dependency, secret, and application-security scans in CI;
- run restore/recovery exercises for deployment configuration and secrets;
- publish a privacy notice consistent with the actual hosting region and OpenAI account controls.

An in-process rate limiter is intentionally not presented as production
protection because it fails across horizontally scaled or short-lived instances.

## Reporting a vulnerability

Use GitHub private vulnerability reporting after it is enabled for the
repository. Do not include secrets, personal data, or private repository content
in a public issue. Provide only a minimal reproduction using synthetic data.
