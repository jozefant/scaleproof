import { afterEach, describe, expect, it, vi } from "vitest";

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
  ])("retries and fails closed for $name", async ({ parsed }) => {
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
    expect(requestProposal).toHaveBeenCalledTimes(6);
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
});
