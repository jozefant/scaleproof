import { describe, expect, it } from "vitest";

import { contextualizeGeneratedHistory, summarizeConcentration } from "@/lib/repository/history";
import type { RepositorySnapshot } from "@/lib/repository/types";

import { evaluateControls } from "./controls";
import { buildControlInventory, reconcileControlOutcomes } from "./control-inventory";
import type { ScanContext } from "./types";

const UNKNOWN_CONTEXT: ScanContext = {
  stage: "unknown",
  dataSensitivity: "unknown",
  growthTarget: "unknown",
};

function lovableSnapshot(): RepositorySnapshot {
  const files = [
    {
      path: "package.json",
      content: '{"devDependencies":{"lovable-tagger":"1.0.0"}}',
      size: 55,
    },
    {
      path: "supabase/migrations/001_init.sql",
      content: "create table notes(id uuid primary key);",
      size: 45,
    },
  ];
  const start = Date.parse("2026-07-01T09:00:00Z");
  const history = contextualizeGeneratedHistory(files, {
    source: "github_recent_commits",
    availability: "available",
    repository: summarizeConcentration(
      "Repository",
      11,
      [...Array<string>(7).fill("lead"), ...Array<string>(4).fill("second")],
      Array.from({ length: 11 }, (_, index) => start + index * 60_000),
    ),
    modules: [],
    note: "History sample.",
  });

  return {
    repositoryLabel: "test/lovable-export",
    sourceUrl: null,
    files,
    coverage: {
      discoveredRelevantFiles: files.length,
      processedRelevantFiles: files.length,
      skippedBinaryFiles: 0,
      skippedOversizedFiles: 0,
      unprocessedRelevantFiles: 0,
      processedTextBytes: files.reduce((sum, file) => sum + file.size, 0),
      durationMs: 10,
      partial: false,
      limitsCrossed: [],
    },
    detectedStacks: ["Node.js / TypeScript"],
    history,
  };
}

function snapshotWithFiles(
  files: RepositorySnapshot["files"],
): RepositorySnapshot {
  const snapshot = lovableSnapshot();
  return {
    ...snapshot,
    files,
    coverage: {
      ...snapshot.coverage,
      discoveredRelevantFiles: files.length,
      processedRelevantFiles: files.length,
      processedTextBytes: files.reduce((sum, file) => sum + file.size, 0),
    },
  };
}

describe("context-sensitive controls", () => {
  it("builds a complete detector-strength inventory for every control", () => {
    const checks = evaluateControls(lovableSnapshot(), UNKNOWN_CONTEXT);
    const inventory = buildControlInventory(checks);

    expect(inventory).toHaveLength(checks.length);
    expect(new Set(inventory.map((entry) => entry.id)).size).toBe(checks.length);
    expect(
      inventory.every(
        (entry) =>
          entry.requiredSignals.length > 0 &&
          entry.disqualifyingSignals.length > 0 &&
          entry.domain.length > 0 &&
          entry.severity.length > 0 &&
          entry.confidenceLimitation.length > 20,
      ),
    ).toBe(true);
    expect(JSON.stringify(inventory)).not.toMatch(
      /DEFAULT_RULE|placeholder|exact versioned evaluator/i,
    );
    expect(
      inventory.find((entry) => entry.id === "rel.failure-controls"),
    ).toMatchObject({
      requiredSignals: [
        "Dependency time bound",
        "Retry, idempotency, circuit-breaker, bulkhead, or backpressure control",
      ],
      disqualifyingSignals: ["One timeout occurrence"],
      remediationCode: "add-failure-controls",
    });
    expect(
      inventory.find((entry) => entry.id === "rel.load-tests"),
    ).toMatchObject({
      evidenceTier: "enforced",
      requiredSignals: [
        "Executable load test, benchmark, command, or enforced performance budget",
      ],
    });
  });

  it("rejects contradictory evaluations of the same factual control", () => {
    const checks = evaluateControls(lovableSnapshot(), UNKNOWN_CONTEXT);
    const authentication = checks.find((check) => check.id === "security.authentication");
    expect(authentication).toBeDefined();
    expect(() => reconcileControlOutcomes([
      ...checks,
      { ...authentication!, outcome: authentication!.outcome === "fail" ? "pass" : "fail" },
    ])).toThrow("Contradictory control outcomes for security.authentication");
  });

  it("does not score initial Lovable-export concentration as a bus-factor failure", () => {
    const checks = evaluateControls(lovableSnapshot(), UNKNOWN_CONTEXT);
    const repositoryBusFactor = checks.find(
      (check) => check.id === "arch.bus-factor-repository",
    );
    const moduleBusFactor = checks.find(
      (check) => check.id === "arch.bus-factor-modules",
    );

    expect(repositoryBusFactor).toMatchObject({
      outcome: "unknown",
      evidenceTier: "runtime_only",
      severity: "info",
    });
    expect(moduleBusFactor).toMatchObject({
      outcome: "unknown",
      evidenceTier: "runtime_only",
      severity: "info",
    });
  });

  it("reports missing recovery evidence without claiming a backup failure", () => {
    const checks = evaluateControls(lovableSnapshot(), UNKNOWN_CONTEXT);
    const backup = checks.find((check) => check.id === "res.backup-restore");
    const restore = checks.find((check) => check.id === "res.restore-recency");

    expect(backup).toMatchObject({
      outcome: "unknown",
      evidenceTier: "absent",
      severity: "high",
      evidence: [],
    });
    expect(restore).toMatchObject({
      outcome: "unknown",
      evidenceTier: "runtime_only",
    });
  });

  it("reserves critical missing-recovery severity for production context", () => {
    const productionChecks = evaluateControls(lovableSnapshot(), {
      ...UNKNOWN_CONTEXT,
      stage: "scaling_production",
    });
    const backup = productionChecks.find(
      (check) => check.id === "res.backup-restore",
    );

    expect(backup?.severity).toBe("critical");
  });

  it("does not treat backup automation alone as tested recovery", () => {
    const snapshot = lovableSnapshot();
    snapshot.files.push({
      path: "scripts/backup.sh",
      content: "pg_dump app > backup.sql",
      size: 24,
    });
    snapshot.coverage.discoveredRelevantFiles += 1;
    snapshot.coverage.processedRelevantFiles += 1;
    const checks = evaluateControls(snapshot, UNKNOWN_CONTEXT);
    const backup = checks.find((check) => check.id === "res.backup-restore");

    expect(backup).toMatchObject({
      outcome: "unknown",
      evidenceTier: "absent",
      summary:
        "Backup evidence was found, but no restore procedure or restore test was visible.",
    });
    expect(backup?.evidence).toEqual([
      {
        path: "scripts/backup.sh",
        kind: "code",
      },
    ]);
  });

  it("does not pass onboarding from a README filename alone", () => {
    const checks = evaluateControls(
      snapshotWithFiles([
        { path: "README.md", content: "# Product overview", size: 18 },
      ]),
      UNKNOWN_CONTEXT,
    );

    expect(checks.find((check) => check.id === "arch.onboarding")).toMatchObject({
      outcome: "unknown",
      evidenceTier: "absent",
    });
  });

  it("does not claim module independence from multiple folders alone", () => {
    const checks = evaluateControls(
      snapshotWithFiles([
        { path: "apps/web/src/a.ts", content: "export {}", size: 9 },
        { path: "services/api/src/a.ts", content: "export {}", size: 9 },
        { path: "packages/shared/src/a.ts", content: "export {}", size: 9 },
      ]),
      UNKNOWN_CONTEXT,
    );

    expect(
      checks.find((check) => check.id === "arch.module-boundaries"),
    ).toMatchObject({
      title: "Module layout signal",
      outcome: "unknown",
      evidenceTier: "absent",
    });
  });

  it("does not pass the dependency-failure policy from one timeout occurrence", () => {
    const checks = evaluateControls(
      snapshotWithFiles([
        {
          path: "src/client.ts",
          content: "fetch(url, { signal: AbortSignal.timeout(1000) });",
          size: 50,
        },
      ]),
      UNKNOWN_CONTEXT,
    );

    expect(
      checks.find((check) => check.id === "rel.failure-controls"),
    ).toMatchObject({
      outcome: "unknown",
      evidenceTier: "absent",
    });
  });

  it("keeps a performance README documented instead of treating it as an executable load test", () => {
    const checks = evaluateControls(
      snapshotWithFiles([
        {
          path: "performance/README.md",
          content:
            "# Performance\nLoad test plan for a representative workload and result.",
          size: 72,
        },
      ]),
      UNKNOWN_CONTEXT,
    );

    expect(checks.find((check) => check.id === "rel.load-tests")).toMatchObject({
      outcome: "pass",
      evidenceTier: "documented",
    });
  });

  it("recognizes an executable load-test fixture as enforced evidence", () => {
    const checks = evaluateControls(
      snapshotWithFiles([
        {
          path: "performance/smoke.k6.js",
          content:
            "import http from 'k6/http'; export default () => http.get('/');",
          size: 68,
        },
      ]),
      UNKNOWN_CONTEXT,
    );

    expect(checks.find((check) => check.id === "rel.load-tests")).toMatchObject({
      outcome: "pass",
      evidenceTier: "enforced",
    });
  });

  it("requires both health and telemetry for the observability surface", () => {
    const checks = evaluateControls(
      snapshotWithFiles([
        {
          path: "src/health.ts",
          content: 'app.get("/healthz", healthHandler);',
          size: 34,
        },
      ]),
      UNKNOWN_CONTEXT,
    );

    expect(
      checks.find((check) => check.id === "ops.observability"),
    ).toMatchObject({
      outcome: "unknown",
      evidenceTier: "absent",
    });
  });

  it("does not treat an authentication dependency as server enforcement", () => {
    const checks = evaluateControls(
      snapshotWithFiles([
        {
          path: "package.json",
          content: '{"dependencies":{"nextauth":"1.0.0"}}',
          size: 39,
        },
      ]),
      { ...UNKNOWN_CONTEXT, dataSensitivity: "basic_personal" },
    );

    expect(
      checks.find((check) => check.id === "security.authentication"),
    ).toMatchObject({
      outcome: "unknown",
      evidenceTier: "absent",
    });
  });

  it("recognizes the minimum composite signals without claiming more", () => {
    const files = [
      {
        path: "README.md",
        content:
          "# Getting started\nInstall dependencies, then run `npm run verify`.",
        size: 70,
      },
      {
        path: "package.json",
        content:
          '{"workspaces":["apps/*","packages/*"],"dependencies":{"nextauth":"1.0.0"}}',
        size: 78,
      },
      { path: "apps/web/package.json", content: '{"name":"web"}', size: 14 },
      {
        path: "packages/domain/package.json",
        content: '{"name":"domain"}',
        size: 17,
      },
      {
        path: "src/auth.ts",
        content: "export async function boundary() { return getServerSession(); }",
        size: 62,
      },
      {
        path: "src/client.ts",
        content:
          "import './auth'; const timeout = AbortSignal.timeout(1000); const idempotency = crypto.randomUUID();",
        size: 88,
      },
      {
        path: "src/health.ts",
        content:
          'app.get("/healthz", healthcheck); register("prometheus metrics");',
        size: 58,
      },
      {
        path: "supabase/migrations/001.sql",
        content: "create table note(id uuid primary key);",
        size: 39,
      },
      {
        path: "scripts/backup.sh",
        content: "pg_dump app > backup.sql",
        size: 24,
      },
      {
        path: "scripts/restore.sh",
        content: "pg_restore --clean backup.sql # restore test fresh database",
        size: 58,
      },
      {
        path: "load/smoke.k6.js",
        content: "import http from 'k6/http'; export default () => http.get('/');",
        size: 68,
      },
    ];
    const checks = evaluateControls(snapshotWithFiles(files), {
      ...UNKNOWN_CONTEXT,
      dataSensitivity: "basic_personal",
    });

    for (const id of [
      "arch.onboarding",
      "arch.module-boundaries",
      "security.authentication",
      "rel.failure-controls",
      "ops.observability",
      "res.backup-restore",
      "rel.load-tests",
    ]) {
      expect(checks.find((check) => check.id === id), id).toMatchObject({
        outcome: "pass",
      });
    }
    expect(
      checks.find((check) => check.id === "arch.module-boundaries")?.summary,
    ).toContain("not proof of low coupling");
  });
});
