import type { CheckResult, FounderAction, Severity } from "./types";
import { SEVERITY_RANK } from "./constants";

interface ActionTemplate {
  title: string;
  rationale: string;
}

const ACTIONS: Record<string, ActionTemplate> = {
  "define-module-boundaries": {
    title: "Draw boundaries before adding engineers",
    rationale:
      "Make ownership and dependencies explicit so teams can change separate areas without coordinating every release.",
  },
  "write-onboarding-path": {
    title: "Make the first day reproducible",
    rationale:
      "Document one setup and verification path that a new engineer can complete without tribal knowledge.",
  },
  "add-architecture-decisions": {
    title: "Record the load-bearing decisions",
    rationale:
      "Capture architecture, invariants, and trade-offs so growth does not depend on the original builders staying available.",
  },
  "add-quality-gate": {
    title: "Put regression checks in the merge path",
    rationale:
      "Run tests, types, lint, and security checks automatically before changes reach the main branch.",
  },
  "add-test-layers": {
    title: "Protect the critical user journeys",
    rationale:
      "Add fast unit checks plus a small end-to-end path so 10x growth does not multiply undetected regressions.",
  },
  "remove-exposed-secret": {
    title: "Rotate and remove the exposed credential",
    rationale:
      "Treat the detected value as compromised, remove it from history, and move future credentials to deployment-owned secret storage.",
  },
  "harden-auth-boundary": {
    title: "Close the identity boundary",
    rationale:
      "Enforce authentication and authorization on the server before exposing customer or regulated data.",
  },
  "add-security-baseline": {
    title: "Create a production security baseline",
    rationale:
      "Document the threat boundary and automate secret, dependency, and application-security checks.",
  },
  "separate-log-types": {
    title: "Separate operational, security, and audit logs",
    rationale:
      "Give each log class an owner, redaction rule, retention period, and access boundary.",
  },
  "add-observability": {
    title: "Make failure visible before scaling",
    rationale:
      "Add health signals, structured logs, metrics, and alerts that identify which dependency or request path is failing.",
  },
  "remove-request-state": {
    title: "Remove single-instance state",
    rationale:
      "Move sessions and durable work out of process so another application instance can handle the next request.",
  },
  "add-load-path": {
    title: "Test the 10x path",
    rationale:
      "Define a representative workload, measure bottlenecks, and set a performance budget before traffic creates the experiment for you.",
  },
  "add-failure-controls": {
    title: "Bound slow and failing dependencies",
    rationale:
      "Add timeouts, retries only where safe, idempotency, graceful shutdown, and backpressure around external work.",
  },
  "define-ha-path": {
    title: "Write the 100x availability path",
    rationale:
      "State the failure domains, horizontal-scaling assumptions, and conditions that trigger HA or partitioning work.",
  },
  "add-backup-restore": {
    title: "Confirm and test recovery",
    rationale:
      "No repository evidence established backups, a restore rehearsal, or RPO/RTO. Verify provider settings, document ownership, then restore into a fresh environment.",
  },
  "define-retention": {
    title: "Define the data lifecycle",
    rationale:
      "Document creation, retention, archival, deletion, export, and audit requirements for every durable data class.",
  },
  "add-release-rollback": {
    title: "Make releases reversible",
    rationale:
      "Version deployments and document how application and schema changes roll back after a failed release.",
  },
  "add-agent-instructions": {
    title: "Give AI agents a safe operating map",
    rationale:
      "Document repository boundaries, allowed commands, security constraints, and completion criteria so agents do not rely on guesswork.",
  },
  "build-agent-harness": {
    title: "Make agent work independently verifiable",
    rationale:
      "Provide fast, executable lint, type, test, build, and deeper verification paths with clear failure output.",
  },
  "reduce-knowledge-concentration": {
    title: "Reduce single-maintainer knowledge risk",
    rationale:
      "Pair ownership, reviews, and module documentation where recent changes depend disproportionately on one contributor.",
  },
};

function toAction(
  result: CheckResult,
  rank: 1 | 2 | 3,
): FounderAction {
  const template = ACTIONS[result.remediationCode] ?? {
    title: result.title,
    rationale: result.summary,
  };

  return {
    rank,
    title: template.title,
    rationale: template.rationale,
    remediationCode: result.remediationCode,
    severity: result.severity,
  };
}

function actionPriority(result: CheckResult): number {
  const outcomePenalty = result.outcome === "fail" ? 3 : 1;
  const evidencePenalty = result.evidenceTier === "absent" ? 1.2 : 1;
  return (
    SEVERITY_RANK[result.severity] *
    result.weight *
    outcomePenalty *
    evidencePenalty
  );
}

export function selectDeterministicActions(
  checks: CheckResult[],
): FounderAction[] {
  const candidates = checks
    .filter(
      (check) =>
        check.outcome === "fail" ||
        (check.outcome === "unknown" && check.evidenceTier === "absent"),
    )
    .sort((left, right) => actionPriority(right) - actionPriority(left));

  const unique = new Map<string, CheckResult>();
  for (const candidate of candidates) {
    if (!unique.has(candidate.remediationCode)) {
      unique.set(candidate.remediationCode, candidate);
    }
  }

  return [...unique.values()]
    .slice(0, 3)
    .map((check, index) => toAction(check, (index + 1) as 1 | 2 | 3));
}

export function severityFromString(value: string): Severity {
  if (
    value === "critical" ||
    value === "high" ||
    value === "medium" ||
    value === "low" ||
    value === "info"
  ) {
    return value;
  }
  return "medium";
}
