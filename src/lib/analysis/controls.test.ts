import { describe, expect, it } from "vitest";

import { contextualizeGeneratedHistory, summarizeConcentration } from "@/lib/repository/history";

import { evaluateControls } from "./controls";
import type { RepositorySnapshot, ScanContext } from "./types";

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
      processedTextBytes: files.reduce((sum, file) => sum + file.size, 0),
      durationMs: 10,
      partial: false,
      limitsCrossed: [],
    },
    detectedStacks: ["Node.js / TypeScript"],
    history,
  };
}

describe("context-sensitive controls", () => {
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
});
