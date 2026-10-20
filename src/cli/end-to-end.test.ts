/**
 * Synthetic end-to-end CLI test.
 *
 * Purpose: run the complete CLI seam — repository acquisition, deterministic
 * analysis, the real allowlisted synthesis payload builder, deterministic
 * reconciliation, the report contract, and Markdown/JSON rendering — against
 * the synthetic `fixtures/scaleproof-demo` repository.
 *
 * It proves the three durable guarantees of the packaged command:
 *   1. the same schema-valid report with no more than three actions;
 *   2. no partial report on stdout or at `--output` after a synthesis failure;
 *   3. the captured provider payload holds only the categorical allowlist.
 *
 * No network request, no real repository, and no real `OPENAI_API_KEY`.
 */

import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  acquireDemoSnapshot,
  type DemoAcquisitionOptions,
  type DemoFixture,
} from "@/cli/demo-fixture";
import { EXIT_FAILURE, EXIT_SUCCESS, runCli } from "@/cli/main";
import {
  MandatorySynthesisError,
  synthesizeFounderActions,
  type SynthesisDependencies,
} from "@/lib/ai/synthesis";
import { analyzeRepository } from "@/lib/application/analyze-repository";
import {
  safeParseAnalysisReport,
  type AnalysisReport,
} from "@/lib/report/contract";

const SYNTHETIC_API_KEY = "test-key-not-a-credential";

const PAYLOAD_KEYS = [
  "candidateActions",
  "confidence",
  "context",
  "domains",
  "findings",
  "growth",
  "heuristicVersion",
  "passCounts",
  "score",
  "verdict",
] as const;
const FINDING_KEYS = [
  "controlId",
  "evidenceTier",
  "outcome",
  "remediationCode",
  "severity",
  "weight",
] as const;

/**
 * Read the checkout fixture into the same relative-path map that the build
 * step embeds into the published bundle.
 */
async function readCheckoutFixture(): Promise<DemoFixture> {
  const root = path.join(process.cwd(), "fixtures", "scaleproof-demo");
  const fixture: DemoFixture = {};
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(target);
      } else if (entry.isFile()) {
        fixture[path.relative(root, target).split(path.sep).join("/")] =
          await readFile(target, "utf8");
      }
    }
  }
  await walk(root);
  return fixture;
}

interface CapturedRun {
  stdout: string;
  stderr: string;
  written: Array<{ filePath: string; contents: string }>;
  payloads: unknown[];
  exitCode: number;
}

/**
 * Run the CLI over the synthetic demo fixture with the real synthesis module
 * and a captured provider transport. The proposal is the deterministic action
 * order reversed, which exercises reconciliation without inventing codes.
 */
async function runSyntheticScan(
  argv: string[],
  options: { failSynthesis?: boolean; demo?: DemoAcquisitionOptions } = {},
): Promise<CapturedRun> {
  const run: CapturedRun = {
    stdout: "",
    stderr: "",
    written: [],
    payloads: [],
    exitCode: -1,
  };

  run.exitCode = await runCli(argv, {
    stdout: (chunk) => {
      run.stdout += chunk;
    },
    stderr: (chunk) => {
      run.stderr += chunk;
    },
    env: { OPENAI_API_KEY: SYNTHETIC_API_KEY },
    acquireDemo: () => acquireDemoSnapshot(options.demo),
    acquirePublic: async () => {
      throw new Error("The synthetic end-to-end test never leaves the fixture.");
    },
    analyze: (snapshot, context, signal, onSynthesisRetry, diagnostics) =>
      analyzeRepository(snapshot, context, {
        signal,
        onSynthesisRetry,
        diagnostics,
        synthesize: (input, onRetry) => {
          const requestProposal: NonNullable<
            SynthesisDependencies["requestProposal"]
          > = async (payload) => {
            run.payloads.push(structuredClone(payload));
            if (options.failSynthesis) {
              throw new MandatorySynthesisError(
                "synthesis_unavailable",
                "OpenAI could not complete mandatory synthesis. Try the scan again.",
              );
            }
            return {
              parsed: {
                actions: [...input.fallbackActions]
                  .reverse()
                  .map((action) => ({
                    remediationCode: action.remediationCode,
                  })),
              },
              model: "gpt-5.6-synthetic-capture",
              inputTokens: null,
              outputTokens: null,
            };
          };
          return synthesizeFounderActions(input, {
            onRetry,
            diagnostics,
            requestProposal,
          });
        },
      }),
    checkOutputPath: async () => {},
    writeReportFile: async (filePath, contents) => {
      run.written.push({ filePath, contents });
    },
  });

  return run;
}

function collectKeys(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectKeys(entry, into);
    }
  } else if (typeof value === "object" && value !== null) {
    for (const [key, entry] of Object.entries(value)) {
      into.add(key);
      collectKeys(entry, into);
    }
  }
  return into;
}

describe("synthetic end-to-end CLI run", () => {
  it("produces a schema-valid JSON report with at most three actions", async () => {
    const run = await runSyntheticScan([
      "--demo",
      "--format",
      "json",
      "--stage",
      "live_early",
      "--data-sensitivity",
      "basic_personal",
      "--growth-target",
      "users_10x",
    ]);

    expect(run.exitCode).toBe(EXIT_SUCCESS);
    const parsed = safeParseAnalysisReport(JSON.parse(run.stdout));
    expect(parsed.success).toBe(true);
    const report = parsed.data as AnalysisReport;
    expect(report.schemaVersion).toBe("1.0.0");
    expect(report.disclaimer).toBe("Automated snapshot, not an audit");
    expect(report.actions.length).toBeGreaterThan(0);
    expect(report.actions.length).toBeLessThanOrEqual(3);
    expect(report.actions.map((action) => action.rank)).toEqual(
      report.actions.map((_action, index) => index + 1),
    );
    expect(report.ai.source).toBe("gpt-5.6");
    expect(report.context).toEqual({
      stage: "live_early",
      dataSensitivity: "basic_personal",
      growthTarget: "users_10x",
    });
  });

  it("renders the same report as Markdown", async () => {
    const json = await runSyntheticScan(["--demo", "--format", "json"]);
    const markdown = await runSyntheticScan(["--demo"]);

    expect(markdown.exitCode).toBe(EXIT_SUCCESS);
    const report = JSON.parse(json.stdout) as AnalysisReport;
    expect(markdown.stdout).toContain(`# Scaleproof report: `);
    expect(markdown.stdout).toContain(`**Verdict:** ${report.verdict}`);
    expect(markdown.stdout).toContain("## Do now");
    expect(markdown.stdout).toContain(
      "No repository text, names, paths, snippets, secrets, or personal data were sent to OpenAI.",
    );
    expect(markdown.stdout.trimEnd().endsWith("Jozef Antony")).toBe(true);
  });

  it("keeps stderr free of repository identifiers, paths, and credentials", async () => {
    const run = await runSyntheticScan(["--demo", "--format", "json"]);
    const report = JSON.parse(run.stdout) as AnalysisReport;

    expect(run.stderr).not.toContain(report.repositoryLabel);
    expect(run.stderr).not.toContain("demo-startup");
    expect(run.stderr).not.toContain(SYNTHETIC_API_KEY);
    for (const check of report.checks) {
      for (const evidence of check.evidence) {
        expect(run.stderr).not.toContain(evidence.path);
      }
    }
  });

  it("writes no partial report to --output or stdout after a synthesis failure", async () => {
    const run = await runSyntheticScan(
      ["--demo", "--output", "must-not-exist.md"],
      { failSynthesis: true },
    );

    expect(run.exitCode).toBe(EXIT_FAILURE);
    expect(run.stdout).toBe("");
    expect(run.written).toHaveLength(0);
    expect(run.payloads.length).toBeGreaterThan(0);
  });

  it("sends only the categorical allowlist to the provider", async () => {
    const run = await runSyntheticScan(["--demo", "--format", "json"]);

    expect(run.payloads).toHaveLength(1);
    const payload = run.payloads[0] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([...PAYLOAD_KEYS]);

    const findings = payload.findings as Array<Record<string, unknown>>;
    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      expect(Object.keys(finding).sort()).toEqual([...FINDING_KEYS]);
    }
    for (const domain of payload.domains as Array<Record<string, unknown>>) {
      expect(Object.keys(domain).sort()).toEqual(["id", "score"]);
    }

    // No key anywhere in the payload can carry source, evidence, or identity.
    const keys = collectKeys(payload);
    for (const forbidden of [
      "evidence",
      "path",
      "paths",
      "summary",
      "title",
      "repositoryLabel",
      "sourceUrl",
      "detectedStacks",
      "busFactor",
      "coverage",
      "files",
      "content",
      "snippet",
      "contributors",
      "commits",
    ]) {
      expect(keys, forbidden).not.toContain(forbidden);
    }
  });

  it("keeps source, paths, repository identifiers, and secrets out of the payload", async () => {
    const run = await runSyntheticScan(["--demo", "--format", "json"]);
    const report = JSON.parse(run.stdout) as AnalysisReport;
    const serialized = JSON.stringify(run.payloads[0]);

    // Path separators cannot occur: control ids, remediation codes, domain
    // ids, enum values, and the heuristic version never contain one.
    expect(serialized).not.toContain("/");
    expect(serialized.toLowerCase()).not.toContain("github");
    expect(serialized).not.toContain(report.repositoryLabel);
    expect(serialized).not.toContain("demo-startup");
    expect(serialized).not.toContain(SYNTHETIC_API_KEY);
    expect(serialized).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/);
    expect(serialized).not.toMatch(/\.(ts|tsx|js|json|md|ya?ml|sql|toml)\b/);

    for (const check of report.checks) {
      for (const evidence of check.evidence) {
        expect(serialized, evidence.path).not.toContain(evidence.path);
      }
      expect(serialized, check.title).not.toContain(check.title);
      expect(serialized, check.id).not.toContain(check.summary);
    }
    for (const stack of report.detectedStacks) {
      expect(serialized, stack).not.toContain(stack);
    }
    expect(serialized).not.toContain(report.busFactor.note);
  });
});

describe("embedded demo fixture", () => {
  it("runs --demo with no fixture directory in the working directory", async () => {
    const fixture = await readCheckoutFixture();
    const absentCheckout = path.join(
      os.tmpdir(),
      `scaleproof-absent-${randomUUID()}`,
    );

    const run = await runSyntheticScan(["--demo", "--format", "json"], {
      demo: { fixture, checkoutRoot: absentCheckout },
    });

    expect(run.exitCode).toBe(EXIT_SUCCESS);
    const parsed = safeParseAnalysisReport(JSON.parse(run.stdout));
    expect(parsed.success).toBe(true);
    const report = parsed.data as AnalysisReport;
    expect(report.repositoryLabel).toBe("scaleproof/demo-startup");
    expect(report.actions.length).toBeGreaterThan(0);
    expect(report.actions.length).toBeLessThanOrEqual(3);
    expect(report.coverage.processedRelevantFiles).toBe(
      Object.keys(fixture).length,
    );
  });

  it("produces the same report from the embedded fixture and the checkout", async () => {
    const fixture = await readCheckoutFixture();
    const embedded = await runSyntheticScan(["--demo", "--format", "json"], {
      demo: {
        fixture,
        checkoutRoot: path.join(os.tmpdir(), `scaleproof-absent-${randomUUID()}`),
      },
    });
    const checkout = await runSyntheticScan(["--demo", "--format", "json"]);

    const normalize = (raw: string): AnalysisReport => {
      const report = JSON.parse(raw) as AnalysisReport;
      return {
        ...report,
        generatedAt: "normalized",
        coverage: { ...report.coverage, durationMs: 0 },
      };
    };
    expect(normalize(embedded.stdout)).toEqual(normalize(checkout.stdout));
  });
});
