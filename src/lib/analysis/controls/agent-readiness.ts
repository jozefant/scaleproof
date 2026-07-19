import * as signals from "../signals";
import type { ControlEvaluator } from "./shared";
import * as helpers from "./shared";

export const agentReadinessDetectorMetadata =
  helpers.defineDetectorMetadata([
    {
      id: "agent.instructions",
      claim: "Repository-level coding-agent instructions are present.",
      applicability: "Repositories intended for AI-assisted engineering.",
      requiredSignals: ["Recognized AGENTS, CLAUDE, Copilot, Cursor, or agent-instruction path"],
      disqualifyingSignals: ["General README without agent operating rules"],
      strongestEvidenceTier: "documented",
      confidenceLimitation:
        "Instruction presence does not prove accuracy, completeness, or agent compliance.",
      remediationCode: "add-agent-instructions",
    },
    {
      id: "agent.instructions-quality",
      claim: "Agent instructions cover at least three operating-context categories.",
      applicability: "Repositories with detected agent instructions.",
      requiredSignals: [
        "At least three of verification, architecture, security, completion, or prohibition guidance",
      ],
      disqualifyingSignals: ["Instruction file with only generic assistant guidance"],
      strongestEvidenceTier: "documented",
      confidenceLimitation:
        "Keyword categories do not prove commands and boundaries are correct or current.",
      remediationCode: "add-agent-instructions",
    },
    {
      id: "agent.harness-exists",
      claim: "A discoverable executable engineering harness is present.",
      applicability: "Repositories intended for independent agent changes.",
      requiredSignals: ["Build wrapper or manifest plus lint, type, test, or build command"],
      disqualifyingSignals: ["Documentation-only command references"],
      strongestEvidenceTier: "enforced",
      confidenceLimitation:
        "Command discovery does not prove a clean checkout can execute the harness.",
      remediationCode: "build-agent-harness",
    },
    {
      id: "agent.harness-depth",
      claim: "The harness exposes fast feedback and deeper verification paths.",
      applicability: "Repositories with an executable engineering harness.",
      requiredSignals: ["Fast lint/type/unit signal", "Deep integration, E2E, verify, or security signal"],
      disqualifyingSignals: ["Only one undifferentiated verification command"],
      strongestEvidenceTier: "enforced",
      confidenceLimitation:
        "Configured layers do not prove runtime, determinism, or diagnostic quality.",
      remediationCode: "build-agent-harness",
    },
    {
      id: "agent.feedback-loop",
      claim: "Automated tests and CI provide an independent feedback loop.",
      applicability: "Repositories expected to accept agent-authored changes.",
      requiredSignals: ["Automated test path", "Recognized CI workflow"],
      disqualifyingSignals: ["Tests without CI or CI without a test surface"],
      strongestEvidenceTier: "enforced",
      confidenceLimitation:
        "Presence does not prove the critical path is covered or merge-blocking.",
      remediationCode: "build-agent-harness",
    },
    {
      id: "agent.safety",
      claim: "Agent-specific safety rules or automated high-risk checks are present.",
      applicability: "Repositories where agents can modify code or configuration.",
      requiredSignals: ["Agent prohibition/guardrail or automated secret/security scanner"],
      disqualifyingSignals: ["Generic coding guidelines without risky-action boundaries"],
      strongestEvidenceTier: "enforced",
      confidenceLimitation:
        "Rules and scanners do not prove least privilege or prevent every unsafe action.",
      remediationCode: "add-agent-instructions",
    },
  ] as const);

export function agentReadinessControls(): ControlEvaluator[] {
  const instructionPaths = [
    /(^|\/)agents\.md$/,
    /(^|\/)claude\.md$/,
    /^\.github\/copilot-instructions\.md$/,
    /^\.cursor\/rules/,
    /(^|\/)agent-instructions\.md$/,
  ];

  return [
    (index) =>
      helpers.positiveControl({
        id: "agent.instructions",
        domain: "agent_readiness",
        title: "Repository agent instructions",
        missingSummary:
          "No repository-level operating instructions for coding agents were found.",
        passSummary:
          "Repository instructions give coding agents durable local context.",
        remediationCode: "add-agent-instructions",
        severity: "high",
        weight: 3,
        documented: signals.findPaths(index, instructionPaths),
      }),
    (index) => {
      const instructionFiles = index.files.filter((file) =>
        instructionPaths.some((pattern) => pattern.test(file.normalizedPath)),
      );
      const combined = instructionFiles.map((file) => file.content).join("\n");
      const qualitySignals = [
        /\b(build|test|lint|type.?check|verify)\b/i,
        /\b(architecture|module|boundary|dependency)\b/i,
        /\b(security|secret|pii|personal data|credential)\b/i,
        /\b(commit|pull request|review|definition of done|completion)\b/i,
        /\b(do not|never|must|guardrail|prohibited)\b/i,
      ].filter((pattern) => pattern.test(combined)).length;
      return helpers.positiveControl({
        id: "agent.instructions-quality",
        domain: "agent_readiness",
        title: "Agent instruction quality",
        missingSummary:
          "Agent instructions do not cover enough of verification, architecture, safety, and completion rules.",
        passSummary:
          "Agent instructions cover at least three operating-context categories.",
        remediationCode: "add-agent-instructions",
        severity: "medium",
        weight: 3,
        documented:
          qualitySignals >= 3 ? signals.findPaths(index, instructionPaths) : [],
      });
    },
    (index) => {
      const commandEvidence = signals.findContent(
        index,
        [
          /\b(lint|eslint|ruff|checkstyle)\b/i,
          /\b(typecheck|type-check|tsc|mypy)\b/i,
          /\b(test|vitest|jest|pytest|mvn verify|gradle test)\b/i,
          /\b(build|compile|package)\b/i,
        ],
        {
          pathPatterns: [
            /package\.json$/,
            /pom\.xml$/,
            /build\.gradle(\.kts)?$/,
            /makefile$/,
            /taskfile\.ya?ml$/,
            /\.sh$/,
          ],
          maxResults: 6,
        },
      );
      const wrappers = signals.findPaths(index, [
        /(^|\/)mvnw$/,
        /(^|\/)gradlew$/,
        /(^|\/)makefile$/,
        /(^|\/)taskfile\.ya?ml$/,
        /(^|\/)package\.json$/,
      ]);
      return helpers.positiveControl({
        id: "agent.harness-exists",
        domain: "agent_readiness",
        title: "Executable engineering harness",
        missingSummary:
          "The repository lacks a discoverable executable path for routine verification.",
        passSummary:
          "Build metadata exposes executable engineering commands.",
        remediationCode: "build-agent-harness",
        severity: "high",
        weight: 4,
        enforced: signals.mergeEvidence(commandEvidence, wrappers),
      });
    },
    (index) => {
      const fastChecks = signals.findContent(
        index,
        [/\b(lint|typecheck|type-check|test:unit|test-unit|checkstyle)\b/i],
        {
          pathPatterns: [
            /package\.json$/,
            /pom\.xml$/,
            /build\.gradle(\.kts)?$/,
            /makefile$/,
            /taskfile\.ya?ml$/,
            /\.github\/workflows\/.*\.ya?ml$/,
          ],
        },
      );
      const deepChecks = signals.findContent(
        index,
        [
          /\b(e2e|integration|verify|quality.?gate|security.?scan|dependency.?check)\b/i,
        ],
        {
          pathPatterns: [
            /package\.json$/,
            /pom\.xml$/,
            /build\.gradle(\.kts)?$/,
            /makefile$/,
            /taskfile\.ya?ml$/,
            /\.github\/workflows\/.*\.ya?ml$/,
          ],
        },
      );
      return helpers.positiveControl({
        id: "agent.harness-depth",
        domain: "agent_readiness",
        title: "Layered harness quality",
        missingSummary:
          "The harness does not clearly separate fast feedback from deeper verification.",
        passSummary:
          "The harness exposes both a fast feedback path and a deeper verification path.",
        remediationCode: "build-agent-harness",
        severity: "medium",
        weight: 3,
        enforced:
          fastChecks.length > 0 && deepChecks.length > 0
            ? signals.mergeEvidence(fastChecks, deepChecks)
            : [],
      });
    },
    (index) => {
      const tests = signals.findPaths(index, [
        /\.(spec|test)\.[cm]?[jt]sx?$/,
        /src\/test\/.*\.java$/,
        /(^|\/)tests?\//,
      ]);
      const workflows = signals.findPaths(index, [
        /^\.github\/workflows\/.*\.ya?ml$/,
        /(^|\/)\.gitlab-ci\.ya?ml$/,
        /azure-pipelines\.ya?ml$/,
      ]);
      return helpers.positiveControl({
        id: "agent.feedback-loop",
        domain: "agent_readiness",
        title: "Independent feedback loop",
        missingSummary:
          "An agent cannot independently prove a change through both tests and CI.",
        passSummary:
          "Automated tests and CI provide an independent feedback loop.",
        remediationCode: "build-agent-harness",
        severity: "high",
        weight: 4,
        enforced:
          tests.length > 0 && workflows.length > 0
            ? signals.mergeEvidence(tests, workflows)
            : [],
      });
    },
    (index) => {
      const safetyInstructions = signals.findContent(
        index,
        [
          /\b(do not|never|must not)\b.{0,100}\b(secret|credential|personal data|pii|commit|deploy)\b/is,
          /\b(dry.?run|least privilege|sandbox|protected path)\b/i,
        ],
        { pathPatterns: instructionPaths },
      );
      const automatedSafety = signals.findContent(
        index,
        [/\b(gitleaks|trufflehog|secretlint|semgrep|dependency-check|codeql)\b/i],
        {
          pathPatterns: [
            /\.github\/workflows\/.*\.ya?ml$/,
            /package\.json$/,
            /pom\.xml$/,
            /build\.gradle(\.kts)?$/,
          ],
        },
      );
      return helpers.positiveControl({
        id: "agent.safety",
        domain: "agent_readiness",
        title: "Agent safety guardrails",
        missingSummary:
          "No agent-specific safety rules or automated high-risk checks were found.",
        passSummary:
          "Documented agent guardrails or automated safety checks constrain risky changes.",
        remediationCode: "add-agent-instructions",
        severity: "high",
        weight: 3,
        enforced: automatedSafety,
        documented: safetyInstructions,
      });
    },
  ];
}
