import { describe, expect, it } from "vitest";

import { analyzeRepository } from "@/lib/application/analyze-repository";
import { acquireDemoRepository } from "@/lib/repository/demo";
import { AnalysisReportSchema, REPORT_SCHEMA_VERSION } from "./contract";
import { escapeMarkdownProse, renderMarkdownReport } from "./markdown";

async function demoReport() {
  return analyzeRepository(await acquireDemoRepository(), {
      stage: "unknown",
      dataSensitivity: "unknown",
      growthTarget: "unknown",
    }, {
      synthesize: async (input) => ({
        actions: input.fallbackActions,
        meta: {
          source: "gpt-5.6", model: "gpt-5.6-test", findingsIncluded: input.fallbackActions.length,
          totalFindings: input.fallbackActions.length, inputTokens: null, outputTokens: null,
          limited: false, note: "Injected mandatory synthesis.",
        },
      }),
    });
}

describe("public report contract", () => {
  it("rejects partial and newer incompatible payloads safely", async () => {
    const report = await demoReport();

    expect(AnalysisReportSchema.safeParse({ verdict: "Fixable" }).success).toBe(
      false,
    );
    expect(
      AnalysisReportSchema.safeParse({
        ...report,
        schemaVersion: "999.0.0",
      }).success,
    ).toBe(false);
    expect(report.schemaVersion).toBe(REPORT_SCHEMA_VERSION);
  });

  it.each([
    ["prototype", "none", "users_10x"],
    ["live_early", "basic_personal", "users_100x"],
    ["scaling_production", "sensitive_regulated", "engineering_team"],
    ["unknown", "unknown", "users_and_team"],
    ["withheld", "withheld", "withheld"],
  ] as const)(
    "renders context state %s / %s / %s in Markdown",
    async (stage, dataSensitivity, growthTarget) => {
      const report = await demoReport();
      const contextual = AnalysisReportSchema.parse({
        ...report,
        context: { stage, dataSensitivity, growthTarget },
      });
      const markdown = renderMarkdownReport(contextual);

      expect(markdown).toContain("## Context assumptions");
      expect(markdown).toContain("Source checks:");
      expect(markdown).toContain("Complete when:");
    },
  );

  it("renders a partial-scan record and safe public source link", async () => {
    const report = await demoReport();
    const partial = AnalysisReportSchema.parse({
      ...report,
      repositoryLabel: "example/repository",
      sourceUrl: "https://github.com/example/repository",
      coverage: {
        ...report.coverage,
        discoveredRelevantFiles: 10,
        processedRelevantFiles: 7,
        unprocessedRelevantFiles: 3,
        partial: true,
        limitsCrossed: ["file_count"],
      },
    });
    const markdown = renderMarkdownReport(partial);

    expect(markdown).toContain(
      "[example/repository](https://github.com/example/repository)",
    );
    expect(markdown).toContain("Partial scan");
    expect(markdown).toContain("3 relevant files unprocessed");
  });

  it("renders SaaS-audit checks as safe evidence locations in the Markdown dossier", async () => {
    const report = await demoReport();
    const markdown = renderMarkdownReport(report);

    expect(report.checks.filter((check) => check.id.startsWith("saas."))).toHaveLength(13);
    expect(markdown).toContain("This includes the versioned SaaS 10x audit controls.");
    expect(markdown).toContain("`saas.stateless-tier`");
    expect(markdown).toContain("never source snippets.");
  });

  it.each([
    "javascript:alert(1)",
    "https://example.com/owner/repository",
    "https://github.com/owner/repository/tree/main",
    "https://github.com:444/owner/repository",
  ])("rejects unsafe or non-root source URL %s", async (sourceUrl) => {
    const report = await demoReport();
    expect(
      AnalysisReportSchema.safeParse({ ...report, sourceUrl }).success,
    ).toBe(false);
  });

  it("escapes repository and model-derived text in Markdown", async () => {
    const report = await demoReport();
    const hostile = AnalysisReportSchema.parse({
      ...report,
      repositoryLabel: "owner/[repo]\n# injected",
      sourceUrl: "https://github.com/owner/repository",
      actions: report.actions.map((action, index) =>
        index === 0
          ? {
              ...action,
              title: "Fix *this*\n## injected",
              rationale: "Do [unsafe] `work`\n- forged",
              evidence: [
                {
                  path: "src/`odd`\n## heading.ts",
                  kind: "code",
                },
              ],
            }
          : action,
      ),
      checks: report.checks.map((check, index) =>
        index === 0
          ? {
              ...check,
              summary: "Line one\n## forged section",
              evidence: [
                {
                  path: "src/[bracket]`tick`.ts",
                  kind: "code",
                },
              ],
            }
          : check,
      ),
    });
    const markdown = renderMarkdownReport(hostile);

    expect(markdown).not.toContain("\n## injected");
    expect(markdown).not.toContain("\n## forged");
    expect(markdown).not.toContain("\n- forged");
    expect(markdown).toContain("\\[repo\\] # injected");
    expect(markdown).toContain("``src/`odd` ## heading.ts``");
  });
  it("escapes every table-cell metacharacter in one global pass", () => {
    expect(escapeMarkdownProse("domain\\|column")).toBe(
      ["domain", "\\\\", "\\|", "column"].join(""),
    );
  });
});
