import { describe, expect, it } from "vitest";

import { acquireDemoRepository } from "@/lib/repository/demo";

import { analyzeRepository } from "@/lib/application/analyze-repository";

describe("synthetic demo dossier", () => {
  it("produces a deterministic report with a verified concern and at most three actions", async () => {
    const originalKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const snapshot = await acquireDemoRepository();
      const report = await analyzeRepository(snapshot, {
        stage: "prototype",
        dataSensitivity: "basic_personal",
        growthTarget: "users_and_team",
      });

      expect(report.repositoryLabel).toBe("scaleproof/demo-startup");
      expect(report.verdict).toBe("Fixable");
      expect(report.actions).toHaveLength(3);
      expect(report.ai.source).toBe("deterministic");
      expect(report.checks).toContainEqual(
        expect.objectContaining({
          id: "security.exposed-secret",
          outcome: "fail",
          severity: "critical",
        }),
      );
      expect(report.growth.users10x).toBeTruthy();
      expect(report.growth.users100x).toBeTruthy();
      expect(report.growth.team).toBeTruthy();
      expect(report.growth.agents).toBe("Insufficient evidence");
      expect(report.busFactor.repository.band).toBe("High concentration");
    } finally {
      if (originalKey) {
        process.env.OPENAI_API_KEY = originalKey;
      }
    }
  });

  it("changes only visible action priorities when the growth target changes", async () => {
    async function reportFor(growthTarget: "users_10x" | "engineering_team") {
      return analyzeRepository(await acquireDemoRepository(), {
        stage: "prototype",
        dataSensitivity: "basic_personal",
        growthTarget,
      }, {
        synthesize: async (input) => ({
          actions: input.fallbackActions,
          meta: {
            source: "deterministic",
            model: null,
            findingsIncluded: input.fallbackActions.length,
            totalFindings: input.fallbackActions.length,
            inputTokens: null,
            outputTokens: null,
            limited: false,
            note: "Synthetic priority-policy test.",
          },
        }),
      });
    }

    const users = await reportFor("users_10x");
    const team = await reportFor("engineering_team");

    expect(users.actions.map((action) => action.remediationCode)).not.toEqual(
      team.actions.map((action) => action.remediationCode),
    );
    expect(users.checks).toEqual(team.checks);
    expect(users.score).toBe(team.score);
    expect(users.confidence).toBe(team.confidence);
    expect(users.verdict).toBe(team.verdict);
    expect(users.growth).toEqual(team.growth);
    expect(users.actions[0].remediationCode).toBe("remove-exposed-secret");
    expect(team.actions[0].remediationCode).toBe("remove-exposed-secret");
  });
});
