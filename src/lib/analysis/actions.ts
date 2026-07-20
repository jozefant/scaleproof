import type { CheckResult, ScanContext } from "./types";
import type { FounderAction } from "@/lib/report/contract";
import { SEVERITY_RANK } from "./constants";

interface ActionTemplate {
  title: string;
  rationale: string;
  verification: string;
}

const ACTIONS: Record<string, ActionTemplate> = {
  "define-module-boundaries": {
    title: "Draw boundaries before adding engineers",
    rationale:
      "Make ownership and dependencies explicit so teams can change separate areas without coordinating every release.",
    verification:
      "Document ownership and dependency rules, then enforce at least one boundary in an automated architecture check.",
  },
  "write-onboarding-path": {
    title: "Make the first day reproducible",
    rationale:
      "Document one setup and verification path that a new engineer can complete without tribal knowledge.",
    verification:
      "A new contributor can set up the project and run the documented verification command from a clean checkout.",
  },
  "add-architecture-decisions": {
    title: "Record the load-bearing decisions",
    rationale:
      "Capture architecture, invariants, and trade-offs so growth does not depend on the original builders staying available.",
    verification:
      "Publish the system map and at least one accepted decision record covering a load-bearing trade-off.",
  },
  "add-quality-gate": {
    title: "Put regression checks in the merge path",
    rationale:
      "Run tests, types, lint, and security checks automatically before changes reach the main branch.",
    verification:
      "A deliberately failing check blocks the protected merge path.",
  },
  "add-test-layers": {
    title: "Protect the critical user journeys",
    rationale:
      "Add fast unit checks plus a small end-to-end path so 10x growth does not multiply undetected regressions.",
    verification:
      "The critical founder journey fails in CI when its expected behavior is broken.",
  },
  "remove-exposed-secret": {
    title: "Rotate and remove the exposed credential",
    rationale:
      "Treat the detected value as compromised, remove it from history, and move future credentials to deployment-owned secret storage.",
    verification:
      "The credential is rotated, secret scanning is clean, and deployment reads the replacement from secret storage.",
  },
  "harden-auth-boundary": {
    title: "Close the identity boundary",
    rationale:
      "Enforce authentication and authorization on the server before exposing customer or regulated data.",
    verification:
      "Automated negative tests prove anonymous and unauthorized requests are rejected by the server.",
  },
  "add-security-baseline": {
    title: "Create a production security baseline",
    rationale:
      "Document the threat boundary and automate secret, dependency, and application-security checks.",
    verification:
      "Security checks run in CI and a current threat-boundary document names owners and review triggers.",
  },
  "separate-log-types": {
    title: "Separate operational, security, and audit logs",
    rationale:
      "Give each log class an owner, redaction rule, retention period, and access boundary.",
    verification:
      "Redaction tests pass and the operations guide defines access and retention for each log class.",
  },
  "add-observability": {
    title: "Make failure visible before scaling",
    rationale:
      "Add health signals, structured logs, metrics, and alerts that identify which dependency or request path is failing.",
    verification:
      "A synthetic failure is visible through health, structured telemetry, and an actionable alert.",
  },
  "remove-request-state": {
    title: "Remove single-instance state",
    rationale:
      "Move sessions and durable work out of process so another application instance can handle the next request.",
    verification:
      "Two instances can serve consecutive requests without instance-local session or job state.",
  },
  "add-load-path": {
    title: "Test the 10x path",
    rationale:
      "Define a representative workload, measure bottlenecks, and set a performance budget before traffic creates the experiment for you.",
    verification:
      "A repeatable load test records the workload, thresholds, result, and first observed bottleneck.",
  },
  "add-failure-controls": {
    title: "Bound slow and failing dependencies",
    rationale:
      "Add timeouts, retries only where safe, idempotency, graceful shutdown, and backpressure around external work.",
    verification:
      "Failure-path tests demonstrate bounded time, safe retry behavior, and controlled overload handling.",
  },
  "define-ha-path": {
    title: "Write the 100x availability path",
    rationale:
      "State the failure domains, horizontal-scaling assumptions, and conditions that trigger HA or partitioning work.",
    verification:
      "The architecture document names failure domains, scale-out assumptions, and measurable triggers for the next topology.",
  },
  "add-backup-restore": {
    title: "Confirm and test recovery",
    rationale:
      "Verify provider settings, document recovery ownership and objectives, then restore into a fresh environment.",
    verification:
      "A dated restore rehearsal meets documented RPO/RTO and records the backup source, owner, and result.",
  },
  "define-retention": {
    title: "Define the data lifecycle",
    rationale:
      "Document creation, retention, archival, deletion, export, and audit requirements for every durable data class.",
    verification:
      "Every durable data class has an owner, retention period, deletion path, and testable export or audit rule.",
  },
  "add-release-rollback": {
    title: "Make releases reversible",
    rationale:
      "Version deployments and document how application and schema changes roll back after a failed release.",
    verification:
      "A rehearsal restores the previous application and compatible schema version within the documented window.",
  },
  "add-agent-instructions": {
    title: "Give AI agents a safe operating map",
    rationale:
      "Document repository boundaries, allowed commands, security constraints, and completion criteria so agents do not rely on guesswork.",
    verification:
      "The repository agent guide names scope, safety rules, commands, and the definition of done.",
  },
  "build-agent-harness": {
    title: "Make agent work independently verifiable",
    rationale:
      "Provide fast, executable lint, type, test, build, and deeper verification paths with clear failure output.",
    verification:
      "One documented command runs the full gate and returns a non-zero exit code for a deliberate regression.",
  },
  "reduce-knowledge-concentration": {
    title: "Reduce single-maintainer knowledge risk",
    rationale:
      "Pair ownership, reviews, and module documentation where recent changes depend disproportionately on one contributor.",
    verification:
      "At least two maintainers can review and safely change each load-bearing module using current documentation.",
  },
};

function actionCopy(
  results: CheckResult[],
  primary: CheckResult,
): ActionTemplate {
  const template = ACTIONS[primary.remediationCode];
  const sourceSummaries = [
    ...new Set(results.map((check) => check.summary.trim()).filter(Boolean)),
  ].join(" ");
  const sourceCheckIds = results.map((check) => check.id);

  if (!template) {
    return {
      title: primary.title,
      rationale: sourceSummaries || primary.summary,
      verification: `Re-run ${sourceCheckIds.join(", ")} and confirm each check is supported by enforced or documented evidence.`,
    };
  }

  return {
    title: template.title,
    rationale: `${sourceSummaries} Recommended response: ${template.rationale}`,
    verification:
      `${template.verification} Re-run ${sourceCheckIds.join(", ")} and ` +
      "confirm the identified findings are resolved or supported by evidence.",
  };
}

function toAction(
  results: CheckResult[],
  rank: 1 | 2 | 3,
): FounderAction {
  const result = [...results].sort(
    (left, right) => actionPriority(right) - actionPriority(left),
  )[0];
  const template = actionCopy(results, result);
  const evidence = results
    .flatMap((check) => check.evidence)
    .filter(
      (item, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.path === item.path && candidate.kind === item.kind,
        ) === index,
    )
    .slice(0, 3);
  const sourceCheckIds = results.map((check) => check.id);
  const concreteCheckIds = results
    .filter((check) => check.outcome === "fail")
    .map((check) => check.id);
  const missingEvidenceCheckIds = results
    .filter(
      (check) =>
        check.outcome === "unknown" && check.evidenceTier === "absent",
    )
    .map((check) => check.id);
  const severity = results.reduce(
    (highest, check) =>
      SEVERITY_RANK[check.severity] > SEVERITY_RANK[highest]
        ? check.severity
        : highest,
    result.severity,
  );

  return {
    rank,
    title: template.title,
    rationale: template.rationale,
    remediationCode: result.remediationCode,
    severity,
    domain: result.domain,
    sourceCheckIds,
    whyNow: [
      concreteCheckIds.length > 0
        ? `Concrete repository evidence triggered ${concreteCheckIds.join(", ")}.`
        : "",
      missingEvidenceCheckIds.length > 0
        ? `Repository evidence is missing for ${missingEvidenceCheckIds.join(", ")}; establish that evidence before treating those controls as operational.`
        : "",
    ]
      .filter(Boolean)
      .join(" "),
    evidence,
    verification: template.verification,
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

const TARGET_PREFERENCES: Record<ScanContext["growthTarget"], string[]> = {
  users_10x: ["add-load-path", "remove-request-state", "add-failure-controls", "add-observability"],
  users_100x: ["define-ha-path", "add-failure-controls", "add-backup-restore", "define-retention"],
  engineering_team: ["define-module-boundaries", "reduce-knowledge-concentration", "write-onboarding-path", "add-quality-gate", "add-architecture-decisions"],
  users_and_team: ["add-load-path", "define-module-boundaries", "add-failure-controls", "write-onboarding-path", "add-observability"],
  unknown: [],
  withheld: [],
};

function groupPriority(results: CheckResult[], growthTarget: ScanContext["growthTarget"]): number {
  const preference = TARGET_PREFERENCES[growthTarget].indexOf(results[0].remediationCode);
  return preference < 0 ? 0 : TARGET_PREFERENCES[growthTarget].length - preference;
}

export function selectDeterministicActions(
  checks: CheckResult[],
  growthTarget: ScanContext["growthTarget"] = "unknown",
): FounderAction[] {
  const candidates = checks
    .filter(
      (check) =>
        check.outcome === "fail" ||
        (check.outcome === "unknown" && check.evidenceTier === "absent"),
    )
    .sort((left, right) => actionPriority(right) - actionPriority(left));

  const grouped = new Map<string, CheckResult[]>();
  for (const candidate of candidates) {
    grouped.set(candidate.remediationCode, [
      ...(grouped.get(candidate.remediationCode) ?? []),
      candidate,
    ]);
  }

  const mandatoryCodes = mandatoryRemediationCodes(checks);
  const groups = [...grouped.values()];
  const selectedGroups = [
    ...groups.filter((results) =>
      mandatoryCodes.has(results[0].remediationCode),
    ),
    ...groups
      .filter((results) => !mandatoryCodes.has(results[0].remediationCode))
      .sort((left, right) => {
        const preference = groupPriority(right, growthTarget) - groupPriority(left, growthTarget);
        return preference || actionPriority(right[0]) - actionPriority(left[0]);
      }),
  ];

  return selectedGroups
    .slice(0, 3)
    .map((results, index) =>
      toAction(results, (index + 1) as 1 | 2 | 3),
    );
}

export function mandatoryRemediationCodes(
  checks: CheckResult[],
): Set<string> {
  const codes = checks
    .filter(
      (check) =>
        check.outcome === "fail" && check.severity === "critical",
    )
    .sort((left, right) => actionPriority(right) - actionPriority(left))
    .map((check) => check.remediationCode);

  // The founder brief has a hard three-action limit. If more than three
  // distinct critical remediations exist, retain the three highest-priority
  // codes and keep every underlying finding in the evidence dossier.
  return new Set([...new Set(codes)].slice(0, 3));
}

export function reconcileActionProposal(
  deterministicActions: FounderAction[],
  proposal: Array<{ remediationCode: string }>,
  mandatoryCodes: Set<string>,
): FounderAction[] | null {
  const deterministicByCode = new Map(
    deterministicActions.map((action) => [action.remediationCode, action]),
  );
  const proposedCodes = proposal.map((action) => action.remediationCode);
  if (proposal.length !== deterministicActions.length) {
    return null;
  }
  if (new Set(proposedCodes).size !== proposedCodes.length) {
    return null;
  }
  if (
    proposedCodes.some((code) => !deterministicByCode.has(code)) ||
    [...mandatoryCodes].some((code) => !proposedCodes.includes(code))
  ) {
    return null;
  }

  const reconciled = proposal.flatMap((modelAction) => {
    const deterministic = deterministicByCode.get(modelAction.remediationCode);
    return deterministic ? [deterministic] : [];
  });
  for (const action of deterministicActions) {
    if (
      reconciled.length < 3 &&
      !reconciled.some(
        (candidate) =>
          candidate.remediationCode === action.remediationCode,
      )
    ) {
      reconciled.push(action);
    }
  }
  return reconciled.slice(0, 3).map((action, index) => ({
    ...action,
    rank: (index + 1) as 1 | 2 | 3,
  }));
}
