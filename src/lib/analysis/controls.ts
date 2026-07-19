import { createRepositoryIndex } from "./signals";
import type { CheckResult, ScanContext } from "./types";
import { architectureControls } from "./controls/architecture";
import { agentReadinessControls } from "./controls/agent-readiness";
import { operationsControls } from "./controls/operations";
import { qualityControls } from "./controls/quality";
import { reliabilityControls } from "./controls/reliability";
import { resilienceControls } from "./controls/resilience";
import { securityControls } from "./controls/security";

export function evaluateControls(
  snapshot: Parameters<typeof createRepositoryIndex>[0],
  context: ScanContext,
): CheckResult[] {
  const index = createRepositoryIndex(snapshot);
  const evaluators = [
    ...architectureControls(),
    ...qualityControls(),
    ...securityControls(),
    ...operationsControls(),
    ...reliabilityControls(),
    ...resilienceControls(),
    ...agentReadinessControls(),
  ];

  return evaluators.map((evaluate) => evaluate(index, context));
}
