import { open, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { x as extractTar } from "tar";

import { parsePublicGitHubRepositoryUrl } from "@/lib/shared/github-url";
import {
  createExternalServiceDiagnostics,
  errorCodeForHttpStatus,
  httpStatusClass,
  isAbortError,
  type ExternalServiceDiagnostics,
  type ExternalServiceErrorCode,
} from "@/lib/diagnostics/external-service";
import type {
  RepositoryHistory,
  RepositorySnapshot,
} from "./types";
import {
  anonymizeContributor,
  contextualizeGeneratedHistory,
  deriveMajorModuleScopes,
  summarizeConcentration,
  unavailableHistory,
} from "./history";
import { scanDirectory } from "./scanner";
import { SCAN_LIMITS } from "./policy";

interface GitHubRepositoryLocation {
  owner: string;
  repository: string;
}

interface GitHubMetadata {
  default_branch?: unknown;
  private?: unknown;
}

interface GitHubCommit {
  author?: { id?: unknown } | null;
  commit?: {
    author?: {
      date?: unknown;
      email?: unknown;
    } | null;
  };
}

export class RepositoryAcquisitionError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "invalid_url"
      | "not_found"
      | "private_repository"
      | "download_failed"
      | "archive_too_large"
      | "duration_limit"
      | "cancelled"
      | "scan_failed",
  ) {
    super(message);
    this.name = "RepositoryAcquisitionError";
  }
}

export function parseGitHubUrl(value: string): GitHubRepositoryLocation {
  const parsed = parsePublicGitHubRepositoryUrl(value);
  if (parsed.ok) {
    return {
      owner: parsed.value.owner,
      repository: parsed.value.repository,
    };
  }

  if (parsed.reason === "incomplete") {
    throw new RepositoryAcquisitionError(
      "Enter a complete public GitHub repository URL.",
      "invalid_url",
    );
  }
  if (parsed.reason === "nested") {
    throw new RepositoryAcquisitionError(
      "Use the repository root URL, not a branch, file, issue, or pull request URL.",
      "invalid_url",
    );
  }
  if (parsed.reason === "invalid_segment") {
    throw new RepositoryAcquisitionError(
      "The GitHub owner or repository name is not valid.",
      "invalid_url",
    );
  }

  throw new RepositoryAcquisitionError(
    "Only public https://github.com/owner/repository URLs are supported.",
    "invalid_url",
  );
}

function githubHeaders(): HeadersInit {
  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
    "User-Agent": "scaleproof-hackathon",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

function requestSignal(
  controller: AbortController,
  signal?: AbortSignal,
): AbortSignal {
  return signal
    ? AbortSignal.any([controller.signal, signal])
    : controller.signal;
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new RepositoryAcquisitionError(
      "The repository scan was cancelled.",
      "cancelled",
    );
  }
}

function githubFailureCode(
  status: number | null,
  timedOut: boolean,
  signal?: AbortSignal,
): ExternalServiceErrorCode {
  if (signal?.aborted) {
    return "cancelled";
  }
  if (timedOut) {
    return "timeout";
  }
  return status === null ? "transport_failure" : errorCodeForHttpStatus(status);
}

async function fetchMetadata(
  location: GitHubRepositoryLocation,
  deadline: number,
  signal?: AbortSignal,
  diagnostics: ExternalServiceDiagnostics = createExternalServiceDiagnostics(),
): Promise<{ defaultBranch: string }> {
  const startedAt = Date.now();
  let timedOut = false;
  let status: number | null = null;
  const controller = new AbortController();
  const remainingMs = deadline - startedAt;
  const timeout = setTimeout(
    () => {
      timedOut = true;
      controller.abort();
    },
    Math.max(0, Math.min(15_000, remainingMs)),
  );

  try {
    throwIfCancelled(signal);
    if (remainingMs <= 0) {
      throw new RepositoryAcquisitionError(
        "The 90-second repository acquisition limit was reached.",
        "duration_limit",
      );
    }
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(location.owner)}/${encodeURIComponent(location.repository)}`,
      {
        headers: githubHeaders(),
        signal: requestSignal(controller, signal),
        cache: "no-store",
      },
    );
    status = response.status;

    if (response.status === 404) {
      throw new RepositoryAcquisitionError(
        "The repository was not found or is not public.",
        "not_found",
      );
    }
    if (!response.ok) {
      throw new RepositoryAcquisitionError(
        "GitHub could not provide repository metadata.",
        "download_failed",
      );
    }

    const metadata = (await response.json()) as GitHubMetadata;
    if (metadata.private === true) {
      throw new RepositoryAcquisitionError(
        "Private repositories are intentionally unsupported.",
        "private_repository",
      );
    }
    if (
      typeof metadata.default_branch !== "string" ||
      metadata.default_branch.length === 0
    ) {
      throw new RepositoryAcquisitionError(
        "The repository has no readable default branch.",
        "download_failed",
      );
    }

    diagnostics.terminal({
      provider: "github",
      operation: "repository_metadata",
      attempt: 1,
      durationMs: Math.max(0, Date.now() - startedAt),
      outcome: "success",
      statusClass: httpStatusClass(status),
      providerErrorCode: "none",
      retryDecision: "not_needed",
    });
    return { defaultBranch: metadata.default_branch };
  } catch (error) {
    const providerErrorCode = githubFailureCode(status, timedOut, signal);
    diagnostics.terminal({
      provider: "github",
      operation: "repository_metadata",
      attempt: 1,
      durationMs: Math.max(0, Date.now() - startedAt),
      outcome: providerErrorCode === "cancelled" ? "cancelled" : "failure",
      statusClass: httpStatusClass(status),
      providerErrorCode,
      retryDecision:
        providerErrorCode === "cancelled" ? "cancelled" : "not_retried",
    });
    if (error instanceof RepositoryAcquisitionError) {
      throw error;
    }
    if (signal?.aborted || isAbortError(error) && !timedOut) {
      throwIfCancelled(signal);
    }
    if (Date.now() >= deadline) {
      throw new RepositoryAcquisitionError(
        "The 90-second repository acquisition limit was reached.",
        "duration_limit",
      );
    }
    throw new RepositoryAcquisitionError(
      "GitHub did not respond before the acquisition timeout.",
      "download_failed",
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function downloadArchive(
  location: GitHubRepositoryLocation,
  branch: string,
  destination: string,
  deadline: number,
  signal?: AbortSignal,
  diagnostics: ExternalServiceDiagnostics = createExternalServiceDiagnostics(),
): Promise<void> {
  const startedAt = Date.now();
  let timedOut = false;
  let status: number | null = null;
  const controller = new AbortController();
  const remainingMs = deadline - startedAt;
  const timeout = setTimeout(
    () => {
      timedOut = true;
      controller.abort();
    },
    Math.max(0, Math.min(30_000, remainingMs)),
  );

  try {
    throwIfCancelled(signal);
    if (remainingMs <= 0) {
      throw new RepositoryAcquisitionError(
        "The 90-second repository acquisition limit was reached.",
        "duration_limit",
      );
    }
    const response = await fetch(
      `https://codeload.github.com/${encodeURIComponent(location.owner)}/${encodeURIComponent(location.repository)}/tar.gz/${encodeURIComponent(branch)}`,
      {
        signal: requestSignal(controller, signal),
        cache: "no-store",
      },
    );
    status = response.status;
    if (!response.ok || !response.body) {
      throw new RepositoryAcquisitionError(
        "GitHub could not provide the repository archive.",
        "download_failed",
      );
    }

    const reader = response.body.getReader();
    const fileHandle = await open(destination, "w", 0o600);
    let received = 0;

    try {
      while (true) {
        throwIfCancelled(signal);
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        received += value.byteLength;
        if (received > SCAN_LIMITS.archiveBytes) {
          await reader.cancel();
          throw new RepositoryAcquisitionError(
            "The compressed repository archive exceeds the 80 MB acquisition limit.",
            "archive_too_large",
          );
        }
        await fileHandle.write(value);
      }
    } finally {
      await fileHandle.close();
    }
    diagnostics.terminal({
      provider: "github",
      operation: "archive_download",
      attempt: 1,
      durationMs: Math.max(0, Date.now() - startedAt),
      outcome: "success",
      statusClass: httpStatusClass(status),
      providerErrorCode: "none",
      retryDecision: "not_needed",
    });
  } catch (error) {
    const providerErrorCode = githubFailureCode(status, timedOut, signal);
    diagnostics.terminal({
      provider: "github",
      operation: "archive_download",
      attempt: 1,
      durationMs: Math.max(0, Date.now() - startedAt),
      outcome: providerErrorCode === "cancelled" ? "cancelled" : "failure",
      statusClass: httpStatusClass(status),
      providerErrorCode,
      retryDecision:
        providerErrorCode === "cancelled" ? "cancelled" : "not_retried",
    });
    if (error instanceof RepositoryAcquisitionError) {
      throw error;
    }
    if (signal?.aborted || isAbortError(error) && !timedOut) {
      throwIfCancelled(signal);
    }
    if (Date.now() >= deadline) {
      throw new RepositoryAcquisitionError(
        "The 90-second repository acquisition limit was reached.",
        "duration_limit",
      );
    }
    throw new RepositoryAcquisitionError(
      "The public repository archive could not be downloaded safely.",
      "download_failed",
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRecentContributorKeys(
  location: GitHubRepositoryLocation,
  branch: string,
  scope: string | null,
  deadline: number,
  signal?: AbortSignal,
  diagnostics: ExternalServiceDiagnostics = createExternalServiceDiagnostics(),
): Promise<{
  availability: "available" | "rate_limited" | "unavailable";
  remaining: number | null;
  sample?: {
    sampledCommits: number;
    contributorKeys: string[];
    commitDates: number[];
  };
}> {
  const startedAt = Date.now();
  let status: number | null = null;
  const terminal = (
    outcome: "cancelled" | "failure" | "success",
    providerErrorCode: ExternalServiceErrorCode,
  ): void => {
    diagnostics.terminal({
      provider: "github",
      operation: "commit_history",
      attempt: 1,
      durationMs: Math.max(0, Date.now() - startedAt),
      outcome,
      statusClass: httpStatusClass(status),
      providerErrorCode,
      retryDecision: outcome === "cancelled" ? "cancelled" : "not_retried",
    });
  };
  throwIfCancelled(signal);
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) {
    terminal("failure", "timeout");
    return { availability: "unavailable", remaining: null };
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(10_000, remainingMs),
  );
  const query = new URLSearchParams({
    sha: branch,
    per_page: "100",
  });
  if (scope) {
    query.set("path", scope);
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(location.owner)}/${encodeURIComponent(location.repository)}/commits?${query.toString()}`,
      {
        headers: githubHeaders(),
        signal: requestSignal(controller, signal),
        cache: "no-store",
      },
    );
    status = response.status;
    const remainingHeader = response.headers.get("x-ratelimit-remaining");
    const remaining =
      remainingHeader !== null && /^\d+$/.test(remainingHeader)
        ? Number(remainingHeader)
        : null;
    if (!response.ok) {
      terminal(
        "failure",
        response.status === 403 || response.status === 429 || remaining === 0
          ? "rate_limited"
          : errorCodeForHttpStatus(status),
      );
      return {
        availability:
          response.status === 403 ||
          response.status === 429 ||
          remaining === 0
            ? "rate_limited"
            : "unavailable",
        remaining,
      };
    }

    const commits = (await response.json()) as GitHubCommit[];
    if (!Array.isArray(commits)) {
      terminal("failure", "invalid_response");
      return { availability: "unavailable", remaining };
    }

    const contributorKeys: string[] = [];
    const commitDates: number[] = [];
    for (const commit of commits) {
      const id =
        typeof commit.author?.id === "number"
          ? `github:${commit.author.id}`
          : null;
      const email =
        typeof commit.commit?.author?.email === "string"
          ? `email:${commit.commit.author.email}`
          : null;
      const identity = id ?? email;
      if (identity) {
        // Personal identifiers are immediately reduced to opaque, one-way keys.
        // Names, emails, logins, commit messages, and SHAs never enter the report.
        contributorKeys.push(anonymizeContributor(identity));
      }
      if (typeof commit.commit?.author?.date === "string") {
        const timestamp = Date.parse(commit.commit.author.date);
        if (Number.isFinite(timestamp)) {
          commitDates.push(timestamp);
        }
      }
    }

    terminal("success", "none");
    return {
      availability: "available",
      remaining,
      sample: {
        sampledCommits: commits.length,
        contributorKeys,
        commitDates,
      },
    };
  } catch {
    if (signal?.aborted) {
      terminal("cancelled", "cancelled");
      throwIfCancelled(signal);
    }
    terminal("failure", "transport_failure");
    return { availability: "unavailable", remaining: null };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRepositoryHistory(
  location: GitHubRepositoryLocation,
  branch: string,
  snapshot: RepositorySnapshot,
  deadline: number,
  signal?: AbortSignal,
  diagnostics: ExternalServiceDiagnostics = createExternalServiceDiagnostics(),
): Promise<RepositoryHistory> {
  const moduleScopes = deriveMajorModuleScopes(snapshot.files);
  const repositoryResult = await fetchRecentContributorKeys(
    location,
    branch,
    null,
    deadline,
    signal,
    diagnostics,
  );

  if (!repositoryResult.sample) {
    return unavailableHistory(
      repositoryResult.availability === "rate_limited"
        ? "Recent git-history metadata was rate-limited; no contributor identities were retained."
        : "Recent git-history metadata was unavailable; no contributor identities were retained.",
      repositoryResult.availability,
    );
  }
  const repositorySample = repositoryResult.sample;
  const moduleSamples: Array<
    Awaited<ReturnType<typeof fetchRecentContributorKeys>>
  > = [];
  let remainingBudget = repositoryResult.remaining;
  let moduleRateLimited = false;
  let moduleDeadlineLimited = false;
  for (const scope of moduleScopes) {
    throwIfCancelled(signal);
    if (deadline - Date.now() < 1_500) {
      moduleDeadlineLimited = true;
      break;
    }
    if (remainingBudget !== null && remainingBudget <= 0) {
      moduleRateLimited = true;
      break;
    }

    const result = await fetchRecentContributorKeys(
      location,
      branch,
      scope,
      deadline,
      signal,
      diagnostics,
    );
    moduleSamples.push(result);
    if (result.remaining !== null) {
      remainingBudget = result.remaining;
    }
    if (result.availability === "rate_limited") {
      moduleRateLimited = true;
      break;
    }
  }
  const repositoryConcentration = summarizeConcentration(
    "Repository",
    repositorySample.sampledCommits,
    repositorySample.contributorKeys,
    repositorySample.commitDates,
  );
  const modules = moduleSamples.flatMap((result, index) => {
    const sample = result.sample;
    return sample
      ? [
          summarizeConcentration(
            `Major module ${index + 1}`,
            sample.sampledCommits,
            sample.contributorKeys,
            sample.commitDates,
          ),
        ]
      : [];
  });
  const repositoryAvailability =
    repositoryConcentration.band === "Insufficient evidence"
      ? "insufficient_history"
      : "available";
  const historyNote = moduleRateLimited
    ? `Repository history was sampled, but GitHub rate limits stopped module history after ${modules.length} of ${moduleScopes.length} major scopes. Identities and commit text were discarded after aggregation.`
    : moduleDeadlineLimited
      ? `Repository history was sampled, but the shared deadline stopped module history after ${modules.length} of ${moduleScopes.length} major scopes. Identities and commit text were discarded after aggregation.`
      : "Bus factor is a directional estimate from up to 100 recent commits per scope. Identities and commit text were discarded after aggregation.";

  const history: RepositoryHistory = {
    source: "github_recent_commits",
    availability: moduleRateLimited ? "rate_limited" : repositoryAvailability,
    repository: repositoryConcentration,
    modules,
    note: historyNote,
  };
  return contextualizeGeneratedHistory(snapshot.files, history);
}

async function extractRepositoryArchive(
  archivePath: string,
  tempRoot: string,
  signal?: AbortSignal,
): Promise<void> {
  let expandedBytes = 0;
  let entries = 0;

  await extractTar({
    file: archivePath,
    cwd: tempRoot,
    strip: 1,
    preservePaths: false,
    maxDecompressionRatio: 50,
    filter: (_entryPath, entry) => {
      throwIfCancelled(signal);
      if (
        "type" in entry &&
        (entry.type === "SymbolicLink" || entry.type === "Link")
      ) {
        return false;
      }

      entries += 1;
      expandedBytes += entry.size;
      if (
        entries > SCAN_LIMITS.archiveEntries ||
        expandedBytes > SCAN_LIMITS.expandedArchiveBytes
      ) {
        throw new RepositoryAcquisitionError(
          "The expanded repository archive exceeds the safe extraction limit.",
          "archive_too_large",
        );
      }
      return true;
    },
  });
}

export async function acquirePublicRepository(
  repositoryUrl: string,
  signal?: AbortSignal,
  diagnostics: ExternalServiceDiagnostics = createExternalServiceDiagnostics(),
): Promise<RepositorySnapshot> {
  const startedAt = Date.now();
  const deadline = startedAt + SCAN_LIMITS.durationMs;
  const location = parseGitHubUrl(repositoryUrl);
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "scaleproof-"));
  const archivePath = path.join(tempRoot, "repository.tar.gz");

  try {
    throwIfCancelled(signal);
    const metadata = await fetchMetadata(location, deadline, signal, diagnostics);
    await downloadArchive(
      location,
      metadata.defaultBranch,
      archivePath,
      deadline,
      signal,
      diagnostics,
    );
    await extractRepositoryArchive(archivePath, tempRoot, signal);

    if (Date.now() >= deadline) {
      throw new RepositoryAcquisitionError(
        "The 90-second repository acquisition limit was reached.",
        "duration_limit",
      );
    }

    const snapshot = await scanDirectory({
      root: tempRoot,
      repositoryLabel: `${location.owner}/${location.repository}`,
      sourceUrl: `https://github.com/${location.owner}/${location.repository}`,
      startedAt,
      deadline,
      signal,
    });
    const history = await fetchRepositoryHistory(
      location,
      metadata.defaultBranch,
      snapshot,
      deadline,
      signal,
      diagnostics,
    );
    return { ...snapshot, history };
  } catch (error) {
    if (error instanceof RepositoryAcquisitionError) {
      throw error;
    }
    throw new RepositoryAcquisitionError(
      "The repository could not be scanned.",
      "scan_failed",
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}
