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

type ContentMatchOptions = {
  pathPatterns?: RegExp[];
  excludePathPatterns?: RegExp[];
  maxResults?: number;
  reachableSourceOnly?: boolean;
};

const GENERATED_ARTIFACT_PATH =
  /(^|\/)(?:coverage|dist|build|out|generated|playwright-report|test-results|screenshots?|conversation(?:s|[-_ ]history)?)(?:\/|$)|\.(?:snap|png|jpe?g|gif|webp|pdf)$/i;
const JAVASCRIPT_SOURCE_PATH = /\.[cm]?[jt]sx?$/i;
const IMPORT_SPECIFIER = /(?:\bimport\s+(?:type\s+)?(?:[\w*${},\s]+?\s+from\s+)?|\bexport\s+(?:[\w*${},\s]+?\s+from\s+)?|\brequire\s*\()\s*["']([^"']+)["']/g;
type ReachabilityResult = {
  paths: ReadonlySet<string> | null;
  incomplete: boolean;
};

const reachablePathCache = new WeakMap<RepositoryIndex, ReachabilityResult>();

type SourceAlias = {
  prefix: string;
  suffix: string;
  targets: string[];
  baseUrl: string;
};

export function isImplementationEvidencePath(path: string): boolean {
  return !GENERATED_ARTIFACT_PATH.test(path.replaceAll("\\", "/"));
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "").toLowerCase();
}

function importCandidates(fromPath: string, specifier: string): string[] {
  const base = fromPath.split("/").slice(0, -1);
  for (const segment of specifier.split("/")) {
    if (segment === "." || segment === "") continue;
    if (segment === "..") base.pop();
    else base.push(segment);
  }
  const resolved = base.join("/").replace(/\.(?:[cm]?[jt]sx?)$/i, "");
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"];
  return [
    ...extensions.map((extension) => `${resolved}${extension}`),
    ...extensions.map((extension) => `${resolved}/index${extension}`),
  ].map(normalizePath);
}

function sourceAliases(index: RepositoryIndex): SourceAlias[] {
  const config = index.files.find((file) => /(^|\/)(?:tsconfig|jsconfig)\.json$/i.test(file.normalizedPath));
  if (!config) return [];
  try {
    const parsed = JSON.parse(config.content) as {
      compilerOptions?: { baseUrl?: unknown; paths?: Record<string, unknown> };
    };
    const options = parsed.compilerOptions;
    const baseUrl = typeof options?.baseUrl === "string" ? options.baseUrl : ".";
    return Object.entries(options?.paths ?? {}).flatMap(([alias, targets]) => {
      if (!Array.isArray(targets) || !targets.every((target) => typeof target === "string")) return [];
      const wildcard = alias.indexOf("*");
      return [{
        prefix: wildcard < 0 ? alias : alias.slice(0, wildcard),
        suffix: wildcard < 0 ? "" : alias.slice(wildcard + 1),
        targets,
        baseUrl,
      }];
    });
  } catch {
    return [];
  }
}

function aliasImportCandidates(specifier: string, aliases: SourceAlias[]): string[] {
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"];
  return aliases.flatMap((alias) => {
    if (!specifier.startsWith(alias.prefix) || !specifier.endsWith(alias.suffix)) return [];
    const wildcardValue = specifier.slice(alias.prefix.length, specifier.length - alias.suffix.length || undefined);
    return alias.targets.flatMap((target) => {
      const resolved = `${alias.baseUrl}/${target.replace("*", wildcardValue)}`
        .replace(/\\/g, "/")
        .replace(/^\.\//, "")
        .replace(/\/(?:\.\/)+/g, "/")
        .replace(/\.(?:[cm]?[jt]sx?)$/i, "");
      return [
        ...extensions.map((extension) => `${resolved}${extension}`),
        ...extensions.map((extension) => `${resolved}/index${extension}`),
      ].map(normalizePath);
    });
  });
}

function isSourceEntryPoint(path: string): boolean {
  if (/^(?:src\/)?(?:main|index|server|client)\.[cm]?[jt]sx?$/i.test(path)) return true;
  if (/(^|\/)supabase\/functions\/[^/]+\/index\.[cm]?[jt]s$/i.test(path)) return true;
  if (/(^|\/)(?:src\/)?pages\/(?!api\/).*\.[cm]?[jt]sx?$/i.test(path)) return true;
  return /(^|\/)(?:src\/)?app\/(?:.*\/)?(?:page|layout|template|loading|error|not-found|default|route)\.[cm]?[jt]sx?$/i.test(path);
}

/**
 * Resolves static relative JavaScript and TypeScript imports from conventional
 * application entry points. Other languages remain eligible because this
 * bounded scanner does not have a reliable cross-language import resolver.
 */
export function reachableSourcePaths(index: RepositoryIndex): ReadonlySet<string> | null {
  const cached = reachablePathCache.get(index);
  if (cached !== undefined) return cached.paths;

  const sourceFiles = index.files.filter(
    (file) => isImplementationEvidencePath(file.path) && JAVASCRIPT_SOURCE_PATH.test(file.path),
  );
  const sourceByPath = new Map(sourceFiles.map((file) => [file.normalizedPath, file]));
  const entryPoints = sourceFiles.filter((file) => isSourceEntryPoint(file.normalizedPath));
  const aliases = sourceAliases(index);
  if (entryPoints.length === 0) {
    reachablePathCache.set(index, { paths: null, incomplete: false });
    return null;
  }

  const reachable = new Set<string>();
  const pending = entryPoints.map((file) => file.normalizedPath);
  let hasUnresolvedLocalImport = false;
  while (pending.length > 0) {
    const path = pending.pop();
    if (!path || reachable.has(path)) continue;
    const file = sourceByPath.get(path);
    if (!file) continue;
    reachable.add(path);
    for (const match of file.content.matchAll(IMPORT_SPECIFIER)) {
      const specifier = match[1];
      if (!specifier) continue;
      const candidates = specifier.startsWith(".")
        ? importCandidates(file.normalizedPath, specifier)
        : aliasImportCandidates(specifier, aliases);
      const isConfiguredAlias = aliases.some(
        (alias) => specifier.startsWith(alias.prefix) && specifier.endsWith(alias.suffix),
      );
      if ((specifier.startsWith(".") || isConfiguredAlias) && !candidates.some((candidate) => sourceByPath.has(candidate))) {
        hasUnresolvedLocalImport = true;
      }
      for (const candidate of candidates) {
        if (sourceByPath.has(candidate) && !reachable.has(candidate)) pending.push(candidate);
      }
    }
  }
  if (hasUnresolvedLocalImport) {
    reachablePathCache.set(index, { paths: reachable, incomplete: true });
    return reachable;
  }
  reachablePathCache.set(index, { paths: reachable, incomplete: false });
  return reachable;
}

/**
 * Reaching a known entry point is not proof that every local import resolved.
 * Consumers can retain this fact without widening source-evidence eligibility.
 */
export function hasIncompleteSourceReachability(index: RepositoryIndex): boolean {
  reachableSourcePaths(index);
  return reachablePathCache.get(index)?.incomplete ?? false;
}

export function isReachableImplementationEvidenceFile(
  index: RepositoryIndex,
  file: RepositoryFile & { normalizedPath: string },
): boolean {
  if (!isImplementationEvidencePath(file.path) || !JAVASCRIPT_SOURCE_PATH.test(file.path)) {
    return isImplementationEvidencePath(file.path);
  }
  const reachable = reachableSourcePaths(index);
  return reachable === null || reachable.has(file.normalizedPath);
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
  const matches = index.files.filter(
    (file) =>
      isImplementationEvidencePath(file.path) &&
      patterns.some((pattern) => pattern.test(file.normalizedPath)),
  );
  return toReferences(matches, maxResults);
}

export function findContent(
  index: RepositoryIndex,
  patterns: RegExp[],
  options?: ContentMatchOptions,
): EvidenceReference[] {
  return findContentMatching(index, (content) => patterns.some((pattern) => pattern.test(content)), options);
}

export function findContentMatching(
  index: RepositoryIndex,
  matchesContent: (content: string) => boolean,
  options?: ContentMatchOptions,
): EvidenceReference[] {
  const maxResults = options?.maxResults ?? 4;
  const matches: RepositoryFile[] = [];

  for (const file of index.files) {
    if (!isImplementationEvidencePath(file.path)) {
      continue;
    }
    if (options?.reachableSourceOnly && !isReachableImplementationEvidenceFile(index, file)) {
      continue;
    }
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
    if (matchesContent(file.content)) {
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
