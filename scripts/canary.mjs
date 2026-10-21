#!/usr/bin/env node
/**
 * Live production canary for the analysis route.
 *
 * Purpose
 *   Run one real demo scan against a deployment and fail when the full
 *   pipeline does not produce a valid report. Unit tests use a fake model, so
 *   they cannot see a contract change in a real model response. This canary
 *   can see it.
 *
 * Prerequisites
 *   CANARY_URL                       Deployment origin, for example
 *                                    https://scaleproof-six.vercel.app
 *   VERCEL_AUTOMATION_BYPASS_SECRET  Required when Deployment Protection is on.
 *                                    Vercel: Settings -> Deployment Protection
 *                                    -> Protection Bypass for Automation.
 *
 * Usage
 *   CANARY_URL=https://scaleproof-six.vercel.app node ./scripts/canary.mjs
 *
 * Cost
 *   One demo scan makes one OpenAI request. The demo needs no GitHub download.
 *
 * Output
 *   Status, duration, heuristic version and action codes only. The demo is a
 *   synthetic repository, and no report text is printed.
 *
 * Exit codes
 *   0  The scan returned a valid report.
 *   1  The scan failed, timed out, or returned an invalid report.
 *   2  The canary is not configured.
 */

const TIMEOUT_MS = 130_000;
const REQUEST = {
  source: "demo",
  context: {
    stage: "live_early",
    dataSensitivity: "basic_personal",
    growthTarget: "users_10x",
  },
};

function log(message) {
  console.log(`${new Date().toISOString()} [canary] ${message}`);
}

async function main() {
  const origin = process.env.CANARY_URL?.trim();
  if (!origin) {
    log("CANARY_URL is not set.");
    return 2;
  }
  const headers = { "content-type": "application/json" };
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (bypass) headers["x-vercel-protection-bypass"] = bypass;

  const startedAt = Date.now();
  let response;
  try {
    response = await fetch(new URL("/api/analyze", origin), {
      method: "POST",
      headers,
      body: JSON.stringify(REQUEST),
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    log(`request failed: ${error instanceof Error ? error.name : "unknown error"}`);
    return 1;
  }
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  log(`status ${response.status} in ${seconds}s`);

  let body;
  try {
    body = await response.json();
  } catch {
    log(
      response.status === 401 || (response.status >= 300 && response.status < 400)
        ? "the response is not JSON; Deployment Protection probably blocked the request."
        : "the response is not JSON.",
    );
    return 1;
  }
  if (response.status === 401 || response.status === 403) {
    log("Deployment Protection blocked the request. Check VERCEL_AUTOMATION_BYPASS_SECRET.");
    return 1;
  }
  if (response.status !== 200) {
    // The route returns fixed, privacy-safe error strings.
    log(`error: ${typeof body?.error === "string" ? body.error : "no error message"}`);
    return 1;
  }

  const codes = Array.isArray(body?.actions)
    ? body.actions.map((action) => action?.remediationCode)
    : [];
  const valid =
    typeof body?.heuristicVersion === "string" &&
    typeof body?.verdict === "string" &&
    codes.length >= 1 &&
    codes.length <= 3 &&
    codes.every((code) => typeof code === "string" && code.length > 0);
  log(`heuristic ${body?.heuristicVersion}; actions ${JSON.stringify(codes)}`);
  if (!valid) {
    log("the report does not have the expected shape.");
    return 1;
  }
  log("ok");
  return 0;
}

log("=== Canary started ===");
const code = await main();
log(`=== Done (exit ${code}) ===`);
process.exit(code);
