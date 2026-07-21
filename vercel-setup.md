# Vercel Hobby preview deployment

Updated: 2026-07-21

This guide deploys Scaleproof as a protected hackathon Preview Deployment. It
does not authorize or describe an unrestricted public production launch. See
[`TASKS.md`](./TASKS.md) and the
production gate in [`SECURITY.md`](./SECURITY.md#production-gate).

## Verified state

The first successful remote deployment established that:

- Next.js 16.2.10 compiled, type-checked, generated pages, and packaged the
  `/api/analyze` Function successfully.
- `vercel inspect` reported `target preview` and `status Ready`.
- Explicit `--target=preview` is required for this project. The first bare
  `npx vercel@latest` invocation unexpectedly created a Production target.
- The `.next/lock` packaging failure is fixed by the route-specific exclusions
  in [`next.config.ts`](./next.config.ts).

Two settings were not yet proven by that deployment:

- `vercel project inspect scaleproof` still reported Node.js `24.x`; change the
  project setting to `22.x`.
- deployment inspection showed Function outputs in `iad1`; change the Function
  region to Frankfurt (`fra1`) and redeploy before final acceptance.

Do not mark D.2 complete until those settings, deployment protection, and the
smoke test below pass.

## Constraints

- Use Hobby only for a personal, non-commercial hackathon demo. Commercial use
  requires Pro. See [Vercel Fair Use](https://vercel.com/docs/limits/fair-use-guidelines).
- Use a protected Preview Deployment. Hobby Standard Protection does not
  protect the production domain. Do not use `--prod`, promote the deployment,
  or attach a custom domain. See
  [Deployment Protection](https://vercel.com/docs/deployment-protection).
- Configure only `OPENAI_API_KEY`. Do not add `GITHUB_TOKEN`, analytics,
  persistent storage, Upstash, or other integrations.

## 1. Prepare the repository

The repository must retain these settings:

```json
"engines": {
  "node": "^22.11.0"
}
```

```gitignore
.vercel/
```

The analysis route also excludes transient Next.js lock state from its output
trace:

```ts
outputFileTracingExcludes: {
  "/api/analyze": ["./.next/lock", "./.next/dev/**/*"],
},
```

Run the complete local gate before deployment:

```bash
npm install --package-lock-only
npm run verify
```

## 2. Link the Vercel project

Create or sign in to a personal Hobby account, then run:

```bash
npx vercel@latest login
npx vercel@latest link
```

Use:

- personal Hobby scope;
- project name `scaleproof`;
- source directory `.`;
- Next.js framework preset.

## 3. Configure the project

Open `scaleproof -> Settings` in Vercel.

Under **Build and Deployment**:

- Framework Preset: `Next.js`
- Root Directory: `.`
- Node.js Version: `22.x`
- Build and output overrides: disabled

Under **Functions**:

- Function Region: `Frankfurt, Germany (fra1)`
- Fluid Compute: enabled

Verify the visible project settings:

```bash
npx vercel@latest project inspect scaleproof
```

The result must report Node.js `22.x`. Hobby supports one Function region; see
[Vercel region configuration](https://vercel.com/docs/functions/configuring-functions/region).
The analysis route uses the Node.js runtime and a 120-second maximum duration,
which is within current Fluid Compute limits. See
[Vercel Function limits](https://vercel.com/docs/functions/limitations).

## 4. Configure the secret and protection

Under **Settings -> Environment Variables**, add:

```text
Name: OPENAI_API_KEY
Value: the real project key
Environment: Preview
```

Never prefix it with `NEXT_PUBLIC_`. Environment changes apply only to later
deployments. See
[Vercel environment variables](https://vercel.com/docs/environment-variables).

Under **Settings -> Deployment Protection**:

1. Enable Vercel Authentication.
2. Select Standard Protection.
3. Save.

## 5. Deploy explicitly to Preview

Always make the target explicit:

```bash
npx vercel@latest deploy --target=preview --force
```

Do not use bare `npx vercel@latest` for this project and never use `--prod`.
Expected output includes:

```text
Preview  https://scaleproof-...vercel.app
```

## 6. Inspect the deployment

Use the URL returned by the deployment:

```bash
npx vercel@latest inspect <preview-url>
```

Required result:

```text
target  preview
status  Ready
```

The deployment command's JSON may show `target: null`; the subsequent
`vercel inspect` result is the acceptance check. Inspect the Function output
region as well. If it still shows `[iad1]`, Frankfurt has not been applied;
correct the Function setting and redeploy.

For a failed deployment, retrieve the full build log with:

```bash
npx vercel@latest inspect <deployment-url> --logs
```

## 7. Create and test the shareable link

In Vercel:

1. Open **Deployments** and select the Ready Preview Deployment.
2. Click **Share**.
3. Select **Anyone with the link**.
4. Copy the complete generated URL.

Hobby permits one shareable link per account. See
[Shareable Links](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/sharable-links).

Use an incognito browser to verify:

1. The plain preview URL requires Vercel authentication.
2. The complete shareable link opens the app.
3. The built-in synthetic demo produces a report within 120 seconds.
4. Markdown download, cancellation, and **New scan** work.
5. Runtime logs contain no repository URL, name, source, path, credential, or
   contributor information.

Do not use a real repository unless a full real-repository test is explicitly
requested.

## 8. Troubleshoot `.next/lock`

The original remote build completed but failed during Vercel's
`onBuildComplete` packaging step with:

```text
ENOENT: no such file or directory, lstat '/vercel/path0/.next/lock'
```

The route's output trace had captured Next.js's temporary build lock because
the analysis Function performs dynamic filesystem scanning. The
`outputFileTracingExcludes` configuration above is the fix. Do not create a
dummy lock file or delete unrelated build output.

After a local production build, confirm the trace no longer contains the lock:

```bash
node -e 'const path=require("node:path");const m=path.resolve(".next/server/app/api/analyze/route.js.nft.json");const f=require(m).files;const hit=f.some(x=>path.resolve(path.dirname(m),x)===path.resolve(".next/lock"));console.log(`route trace references .next/lock: ${hit}`);if(hit)process.exit(1)'
```

Expected result:

```text
route trace references .next/lock: false
```

## 9. Update or shut down

For later changes:

```bash
git pull
npm run verify
npx vercel@latest deploy --target=preview --force
```

After the demo:

- revoke the shareable link;
- rotate the OpenAI key;
- delete or pause the project if it is no longer needed;
- monitor the Vercel Usage page while it remains active.
