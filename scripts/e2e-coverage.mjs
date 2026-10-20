#!/usr/bin/env node
/**
 * E2E line-coverage gate for `src/`.
 *
 * Purpose
 *   Run the Playwright suite once while collecting BOTH browser-side V8
 *   coverage (Chrome DevTools Protocol, via the e2e coverage fixture) and
 *   Next.js server-side V8 coverage (NODE_V8_COVERAGE on the web server),
 *   merge them through their source maps, and print exactly one summary line:
 *
 *       E2E line coverage of src/: NN.N%
 *
 *   Vitest coverage never contributes to this number: this script only runs
 *   Playwright.
 *
 * Prerequisites
 *   Node.js 22.11+, an installed Playwright browser, and the dev dependency
 *   `monocart-coverage-reports`. No API key and no network access are needed;
 *   `OPENAI_API_KEY` is blanked by playwright.coverage.config.ts.
 *
 * Usage
 *   npm run test:e2e:coverage
 *   npm run test:e2e:coverage -- --threshold 70
 *   npm run test:e2e:coverage -- --debug
 *
 * Exit codes
 *   0  coverage >= threshold (default 60.0)
 *   1  coverage below threshold, or the Playwright run failed
 */

import { spawnSync } from "node:child_process";
import { readdir, readFile, rm, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import { decode, encode } from "@jridgewell/sourcemap-codec";
import { transformSync } from "esbuild";
import MCR from "monocart-coverage-reports";

const ROOT = process.cwd();
const DEFAULT_THRESHOLD = 60;

const { values } = parseArgs({
  options: {
    threshold: { type: "string" },
    debug: { type: "boolean", default: false },
    "skip-run": { type: "boolean", default: false },
  },
  allowPositionals: false,
});

const threshold = Number(values.threshold ?? DEFAULT_THRESHOLD);
if (!Number.isFinite(threshold)) {
  console.error("[e2e-coverage] --threshold must be a number");
  process.exit(1);
}

const debug = values.debug === true;
const log = (message) => console.error(`[e2e-coverage] ${message}`);
const debugLog = (message) => {
  if (debug) {
    log(message);
  }
};

const coverageDir = path.join(ROOT, ".coverage");
const serverDir = path.join(coverageDir, "server");
const browserDir = path.join(coverageDir, "browser");
const reportDir = path.join(coverageDir, "report");

log("=== E2E coverage run started ===");

if (!values["skip-run"]) {
  await rm(coverageDir, { recursive: true, force: true });
}
await mkdir(serverDir, { recursive: true });
await mkdir(browserDir, { recursive: true });

if (!values["skip-run"]) {
  log("running Playwright with browser + server V8 coverage");
  const run = spawnSync(
    process.execPath,
    [
      path.join(ROOT, "node_modules", "@playwright", "test", "cli.js"),
      "test",
      "--config",
      "playwright.coverage.config.ts",
    ],
    {
      cwd: ROOT,
      stdio: "inherit",
      env: {
        ...process.env,
        E2E_COVERAGE: "1",
        E2E_COVERAGE_DIR: coverageDir,
        E2E_COVERAGE_BROWSER_DIR: browserDir,
      },
    },
  );
  if (run.status !== 0) {
    log(`Playwright run failed with status ${run.status}`);
    log("=== E2E coverage run finished (failed) ===");
    process.exit(1);
  }
}

/**
 * Flatten an indexed ("sections") source map into a plain one.
 *
 * Turbopack emits indexed maps for its dev chunks; monocart-coverage-reports
 * only decodes plain `mappings`, so it must be given a flattened map.
 * Returns the input unchanged when it is already a plain map.
 */
function flattenSourceMap(map) {
  if (!map || !Array.isArray(map.sections)) {
    return map;
  }

  const sources = [];
  const sourcesContent = [];
  const names = [];
  const sourceIndex = new Map();
  const nameIndex = new Map();
  /** @type {Array<Array<number[]>>} */
  const lines = [];

  const addSource = (source, content) => {
    const key = String(source);
    if (!sourceIndex.has(key)) {
      sourceIndex.set(key, sources.length);
      sources.push(key);
      sourcesContent.push(content ?? null);
    }
    return sourceIndex.get(key);
  };
  const addName = (name) => {
    if (!nameIndex.has(name)) {
      nameIndex.set(name, names.length);
      names.push(name);
    }
    return nameIndex.get(name);
  };

  for (const section of map.sections) {
    const inner = section?.map;
    if (!inner || typeof inner.mappings !== "string") {
      continue;
    }
    const lineOffset = section.offset?.line ?? 0;
    const columnOffset = section.offset?.column ?? 0;
    const innerSources = (inner.sources ?? []).map((source, index) =>
      addSource(
        inner.sourceRoot ? `${inner.sourceRoot}${source}` : source,
        inner.sourcesContent?.[index],
      ),
    );
    const innerNames = (inner.names ?? []).map((name) => addName(name));

    const decoded = decode(inner.mappings);
    decoded.forEach((segments, innerLine) => {
      const line = lineOffset + innerLine;
      while (lines.length <= line) {
        lines.push([]);
      }
      for (const segment of segments) {
        const generatedColumn =
          innerLine === 0 ? segment[0] + columnOffset : segment[0];
        if (segment.length === 1) {
          lines[line].push([generatedColumn]);
          continue;
        }
        const mapped = [
          generatedColumn,
          innerSources[segment[1]] ?? 0,
          segment[2],
          segment[3],
        ];
        if (segment.length > 4) {
          mapped.push(innerNames[segment[4]] ?? 0);
        }
        lines[line].push(mapped);
      }
    });
  }

  for (const segments of lines) {
    segments.sort((a, b) => a[0] - b[0]);
  }

  return {
    version: 3,
    file: map.file,
    sources,
    sourcesContent,
    names,
    mappings: encode(lines),
  };
}

/** Read and flatten the source map referenced by a generated file, if any. */
async function readSourceMapFor(filePath, source) {
  const match = /\/\/# sourceMappingURL=(\S+)\s*$/m.exec(source);
  if (!match) {
    return undefined;
  }
  const reference = match[1];
  try {
    if (reference.startsWith("data:")) {
      const base64 = reference.slice(reference.indexOf(",") + 1);
      return flattenSourceMap(JSON.parse(Buffer.from(base64, "base64").toString("utf8")));
    }
    const mapPath = path.resolve(path.dirname(filePath), decodeURIComponent(reference));
    return flattenSourceMap(JSON.parse(await readFile(mapPath, "utf8")));
  } catch (error) {
    debugLog(`source map unavailable for ${filePath}: ${error.message}`);
    return undefined;
  }
}

/**
 * Normalize a source path from either collector into a repository-relative
 * path, so browser and server entries for the same module merge.
 */
function normalizeSourcePath(sourcePath) {
  let value = String(sourcePath);
  if (value.startsWith("file://")) {
    try {
      value = fileURLToPath(value);
    } catch {
      /* keep the raw value */
    }
  }
  value = value.replace(/^\[project\]\//, "");
  value = value.replace(/^webpack:\/\/(_N_E)?\//, "");
  value = value.replace(/\?.*$/, "");
  if (path.isAbsolute(value)) {
    value = path.relative(ROOT, value);
  }
  value = value.replace(/^(\.\.\/)+/, "");
  return value.split(path.sep).join("/");
}

/**
 * Only first-party `src/` TypeScript modules count toward the gate.
 *
 * Excluded: Vitest specs, ambient declarations, CSS modules (Next.js reports
 * one entry per rendering environment, which would double count style rules
 * as executable lines), and Next.js-generated proxy shims.
 */
function isCountedSource(sourcePath) {
  const normalized = normalizeSourcePath(sourcePath);
  if (!normalized.startsWith("src/")) {
    return false;
  }
  if (normalized.includes("node_modules")) {
    return false;
  }
  if (normalized.includes("__nextjs-internal")) {
    return false;
  }
  if (/\.test\.tsx?$/.test(normalized)) {
    return false;
  }
  if (/\.d\.ts$/.test(normalized)) {
    return false;
  }
  return /\.tsx?$/.test(normalized);
}

const coverageReport = MCR({
  name: "Scaleproof E2E coverage",
  outputDir: reportDir,
  reports: [["v8"], ["json", { file: "coverage-final.json" }]],
  logging: debug ? "debug" : "error",
  cleanCache: true,
  sourcePath: (sourcePath) => normalizeSourcePath(sourcePath),
  sourceFilter: (sourcePath) => isCountedSource(sourcePath),
  // Keep the denominator honest: every countable src/ module appears, even
  // one the browser and server never loaded, so it lands at 0% instead of
  // silently disappearing from the ratio.
  all: {
    dir: ["src"],
    filter: (filePath) => isCountedSource(filePath),
    // monocart hands the untested file straight to its JS AST parser, so the
    // TypeScript has to be transpiled first. The transformer mutates `entry`.
    transformer: (entry) => {
      const sourcePath = entry.sourcePath ?? entry.url ?? "";
      const output = transformSync(entry.source, {
        loader: sourcePath.endsWith(".tsx") ? "tsx" : "ts",
        sourcemap: true,
        sourcefile: sourcePath,
        format: "esm",
        target: "es2022",
      });
      entry.source = output.code;
      entry.sourceMap = JSON.parse(output.map);
    },
  },
});

await coverageReport.cleanCache();

// --- server-side profiles -------------------------------------------------
let serverFiles = [];
if (existsSync(serverDir)) {
  serverFiles = (await readdir(serverDir)).filter((name) => name.endsWith(".json"));
}
log(`server V8 profiles: ${serverFiles.length}`);
for (const name of serverFiles) {
  const raw = JSON.parse(await readFile(path.join(serverDir, name), "utf8"));
  const candidates = (raw.result ?? []).filter((entry) => {
    const url = entry.url ?? "";
    return url.startsWith("file://") && !url.includes("/node_modules/");
  });
  const list = [];
  for (const entry of candidates) {
    const filePath = fileURLToPath(entry.url);
    let source;
    try {
      source = await readFile(filePath, "utf8");
    } catch {
      continue;
    }
    const sourceMap = await readSourceMapFor(filePath, source);
    if (!sourceMap) {
      continue;
    }
    if (!sourceMap.sources.some((sourcePath) => isCountedSource(sourcePath))) {
      continue;
    }
    list.push({ ...entry, source, sourceMap });
  }
  debugLog(`${name}: ${list.length} in-scope entries of ${candidates.length}`);
  if (list.length > 0) {
    await coverageReport.add(list);
  }
}

// --- browser-side profiles ------------------------------------------------
let browserFiles = [];
if (existsSync(browserDir)) {
  browserFiles = (await readdir(browserDir)).filter((name) => name.endsWith(".json"));
}
log(`browser V8 profiles: ${browserFiles.length}`);
for (const name of browserFiles) {
  const stored = JSON.parse(await readFile(path.join(browserDir, name), "utf8"));
  const list = [];
  for (const entry of stored) {
    const sourceMap = flattenSourceMap(entry.sourceMap);
    if (!sourceMap || !Array.isArray(sourceMap.sources)) {
      continue;
    }
    if (!sourceMap.sources.some((sourcePath) => isCountedSource(sourcePath))) {
      continue;
    }
    list.push({ ...entry, sourceMap });
  }
  debugLog(`${name}: ${list.length} in-scope entries of ${stored.length}`);
  if (list.length > 0) {
    await coverageReport.add(list);
  }
}

const results = await coverageReport.generate();
const summary = results?.summary ?? {};
const lines = summary.lines ?? {};
let covered = Number(lines.covered ?? 0);
let total = Number(lines.total ?? 0);

/**
 * Conservative denominator correction.
 *
 * The source-map mapper can under-measure a module (observed on
 * `src/lib/analysis/controls/security.ts`, where only 86 of 668 code lines are
 * attributed). Silently dropping those lines would inflate the gate, so any
 * shortfall against the file's real code-line count is added back as
 * *uncovered*. The correction can only ever lower the reported number.
 */
function countCodeLines(source) {
  let inBlockComment = false;
  let count = 0;
  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    if (inBlockComment) {
      if (line.includes("*/")) {
        inBlockComment = false;
      }
      continue;
    }
    if (line === "" || line.startsWith("//")) {
      continue;
    }
    if (line.startsWith("/*")) {
      if (!line.includes("*/")) {
        inBlockComment = true;
      }
      continue;
    }
    count += 1;
  }
  return count;
}

const measured = new Map();
for (const file of results?.files ?? []) {
  const sourcePath = normalizeSourcePath(file.sourcePath ?? "");
  if (!isCountedSource(sourcePath)) {
    continue;
  }
  const fileLines = Number(file.summary?.lines?.total ?? 0);
  measured.set(sourcePath, Math.max(measured.get(sourcePath) ?? 0, fileLines));
}

let shortfall = 0;
for (const [sourcePath, reported] of measured) {
  let source;
  try {
    source = await readFile(path.join(ROOT, sourcePath), "utf8");
  } catch {
    continue;
  }
  const actual = countCodeLines(source);
  if (reported >= actual * 0.6) {
    continue;
  }
  const missing = actual - reported;
  shortfall += missing;
  log(
    `under-measured ${sourcePath}: ${reported} of ${actual} code lines mapped; ` +
      `counting ${missing} unmapped lines as uncovered`,
  );
}

if (shortfall > 0) {
  total += shortfall;
}

if (!total) {
  log("no src/ lines were instrumented — refusing to report a coverage number");
  log("=== E2E coverage run finished (failed) ===");
  process.exit(1);
}

const pct = (covered / total) * 100;
const rounded = Math.round(pct * 10) / 10;

if (debug) {
  const files = (results?.files ?? [])
    .map((file) => ({
      path: file.sourcePath,
      type: file.type,
      distFile: file.distFile ?? "",
      lines: file.summary?.lines?.total ?? 0,
      pct: file.summary?.lines?.pct ?? 0,
    }))
    .sort((a, b) => a.pct - b.pct);
  for (const file of files) {
    debugLog(
      `${String(file.pct).padStart(6)}%  ${String(file.lines).padStart(5)}L  ` +
        `[${file.type}] ${file.path}`,
    );
  }
  debugLog(`sum of listed line totals: ${files.reduce((n, f) => n + f.lines, 0)}`);
}

log(`covered ${covered} of ${total} src/ lines from Playwright execution only`);
console.log(`E2E line coverage of src/: ${rounded.toFixed(1)}%`);

if (rounded + 1e-9 < threshold) {
  log(`below the ${threshold.toFixed(1)}% gate`);
  log("=== E2E coverage run finished (failed) ===");
  process.exit(1);
}

log("=== E2E coverage run finished (passed) ===");
process.exit(0);
