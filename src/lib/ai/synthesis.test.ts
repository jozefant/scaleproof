import { describe, expect, it } from "vitest";

import type { CheckResult } from "@/lib/analysis/types";

import { buildAllowlistedPayload } from "./synthesis";

const sensitivePath =
  "src/customer/jozef.antony@example.invalid/private-customer-name.ts";

const finding: CheckResult = {
  id: "security.exposed-secret",
  domain: "security",
  title: "Likely exposed credential",
  outcome: "fail",
  evidenceTier: "enforced",
  severity: "critical",
  weight: 5,
  summary: "A secret-shaped value was found.",
  remediationCode: "remove-exposed-secret",
  evidence: [{ path: sensitivePath, kind: "code" }],
};

describe("OpenAI synthesis boundary", () => {
  it("builds an allowlisted payload without repository paths or prose", () => {
    const built = buildAllowlistedPayload({
      verdict: "Fixable",
      score: 61,
      confidence: 80,
      domains: [
        {
          id: "security",
          label: "Security & privacy",
          score: 30,
          weight: 0.2,
          assessableWeight: 5,
          applicableWeight: 5,
        },
      ],
      growth: {
        users10x: "Ready with conditions",
        users100x: "Insufficient evidence",
        team: "Conditional",
        agents: "Usable with guardrails",
      },
      context: {
        stage: "unknown",
        dataSensitivity: "withheld",
        growthTarget: "users_and_team",
      },
      checks: [finding],
      fallbackActions: [
        {
          rank: 1,
          title: "Rotate and remove the exposed credential",
          rationale: "Use deployment-owned secret storage.",
          remediationCode: "remove-exposed-secret",
          severity: "critical",
        },
      ],
    });

    const serialized = JSON.stringify(built.payload);
    expect(serialized).toContain("security.exposed-secret");
    expect(serialized).toContain("remove-exposed-secret");
    expect(serialized).not.toContain(sensitivePath);
    expect(serialized).not.toContain(finding.title);
    expect(serialized).not.toContain(finding.summary);
    expect(built.estimatedTokens).toBeLessThanOrEqual(12_000);
  });
});
