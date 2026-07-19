export type DomainId =
  | "architecture"
  | "quality"
  | "security"
  | "operations"
  | "reliability"
  | "resilience"
  | "agent_readiness";

export type Outcome = "pass" | "fail" | "unknown" | "not_applicable";

export type EvidenceTier =
  | "enforced"
  | "inferred"
  | "documented"
  | "absent"
  | "runtime_only";

export type Severity = "info" | "low" | "medium" | "high" | "critical";

export type Stage =
  | "prototype"
  | "live_early"
  | "scaling_production"
  | "unknown"
  | "withheld";

export type DataSensitivity =
  | "none"
  | "basic_personal"
  | "sensitive_regulated"
  | "unknown"
  | "withheld";

export type GrowthTarget =
  | "users_10x"
  | "users_100x"
  | "engineering_team"
  | "users_and_team"
  | "unknown"
  | "withheld";

export interface ScanContext {
  stage: Stage;
  dataSensitivity: DataSensitivity;
  growthTarget: GrowthTarget;
}

export interface EvidenceReference {
  path: string;
  kind: "code" | "configuration" | "test" | "documentation" | "workflow";
}

export interface CheckResult {
  id: string;
  domain: DomainId;
  title: string;
  outcome: Outcome;
  evidenceTier: EvidenceTier;
  severity: Severity;
  weight: number;
  summary: string;
  remediationCode: string;
  evidence: EvidenceReference[];
}

export interface DomainScore {
  id: DomainId;
  label: string;
  score: number;
  weight: number;
  assessableWeight: number;
  applicableWeight: number;
  positiveEvidenceWeight: number;
  concreteNegativeWeight: number;
  missingEvidenceWeight: number;
  runtimeOnlyWeight: number;
}

export type Verdict = "Fundable" | "Fixable" | "Rewrite";

export type RuntimeReadiness =
  | "Likely ready"
  | "Ready with conditions"
  | "Blocked by architecture"
  | "Insufficient evidence";

export type TeamReadiness =
  | "Parallel-friendly"
  | "Conditional"
  | "Coordination risk"
  | "Insufficient evidence";

export type AgentReadiness =
  | "Agent-ready"
  | "Usable with guardrails"
  | "Weak harness"
  | "Insufficient evidence";

export interface GrowthAssessment {
  users10x: RuntimeReadiness;
  users100x: RuntimeReadiness;
  team: TeamReadiness;
  agents: AgentReadiness;
}

export interface ScoreResult {
  verdict: Verdict;
  score: number;
  confidence: number;
  verdictReason: string;
  domains: DomainScore[];
  growth: GrowthAssessment;
}

export interface AnalysisDraft extends ScoreResult {
  context: ScanContext;
  checks: CheckResult[];
}
