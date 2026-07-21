import { evaluateControls } from "./controls";
import { reconcileControlOutcomes } from "./control-inventory";
import { scoreAnalysis } from "./scoring";
import type { RepositorySnapshot } from "@/lib/repository/types";
import type { AnalysisDraft, ScanContext } from "./types";

export function analyzeSnapshot(
  snapshot: RepositorySnapshot,
  context: ScanContext,
): AnalysisDraft {
  const checks = evaluateControls(snapshot, context);
  reconcileControlOutcomes(checks);
  const score = scoreAnalysis(checks, snapshot);

  return {
    context,
    checks,
    ...score,
  };
}
