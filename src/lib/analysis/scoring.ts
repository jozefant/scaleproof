import {
  DOMAIN_CONFIG,
  EVIDENCE_CREDIT,
  SEVERITY_RANK,
} from "./constants";
import type {
  AgentReadiness,
  CheckResult,
  DomainId,
  DomainScore,
  GrowthAssessment,
  RuntimeReadiness,
  ScoreResult,
  TeamReadiness,
  Verdict,
} from "./types";
import type { RepositorySnapshot } from "@/lib/repository/types";

const DOMAIN_IDS = Object.keys(DOMAIN_CONFIG) as DomainId[];

// Rewrite is reserved for concrete failures that can require replacement of a
// load-bearing code or runtime foundation. Remediable hygiene, operational, and
// organizational findings may block Fundable, but they cannot imply a rewrite.
const REWRITE_ELIGIBLE_CHECK_IDS = new Set([
  "arch.module-boundaries",
  "quality.tests",
  "quality.ci",
  "security.authentication",
  "security.authorization",
  "rel.stateless",
  "rel.database-foundations",
  "res.backup-restore",
]);

function round(value: number): number {
  return Math.round(value);
}

function scoreChecks(checks: CheckResult[]): {
  score: number;
  assessableWeight: number;
  applicableWeight: number;
  positiveEvidenceWeight: number;
  concreteNegativeWeight: number;
  missingEvidenceWeight: number;
  runtimeOnlyWeight: number;
} {
  let earned = 0;
  let assessableWeight = 0;
  let applicableWeight = 0;
  let positiveEvidenceWeight = 0;
  let concreteNegativeWeight = 0;
  let missingEvidenceWeight = 0;
  let runtimeOnlyWeight = 0;

  for (const check of checks) {
    if (check.outcome === "not_applicable") {
      continue;
    }

    applicableWeight += check.weight;

    if (check.evidenceTier === "runtime_only") {
      runtimeOnlyWeight += check.weight;
      continue;
    }

    assessableWeight += check.weight;
    if (check.outcome === "pass") {
      positiveEvidenceWeight += check.weight;
    } else if (check.outcome === "fail") {
      concreteNegativeWeight += check.weight;
    } else if (
      check.outcome === "unknown" &&
      check.evidenceTier === "absent"
    ) {
      missingEvidenceWeight += check.weight;
    }
    const credit =
      check.outcome === "pass"
        ? (EVIDENCE_CREDIT[check.evidenceTier] ?? 0)
        : 0;
    earned += check.weight * credit;
  }

  return {
    score: assessableWeight === 0 ? 0 : round((earned / assessableWeight) * 100),
    assessableWeight,
    applicableWeight,
    positiveEvidenceWeight,
    concreteNegativeWeight,
    missingEvidenceWeight,
    runtimeOnlyWeight,
  };
}

function calculateDomains(checks: CheckResult[]): DomainScore[] {
  return DOMAIN_IDS.map((domainId) => {
    const domainChecks = checks.filter((check) => check.domain === domainId);
    const result = scoreChecks(domainChecks);
    const config = DOMAIN_CONFIG[domainId];
    return {
      id: domainId,
      label: config.label,
      score: result.score,
      weight: config.weight,
      assessableWeight: result.assessableWeight,
      applicableWeight: result.applicableWeight,
      positiveEvidenceWeight: result.positiveEvidenceWeight,
      concreteNegativeWeight: result.concreteNegativeWeight,
      missingEvidenceWeight: result.missingEvidenceWeight,
      runtimeOnlyWeight: result.runtimeOnlyWeight,
    };
  });
}

function readinessFromChecks(
  checks: CheckResult[],
  strongThreshold: number,
  requiredEnforcedIds: string[],
): RuntimeReadiness {
  const result = scoreChecks(checks);
  const confidence =
    result.applicableWeight === 0
      ? 0
      : result.assessableWeight / result.applicableWeight;
  const concreteBlockingFinding = checks.some(
    (check) =>
      check.outcome === "fail" &&
      (check.evidenceTier === "enforced" ||
        check.evidenceTier === "inferred") &&
      (check.severity === "critical" || check.severity === "high"),
  );
  const requiredEvidencePresent = requiredEnforcedIds.every((id) =>
    checks.some(
      (check) =>
        check.id === id &&
        check.outcome === "pass" &&
        check.evidenceTier === "enforced",
    ),
  );

  if (confidence < 0.5) {
    return "Insufficient evidence";
  }
  if (concreteBlockingFinding) {
    return "Blocked by architecture";
  }
  if (result.score >= strongThreshold && requiredEvidencePresent) {
    return "Likely ready";
  }
  return "Ready with conditions";
}

function teamReadinessFromChecks(checks: CheckResult[]): TeamReadiness {
  const result = scoreChecks(checks);
  const confidence =
    result.applicableWeight === 0
      ? 0
      : result.assessableWeight / result.applicableWeight;

  if (confidence < 0.5) {
    return "Insufficient evidence";
  }
  if (result.score >= 70) {
    return "Parallel-friendly";
  }
  if (result.score >= 45) {
    return "Conditional";
  }
  const concreteCoordinationFailure = checks.some(
    (check) =>
      check.outcome === "fail" &&
      (check.evidenceTier === "enforced" ||
        check.evidenceTier === "inferred") &&
      (check.severity === "high" || check.severity === "critical"),
  );
  return concreteCoordinationFailure ? "Coordination risk" : "Conditional";
}

function agentReadinessFromChecks(checks: CheckResult[]): AgentReadiness {
  const result = scoreChecks(
    checks.filter((check) => check.domain === "agent_readiness"),
  );
  const confidence =
    result.applicableWeight === 0
      ? 0
      : result.assessableWeight / result.applicableWeight;

  if (
    confidence < 0.5 ||
    result.missingEvidenceWeight > result.positiveEvidenceWeight
  ) {
    return "Insufficient evidence";
  }
  if (result.score >= 75) {
    return "Agent-ready";
  }
  if (result.score >= 45) {
    return "Usable with guardrails";
  }
  return "Weak harness";
}

function calculateGrowth(checks: CheckResult[]): GrowthAssessment {
  const checks10x = checks.filter((check) =>
    [
      "rel.stateless",
      "rel.database-foundations",
      "rel.failure-controls",
      "rel.health-lifecycle",
      "rel.load-tests",
      "ops.observability",
    ].includes(check.id),
  );
  const checks100x = checks.filter((check) =>
    [
      "rel.stateless",
      "rel.database-foundations",
      "rel.failure-controls",
      "rel.health-lifecycle",
      "rel.load-tests",
      "rel.async-work",
      "rel.ha-path",
      "ops.observability",
      "res.backup-restore",
      "res.rpo-rto",
    ].includes(check.id),
  );
  const teamChecks = checks.filter((check) =>
    [
      "arch.onboarding",
      "arch.architecture-docs",
      "arch.decisions",
      "arch.module-boundaries",
      "arch.contracts",
      "arch.ownership",
      "quality.ci",
      "quality.fast-gates",
    ].includes(check.id),
  );

  return {
    users10x: readinessFromChecks(checks10x, 70, [
      "rel.failure-controls",
      "rel.health-lifecycle",
      "rel.load-tests",
    ]),
    users100x: readinessFromChecks(checks100x, 78, [
      "rel.failure-controls",
      "rel.health-lifecycle",
      "rel.load-tests",
      "rel.ha-path",
    ]),
    team: teamReadinessFromChecks(teamChecks),
    agents: agentReadinessFromChecks(checks),
  };
}

function insufficientGrowthEvidence(): GrowthAssessment {
  return {
    users10x: "Insufficient evidence",
    users100x: "Insufficient evidence",
    team: "Insufficient evidence",
    agents: "Insufficient evidence",
  };
}

function calculateConfidence(
  domains: DomainScore[],
  snapshot: RepositorySnapshot,
): number {
  const applicable = domains.reduce(
    (sum, domain) => sum + domain.applicableWeight,
    0,
  );
  const assessable = domains.reduce(
    (sum, domain) => sum + domain.assessableWeight,
    0,
  );
  const evidenceCoverage = applicable === 0 ? 0 : assessable / applicable;
  const scanCoverage =
    snapshot.coverage.discoveredRelevantFiles === 0
      ? 0
      : Math.min(
          1,
          snapshot.coverage.processedRelevantFiles /
            snapshot.coverage.discoveredRelevantFiles,
        );

  return round(evidenceCoverage * scanCoverage * 100);
}

function calculateOverallScore(domains: DomainScore[]): number {
  return round(
    domains.reduce(
      (sum, domain) => sum + domain.score * domain.weight,
      0,
    ),
  );
}

function hasCriticalBlocker(checks: CheckResult[]): boolean {
  return checks.some(
    (check) =>
      check.outcome === "fail" && SEVERITY_RANK[check.severity] >= 4,
  );
}

function implementationSurface(snapshot: RepositorySnapshot): number {
  return snapshot.files.filter(
    (file) => !/\.(md|mdx|txt)$/i.test(file.path),
  ).length;
}

function baseVerdict(
  score: number,
  criticalBlocker: boolean,
  checks: CheckResult[],
): Verdict {
  const concreteStructuralFailureDomains = new Set(
    checks
      .filter(
        (check) =>
          REWRITE_ELIGIBLE_CHECK_IDS.has(check.id) &&
          check.outcome === "fail" &&
          (check.evidenceTier === "enforced" ||
            check.evidenceTier === "inferred") &&
          (check.severity === "high" || check.severity === "critical"),
      )
      .map((check) => check.domain),
  );

  if (score >= 75 && !criticalBlocker) {
    return "Fundable";
  }
  if (score < 45 && concreteStructuralFailureDomains.size >= 2) {
    return "Rewrite";
  }
  return "Fixable";
}

function applyEvidenceCaps(
  verdict: Verdict,
  confidence: number,
  snapshot: RepositorySnapshot,
  criticalBlocker: boolean,
): Verdict {
  if (verdict === "Rewrite" && confidence < 40) {
    return "Fixable";
  }
  if (verdict === "Rewrite" && implementationSurface(snapshot) < 3) {
    return "Fixable";
  }
  if (verdict !== "Fundable") {
    return verdict;
  }

  const scanCoverage =
    snapshot.coverage.discoveredRelevantFiles === 0
      ? 0
      : snapshot.coverage.processedRelevantFiles /
        snapshot.coverage.discoveredRelevantFiles;

  if (
    confidence < 60 ||
    scanCoverage < 0.8 ||
    snapshot.coverage.partial ||
    criticalBlocker ||
    implementationSurface(snapshot) < 3
  ) {
    return "Fixable";
  }

  return verdict;
}

function verdictReason(
  verdict: Verdict,
  score: number,
  confidence: number,
  snapshot: RepositorySnapshot,
): string {
  if (snapshot.coverage.partial) {
    return `${verdict} with limited evidence: a scan limit was reached before every relevant file could be assessed.`;
  }
  if (confidence < 60) {
    return `${verdict} with limited evidence: too many material controls cannot be established from this repository.`;
  }
  if (implementationSurface(snapshot) < 3) {
    return `${verdict} with limited evidence: fewer than three implementation or configuration files were available for structural assessment.`;
  }
  if (verdict === "Fundable") {
    return `The repository shows enforceable foundations for growth, with a score of ${score}/100 and no critical blocker.`;
  }
  if (verdict === "Rewrite") {
    return `Concrete high-confidence failures span multiple load-bearing domains; scaling would require replacing several foundations together.`;
  }
  return `The core can be retained, but the highest-risk gaps should be closed before materially increasing users or team size.`;
}

export function scoreAnalysis(
  checks: CheckResult[],
  snapshot: RepositorySnapshot,
): ScoreResult {
  const domains = calculateDomains(checks);
  const score = calculateOverallScore(domains);
  const confidence = calculateConfidence(domains, snapshot);
  const criticalBlocker = hasCriticalBlocker(checks);
  const initialVerdict = baseVerdict(score, criticalBlocker, checks);
  const verdict = applyEvidenceCaps(
    initialVerdict,
    confidence,
    snapshot,
    criticalBlocker,
  );

  return {
    verdict,
    score,
    confidence,
    verdictReason: verdictReason(verdict, score, confidence, snapshot),
    domains,
    growth:
      snapshot.coverage.processedRelevantFiles === 0
        ? insufficientGrowthEvidence()
        : calculateGrowth(checks),
  };
}
