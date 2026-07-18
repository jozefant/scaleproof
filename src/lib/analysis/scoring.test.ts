import { describe, expect, it } from "vitest";

import { scoreAnalysis } from "./scoring";
import type {
  CheckResult,
  DomainId,
  RepositorySnapshot,
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
      processedTextBytes: 1_000,
      durationMs: 50,
      partial,
      limitsCrossed: partial ? ["file_count"] : [],
    },
    history: {
      source: "unavailable",
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

  it("requires multiple weak domains before using Rewrite", () => {
    const checks = DOMAINS.map((domain) =>
      check(domain, {
        outcome: domain === "architecture" ? "fail" : "pass",
      }),
    );

    expect(scoreAnalysis(checks, snapshot()).verdict).not.toBe("Rewrite");

    const systemicChecks = DOMAINS.map((domain) =>
      check(domain, {
        outcome:
          domain === "architecture" ||
          domain === "quality" ||
          domain === "security" ||
          domain === "reliability"
            ? "fail"
            : "pass",
      }),
    );

    expect(scoreAnalysis(systemicChecks, snapshot()).verdict).toBe("Rewrite");
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
