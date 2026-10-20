import { describe, expect, it } from "vitest";

import { buildAllowlistedPayload } from "@/lib/ai/synthesis";
import { selectDeterministicActions } from "@/lib/analysis/actions";
import { evaluateControls } from "@/lib/analysis/controls";
import { scoreAnalysis } from "@/lib/analysis/scoring";
import type { ScanContext } from "@/lib/analysis/types";
import type { RepositorySnapshot } from "@/lib/repository/types";

/**
 * The browser-to-BaaS data boundary controls must not widen what reaches the
 * model. This asserts the categorical boundary on a synthetic repository whose
 * browser code makes direct data calls and logs a session value.
 */
const CONTEXT: ScanContext = {
  stage: "live_early",
  dataSensitivity: "basic_personal",
  growthTarget: "users_10x",
};

const FILES = [
  {
    path: "package.json",
    content:
      '{"name":"notes-app","dependencies":{"react":"19.0.0","@supabase/supabase-js":"2.45.0"},"devDependencies":{"vite":"6.0.0"}}',
  },
  { path: "vite.config.ts", content: "export default { build: {} };" },
  {
    path: "index.html",
    content:
      '<!doctype html><html><body><script type="module" src="/src/main.tsx"></script></body></html>',
  },
  {
    path: "src/main.tsx",
    content: 'import App from "./App"; export const mount = () => App();',
  },
  {
    path: "src/App.tsx",
    content: 'import Notes from "./pages/Notes"; export default function App() { return Notes(); }',
  },
  {
    path: "src/lib/supabase.ts",
    content:
      'import { createClient } from "@supabase/supabase-js";\nexport const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);',
  },
  {
    path: "src/pages/Notes.tsx",
    content: [
      'import { supabase } from "../lib/supabase";',
      "export default function Notes() { return null; }",
      "export async function loadNotes(user) {",
      '  const { data } = await supabase.from("notes").select("*").eq("user_id", user.id);',
      '  console.log("session restored", data.session);',
      "  return data;",
      "}",
      "export async function saveNote(user, body) {",
      '  return supabase.from("notes").insert({ user_id: user.id, body });',
      "}",
    ].join("\n"),
  },
];

function snapshot(): RepositorySnapshot {
  return {
    repositoryLabel: "synthetic/browser-baas-payload",
    sourceUrl: null,
    files: FILES.map((file) => ({ ...file, size: file.content.length })),
    coverage: {
      discoveredRelevantFiles: FILES.length,
      processedRelevantFiles: FILES.length,
      skippedBinaryFiles: 0,
      skippedOversizedFiles: 0,
      unprocessedRelevantFiles: 0,
      processedTextBytes: FILES.reduce(
        (total, file) => total + file.content.length,
        0,
      ),
      durationMs: 1,
      partial: false,
      limitsCrossed: [],
    },
    detectedStacks: ["Node.js / TypeScript"],
    history: {
      source: "synthetic",
      availability: "available",
      repository: {
        scope: "Repository",
        sampledCommits: 24,
        attributedCommits: 24,
        activeContributors: 3,
        estimatedBusFactor: 2,
        topContributorShare: 45,
        sampleWindowDays: 90,
        band: "Moderate concentration",
      },
      modules: [],
      note: "Synthetic anonymous aggregate.",
    },
  };
}

describe("browser data-boundary model payload", () => {
  it("sends categorical findings only, with no source text or repository paths", () => {
    const repository = snapshot();
    const checks = evaluateControls(repository, CONTEXT);
    const score = scoreAnalysis(checks, repository);
    const built = buildAllowlistedPayload({
      verdict: score.verdict,
      score: score.score,
      confidence: score.confidence,
      domains: score.domains,
      growth: score.growth,
      context: CONTEXT,
      checks,
      fallbackActions: selectDeterministicActions(checks, CONTEXT.growthTarget),
    });
    const serialized = JSON.stringify(built.payload);

    expect(
      checks.find((check) => check.id === "security.client-data-boundary"),
    ).toMatchObject({ outcome: "unknown", evidenceTier: "absent" });
    expect(
      checks.find((check) => check.id === "security.browser-data-logging"),
    ).toMatchObject({ outcome: "fail" });

    for (const file of FILES) {
      expect(serialized, file.path).not.toContain(file.path);
    }
    for (const check of checks) {
      expect(serialized, check.id).not.toContain(check.summary);
      expect(serialized, check.id).not.toContain(check.title);
    }
    expect(serialized).not.toMatch(
      /supabase|console\.log|user_id|notes-app|synthetic\//,
    );
    expect(built.estimatedTokens).toBeLessThanOrEqual(12_000);
  });
});
