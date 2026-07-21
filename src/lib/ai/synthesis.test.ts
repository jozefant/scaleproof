import { afterEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";

import { selectDeterministicActions } from "@/lib/analysis/actions";
import type { CheckResult } from "@/lib/analysis/types";

import {
  buildAllowlistedPayload,
  synthesizeFounderActions,
  type SynthesisInput,
} from "./synthesis";

const sensitivePath =
  "src/customer/jozef.antony@example.invalid/private-customer-name.ts";

const finding: CheckResult = {
  id: "security.exposed-secret",
  domain: "security",
  title: "Likely exposed credential",
  outcome: "fail",
  evidenceTier: "enforced",
  severity: "critical",
  weight: 5,
  summary: "A secret-shaped value was found.",
  remediationCode: "remove-exposed-secret",
  evidence: [{ path: sensitivePath, kind: "code" }],
};

function synthesisInput(
  checks: CheckResult[] = [finding],
): SynthesisInput {
  return {
    verdict: "Fixable",
    score: 61,
    confidence: 80,
    domains: [
      {
        id: "security",
        label: "Security & privacy",
        score: 30,
        weight: 0.2,
        assessableWeight: 5,
        applicableWeight: 5,
        positiveEvidenceWeight: 0,
        concreteNegativeWeight: 5,
        missingEvidenceWeight: 0,
        runtimeOnlyWeight: 0,
      },
    ],
    growth: {
      users10x: "Ready with conditions",
      users100x: "Insufficient evidence",
      team: "Conditional",
      agents: "Usable with guardrails",
    },
    context: {
      stage: "unknown",
      dataSensitivity: "withheld",
      growthTarget: "users_and_team",
    },
    checks,
    fallbackActions: selectDeterministicActions(checks),
  };
}

describe("OpenAI synthesis boundary", () => {
  const originalKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalKey;
    }
  });

  it("builds an allowlisted payload without repository paths or prose", () => {
    const built = buildAllowlistedPayload(synthesisInput());

    const serialized = JSON.stringify(built.payload);
    expect(serialized).toContain("security.exposed-secret");
    expect(serialized).toContain("remove-exposed-secret");
    expect(serialized).not.toContain(sensitivePath);
    expect(serialized).not.toContain(finding.title);
    expect(serialized).not.toContain(finding.summary);
    expect(built.estimatedTokens).toBeLessThanOrEqual(12_000);
  });

  it("accepts only remediation-code ordering and keeps deterministic copy", async () => {
    process.env.OPENAI_API_KEY = "dummy";
    const input = synthesisInput();
    const requestProposal = vi.fn(async () => ({
      parsed: {
        actions: [
          {
            remediationCode: "remove-exposed-secret",
            title: "Unsupported model title",
            rationale: "Unsupported model rationale.",
          },
        ],
      },
      model: "gpt-5.6",
      inputTokens: 100,
      outputTokens: 10,
    }));

    const result = await synthesizeFounderActions(input, {
      requestProposal,
    });

    expect(requestProposal).toHaveBeenCalledOnce();
    expect(result.meta.source).toBe("gpt-5.6");
    expect(result.actions[0]).toMatchObject({
      title: input.fallbackActions[0].title,
      rationale: input.fallbackActions[0].rationale,
      severity: "critical",
    });
  });

  it.each([
    {
      name: "malformed structured output",
      parsed: null,
    },
    {
      name: "omitted mandatory work",
      parsed: { actions: [] },
    },
    {
      name: "unknown remediation",
      parsed: { actions: [{ remediationCode: "unknown-code" }] },
    },
    {
      name: "duplicated remediation",
      parsed: {
        actions: [
          { remediationCode: "remove-exposed-secret" },
          { remediationCode: "remove-exposed-secret" },
        ],
      },
    },
  ])("fails closed without retrying locally rejected $name", async ({ parsed }) => {
    const input = synthesisInput();
    const requestProposal = vi.fn(async () => ({
      parsed,
      model: "gpt-5.6",
      inputTokens: null,
      outputTokens: null,
    }));
    await expect(synthesizeFounderActions(input, {
      requestProposal,
      sleep: async () => undefined,
      now: () => 0,
      random: () => 0.5,
    })).rejects.toMatchObject({
      code: "synthesis_unavailable",
    });
    expect(requestProposal).toHaveBeenCalledOnce();
  });

  it("retries five transient failures and succeeds on the sixth attempt", async () => {
    const input = synthesisInput();
    const sleep = vi.fn(async () => undefined);
    const requestProposal = vi.fn(async () => {
      if (requestProposal.mock.calls.length < 6) {
        throw Object.assign(new Error("network unavailable"), { status: 503 });
      }
      return {
        parsed: { actions: [{ remediationCode: "remove-exposed-secret" }] },
        model: "gpt-5.6",
        inputTokens: 100,
        outputTokens: 10,
      };
    });
    const result = await synthesizeFounderActions(input, {
      requestProposal,
      sleep,
      now: () => 0,
      random: () => 0.5,
    });

    expect(result.meta.source).toBe("gpt-5.6");
    expect(requestProposal).toHaveBeenCalledTimes(6);
    expect(sleep).toHaveBeenNthCalledWith(1, 1_000, undefined);
    expect(sleep).toHaveBeenNthCalledWith(5, 16_000, undefined);
  });

  it("fails fast for missing credentials and non-retryable errors", async () => {
    const input = synthesisInput();
    delete process.env.OPENAI_API_KEY;
    await expect(synthesizeFounderActions(input)).rejects.toMatchObject({
      code: "synthesis_misconfigured",
    });

    const requestProposal = vi.fn(async () => {
      throw Object.assign(new Error("invalid key"), { status: 401 });
    });
    await expect(synthesizeFounderActions(input, { requestProposal })).rejects.toMatchObject({
      code: "synthesis_unavailable",
    });
    expect(requestProposal).toHaveBeenCalledOnce();
  });

  it("honors Retry-After without re-running deterministic analysis", async () => {
    const input = synthesisInput();
    const sleep = vi.fn(async () => undefined);
    const requestProposal = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("rate limited"), {
          status: 429,
          headers: { "retry-after": "3" },
        }),
      )
      .mockResolvedValueOnce({
        parsed: { actions: [{ remediationCode: "remove-exposed-secret" }] },
        model: "gpt-5.6",
        inputTokens: 100,
        outputTokens: 10,
      });

    await expect(synthesizeFounderActions(input, {
      requestProposal,
      sleep,
      now: () => 0,
    })).resolves.toMatchObject({
      actions: input.fallbackActions,
      meta: { source: "gpt-5.6" },
    });
    expect(sleep).toHaveBeenCalledWith(3_000, undefined);
    expect(requestProposal).toHaveBeenCalledTimes(2);
  });

  it("stops retrying before the complete synthesis deadline is exceeded", async () => {
    let currentTime = 0;
    const requestProposal = vi.fn(async () => {
      currentTime += 8_000;
      throw Object.assign(new Error("temporarily unavailable"), {
        status: 503,
      });
    });
    const sleep = vi.fn(async (delayMs: number) => {
      currentTime += delayMs;
    });

    await expect(
      synthesizeFounderActions(synthesisInput(), {
        requestProposal,
        sleep,
        now: () => currentTime,
        random: () => 0.5,
      }),
    ).rejects.toMatchObject({
      code: "synthesis_unavailable",
      message: expect.stringContaining("deadline"),
    });
    expect(currentTime).toBeLessThanOrEqual(45_000);
    expect(requestProposal).toHaveBeenCalledTimes(4);
  });

  it("stops during backoff without another attempt", async () => {
    const controller = new AbortController();
    const requestProposal = vi.fn(async () => {
      throw Object.assign(new Error("temporarily unavailable"), { status: 503 });
    });
    const sleep = vi.fn(async (_milliseconds: number, signal?: AbortSignal) => {
      controller.abort();
      throw signal?.reason;
    });

    await expect(synthesizeFounderActions({
      ...synthesisInput(),
      signal: controller.signal,
    }, { requestProposal, sleep })).rejects.toMatchObject({ name: "AbortError" });
    expect(requestProposal).toHaveBeenCalledOnce();
  });

  it("propagates cancellation instead of converting it to fallback", async () => {
    process.env.OPENAI_API_KEY = "dummy";
    const controller = new AbortController();
    const input = {
      ...synthesisInput(),
      signal: controller.signal,
    };
    const requestProposal = vi.fn(
      async (_payload: unknown, signal?: AbortSignal) => {
        expect(signal).not.toBe(controller.signal);
        controller.abort();
        throw signal?.reason;
      },
    );

    await expect(
      synthesizeFounderActions(input, { requestProposal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(requestProposal).toHaveBeenCalledOnce();
  });

  it.each([
    { name: "missing", value: undefined },
    { name: "whitespace-only", value: " \t " },
  ])("logs a privacy-safe configuration error for a $name API key", async ({ value }) => {
    if (value === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = value;
    }
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(synthesizeFounderActions(synthesisInput())).rejects.toMatchObject({
      code: "synthesis_misconfigured",
    });

    const serialized = String(log.mock.calls[0]?.[0]);
    expect(JSON.parse(serialized)).toMatchObject({
      provider: "openai",
      operation: "action_prioritization",
      attempt: 0,
      outcome: "failure",
      statusClass: "none",
      providerErrorCode: "configuration_missing_OPENAI_API_KEY",
      retryDecision: "not_retried",
      correlationId: expect.any(String),
    });
    expect(serialized).not.toContain(value ?? "undefined");
    log.mockRestore();
  });

  it.each([
    {
      name: "authentication failure",
      error: Object.assign(new Error("Bearer secret-token https://github.com/private/repository"), { status: 401 }),
      expected: { statusClass: "4xx", providerErrorCode: "authentication", retryDecision: "not_retried", attempt: 1 },
    },
    {
      name: "rate limit",
      error: Object.assign(new Error("rate limited"), { status: 429 }),
      expected: { statusClass: "4xx", providerErrorCode: "rate_limited", retryDecision: "retry_exhausted", attempt: 6 },
    },
    {
      name: "provider server failure",
      error: Object.assign(new Error("provider unavailable"), { status: 503 }),
      expected: { statusClass: "5xx", providerErrorCode: "provider_5xx", retryDecision: "retry_exhausted", attempt: 6 },
    },
    {
      name: "DOM attempt timeout",
      error: new DOMException("request timed out", "TimeoutError"),
      expected: { statusClass: "none", providerErrorCode: "timeout", retryDecision: "retry_exhausted", attempt: 6 },
    },
    {
      name: "OpenAI SDK attempt timeout",
      error: new OpenAI.APIUserAbortError(),
      expected: { statusClass: "none", providerErrorCode: "timeout", retryDecision: "retry_exhausted", attempt: 6 },
    },
  ])("logs a terminal, allowlisted diagnostic for $name", async ({ error, expected }) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const requestProposal = vi.fn(async () => {
      throw error;
    });

    await expect(synthesizeFounderActions(synthesisInput(), {
      requestProposal,
      sleep: async () => undefined,
      now: () => 0,
      random: () => 0.5,
    })).rejects.toMatchObject({ code: "synthesis_unavailable" });

    expect(requestProposal).toHaveBeenCalledTimes(expected.attempt);
    const events = log.mock.calls.map(([entry]) => JSON.parse(String(entry)));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      provider: "openai",
      operation: "action_prioritization",
      outcome: "failure",
      ...expected,
    });
    const serialized = JSON.stringify(events[0]);
    for (const denied of [
      "secret-token",
      "github.com/private/repository",
      "Bearer",
      sensitivePath,
      "OPENAI_API_KEY=",
      "authorization",
      "cookie",
      "response",
      "payload",
    ]) {
      expect(serialized).not.toContain(denied);
    }
    expect(Object.keys(events[0]).sort()).toEqual([
      "attempt",
      "correlationId",
      "durationMs",
      "operation",
      "outcome",
      "provider",
      "providerErrorCode",
      "retryDecision",
      "statusClass",
    ]);
    log.mockRestore();
  });

  it.each([
    {
      name: "malformed output",
      response: { parsed: null, model: "gpt-5.6", inputTokens: null, outputTokens: null },
      providerErrorCode: "malformed_output",
    },
    {
      name: "rejected priorities",
      response: {
        parsed: { actions: [{ remediationCode: "not-allowlisted" }] },
        model: "gpt-5.6",
        inputTokens: null,
        outputTokens: null,
      },
      providerErrorCode: "rejected_priorities",
    },
  ])("does not treat local $name as a transient provider failure", async ({ response, providerErrorCode }) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const requestProposal = vi.fn(async () => response);

    await expect(synthesizeFounderActions(synthesisInput(), { requestProposal })).rejects.toMatchObject({
      code: "synthesis_unavailable",
    });

    expect(requestProposal).toHaveBeenCalledOnce();
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      providerErrorCode,
      retryDecision: "not_retried",
      attempt: 1,
    });
    log.mockRestore();
  });

  it("logs cancellation and a successful retry without serializing model data", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warningLog = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const infoLog = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const controller = new AbortController();
    const cancelled = vi.fn(async () => {
      controller.abort();
      throw controller.signal.reason;
    });

    await expect(synthesizeFounderActions({
      ...synthesisInput(),
      signal: controller.signal,
    }, { requestProposal: cancelled })).rejects.toMatchObject({ name: "AbortError" });
    expect(JSON.parse(String(warningLog.mock.calls[0]?.[0]))).toMatchObject({
      providerErrorCode: "cancelled",
      outcome: "cancelled",
      retryDecision: "cancelled",
    });
    expect(errorLog).not.toHaveBeenCalled();

    const requestProposal = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("temporary"), { status: 503 }))
      .mockResolvedValueOnce({
        parsed: { actions: [{ remediationCode: "remove-exposed-secret" }] },
        model: "gpt-5.6",
        inputTokens: 1,
        outputTokens: 1,
      });
    await expect(synthesizeFounderActions(synthesisInput(), {
      requestProposal,
      sleep: async () => undefined,
      now: () => 0,
      random: () => 0.5,
    })).resolves.toMatchObject({ meta: { source: "gpt-5.6" } });
    expect(JSON.parse(String(infoLog.mock.calls[0]?.[0]))).toMatchObject({
      providerErrorCode: "none",
      outcome: "success",
      attempt: 2,
      retryDecision: "completed_after_retry",
    });
    expect(errorLog).not.toHaveBeenCalled();
    expect(warningLog).toHaveBeenCalledOnce();
    errorLog.mockRestore();
    warningLog.mockRestore();
    infoLog.mockRestore();
  });
});
