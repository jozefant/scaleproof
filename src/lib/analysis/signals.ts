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

type IndexedRepositoryFile = RepositoryFile & { normalizedPath: string };

type ContentMatchOptions = {
  pathPatterns?: RegExp[];
  excludePathPatterns?: RegExp[];
  maxResults?: number;
  reachableSourceOnly?: boolean;
  /**
   * Additional per-file admission test. Path regular expressions cannot
   * express execution-context questions such as "is this a production file
   * rather than a test fixture", so callers supply that predicate here.
   */
  matchesFile?: (file: IndexedRepositoryFile) => boolean;
};

const GENERATED_ARTIFACT_PATH =
  /(^|\/)(?:coverage|dist|build|out|generated|playwright-report|test-results|screenshots?|conversation(?:s|[-_ ]history)?)(?:\/|$)|\.(?:snap|png|jpe?g|gif|webp|pdf)$/i;
const JAVASCRIPT_SOURCE_PATH = /\.[cm]?[jt]sx?$/i;
const IMPORT_SPECIFIER = /(?:\bimport\s+(?:type\s+)?(?:[\w*${},\s]+?\s+from\s+)?|\bexport\s+(?:[\w*${},\s]+?\s+from\s+)?|\brequire\s*\()\s*["']([^"']+)["']/g;
type ReachabilityResult = {
  paths: ReadonlySet<string> | null;
  incomplete: boolean;
  entryPoints: string[];
  unresolved: UnresolvedLocalImport[];
};

/**
 * One local import specifier that no scanned file satisfies. The specifier and
 * the importing path are **internal diagnostics**: they exist so a test can say
 * *why* reachability was incomplete. They are never added to a check result,
 * never rendered into the public report, and never sent to a model.
 */
export interface UnresolvedLocalImport {
  from: string;
  specifier: string;
}

export interface SourceReachabilityDiagnostics {
  entryPoints: string[];
  reachablePaths: string[];
  unresolvedLocalImports: UnresolvedLocalImport[];
  incomplete: boolean;
}

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

/**
 * Removes comments while preserving string literals.
 *
 * A comment is not evidence. `// TODO: add an authorization check` describes
 * intent; it must never be read as an implemented control. Stripping has to
 * respect quoting, because `"https://api.example.com"` is a string, not a
 * comment, and a naive strip would delete the rest of that line.
 *
 * Line comments are recognized for `//` anywhere and for `#` only at the start
 * of a line, so an inline JavaScript private field (`obj.#count`) survives. A
 * `#`-prefixed declaration on its own line is treated as a comment; that is a
 * deliberate trade for supporting Python and YAML with one function.
 */
export function withoutComments(content: string): string {
  let output = "";
  let index = 0;
  let quote: string | null = null;
  let atLineStart = true;

  while (index < content.length) {
    const character = content[index]!;
    const next = content[index + 1];
    if (quote) {
      output += character;
      if (character === "\\") {
        output += next ?? "";
        index += 2;
        continue;
      }
      if (character === quote) quote = null;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      output += character;
      index += 1;
      atLineStart = false;
      continue;
    }
    if (character === "/" && next === "/") {
      while (index < content.length && content[index] !== "\n") index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      index += 2;
      while (
        index < content.length &&
        !(content[index] === "*" && content[index + 1] === "/")
      ) {
        index += 1;
      }
      index += 2;
      continue;
    }
    if (character === "#" && atLineStart) {
      while (index < content.length && content[index] !== "\n") index += 1;
      continue;
    }
    if (character === "\n") atLineStart = true;
    else if (character !== " " && character !== "\t" && character !== "\r") {
      atLineStart = false;
    }
    output += character;
    index += 1;
  }
  return output;
}

/**
 * Parses configuration that is JSON with comments and trailing commas.
 * `tsconfig.json` is routinely written that way, and a failed parse used to
 * silently drop every configured alias.
 */
function parseTolerantJson(content: string): unknown {
  const candidates = [
    content,
    withoutComments(content).replace(/,(\s*[}\]])/g, "$1"),
  ];
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }
  return null;
}

function typeScriptAliases(index: RepositoryIndex): SourceAlias[] {
  const config = index.files.find((file) => /(^|\/)(?:tsconfig|jsconfig)(?:\.[\w-]+)?\.json$/i.test(file.normalizedPath));
  if (!config) return [];
  const parsed = parseTolerantJson(config.content) as {
    compilerOptions?: { baseUrl?: unknown; paths?: Record<string, unknown> };
  } | null;
  const options = parsed?.compilerOptions;
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
}

const BUNDLER_CONFIG_PATH = /(^|\/)(?:vite|vitest|rollup|webpack)\.config\.[cm]?[jt]s$/i;
const BUNDLER_ALIAS_BLOCK = /\balias\s*:\s*\{([\s\S]{0,1600}?)\}/g;
const BUNDLER_ALIAS_ENTRY =
  /["'`]([^"'`\s]+)["'`]\s*:\s*(?:[\w$.]+\s*\(\s*(?:[^,()]*,\s*)?)?["'`]([^"'`]+)["'`]/g;

/**
 * Bundler aliases. A React/Vite application usually declares `@` in
 * `vite.config.ts` rather than in `tsconfig.json`, so resolving only the
 * TypeScript form left every aliased import of such a repository unresolved and
 * its source unreachable.
 */
function bundlerAliases(index: RepositoryIndex): SourceAlias[] {
  const config = index.files.find((file) => BUNDLER_CONFIG_PATH.test(file.normalizedPath));
  if (!config) return [];
  const content = withoutComments(config.content);
  const aliases: SourceAlias[] = [];
  for (const block of content.matchAll(BUNDLER_ALIAS_BLOCK)) {
    for (const entry of (block[1] ?? "").matchAll(BUNDLER_ALIAS_ENTRY)) {
      const key = entry[1] ?? "";
      const target = entry[2] ?? "";
      if (!key || !target || target.startsWith("http")) continue;
      const prefix = key.endsWith("/") ? key : `${key}/`;
      const normalizedTarget = target.replace(/\/+$/, "");
      aliases.push({
        prefix,
        suffix: "",
        targets: [`${normalizedTarget}/*`],
        baseUrl: ".",
      });
    }
  }
  return aliases;
}

function sourceAliases(index: RepositoryIndex): SourceAlias[] {
  return [...typeScriptAliases(index), ...bundlerAliases(index)];
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
 * Walks the static import graph from an explicit set of root paths.
 *
 * Roots that are not JavaScript or TypeScript - a Java controller, a Python
 * module - are retained as reached, but their imports are not followed: this
 * bounded scanner has no reliable cross-language import resolver.
 */
function traverseImports(
  index: RepositoryIndex,
  roots: readonly string[],
): { reachable: Set<string>; unresolved: UnresolvedLocalImport[] } {
  const sourceByPath = new Map(
    index.files
      .filter((file) => isImplementationEvidencePath(file.path) && JAVASCRIPT_SOURCE_PATH.test(file.path))
      .map((file) => [file.normalizedPath, file]),
  );
  const known = new Set(index.files.map((file) => file.normalizedPath));
  const aliases = sourceAliases(index);
  const reachable = new Set<string>();
  const unresolved: UnresolvedLocalImport[] = [];
  const pending = [...roots];

  while (pending.length > 0) {
    const path = pending.pop();
    if (!path || reachable.has(path) || !known.has(path)) continue;
    reachable.add(path);
    const file = sourceByPath.get(path);
    if (!file) continue;
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
        unresolved.push({ from: file.normalizedPath, specifier });
      }
      for (const candidate of candidates) {
        if (sourceByPath.has(candidate) && !reachable.has(candidate)) pending.push(candidate);
      }
    }
  }
  return { reachable, unresolved };
}

/**
 * The import closure of an explicit set of roots.
 *
 * `reachableSourcePaths` answers "is this file reachable from *any* application
 * entry point". A caller that needs a narrower call graph - for example only the
 * code a server entry point can reach - supplies its own roots here and gets the
 * same alias resolution.
 */
export function importClosure(
  index: RepositoryIndex,
  roots: readonly string[],
): ReadonlySet<string> {
  return traverseImports(index, roots).reachable;
}

/**
 * Resolves static relative JavaScript and TypeScript imports from conventional
 * application entry points. Other languages remain eligible because this
 * bounded scanner does not have a reliable cross-language import resolver.
 */
export function reachableSourcePaths(index: RepositoryIndex): ReadonlySet<string> | null {
  const cached = reachablePathCache.get(index);
  if (cached !== undefined) return cached.paths;

  const entryPoints = index.files.filter(
    (file) =>
      isImplementationEvidencePath(file.path) &&
      JAVASCRIPT_SOURCE_PATH.test(file.path) &&
      isSourceEntryPoint(file.normalizedPath),
  );
  if (entryPoints.length === 0) {
    reachablePathCache.set(index, {
      paths: null,
      incomplete: false,
      entryPoints: [],
      unresolved: [],
    });
    return null;
  }

  const { reachable, unresolved } = traverseImports(
    index,
    entryPoints.map((file) => file.normalizedPath),
  );
  reachablePathCache.set(index, {
    paths: reachable,
    incomplete: unresolved.length > 0,
    entryPoints: entryPoints.map((file) => file.normalizedPath).sort(),
    unresolved,
  });
  return reachable;
}

/**
 * Internal reachability diagnostics.
 *
 * Tests use this to prove *which* entry points were found and *which* local
 * import specifier could not be resolved. The unresolved specifier is a source
 * path fragment, so it stays here: it is never copied into a check result, the
 * public report, or a model payload.
 */
export function sourceReachabilityDiagnostics(
  index: RepositoryIndex,
): SourceReachabilityDiagnostics {
  reachableSourcePaths(index);
  const cached = reachablePathCache.get(index);
  return {
    entryPoints: cached?.entryPoints ?? [],
    reachablePaths: [...(cached?.paths ?? [])].sort(),
    unresolvedLocalImports: cached?.unresolved ?? [],
    incomplete: cached?.incomplete ?? false,
  };
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
    if (options?.matchesFile && !options.matchesFile(file)) {
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
