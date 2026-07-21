import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { RepositorySnapshot } from "@/lib/repository/types";
import { selectDeterministicActions } from "./actions";
import { analyzeSnapshot } from "./analyze";
import { evaluateControls } from "./controls";
import { createRepositoryIndex, hasIncompleteSourceReachability } from "./signals";
import type { ScanContext } from "./types";
import { scanDirectory } from "@/lib/repository/scanner";

const CONTEXT: ScanContext = {
  stage: "scaling_production",
  dataSensitivity: "basic_personal",
  growthTarget: "users_10x",
};

function snapshot(files: Array<{ path: string; content: string }>): RepositorySnapshot {
  return {
    repositoryLabel: "synthetic/p0-8",
    sourceUrl: null,
    files: files.map((file) => ({ ...file, size: file.content.length })),
    coverage: {
      discoveredRelevantFiles: files.length,
      processedRelevantFiles: files.length,
      skippedBinaryFiles: 0,
      skippedOversizedFiles: 0,
      unprocessedRelevantFiles: 0,
      processedTextBytes: files.reduce((total, file) => total + file.content.length, 0),
      durationMs: 1,
      partial: false,
      limitsCrossed: [],
    },
    detectedStacks: ["Node.js / TypeScript"],
    history: {
      source: "synthetic",
      availability: "unavailable",
      repository: {
        scope: "Repository",
        sampledCommits: 0,
        attributedCommits: 0,
        activeContributors: 0,
        estimatedBusFactor: null,
        topContributorShare: null,
        band: "Insufficient evidence",
      },
      modules: [],
      note: "Synthetic fixture.",
    },
  };
}

function check(files: Array<{ path: string; content: string }>, id: string) {
  const result = evaluateControls(snapshot(files), CONTEXT).find((candidate) => candidate.id === id);
  expect(result, `missing ${id}`).toBeDefined();
  return result!;
}

describe("P0.8 scanner evidence hardening", () => {
  it("detects credential-shaped configuration values without retaining them in evidence", () => {
    const secret = "sb_secret_abcdefghijklmnopqrstuvwxyz123456";
    const serviceRoleJwt = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.cccccccccccc";
    const result = check([
      { path: ".env.production", content: `SUPABASE_SERVICE_ROLE_KEY=${secret}` },
      { path: ".vscode/settings.json", content: `{ "serviceToken": "${serviceRoleJwt}" }` },
    ], "security.exposed-secret");

    expect(result).toMatchObject({ outcome: "fail", severity: "critical" });
    expect(result.evidence.map((reference) => reference.path)).toEqual([
      ".env.production",
      ".vscode/settings.json",
    ]);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain(serviceRoleJwt);

    const draft = analyzeSnapshot(snapshot([
      { path: ".env.production", content: `SUPABASE_ANON_KEY=${secret}` },
    ]), CONTEXT);
    expect(draft.verdict).not.toBe("Fundable");
    expect(selectDeterministicActions(draft.checks)[0]).toMatchObject({
      remediationCode: "remove-exposed-secret",
    });

    const publicClientCredentials = check([
      { path: ".env.production", content: "SUPABASE_ANON_KEY=sb_publishable_abcdefghijklmnopqrstuvwxyz123456" },
      { path: ".env.local", content: "SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.cccccccccccc" },
    ], "security.exposed-secret");
    expect(publicClientCredentials).toMatchObject({ outcome: "pass", evidenceTier: "inferred" });
  });

  it("covers every supported secret family without retaining a matched value", () => {
    const secretFamilies = [
      ["config/private.pem", "-----BEGIN PRIVATE KEY-----\nsynthetic"],
      ["config/cloud.env", "AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF"],
      ["config/github.env", `GITHUB_TOKEN=ghp_${"a".repeat(32)}`],
      ["config/openai.env", `OPENAI_API_KEY=sk-${"a".repeat(32)}`],
      ["config/app.env", `INTERNAL_API_KEY=${"a".repeat(24)}`],
    ] as const;

    for (const [path, value] of secretFamilies) {
      const result = check([{ path, content: value }], "security.exposed-secret");
      expect(result).toMatchObject({ outcome: "fail", severity: "critical" });
      expect(result.evidence.map((reference) => reference.path)).toEqual([path]);
      expect(JSON.stringify(result)).not.toContain(value);
    }
  });

  it("carries admitted dotenv and private-key text through scanner-to-analysis without returning a value", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "scaleproof-p0-8-"));
    const dotenvSecret = `SERVICE_ROLE_TOKEN=${"a".repeat(24)}`;
    const pemSecret = "-----BEGIN PRIVATE KEY-----\nsynthetic-pem";
    const keySecret = "-----BEGIN RSA PRIVATE KEY-----\nsynthetic-key";
    try {
      await writeFile(path.join(root, ".env"), dotenvSecret);
      await writeFile(path.join(root, "private.pem"), pemSecret);
      await writeFile(path.join(root, "private.key"), keySecret);
      const scanned = await scanDirectory({
        root,
        repositoryLabel: "synthetic/secret-acquisition",
        sourceUrl: null,
      });
      const result = evaluateControls(scanned, CONTEXT).find(
        (check) => check.id === "security.exposed-secret",
      );

      expect(result).toMatchObject({ outcome: "fail", severity: "critical" });
      expect(result?.evidence.map((reference) => reference.path)).toEqual(
        expect.arrayContaining([".env", "private.pem", "private.key"]),
      );
      const rendered = JSON.stringify(result);
      expect(rendered).not.toContain(dotenvSecret);
      expect(rendered).not.toContain(pemSecret);
      expect(rendered).not.toContain(keySecret);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails an unsafe Supabase Edge Function and accepts a bounded authenticated equivalent", () => {
    const unsafe = check([
      { path: "supabase/config.toml", content: "[functions.ask]\nverify_jwt = false" },
      {
        path: "supabase/functions/ask/index.ts",
        content: "Deno.serve(async (request) => { console.log(request.body); return fetch('https://api.openai.com/v1/responses', { headers: { 'Access-Control-Allow-Origin': '*' } }); });",
      },
    ], "security.edge-function-boundary");
    expect(unsafe).toMatchObject({ outcome: "fail", severity: "critical" });

    const secured = check([
      { path: "supabase/config.toml", content: "[functions.ask]\nverify_jwt = true" },
      {
        path: "supabase/functions/ask/index.ts",
        content: "Deno.serve(async (request) => { const authorization = request.headers.get('authorization'); if (!authorization || request.headers.get('content-length') > '4096') return new Response('bad', { status: 400, headers: { 'Access-Control-Allow-Origin': 'https://app.example.com' } }); return fetch('https://api.openai.com/v1/responses', { signal: AbortSignal.timeout(5000) }); });",
      },
    ], "security.edge-function-boundary");
    expect(secured).toMatchObject({ outcome: "pass", evidenceTier: "enforced" });

    const headerOnly = check([
      {
        path: "supabase/functions/ask/index.ts",
        content: "Deno.serve(async (request) => { const authorization = request.headers.get('authorization'); if (!authorization || request.headers.get('content-length') > '4096') return new Response('bad', { headers: { 'Access-Control-Allow-Origin': 'https://app.example.com' } }); return fetch('https://api.openai.com/v1/responses', { signal: AbortSignal.timeout(5000) }); });",
      },
    ], "security.edge-function-boundary");
    expect(headerOnly).toMatchObject({ outcome: "unknown", evidenceTier: "absent" });
  });

  it("reports browser API paths with no handler and accepts a matching Next route", () => {
    const missing = check([
      { path: "src/client.ts", content: "fetch('/api/insights')" },
    ], "security.client-route-reachability");
    expect(missing).toMatchObject({ outcome: "fail", severity: "high" });

    const matched = check([
      { path: "src/client.ts", content: "fetch('/api/insights')" },
      { path: "src/app/api/insights/route.ts", content: "export async function GET() { return Response.json({ ok: true }); }" },
    ], "security.client-route-reachability");
    expect(matched).toMatchObject({ outcome: "pass", evidenceTier: "enforced" });

    const shadowed = check([
      { path: "src/client.ts", content: "fetch('/api/insights')" },
      { path: "src/app/api/insights/route.ts", content: "export async function GET() { return Response.json({ ok: true }); }" },
      { path: "vercel.json", content: '{ "rewrites": [{ "source": "/api/insights", "destination": "/index.html" }] }' },
    ], "security.client-route-reachability");
    expect(shadowed).toMatchObject({ outcome: "fail", severity: "high" });

    for (const [path, content] of [
      ["vercel.json", '{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }'],
      ["vercel.json", '{ "rewrites": [{ "source": "/:path*", "destination": "/index.html" }] }'],
      ["_redirects", "/* /index.html 200"],
    ]) {
      const catchAll = check([
        { path: "src/client.ts", content: "fetch('/api/insights')" },
        { path: "src/app/api/insights/route.ts", content: "export async function GET() { return Response.json({ ok: true }); }" },
        { path, content },
      ], "security.client-route-reachability");
      expect(catchAll).toMatchObject({ outcome: "fail", severity: "high" });
    }

    const apiExcludedFromFallback = check([
      { path: "src/client.ts", content: "fetch('/api/insights')" },
      { path: "src/app/api/insights/route.ts", content: "export async function GET() { return Response.json({ ok: true }); }" },
      { path: "vercel.json", content: '{ "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }] }' },
    ], "security.client-route-reachability");
    expect(apiExcludedFromFallback).toMatchObject({ outcome: "pass", evidenceTier: "enforced" });

    const netlifyApiRulePrecedesFallback = check([
      { path: "src/client.ts", content: "fetch('/api/insights')" },
      { path: "src/app/api/insights/route.ts", content: "export async function GET() { return Response.json({ ok: true }); }" },
      { path: "_redirects", content: "/api/* /.netlify/functions/:splat 200\n/* /index.html 200" },
    ], "security.client-route-reachability");
    expect(netlifyApiRulePrecedesFallback).toMatchObject({ outcome: "pass", evidenceTier: "enforced" });

    const normalized = check([
      { path: "src/client.ts", content: "fetch('/api/insights/')" },
      { path: "src/app/api/insights/route.ts", content: "export async function GET() { return Response.json({ ok: true }); }" },
    ], "security.client-route-reachability");
    expect(normalized).toMatchObject({ outcome: "pass", evidenceTier: "enforced" });

    const dynamic = check([
      { path: "src/client.ts", content: "fetch('/api/users/123')" },
      { path: "src/app/api/users/[id]/route.ts", content: "export async function GET() { return Response.json({ ok: true }); }" },
    ], "security.client-route-reachability");
    expect(dynamic).toMatchObject({ outcome: "pass", evidenceTier: "enforced" });

    const documentationMention = check([
      { path: "README.md", content: "Call fetch('/api/insights') after setup." },
    ], "security.client-route-reachability");
    expect(documentationMention).toMatchObject({ outcome: "not_applicable", evidenceTier: "absent" });
  });

  it("does not credit generated artifacts or unwired tests as implementation evidence", () => {
    const generated = snapshot([
      { path: "dist/session.js", content: "const sessions = new Map();" },
      { path: "playwright-report/result.spec.ts", content: "test('looks covered', () => {});" },
    ]);
    const checks = evaluateControls(generated, CONTEXT);
    expect(checks.find((candidate) => candidate.id === "saas.stateless-tier")).toMatchObject({ outcome: "unknown" });
    expect(checks.find((candidate) => candidate.id === "quality.tests")).toMatchObject({ outcome: "unknown", evidenceTier: "absent" });

    const unreachable = evaluateControls(snapshot([
      { path: "src/main.ts", content: "export const app = true;" },
      { path: "src/features/orphan.ts", content: "const session = new Map(); const schema = zod.object({});" },
    ]), CONTEXT);
    expect(unreachable.find((candidate) => candidate.id === "saas.stateless-tier")).toMatchObject({ outcome: "unknown" });
    expect(unreachable.find((candidate) => candidate.id === "security.validation")).toMatchObject({ outcome: "unknown", evidenceTier: "absent" });

    const dependencyOnly = check([
      { path: "tests/example.test.ts", content: "it('works', () => {});" },
      { path: "package.json", content: '{ "devDependencies": { "vitest": "latest" } }' },
      { path: "pyproject.toml", content: '[tool.pytest.ini_options]\ntestpaths = ["tests"]' },
    ], "quality.tests");
    expect(dependencyOnly).toMatchObject({ outcome: "unknown", evidenceTier: "absent" });

    const wired = check([
      { path: "src/example.test.ts", content: "it('works', () => {});" },
      { path: "package.json", content: '{ "scripts": { "test": "vitest run" } }' },
    ], "quality.tests");
    expect(wired).toMatchObject({ outcome: "pass", evidenceTier: "enforced" });

    const ciWired = check([
      { path: "tests/test_example.py", content: "def test_works(): assert True" },
      { path: ".github/workflows/ci.yml", content: "jobs:\n  test:\n    steps:\n      - run: pytest" },
    ], "quality.tests");
    expect(ciWired).toMatchObject({ outcome: "pass", evidenceTier: "enforced" });
  });

  it("resolves configured aliases and excludes orphaned Next App Router files", () => {
    const aliasReachable = evaluateControls(snapshot([
      { path: "tsconfig.json", content: '{ "compilerOptions": { "paths": { "@/*": ["src/*"] } } }' },
      { path: "src/main.ts", content: 'import { schema } from "@/features/live"; export { schema };' },
      { path: "src/features/live.ts", content: "export const schema = zod.object({ name: zod.string() });" },
    ]), CONTEXT);
    expect(aliasReachable.find((candidate) => candidate.id === "security.validation")).toMatchObject({
      outcome: "pass",
      evidenceTier: "enforced",
    });

    const appRouter = evaluateControls(snapshot([
      { path: "src/main.ts", content: "export const app = true;" },
      { path: "src/app/features/orphan.tsx", content: "const session = new Map(); const schema = zod.object({});" },
      { path: "src/app/page.tsx", content: "const schema = zod.object({}); export default function Page() { return null; }" },
    ]), CONTEXT);
    expect(appRouter.find((candidate) => candidate.id === "saas.stateless-tier")).toMatchObject({ outcome: "unknown" });
    expect(appRouter.find((candidate) => candidate.id === "security.validation")).toMatchObject({
      outcome: "pass",
      evidenceTier: "enforced",
    });

    const nestedIndex = evaluateControls(snapshot([
      { path: "src/main.ts", content: "export const app = true;" },
      { path: "src/features/orphan/index.ts", content: "const schema = zod.object({});" },
    ]), CONTEXT);
    expect(nestedIndex.find((candidate) => candidate.id === "security.validation")).toMatchObject({
      outcome: "unknown",
      evidenceTier: "absent",
    });

    const incompleteSnapshot = snapshot([
      { path: "src/main.ts", content: "import './missing'; export const app = true;" },
      { path: "src/features/live.ts", content: "export const schema = zod.object({});" },
      { path: "src/features/orphan.ts", content: "const session = new Map(); const schema = zod.object({});" },
    ]);
    const incomplete = evaluateControls(incompleteSnapshot, CONTEXT);
    expect(hasIncompleteSourceReachability(createRepositoryIndex(incompleteSnapshot))).toBe(true);
    expect(incomplete.find((candidate) => candidate.id === "arch.source-reachability")).toMatchObject({
      outcome: "unknown",
      evidenceTier: "runtime_only",
    });
    expect(incomplete.find((candidate) => candidate.id === "security.validation")).toMatchObject({
      outcome: "unknown",
      evidenceTier: "absent",
    });
    expect(incomplete.find((candidate) => candidate.id === "saas.stateless-tier")).toMatchObject({
      outcome: "unknown",
    });
  });

  it("requires a runner compatible with each test file ecosystem", () => {
    const pythonWithVitest = check([
      { path: "tests/test_example.py", content: "def test_works(): assert True" },
      { path: "package.json", content: '{ "scripts": { "test": "vitest run" } }' },
    ], "quality.tests");
    expect(pythonWithVitest).toMatchObject({ outcome: "unknown", evidenceTier: "absent" });

    const javascriptWithPytest = check([
      { path: "src/example.test.ts", content: "it('works', () => {});" },
      { path: ".github/workflows/ci.yml", content: "jobs:\n  test:\n    steps:\n      - run: pytest" },
    ], "quality.tests");
    expect(javascriptWithPytest).toMatchObject({ outcome: "unknown", evidenceTier: "absent" });
  });

  it("keeps Supabase evidence scoped to each function and matching config section", () => {
    const partialBoundary = check([
      { path: "supabase/config.toml", content: "[functions.ask]\nverify_jwt = true\n[functions.helper]\nverify_jwt = true" },
      { path: "supabase/functions/ask/index.ts", content: "return fetch('https://api.openai.com/v1/responses', { headers: { 'Access-Control-Allow-Origin': 'https://app.example.com' } });" },
      { path: "supabase/functions/helper/index.ts", content: "const limit = 4096; const timeout = AbortSignal.timeout(5000);" },
    ], "security.edge-function-boundary");
    expect(partialBoundary).toMatchObject({ outcome: "unknown", evidenceTier: "absent" });

    const mixedFunctions = check([
      { path: "supabase/config.toml", content: "[functions.safe]\nverify_jwt = true\n[functions.unsafe]\nverify_jwt = false" },
      { path: "supabase/functions/safe/index.ts", content: "const limit = 4096; return fetch('https://api.openai.com/v1/responses', { signal: AbortSignal.timeout(5000), headers: { 'Access-Control-Allow-Origin': 'https://app.example.com' } });" },
      { path: "supabase/functions/unsafe/index.ts", content: "console.log(request.body); return fetch('https://api.openai.com/v1/responses', { headers: { 'Access-Control-Allow-Origin': '*' } });" },
    ], "security.edge-function-boundary");
    expect(mixedFunctions).toMatchObject({ outcome: "fail", severity: "critical" });
    expect(mixedFunctions.evidence.map((reference) => reference.path)).toEqual([
      "supabase/functions/unsafe/index.ts",
      "supabase/config.toml",
    ]);
  });
});
