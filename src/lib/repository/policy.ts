export const SCAN_LIMITS = {
  relevantFiles: 5_000,
  individualTextFileBytes: 1 * 1024 * 1024,
  textBytes: 50 * 1024 * 1024,
  durationMs: 90_000,
  archiveBytes: 80 * 1024 * 1024,
  expandedArchiveBytes: 200 * 1024 * 1024,
  archiveEntries: 25_000,
} as const;

export const HISTORY_LIMITS = {
  recentCommitsPerScope: 100,
  majorModules: 6,
  minimumCommits: 10,
} as const;
