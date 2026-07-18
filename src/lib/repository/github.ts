import { open, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { x as extractTar } from "tar";

import { SCAN_LIMITS } from "@/lib/analysis/constants";
import type {
  RepositoryHistory,
  RepositorySnapshot,
} from "@/lib/analysis/types";
import {
  anonymizeContributor,
  contextualizeGeneratedHistory,
  deriveMajorModuleScopes,
  summarizeConcentration,
  unavailableHistory,
} from "./history";
import { scanDirectory } from "./scanner";

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
      | "scan_failed",
  ) {
    super(message);
    this.name = "RepositoryAcquisitionError";
  }
}

export function parseGitHubUrl(value: string): GitHubRepositoryLocation {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new RepositoryAcquisitionError(
      "Enter a complete public GitHub repository URL.",
      "invalid_url",
    );
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.hostname.toLowerCase() !== "github.com" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new RepositoryAcquisitionError(
      "Only public https://github.com/owner/repository URLs are supported.",
      "invalid_url",
    );
  }

  const segments = parsed.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));

  if (segments.length !== 2) {
    throw new RepositoryAcquisitionError(
      "Use the repository root URL, not a branch, file, issue, or pull request URL.",
      "invalid_url",
    );
  }

  const owner = segments[0];
  const repository = segments[1].replace(/\.git$/i, "");
  const safeSegment = /^[A-Za-z0-9_.-]+$/;
  if (!safeSegment.test(owner) || !safeSegment.test(repository)) {
    throw new RepositoryAcquisitionError(
      "The GitHub owner or repository name is not valid.",
      "invalid_url",
    );
  }

  return { owner, repository };
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

async function fetchMetadata(
  location: GitHubRepositoryLocation,
  deadline: number,
): Promise<{ defaultBranch: string }> {
  const controller = new AbortController();
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) {
    throw new RepositoryAcquisitionError(
      "The 90-second repository acquisition limit was reached.",
      "duration_limit",
    );
  }
  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(15_000, remainingMs),
  );

  try {
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(location.owner)}/${encodeURIComponent(location.repository)}`,
      {
        headers: githubHeaders(),
        signal: controller.signal,
        cache: "no-store",
      },
    );

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

    return { defaultBranch: metadata.default_branch };
  } catch (error) {
    if (error instanceof RepositoryAcquisitionError) {
      throw error;
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
): Promise<void> {
  const controller = new AbortController();
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) {
    throw new RepositoryAcquisitionError(
      "The 90-second repository acquisition limit was reached.",
      "duration_limit",
    );
  }
  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(30_000, remainingMs),
  );

  try {
    const response = await fetch(
      `https://codeload.github.com/${encodeURIComponent(location.owner)}/${encodeURIComponent(location.repository)}/tar.gz/${encodeURIComponent(branch)}`,
      {
        signal: controller.signal,
        cache: "no-store",
      },
    );
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
  } catch (error) {
    if (error instanceof RepositoryAcquisitionError) {
      throw error;
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
): Promise<{
  sampledCommits: number;
  contributorKeys: string[];
  commitDates: number[];
} | null> {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) {
    return null;
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
        signal: controller.signal,
        cache: "no-store",
      },
    );
    if (!response.ok) {
      return null;
    }

    const commits = (await response.json()) as GitHubCommit[];
    if (!Array.isArray(commits)) {
      return null;
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

    return {
      sampledCommits: commits.length,
      contributorKeys,
      commitDates,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRepositoryHistory(
  location: GitHubRepositoryLocation,
  branch: string,
  snapshot: RepositorySnapshot,
  deadline: number,
): Promise<RepositoryHistory> {
  const moduleScopes = deriveMajorModuleScopes(snapshot.files);
  const [repositorySample, ...moduleSamples] = await Promise.all([
    fetchRecentContributorKeys(location, branch, null, deadline),
    ...moduleScopes.map((scope) =>
      fetchRecentContributorKeys(location, branch, scope, deadline),
    ),
  ]);

  if (!repositorySample) {
    return unavailableHistory(
      "Recent git-history metadata was unavailable or rate-limited; no contributor identities were retained.",
    );
  }

  const history: RepositoryHistory = {
    source: "github_recent_commits",
    repository: summarizeConcentration(
      "Repository",
      repositorySample.sampledCommits,
      repositorySample.contributorKeys,
      repositorySample.commitDates,
    ),
    modules: moduleScopes.flatMap((scope, index) => {
      const sample = moduleSamples[index];
      return sample
        ? [
            summarizeConcentration(
              scope,
              sample.sampledCommits,
              sample.contributorKeys,
              sample.commitDates,
            ),
          ]
        : [];
    }),
    note:
      "Bus factor is a directional estimate from up to 100 recent commits per scope. Identities and commit text were discarded after aggregation.",
  };
  return contextualizeGeneratedHistory(snapshot.files, history);
}

async function extractRepositoryArchive(
  archivePath: string,
  tempRoot: string,
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
): Promise<RepositorySnapshot> {
  const startedAt = Date.now();
  const deadline = startedAt + SCAN_LIMITS.durationMs;
  const location = parseGitHubUrl(repositoryUrl);
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "scaleproof-"));
  const archivePath = path.join(tempRoot, "repository.tar.gz");

  try {
    const metadata = await fetchMetadata(location, deadline);
    await downloadArchive(
      location,
      metadata.defaultBranch,
      archivePath,
      deadline,
    );
    await extractRepositoryArchive(archivePath, tempRoot);

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
    });
    const history = await fetchRepositoryHistory(
      location,
      metadata.defaultBranch,
      snapshot,
      deadline,
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
