import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  EXPOSED_PROVIDER_FILES,
  HARDENED_PROVIDER_FILES,
  P0_9_CONTEXT,
  UNRESOLVED_IMPORT_FILES,
} from "@/lib/analysis/p0-9-fixtures";
import { scanDirectory } from "@/lib/repository/scanner";
import { renderMarkdownReport } from "@/lib/report/markdown";

import { analyzeRepository } from "./analyze-repository";

/**
 * P0.9 - the complete seam, from repository acquisition to the founder document.
 *
 * The fixture files are written to a temporary directory and scanned by the real
 * scanner, so stack detection, file discovery, deterministic analysis, action
 * selection, and Markdown rendering are all exercised together. No network call
 * and no real repository are involved: synthesis is stubbed with the
 * deterministic fallback.
 */

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function scanFixture(files: Array<{ path: string; content: string }>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "scaleproof-p0-9-"));
  temporaryDirectories.push(root);
  for (const file of files) {
    const target = path.join(root, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content);
  }
  return scanDirectory({ root, repositoryLabel: "synthetic/p0-9", sourceUrl: null });
}

async function reportFor(files: Array<{ path: string; content: string }>) {
  const snapshot = await scanFixture(files);
  const detectedStacks = [...snapshot.detectedStacks];
  const report = await analyzeRepository(snapshot, P0_9_CONTEXT, {
    synthesize: async (input) => ({
      actions: input.fallbackActions,
      meta: {
        source: "deterministic" as const,
        model: null,
        findingsIncluded: input.fallbackActions.length,
        totalFindings: input.checks.length,
        inputTokens: null,
        outputTokens: null,
        limited: false,
        note: "Synthetic deterministic synthesis for a privacy test.",
      },
    }),
  });
  return { detectedStacks, report, markdown: renderMarkdownReport(report) };
}

describe("P0.9 stack detection through the real scanner", () => {
  it("names the browser framework, bundler, edge platform, runtime, and provider SDK", async () => {
    const { detectedStacks } = await reportFor(EXPOSED_PROVIDER_FILES);

    expect(detectedStacks).toEqual(
      expect.arrayContaining([
        "Node.js / TypeScript",
        "React",
        "Vite",
        "Supabase Edge Functions",
        "Deno",
        "External provider SDK",
      ]),
    );
    expect(detectedStacks).not.toContain("Generic repository");
  });

  it("does not claim an edge platform or provider SDK for a plain module", async () => {
    const { detectedStacks } = await reportFor([
      { path: "package.json", content: '{"name":"plain","dependencies":{"express":"4.21.0"}}' },
      { path: "src/server.ts", content: "export const app = true;" },
    ]);

    expect(detectedStacks).toContain("Node.js / TypeScript");
    expect(detectedStacks).not.toContain("Supabase Edge Functions");
    expect(detectedStacks).not.toContain("Deno");
    expect(detectedStacks).not.toContain("External provider SDK");
    expect(detectedStacks).not.toContain("React");
  });
});

describe("P0.9 founder report for an exposed provider boundary", () => {
  it("puts the mandatory boundary action first and keeps evidence to safe paths", async () => {
    const { report, markdown } = await reportFor(EXPOSED_PROVIDER_FILES);

    expect(report.actions[0]?.remediationCode).toBe("harden-auth-boundary");
    expect(markdown).toContain("supabase/functions/voice-note/index.ts");
    expect(markdown).toContain("supabase/config.toml");
  });

  it("renders no source text, credential name, provider endpoint, or import path", async () => {
    const { report, markdown } = await reportFor(EXPOSED_PROVIDER_FILES);
    const serialized = JSON.stringify(report);

    for (const document of [markdown, serialized]) {
      expect(document).not.toContain("VOICE_API_KEY");
      expect(document).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(document).not.toContain("Access-Control-Allow-Origin");
      expect(document).not.toContain("npm:@voicelab/speech-sdk");
      expect(document).not.toContain("verify_jwt");
      expect(document).not.toContain("getPublicUrl");
      expect(document).not.toContain("console.log");
      expect(document).not.toContain("Deno.serve");
    }
  });

  it("makes no unsupported claim about deployed policy, storage, billing, or throughput", async () => {
    const { markdown } = await reportFor(EXPOSED_PROVIDER_FILES);

    expect(markdown).not.toMatch(/row-level security is (?:disabled|absent|missing)/i);
    expect(markdown).not.toMatch(/no rate limit is (?:deployed|configured on)/i);
    expect(markdown).not.toMatch(/billing is (?:unlimited|uncapped)/i);
    expect(markdown).not.toMatch(/measured (?:throughput|capacity)/i);
    // The missing-evidence wording is present instead.
    expect(markdown.toLowerCase()).toContain("outside repository evidence");
  });

  it("never renders an unresolved local import path", async () => {
    const { report, markdown } = await reportFor(UNRESOLVED_IMPORT_FILES);

    expect(markdown).not.toContain("waveform-preview");
    expect(JSON.stringify(report)).not.toContain("waveform-preview");
  });

  it("drops the mandatory boundary action once the boundary is closed", async () => {
    const { report } = await reportFor(HARDENED_PROVIDER_FILES);

    expect(report.actions.map((action) => action.remediationCode)).not.toContain(
      "harden-auth-boundary",
    );
    expect(report.actions.length).toBeLessThanOrEqual(3);
  });
});
