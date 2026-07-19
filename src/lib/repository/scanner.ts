import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { SCAN_LIMITS } from "./policy";
import type {
  RepositoryFile,
  RepositorySnapshot,
  ScanLimitKind,
} from "./types";
import { unavailableHistory } from "./history";

const SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  ".idea",
  ".vscode",
  "build",
  "coverage",
  "dist",
  "generated",
  "node_modules",
  "out",
  "target",
  "vendor",
]);

const SKIPPED_FILES = new Set([
  "bun.lock",
  "bun.lockb",
  "composer.lock",
  "package-lock.json",
  "pnpm-lock.yaml",
  "poetry.lock",
  "yarn.lock",
]);

const RELEVANT_EXTENSIONS = new Set([
  ".c",
  ".conf",
  ".cpp",
  ".cs",
  ".css",
  ".env",
  ".example",
  ".go",
  ".gradle",
  ".graphql",
  ".h",
  ".html",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".kt",
  ".kts",
  ".md",
  ".mjs",
  ".php",
  ".properties",
  ".proto",
  ".prisma",
  ".py",
  ".rb",
  ".rs",
  ".scss",
  ".sh",
  ".sql",
  ".tf",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

const RELEVANT_EXTENSIONLESS = new Set([
  "dockerfile",
  "jenkinsfile",
  "makefile",
  "procfile",
  "readme",
  "doctor",
]);

function isRelevantFile(fileName: string): boolean {
  const lowerName = fileName.toLowerCase();
  if (SKIPPED_FILES.has(lowerName)) {
    return false;
  }
  if (RELEVANT_EXTENSIONLESS.has(lowerName)) {
    return true;
  }
  if (lowerName.startsWith(".env.")) {
    return true;
  }
  return RELEVANT_EXTENSIONS.has(path.extname(lowerName));
}

function addLimit(
  limits: Set<ScanLimitKind>,
  limit: ScanLimitKind,
): void {
  limits.add(limit);
}

function looksBinary(buffer: Buffer): boolean {
  const sampleLength = Math.min(buffer.length, 8_192);
  for (let index = 0; index < sampleLength; index += 1) {
    if (buffer[index] === 0) {
      return true;
    }
  }
  return false;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("The scan was cancelled.", "AbortError");
  }
}

function scanPriority(relativePath: string): number {
  const normalized = relativePath.replaceAll("\\", "/").toLowerCase();
  if (
    /(^|\/)(package\.json|pom\.xml|build\.gradle(\.kts)?|settings\.gradle(\.kts)?|cargo\.toml|go\.mod|pyproject\.toml|requirements\.txt)$/.test(
      normalized,
    )
  ) {
    return 0;
  }
  if (
    /(^|\/)(\.github\/workflows|gitlab-ci|jenkinsfile|dockerfile|compose|k8s|kubernetes|terraform|security)/.test(
      normalized,
    )
  ) {
    return 1;
  }
  if (
    /(^|\/)(readme|agents|contributing|security|architecture|adr|docs\/architecture)/.test(
      normalized,
    )
  ) {
    return 2;
  }
  if (/(^|\/)(__tests__|tests?|e2e|specs?)(\/|\.|-)/.test(normalized)) {
    return 3;
  }
  if (/(^|\/)(src|app|apps|packages|services|modules)\//.test(normalized)) {
    return 4;
  }
  return 5;
}

async function walk(
  root: string,
  current: string,
  discovered: string[],
  deadline: number,
  limits: Set<ScanLimitKind>,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  if (Date.now() >= deadline) {
    addLimit(limits, "duration");
    return;
  }

  const entries = (await readdir(current, { withFileTypes: true })).sort(
    (left, right) => left.name.localeCompare(right.name, "en"),
  );
  for (const entry of entries) {
    throwIfAborted(signal);
    if (Date.now() >= deadline) {
      addLimit(limits, "duration");
      return;
    }

    const absolutePath = path.join(current, entry.name);
    const relativePath = path.relative(root, absolutePath);

    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name.toLowerCase())) {
        await walk(
          root,
          absolutePath,
          discovered,
          deadline,
          limits,
          signal,
        );
      }
      continue;
    }

    if (entry.isFile() && isRelevantFile(entry.name)) {
      discovered.push(relativePath);
    }
  }
}

function detectStacks(files: RepositoryFile[]): string[] {
  const paths = new Set(files.map((file) => file.path.toLowerCase()));
  const stacks = new Set<string>();

  if ([...paths].some((filePath) => filePath.endsWith("package.json"))) {
    stacks.add("Node.js / TypeScript");
  }
  if ([...paths].some((filePath) => filePath.endsWith("pom.xml"))) {
    stacks.add("Java / Maven");
  }
  if (
    [...paths].some(
      (filePath) =>
        filePath.endsWith("build.gradle") ||
        filePath.endsWith("build.gradle.kts"),
    )
  ) {
    stacks.add("Java / Gradle");
  }
  if ([...paths].some((filePath) => filePath.endsWith("cargo.toml"))) {
    stacks.add("Rust");
  }
  if ([...paths].some((filePath) => filePath.endsWith("go.mod"))) {
    stacks.add("Go");
  }
  if (
    [...paths].some(
      (filePath) =>
        filePath.endsWith("pyproject.toml") ||
        filePath.endsWith("requirements.txt"),
    )
  ) {
    stacks.add("Python");
  }
  if (stacks.size === 0) {
    stacks.add("Generic repository");
  }

  return [...stacks];
}

export async function scanDirectory(input: {
  root: string;
  repositoryLabel: string;
  sourceUrl: string | null;
  startedAt?: number;
  deadline?: number;
  signal?: AbortSignal;
}): Promise<RepositorySnapshot> {
  const startedAt = input.startedAt ?? Date.now();
  const deadline = input.deadline ?? startedAt + SCAN_LIMITS.durationMs;
  const limits = new Set<ScanLimitKind>();
  const discovered: string[] = [];

  await walk(
    input.root,
    input.root,
    discovered,
    deadline,
    limits,
    input.signal,
  );
  discovered.sort((left, right) => {
    const priorityDifference = scanPriority(left) - scanPriority(right);
    return priorityDifference || left.localeCompare(right, "en");
  });

  const files: RepositoryFile[] = [];
  let processedTextBytes = 0;
  let skippedBinaryFiles = 0;
  let skippedOversizedFiles = 0;

  for (const relativePath of discovered) {
    throwIfAborted(input.signal);
    if (Date.now() >= deadline) {
      addLimit(limits, "duration");
      break;
    }
    if (files.length >= SCAN_LIMITS.relevantFiles) {
      addLimit(limits, "file_count");
      break;
    }

    const absolutePath = path.join(input.root, relativePath);
    const fileStats = await stat(absolutePath);
    if (fileStats.size > SCAN_LIMITS.individualTextFileBytes) {
      skippedOversizedFiles += 1;
      addLimit(limits, "individual_file_bytes");
      continue;
    }
    if (processedTextBytes + fileStats.size > SCAN_LIMITS.textBytes) {
      addLimit(limits, "text_bytes");
      continue;
    }

    const buffer = await readFile(absolutePath);
    if (looksBinary(buffer)) {
      skippedBinaryFiles += 1;
      continue;
    }

    processedTextBytes += buffer.byteLength;
    files.push({
      path: relativePath.split(path.sep).join("/"),
      content: buffer.toString("utf8"),
      size: buffer.byteLength,
    });
  }

  const durationMs = Date.now() - startedAt;
  const unprocessedRelevantFiles = Math.max(
    0,
    discovered.length -
      files.length -
      skippedBinaryFiles -
      skippedOversizedFiles,
  );
  const partial = limits.size > 0 || unprocessedRelevantFiles > 0;

  return {
    repositoryLabel: input.repositoryLabel,
    sourceUrl: input.sourceUrl,
    files,
    detectedStacks: detectStacks(files),
    history: unavailableHistory(
      "Git history was not supplied for this repository snapshot.",
    ),
    coverage: {
      discoveredRelevantFiles: discovered.length,
      processedRelevantFiles: files.length,
      skippedBinaryFiles,
      skippedOversizedFiles,
      unprocessedRelevantFiles,
      processedTextBytes,
      durationMs,
      partial,
      limitsCrossed: [...limits],
    },
  };
}
