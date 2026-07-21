import * as signals from "../signals";
import type { ControlEvaluator } from "./shared";
import * as helpers from "./shared";

export const architectureDetectorMetadata = helpers.defineDetectorMetadata([
  {
    id: "arch.source-reachability",
    claim: "Static source reachability completed without unresolved local imports.",
    applicability: "JavaScript or TypeScript repositories with recognized application entry points.",
    requiredSignals: ["All reachable local imports resolve to scanned source files"],
    disqualifyingSignals: ["Unresolved local or configured-alias import"],
    strongestEvidenceTier: "runtime_only",
    confidenceLimitation:
      "Static import tracing cannot resolve runtime module loading, generated modules, or imports outside the scan boundary.",
    remediationCode: "add-quality-gate",
  },
  {
    id: "arch.onboarding",
    claim: "A reproducible onboarding path is documented.",
    applicability: "All repositories with a contributor workflow.",
    requiredSignals: [
      "Setup or prerequisites instructions",
      "Concrete local run and verification commands",
    ],
    disqualifyingSignals: ["README filename without an executable setup path"],
    strongestEvidenceTier: "documented",
    confidenceLimitation:
      "Repository text cannot prove that a new contributor completed the path.",
    remediationCode: "write-onboarding-path",
  },
  {
    id: "arch.architecture-docs",
    claim: "The system structure or state ownership is documented.",
    applicability: "Repositories with multiple load-bearing concerns.",
    requiredSignals: ["Recognized architecture or system-design document path"],
    disqualifyingSignals: ["Generic README without an architecture document"],
    strongestEvidenceTier: "documented",
    confidenceLimitation:
      "A document path does not establish accuracy or current implementation alignment.",
    remediationCode: "add-architecture-decisions",
  },
  {
    id: "arch.decisions",
    claim: "Architecture decisions are recorded independently.",
    applicability: "Repositories with durable architecture trade-offs.",
    requiredSignals: ["ADR directory or decision-record path"],
    disqualifyingSignals: ["Architecture prose without a decision history"],
    strongestEvidenceTier: "documented",
    confidenceLimitation:
      "Presence of records does not prove that every load-bearing decision is captured.",
    remediationCode: "add-architecture-decisions",
  },
  {
    id: "arch.module-boundaries",
    claim: "A configured multi-module layout signal is present.",
    applicability: "Repositories expected to support parallel team ownership.",
    requiredSignals: [
      "At least two module manifests",
      "Workspace or multi-module build definition",
    ],
    disqualifyingSignals: ["Directory count without module configuration"],
    strongestEvidenceTier: "inferred",
    confidenceLimitation:
      "Layout does not prove low coupling, absence of dependency cycles, or independent deployability.",
    remediationCode: "define-module-boundaries",
  },
  {
    id: "arch.contracts",
    claim: "Machine-readable service or module contracts are present.",
    applicability: "Repositories exposing APIs, events, or module interfaces.",
    requiredSignals: ["OpenAPI, AsyncAPI, GraphQL, or Protobuf contract file"],
    disqualifyingSignals: ["Human-readable API prose without a contract artifact"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation:
      "A contract file does not prove compatibility checks or implementation conformance.",
    remediationCode: "define-module-boundaries",
  },
  {
    id: "arch.ownership",
    claim: "Contribution or ownership guidance is visible.",
    applicability: "Repositories accepting changes from more than one engineer.",
    requiredSignals: [
      "CONTRIBUTING, CODEOWNERS, pull-request template, or development guide",
    ],
    disqualifyingSignals: ["General README without contribution or ownership rules"],
    strongestEvidenceTier: "documented",
    confidenceLimitation:
      "Repository guidance cannot prove that ownership and review rules are followed.",
    remediationCode: "write-onboarding-path",
  },
  {
    id: "arch.bus-factor-repository",
    claim: "Recent repository ownership concentration is estimated.",
    applicability: "Repositories with enough anonymized recent commit history.",
    requiredSignals: ["At least the minimum recent attributed commit sample"],
    disqualifyingSignals: ["Unavailable, rate-limited, or undersized history sample"],
    strongestEvidenceTier: "inferred",
    confidenceLimitation:
      "Recent commit concentration is a directional proxy, not proof of knowledge transfer.",
    remediationCode: "reduce-knowledge-concentration",
  },
  {
    id: "arch.bus-factor-modules",
    claim: "Recent ownership concentration is estimated for major modules.",
    applicability: "Established repositories with identifiable major modules and history.",
    requiredSignals: ["Major module scopes with enough attributed recent commits"],
    disqualifyingSignals: ["Initial generated export or insufficient module history"],
    strongestEvidenceTier: "inferred",
    confidenceLimitation:
      "Sampled module changes do not measure review depth or operational knowledge.",
    remediationCode: "reduce-knowledge-concentration",
  },
] as const);

export function architectureControls(): ControlEvaluator[] {
  return [
    (index) => {
      if (!signals.hasIncompleteSourceReachability(index)) {
        return helpers.positiveControl({
          id: "arch.source-reachability",
          domain: "architecture",
          title: "Static source reachability",
          missingSummary: "No incomplete source-reachability signal was found.",
          passSummary: "Static source reachability completed without unresolved local imports.",
          remediationCode: "add-quality-gate",
          severity: "info",
          weight: 1,
          applicable: false,
        });
      }
      return helpers.result({
        id: "arch.source-reachability",
        domain: "architecture",
        title: "Static source reachability is incomplete",
        summary: "At least one reachable local import could not be resolved inside the bounded scan. Proven-reachable files remain eligible, while unrelated source remains excluded.",
        remediationCode: "add-quality-gate",
        severity: "info",
        weight: 1,
        outcome: "unknown",
        evidenceTier: "runtime_only",
      });
    },
    (index) => {
      const setupInstructions = signals.findContent(
        index,
        [
          /\b(quick start|getting started|prerequisites|local development|installation)\b/i,
        ],
        { pathPatterns: [/(^|\/)readme\.md$/, /getting-started.*\.md$/] },
      );
      const verificationCommands = signals.findContent(
        index,
        [
          /\b(npm|pnpm|yarn|mvnw|gradlew|docker compose)\b.{0,80}\b(run|start|test|verify)\b/is,
        ],
        { pathPatterns: [/(^|\/)readme\.md$/, /getting-started.*\.md$/] },
      );
      const completeOnboarding =
        setupInstructions.length > 0 && verificationCommands.length > 0
          ? signals.mergeEvidence(setupInstructions, verificationCommands)
          : [];
      return helpers.positiveControl({
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
        documented: completeOnboarding,
        partial: signals.mergeEvidence(setupInstructions, verificationCommands),
      });
    },
    (index) =>
      helpers.positiveControl({
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
        documented: signals.findPaths(index, [
          /(^|\/)architecture\.md$/,
          /(^|\/)docs\/architecture/,
          /system-design.*\.md$/,
        ]),
      }),
    (index) =>
      helpers.positiveControl({
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
        documented: signals.findPaths(index, [
          /(^|\/)(adr|adrs)\//,
          /architecture-decision/,
          /decision-record/,
        ]),
      }),
    (index) => {
      const manifests = signals.findPaths(index, [
        /(^|\/)packages\/[^/]+\/package\.json$/,
        /(^|\/)apps\/[^/]+\/package\.json$/,
        /(^|\/)(modules|services)\/[^/]+\/(package\.json|pom\.xml|build\.gradle(\.kts)?)$/,
      ]);
      const workspaceDefinition = signals.findContent(
        index,
        [
          /"workspaces"\s*:/,
          /\b(includeBuild|project\(["']:|<module>[^<]+<\/module>|nx\.json|turbo\.json)\b/i,
        ],
        {
          pathPatterns: [
            /package\.json$/,
            /settings\.gradle(\.kts)?$/,
            /pom\.xml$/,
            /nx\.json$/,
            /turbo\.json$/,
          ],
        },
      );
      const moduleLayout =
        manifests.length >= 2 && workspaceDefinition.length > 0
          ? signals.mergeEvidence(manifests, workspaceDefinition)
          : [];
      return helpers.positiveControl({
        id: "arch.module-boundaries",
        domain: "architecture",
        title: "Module layout signal",
        missingSummary:
          "No multi-module manifest plus workspace definition was found; directory names alone are not treated as proof of low coupling.",
        passSummary:
          "A multi-module layout is configured. This is a layout signal, not proof of low coupling or independent team ownership.",
        remediationCode: "define-module-boundaries",
        severity: "high",
        weight: 4,
        inferred: moduleLayout,
        partial: signals.mergeEvidence(manifests, workspaceDefinition),
      });
    },
    (index) =>
      helpers.positiveControl({
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
        enforced: signals.findPaths(index, [
          /openapi.*\.(ya?ml|json)$/,
          /swagger.*\.(ya?ml|json)$/,
          /\.proto$/,
          /schema\.graphql$/,
          /asyncapi.*\.(ya?ml|json)$/,
        ]),
      }),
    (index) =>
      helpers.positiveControl({
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
        documented: signals.findPaths(index, [
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
        return helpers.result({
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
        return helpers.result({
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
      return helpers.result({
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
        return helpers.result({
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
        return helpers.result({
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
      return helpers.result({
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
