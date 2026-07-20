import type {
  CheckResult,
  DataSensitivity,
  EvidenceReference,
  EvidenceTier,
  Outcome,
  ScanContext,
  Severity,
} from "../types";
import type { RepositoryIndex } from "../signals";

export interface ResultInput {
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

export type ControlEvaluator = (
  index: RepositoryIndex,
  context: ScanContext,
) => CheckResult;

export interface DetectorMetadata {
  id: string;
  claim: string;
  domain: CheckResult["domain"];
  severity: Severity;
  applicability: string;
  requiredSignals: readonly string[];
  disqualifyingSignals: readonly string[];
  strongestEvidenceTier: Exclude<EvidenceTier, "absent">;
  confidenceLimitation: string;
  remediationCode: string;
}

type MetadataWithoutProfile = Omit<DetectorMetadata, "domain" | "severity">;

const DEFAULT_METADATA_PROFILES: Record<
  string,
  Pick<DetectorMetadata, "domain" | "severity">
> = {
  "saas.stateless-tier": { domain: "reliability", severity: "high" },
  "saas.database-discipline": { domain: "reliability", severity: "high" },
  "saas.slow-work": { domain: "reliability", severity: "high" },
  "saas.failure-safety": { domain: "reliability", severity: "critical" },
  "saas.config-boundary": { domain: "security", severity: "medium" },
  "saas.tenant-isolation": { domain: "security", severity: "critical" },
  "saas.observability": { domain: "operations", severity: "high" },
  "saas.feature-flags": { domain: "quality", severity: "medium" },
  "saas.ci-test-gate": { domain: "quality", severity: "high" },
  "saas.critical-bus-factor": { domain: "architecture", severity: "high" },
  "saas.written-decisions": { domain: "architecture", severity: "medium" },
  "saas.dependency-freshness": { domain: "quality", severity: "info" },
  "saas.critical-test-distribution": { domain: "quality", severity: "high" },
};

function defaultProfile(id: string): Pick<DetectorMetadata, "domain" | "severity"> {
  if (id.startsWith("arch.")) return { domain: "architecture", severity: "medium" };
  if (id.startsWith("quality.")) return { domain: "quality", severity: "medium" };
  if (id.startsWith("security.")) return { domain: "security", severity: "high" };
  if (id.startsWith("ops.")) return { domain: "operations", severity: "high" };
  if (id.startsWith("rel.")) return { domain: "reliability", severity: "high" };
  if (id.startsWith("res.")) return { domain: "resilience", severity: "high" };
  if (id.startsWith("agent.")) return { domain: "agent_readiness", severity: "high" };
  throw new Error(`No metadata profile is defined for ${id}.`);
}

export function defineDetectorMetadata<
  const T extends readonly MetadataWithoutProfile[],
>(metadata: T): readonly DetectorMetadata[] {
  return metadata.map((entry) => ({
    ...entry,
    ...(DEFAULT_METADATA_PROFILES[entry.id] ?? defaultProfile(entry.id)),
  }));
}

export function result(input: ResultInput): CheckResult {
  return {
    ...input,
    evidence: input.evidence ?? [],
  };
}

export function positiveControl(input: {
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

export function isUnknownDataContext(data: DataSensitivity): boolean {
  return data === "unknown" || data === "withheld";
}
