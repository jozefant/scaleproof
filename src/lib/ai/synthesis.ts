import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import {
  HEURISTIC_VERSION,
  MODEL_LIMITS,
  SEVERITY_RANK,
} from "@/lib/analysis/constants";
import type {
  CheckResult,
  DomainScore,
  GrowthAssessment,
  ScanContext,
  Severity,
  Verdict,
} from "@/lib/analysis/types";
import type {
  AiSynthesisMeta,
  FounderAction,
} from "@/lib/report/contract";
import {
  mandatoryRemediationCodes,
  reconcileActionProposal,
} from "@/lib/analysis/actions";

const ActionSchema = z.object({
  remediationCode: z.string().min(1).max(80),
});

const FounderActionsSchema = z.object({
  actions: z.array(ActionSchema).min(1).max(3),
});

export interface SynthesisInput {
  verdict: Verdict;
  score: number;
  confidence: number;
  domains: DomainScore[];
  growth: GrowthAssessment;
  context: ScanContext;
  checks: CheckResult[];
  fallbackActions: FounderAction[];
  signal?: AbortSignal;
}

export interface SynthesisResult {
  actions: FounderAction[];
  meta: AiSynthesisMeta;
}

interface AllowlistedFinding {
  controlId: string;
  outcome: CheckResult["outcome"];
  evidenceTier: CheckResult["evidenceTier"];
  severity: Severity;
  weight: number;
  remediationCode: string;
}

interface ModelPayload {
  heuristicVersion: string;
  verdict: Verdict;
  score: number;
  confidence: number;
  context: ScanContext;
  domains: Array<{ id: string; score: number }>;
  growth: GrowthAssessment;
  findings: AllowlistedFinding[];
  passCounts: Record<string, number>;
}

const SYSTEM_INSTRUCTIONS = `
You write the final three action priorities for a busy startup founder.
Use only the allowlisted categorical JSON. You have no repository text.
Do not change the deterministic verdict or score. Do not invent evidence,
technologies, file names, people, legal compliance, or throughput guarantees.
Select at most three different remediation codes. Put critical and high risks
first, then choose the actions with the most leverage for 10x/100x user growth
or parallel engineering work. Return remediation codes only; displayed titles,
rationales, severity, sources, and verification remain deterministic.
The report is an automated snapshot, not an audit.
`.trim();

type ModelProposal = z.infer<typeof FounderActionsSchema>;

interface ModelProposalResponse {
  parsed: ModelProposal | null;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface SynthesisDependencies {
  requestProposal?: (
    payload: ModelPayload,
    signal?: AbortSignal,
  ) => Promise<ModelProposalResponse>;
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw (
      signal.reason ??
      new DOMException("The repository scan was cancelled.", "AbortError")
    );
  }
}

function estimateTokens(text: string): number {
  // The payload is ASCII-heavy JSON. Dividing by three is intentionally more
  // conservative than the common four-characters-per-token approximation.
  return Math.ceil(text.length / 3);
}

function isActionable(check: CheckResult): boolean {
  return (
    check.outcome === "fail" ||
    (check.outcome === "unknown" && check.evidenceTier === "absent")
  );
}

function findingPriority(check: CheckResult): number {
  const failureBoost = check.outcome === "fail" ? 3 : 1;
  return SEVERITY_RANK[check.severity] * check.weight * failureBoost;
}

export function buildAllowlistedPayload(input: SynthesisInput): {
  payload: ModelPayload;
  included: number;
  total: number;
  limited: boolean;
  estimatedTokens: number;
} {
  const actionable = input.checks
    .filter(isActionable)
    .sort((left, right) => findingPriority(right) - findingPriority(left));
  const passCounts = input.checks
    .filter((check) => check.outcome === "pass")
    .reduce<Record<string, number>>((counts, check) => {
      counts[check.domain] = (counts[check.domain] ?? 0) + 1;
      return counts;
    }, {});

  const base: ModelPayload = {
    heuristicVersion: HEURISTIC_VERSION,
    verdict: input.verdict,
    score: input.score,
    confidence: input.confidence,
    context: input.context,
    domains: input.domains.map((domain) => ({
      id: domain.id,
      score: domain.score,
    })),
    growth: input.growth,
    findings: [],
    passCounts,
  };

  const inputBudget =
    MODEL_LIMITS.targetInputTokens -
    MODEL_LIMITS.reservedInstructionTokens;

  for (const check of actionable) {
    const candidate: AllowlistedFinding = {
      controlId: check.id,
      outcome: check.outcome,
      evidenceTier: check.evidenceTier,
      severity: check.severity,
      weight: check.weight,
      remediationCode: check.remediationCode,
    };
    const candidatePayload = {
      ...base,
      findings: [...base.findings, candidate],
    };
    const candidateTokens = estimateTokens(
      SYSTEM_INSTRUCTIONS + JSON.stringify(candidatePayload),
    );
    if (candidateTokens > inputBudget) {
      break;
    }
    base.findings.push(candidate);
  }

  const estimatedTokens = estimateTokens(
    SYSTEM_INSTRUCTIONS + JSON.stringify(base),
  );
  if (estimatedTokens > MODEL_LIMITS.hardInputTokens) {
    throw new Error("Allowlisted synthesis payload exceeds the hard token cap.");
  }

  return {
    payload: base,
    included: base.findings.length,
    total: actionable.length,
    limited: base.findings.length < actionable.length,
    estimatedTokens,
  };
}

function fallbackResult(
  input: SynthesisInput,
  included: number,
  total: number,
  limited: boolean,
  note: string,
): SynthesisResult {
  return {
    actions: input.fallbackActions,
    meta: {
      source: "deterministic",
      model: null,
      findingsIncluded: included,
      totalFindings: total,
      inputTokens: null,
      outputTokens: null,
      limited,
      note,
    },
  };
}

export async function synthesizeFounderActions(
  input: SynthesisInput,
  dependencies: SynthesisDependencies = {},
): Promise<SynthesisResult> {
  throwIfCancelled(input.signal);
  const built = buildAllowlistedPayload(input);
  if (!process.env.OPENAI_API_KEY || built.total === 0) {
    return fallbackResult(
      input,
      built.included,
      built.total,
      built.limited,
      process.env.OPENAI_API_KEY
        ? "No actionable findings required model synthesis."
        : "OPENAI_API_KEY is not configured; deterministic priorities were used.",
    );
  }

  try {
    throwIfCancelled(input.signal);
    const response = await (
      dependencies.requestProposal ?? requestOpenAiProposal
    )(built.payload, input.signal);
    throwIfCancelled(input.signal);
    const parsed = response.parsed;
    if (!parsed) {
      return fallbackResult(
        input,
        built.included,
        built.total,
        built.limited,
        "GPT-5.6 did not return a usable structured result; deterministic priorities were used.",
      );
    }

    const actions = reconcileActionProposal(
      input.fallbackActions,
      parsed.actions,
      mandatoryRemediationCodes(input.checks),
    );
    if (!actions) {
      return fallbackResult(
        input,
        built.included,
        built.total,
        built.limited,
        "GPT-5.6 omitted mandatory work, duplicated actions, or returned an unsupported remediation; deterministic priorities were used.",
      );
    }

    return {
      actions,
      meta: {
        source: "gpt-5.6",
        model: response.model,
        findingsIncluded: built.included,
        totalFindings: built.total,
        inputTokens: response.inputTokens ?? built.estimatedTokens,
        outputTokens: response.outputTokens,
        limited: built.limited,
        note: built.limited
          ? `AI synthesis used ${built.included} of ${built.total} actionable findings; the deterministic score used all findings.`
          : "AI synthesis used every actionable finding in the allowlisted payload.",
      },
    };
  } catch {
    throwIfCancelled(input.signal);
    return fallbackResult(
      input,
      built.included,
      built.total,
      built.limited,
      "GPT-5.6 synthesis was unavailable; deterministic priorities were used without exposing repository content.",
    );
  }
}

async function requestOpenAiProposal(
  payload: ModelPayload,
  signal?: AbortSignal,
): Promise<ModelProposalResponse> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.parse(
    {
      model: "gpt-5.6",
      store: false,
      max_output_tokens: MODEL_LIMITS.maxOutputTokens,
      reasoning: { effort: "low" },
      input: [
        { role: "system", content: SYSTEM_INSTRUCTIONS },
        {
          role: "user",
          content: JSON.stringify(payload),
        },
      ],
      text: {
        format: zodTextFormat(FounderActionsSchema, "scaleproof_actions"),
      },
    },
    { signal },
  );

  return {
    parsed: response.output_parsed,
    model: response.model,
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
  };
}
