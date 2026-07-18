import { synthesizeFounderActions } from "@/lib/ai/synthesis";

import { selectDeterministicActions } from "./actions";
import { HEURISTIC_VERSION } from "./constants";
import { evaluateControls } from "./controls";
import { scoreAnalysis } from "./scoring";
import type {
  AnalysisReport,
  RepositorySnapshot,
  ScanContext,
} from "./types";

export async function analyzeSnapshot(
  snapshot: RepositorySnapshot,
  context: ScanContext,
): Promise<AnalysisReport> {
  const checks = evaluateControls(snapshot, context);
  const score = scoreAnalysis(checks, snapshot);
  const fallbackActions = selectDeterministicActions(checks);
  const synthesis = await synthesizeFounderActions({
    verdict: score.verdict,
    score: score.score,
    confidence: score.confidence,
    domains: score.domains,
    growth: score.growth,
    context,
    checks,
    fallbackActions,
  });

  return {
    heuristicVersion: HEURISTIC_VERSION,
    repositoryLabel: snapshot.repositoryLabel,
    sourceUrl: snapshot.sourceUrl,
    generatedAt: new Date().toISOString(),
    verdict: score.verdict,
    score: score.score,
    confidence: score.confidence,
    disclaimer: "Automated snapshot, not an audit",
    verdictReason: score.verdictReason,
    context,
    coverage: snapshot.coverage,
    detectedStacks: snapshot.detectedStacks,
    domains: score.domains,
    growth: score.growth,
    busFactor: snapshot.history,
    actions: synthesis.actions,
    checks,
    ai: synthesis.meta,
  };
}
