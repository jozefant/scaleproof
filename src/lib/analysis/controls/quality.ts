import * as signals from "../signals";
import type { ControlEvaluator } from "./shared";
import * as helpers from "./shared";
import type { EvidenceReference } from "../types";

type TestFamily = "javascript" | "python" | "java";

const TEST_FAMILY_PATTERNS: Record<TestFamily, RegExp[]> = {
  javascript: [/\.(spec|test)\.[cm]?[jt]sx?$/i],
  python: [/(^|\/)(?:test_[^/]*|[^/]+_test)\.py$/i, /(^|\/)tests?\/.*\.py$/i],
  java: [/src\/test\/.*\.java$/i, /(^|\/)[^/]*Test\.java$/],
};
const RUNNER_PATTERNS: Record<TestFamily, RegExp> = {
  javascript: /\b(vitest|jest|playwright|cypress)\b/i,
  python: /\bpytest\b/i,
  java: /\b(?:mvn(?:w)?\s+(?:test|verify)|gradle(?:w)?\s+test)\b/i,
};
const CI_PATH = [/^\.github\/workflows\//, /^\.circleci\//, /(^|\/)\.gitlab-ci\.ya?ml$/, /azure-pipelines\.ya?ml$/];

function testFiles(index: Parameters<ControlEvaluator>[0], family?: TestFamily): EvidenceReference[] {
  const patterns = family ? TEST_FAMILY_PATTERNS[family] : Object.values(TEST_FAMILY_PATTERNS).flat();
  return signals.findPaths(index, patterns, 6);
}

function runnerEvidence(index: Parameters<ControlEvaluator>[0], family: TestFamily): EvidenceReference[] {
  const packageScripts = signals.findContentMatching(index, (content) => {
    try {
      const manifest = JSON.parse(content) as { scripts?: Record<string, unknown> };
      return Object.values(manifest.scripts ?? {}).some(
        (script) => typeof script === "string" && RUNNER_PATTERNS[family].test(script),
      );
    } catch {
      return false;
    }
  }, { pathPatterns: [/package\.json$/] });
  const ciCommands = signals.findContent(index, [RUNNER_PATTERNS[family]], { pathPatterns: CI_PATH });
  return signals.mergeEvidence(packageScripts, ciCommands);
}

function compatibleTestEvidence(index: Parameters<ControlEvaluator>[0]): EvidenceReference[] {
  return signals.mergeEvidence(
    ...(["javascript", "python", "java"] as const).flatMap((family) => {
      const tests = testFiles(index, family);
      const runners = runnerEvidence(index, family);
      return tests.length > 0 && runners.length > 0 ? [tests, runners] : [];
    }),
  );
}

export const qualityDetectorMetadata = helpers.defineDetectorMetadata([
  {
    id: "quality.tests",
    claim: "An automated test surface is present.",
    applicability: "Repositories containing executable application or library code.",
    requiredSignals: ["Recognized test file or test directory"],
    disqualifyingSignals: ["Documentation that only mentions testing"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation:
      "Test presence does not establish coverage, reliability, or execution in CI.",
    remediationCode: "add-test-layers",
  },
  {
    id: "quality.test-layers",
    claim: "Fast tests and a user-path or integration layer are both present.",
    applicability: "Applications with critical user or integration journeys.",
    requiredSignals: ["Unit-style test files", "End-to-end or integration test path"],
    disqualifyingSignals: ["Only one test layer"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation:
      "File paths do not prove that the suites cover the highest-risk journeys.",
    remediationCode: "add-test-layers",
  },
  {
    id: "quality.ci",
    claim: "A recognized continuous-integration workflow is present.",
    applicability: "Repositories using a shared merge or push workflow.",
    requiredSignals: ["GitHub, GitLab, CircleCI, or Azure pipeline configuration"],
    disqualifyingSignals: ["Local scripts without a CI workflow"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation:
      "Workflow presence does not prove branch protection or successful execution.",
    remediationCode: "add-quality-gate",
  },
  {
    id: "quality.fast-gates",
    claim: "Repeatable quality commands are exposed in build or CI configuration.",
    applicability: "Repositories with an executable engineering workflow.",
    requiredSignals: ["Lint, type, test, verify, or security command in build metadata"],
    disqualifyingSignals: ["Quality terminology outside executable configuration"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation:
      "Configured commands do not prove they are fast, complete, or merge-blocking.",
    remediationCode: "add-quality-gate",
  },
  {
    id: "quality.coverage",
    claim: "Coverage measurement or a threshold is configured.",
    applicability: "Repositories whose test stack supports coverage measurement.",
    requiredSignals: ["Coverage service/configuration or explicit minimum threshold"],
    disqualifyingSignals: ["Coverage badge or prose without configuration"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation:
      "Coverage configuration does not prove meaningful assertions or current results.",
    remediationCode: "add-quality-gate",
  },
  {
    id: "quality.dependencies",
    claim: "Dependency updates are automated or governed.",
    applicability: "Repositories using third-party dependencies.",
    requiredSignals: ["Dependabot or Renovate configuration, or explicit update policy"],
    disqualifyingSignals: ["Package manifest without maintenance automation or policy"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation:
      "Configuration does not prove timely review or safe dependency upgrades.",
    remediationCode: "add-quality-gate",
  },
] as const);

export function qualityControls(): ControlEvaluator[] {
  return [
    (index) => {
      const tests = testFiles(index);
      const enforced = compatibleTestEvidence(index);
      return helpers.positiveControl({
        id: "quality.tests",
        domain: "quality",
        title: "Automated tests",
        missingSummary: "No meaningful automated test surface was found.",
        passSummary:
          "Automated tests are present and can protect future refactoring.",
        remediationCode: "add-test-layers",
        severity: "high",
        weight: 4,
        enforced,
        partial: tests,
      });
    },
    (index) => {
      const e2e = signals.findPaths(index, [
        /playwright/,
        /cypress/,
        /e2e.*\.(spec|test)/,
      ]);
      const unit = signals.findPaths(index, [
        /\.(spec|test)\.[cm]?[jt]sx?$/,
        /src\/test\/.*\.java$/,
      ]);
      const compatible = compatibleTestEvidence(index);
      return helpers.positiveControl({
        id: "quality.test-layers",
        domain: "quality",
        title: "Layered test strategy",
        missingSummary:
          "The test suite does not show both fast logic checks and user-path coverage.",
        passSummary:
          "The repository combines fast tests with an end-to-end or integration path.",
        remediationCode: "add-test-layers",
        severity: "medium",
        weight: 2,
        enforced: unit.length > 0 && e2e.length > 0 && compatible.length > 0
          ? signals.mergeEvidence(unit, e2e, compatible)
          : [],
        partial: signals.mergeEvidence(unit, e2e),
      });
    },
    (index) =>
      helpers.positiveControl({
        id: "quality.ci",
        domain: "quality",
        title: "Continuous integration",
        missingSummary:
          "No automated merge or push verification workflow was found.",
        passSummary:
          "A CI workflow provides repeatable verification outside developer machines.",
        remediationCode: "add-quality-gate",
        severity: "high",
        weight: 3,
        enforced: signals.findPaths(index, [
          /^\.github\/workflows\/.*\.ya?ml$/,
          /^\.circleci\/config\.ya?ml$/,
          /(^|\/)\.gitlab-ci\.ya?ml$/,
          /azure-pipelines\.ya?ml$/,
        ]),
      }),
    (index) => {
      const commands = signals.findContent(
        index,
        [
          /\b(lint|typecheck|checkstyle|verify|test|security.scan)\b/i,
        ],
        {
          pathPatterns: [
            /package\.json$/,
            /pom\.xml$/,
            /build\.gradle/,
            /^\.github\/workflows\//,
            /^\.circleci\//,
            /(^|\/)makefile$/,
            /(^|\/)doctor$/,
          ],
        },
      );
      return helpers.positiveControl({
        id: "quality.fast-gates",
        domain: "quality",
        title: "Fast quality gates",
        missingSummary:
          "Tests, lint, types, or security checks are not wired into a clear verification entry point.",
        passSummary:
          "The repository exposes repeatable quality checks suitable for every change.",
        remediationCode: "add-quality-gate",
        severity: "high",
        weight: 3,
        enforced: commands,
      });
    },
    (index) =>
      helpers.positiveControl({
        id: "quality.coverage",
        domain: "quality",
        title: "Coverage enforcement",
        missingSummary:
          "Coverage may be measured, but no enforceable threshold was found.",
        passSummary:
          "Coverage measurement or thresholds are part of the repository configuration.",
        remediationCode: "add-quality-gate",
        severity: "medium",
        weight: 2,
        enforced: signals.mergeEvidence(
          signals.findPaths(index, [
            /codecov/,
            /coveralls/,
            /jacoco/,
            /nyc\.config/,
          ]),
          signals.findContent(
            index,
            [/\b(coverageThreshold|minimum.*coverage|jacoco.*minimum)\b/i],
            {
              pathPatterns: [
                /package\.json$/,
                /vitest/,
                /jest/,
                /pom\.xml$/,
                /gradle/,
              ],
            },
          ),
        ),
      }),
    (index) =>
      helpers.positiveControl({
        id: "quality.dependencies",
        domain: "quality",
        title: "Dependency maintenance",
        missingSummary:
          "No automated dependency update or maintenance policy was found.",
        passSummary:
          "Dependency updates are automated or explicitly governed.",
        remediationCode: "add-quality-gate",
        severity: "low",
        weight: 1,
        enforced: signals.findPaths(index, [
          /^\.github\/dependabot\.ya?ml$/,
          /renovate\.json/,
          /renovate\.json5/,
        ]),
        documented: signals.findContent(
          index,
          [/\b(dependabot|renovate|dependency update)\b/i],
          { pathPatterns: [/\.md$/] },
        ),
      }),
  ];
}
