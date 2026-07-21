import {
  synthesizeFounderActions,
  type SynthesisInput,
  type SynthesisRetryHandler,
  type SynthesisResult,
} from "@/lib/ai/synthesis";
import { analyzeSnapshot } from "@/lib/analysis/analyze";
import { selectDeterministicActions } from "@/lib/analysis/actions";
import { HEURISTIC_VERSION } from "@/lib/analysis/constants";
import type { ExternalServiceDiagnostics } from "@/lib/diagnostics/external-service";
import type { ScanContext } from "@/lib/analysis/types";
import type { RepositorySnapshot } from "@/lib/repository/types";
import {
  parseAnalysisReport,
  REPORT_SCHEMA_VERSION,
  type AnalysisReport,
} from "@/lib/report/contract";

export interface AnalyzeRepositoryOptions {
  synthesize?: (
    input: SynthesisInput,
    onRetry?: SynthesisRetryHandler,
  ) => Promise<SynthesisResult>;
  onSynthesisRetry?: SynthesisRetryHandler;
  signal?: AbortSignal;
  diagnostics?: ExternalServiceDiagnostics;
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw (
      signal.reason ??
      new DOMException("The repository scan was cancelled.", "AbortError")
    );
  }
}

export async function analyzeRepository(
  snapshot: RepositorySnapshot,
  context: ScanContext,
  options: AnalyzeRepositoryOptions = {},
): Promise<AnalysisReport> {
  throwIfCancelled(options.signal);
  const draft = analyzeSnapshot(snapshot, context);
  const reportSource = {
    repositoryLabel: snapshot.repositoryLabel,
    sourceUrl: snapshot.sourceUrl,
    coverage: snapshot.coverage,
    detectedStacks: snapshot.detectedStacks,
    busFactor: snapshot.history,
  };

  // The deterministic phase is the last consumer of repository source. Clear
  // it before awaiting the optional model phase so raw content is no longer
  // reachable through the object graph used by orchestration.
  snapshot.files.length = 0;
  throwIfCancelled(options.signal);

  const fallbackActions = selectDeterministicActions(
    draft.checks,
    context.growthTarget,
  );
  const synthesisInput = {
    verdict: draft.verdict,
    score: draft.score,
    confidence: draft.confidence,
    domains: draft.domains,
    growth: draft.growth,
    context,
    checks: draft.checks,
    fallbackActions,
    signal: options.signal,
  };
  const synthesis = options.synthesize
    ? await options.synthesize(synthesisInput, options.onSynthesisRetry)
    : await synthesizeFounderActions(synthesisInput, {
        onRetry: options.onSynthesisRetry,
        diagnostics: options.diagnostics,
      });

  return parseAnalysisReport({
    schemaVersion: REPORT_SCHEMA_VERSION,
    heuristicVersion: HEURISTIC_VERSION,
    ...reportSource,
    generatedAt: new Date().toISOString(),
    verdict: draft.verdict,
    score: draft.score,
    confidence: draft.confidence,
    disclaimer: "Automated snapshot, not an audit",
    verdictReason: draft.verdictReason,
    context,
    domains: draft.domains,
    growth: draft.growth,
    actions: synthesis.actions,
    checks: draft.checks,
    ai: synthesis.meta,
  });
}
