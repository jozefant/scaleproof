import { describe, expect, it } from "vitest";

import { scoreAnalysis } from "./scoring";
import type { RepositorySnapshot } from "@/lib/repository/types";
import type {
  CheckResult,
  DomainId,
} from "./types";

const DOMAINS: DomainId[] = [
  "architecture",
  "quality",
  "security",
  "operations",
  "reliability",
  "resilience",
  "agent_readiness",
];

function snapshot(partial = false): RepositorySnapshot {
  return {
    repositoryLabel: "test/repository",
    sourceUrl: null,
    files: [
      { path: "src/a.ts", content: "", size: 0 },
      { path: "src/b.ts", content: "", size: 0 },
      { path: "package.json", content: "{}", size: 2 },
    ],
    detectedStacks: ["Node.js / TypeScript"],
    coverage: {
      discoveredRelevantFiles: 10,
      processedRelevantFiles: partial ? 7 : 10,
      skippedBinaryFiles: 0,
      skippedOversizedFiles: 0,
      unprocessedRelevantFiles: partial ? 3 : 0,
      processedTextBytes: 1_000,
      durationMs: 50,
      partial,
      limitsCrossed: partial ? ["file_count"] : [],
    },
    history: {
      source: "unavailable",
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
      note: "No history.",
    },
  };
}

function check(
  domain: DomainId,
  overrides: Partial<CheckResult> = {},
): CheckResult {
  return {
    id: `${domain}.control`,
    domain,
    title: `${domain} control`,
    outcome: "pass",
    evidenceTier: "enforced",
    severity: "medium",
    weight: 1,
    summary: "Evidence found.",
    remediationCode: `${domain}-remediation`,
    evidence: [],
    ...overrides,
  };
}

describe("scoreAnalysis", () => {
  it("allows Fundable only with strong evidence and complete scan coverage", () => {
    const result = scoreAnalysis(
      DOMAINS.map((domain) => check(domain)),
      snapshot(),
    );

    expect(result.score).toBe(100);
    expect(result.confidence).toBe(100);
    expect(result.verdict).toBe("Fundable");
  });

  it("caps a high-scoring repository at Fixable for an isolated critical blocker", () => {
    const checks = DOMAINS.map((domain) => check(domain));
    checks.push(
      check("security", {
        id: "security.exposed-secret",
        outcome: "fail",
        severity: "critical",
        weight: 0.01,
      }),
    );

    const result = scoreAnalysis(checks, snapshot());

    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.verdict).toBe("Fixable");
  });

  it("requires concrete rewrite-eligible failures in multiple domains", () => {
    const checks = DOMAINS.map((domain) =>
      check(domain, {
        outcome: domain === "architecture" ? "fail" : "pass",
      }),
    );

    expect(scoreAnalysis(checks, snapshot()).verdict).not.toBe("Rewrite");

    const systemicChecks = DOMAINS.map((domain) =>
      check(domain, {
        severity: "high",
        outcome: "unknown",
        evidenceTier: "absent",
      }),
    );
    systemicChecks.push(
      check("architecture", {
        id: "arch.module-boundaries",
        outcome: "fail",
        evidenceTier: "inferred",
        severity: "high",
      }),
      check("reliability", {
        id: "rel.stateless",
        outcome: "fail",
        evidenceTier: "inferred",
        severity: "high",
      }),
    );

    expect(scoreAnalysis(systemicChecks, snapshot()).verdict).toBe("Rewrite");
  });

  it("keeps exposed credentials plus ownership concentration Fixable", () => {
    const checks = DOMAINS.map((domain) =>
      check(domain, {
        outcome: "unknown",
        evidenceTier: "absent",
        severity: "high",
      }),
    );
    checks.push(
      check("architecture", {
        id: "arch.bus-factor-repository",
        outcome: "fail",
        evidenceTier: "inferred",
        severity: "high",
      }),
      check("security", {
        id: "security.exposed-secret",
        outcome: "fail",
        evidenceTier: "enforced",
        severity: "critical",
      }),
    );

    expect(scoreAnalysis(checks, snapshot()).verdict).toBe("Fixable");
  });

  it("blocks Fundable when a repository limit makes the scan partial", () => {
    const result = scoreAnalysis(
      DOMAINS.map((domain) => check(domain)),
      snapshot(true),
    );

    expect(result.score).toBe(100);
    expect(result.verdict).toBe("Fixable");
    expect(result.verdictReason).toContain("limited evidence");
  });

  it("does not issue Rewrite when repository evidence is effectively absent", () => {
    const empty = snapshot();
    empty.coverage.discoveredRelevantFiles = 0;
    empty.coverage.processedRelevantFiles = 0;
    empty.files = [];
    const result = scoreAnalysis(
      DOMAINS.map((domain) =>
        check(domain, { outcome: "unknown", evidenceTier: "absent" }),
      ),
      empty,
    );

    expect(result.confidence).toBe(0);
    expect(result.verdict).toBe("Fixable");
    expect(result.growth.users10x).toBe("Insufficient evidence");
    expect(result.growth.agents).toBe("Insufficient evidence");
  });

  it("does not issue Rewrite when only expected repository evidence is missing", () => {
    const result = scoreAnalysis(
      DOMAINS.map((domain) =>
        check(domain, {
          outcome: "unknown",
          evidenceTier: "absent",
          severity: "high",
        }),
      ),
      snapshot(),
    );

    expect(result.score).toBe(0);
    expect(result.verdict).toBe("Fixable");
  });

  it("treats runtime-only unknowns as insufficient evidence", () => {
    const result = scoreAnalysis(
      DOMAINS.map((domain) =>
        check(domain, {
          outcome: "unknown",
          evidenceTier: "runtime_only",
          severity: "high",
        }),
      ),
      snapshot(),
    );

    expect(result.confidence).toBe(0);
    expect(result.growth.users10x).toBe("Insufficient evidence");
  });

  it("does not block 10x readiness from missing load evidence alone", () => {
    const checks = [
      check("reliability", {
        id: "rel.stateless",
        outcome: "pass",
      }),
      check("reliability", {
        id: "rel.failure-controls",
        outcome: "pass",
      }),
      check("reliability", {
        id: "rel.health-lifecycle",
        outcome: "pass",
      }),
      check("reliability", {
        id: "rel.load-tests",
        outcome: "unknown",
        evidenceTier: "absent",
      }),
      check("operations", {
        id: "ops.observability",
        outcome: "pass",
      }),
    ];

    const result = scoreAnalysis(checks, snapshot());
    expect(result.growth.users10x).toBe("Ready with conditions");
  });

  it("blocks a growth horizon only for a concrete high-confidence finding", () => {
    const checks = [
      check("reliability", {
        id: "rel.failure-controls",
        outcome: "fail",
        evidenceTier: "enforced",
        severity: "high",
      }),
      check("reliability", {
        id: "rel.health-lifecycle",
        outcome: "pass",
      }),
      check("reliability", {
        id: "rel.load-tests",
        outcome: "pass",
      }),
    ];

    expect(scoreAnalysis(checks, snapshot()).growth.users10x).toBe(
      "Blocked by architecture",
    );
  });

  it("does not issue Rewrite for a documentation-only or tiny code surface", () => {
    const tiny = snapshot();
    tiny.files = [{ path: "README.md", content: "# Example", size: 9 }];
    tiny.coverage.discoveredRelevantFiles = 1;
    tiny.coverage.processedRelevantFiles = 1;
    const result = scoreAnalysis(
      DOMAINS.map((domain) => check(domain, { outcome: "fail" })),
      tiny,
    );

    expect(result.confidence).toBe(100);
    expect(result.verdict).toBe("Fixable");
    expect(result.verdictReason).toContain("fewer than three");
  });
});
