import { z } from "zod";
import { isPublicGitHubRepositoryUrl } from "@/lib/shared/github-url";

export const REPORT_SCHEMA_VERSION = "1.0.0" as const;

const DomainIdSchema = z.enum([
  "architecture",
  "quality",
  "security",
  "operations",
  "reliability",
  "resilience",
  "agent_readiness",
]);
const OutcomeSchema = z.enum(["pass", "fail", "unknown", "not_applicable"]);
const EvidenceTierSchema = z.enum([
  "enforced",
  "inferred",
  "documented",
  "absent",
  "runtime_only",
]);
const SeveritySchema = z.enum(["info", "low", "medium", "high", "critical"]);
const EvidenceReferenceSchema = z.object({
  path: z.string(),
  kind: z.enum(["code", "configuration", "test", "documentation", "workflow"]),
});
const CheckResultSchema = z.object({
  id: z.string(),
  domain: DomainIdSchema,
  title: z.string(),
  outcome: OutcomeSchema,
  evidenceTier: EvidenceTierSchema,
  severity: SeveritySchema,
  weight: z.number(),
  summary: z.string(),
  remediationCode: z.string(),
  evidence: z.array(EvidenceReferenceSchema),
});
const DomainScoreSchema = z.object({
  id: DomainIdSchema,
  label: z.string(),
  score: z.number(),
  weight: z.number(),
  assessableWeight: z.number(),
  applicableWeight: z.number(),
  positiveEvidenceWeight: z.number(),
  concreteNegativeWeight: z.number(),
  missingEvidenceWeight: z.number(),
  runtimeOnlyWeight: z.number(),
});
const ScanContextSchema = z.object({
  stage: z.enum([
    "prototype",
    "live_early",
    "scaling_production",
    "unknown",
    "withheld",
  ]),
  dataSensitivity: z.enum([
    "none",
    "basic_personal",
    "sensitive_regulated",
    "unknown",
    "withheld",
  ]),
  growthTarget: z.enum([
    "users_10x",
    "users_100x",
    "engineering_team",
    "users_and_team",
    "unknown",
    "withheld",
  ]),
});
const ScanCoverageSchema = z.object({
  discoveredRelevantFiles: z.number().int().nonnegative(),
  processedRelevantFiles: z.number().int().nonnegative(),
  skippedBinaryFiles: z.number().int().nonnegative(),
  skippedOversizedFiles: z.number().int().nonnegative(),
  unprocessedRelevantFiles: z.number().int().nonnegative(),
  processedTextBytes: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
  partial: z.boolean(),
  limitsCrossed: z.array(
    z.enum([
      "file_count",
      "individual_file_bytes",
      "text_bytes",
      "duration",
      "archive_bytes",
    ]),
  ),
});
const HistoryConcentrationSchema = z.object({
  scope: z.string(),
  sampledCommits: z.number().int().nonnegative(),
  attributedCommits: z.number().int().nonnegative(),
  activeContributors: z.number().int().nonnegative(),
  estimatedBusFactor: z.number().int().positive().nullable(),
  topContributorShare: z.number().min(0).max(100).nullable(),
  sampleWindowDays: z.number().nonnegative().nullable().optional(),
  band: z.enum([
    "Distributed",
    "Moderate concentration",
    "High concentration",
    "Expected for initial Lovable export",
    "Insufficient evidence",
  ]),
});
const RepositoryHistorySchema = z.object({
  source: z.enum(["github_recent_commits", "synthetic", "unavailable"]),
  availability: z.enum([
    "available",
    "insufficient_history",
    "rate_limited",
    "unavailable",
  ]),
  repository: HistoryConcentrationSchema,
  modules: z.array(HistoryConcentrationSchema),
  note: z.string(),
  provenance: z
    .object({
      platform: z.literal("Lovable"),
      classification: z.enum(["initial_export", "established_project"]),
      signals: z.array(z.string()),
      note: z.string(),
    })
    .optional(),
});
const GrowthAssessmentSchema = z.object({
  users10x: z.enum([
    "Likely ready",
    "Ready with conditions",
    "Blocked by architecture",
    "Insufficient evidence",
  ]),
  users100x: z.enum([
    "Likely ready",
    "Ready with conditions",
    "Blocked by architecture",
    "Insufficient evidence",
  ]),
  team: z.enum([
    "Parallel-friendly",
    "Conditional",
    "Coordination risk",
    "Insufficient evidence",
  ]),
  agents: z.enum([
    "Agent-ready",
    "Usable with guardrails",
    "Weak harness",
    "Insufficient evidence",
  ]),
});
const FounderActionSchema = z.object({
  rank: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  title: z.string(),
  rationale: z.string(),
  remediationCode: z.string(),
  severity: SeveritySchema,
  domain: DomainIdSchema,
  sourceCheckIds: z.array(z.string()).min(1),
  whyNow: z.string(),
  evidence: z.array(EvidenceReferenceSchema).max(3),
  verification: z.string(),
});
const AiSynthesisMetaSchema = z.object({
  source: z.enum(["gpt-5.6", "deterministic"]),
  model: z.string().nullable(),
  findingsIncluded: z.number().int().nonnegative(),
  totalFindings: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  limited: z.boolean(),
  note: z.string(),
});

export const AnalysisReportSchema = z.object({
  schemaVersion: z.literal(REPORT_SCHEMA_VERSION),
  heuristicVersion: z.string(),
  repositoryLabel: z.string(),
  sourceUrl: z
    .string()
    .refine(
      isPublicGitHubRepositoryUrl,
      "Expected a public GitHub repository root URL.",
    )
    .nullable(),
  generatedAt: z.string().datetime(),
  verdict: z.enum(["Fundable", "Fixable", "Rewrite"]),
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(100),
  disclaimer: z.literal("Automated snapshot, not an audit"),
  verdictReason: z.string(),
  context: ScanContextSchema,
  coverage: ScanCoverageSchema,
  detectedStacks: z.array(z.string()),
  domains: z.array(DomainScoreSchema),
  growth: GrowthAssessmentSchema,
  busFactor: RepositoryHistorySchema,
  actions: z.array(FounderActionSchema).max(3),
  checks: z.array(CheckResultSchema),
  ai: AiSynthesisMetaSchema,
});

export type AnalysisReport = z.infer<typeof AnalysisReportSchema>;
export type FounderAction = z.infer<typeof FounderActionSchema>;
export type AiSynthesisMeta = z.infer<typeof AiSynthesisMetaSchema>;
export type PublicDomainScore = z.infer<typeof DomainScoreSchema>;
export type PublicCheckResult = z.infer<typeof CheckResultSchema>;
export type PublicDomainId = z.infer<typeof DomainIdSchema>;
export type ScanContext = z.infer<typeof ScanContextSchema>;
export type Stage = ScanContext["stage"];
export type DataSensitivity = ScanContext["dataSensitivity"];
export type GrowthTarget = ScanContext["growthTarget"];

export function parseAnalysisReport(value: unknown): AnalysisReport {
  return AnalysisReportSchema.parse(value);
}

export function safeParseAnalysisReport(value: unknown) {
  return AnalysisReportSchema.safeParse(value);
}
