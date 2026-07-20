import { describe, expect, it } from "vitest";

import type { RepositorySnapshot } from "@/lib/repository/types";
import { evaluateControls } from "./controls";
import { buildControlInventory } from "./control-inventory";
import type { ScanContext } from "./types";

const CONTEXT: ScanContext = {
  stage: "scaling_production",
  dataSensitivity: "basic_personal",
  growthTarget: "users_10x",
};

const SAAS_RULE_INVENTORY = [
  ["saas.stateless-tier", "reliability", "high"],
  ["saas.database-discipline", "reliability", "high"],
  ["saas.slow-work", "reliability", "high"],
  ["saas.failure-safety", "reliability", "critical"],
  ["saas.config-boundary", "security", "medium"],
  ["saas.tenant-isolation", "security", "critical"],
  ["saas.observability", "operations", "high"],
  ["saas.feature-flags", "quality", "medium"],
  ["saas.ci-test-gate", "quality", "high"],
  ["saas.critical-bus-factor", "architecture", "high"],
  ["saas.written-decisions", "architecture", "medium"],
  ["saas.dependency-freshness", "quality", "info"],
  ["saas.critical-test-distribution", "quality", "high"],
] as const;

const EMPTY_REPOSITORY_STATES = [
  ["saas.stateless-tier", "unknown", "absent"],
  ["saas.database-discipline", "not_applicable", "absent"],
  ["saas.slow-work", "not_applicable", "absent"],
  ["saas.failure-safety", "not_applicable", "absent"],
  ["saas.config-boundary", "unknown", "absent"],
  ["saas.tenant-isolation", "not_applicable", "absent"],
  ["saas.observability", "unknown", "absent"],
  ["saas.feature-flags", "unknown", "absent"],
  ["saas.ci-test-gate", "not_applicable", "absent"],
  ["saas.critical-bus-factor", "not_applicable", "absent"],
  ["saas.written-decisions", "unknown", "absent"],
  ["saas.dependency-freshness", "unknown", "runtime_only"],
  ["saas.critical-test-distribution", "not_applicable", "absent"],
] as const;

function snapshot(files: RepositorySnapshot["files"]): RepositorySnapshot {
  return {
    repositoryLabel: "synthetic/saas-audit",
    sourceUrl: null,
    files,
    coverage: {
      discoveredRelevantFiles: files.length,
      processedRelevantFiles: files.length,
      skippedBinaryFiles: 0,
      skippedOversizedFiles: 0,
      unprocessedRelevantFiles: 0,
      processedTextBytes: files.reduce((total, file) => total + file.size, 0),
      durationMs: 1,
      partial: false,
      limitsCrossed: [],
    },
    detectedStacks: ["Node.js / TypeScript"],
    history: {
      source: "synthetic",
      availability: "available",
      repository: {
        scope: "Repository",
        sampledCommits: 10,
        attributedCommits: 10,
        activeContributors: 3,
        estimatedBusFactor: 2,
        topContributorShare: 50,
        sampleWindowDays: 90,
        band: "Distributed",
      },
      modules: [],
      note: "Synthetic anonymous aggregate.",
    },
  };
}

function checks(files: RepositorySnapshot["files"], context = CONTEXT) {
  return evaluateControls(snapshot(files), context).filter((check) =>
    check.id.startsWith("saas."),
  );
}

describe("SaaS 10x audit lens", () => {
  it("registers all thirteen source-audit rules with typed inventory metadata", () => {
    const result = checks([]);
    const inventory = buildControlInventory(evaluateControls(snapshot([]), CONTEXT))
      .filter((entry) => entry.id.startsWith("saas."));

    expect(result).toHaveLength(13);
    expect(inventory).toHaveLength(SAAS_RULE_INVENTORY.length);
    expect(inventory.map((entry) => [entry.id, entry.domain, entry.severity])).toEqual(
      SAAS_RULE_INVENTORY,
    );
    for (const entry of inventory) {
      expect(entry).toMatchObject({
        applicability: expect.any(String),
        requiredSignals: expect.any(Array),
        disqualifyingSignals: expect.any(Array),
        evidenceTier: expect.any(String),
        confidenceLimitation: expect.any(String),
        remediationCode: expect.any(String),
      });
      expect(entry.requiredSignals.length).toBeGreaterThan(0);
      expect(entry.disqualifyingSignals.length).toBeGreaterThan(0);
      expect(entry.confidenceLimitation.length).toBeGreaterThan(20);
    }
  });

  it("keeps every rule neutral when its required repository evidence is absent", () => {
    const result = checks([]);

    expect(
      result.map((check) => [check.id, check.outcome, check.evidenceTier]),
    ).toEqual(EMPTY_REPOSITORY_STATES);
  });

  it("reports concrete scaling risks only from direct static evidence", () => {
    const result = checks([
      {
        path: "src/session.ts",
        content: "const sessions = new Map(); sessions.set(session, user);",
        size: 60,
      },
      {
        path: "src/api/route.ts",
        content: "export async function POST() { return fetch(url); }",
        size: 58,
      },
      {
        path: "src/users.ts",
        content: "repository.findAll();",
        size: 22,
      },
      {
        path: "db/migrations/001.sql",
        content: "create table users(id uuid);",
        size: 28,
      },
      {
        path: "src/config.ts",
        content: 'const API_URL = "https://internal.example.net";',
        size: 48,
      },
    ]);

    expect(result.find((check) => check.id === "saas.stateless-tier")).toMatchObject({
      outcome: "fail",
      severity: "high",
    });
    expect(result.find((check) => check.id === "saas.database-discipline")).toMatchObject({
      outcome: "fail",
      severity: "high",
    });
    expect(result.find((check) => check.id === "saas.slow-work")).toMatchObject({
      outcome: "fail",
      severity: "high",
    });
    expect(result.find((check) => check.id === "saas.failure-safety")).toMatchObject({
      outcome: "fail",
      severity: "critical",
    });
    expect(result.find((check) => check.id === "saas.config-boundary")).toMatchObject({
      outcome: "fail",
      severity: "medium",
    });
  });

  it("recognizes bounded, centrally isolated, and observable SaaS evidence", () => {
    const result = checks([
      {
        path: "src/client.ts",
        content:
          "fetch(url, { signal: AbortSignal.timeout(1000) }); const key = idempotencyKey;",
        size: 86,
      },
      {
        path: "src/data.ts",
        content:
          "const page: Pageable = request;",
        size: 36,
      },
      {
        path: "db/migrations/001.sql",
        content: "create table users(id uuid); create index users_email on users(email);",
        size: 70,
      },
      {
        path: "src/config.ts",
        content: "const url = process.env.API_URL;",
        size: 32,
      },
      {
        path: "deploy/application.yaml",
        content: "database:\n  maximum-pool-size: 20",
        size: 34,
      },
      {
        path: "src/tenant/repository.ts",
        content: "@Filter(name = tenantContext) const tenant_id = context.id;",
        size: 63,
      },
      {
        path: "src/observability.ts",
        content: "prometheus metrics; const correlation_id = request.headers.get('x-request-id');",
        size: 82,
      },
      {
        path: "src/flags.ts",
        content: "const featureFlag = process.env.NEW_CHECKOUT;",
        size: 50,
      },
      {
        path: ".github/workflows/ci.yml",
        content: "on: pull_request\nsteps: - run: npm test",
        size: 41,
      },
      {
        path: "docs/adr/001-scaling.md",
        content: "# Decision",
        size: 10,
      },
      {
        path: "src/auth/login.ts",
        content: "export const login = true;",
        size: 26,
      },
      {
        path: "src/auth/login.test.ts",
        content: "it('rejects anonymous access', () => {});",
        size: 42,
      },
      {
        path: "src/tenant/repository.test.ts",
        content: "it('isolates tenants', () => {});",
        size: 34,
      },
      {
        path: "package-lock.json",
        content: "{}",
        size: 2,
      },
    ]);

    for (const id of [
      "saas.database-discipline",
      "saas.failure-safety",
      "saas.config-boundary",
      "saas.tenant-isolation",
      "saas.observability",
      "saas.feature-flags",
      "saas.ci-test-gate",
      "saas.written-decisions",
      "saas.critical-test-distribution",
    ]) {
      expect(result.find((check) => check.id === id)).toMatchObject({
        outcome: "pass",
      });
    }
    expect(
      result.find((check) => check.id === "saas.dependency-freshness"),
    ).toMatchObject({
      outcome: "unknown",
      evidenceTier: "runtime_only",
    });
  });

  it("excludes bounded SQL, fixtures, and non-state file writes while keeping client safety local", () => {
    const result = checks([
      {
        path: "src/users.ts",
        content: "const sql = 'SELECT * FROM users LIMIT 20';",
        size: 48,
      },
      {
        path: "db/migrations/001.sql",
        content: "create table users(id uuid); create index users_id on users(id);",
        size: 66,
      },
      {
        path: "src/export.ts",
        content: "export async function exportReport() { return fs.writeFile('report.csv', body); }",
        size: 82,
      },
      {
        path: "fixtures/route.ts",
        content: "fetch('https://fixture.internal'); const password = 'not-a-real-secret';",
        size: 77,
      },
      {
        path: "src/http/axios-client.ts",
        content: "const client = axios.create({ timeout: 1000 }); const idempotencyKey = key;",
        size: 79,
      },
      {
        path: "src/api/route.ts",
        content: "export async function POST() { return fetch(url); }",
        size: 58,
      },
      {
        path: ".github/workflows/ci.yml",
        content: "on: pull_request\nsteps: - run: npm test",
        size: 41,
      },
      {
        path: "src/auth/login.ts",
        content: "export const login = true;",
        size: 26,
      },
      {
        path: "src/webhooks/process.ts",
        content: "export const processWebhook = true;",
        size: 44,
      },
      {
        path: "src/auth/login.test.ts",
        content: "it('rejects anonymous access', () => {});",
        size: 42,
      },
    ]);

    expect(result.find((check) => check.id === "saas.database-discipline")).not.toMatchObject({
      outcome: "fail",
    });
    expect(result.find((check) => check.id === "saas.stateless-tier")).toMatchObject({
      outcome: "unknown",
    });
    expect(result.find((check) => check.id === "saas.config-boundary")).toMatchObject({
      outcome: "unknown",
    });
    expect(result.find((check) => check.id === "saas.failure-safety")).toMatchObject({
      outcome: "fail",
      severity: "critical",
      evidence: [{ path: "src/api/route.ts" }],
    });
    expect(result.find((check) => check.id === "saas.ci-test-gate")).toMatchObject({
      outcome: "pass",
    });
    expect(result.find((check) => check.id === "saas.critical-test-distribution")).toMatchObject({
      outcome: "unknown",
    });
  });

  it("recognizes structured logging independently from correlation IDs", () => {
    const result = checks([
      {
        path: "src/observability.ts",
        content: "prometheus metrics; const logger = pino();",
        size: 48,
      },
    ]);

    expect(result.find((check) => check.id === "saas.observability")).toMatchObject({
      outcome: "pass",
      evidenceTier: "enforced",
    });
  });

  it("reports only direct database and tenant query risks", () => {
    const result = checks([
      {
        path: "src/orders.ts",
        content: "for (const id of ids) { await repository.findById(id); }",
        size: 64,
      },
      {
        path: "src/search.ts",
        content: "const sql = 'SELECT * FROM users WHERE email = ? LIMIT 20';",
        size: 68,
      },
      {
        path: "src/tenant/users.ts",
        content: "const tenant_id = context.id; repository.findAll();",
        size: 58,
      },
      {
        path: "db/migrations/001.sql",
        content: "create table users(id uuid, tenant_id uuid); create index users_id on users(id);",
        size: 84,
      },
    ]);

    const database = result.find((check) => check.id === "saas.database-discipline");
    expect(database).toMatchObject({ outcome: "fail" });
    expect(database?.evidence).toContainEqual(
      expect.objectContaining({ path: "src/orders.ts" }),
    );
    expect(result.find((check) => check.id === "saas.tenant-isolation")).toMatchObject({
      outcome: "fail",
      severity: "critical",
      evidence: [{ path: "src/tenant/users.ts" }],
    });
  });

  it("evaluates SQL per statement and recognizes SQL-migration indexes", () => {
    const result = checks([
      {
        path: "src/queries.ts",
        content:
          "const queries = 'SELECT * FROM users LIMIT 20; SELECT * FROM audit_events';",
        size: 82,
      },
      {
        path: "db/migrations/001.sql",
        content: "create table users(id uuid); create index users_id on users(id);",
        size: 66,
      },
    ]);

    expect(result.find((check) => check.id === "saas.database-discipline")).toMatchObject({
      outcome: "fail",
      evidence: [{ path: "src/queries.ts" }],
    });

    const bounded = checks([
      {
        path: "src/queries.ts",
        content: "const query = 'SELECT * FROM users LIMIT 20';",
        size: 52,
      },
      {
        path: "db/migrations/001.sql",
        content: "create table users(id uuid); create index users_id on users(id);",
        size: 66,
      },
    ]);
    expect(bounded.find((check) => check.id === "saas.database-discipline")).toMatchObject({
      outcome: "pass",
    });
  });

  it("does not accept tenant-isolation prose as executable enforcement", () => {
    const result = checks([
      {
        path: "README.md",
        content: "TODO: no row level security is configured yet.",
        size: 48,
      },
      {
        path: "src/tenant/users.ts",
        content: "const tenant_id = context.id; repository.findAll();",
        size: 58,
      },
      {
        path: "db/migrations/001.sql",
        content: "create table users(id uuid, tenant_id uuid);",
        size: 48,
      },
    ]);

    expect(result.find((check) => check.id === "saas.tenant-isolation")).toMatchObject({
      outcome: "fail",
      severity: "critical",
    });
  });

  it("requires a merge-candidate workflow and every critical area to have tests", () => {
    const result = checks([
      {
        path: ".github/workflows/ci.yml",
        content: "on:\n  push:\n    branches: [main]\nsteps: - run: npm test",
        size: 60,
      },
      {
        path: "src/auth/login.ts",
        content: "export const login = true;",
        size: 26,
      },
      {
        path: "src/auth/login.test.ts",
        content: "it('rejects anonymous access', () => {});",
        size: 42,
      },
      {
        path: "src/webhooks/process.ts",
        content: "export const processWebhook = true;",
        size: 44,
      },
    ]);

    expect(result.find((check) => check.id === "saas.ci-test-gate")).toMatchObject({
      outcome: "unknown",
    });
    expect(result.find((check) => check.id === "saas.critical-test-distribution")).toMatchObject({
      outcome: "unknown",
      summary: expect.stringContaining("webhook"),
    });
  });

  it("limits ownership concentration findings to a detected critical module", () => {
    const repository = snapshot([
      {
        path: "src/auth/login.ts",
        content: "export const login = true;",
        size: 26,
      },
    ]);
    repository.history.modules = [
      {
        scope: "src/auth",
        sampledCommits: 10,
        attributedCommits: 10,
        activeContributors: 2,
        estimatedBusFactor: 1,
        topContributorShare: 80,
        sampleWindowDays: 90,
        band: "High concentration",
      },
      {
        scope: "src/marketing",
        sampledCommits: 10,
        attributedCommits: 10,
        activeContributors: 1,
        estimatedBusFactor: 1,
        topContributorShare: 100,
        sampleWindowDays: 90,
        band: "High concentration",
      },
    ];

    const result = evaluateControls(repository, CONTEXT).find(
      (check) => check.id === "saas.critical-bus-factor",
    );
    expect(result).toMatchObject({ outcome: "fail", severity: "high" });
  });

  it("does not score critical-area ownership when no critical source area exists", () => {
    const result = checks([
      {
        path: "src/marketing/page.ts",
        content: "export const page = true;",
        size: 26,
      },
    ]);

    expect(result.find((check) => check.id === "saas.critical-bus-factor")).toMatchObject({
      outcome: "not_applicable",
      evidenceTier: "absent",
    });
  });

  it("detects common Axios and supported Go client forms", () => {
    const axios = checks([
      {
        path: "src/api/route.ts",
        content: "export async function POST() { return axios.post(url, body); }",
        size: 68,
      },
    ]);
    expect(axios.find((check) => check.id === "saas.failure-safety")).toMatchObject({
      outcome: "fail",
      evidence: [{ path: "src/api/route.ts" }],
    });

    const go = checks([
      {
        path: "src/handler.go",
        content: "func handler() { http.DefaultClient.Timeout = time.Second; http.DefaultClient.Do(request); idempotencyKey := key }",
        size: 120,
      },
    ]);
    expect(go.find((check) => check.id === "saas.failure-safety")).toMatchObject({
      outcome: "pass",
    });
  });

  it("does not share timeout evidence across unrelated clients of the same library", () => {
    const result = checks([
      {
        path: "src/billing-client.ts",
        content: "export const charge = () => axios.post(url, body, { timeout: 1000 });",
        size: 78,
      },
      {
        path: "src/analytics-client.ts",
        content: "export const track = () => axios.post(url, event);",
        size: 58,
      },
    ]);

    expect(result.find((check) => check.id === "saas.failure-safety")).toMatchObject({
      outcome: "fail",
      severity: "critical",
      evidence: [{ path: "src/analytics-client.ts" }],
    });
  });

  it("associates configured Axios instance calls with same-file configuration", () => {
    const bounded = checks([
      {
        path: "src/billing-client.ts",
        content:
          "const billing = axios.create({ timeout: 1000 }); export const charge = () => billing.post(url, body); const idempotencyKey = key;",
        size: 124,
      },
    ]);
    expect(bounded.find((check) => check.id === "saas.failure-safety")).toMatchObject({
      outcome: "pass",
    });

    const unbounded = checks([
      {
        path: "src/analytics-client.ts",
        content:
          "const analytics = axios.create(); export const track = () => analytics.post(url, event);",
        size: 82,
      },
    ]);
    expect(unbounded.find((check) => check.id === "saas.failure-safety")).toMatchObject({
      outcome: "fail",
      severity: "critical",
      evidence: [{ path: "src/analytics-client.ts" }],
    });
  });

  it("does not share timeout or idempotency evidence between Axios instances in one file", () => {
    const result = checks([
      {
        path: "src/clients.ts",
        content:
          "const billing = axios.create({ timeout: 1000 }); const analytics = axios.create({ baseURL: url }); export const charge = () => billing.post(url, body, { idempotencyKey }); export const track = () => analytics.post(url, event);",
        size: 214,
      },
    ]);

    expect(result.find((check) => check.id === "saas.failure-safety")).toMatchObject({
      outcome: "fail",
      severity: "critical",
      evidence: [{ path: "src/clients.ts" }],
    });
  });

  it("does not use the rendered evidence cap to pass incomplete client safety", () => {
    const boundedClients = Array.from({ length: 4 }, (_, index) => ({
      path: `src/client-${index}.ts`,
      content:
        "export const call = () => axios.post(url, body, { timeout: 1000 }); const idempotencyKey = key;",
      size: 98,
    }));
    const result = checks([
      ...boundedClients,
      {
        path: "src/client-unprotected.ts",
        content: "export const call = () => axios.post(url, body, { timeout: 1000 });",
        size: 72,
      },
    ]);

    expect(result.find((check) => check.id === "saas.failure-safety")).toMatchObject({
      outcome: "unknown",
      evidenceTier: "absent",
    });
  });

  it("does not treat a CI command as a test gate when the repository has no visible tests", () => {
    const result = checks([
      {
        path: ".github/workflows/ci.yml",
        content: "on: pull_request\nsteps: - run: npm test",
        size: 41,
      },
    ]);

    expect(result.find((check) => check.id === "saas.ci-test-gate")).toMatchObject({
      outcome: "unknown",
      evidenceTier: "absent",
    });
  });

  it("keeps tenant, feature-flag, and dependency rules neutral when static applicability is unavailable", () => {
    const result = checks([], {
      ...CONTEXT,
      stage: "unknown",
    });

    expect(result.find((check) => check.id === "saas.tenant-isolation")).toMatchObject({
      outcome: "not_applicable",
    });
    expect(result.find((check) => check.id === "saas.feature-flags")).toMatchObject({
      outcome: "unknown",
      evidenceTier: "runtime_only",
    });
    expect(
      result.find((check) => check.id === "saas.dependency-freshness"),
    ).toMatchObject({
      outcome: "unknown",
      evidenceTier: "runtime_only",
    });
  });

  it("reports retained dependency manifests without claiming dependency EOL", () => {
    const result = checks([
      { path: "package.json", content: '{"name":"app"}', size: 14 },
      { path: "go.mod", content: "module example.com/app", size: 22 },
      { path: "pyproject.toml", content: "[project]", size: 9 },
    ]);

    expect(result.find((check) => check.id === "saas.dependency-freshness")).toMatchObject({
      outcome: "unknown",
      evidenceTier: "runtime_only",
      evidence: [{ path: "package.json" }, { path: "go.mod" }, { path: "pyproject.toml" }],
    });
  });
});
