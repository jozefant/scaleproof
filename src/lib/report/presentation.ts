import type {
  PublicCheckResult,
  ScanContext,
} from "@/lib/report/contract";

export const CONTEXT_LABELS = {
  stage: {
    prototype: "Prototype",
    live_early: "Live, early product",
    scaling_production: "Scaling or production",
    unknown: "I don't know",
    withheld: "Prefer not to say",
  },
  dataSensitivity: {
    none: "No personal data",
    basic_personal: "Basic account or customer data",
    sensitive_regulated: "Sensitive or regulated data",
    unknown: "I don't know",
    withheld: "Prefer not to say",
  },
  growthTarget: {
    users_10x: "10x more users",
    users_100x: "100x more users",
    engineering_team: "A larger engineering team",
    users_and_team: "Both users and engineering team",
    unknown: "I don't know",
    withheld: "Prefer not to say",
  },
} satisfies {
  stage: Record<ScanContext["stage"], string>;
  dataSensitivity: Record<ScanContext["dataSensitivity"], string>;
  growthTarget: Record<ScanContext["growthTarget"], string>;
};

export function evidenceLabel(check: PublicCheckResult): string {
  if (check.outcome === "fail") {
    return "Verified concern";
  }
  if (check.outcome === "not_applicable") {
    return "Not applicable";
  }
  if (check.outcome === "unknown" && check.evidenceTier === "runtime_only") {
    return "Not verifiable";
  }
  if (check.outcome === "unknown") {
    return "Missing evidence";
  }
  if (check.evidenceTier === "enforced") {
    return "Verified";
  }
  if (check.evidenceTier === "inferred") {
    return "Supported by evidence";
  }
  return "Documented only";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1_024) {
    return `${bytes} B`;
  }
  if (bytes < 1_048_576) {
    return `${(bytes / 1_024).toFixed(1)} KB`;
  }
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}
