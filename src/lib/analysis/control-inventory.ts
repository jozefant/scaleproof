import { agentReadinessDetectorMetadata } from "./controls/agent-readiness";
import { architectureDetectorMetadata } from "./controls/architecture";
import { operationsDetectorMetadata } from "./controls/operations";
import { qualityDetectorMetadata } from "./controls/quality";
import { reliabilityDetectorMetadata } from "./controls/reliability";
import { resilienceDetectorMetadata } from "./controls/resilience";
import { securityDetectorMetadata } from "./controls/security";
import type { DetectorMetadata } from "./controls/shared";
import type { CheckResult } from "./types";

export interface ControlInventoryEntry {
  id: string;
  claim: string;
  applicability: string;
  requiredSignals: readonly string[];
  disqualifyingSignals: readonly string[];
  evidenceTier: DetectorMetadata["strongestEvidenceTier"];
  confidenceLimitation: string;
  remediationCode: string;
}

const DETECTOR_METADATA: readonly DetectorMetadata[] = [
  ...architectureDetectorMetadata,
  ...qualityDetectorMetadata,
  ...securityDetectorMetadata,
  ...operationsDetectorMetadata,
  ...reliabilityDetectorMetadata,
  ...resilienceDetectorMetadata,
  ...agentReadinessDetectorMetadata,
];

export function buildControlInventory(
  checks: CheckResult[],
): ControlInventoryEntry[] {
  const metadataById = new Map(
    DETECTOR_METADATA.map((metadata) => [metadata.id, metadata]),
  );
  if (metadataById.size !== DETECTOR_METADATA.length) {
    throw new Error("Detector metadata contains duplicate control IDs.");
  }

  const checkIds = new Set(checks.map((check) => check.id));
  const missingMetadata = checks
    .map((check) => check.id)
    .filter((id) => !metadataById.has(id));
  const metadataWithoutControl = DETECTOR_METADATA
    .map((metadata) => metadata.id)
    .filter((id) => !checkIds.has(id));
  if (missingMetadata.length > 0 || metadataWithoutControl.length > 0) {
    throw new Error(
      `Detector metadata mismatch. Missing: ${missingMetadata.join(", ") || "none"}; unused: ${metadataWithoutControl.join(", ") || "none"}.`,
    );
  }

  for (const check of checks) {
    const metadata = metadataById.get(check.id);
    if (metadata?.remediationCode !== check.remediationCode) {
      throw new Error(
        `Detector metadata remediation mismatch for ${check.id}.`,
      );
    }
  }

  return DETECTOR_METADATA.map((metadata) => ({
    id: metadata.id,
    claim: metadata.claim,
    applicability: metadata.applicability,
    requiredSignals: metadata.requiredSignals,
    disqualifyingSignals: metadata.disqualifyingSignals,
    evidenceTier: metadata.strongestEvidenceTier,
    confidenceLimitation: metadata.confidenceLimitation,
    remediationCode: metadata.remediationCode,
  }));
}
