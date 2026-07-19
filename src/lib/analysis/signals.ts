import type {
  EvidenceReference,
} from "./types";
import type {
  RepositoryFile,
  RepositorySnapshot,
} from "@/lib/repository/types";

export interface RepositoryIndex {
  snapshot: RepositorySnapshot;
  files: Array<RepositoryFile & { normalizedPath: string }>;
}

export function createRepositoryIndex(
  snapshot: RepositorySnapshot,
): RepositoryIndex {
  return {
    snapshot,
    files: snapshot.files.map((file) => ({
      ...file,
      normalizedPath: file.path.toLowerCase(),
    })),
  };
}

function evidenceKind(
  path: string,
): EvidenceReference["kind"] {
  const normalized = path.toLowerCase();
  if (
    normalized.includes("/test") ||
    normalized.includes("/__tests__/") ||
    /\.(spec|test)\.[cm]?[jt]sx?$/.test(normalized)
  ) {
    return "test";
  }
  if (
    normalized.startsWith(".github/") ||
    normalized.startsWith(".circleci/") ||
    normalized.includes("gitlab-ci") ||
    normalized.includes("azure-pipelines")
  ) {
    return "workflow";
  }
  if (
    normalized.endsWith(".md") ||
    normalized.startsWith("docs/") ||
    normalized.includes("/docs/")
  ) {
    return "documentation";
  }
  if (
    /\.(ya?ml|json|toml|properties|conf|config\.[cm]?[jt]s)$/.test(
      normalized,
    ) ||
    normalized.includes("dockerfile") ||
    normalized.includes("makefile")
  ) {
    return "configuration";
  }
  return "code";
}

function toReferences(
  files: RepositoryFile[],
  maxResults = 4,
): EvidenceReference[] {
  return files.slice(0, maxResults).map((file) => ({
    path: file.path,
    kind: evidenceKind(file.path),
  }));
}

export function findPaths(
  index: RepositoryIndex,
  patterns: RegExp[],
  maxResults = 4,
): EvidenceReference[] {
  const matches = index.files.filter((file) =>
    patterns.some((pattern) => pattern.test(file.normalizedPath)),
  );
  return toReferences(matches, maxResults);
}

export function findContent(
  index: RepositoryIndex,
  patterns: RegExp[],
  options?: {
    pathPatterns?: RegExp[];
    excludePathPatterns?: RegExp[];
    maxResults?: number;
  },
): EvidenceReference[] {
  const maxResults = options?.maxResults ?? 4;
  const matches: RepositoryFile[] = [];

  for (const file of index.files) {
    if (
      options?.pathPatterns &&
      !options.pathPatterns.some((pattern) =>
        pattern.test(file.normalizedPath),
      )
    ) {
      continue;
    }
    if (
      options?.excludePathPatterns?.some((pattern) =>
        pattern.test(file.normalizedPath),
      )
    ) {
      continue;
    }
    if (patterns.some((pattern) => pattern.test(file.content))) {
      matches.push(file);
      if (matches.length >= maxResults) {
        break;
      }
    }
  }

  return toReferences(matches, maxResults);
}

export function mergeEvidence(
  ...groups: EvidenceReference[][]
): EvidenceReference[] {
  const unique = new Map<string, EvidenceReference>();
  for (const group of groups) {
    for (const reference of group) {
      unique.set(reference.path, reference);
    }
  }
  return [...unique.values()].slice(0, 6);
}

export function countSourceAreas(index: RepositoryIndex): number {
  const areas = new Set<string>();
  const sourceMarker =
    /^(?:src|app|apps|packages|services|modules|api|ui|backend|frontend)\/([^/]+)/;

  for (const file of index.files) {
    const match = file.normalizedPath.match(sourceMarker);
    if (match?.[1]) {
      areas.add(match[1]);
    }

    const javaMatch = file.normalizedPath.match(
      /src\/main\/java\/(?:[^/]+\/){2,5}([^/]+)\//,
    );
    if (javaMatch?.[1]) {
      areas.add(javaMatch[1]);
    }
  }

  return areas.size;
}

export function hasDurableData(index: RepositoryIndex): boolean {
  return (
    findPaths(index, [
      /(^|\/)migrations?\//,
      /(^|\/)db\//,
      /schema\.(sql|prisma)$/,
      /flyway/,
      /liquibase/,
    ]).length > 0 ||
    findContent(index, [
      /\b(prisma|typeorm|sequelize|mongoose|hibernate|jpa|jdbc|postgres|mysql|mongodb)\b/i,
    ]).length > 0
  );
}
