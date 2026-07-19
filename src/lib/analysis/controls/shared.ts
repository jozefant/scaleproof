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
  applicability: string;
  requiredSignals: readonly string[];
  disqualifyingSignals: readonly string[];
  strongestEvidenceTier: Exclude<EvidenceTier, "absent">;
  confidenceLimitation: string;
  remediationCode: string;
}

export function defineDetectorMetadata<
  const T extends readonly DetectorMetadata[],
>(metadata: T): T {
  return metadata;
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
