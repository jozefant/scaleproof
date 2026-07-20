import { afterEach, describe, expect, it, vi } from "vitest";

import { analyzeRepository } from "@/lib/application/analyze-repository";
import { acquireDemoRepository } from "@/lib/repository/demo";
import {
  RepositoryAcquisitionError,
} from "@/lib/repository/github";
import {
  handleAnalyzeRequest,
  streamAnalyzeRequest,
  type AnalyzeRouteDependencies,
} from "@/lib/application/analyze-route";

const context = {
  stage: "unknown" as const,
  dataSensitivity: "unknown" as const,
  growthTarget: "unknown" as const,
};

const openAiClientConstructed = vi.hoisted(() => vi.fn());
vi.mock("openai", () => ({
  default: class {
    constructor() {
      openAiClientConstructed();
    }
  },
}));

async function analyzeWithoutExternalServices(
  snapshot: Parameters<typeof analyzeRepository>[0],
  context: Parameters<typeof analyzeRepository>[1],
  signal?: AbortSignal,
) {
  return analyzeRepository(snapshot, context, {
    signal,
    synthesize: async (input) => ({
      actions: input.fallbackActions,
      meta: {
        source: "gpt-5.6",
        model: "gpt-5.6-test",
        findingsIncluded: input.fallbackActions.length,
        totalFindings: input.fallbackActions.length,
        inputTokens: null,
        outputTokens: null,
        limited: false,
        note: "Injected mandatory synthesis completed in tests.",
      },
    }),
  });
}

function request(body: unknown, signal?: AbortSignal): Request {
  return new Request("http://localhost/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

function dependencies(
  overrides: Partial<AnalyzeRouteDependencies> = {},
): AnalyzeRouteDependencies {
  return {
    acquireDemo: acquireDemoRepository,
    acquirePublic: async () => acquireDemoRepository(),
    analyze: analyzeWithoutExternalServices,
    ...overrides,
  };
}

describe("POST /api/analyze contract", () => {
  afterEach(() => {
    expect(openAiClientConstructed).not.toHaveBeenCalled();
    openAiClientConstructed.mockClear();
  });

  it("validates requests and always returns no-store headers", async () => {
    const response = await handleAnalyzeRequest(
      request({ source: "github", context }),
      dependencies(),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toMatchObject({
      error: "A public GitHub repository URL is required.",
    });
  });

  it("maps acquisition failures to founder-safe status codes", async () => {
    const response = await handleAnalyzeRequest(
      request({
        source: "github",
        repositoryUrl: "https://github.com/example/repository",
        context,
      }),
      dependencies({
        acquirePublic: async () => {
          throw new RepositoryAcquisitionError(
            "The compressed repository archive exceeds the limit.",
            "archive_too_large",
          );
        },
      }),
    );

    expect(response.status).toBe(413);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("returns a schema-valid report after injected mandatory synthesis", async () => {
    const response = await handleAnalyzeRequest(
      request({ source: "demo", context }),
      dependencies(),
    );
    const report = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(report).toMatchObject({
      schemaVersion: "1.0.0",
      ai: { source: "gpt-5.6" },
    });
    expect(report.actions.length).toBeLessThanOrEqual(3);
  });

  it("maps mandatory synthesis failure to a no-report 503", async () => {
    const response = await handleAnalyzeRequest(
      request({ source: "demo", context }),
      dependencies({
        analyze: async () => {
          const { MandatorySynthesisError } = await import("@/lib/ai/synthesis");
          throw new MandatorySynthesisError("synthesis_unavailable", "unavailable");
        },
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error:
        "OpenAI could not complete the required action prioritization. Try this scan again.",
      code: "synthesis_unavailable",
    });
  });

  it("streams privacy-safe synthesis retry progress before the report", async () => {
    const response = streamAnalyzeRequest(
      request({ source: "demo", context }),
      dependencies({
        analyze: async (
          snapshot,
          scanContext,
          signal,
          onSynthesisRetry,
        ) => {
          onSynthesisRetry?.(2, 1_000);
          return analyzeWithoutExternalServices(
            snapshot,
            scanContext,
            signal,
          );
        },
      }),
    );
    const events = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/x-ndjson",
    );
    expect(events[0]).toEqual({
      type: "synthesis_retry",
      attempt: 2,
      maxAttempts: 6,
      delayMs: 1_000,
    });
    expect(events[1]).toMatchObject({
      type: "report",
      report: {
        schemaVersion: "1.0.0",
        ai: { source: "gpt-5.6" },
      },
    });
  });

  it("preserves partial-scan output through the public contract", async () => {
    const snapshot = await acquireDemoRepository();
    snapshot.coverage = {
      ...snapshot.coverage,
      discoveredRelevantFiles:
        snapshot.coverage.processedRelevantFiles + 3,
      unprocessedRelevantFiles: 3,
      partial: true,
      limitsCrossed: ["file_count"],
    };
    const response = await handleAnalyzeRequest(
      request({
        source: "github",
        repositoryUrl: "https://github.com/example/repository",
        context,
      }),
      dependencies({ acquirePublic: async () => snapshot }),
    );
    const report = await response.json();

    expect(response.status).toBe(200);
    expect(report.coverage).toMatchObject({
      partial: true,
      unprocessedRelevantFiles: 3,
    });
    expect(report.verdict).not.toBe("Fundable");
  });

  it("propagates client cancellation through application analysis", async () => {
    const controller = new AbortController();
    let analysisSignal: AbortSignal | undefined;
    const response = await handleAnalyzeRequest(
      request({ source: "demo", context }, controller.signal),
      dependencies({
        analyze: async (_snapshot, _context, signal) => {
          analysisSignal = signal;
          controller.abort();
          throw signal?.reason;
        },
      }),
    );

    expect(analysisSignal?.aborted).toBe(true);
    expect(response.status).toBe(499);
    await expect(response.json()).resolves.toMatchObject({
      code: "cancelled",
    });
  });

  it("returns a safe error after an analysis failure", async () => {
    const response = await handleAnalyzeRequest(
      request({ source: "demo", context }),
      dependencies({
        analyze: async () => {
          throw new Error("private implementation detail");
        },
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error:
        "Scaleproof could not complete this scan. No repository content was retained.",
    });
  });
});
