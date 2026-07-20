import type { DomainId, EvidenceTier, Severity } from "./types";

export const HEURISTIC_VERSION = "0.6.0-hackathon";

export const DOMAIN_CONFIG: Record<
  DomainId,
  { label: string; weight: number }
> = {
  architecture: {
    label: "Architecture & team scale",
    weight: 0.16,
  },
  quality: {
    label: "Quality & delivery",
    weight: 0.14,
  },
  security: {
    label: "Security & privacy",
    weight: 0.18,
  },
  operations: {
    label: "Observability & operations",
    weight: 0.13,
  },
  reliability: {
    label: "Reliability & user scale",
    weight: 0.17,
  },
  resilience: {
    label: "Data resilience & governance",
    weight: 0.1,
  },
  agent_readiness: {
    label: "AI-agent readiness",
    weight: 0.12,
  },
};

export const EVIDENCE_CREDIT: Record<EvidenceTier, number | null> = {
  enforced: 1,
  inferred: 0.7,
  documented: 0.4,
  absent: 0,
  runtime_only: null,
};

export const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export const MODEL_LIMITS = {
  targetInputTokens: 12_000,
  hardInputTokens: 16_000,
  maxOutputTokens: 2_000,
  reservedInstructionTokens: 2_000,
} as const;
