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

export interface RepositoryFile {
  path: string;
  content: string;
  size: number;
}

export type ScanLimitKind =
  | "file_count"
  | "text_bytes"
  | "duration"
  | "archive_bytes";

export interface ScanCoverage {
  discoveredRelevantFiles: number;
  processedRelevantFiles: number;
  processedTextBytes: number;
  durationMs: number;
  partial: boolean;
  limitsCrossed: ScanLimitKind[];
}

export type BusFactorBand =
  | "Distributed"
  | "Moderate concentration"
  | "High concentration"
  | "Expected for initial Lovable export"
  | "Insufficient evidence";

export interface HistoryConcentration {
  scope: string;
  sampledCommits: number;
  attributedCommits: number;
  activeContributors: number;
  estimatedBusFactor: number | null;
  topContributorShare: number | null;
  sampleWindowDays?: number | null;
  band: BusFactorBand;
}

export interface RepositoryProvenance {
  platform: "Lovable";
  classification: "initial_export" | "established_project";
  signals: string[];
  note: string;
}

export interface RepositoryHistory {
  source: "github_recent_commits" | "synthetic" | "unavailable";
  repository: HistoryConcentration;
  modules: HistoryConcentration[];
  note: string;
  provenance?: RepositoryProvenance;
}

export interface RepositorySnapshot {
  repositoryLabel: string;
  sourceUrl: string | null;
  files: RepositoryFile[];
  coverage: ScanCoverage;
  detectedStacks: string[];
  history: RepositoryHistory;
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

export interface FounderAction {
  rank: 1 | 2 | 3;
  title: string;
  rationale: string;
  remediationCode: string;
  severity: Severity;
}

export interface AiSynthesisMeta {
  source: "gpt-5.6" | "deterministic";
  model: string | null;
  findingsIncluded: number;
  totalFindings: number;
  inputTokens: number | null;
  outputTokens: number | null;
  limited: boolean;
  note: string;
}

export interface AnalysisReport {
  heuristicVersion: string;
  repositoryLabel: string;
  sourceUrl: string | null;
  generatedAt: string;
  verdict: Verdict;
  score: number;
  confidence: number;
  disclaimer: "Automated snapshot, not an audit";
  verdictReason: string;
  context: ScanContext;
  coverage: ScanCoverage;
  detectedStacks: string[];
  domains: DomainScore[];
  growth: GrowthAssessment;
  busFactor: RepositoryHistory;
  actions: FounderAction[];
  checks: CheckResult[];
  ai: AiSynthesisMeta;
}

export interface ScoreResult {
  verdict: Verdict;
  score: number;
  confidence: number;
  verdictReason: string;
  domains: DomainScore[];
  growth: GrowthAssessment;
}
