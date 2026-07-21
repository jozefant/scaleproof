# Vercel Hobby protected deployment

Updated: 2026-07-21

Scaleproof may use either a Preview or Production deployment target for the
controlled hackathon demo. The security boundary is Vercel Deployment
Protection, not the target label. This guide does not authorize an unrestricted
public launch; that remains blocked on the production gate in
[`SECURITY.md`](./SECURITY.md#production-gate).

## Verified live state

Verified with Vercel CLI 56.4.1 on 2026-07-21:

- Stable protected URL: <https://scaleproof-six.vercel.app>
- Deployment URL:
  <https://scaleproof-hcwhbgelx-jozefas-projects.vercel.app>
- Deployment `dpl_3h3RCxah9rCBkSfrEnPYhqf3tVTu`: Production, `Ready`
- Project runtime: Node.js `22.x`
- Function region: `iad1`
- Environment: only encrypted `OPENAI_API_KEY`, scoped to Preview and Production
- Invalid protection bypass: HTTP `302` to Vercel authentication
- Authenticated homepage: HTTP `200`
- Synthetic analysis: HTTP `200` in 6.07 seconds; GPT-5.6 succeeded on the first
  attempt and returned exactly three actions
- Runtime logs: only privacy-safe OpenAI operation metadata; no scanned
  repository identifier, path, source text, contributor identity, or secret

The `.next/lock` packaging failure is fixed by the route-specific exclusions in
[`next.config.ts`](./next.config.ts).

## Constraints

- Use Hobby only for the personal, non-commercial hackathon demo. Commercial
  use requires Pro. See [Vercel Fair Use](https://vercel.com/docs/limits/fair-use-guidelines).
- Keep every active Preview or Production URL protected. Do not disable
  protection or attach an unrestricted custom domain.
- Configure only `OPENAI_API_KEY`. Do not add `GITHUB_TOKEN`, analytics,
  persistent storage, Upstash, or other integrations.
- Do not use a real repository for routine verification. Use the synthetic demo
  unless a full real-repository test is explicitly requested.

## 1. Prepare and verify locally

The repository must retain the Node.js baseline in `package.json`:

```json
"engines": {
  "node": "^22.11.0"
}
```

It must ignore `.vercel/` and exclude transient Next.js state from the analysis
Function output trace:

```ts
outputFileTracingExcludes: {
  "/api/analyze": ["./.next/lock", "./.next/dev/**/*"],
},
```

Run:

```bash
npm ci
npm run verify
```

## 2. Link and configure the project

```bash
npx vercel@latest login
npx vercel@latest link
npx vercel@latest project inspect scaleproof
```

Required project settings:

- Scope: personal Hobby account
- Framework: Next.js
- Root directory: `.`
- Node.js: `22.x`
- Function region: `iad1`
- Fluid Compute: enabled
- Build and output overrides: disabled

The analysis route uses the Node.js runtime and a 120-second maximum duration.
See [Vercel Function limits](https://vercel.com/docs/functions/limitations).

## 3. Configure the secret and protection

In **Settings -> Environment Variables**, add encrypted `OPENAI_API_KEY` for
every target that may be used: Preview, Production, or both. Never prefix it
with `NEXT_PUBLIC_`. Environment changes apply only to later deployments.

In **Settings -> Deployment Protection**, enable Vercel Authentication and keep
the selected protection method active. Invited testers need an authorized
Vercel account or a revocable shareable link.

## 4. Deploy

Choose either target explicitly:

```bash
# Preview
npx vercel@latest deploy --target=preview --force

# Production target; it must remain protected
npx vercel@latest deploy --prod --force
```

Do not infer protection from `Preview` or `Production`. Test the resulting URL.

## 5. Inspect and test with Vercel CLI

Find and inspect the active deployment:

```bash
npx vercel@latest ls scaleproof
npx vercel@latest inspect https://scaleproof-six.vercel.app
npx vercel@latest env ls
```

Required evidence:

- status is `Ready`;
- the Function output is in `iad1`;
- the project reports Node.js `22.x`;
- only encrypted `OPENAI_API_KEY` is present for the active target.

Verify that an invalid bypass cannot enter:

```bash
npx vercel@latest curl / \
  --deployment https://scaleproof-six.vercel.app \
  --protection-bypass invalid -- --silent --show-error --head
```

Expected result: HTTP `302` redirect to Vercel authentication.

Verify authorized access. The CLI obtains or generates a deployment-protection
bypass token for the signed-in Vercel account:

```bash
npx vercel@latest curl / \
  --deployment https://scaleproof-six.vercel.app \
  -- --silent --show-error --head
```

Expected result: HTTP `200`.

Run the built-in synthetic analysis through the deployed API:

```bash
npx vercel@latest curl /api/analyze \
  --deployment https://scaleproof-six.vercel.app -- \
  --silent --show-error --max-time 150 --request POST \
  --header 'Accept: application/x-ndjson' \
  --header 'Content-Type: application/json' \
  --data '{"source":"demo","context":{"stage":"unknown","dataSensitivity":"unknown","growthTarget":"unknown"}}'
```

Acceptance: HTTP `200`, one schema-valid report, no more than three actions,
and `report.ai.source` equal to `gpt-5.6`.

Inspect recent logs after the request:

```bash
npx vercel@latest logs \
  --deployment https://scaleproof-six.vercel.app \
  --since 15m --limit 50 --json
```

Logs may contain correlation ID, provider, operation, attempt, duration,
outcome, status class, provider error code, and retry decision. They must not
contain a scanned repository identifier, path, source text, contributor
identity, or secret.

## 6. Troubleshoot `.next/lock`

The original remote build completed but failed during Vercel packaging with:

```text
ENOENT: no such file or directory, lstat '/vercel/path0/.next/lock'
```

The route trace had captured temporary Next.js build state. The
`outputFileTracingExcludes` setting above is the fix. Do not create a dummy lock
file or delete unrelated build output.

For a failed deployment:

```bash
npx vercel@latest inspect <deployment-url> --logs
```

## 7. Rotate or shut down

After the demo:

- revoke the shareable link or remove invited access;
- rotate the OpenAI key;
- delete or pause the project if it is no longer needed;
- monitor the Vercel Usage page while it remains active.
