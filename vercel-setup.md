## Important constraint

  Use Hobby only for a personal, non-commercial hackathon demo. Vercel requires Pro for commercial use. Vercel Fair Use
  (https://vercel.com/docs/limits/fair-use-guidelines)

  Deploy this as a protected Preview Deployment. Hobby protection does not protect the production domain, so do not run vercel --prod, promote the deployment, or attach
  a custom domain. Deployment Protection (https://vercel.com/docs/deployment-protection)

## 1. Pin Node.js 22

  Change package.json:22 from:

  "node": ">=22.11.0"

  to:

  "node": "^22.11.0"

  The current range may cause Vercel to select Node 24. Supported Node.js versions (https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)

  Also add this to .gitignore:18:

  .vercel/

  Then run:

  npm install --package-lock-only
  npm run verify

  git add package.json package-lock.json .gitignore
  git commit -m "Prepare Vercel preview deployment"
  git push origin main

## 2. Create the Vercel project

  Create or sign into a personal Hobby account at vercel.com (https://vercel.com).

  From the repository directory:

  npx vercel@latest login
  npx vercel@latest link

  Choose:

  - Scope: your personal Hobby account
  - Link existing project: No
  - Project name: scaleproof
  - Source directory: .
  - Framework: Next.js, automatically detected

## 3. Configure the runtime

  In Vercel, open scaleproof → Settings.

  Under Build and Deployment:

  - Framework Preset: Next.js
  - Root Directory: .
  - Node.js Version: 22.x
  - Leave build and output overrides disabled

  Under Functions:

  - Function Region: Frankfurt, Germany (fra1)
  - Confirm Fluid Compute is enabled

  Hobby supports one function region. Vercel region configuration (https://vercel.com/docs/functions/configuring-functions/region)

  The existing src/app/api/analyze/route.ts:6 already uses Node.js and a 120-second maximum duration. Current Fluid Compute limits support that duration. Function limits
  (https://vercel.com/docs/functions/limitations)

## 4. Add the OpenAI key

  Open Settings → Environment Variables and add:

  Name: OPENAI_API_KEY
  Value: your real key
  Environment: Preview

  Do not prefix it with NEXT_PUBLIC_.

  Do not add:

  - GITHUB_TOKEN
  - Analytics
  - Databases or storage
  - Upstash or other integrations

  Environment changes apply only to subsequent deployments. Vercel environment variables (https://vercel.com/docs/environment-variables)

## 5. Enable deployment protection

  Open Settings → Deployment Protection:

  1. Enable Vercel Authentication.
  2. Select Standard Protection.
  3. Save.

  This protects preview and generated deployment URLs. Production domains remain public on Hobby.

## 6. Deploy the preview

  Run:

  npx vercel@latest

  Do not add --prod.

  Vercel will build the app and return a preview URL similar to:

  https://scaleproof-xxxxxxxx.vercel.app

## 7. Create the tester link

  In Vercel:

  1. Open Deployments.
  2. Select the new Preview Deployment.
  3. Click Share.
  4. Select Anyone with the link.
  5. Copy the complete generated URL.

  Hobby permits one shareable link per account. Shareable Links (https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/sharable-links)

## 8. Verify the deployment

  Use an incognito browser:

  1. Open the preview URL without the share parameter—it should require Vercel authentication.
  2. Open the complete shareable link—it should load the app.
  3. Run the built-in synthetic demo.
  4. Confirm the report completes within 120 seconds.
  5. Test Markdown download, cancellation, and New scan.
  6. Check Vercel Runtime Logs for errors.
  7. Confirm logs contain no repository name, URL, source, paths, credentials, or contributor information.

  Do not use a real repository unless you explicitly decide to run the full real-repository test.

## 9. Update or shut down

  To deploy later changes:

  git pull
  npx vercel@latest

  Again, do not use --prod.

  After the demo:

  - Revoke the shareable link.
  - Rotate the OpenAI key.
  - Delete or pause the Vercel project if no longer needed.
  - Monitor the Vercel Usage page while active.
