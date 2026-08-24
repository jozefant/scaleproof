import { describe, expect, it } from "vitest";

import {
  CREDENTIAL_VALUE,
  MODULE_SKELETON,
  NON_PRODUCTION_PLACEMENT,
  P0_10_CONTEXT,
  PRODUCTION_PLACEMENT,
  p0Snapshot,
} from "@/lib/analysis/p0-10-fixtures";
import { renderMarkdownReport } from "@/lib/report/markdown";

import { analyzeRepository } from "./analyze-repository";

/**
 * P0.10 — the execution-context role is internal.
 *
 * File roles change which findings are asserted and how severe they are. They
 * must not change what the founder-visible document contains: the public report
 * still carries only safe paths and deterministic summaries, never source
 * text, credential values, or contributor data.
 *
 * Synthesis is stubbed with the deterministic fallback, so no provider call and
 * no network access happen in this test.
 */
async function markdownFor(files: Array<{ path: string; content: string }>) {
  const report = await analyzeRepository(p0Snapshot(files), P0_10_CONTEXT, {
    synthesize: async (input) => ({
      actions: input.fallbackActions,
      meta: {
        source: "deterministic" as const,
        model: null,
        findingsIncluded: input.fallbackActions.length,
        totalFindings: input.checks.length,
        inputTokens: null,
        outputTokens: null,
        limited: false,
        note: "Synthetic deterministic synthesis for a privacy test.",
      },
    }),
  });
  return renderMarkdownReport(report);
}

const FIXTURES: Array<[string, Array<{ path: string; content: string }>]> = [
  ["non-production placement", [...MODULE_SKELETON, ...NON_PRODUCTION_PLACEMENT]],
  ["production placement", [...MODULE_SKELETON, ...PRODUCTION_PLACEMENT]],
];

describe("P0.10 public report privacy", () => {
  it.each(FIXTURES)(
    "renders no secret value, source snippet, or contributor data for the %s fixture",
    async (_name, files) => {
      const markdown = await markdownFor(files);

      expect(markdown).not.toContain(CREDENTIAL_VALUE);
      expect(markdown).not.toContain("spring.datasource.password");
      expect(markdown).not.toContain("orderRepository.findAll");
      expect(markdown).not.toContain("SELECT id, email FROM orders");
      expect(markdown).not.toContain("@radix-ui/react-table");
      expect(markdown).not.toContain("JSON.stringify(order)");
      // No contributor identity or commit text is available to render.
      expect(markdown).not.toMatch(/@[\w.-]+\.(?:com|org|net|invalid)\b/);
    },
  );

  it("keeps role-derived evidence limited to safe paths and deterministic summaries", async () => {
    const markdown = await markdownFor([
      ...MODULE_SKELETON,
      ...NON_PRODUCTION_PLACEMENT,
    ]);

    // The internal file role never reaches the founder-visible document.
    for (const role of ["production", "fixture", "generated", "tooling"]) {
      expect(markdown.toLowerCase()).not.toContain(`file role: ${role}`);
      expect(markdown.toLowerCase()).not.toContain(`evidence role: ${role}`);
    }
    // Evidence is rendered as a scanned path and nothing else.
    expect(markdown).toContain(
      "backend/src/test/resources/application.properties",
    );
  });
});
