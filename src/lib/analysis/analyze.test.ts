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
});
