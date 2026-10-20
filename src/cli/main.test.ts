/**
 * Focused CLI contract tests.
 *
 * Purpose: prove the published command surface — help, version, argument and
 * enum validation, conflicting input modes, the mandatory API key, output
 * formats, cancellation, and the exit-code / stream separation contract.
 *
 * Everything runs in process with injected dependencies. No real repository is
 * acquired, no OpenAI request is made, and no real API key is used.
 */

import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  CliUsageError,
  EXIT_CANCELLED,
  EXIT_FAILURE,
  EXIT_SUCCESS,
  EXIT_USAGE,
  parseCliArguments,
  runCli,
  USAGE,
  type CliDependencies,
} from "@/cli/main";
import { MandatorySynthesisError } from "@/lib/ai/synthesis";
import { RepositoryAcquisitionError } from "@/lib/repository/github";
import type { RepositorySnapshot } from "@/lib/repository/types";
import type { AnalysisReport } from "@/lib/report/contract";
import { DEVELOPMENT_VERSION } from "@/cli/version";

const SYNTHETIC_API_KEY = "test-key-not-a-credential";

function syntheticSnapshot(): RepositorySnapshot {
  return {
    repositoryLabel: "synthetic/fixture",
    sourceUrl: "https://github.com/synthetic/fixture",
    files: [],
    detectedStacks: ["TypeScript"],
    coverage: {
      discoveredRelevantFiles: 1,
      processedRelevantFiles: 1,
      skippedBinaryFiles: 0,
      skippedOversizedFiles: 0,
      unprocessedRelevantFiles: 0,
      processedTextBytes: 10,
      durationMs: 1,
      partial: false,
      limitsCrossed: [],
    },
    history: {
      source: "synthetic",
      availability: "available",
      repository: {
        scope: "Repository",
        sampledCommits: 4,
        attributedCommits: 4,
        activeContributors: 2,
        estimatedBusFactor: 2,
        topContributorShare: 50,
        band: "Moderate concentration",
      },
      modules: [],
      note: "Synthetic history fixture.",
    },
  } as RepositorySnapshot;
}

function syntheticReport(): AnalysisReport {
  return {
    schemaVersion: "1.0.0",
    heuristicVersion: "test",
    repositoryLabel: "synthetic/fixture",
    sourceUrl: "https://github.com/synthetic/fixture",
    generatedAt: "2026-01-01T00:00:00.000Z",
    verdict: "Fixable",
    score: 60,
    confidence: 70,
    disclaimer: "Automated snapshot, not an audit",
    verdictReason: "Synthetic report used by CLI contract tests.",
    context: {
      stage: "unknown",
      dataSensitivity: "unknown",
      growthTarget: "unknown",
    },
    coverage: syntheticSnapshot().coverage,
    detectedStacks: ["TypeScript"],
    domains: [],
    growth: {
      users10x: "Ready with conditions",
      users100x: "Insufficient evidence",
      team: "Conditional",
      agents: "Usable with guardrails",
    },
    busFactor: syntheticSnapshot().history,
    actions: [],
    checks: [],
    ai: {
      source: "gpt-5.6",
      model: "gpt-5.6-test-boundary",
      findingsIncluded: 0,
      totalFindings: 0,
      inputTokens: null,
      outputTokens: null,
      limited: false,
      note: "Synthetic synthesis meta used by CLI contract tests.",
    },
  } as AnalysisReport;
}

interface Harness {
  stdout: string;
  stderr: string;
  written: Array<{ filePath: string; contents: string }>;
  dependencies: Partial<CliDependencies>;
}

function harness(overrides: Partial<CliDependencies> = {}): Harness {
  const state: Harness = {
    stdout: "",
    stderr: "",
    written: [],
    dependencies: {},
  };
  state.dependencies = {
    stdout: (chunk) => {
      state.stdout += chunk;
    },
    stderr: (chunk) => {
      state.stderr += chunk;
    },
    env: { OPENAI_API_KEY: SYNTHETIC_API_KEY },
    acquireDemo: async () => syntheticSnapshot(),
    acquirePublic: async () => syntheticSnapshot(),
    analyze: async () => syntheticReport(),
    checkOutputPath: async () => {},
    writeReportFile: async (filePath, contents) => {
      state.written.push({ filePath, contents });
    },
    ...overrides,
  };
  return state;
}

describe("CLI argument parsing", () => {
  it("routes --help and --version before any validation", () => {
    expect(parseCliArguments(["--help"])).toEqual({ kind: "help" });
    expect(parseCliArguments(["-h"])).toEqual({ kind: "help" });
    expect(parseCliArguments(["--version"])).toEqual({ kind: "version" });
    expect(parseCliArguments(["-v"])).toEqual({ kind: "version" });
  });

  it("accepts one repository URL with every context enum", () => {
    const parsed = parseCliArguments([
      "https://github.com/owner/repository",
      "--stage",
      "scaling_production",
      "--data-sensitivity",
      "sensitive_regulated",
      "--growth-target",
      "users_100x",
      "--format",
      "json",
    ]);
    expect(parsed).toEqual({
      kind: "scan",
      mode: "github",
      repositoryUrl: "https://github.com/owner/repository",
      context: {
        stage: "scaling_production",
        dataSensitivity: "sensitive_regulated",
        growthTarget: "users_100x",
      },
      format: "json",
      outputPath: null,
    });
  });

  it("defaults every context enum to the neutral unknown value", () => {
    expect(parseCliArguments(["--demo"])).toMatchObject({
      kind: "scan",
      mode: "demo",
      repositoryUrl: null,
      context: {
        stage: "unknown",
        dataSensitivity: "unknown",
        growthTarget: "unknown",
      },
      format: "markdown",
    });
  });

  it.each([
    ["https://gitlab.com/owner/repository"],
    ["http://github.com/owner/repository"],
    ["https://github.com/owner/repository/tree/main"],
    ["https://github.com/owner"],
    ["https://user:token@github.com/owner/repository"],
    ["not-a-url"],
  ])("rejects %s as a usage error", (url) => {
    expect(() => parseCliArguments([url])).toThrow(CliUsageError);
  });

  it.each([
    [["--demo", "--stage", "seed"]],
    [["--demo", "--data-sensitivity", "pii"]],
    [["--demo", "--growth-target", "moon"]],
    [["--demo", "--format", "pdf"]],
  ])("rejects an unsupported enum value: %s", (argv) => {
    expect(() => parseCliArguments(argv)).toThrow(CliUsageError);
  });

  it("rejects conflicting, absent, and duplicated input modes", () => {
    expect(() =>
      parseCliArguments(["--demo", "https://github.com/owner/repository"]),
    ).toThrow(CliUsageError);
    expect(() => parseCliArguments([])).toThrow(CliUsageError);
    expect(() =>
      parseCliArguments([
        "https://github.com/owner/one",
        "https://github.com/owner/two",
      ]),
    ).toThrow(CliUsageError);
  });

  it("rejects unknown flags", () => {
    expect(() => parseCliArguments(["--demo", "--api-key", "value"])).toThrow(
      CliUsageError,
    );
    expect(() => parseCliArguments(["--demo", "--token=value"])).toThrow(
      CliUsageError,
    );
  });
});

describe("CLI command contract", () => {
  it("prints help on stdout with exit 0 and a silent stderr", async () => {
    const state = harness();
    const code = await runCli(["--help"], state.dependencies);
    expect(code).toBe(EXIT_SUCCESS);
    expect(state.stdout).toContain("Usage:");
    expect(state.stdout).toContain("--growth-target");
    expect(state.stderr).toBe("");
  });

  it("prints the version on stdout with exit 0", async () => {
    const state = harness();
    const code = await runCli(["--version"], state.dependencies);
    expect(code).toBe(EXIT_SUCCESS);
    expect(state.stdout.trim()).toBe(DEVELOPMENT_VERSION);
    expect(state.stderr).toBe("");
  });

  it("renders a Markdown report on stdout for valid arguments", async () => {
    const state = harness();
    const code = await runCli(
      [
        "https://github.com/owner/repository",
        "--stage",
        "live_early",
        "--data-sensitivity",
        "basic_personal",
        "--growth-target",
        "engineering_team",
      ],
      state.dependencies,
    );
    expect(code).toBe(EXIT_SUCCESS);
    expect(state.stdout.startsWith("# Scaleproof report:")).toBe(true);
    expect(state.stdout).toContain("Automated snapshot, not an audit");
    expect(state.stderr).toContain("scaleproof: done");
  });

  it("renders a JSON report on stdout", async () => {
    const state = harness();
    const code = await runCli(
      ["--demo", "--format", "json"],
      state.dependencies,
    );
    expect(code).toBe(EXIT_SUCCESS);
    const parsed: unknown = JSON.parse(state.stdout);
    expect(parsed).toMatchObject({
      schemaVersion: "1.0.0",
      verdict: "Fixable",
    });
  });

  it("passes the parsed context through to the analysis layer", async () => {
    let received: unknown = null;
    const state = harness({
      analyze: async (_snapshot, context) => {
        received = context;
        return syntheticReport();
      },
    });
    await runCli(
      ["--demo", "--stage", "prototype", "--growth-target", "users_and_team"],
      state.dependencies,
    );
    expect(received).toEqual({
      stage: "prototype",
      dataSensitivity: "unknown",
      growthTarget: "users_and_team",
    });
  });

  it("writes the report to --output and keeps stdout empty", async () => {
    const state = harness();
    const code = await runCli(
      ["--demo", "--output", "report.md"],
      state.dependencies,
    );
    expect(code).toBe(EXIT_SUCCESS);
    expect(state.stdout).toBe("");
    expect(state.written).toHaveLength(1);
    expect(state.written[0]?.filePath).toBe("report.md");
    expect(state.written[0]?.contents).toContain("# Scaleproof report:");
  });

  it("rejects an unusable --output path before acquisition or synthesis", async () => {
    let acquired = false;
    let analyzed = false;
    const state = harness({
      acquireDemo: async () => {
        acquired = true;
        return syntheticSnapshot();
      },
      analyze: async () => {
        analyzed = true;
        return syntheticReport();
      },
    });
    // The real path check runs here, not the harness stub.
    delete state.dependencies.checkOutputPath;
    const missingDirectory = path.join(os.tmpdir(), `scaleproof-missing-${randomUUID()}`);
    const code = await runCli(
      ["--demo", "--output", path.join(missingDirectory, "report.md")],
      state.dependencies,
    );
    expect(code).toBe(EXIT_USAGE);
    expect(acquired).toBe(false);
    expect(analyzed).toBe(false);
    expect(state.stderr).toContain("--output directory does not exist");
    expect(state.stderr).not.toContain(missingDirectory);
  });

  it("names the --output write as the failure when a complete report cannot be written", async () => {
    const state = harness({
      writeReportFile: async () => {
        throw new Error("EACCES: /private/report.md");
      },
    });
    const code = await runCli(
      ["--demo", "--output", "report.md"],
      state.dependencies,
    );
    expect(code).toBe(EXIT_FAILURE);
    expect(state.stderr).toContain("could not be written to the --output file");
    expect(state.stderr).not.toContain("/private");
  });

  it("does not promise an offline demo, because prioritization calls OpenAI", () => {
    expect(USAGE).not.toMatch(/no network/i);
  });

  it("reports invalid arguments on stderr with exit 2 and no stdout", async () => {
    for (const argv of [
      ["https://example.com/owner/repository"],
      ["--demo", "--stage", "seed"],
      ["--demo", "https://github.com/owner/repository"],
      [],
      ["--demo", "--api-key", "value"],
    ]) {
      const state = harness();
      const code = await runCli(argv, state.dependencies);
      expect(code, argv.join(" ")).toBe(EXIT_USAGE);
      expect(state.stdout, argv.join(" ")).toBe("");
      expect(state.stderr, argv.join(" ")).toContain("scaleproof: ");
    }
  });

  it("requires OPENAI_API_KEY from the environment", async () => {
    const state = harness({ env: {} });
    const code = await runCli(["--demo"], state.dependencies);
    expect(code).toBe(EXIT_USAGE);
    expect(state.stdout).toBe("");
    expect(state.stderr).toContain("OPENAI_API_KEY is not set");
    expect(state.stderr).toContain("never accepted as flags");
  });

  it("treats a blank OPENAI_API_KEY as missing", async () => {
    const state = harness({ env: { OPENAI_API_KEY: "   " } });
    expect(await runCli(["--demo"], state.dependencies)).toBe(EXIT_USAGE);
  });

  it("never starts a scan when the API key is missing", async () => {
    let acquired = false;
    const state = harness({
      env: {},
      acquireDemo: async () => {
        acquired = true;
        return syntheticSnapshot();
      },
    });
    await runCli(["--demo"], state.dependencies);
    expect(acquired).toBe(false);
  });

  it("returns 130 when the scan is cancelled during acquisition", async () => {
    const controller = new AbortController();
    const state = harness({
      signal: controller.signal,
      acquirePublic: async (_url, signal) => {
        controller.abort(
          new DOMException("The repository scan was cancelled.", "AbortError"),
        );
        throw (
          signal?.reason ??
          new DOMException("The repository scan was cancelled.", "AbortError")
        );
      },
    });
    const code = await runCli(
      ["https://github.com/owner/repository"],
      state.dependencies,
    );
    expect(code).toBe(EXIT_CANCELLED);
    expect(state.stdout).toBe("");
    expect(state.stderr).toContain("cancelled");
  });

  it("returns 130 when cancellation happens before the scan starts", async () => {
    const state = harness({ signal: AbortSignal.abort() });
    const code = await runCli(["--demo"], state.dependencies);
    expect(code).toBe(EXIT_CANCELLED);
    expect(state.stdout).toBe("");
  });

  it("maps an acquisition URL rejection to exit 2 and other failures to exit 1", async () => {
    const usage = harness({
      acquirePublic: async () => {
        throw new RepositoryAcquisitionError(
          "Enter a complete public GitHub repository URL.",
          "invalid_url",
        );
      },
    });
    expect(
      await runCli(["https://github.com/owner/repository"], usage.dependencies),
    ).toBe(EXIT_USAGE);

    const failure = harness({
      acquirePublic: async () => {
        throw new RepositoryAcquisitionError(
          "The 90-second repository acquisition limit was reached.",
          "duration_limit",
        );
      },
    });
    expect(
      await runCli(
        ["https://github.com/owner/repository"],
        failure.dependencies,
      ),
    ).toBe(EXIT_FAILURE);
  });

  it("cannot write a partial report after an acquisition failure", async () => {
    const state = harness({
      acquirePublic: async () => {
        throw new RepositoryAcquisitionError(
          "The repository could not be scanned.",
          "scan_failed",
        );
      },
    });
    const code = await runCli(
      ["https://github.com/owner/repository", "--output", "report.md"],
      state.dependencies,
    );
    expect(code).toBe(EXIT_FAILURE);
    expect(state.stdout).toBe("");
    expect(state.written).toHaveLength(0);
  });

  it("cannot write a partial report after a synthesis failure", async () => {
    const state = harness({
      analyze: async () => {
        throw new MandatorySynthesisError(
          "synthesis_unavailable",
          "OpenAI could not complete mandatory synthesis. Try the scan again.",
        );
      },
    });
    const code = await runCli(
      ["--demo", "--output", "report.md"],
      state.dependencies,
    );
    expect(code).toBe(EXIT_FAILURE);
    expect(state.stdout).toBe("");
    expect(state.written).toHaveLength(0);
    expect(state.stderr).toContain("mandatory synthesis");
  });

  it("does not print internal detail for an unexpected failure", async () => {
    const state = harness({
      analyze: async () => {
        throw new Error("/var/folders/tmp/scaleproof-abc123/owner-repository");
      },
    });
    const code = await runCli(["--demo"], state.dependencies);
    expect(code).toBe(EXIT_FAILURE);
    expect(state.stderr).not.toContain("/var/folders");
    expect(state.stderr).toContain("No repository content was retained.");
  });

  it("keeps the repository identifier out of progress output", async () => {
    const state = harness();
    await runCli(
      ["https://github.com/owner/repository", "--format", "json"],
      state.dependencies,
    );
    expect(state.stderr).not.toContain("github.com");
    expect(state.stderr).not.toContain("owner/repository");
    expect(state.stderr).not.toContain("synthetic/fixture");
    expect(state.stderr).not.toContain(SYNTHETIC_API_KEY);
  });
});
