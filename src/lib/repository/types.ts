export interface RepositoryFile {
  path: string;
  content: string;
  size: number;
}

export type ScanLimitKind =
  | "file_count"
  | "individual_file_bytes"
  | "text_bytes"
  | "duration"
  | "archive_bytes";

export interface ScanCoverage {
  discoveredRelevantFiles: number;
  processedRelevantFiles: number;
  skippedBinaryFiles: number;
  skippedOversizedFiles: number;
  unprocessedRelevantFiles: number;
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

export type HistoryAvailability =
  | "available"
  | "insufficient_history"
  | "rate_limited"
  | "unavailable";

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
  availability: HistoryAvailability;
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
