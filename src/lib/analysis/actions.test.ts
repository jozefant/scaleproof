import { describe, expect, it } from "vitest";

import {
  reconcileActionProposal,
  selectDeterministicActions,
} from "./actions";
import type { CheckResult } from "./types";

function finding(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    id: "security.exposed-secret",
    domain: "security",
    title: "Likely exposed credential",
    outcome: "fail",
    evidenceTier: "enforced",
    severity: "critical",
    weight: 5,
    summary: "A credential-shaped value was found.",
    remediationCode: "remove-exposed-secret",
    evidence: [{ path: "src/config.ts", kind: "code" }],
    ...overrides,
  };
}

describe("founder action policy", () => {
  it("builds deterministic evidence linkage and a completion condition", () => {
    const actions = selectDeterministicActions([
      finding(),
      finding({
        id: "security.secret-scanning",
        outcome: "unknown",
        evidenceTier: "absent",
        evidence: [],
      }),
    ]);

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      domain: "security",
      sourceCheckIds: [
        "security.exposed-secret",
        "security.secret-scanning",
      ],
      evidence: [{ path: "src/config.ts", kind: "code" }],
      severity: "critical",
    });
    expect(actions[0].whyNow).toContain("Concrete repository evidence");
    expect(actions[0].whyNow).toContain(
      "Repository evidence is missing for security.secret-scanning",
    );
    expect(actions[0].whyNow).not.toContain(
      "triggered security.exposed-secret, security.secret-scanning",
    );
    expect(actions[0].verification).toContain("credential");
  });

  it("describes absent evidence without claiming runtime failure", () => {
    const [action] = selectDeterministicActions([
      finding({
        id: "res.backup-restore",
        domain: "resilience",
        outcome: "unknown",
        evidenceTier: "absent",
        severity: "high",
        remediationCode: "add-backup-restore",
        evidence: [],
      }),
    ]);

    expect(action.whyNow).toContain("evidence is missing");
    expect(action.whyNow).not.toContain("failed");
  });

  it("builds action copy only from the checks that need remediation", () => {
    const passingRecoverySummary =
      "Both backup and restore evidence are present.";
    const missingObjectivesSummary =
      "RPO and RTO assumptions are not documented for durable data.";
    const [action] = selectDeterministicActions([
      finding({
        id: "res.backup-restore",
        domain: "resilience",
        outcome: "pass",
        evidenceTier: "enforced",
        severity: "high",
        remediationCode: "add-backup-restore",
        summary: passingRecoverySummary,
      }),
      finding({
        id: "res.rpo-rto",
        domain: "resilience",
        outcome: "unknown",
        evidenceTier: "absent",
        severity: "high",
        remediationCode: "add-backup-restore",
        summary: missingObjectivesSummary,
        evidence: [],
      }),
    ]);

    expect(action.sourceCheckIds).toEqual(["res.rpo-rto"]);
    expect(action.rationale).toContain(missingObjectivesSummary);
    expect(action.rationale).not.toContain(passingRecoverySummary);
    expect(action.rationale).not.toContain(
      "No repository evidence established backups",
    );
    expect(action.verification).toContain("res.rpo-rto");
    expect(action.verification).not.toContain("res.backup-restore");
  });

  it.each([
    {
      name: "omits mandatory work",
      proposal: [],
    },
    {
      name: "duplicates a code",
      proposal: [
        {
          remediationCode: "remove-exposed-secret",
        },
        {
          remediationCode: "remove-exposed-secret",
        },
      ],
    },
    {
      name: "uses an unknown code",
      proposal: [
        {
          remediationCode: "unknown-code",
        },
      ],
    },
  ])("rejects a GPT proposal that $name", ({ proposal }) => {
    const deterministic = selectDeterministicActions([finding()]);
    expect(
      reconcileActionProposal(
        deterministic,
        proposal,
        new Set(["remove-exposed-secret"]),
      ),
    ).toBeNull();
  });

  it("uses GPT only to order deterministic actions", () => {
    const deterministic = selectDeterministicActions([finding()]);
    const manipulatedProposal = [
      {
        remediationCode: "remove-exposed-secret",
        title: "Unsupported model claim",
        rationale: "Invented rationale.",
        severity: "low",
      },
    ];
    const result = reconcileActionProposal(
      deterministic,
      manipulatedProposal,
      new Set(["remove-exposed-secret"]),
    );

    expect(result?.[0]).toMatchObject({
      severity: "critical",
      title: deterministic[0].title,
      rationale: deterministic[0].rationale,
      sourceCheckIds: ["security.exposed-secret"],
      evidence: [{ path: "src/config.ts", kind: "code" }],
    });
  });

  it("caps mandatory critical remediation codes at the three highest priorities", () => {
    const checks = [
      finding({ remediationCode: "critical-a", weight: 5 }),
      finding({ id: "critical-b", remediationCode: "critical-b", weight: 4 }),
      finding({ id: "critical-c", remediationCode: "critical-c", weight: 3 }),
      finding({ id: "critical-d", remediationCode: "critical-d", weight: 2 }),
      finding({
        id: "high-a",
        remediationCode: "high-a",
        severity: "high",
        weight: 5,
      }),
    ];

    expect(selectDeterministicActions(checks).map((action) => action.remediationCode))
      .toEqual(["critical-a", "critical-b", "critical-c"]);
  });
});
