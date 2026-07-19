export interface PublicGitHubRepository {
  owner: string;
  repository: string;
  sourceUrl: string;
}

export type PublicGitHubUrlResult =
  | { ok: true; value: PublicGitHubRepository }
  | {
      ok: false;
      reason: "incomplete" | "unsupported" | "nested" | "invalid_segment";
    };

export function parsePublicGitHubRepositoryUrl(
  value: string,
): PublicGitHubUrlResult {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, reason: "incomplete" };
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.hostname.toLowerCase() !== "github.com" ||
    parsed.port ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    return { ok: false, reason: "unsupported" };
  }

  let segments: string[];
  try {
    segments = parsed.pathname
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
  } catch {
    return { ok: false, reason: "invalid_segment" };
  }

  if (segments.length !== 2) {
    return { ok: false, reason: "nested" };
  }

  const owner = segments[0];
  const repository = segments[1].replace(/\.git$/i, "");
  const safeSegment = /^[A-Za-z0-9_.-]+$/;
  if (
    !owner ||
    !repository ||
    !safeSegment.test(owner) ||
    !safeSegment.test(repository)
  ) {
    return { ok: false, reason: "invalid_segment" };
  }

  return {
    ok: true,
    value: {
      owner,
      repository,
      sourceUrl: `https://github.com/${owner}/${repository}`,
    },
  };
}

export function isPublicGitHubRepositoryUrl(value: string): boolean {
  return parsePublicGitHubRepositoryUrl(value).ok;
}
