import type {
  CheckResult,
  DataSensitivity,
  EvidenceReference,
  EvidenceTier,
  Outcome,
  ScanContext,
  Severity,
} from "./types";
import {
  countSourceAreas,
  createRepositoryIndex,
  findContent,
  findPaths,
  hasDurableData,
  mergeEvidence,
  type RepositoryIndex,
} from "./signals";

interface ResultInput {
  id: string;
  domain: CheckResult["domain"];
  title: string;
  summary: string;
  remediationCode: string;
  severity: Severity;
  weight: number;
  outcome: Outcome;
  evidenceTier: EvidenceTier;
  evidence?: EvidenceReference[];
}

type ControlEvaluator = (
  index: RepositoryIndex,
  context: ScanContext,
) => CheckResult;

function result(input: ResultInput): CheckResult {
  return {
    ...input,
    evidence: input.evidence ?? [],
  };
}

function positiveControl(input: {
  id: string;
  domain: CheckResult["domain"];
  title: string;
  missingSummary: string;
  passSummary: string;
  remediationCode: string;
  severity: Severity;
  weight: number;
  enforced?: EvidenceReference[];
  inferred?: EvidenceReference[];
  documented?: EvidenceReference[];
  partial?: EvidenceReference[];
  applicable?: boolean;
  contextUnknown?: boolean;
}): CheckResult {
  const control = {
    id: input.id,
    domain: input.domain,
    title: input.title,
    remediationCode: input.remediationCode,
    severity: input.severity,
    weight: input.weight,
  };
  if (input.enforced?.length) {
    return result({
      ...control,
      summary: input.passSummary,
      outcome: "pass",
      evidenceTier: "enforced",
      evidence: input.enforced,
    });
  }
  if (input.inferred?.length) {
    return result({
      ...control,
      summary: input.passSummary,
      outcome: "pass",
      evidenceTier: "inferred",
      evidence: input.inferred,
    });
  }
  if (input.documented?.length) {
    return result({
      ...control,
      summary: input.passSummary,
      outcome: "pass",
      evidenceTier: "documented",
      evidence: input.documented,
    });
  }
  if (input.applicable === false) {
    return result({
      ...control,
      summary: "This control is outside the selected application context.",
      outcome: "not_applicable",
      evidenceTier: "absent",
    });
  }
  if (input.contextUnknown) {
    return result({
      ...control,
      summary:
        "The repository and optional context do not establish whether this control applies.",
      outcome: "unknown",
      evidenceTier: "runtime_only",
    });
  }
  return result({
    ...control,
    summary: input.missingSummary,
    outcome: "unknown",
    evidenceTier: "absent",
    evidence: input.partial,
  });
}

function isUnknownDataContext(data: DataSensitivity): boolean {
  return data === "unknown" || data === "withheld";
}

function architectureControls(): ControlEvaluator[] {
  return [
    (index) => {
      const docs = findPaths(index, [/(^|\/)readme\.md$/]);
      const setup = findContent(
        index,
        [
          /\b(quick start|getting started|prerequisites|local development|installation)\b/i,
          /\b(npm|pnpm|yarn|mvnw|gradlew|docker compose)\b.{0,80}\b(run|start|test|verify)\b/is,
        ],
        { pathPatterns: [/(^|\/)readme\.md$/, /getting-started.*\.md$/] },
      );
      return positiveControl({
        id: "arch.onboarding",
        domain: "architecture",
        title: "Reproducible onboarding",
        missingSummary:
          "No complete setup and verification path was found for a new engineer.",
        passSummary:
          "The repository documents a concrete local setup and verification path.",
        remediationCode: "write-onboarding-path",
        severity: "high",
        weight: 3,
        documented: mergeEvidence(docs, setup),
      });
    },
    (index) =>
      positiveControl({
        id: "arch.architecture-docs",
        domain: "architecture",
        title: "Architecture map",
        missingSummary:
          "The system structure and load-bearing boundaries are not documented.",
        passSummary:
          "Architecture documentation describes the system structure or state ownership.",
        remediationCode: "add-architecture-decisions",
        severity: "medium",
        weight: 2,
        documented: findPaths(index, [
          /(^|\/)architecture\.md$/,
          /(^|\/)docs\/architecture/,
          /system-design.*\.md$/,
        ]),
      }),
    (index) =>
      positiveControl({
        id: "arch.decisions",
        domain: "architecture",
        title: "Decision records",
        missingSummary:
          "No ADR or equivalent decision history was found.",
        passSummary:
          "Architecture decisions are recorded independently from implementation details.",
        remediationCode: "add-architecture-decisions",
        severity: "medium",
        weight: 2,
        documented: findPaths(index, [
          /(^|\/)(adr|adrs)\//,
          /architecture-decision/,
          /decision-record/,
        ]),
      }),
    (index) => {
      const manifests = findPaths(index, [
        /(^|\/)packages\/[^/]+\/package\.json$/,
        /(^|\/)apps\/[^/]+\/package\.json$/,
        /(^|\/)(modules|services)\/[^/]+\//,
        /(^|\/)pom\.xml$/,
        /settings\.gradle(\.kts)?$/,
      ]);
      const sourceAreas = countSourceAreas(index);
      return positiveControl({
        id: "arch.module-boundaries",
        domain: "architecture",
        title: "Independent module boundaries",
        missingSummary:
          "The repository does not expose clear boundaries that teams can own and change independently.",
        passSummary:
          "The layout exposes multiple source areas or module manifests that can support parallel ownership.",
        remediationCode: "define-module-boundaries",
        severity: "high",
        weight: 4,
        inferred:
          manifests.length > 0 || sourceAreas >= 3
            ? manifests.length > 0
              ? manifests
              : findPaths(index, [
                  /^(src|app|apps|packages|services|modules|api|ui|backend|frontend)\//,
                ])
            : [],
      });
    },
    (index) =>
      positiveControl({
        id: "arch.contracts",
        domain: "architecture",
        title: "Stable contracts",
        missingSummary:
          "No machine-readable API, event, or inter-module contract was found.",
        passSummary:
          "Machine-readable contracts reduce coordination between teams and consumers.",
        remediationCode: "define-module-boundaries",
        severity: "medium",
        weight: 2,
        enforced: findPaths(index, [
          /openapi.*\.(ya?ml|json)$/,
          /swagger.*\.(ya?ml|json)$/,
          /\.proto$/,
          /schema\.graphql$/,
          /asyncapi.*\.(ya?ml|json)$/,
        ]),
      }),
    (index) =>
      positiveControl({
        id: "arch.ownership",
        domain: "architecture",
        title: "Contribution and ownership rules",
        missingSummary:
          "Contribution workflow or code ownership is not visible in the repository.",
        passSummary:
          "Contribution or ownership guidance gives additional engineers a clear change path.",
        remediationCode: "write-onboarding-path",
        severity: "medium",
        weight: 1,
        documented: findPaths(index, [
          /(^|\/)contributing\.md$/,
          /(^|\/)codeowners$/,
          /pull_request_template/,
          /development\.md$/,
        ]),
      }),
    (index) => {
      const concentration = index.snapshot.history.repository;
      if (
        concentration.band === "Expected for initial Lovable export"
      ) {
        return result({
          id: "arch.bus-factor-repository",
          domain: "architecture",
          title: "Repository bus factor",
          summary:
            "A bus factor of one is expected in this compact initial Lovable export. Reassess after the first sustained post-export development cycle.",
          remediationCode: "reduce-knowledge-concentration",
          severity: "info",
          weight: 2,
          outcome: "unknown",
          evidenceTier: "runtime_only",
        });
      }
      if (concentration.band === "Insufficient evidence") {
        return result({
          id: "arch.bus-factor-repository",
          domain: "architecture",
          title: "Repository bus factor",
          summary:
            "Recent git history is unavailable or too small for a responsible ownership-concentration estimate.",
          remediationCode: "reduce-knowledge-concentration",
          severity: "medium",
          weight: 2,
          outcome: "unknown",
          evidenceTier: "runtime_only",
        });
      }
      const concentrated = concentration.band === "High concentration";
      return result({
        id: "arch.bus-factor-repository",
        domain: "architecture",
        title: "Repository bus factor",
        summary: concentrated
          ? "Recent changes are highly concentrated among too few contributors."
          : "Recent repository changes show a broader ownership base.",
        remediationCode: "reduce-knowledge-concentration",
        severity: concentrated ? "high" : "low",
        weight: 2,
        outcome: concentrated ? "fail" : "pass",
        evidenceTier: "inferred",
      });
    },
    (index) => {
      if (
        index.snapshot.history.provenance?.classification ===
        "initial_export"
      ) {
        return result({
          id: "arch.bus-factor-modules",
          domain: "architecture",
          title: "Module ownership concentration",
          summary:
            "Module-level ownership is too early to score for this initial Lovable export. Reassess after post-export module work accumulates.",
          remediationCode: "reduce-knowledge-concentration",
          severity: "info",
          weight: 2,
          outcome: "unknown",
          evidenceTier: "runtime_only",
        });
      }
      const modules = index.snapshot.history.modules.filter(
        (module) => module.band !== "Insufficient evidence",
      );
      if (modules.length === 0) {
        return result({
          id: "arch.bus-factor-modules",
          domain: "architecture",
          title: "Module ownership concentration",
          summary:
            "No major module has enough recent history for an ownership-concentration estimate.",
          remediationCode: "reduce-knowledge-concentration",
          severity: "medium",
          weight: 2,
          outcome: "unknown",
          evidenceTier: "runtime_only",
        });
      }
      const concentrated = modules.some(
        (module) => module.band === "High concentration",
      );
      return result({
        id: "arch.bus-factor-modules",
        domain: "architecture",
        title: "Module ownership concentration",
        summary: concentrated
          ? "At least one major module depends heavily on one recent contributor."
          : "Sampled major modules show shared recent ownership.",
        remediationCode: "reduce-knowledge-concentration",
        severity: concentrated ? "high" : "low",
        weight: 2,
        outcome: concentrated ? "fail" : "pass",
        evidenceTier: "inferred",
      });
    },
  ];
}

function agentReadinessControls(): ControlEvaluator[] {
  const instructionPaths = [
    /(^|\/)agents\.md$/,
    /(^|\/)claude\.md$/,
    /^\.github\/copilot-instructions\.md$/,
    /^\.cursor\/rules/,
    /(^|\/)agent-instructions\.md$/,
  ];

  return [
    (index) =>
      positiveControl({
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
        documented: findPaths(index, instructionPaths),
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
      return positiveControl({
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
          qualitySignals >= 3 ? findPaths(index, instructionPaths) : [],
      });
    },
    (index) => {
      const commandEvidence = findContent(
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
      const wrappers = findPaths(index, [
        /(^|\/)mvnw$/,
        /(^|\/)gradlew$/,
        /(^|\/)makefile$/,
        /(^|\/)taskfile\.ya?ml$/,
        /(^|\/)package\.json$/,
      ]);
      return positiveControl({
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
        enforced: mergeEvidence(commandEvidence, wrappers),
      });
    },
    (index) => {
      const fastChecks = findContent(
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
      const deepChecks = findContent(
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
      return positiveControl({
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
            ? mergeEvidence(fastChecks, deepChecks)
            : [],
      });
    },
    (index) => {
      const tests = findPaths(index, [
        /\.(spec|test)\.[cm]?[jt]sx?$/,
        /src\/test\/.*\.java$/,
        /(^|\/)tests?\//,
      ]);
      const workflows = findPaths(index, [
        /^\.github\/workflows\/.*\.ya?ml$/,
        /(^|\/)\.gitlab-ci\.ya?ml$/,
        /azure-pipelines\.ya?ml$/,
      ]);
      return positiveControl({
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
            ? mergeEvidence(tests, workflows)
            : [],
      });
    },
    (index) => {
      const safetyInstructions = findContent(
        index,
        [
          /\b(do not|never|must not)\b.{0,100}\b(secret|credential|personal data|pii|commit|deploy)\b/is,
          /\b(dry.?run|least privilege|sandbox|protected path)\b/i,
        ],
        { pathPatterns: instructionPaths },
      );
      const automatedSafety = findContent(
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
      return positiveControl({
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

function qualityControls(): ControlEvaluator[] {
  return [
    (index) =>
      positiveControl({
        id: "quality.tests",
        domain: "quality",
        title: "Automated tests",
        missingSummary: "No meaningful automated test surface was found.",
        passSummary:
          "Automated tests are present and can protect future refactoring.",
        remediationCode: "add-test-layers",
        severity: "high",
        weight: 4,
        enforced: findPaths(index, [
          /\.(spec|test)\.[cm]?[jt]sx?$/,
          /src\/test\/.*\.java$/,
          /(^|\/)tests?\//,
        ]),
      }),
    (index) => {
      const e2e = findPaths(index, [
        /playwright/,
        /cypress/,
        /e2e.*\.(spec|test)/,
      ]);
      const unit = findPaths(index, [
        /\.(spec|test)\.[cm]?[jt]sx?$/,
        /src\/test\/.*\.java$/,
      ]);
      return positiveControl({
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
        enforced: unit.length > 0 && e2e.length > 0 ? mergeEvidence(unit, e2e) : [],
      });
    },
    (index) =>
      positiveControl({
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
        enforced: findPaths(index, [
          /^\.github\/workflows\/.*\.ya?ml$/,
          /^\.circleci\/config\.ya?ml$/,
          /(^|\/)\.gitlab-ci\.ya?ml$/,
          /azure-pipelines\.ya?ml$/,
        ]),
      }),
    (index) => {
      const commands = findContent(
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
      return positiveControl({
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
      positiveControl({
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
        enforced: mergeEvidence(
          findPaths(index, [
            /codecov/,
            /coveralls/,
            /jacoco/,
            /nyc\.config/,
          ]),
          findContent(
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
      positiveControl({
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
        enforced: findPaths(index, [
          /^\.github\/dependabot\.ya?ml$/,
          /renovate\.json/,
          /renovate\.json5/,
        ]),
        documented: findContent(
          index,
          [/\b(dependabot|renovate|dependency update)\b/i],
          { pathPatterns: [/\.md$/] },
        ),
      }),
  ];
}

function securityControls(): ControlEvaluator[] {
  return [
    (index) => {
      const likelySecrets = findContent(
        index,
        [
          /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
          /\bAKIA[0-9A-Z]{16}\b/,
          /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/,
          /\bsk-[A-Za-z0-9_-]{32,}\b/,
          /\b(?:api[_-]?key|secret|password|token)\s*[:=]\s*["'][A-Za-z0-9_./+=-]{20,}["']/i,
        ],
        {
          excludePathPatterns: [
            /(^|\/)(test|tests|fixtures|examples?|docs)\//,
            /\.md$/,
            /package-lock\.json$/,
          ],
          maxResults: 6,
        },
      );

      if (likelySecrets.length > 0) {
        return result({
          id: "security.exposed-secret",
          domain: "security",
          title: "Likely exposed credential",
          summary:
            "A credential-shaped value was found. Its value is redacted and never included in the report or model payload.",
          remediationCode: "remove-exposed-secret",
          severity: "critical",
          weight: 5,
          outcome: "fail",
          evidenceTier: "enforced",
          evidence: likelySecrets,
        });
      }

      return result({
        id: "security.exposed-secret",
        domain: "security",
        title: "No likely exposed credential found",
        summary:
          "The scanned text did not match the high-confidence credential patterns.",
        remediationCode: "remove-exposed-secret",
        severity: "critical",
        weight: 5,
        outcome: index.snapshot.coverage.partial ? "unknown" : "pass",
        evidenceTier: index.snapshot.coverage.partial ? "runtime_only" : "inferred",
      });
    },
    (index) =>
      positiveControl({
        id: "security.secret-gate",
        domain: "security",
        title: "Automated secret scanning",
        missingSummary:
          "No repository-level secret scanning gate was found.",
        passSummary:
          "Secret scanning is configured as part of the development or CI workflow.",
        remediationCode: "add-security-baseline",
        severity: "high",
        weight: 2,
        enforced: mergeEvidence(
          findPaths(index, [/gitleaks/, /trufflehog/, /gitguardian/, /semgrep/]),
          findContent(
            index,
            [/\b(gitleaks|trufflehog|gitguardian|secret scanning)\b/i],
            {
              pathPatterns: [
                /^\.github\/workflows\//,
                /^\.circleci\//,
                /package\.json$/,
                /pom\.xml$/,
              ],
            },
          ),
        ),
      }),
    (index, context) => {
      const evidence = findContent(
        index,
        [
          /\b(nextauth|authjs|passport|spring security|securityfilterchain|oauth2|oidc|jsonwebtoken|bcrypt|argon2)\b/i,
        ],
        {
          pathPatterns: [
            /\.[cm]?[jt]sx?$/,
            /\.java$/,
            /package\.json$/,
            /pom\.xml$/,
            /\.properties$/,
          ],
        },
      );
      const applicable = context.dataSensitivity !== "none";
      return positiveControl({
        id: "security.authentication",
        domain: "security",
        title: "Authentication boundary",
        missingSummary:
          "No server-side authentication boundary was found for an application handling user data.",
        passSummary:
          "Authentication libraries or server-side security configuration are present.",
        remediationCode: "harden-auth-boundary",
        severity:
          context.dataSensitivity === "sensitive_regulated"
            ? "critical"
            : "high",
        weight: 4,
        enforced: evidence,
        applicable,
        contextUnknown: isUnknownDataContext(context.dataSensitivity),
      });
    },
    (index, context) => {
      const evidence = findContent(
        index,
        [
          /\b(preauthorize|hasrole|hasauthority|authorize|authorization|rbac|permission|accesscontrol)\b/i,
        ],
        {
          pathPatterns: [/\.[cm]?[jt]sx?$/, /\.java$/, /\.rs$/, /\.py$/],
          excludePathPatterns: [/(^|\/)(test|tests|docs)\//],
        },
      );
      return positiveControl({
        id: "security.authorization",
        domain: "security",
        title: "Server-side authorization",
        missingSummary:
          "No enforceable authorization or permission checks were found.",
        passSummary:
          "Authorization or role checks are present in server-side code.",
        remediationCode: "harden-auth-boundary",
        severity:
          context.dataSensitivity === "sensitive_regulated"
            ? "critical"
            : "high",
        weight: 4,
        enforced: evidence,
        applicable: context.dataSensitivity !== "none",
        contextUnknown: isUnknownDataContext(context.dataSensitivity),
      });
    },
    (index) =>
      positiveControl({
        id: "security.web-baseline",
        domain: "security",
        title: "Web security baseline",
        missingSummary:
          "CORS, CSRF/session policy, or security-header controls are not visible.",
        passSummary:
          "The repository contains web security configuration beyond authentication.",
        remediationCode: "add-security-baseline",
        severity: "high",
        weight: 2,
        enforced: findContent(
          index,
          [
            /\b(content-security-policy|x-frame-options|permissions-policy|csrf|samesite|allowed-origins|corsconfiguration)\b/i,
          ],
          {
            pathPatterns: [
              /\.[cm]?[jt]s$/,
              /\.java$/,
              /\.properties$/,
              /\.ya?ml$/,
            ],
          },
        ),
      }),
    (index) =>
      positiveControl({
        id: "security.validation",
        domain: "security",
        title: "Input validation",
        missingSummary:
          "No consistent server-side input validation mechanism was found.",
        passSummary:
          "Schema or framework validation is used at input boundaries.",
        remediationCode: "add-security-baseline",
        severity: "medium",
        weight: 2,
        enforced: findContent(
          index,
          [
            /\b(zod|yup|joi|class-validator|@valid|@validated|jakarta\.validation|validator\.)\b/i,
          ],
          {
            pathPatterns: [
              /\.[cm]?[jt]s$/,
              /\.java$/,
              /package\.json$/,
              /pom\.xml$/,
            ],
          },
        ),
      }),
    (index) =>
      positiveControl({
        id: "security.policy",
        domain: "security",
        title: "Security policy and threat boundary",
        missingSummary:
          "No security policy, threat model, or documented hardening boundary was found.",
        passSummary:
          "Security posture, reporting, or threat boundaries are documented.",
        remediationCode: "add-security-baseline",
        severity: "medium",
        weight: 1,
        documented: findPaths(index, [
          /(^|\/)security\.md$/,
          /threat-model.*\.md$/,
          /threat_model.*\.md$/,
        ]),
      }),
    (index, context) => {
      const evidence = mergeEvidence(
        findPaths(index, [/privacy.*\.md$/, /gdpr.*\.md$/, /data-retention/]),
        findContent(
          index,
          [
            /\b(data subject|right to erasure|retention policy|privacy policy|consent|personal data|gdpr)\b/i,
          ],
          { pathPatterns: [/\.md$/, /\.java$/, /\.[cm]?[jt]s$/] },
        ),
      );
      return positiveControl({
        id: "security.privacy",
        domain: "security",
        title: "Privacy and GDPR readiness evidence",
        missingSummary:
          "Privacy, retention, deletion, and data-subject responsibilities are not visible.",
        passSummary:
          "The repository contains privacy or GDPR readiness evidence.",
        remediationCode: "define-retention",
        severity:
          context.dataSensitivity === "sensitive_regulated" ? "high" : "medium",
        weight: 3,
        enforced: evidence.filter((item) => item.kind !== "documentation"),
        documented: evidence.filter((item) => item.kind === "documentation"),
        applicable: context.dataSensitivity !== "none",
        contextUnknown: isUnknownDataContext(context.dataSensitivity),
      });
    },
    (index) =>
      positiveControl({
        id: "security.dependency-scan",
        domain: "security",
        title: "Dependency security scanning",
        missingSummary:
          "No automated dependency vulnerability scan was found.",
        passSummary:
          "Dependency or filesystem security scanning is configured.",
        remediationCode: "add-security-baseline",
        severity: "high",
        weight: 2,
        enforced: mergeEvidence(
          findPaths(index, [/trivy/, /fossa/, /snyk/, /dependency-check/]),
          findContent(
            index,
            [/\b(npm audit|trivy|snyk|fossa|dependency-check|osv-scanner)\b/i],
            {
              pathPatterns: [
                /^\.github\/workflows\//,
                /^\.circleci\//,
                /package\.json$/,
                /pom\.xml$/,
                /\.sh$/,
              ],
            },
          ),
        ),
      }),
  ];
}

function operationsControls(): ControlEvaluator[] {
  return [
    (index) =>
      positiveControl({
        id: "ops.structured-logging",
        domain: "operations",
        title: "Structured application logging",
        missingSummary:
          "No structured logging or production logger configuration was found.",
        passSummary:
          "The application configures structured or production-grade logging.",
        remediationCode: "add-observability",
        severity: "medium",
        weight: 3,
        enforced: mergeEvidence(
          findPaths(index, [/logback.*\.xml$/, /log4j.*\.xml$/, /pino/, /winston/]),
          findContent(
            index,
            [
              /\b(structured.*log|json.*log|ecs.*log|pino|winston|slf4j|logback)\b/i,
            ],
            {
              pathPatterns: [
                /package\.json$/,
                /pom\.xml$/,
                /\.properties$/,
                /\.ya?ml$/,
                /\.xml$/,
                /\.[cm]?[jt]s$/,
              ],
            },
          ),
        ),
      }),
    (index) => {
      const securityLog = findContent(index, [
        /\b(security[_ .-]?event|login[_ .-]?failure|authentication failure)\b/i,
      ]);
      const auditLog = findContent(index, [
        /\b(audit[_ .-]?(log|event|trail)|access[_ .-]?log)\b/i,
      ]);
      return positiveControl({
        id: "ops.log-categories",
        domain: "operations",
        title: "Separate log categories",
        missingSummary:
          "Operational, security, audit, and access events are not clearly separated.",
        passSummary:
          "The repository distinguishes security or audit events from ordinary application logs.",
        remediationCode: "separate-log-types",
        severity: "high",
        weight: 3,
        enforced:
          securityLog.length > 0 && auditLog.length > 0
            ? mergeEvidence(securityLog, auditLog)
            : [],
        inferred:
          securityLog.length > 0 || auditLog.length > 0
            ? mergeEvidence(securityLog, auditLog)
            : [],
      });
    },
    (index) =>
      positiveControl({
        id: "ops.log-redaction",
        domain: "operations",
        title: "Log redaction and never-log rules",
        missingSummary:
          "No enforceable or documented rule prevents secrets and personal data entering logs.",
        passSummary:
          "Log redaction or explicit never-log guidance is present.",
        remediationCode: "separate-log-types",
        severity: "high",
        weight: 3,
        enforced: findContent(
          index,
          [/\b(redact|mask).{0,60}\b(password|token|secret|pii|personal data)\b/is],
          {
            pathPatterns: [/\.[cm]?[jt]s$/, /\.java$/, /\.rs$/, /\.py$/],
          },
        ),
        documented: findContent(
          index,
          [
            /\b(never log|must not log|no pii|no personal data in logs|redact secrets)\b/i,
          ],
          { pathPatterns: [/\.md$/] },
        ),
      }),
    (index) => {
      const health = findContent(
        index,
        [
          /\b(actuator\/health|healthcheck|readiness|liveness|\/healthz|micrometer|prometheus|opentelemetry)\b/i,
        ],
        {
          pathPatterns: [
            /\.properties$/,
            /\.ya?ml$/,
            /dockerfile/,
            /package\.json$/,
            /pom\.xml$/,
            /\.[cm]?[jt]s$/,
            /\.java$/,
          ],
        },
      );
      return positiveControl({
        id: "ops.observability",
        domain: "operations",
        title: "Health and telemetry surface",
        missingSummary:
          "Health, metrics, tracing, or equivalent operational signals are not visible.",
        passSummary:
          "The repository exposes health or telemetry signals for runtime diagnosis.",
        remediationCode: "add-observability",
        severity: "high",
        weight: 4,
        enforced: health,
      });
    },
    (index) =>
      positiveControl({
        id: "ops.alerting",
        domain: "operations",
        title: "Alerting configuration",
        missingSummary:
          "No alert rules, escalation policy, or alerting integration was found.",
        passSummary:
          "Alerting rules or escalation expectations are present.",
        remediationCode: "add-observability",
        severity: "medium",
        weight: 2,
        enforced: findPaths(index, [
          /alertmanager/,
          /prometheus.*rules/,
          /grafana.*alert/,
          /pagerduty/,
        ]),
        documented: findContent(
          index,
          [/\b(alerting|pagerduty|on-call|escalation policy)\b/i],
          { pathPatterns: [/\.md$/] },
        ),
      }),
    (index) =>
      positiveControl({
        id: "ops.runbook",
        domain: "operations",
        title: "Operations and incident runbook",
        missingSummary:
          "No start, stop, incident, or recovery runbook was found.",
        passSummary:
          "Operational or incident procedures are documented.",
        remediationCode: "add-observability",
        severity: "high",
        weight: 3,
        documented: findPaths(index, [
          /operations.*\.md$/,
          /runbook.*\.md$/,
          /incident.*\.md$/,
          /playbook.*\.md$/,
        ]),
      }),
    (index) =>
      positiveControl({
        id: "ops.log-retention",
        domain: "operations",
        title: "Log retention policy",
        missingSummary:
          "Log classes do not have visible retention and deletion rules.",
        passSummary:
          "Log retention, rotation, or deletion rules are configured or documented.",
        remediationCode: "separate-log-types",
        severity: "medium",
        weight: 2,
        enforced: findContent(
          index,
          [/\b(maxhistory|retention|rotate|rotation|max-file|max-size)\b/i],
          {
            pathPatterns: [
              /logback/,
              /log4j/,
              /fluent/,
              /vector/,
              /promtail/,
              /\.ya?ml$/,
            ],
          },
        ),
        documented: findContent(
          index,
          [/\b(log retention|audit retention|security logs?.{0,40}(days|years))\b/i],
          { pathPatterns: [/\.md$/] },
        ),
      }),
    () =>
      result({
        id: "ops.alert-delivery",
        domain: "operations",
        title: "Alerts reach an accountable human",
        summary:
          "Repository evidence cannot prove that production alerts are delivered, acknowledged, or rehearsed.",
        remediationCode: "add-observability",
        severity: "medium",
        weight: 1,
        outcome: "unknown",
        evidenceTier: "runtime_only",
      }),
  ];
}

function reliabilityControls(): ControlEvaluator[] {
  return [
    (index) => {
      const externalSession = findContent(index, [
        /\b(redis.*session|spring\.session|session.*redis|stateless|jwt|external session)\b/i,
      ]);
      const inMemoryState = findContent(
        index,
        [
          /\b(in-memory session|memorystore|globalThis\..*cache|new Map\(\).*(session|user|job))\b/is,
        ],
        { excludePathPatterns: [/(^|\/)(test|tests|docs)\//] },
      );

      if (inMemoryState.length > 0 && externalSession.length === 0) {
        return result({
          id: "rel.stateless",
          domain: "reliability",
          title: "Single-instance runtime state",
          summary:
            "Request or session state appears tied to one application process, which blocks safe horizontal scaling.",
          remediationCode: "remove-request-state",
          severity: "high",
          weight: 4,
          outcome: "fail",
          evidenceTier: "inferred",
          evidence: inMemoryState,
        });
      }

      return positiveControl({
        id: "rel.stateless",
        domain: "reliability",
        title: "Horizontal scaling state model",
        missingSummary:
          "The repository does not explain whether another instance can handle the next request.",
        passSummary:
          "The state model supports or documents multi-instance request handling.",
        remediationCode: "remove-request-state",
        severity: "high",
        weight: 4,
        enforced: externalSession,
        documented: findContent(
          index,
          [/\b(stateless|horizontal scaling|shared session)\b/i],
          { pathPatterns: [/\.md$/] },
        ),
      });
    },
    (index) =>
      positiveControl({
        id: "rel.database-foundations",
        domain: "reliability",
        title: "Database growth foundations",
        missingSummary:
          "Migrations, pooling, or indexing evidence is incomplete for durable data growth.",
        passSummary:
          "Database migrations, indexes, or connection pooling are visible.",
        remediationCode: "add-load-path",
        severity: "high",
        weight: 3,
        enforced: mergeEvidence(
          findPaths(index, [
            /(^|\/)migrations?\//,
            /flyway/,
            /liquibase/,
            /schema\.prisma$/,
          ]),
          findContent(
            index,
            [
              /\b(create index|@@index|hikaricp|connection pool|pool_size|maximumpoolsize)\b/i,
            ],
            {
              pathPatterns: [
                /\.sql$/,
                /\.prisma$/,
                /\.properties$/,
                /\.ya?ml$/,
              ],
            },
          ),
        ),
        applicable: hasDurableData(index),
      }),
    (index) =>
      positiveControl({
        id: "rel.failure-controls",
        domain: "reliability",
        title: "Bounded dependency failure",
        missingSummary:
          "Timeouts, retry policy, idempotency, or backpressure are not visible around external work.",
        passSummary:
          "The repository contains controls for slow, repeated, or failing dependencies.",
        remediationCode: "add-failure-controls",
        severity: "high",
        weight: 3,
        enforced: findContent(
          index,
          [
            /\b(timeout|abortcontroller|resilience4j|retrytemplate|idempotency|circuit.?breaker|backpressure|bulkhead)\b/i,
          ],
          {
            pathPatterns: [
              /\.[cm]?[jt]s$/,
              /\.java$/,
              /\.properties$/,
              /\.ya?ml$/,
            ],
            excludePathPatterns: [/(^|\/)(test|tests|docs)\//],
          },
        ),
      }),
    (index) =>
      positiveControl({
        id: "rel.health-lifecycle",
        domain: "reliability",
        title: "Runtime lifecycle controls",
        missingSummary:
          "Readiness, liveness, and graceful shutdown controls are not visible.",
        passSummary:
          "The runtime exposes lifecycle signals or graceful shutdown behaviour.",
        remediationCode: "add-failure-controls",
        severity: "high",
        weight: 3,
        enforced: findContent(
          index,
          [
            /\b(readiness|liveness|graceful shutdown|server\.shutdown\s*=\s*graceful|terminationgraceperiodseconds)\b/i,
          ],
          {
            pathPatterns: [
              /\.properties$/,
              /\.ya?ml$/,
              /dockerfile/,
              /\.[cm]?[jt]s$/,
              /\.java$/,
            ],
          },
        ),
      }),
    (index) =>
      positiveControl({
        id: "rel.async-work",
        domain: "reliability",
        title: "Asynchronous workload path",
        missingSummary:
          "No queue, worker, scheduler, or background-job boundary was found.",
        passSummary:
          "Long-running or bursty work has an asynchronous execution path.",
        remediationCode: "add-failure-controls",
        severity: "medium",
        weight: 2,
        inferred: findContent(
          index,
          [
            /\b(bullmq|rabbitmq|kafka|sqs|celery|sidekiq|@scheduled|job queue|worker thread|background job)\b/i,
          ],
          {
            pathPatterns: [
              /package\.json$/,
              /pom\.xml$/,
              /\.[cm]?[jt]s$/,
              /\.java$/,
              /\.py$/,
              /\.ya?ml$/,
            ],
          },
        ),
      }),
    (index) =>
      positiveControl({
        id: "rel.load-tests",
        domain: "reliability",
        title: "Load and performance evidence",
        missingSummary:
          "No representative load test, benchmark, or performance budget was found.",
        passSummary:
          "The repository contains a repeatable performance or load-testing path.",
        remediationCode: "add-load-path",
        severity: "high",
        weight: 3,
        enforced: mergeEvidence(
          findPaths(index, [
            /(^|\/)(performance|load|benchmarks?)\//,
            /\.jmx$/,
            /k6.*\.[jt]s$/,
            /artillery.*\.ya?ml$/,
            /gatling/,
          ]),
          findContent(
            index,
            [/\b(k6|artillery|gatling|jmeter|performance budget|load test)\b/i],
            { pathPatterns: [/package\.json$/, /pom\.xml$/, /\.md$/] },
          ),
        ),
      }),
    (index) =>
      positiveControl({
        id: "rel.ha-path",
        domain: "reliability",
        title: "100x availability path",
        missingSummary:
          "No HA, failure-domain, capacity, or scale-out path is documented.",
        passSummary:
          "Deployment or architecture evidence describes replication, multiple instances, or failure domains.",
        remediationCode: "define-ha-path",
        severity: "high",
        weight: 3,
        enforced: findContent(
          index,
          [
            /\b(replicas:\s*[2-9]|poddisruptionbudget|autoscal|multi-az|multi-region|horizontalpodautoscaler)\b/i,
          ],
          { pathPatterns: [/\.ya?ml$/, /\.tf$/, /\.json$/] },
        ),
        documented: findContent(
          index,
          [
            /\b(high availability|failure domain|horizontal scaling|capacity plan|multi-region|multi-az)\b/i,
          ],
          { pathPatterns: [/\.md$/] },
        ),
      }),
    () =>
      result({
        id: "rel.actual-capacity",
        domain: "reliability",
        title: "Production capacity headroom",
        summary:
          "A repository cannot prove current production throughput, latency, or unused capacity.",
        remediationCode: "add-load-path",
        severity: "medium",
        weight: 1,
        outcome: "unknown",
        evidenceTier: "runtime_only",
      }),
  ];
}

function resilienceControls(): ControlEvaluator[] {
  return [
    (index, context) => {
      const backupAutomation = findContent(
        index,
        [/\b(pg_dump|backup job|scheduled backup|wal-g|velero|backup command)\b/i],
        {
          pathPatterns: [
            /\.sh$/,
            /\.ya?ml$/,
            /^\.github\/workflows\//,
            /^\.circleci\//,
          ],
        },
      );
      const restoreAutomation = findContent(
        index,
        [/\b(pg_restore|restore.*test|restore.*fresh|restore rehearsal)\b/i],
        {
          pathPatterns: [
            /\.sh$/,
            /\.ya?ml$/,
            /^\.github\/workflows\//,
            /^\.circleci\//,
          ],
        },
      );
      const backupDocumentation = mergeEvidence(
        findPaths(index, [/backup.*\.md$/, /operations.*\.md$/]),
        findContent(
          index,
          [/\b(backup policy|backup schedule|point-in-time recovery|pitr)\b/i],
          { pathPatterns: [/\.md$/] },
        ),
      );
      const restoreDocumentation = mergeEvidence(
        findPaths(index, [/restore.*\.md$/, /recovery.*\.md$/]),
        findContent(
          index,
          [/\b(restore procedure|restore rehearsal|recovery procedure)\b/i],
          { pathPatterns: [/\.md$/] },
        ),
      );
      const anyBackup = mergeEvidence(
        backupAutomation,
        backupDocumentation,
      );
      const anyRestore = mergeEvidence(
        restoreAutomation,
        restoreDocumentation,
      );
      const bothEnforced =
        backupAutomation.length > 0 && restoreAutomation.length > 0;
      const bothPresent = anyBackup.length > 0 && anyRestore.length > 0;
      const missingSummary =
        anyBackup.length > 0
          ? "Backup evidence was found, but no restore procedure or restore test was visible."
          : anyRestore.length > 0
            ? "Restore evidence was found, but no backup configuration or schedule was visible."
            : "No repository evidence established both backup configuration and a restore procedure for durable data.";

      return positiveControl({
        id: "res.backup-restore",
        domain: "resilience",
        title: "Backup configuration and restore test",
        missingSummary,
        passSummary:
          "Both backup and restore evidence are present; runtime success remains unverified.",
        remediationCode: "add-backup-restore",
        severity:
          context.stage === "scaling_production"
            ? "critical"
            : context.stage === "prototype"
              ? "medium"
              : "high",
        weight: 4,
        enforced: bothEnforced
          ? mergeEvidence(backupAutomation, restoreAutomation)
          : [],
        documented:
          bothPresent && !bothEnforced
            ? mergeEvidence(anyBackup, anyRestore)
            : [],
        partial: mergeEvidence(anyBackup, anyRestore),
        applicable: hasDurableData(index),
      });
    },
    (index) =>
      positiveControl({
        id: "res.rpo-rto",
        domain: "resilience",
        title: "Recovery objectives",
        missingSummary:
          "RPO and RTO assumptions are not documented for durable data.",
        passSummary:
          "Recovery-point or recovery-time objectives are documented.",
        remediationCode: "add-backup-restore",
        severity: "high",
        weight: 3,
        documented: findContent(index, [/\b(RPO|RTO)\b/], {
          pathPatterns: [/\.md$/],
        }),
        applicable: hasDurableData(index),
      }),
    (index, context) =>
      positiveControl({
        id: "res.data-lifecycle",
        domain: "resilience",
        title: "Data retention and deletion lifecycle",
        missingSummary:
          "Durable personal data lacks visible retention, archival, and deletion rules.",
        passSummary:
          "Retention, archival, deletion, or data-subject procedures are documented or implemented.",
        remediationCode: "define-retention",
        severity:
          context.dataSensitivity === "sensitive_regulated" ? "high" : "medium",
        weight: 3,
        enforced: findContent(
          index,
          [
            /\b(soft.?delete|retention job|purge job|delete account|data export|data subject request)\b/i,
          ],
          { pathPatterns: [/\.[cm]?[jt]s$/, /\.java$/, /\.sql$/] },
        ),
        documented: findContent(
          index,
          [/\b(data retention|deletion policy|right to erasure|archival policy)\b/i],
          { pathPatterns: [/\.md$/] },
        ),
        applicable:
          context.dataSensitivity !== "none" && hasDurableData(index),
        contextUnknown: isUnknownDataContext(context.dataSensitivity),
      }),
    (index) =>
      positiveControl({
        id: "res.release-rollback",
        domain: "resilience",
        title: "Release and rollback path",
        missingSummary:
          "No versioned release and rollback procedure was found.",
        passSummary:
          "Release automation or rollback procedures make change reversible.",
        remediationCode: "add-release-rollback",
        severity: "high",
        weight: 3,
        enforced: findPaths(index, [
          /^\.github\/workflows\/.*release.*\.ya?ml$/,
          /semantic-release/,
          /release-please/,
        ]),
        documented: findContent(
          index,
          [/\b(rollback|release process|versioning policy)\b/i],
          { pathPatterns: [/\.md$/] },
        ),
      }),
    (index, context) =>
      positiveControl({
        id: "res.breach-response",
        domain: "resilience",
        title: "Incident and breach response",
        missingSummary:
          "No personal-data breach or security incident response procedure was found.",
        passSummary:
          "Incident or breach response responsibilities are documented.",
        remediationCode: "define-retention",
        severity: "high",
        weight: 2,
        documented: findContent(
          index,
          [/\b(data breach|breach notification|incident response|72 hours)\b/i],
          { pathPatterns: [/\.md$/] },
        ),
        applicable: context.dataSensitivity !== "none",
        contextUnknown: isUnknownDataContext(context.dataSensitivity),
      }),
    (index) =>
      positiveControl({
        id: "res.encryption",
        domain: "resilience",
        title: "Encryption and key boundary",
        missingSummary:
          "Encryption-at-rest or key-management responsibility is not visible.",
        passSummary:
          "Encryption or deployment-owned key management is implemented or documented.",
        remediationCode: "define-retention",
        severity: "high",
        weight: 2,
        enforced: findContent(
          index,
          [
            /\b(AES-?256|AES\/GCM|kms|key vault|secret manager|encrypted backup)\b/i,
          ],
          {
            pathPatterns: [
              /\.[cm]?[jt]s$/,
              /\.java$/,
              /\.tf$/,
              /\.ya?ml$/,
            ],
          },
        ),
        documented: findContent(
          index,
          [/\b(encryption at rest|key management|encrypted backups?)\b/i],
          { pathPatterns: [/\.md$/] },
        ),
        applicable: hasDurableData(index),
      }),
    (index) =>
      result({
        id: "res.restore-recency",
        domain: "resilience",
        title: "Recent production restore succeeded",
        summary:
          hasDurableData(index)
            ? "Repository evidence cannot prove when a production backup was last restored successfully."
            : "No durable-data surface was detected.",
        remediationCode: "add-backup-restore",
        severity: "high",
        weight: 1,
        outcome: hasDurableData(index) ? "unknown" : "not_applicable",
        evidenceTier: hasDurableData(index) ? "runtime_only" : "absent",
      }),
  ];
}

export function evaluateControls(
  snapshot: Parameters<typeof createRepositoryIndex>[0],
  context: ScanContext,
): CheckResult[] {
  const index = createRepositoryIndex(snapshot);
  const evaluators = [
    ...architectureControls(),
    ...qualityControls(),
    ...securityControls(),
    ...operationsControls(),
    ...reliabilityControls(),
    ...resilienceControls(),
    ...agentReadinessControls(),
  ];

  return evaluators.map((evaluate) => evaluate(index, context));
}
