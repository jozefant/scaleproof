import type { RepositorySnapshot } from "@/lib/repository/types";
import type { CheckResult, DomainId, GrowthAssessment, Verdict } from "./types";

const DOMAINS: DomainId[] = [
  "architecture",
  "quality",
  "security",
  "operations",
  "reliability",
  "resilience",
  "agent_readiness",
];

const DOMAIN_REMEDIATIONS: Record<DomainId, string> = {
  architecture: "define-module-boundaries",
  quality: "add-quality-gate",
  security: "add-security-baseline",
  operations: "add-observability",
  reliability: "add-failure-controls",
  resilience: "add-backup-restore",
  agent_readiness: "build-agent-harness",
};

function snapshot(
  overrides: Partial<RepositorySnapshot> = {},
): RepositorySnapshot {
  const files = [
    { path: "src/a.ts", content: "export {}", size: 9 },
    { path: "src/b.ts", content: "export {}", size: 9 },
    { path: "package.json", content: "{}", size: 2 },
  ];
  return {
    repositoryLabel: "calibration/synthetic",
    sourceUrl: null,
    files,
    detectedStacks: ["Node.js / TypeScript"],
    coverage: {
      discoveredRelevantFiles: files.length,
      processedRelevantFiles: files.length,
      skippedBinaryFiles: 0,
      skippedOversizedFiles: 0,
      unprocessedRelevantFiles: 0,
      processedTextBytes: 20,
      durationMs: 10,
      partial: false,
      limitsCrossed: [],
    },
    history: {
      source: "synthetic",
      availability: "available",
      repository: {
        scope: "Repository",
        sampledCommits: 20,
        attributedCommits: 20,
        activeContributors: 3,
        estimatedBusFactor: 2,
        topContributorShare: 45,
        band: "Moderate concentration",
      },
      modules: [],
      note: "Synthetic calibration history.",
    },
    ...overrides,
  };
}

function check(
  id: string,
  domain: DomainId,
  overrides: Partial<CheckResult> = {},
): CheckResult {
  return {
    id,
    domain,
    title: `${id} calibration control`,
    outcome: "pass",
    evidenceTier: "enforced",
    severity: "high",
    weight: 1,
    summary: "Synthetic enforced evidence.",
    remediationCode: DOMAIN_REMEDIATIONS[domain],
    evidence: [{ path: `synthetic/${id}.json`, kind: "configuration" }],
    ...overrides,
  };
}

function strongChecks(): CheckResult[] {
  return [
    check("arch.onboarding", "architecture"),
    check("arch.architecture-docs", "architecture"),
    check("arch.decisions", "architecture"),
    check("arch.module-boundaries", "architecture"),
    check("arch.contracts", "architecture"),
    check("arch.ownership", "architecture"),
    check("quality.ci", "quality"),
    check("quality.fast-gates", "quality"),
    check("security.baseline", "security"),
    check("ops.observability", "operations"),
    check("rel.stateless", "reliability"),
    check("rel.database-foundations", "reliability"),
    check("rel.failure-controls", "reliability"),
    check("rel.health-lifecycle", "reliability"),
    check("rel.load-tests", "reliability"),
    check("rel.async-work", "reliability"),
    check("rel.ha-path", "reliability"),
    check("res.backup-restore", "resilience"),
    check("res.rpo-rto", "resilience"),
    check("agent.instructions", "agent_readiness"),
    check("agent.harness", "agent_readiness"),
  ];
}

export interface CalibrationFixture {
  name: string;
  snapshot: RepositorySnapshot;
  checks: CheckResult[];
  expected: {
    dispositions: Record<string, Pick<CheckResult, "outcome" | "evidenceTier">>;
    scoreBand: readonly [number, number];
    verdict: Verdict;
    growth: GrowthAssessment;
    topActionCodes: string[];
  };
}

const strong = strongChecks();
const allMissing = strong.map((item) => ({
  ...item,
  outcome: "unknown" as const,
  evidenceTier: "absent" as const,
  evidence: [],
  summary: "Synthetic expected repository evidence is missing.",
}));
const concreteFailures = strong.map((item) => ({
  ...item,
  outcome: "fail" as const,
  evidenceTier: "enforced" as const,
  summary: "Synthetic concrete failure.",
}));
const mixed = DOMAINS.map((domain, index) =>
  check(`mixed.${domain}`, domain, {
    outcome: index === 0 ? "pass" : "unknown",
    evidenceTier:
      index === 0 ? "documented" : index % 2 ? "runtime_only" : "absent",
    evidence: index === 0 ? [{ path: "README.md", kind: "documentation" }] : [],
  }),
);

export const CALIBRATION_FIXTURES: CalibrationFixture[] = [
  {
    name: "strong enforced evidence",
    snapshot: snapshot(),
    checks: strong,
    expected: {
      dispositions: {
        "rel.load-tests": { outcome: "pass", evidenceTier: "enforced" },
        "agent.harness": { outcome: "pass", evidenceTier: "enforced" },
      },
      scoreBand: [95, 100],
      verdict: "Fundable",
      growth: {
        users10x: "Likely ready",
        users100x: "Likely ready",
        team: "Parallel-friendly",
        agents: "Agent-ready",
      },
      topActionCodes: [],
    },
  },
  {
    name: "missing repository evidence",
    snapshot: snapshot(),
    checks: allMissing,
    expected: {
      dispositions: {
        "rel.load-tests": { outcome: "unknown", evidenceTier: "absent" },
      },
      scoreBand: [0, 5],
      verdict: "Fixable",
      growth: {
        users10x: "Ready with conditions",
        users100x: "Ready with conditions",
        team: "Conditional",
        agents: "Insufficient evidence",
      },
      topActionCodes: [
        "define-module-boundaries",
        "add-quality-gate",
        "add-security-baseline",
      ],
    },
  },
  {
    name: "concrete multi-domain structural failure",
    snapshot: snapshot(),
    checks: concreteFailures,
    expected: {
      dispositions: {
        "arch.module-boundaries": { outcome: "fail", evidenceTier: "enforced" },
        "rel.failure-controls": { outcome: "fail", evidenceTier: "enforced" },
      },
      scoreBand: [0, 5],
      verdict: "Rewrite",
      growth: {
        users10x: "Blocked by architecture",
        users100x: "Blocked by architecture",
        team: "Coordination risk",
        agents: "Weak harness",
      },
      topActionCodes: [
        "define-module-boundaries",
        "add-quality-gate",
        "add-security-baseline",
      ],
    },
  },
  {
    name: "partial scan",
    snapshot: snapshot({
      coverage: {
        discoveredRelevantFiles: 10,
        processedRelevantFiles: 7,
        skippedBinaryFiles: 0,
        skippedOversizedFiles: 0,
        unprocessedRelevantFiles: 3,
        processedTextBytes: 20,
        durationMs: 10,
        partial: true,
        limitsCrossed: ["file_count"],
      },
    }),
    checks: strong,
    expected: {
      dispositions: {
        "rel.load-tests": { outcome: "pass", evidenceTier: "enforced" },
      },
      scoreBand: [95, 100],
      verdict: "Fixable",
      growth: {
        users10x: "Likely ready",
        users100x: "Likely ready",
        team: "Parallel-friendly",
        agents: "Agent-ready",
      },
      topActionCodes: [],
    },
  },
  {
    name: "compact initial Lovable export",
    snapshot: snapshot({
      history: {
        source: "synthetic",
        availability: "available",
        repository: {
          scope: "Repository",
          sampledCommits: 12,
          attributedCommits: 12,
          activeContributors: 1,
          estimatedBusFactor: 1,
          topContributorShare: 100,
          sampleWindowDays: 2,
          band: "Expected for initial Lovable export",
        },
        modules: [],
        provenance: {
          platform: "Lovable",
          classification: "initial_export",
          signals: ["lovable-tagger dependency"],
          note: "Initial export concentration is contextual.",
        },
        note: "Synthetic compact export.",
      },
    }),
    checks: [
      ...strong,
      check("arch.bus-factor-repository", "architecture", {
        outcome: "unknown",
        evidenceTier: "runtime_only",
        severity: "info",
        evidence: [],
      }),
    ],
    expected: {
      dispositions: {
        "arch.bus-factor-repository": {
          outcome: "unknown",
          evidenceTier: "runtime_only",
        },
      },
      scoreBand: [95, 100],
      verdict: "Fundable",
      growth: {
        users10x: "Likely ready",
        users100x: "Likely ready",
        team: "Parallel-friendly",
        agents: "Agent-ready",
      },
      topActionCodes: [],
    },
  },
  {
    name: "unrecognized mixed stack",
    snapshot: snapshot({ detectedStacks: ["Generic repository"] }),
    checks: mixed,
    expected: {
      dispositions: {
        "mixed.architecture": { outcome: "pass", evidenceTier: "documented" },
        "mixed.quality": { outcome: "unknown", evidenceTier: "runtime_only" },
      },
      scoreBand: [0, 15],
      verdict: "Fixable",
      growth: {
        users10x: "Insufficient evidence",
        users100x: "Insufficient evidence",
        team: "Insufficient evidence",
        agents: "Insufficient evidence",
      },
      topActionCodes: [
        "add-security-baseline",
        "add-failure-controls",
        "build-agent-harness",
      ],
    },
  },
];
