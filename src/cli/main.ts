/**
 * Scaleproof CLI adapter.
 *
 * Purpose: run the existing public-GitHub scan pipeline from a terminal
 * without the HTTP route, Next.js, or React. It parses arguments with
 * `node:util`, calls the repository, application, and report modules directly,
 * and prints one report to stdout (or an explicitly requested file).
 *
 * Usage:
 *   scaleproof https://github.com/owner/repository
 *   scaleproof --demo --format json
 *
 * Every dependency is injectable so the whole command is testable in process.
 * `runCli` never throws and never calls `process.exit`; it returns the exit
 * code and leaves process control to the launcher.
 *
 * Privacy: stderr carries progress only. It never contains the repository URL,
 * repository name, file paths, source text, contributor data, or credentials.
 */

import { parseArgs } from "node:util";

import { analyzeRepository } from "@/lib/application/analyze-repository";
import {
  MandatorySynthesisError,
  MAX_SYNTHESIS_ATTEMPTS,
  type SynthesisRetryHandler,
} from "@/lib/ai/synthesis";
import {
  createExternalServiceDiagnostics,
  type ExternalServiceDiagnostics,
} from "@/lib/diagnostics/external-service";
import {
  acquirePublicRepository,
  RepositoryAcquisitionError,
} from "@/lib/repository/github";
import type { RepositorySnapshot } from "@/lib/repository/types";
import type {
  AnalysisReport,
  DataSensitivity,
  GrowthTarget,
  ScanContext,
  Stage,
} from "@/lib/report/contract";
import { renderMarkdownReport } from "@/lib/report/markdown";
import { parsePublicGitHubRepositoryUrl } from "@/lib/shared/github-url";
import { CLI_VERSION } from "@/cli/version";
import { acquireDemoSnapshot } from "@/cli/demo-fixture";
import { CliUsageError } from "@/cli/errors";

/** Process exit codes. They are part of the published CLI contract. */
export const EXIT_SUCCESS = 0;
/** The scan started but could not complete. Retrying may succeed. */
export const EXIT_FAILURE = 1;
/** The invocation or environment is wrong. Retrying identically will not help. */
export const EXIT_USAGE = 2;
/** The operator cancelled the scan (SIGINT or an aborted signal). */
export const EXIT_CANCELLED = 130;

export type OutputFormat = "markdown" | "json";

const STAGES: readonly Stage[] = [
  "prototype",
  "live_early",
  "scaling_production",
  "unknown",
  "withheld",
];
const DATA_SENSITIVITIES: readonly DataSensitivity[] = [
  "none",
  "basic_personal",
  "sensitive_regulated",
  "unknown",
  "withheld",
];
const GROWTH_TARGETS: readonly GrowthTarget[] = [
  "users_10x",
  "users_100x",
  "engineering_team",
  "users_and_team",
  "unknown",
  "withheld",
];
const OUTPUT_FORMATS: readonly OutputFormat[] = ["markdown", "json"];

export interface CliDependencies {
  /** Report and help text sink. */
  stdout: (chunk: string) => void;
  /** Progress and diagnostics sink. Never receives report content. */
  stderr: (chunk: string) => void;
  env: Record<string, string | undefined>;
  /** Cancellation from SIGINT or a test. */
  signal?: AbortSignal;
  acquireDemo: () => Promise<RepositorySnapshot>;
  acquirePublic: (
    repositoryUrl: string,
    signal?: AbortSignal,
    diagnostics?: ExternalServiceDiagnostics,
  ) => Promise<RepositorySnapshot>;
  analyze: (
    snapshot: RepositorySnapshot,
    context: ScanContext,
    signal?: AbortSignal,
    onSynthesisRetry?: SynthesisRetryHandler,
    diagnostics?: ExternalServiceDiagnostics,
  ) => Promise<AnalysisReport>;
  /** Only ever called with a complete, schema-valid report. */
  writeReportFile: (filePath: string, contents: string) => Promise<void>;
}

// A caller mistake or a missing prerequisite is reported on stderr with
// `EXIT_USAGE`. It is re-exported so the command surface stays one import.
export { CliUsageError };

export interface CliScan {
  kind: "scan";
  mode: "demo" | "github";
  repositoryUrl: string | null;
  context: ScanContext;
  format: OutputFormat;
  outputPath: string | null;
}

/** `--help` and `--version` short-circuit before any validation or scan. */
export type CliInvocation =
  | CliScan
  | { kind: "help" }
  | { kind: "version" };

export const USAGE = `Scaleproof - evidence-based scale readiness for one public GitHub repository.

Usage:
  scaleproof <https://github.com/owner/repository> [options]
  scaleproof --demo [options]

Input (exactly one is required):
  <url>                     One public GitHub repository root URL.
  --demo                    Analyze the synthetic demo repository that is
                            embedded in this command. Needs no network access.

Options:
  --stage <value>              prototype | live_early | scaling_production |
                               unknown | withheld            (default: unknown)
  --data-sensitivity <value>   none | basic_personal | sensitive_regulated |
                               unknown | withheld            (default: unknown)
  --growth-target <value>      users_10x | users_100x | engineering_team |
                               users_and_team | unknown | withheld
                                                             (default: unknown)
  --format <value>             markdown | json             (default: markdown)
  --output <file>              Write the report to a file instead of stdout.
  -h, --help                   Print this help and exit.
  -v, --version                Print the CLI version and exit.

Environment:
  OPENAI_API_KEY            Required. Action prioritization is mandatory.
                            Credentials are never accepted as flags.

Exit codes:
  0   A complete report was produced.
  1   The scan started but could not complete. Retrying may succeed.
  2   The invocation or environment is wrong.
  130 The scan was cancelled.

Privacy:
  Only public GitHub repository root URLs are supported. No source text, file
  paths, repository identifiers, commit data, or contributor identities are
  sent to OpenAI. Downloaded archives are deleted on success and on failure.

Report brand: Jozef Antony. Every result is an automated snapshot, not an audit.
`;

function requireEnum<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
  flag: string,
  fallback: T,
): T {
  if (raw === undefined) {
    return fallback;
  }
  if ((allowed as readonly string[]).includes(raw)) {
    return raw as T;
  }
  throw new CliUsageError(
    `The value for ${flag} is not supported. Use one of: ${allowed.join(", ")}.`,
  );
}

/**
 * Translate argv into a validated invocation. Throws `CliUsageError` for every
 * caller mistake so the command never begins a scan it cannot finish.
 */
export function parseCliArguments(argv: readonly string[]): CliInvocation {
  let values: {
    demo?: boolean;
    stage?: string;
    "data-sensitivity"?: string;
    "growth-target"?: string;
    format?: string;
    output?: string;
    help?: boolean;
    version?: boolean;
  };
  let positionals: string[];

  try {
    const parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        demo: { type: "boolean", default: false },
        stage: { type: "string" },
        "data-sensitivity": { type: "string" },
        "growth-target": { type: "string" },
        format: { type: "string" },
        output: { type: "string" },
        help: { type: "boolean", short: "h", default: false },
        version: { type: "boolean", short: "v", default: false },
      },
    });
    values = parsed.values;
    positionals = parsed.positionals;
  } catch {
    // node:util reports the offending token, which is caller-supplied text.
    // Print the stable usage pointer instead of echoing the raw argument.
    throw new CliUsageError(
      "The arguments are not valid. Run `scaleproof --help` for supported options.",
    );
  }

  if (values.help) {
    return { kind: "help" };
  }
  if (values.version) {
    return { kind: "version" };
  }

  if (positionals.length > 1) {
    throw new CliUsageError(
      "Analyze exactly one repository. Pass a single public GitHub repository root URL.",
    );
  }
  if (values.demo && positionals.length === 1) {
    throw new CliUsageError(
      "Choose one input mode. Pass either a repository URL or --demo, not both.",
    );
  }
  if (!values.demo && positionals.length === 0) {
    throw new CliUsageError(
      "No input. Pass a public GitHub repository root URL or --demo.",
    );
  }

  let repositoryUrl: string | null = null;
  if (!values.demo) {
    const candidate = positionals[0];
    const parsedUrl = parsePublicGitHubRepositoryUrl(candidate);
    if (!parsedUrl.ok) {
      throw new CliUsageError(urlRejection(parsedUrl.reason));
    }
    repositoryUrl = parsedUrl.value.sourceUrl;
  }

  const output = values.output?.trim();
  if (values.output !== undefined && !output) {
    throw new CliUsageError("The value for --output must be a file path.");
  }

  return {
    kind: "scan",
    mode: values.demo ? "demo" : "github",
    repositoryUrl,
    context: {
      stage: requireEnum(values.stage, STAGES, "--stage", "unknown"),
      dataSensitivity: requireEnum(
        values["data-sensitivity"],
        DATA_SENSITIVITIES,
        "--data-sensitivity",
        "unknown",
      ),
      growthTarget: requireEnum(
        values["growth-target"],
        GROWTH_TARGETS,
        "--growth-target",
        "unknown",
      ),
    },
    format: requireEnum(values.format, OUTPUT_FORMATS, "--format", "markdown"),
    outputPath: output ?? null,
  };
}

function urlRejection(
  reason: "incomplete" | "unsupported" | "nested" | "invalid_segment",
): string {
  if (reason === "nested") {
    return "Use the repository root URL, not a branch, file, issue, or pull request URL.";
  }
  if (reason === "invalid_segment") {
    return "The GitHub owner or repository name is not valid.";
  }
  if (reason === "incomplete") {
    return "Enter a complete public GitHub repository URL.";
  }
  return "Only public https://github.com/owner/repository URLs are supported.";
}

function isCancellation(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) {
    return true;
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }
  return (
    error instanceof RepositoryAcquisitionError && error.code === "cancelled"
  );
}

function defaultDependencies(): CliDependencies {
  return {
    stdout: (chunk) => {
      process.stdout.write(chunk);
    },
    stderr: (chunk) => {
      process.stderr.write(chunk);
    },
    env: process.env,
    // The demo fixture is compiled into the published bundle, so --demo works
    // from any working directory and needs no fixture directory on disk.
    acquireDemo: () => acquireDemoSnapshot(),
    acquirePublic: acquirePublicRepository,
    analyze: (snapshot, context, signal, onSynthesisRetry, diagnostics) =>
      analyzeRepository(snapshot, context, {
        signal,
        onSynthesisRetry,
        diagnostics,
      }),
    writeReportFile: async (filePath, contents) => {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(filePath, contents, "utf8");
    },
  };
}

/**
 * Run one CLI invocation and return its exit code.
 *
 * The report is rendered only after `analyze` resolves with a schema-valid
 * report, so an acquisition or synthesis failure can never emit a partial
 * report to stdout or to `--output`.
 */
export async function runCli(
  argv: readonly string[],
  overrides: Partial<CliDependencies> = {},
): Promise<number> {
  const dependencies: CliDependencies = {
    ...defaultDependencies(),
    ...overrides,
  };
  const { stdout, stderr, signal } = dependencies;
  const progress = (message: string): void => {
    stderr(`scaleproof: ${message}\n`);
  };

  let parsed: CliInvocation;
  try {
    parsed = parseCliArguments(argv);
  } catch (error) {
    stderr(
      `scaleproof: ${error instanceof CliUsageError ? error.message : "The arguments are not valid."}\n`,
    );
    stderr("scaleproof: run `scaleproof --help` for supported options.\n");
    return EXIT_USAGE;
  }

  if (parsed.kind === "help") {
    stdout(USAGE);
    return EXIT_SUCCESS;
  }
  if (parsed.kind === "version") {
    stdout(`${CLI_VERSION}\n`);
    return EXIT_SUCCESS;
  }
  const invocation = parsed;

  if (!dependencies.env.OPENAI_API_KEY?.trim()) {
    stderr(
      "scaleproof: OPENAI_API_KEY is not set. Action prioritization is mandatory; export the key in the environment. Credentials are never accepted as flags.\n",
    );
    return EXIT_USAGE;
  }

  if (signal?.aborted) {
    progress("cancelled before the scan started");
    return EXIT_CANCELLED;
  }

  // Diagnostics default to console, which would interleave with a JSON report
  // on stdout. Route the allowlisted event contract to stderr instead.
  const diagnostics = createExternalServiceDiagnostics(
    crypto.randomUUID(),
    (event) => {
      stderr(`${JSON.stringify(event)}\n`);
    },
  );

  try {
    progress(
      invocation.mode === "demo"
        ? "acquiring the synthetic demo repository"
        : "acquiring the public repository archive",
    );
    const snapshot =
      invocation.mode === "demo"
        ? await dependencies.acquireDemo()
        : await dependencies.acquirePublic(
            invocation.repositoryUrl ?? "",
            signal,
            diagnostics,
          );

    progress("running deterministic analysis and mandatory prioritization");
    const report = await dependencies.analyze(
      snapshot,
      invocation.context,
      signal,
      (attempt, delayMs) => {
        progress(
          `retrying action prioritization (attempt ${attempt} of ${MAX_SYNTHESIS_ATTEMPTS}, waiting ${delayMs} ms)`,
        );
      },
      diagnostics,
    );

    const rendered =
      invocation.format === "json"
        ? `${JSON.stringify(report, null, 2)}\n`
        : `${renderMarkdownReport(report)}\n`;

    if (invocation.outputPath) {
      await dependencies.writeReportFile(invocation.outputPath, rendered);
      progress("report written to the requested output file");
    } else {
      stdout(rendered);
    }
    progress("done");
    return EXIT_SUCCESS;
  } catch (error) {
    if (isCancellation(error, signal)) {
      progress("the scan was cancelled; temporary data was deleted");
      return EXIT_CANCELLED;
    }
    if (error instanceof CliUsageError) {
      stderr(`scaleproof: ${error.message}\n`);
      return EXIT_USAGE;
    }
    if (error instanceof RepositoryAcquisitionError) {
      // Acquisition messages are fixed, privacy-safe strings.
      stderr(`scaleproof: ${error.message}\n`);
      return error.code === "invalid_url" ? EXIT_USAGE : EXIT_FAILURE;
    }
    if (error instanceof MandatorySynthesisError) {
      stderr(`scaleproof: ${error.message}\n`);
      return EXIT_FAILURE;
    }
    // An unexpected error message may carry a temporary path or repository
    // detail, so it is never printed.
    stderr(
      "scaleproof: the scan could not be completed. No repository content was retained.\n",
    );
    return EXIT_FAILURE;
  }
}
