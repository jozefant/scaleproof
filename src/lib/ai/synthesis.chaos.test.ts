/**
 * Chaos tests for the mandatory OpenAI synthesis boundary.
 *
 * Purpose: inject provider faults at random and check invariants that must
 * hold for every fault sequence, not only for the hand-written cases.
 *
 * - Off-contract output: a proposal outside the deterministic candidates
 *   produces a clean `MandatorySynthesisError` and never a partial result.
 * - Time faults: hangs, 429 with any `Retry-After`, 5xx and connection errors
 *   never keep synthesis past its own deadline or the caller's deadline.
 *
 * A seeded generator makes every failure reproducible from the printed seed.
 * A fake clock replaces real waiting, so hundreds of scenarios run in
 * milliseconds. All data is the embedded synthetic demo repository.
 */

import { describe, expect, it } from "vitest";

import { analyzeSnapshot } from "@/lib/analysis/analyze";
import {
  mandatoryRemediationCodes,
  selectDeterministicActions,
} from "@/lib/analysis/actions";
import {
  REQUEST_BUDGET_MS,
  handleAnalyzeRequest,
} from "@/lib/application/analyze-route";
import { createExternalServiceDiagnostics } from "@/lib/diagnostics/external-service";
import { acquireDemoRepository } from "@/lib/repository/demo";

import {
  MAX_SYNTHESIS_ATTEMPTS,
  MandatorySynthesisError,
  synthesizeFounderActions,
  type SynthesisDependencies,
  type SynthesisInput,
} from "./synthesis";

const SCENARIOS = 300;
const SYNTHESIS_DEADLINE_MS = 45_000;
const CONTEXT = {
  stage: "live_early",
  dataSensitivity: "basic_personal",
  growthTarget: "users_10x",
} as const;

/** Deterministic PRNG (mulberry32). */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pick<T>(random: () => number, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)] as T;
}

function shuffled<T>(random: () => number, values: readonly T[]): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other] as T, copy[index] as T];
  }
  return copy;
}

async function demoInput(): Promise<SynthesisInput> {
  const snapshot = await acquireDemoRepository();
  const draft = analyzeSnapshot(snapshot, CONTEXT);
  return {
    verdict: draft.verdict,
    score: draft.score,
    confidence: draft.confidence,
    domains: draft.domains,
    growth: draft.growth,
    context: CONTEXT,
    checks: draft.checks,
    fallbackActions: selectDeterministicActions(draft.checks, CONTEXT.growthTarget),
  };
}

/** A fake clock. Waiting and timeouts move time instead of using it. */
function fakeClock(start = 1_000_000) {
  let time = start;
  let attemptTimeoutMs = Number.POSITIVE_INFINITY;
  return {
    start,
    now: () => time,
    advance: (milliseconds: number) => {
      time += milliseconds;
    },
    get attemptTimeoutMs() {
      return attemptTimeoutMs;
    },
    dependencies: {
      now: () => time,
      sleep: async (milliseconds: number) => {
        time += milliseconds;
      },
      timeoutSignal: (milliseconds: number) => {
        attemptTimeoutMs = milliseconds;
        return new AbortController().signal;
      },
    } satisfies Partial<SynthesisDependencies>,
  };
}

function proposal(codes: string[]) {
  return {
    parsed: { actions: codes.map((remediationCode) => ({ remediationCode })) },
    model: "fake-model",
    inputTokens: null,
    outputTokens: null,
  };
}

function terminalEventCounter() {
  let count = 0;
  const diagnostics = createExternalServiceDiagnostics("chaos", () => {
    count += 1;
  });
  return { diagnostics, count: () => count };
}

describe("chaos: off-contract model output", () => {
  const OFF_CONTRACT_CODES = ["add-test-layers", "add-observability", "not-a-real-code"];

  it(`keeps the result valid or fails cleanly for ${SCENARIOS} random proposals`, async () => {
    const input = await demoInput();
    const candidates = input.fallbackActions.map((action) => action.remediationCode);
    const mandatory = mandatoryRemediationCodes(input.checks);

    for (let seed = 1; seed <= SCENARIOS; seed += 1) {
      const random = seeded(seed);
      const shapes = {
        reordered: () => shuffled(random, candidates),
        fewer: () => shuffled(random, candidates).slice(0, candidates.length - 1),
        unknownCode: () => [...shuffled(random, candidates).slice(1), pick(random, OFF_CONTRACT_CODES)],
        duplicate: () => [candidates[0] as string, ...shuffled(random, candidates).slice(1, -1), candidates[0] as string],
        extra: () => [...shuffled(random, candidates), pick(random, OFF_CONTRACT_CODES)],
        empty: () => [],
        nullParsed: () => null,
      };
      const shape = pick(random, Object.keys(shapes) as Array<keyof typeof shapes>);
      const codes = shapes[shape]();
      const events = terminalEventCounter();

      const outcome = await synthesizeFounderActions(input, {
        ...fakeClock().dependencies,
        diagnostics: events.diagnostics,
        requestProposal: async () =>
          codes === null
            ? { parsed: null, model: "fake-model", inputTokens: null, outputTokens: null }
            : proposal(codes),
      }).then(
        (result) => ({ ok: true as const, result }),
        (error: unknown) => ({ ok: false as const, error }),
      );

      const label = `seed ${seed} (${shape})`;
      expect(events.count(), label).toBe(1);
      if (shape === "reordered") {
        expect(outcome.ok, label).toBe(true);
        if (!outcome.ok) continue;
        const returned = outcome.result.actions.map((action) => action.remediationCode);
        expect(returned, label).toEqual(codes);
        expect([...returned].sort(), label).toEqual([...candidates].sort());
        expect(outcome.result.actions.map((action) => action.rank), label).toEqual(
          returned.map((_, index) => index + 1),
        );
        for (const code of mandatory) expect(returned, label).toContain(code);
      } else {
        expect(outcome.ok, label).toBe(false);
        if (outcome.ok) continue;
        expect(outcome.error, label).toBeInstanceOf(MandatorySynthesisError);
        expect(
          ["rejected_priorities", "malformed_output"],
          label,
        ).toContain((outcome.error as MandatorySynthesisError).diagnosticCode);
      }
    }
  });
});

describe("chaos: provider time faults", () => {
  type Fault = "hang" | "rateLimited" | "serverError" | "connectionReset" | "slowSuccess";
  const FAULTS: readonly Fault[] = ["hang", "rateLimited", "serverError", "connectionReset", "slowSuccess"];

  it(`never runs past the synthesis or caller deadline for ${SCENARIOS} random fault sequences`, async () => {
    const input = await demoInput();
    const candidates = input.fallbackActions.map((action) => action.remediationCode);

    for (let seed = 1; seed <= SCENARIOS; seed += 1) {
      const random = seeded(seed);
      const clock = fakeClock();
      // Acquisition used a random part of the route budget, or the caller has no budget.
      const deadlineAt =
        random() < 0.2
          ? undefined
          : clock.start + Math.floor(random() * 60_000);
      const budget = Math.min(
        SYNTHESIS_DEADLINE_MS,
        deadlineAt === undefined ? Number.POSITIVE_INFINITY : deadlineAt - clock.start,
      );
      const events = terminalEventCounter();
      let attempts = 0;

      const outcome = await synthesizeFounderActions(input, {
        ...clock.dependencies,
        random,
        deadlineAt,
        diagnostics: events.diagnostics,
        requestProposal: async () => {
          attempts += 1;
          const fault = pick(random, FAULTS);
          if (fault === "slowSuccess") {
            clock.advance(Math.floor(random() * clock.attemptTimeoutMs * 0.9));
            return proposal(candidates);
          }
          if (fault === "hang") {
            clock.advance(clock.attemptTimeoutMs);
            throw new DOMException("The attempt timed out.", "TimeoutError");
          }
          if (fault === "rateLimited") {
            const retryAfter = pick(random, [undefined, "1", "30", "3600"]);
            throw Object.assign(new Error("rate limited"), {
              status: 429,
              headers: retryAfter ? { "retry-after": retryAfter } : {},
            });
          }
          if (fault === "serverError") {
            throw Object.assign(new Error("server error"), { status: 503 });
          }
          throw new Error("socket hang up");
        },
      }).then(
        () => ({ ok: true as const }),
        (error: unknown) => ({ ok: false as const, error }),
      );

      const label = `seed ${seed}`;
      expect(clock.now() - clock.start, label).toBeLessThanOrEqual(budget);
      expect(attempts, label).toBeLessThanOrEqual(MAX_SYNTHESIS_ATTEMPTS);
      expect(events.count(), label).toBe(1);
      if (!outcome.ok) {
        expect(outcome.error, label).toBeInstanceOf(MandatorySynthesisError);
      }
    }
  });

  it("stops inside the remaining route budget when every attempt hangs after a slow acquisition", async () => {
    const input = await demoInput();
    const clock = fakeClock();
    // Acquisition used 90 of the 110 budget seconds.
    const deadlineAt = clock.start + 20_000;

    await expect(
      synthesizeFounderActions(input, {
        ...clock.dependencies,
        random: () => 0.5,
        deadlineAt,
        requestProposal: async () => {
          clock.advance(clock.attemptTimeoutMs);
          throw new DOMException("The attempt timed out.", "TimeoutError");
        },
      }),
    ).rejects.toBeInstanceOf(MandatorySynthesisError);
    expect(clock.now()).toBeLessThanOrEqual(deadlineAt);
  });

  it("does not wait for a Retry-After that ends after the deadline", async () => {
    const input = await demoInput();
    const clock = fakeClock();
    let slept = 0;

    await expect(
      synthesizeFounderActions(input, {
        ...clock.dependencies,
        sleep: async (milliseconds) => {
          slept += milliseconds;
          clock.advance(milliseconds);
        },
        requestProposal: async () => {
          throw Object.assign(new Error("rate limited"), {
            status: 429,
            headers: { "retry-after": "3600" },
          });
        },
      }),
    ).rejects.toBeInstanceOf(MandatorySynthesisError);
    expect(slept).toBe(0);
  });

  it("gives the analysis a deadline inside the platform limit", async () => {
    let received: number | undefined;
    const before = Date.now();
    await handleAnalyzeRequest(
      new Request("http://localhost/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "demo", context: CONTEXT }),
      }),
      {
        acquireDemo: acquireDemoRepository,
        acquirePublic: async () => {
          throw new Error("not used");
        },
        analyze: async (_snapshot, _context, _signal, _retry, _diagnostics, deadlineAt) => {
          received = deadlineAt;
          throw new Error("stop after the deadline is observed");
        },
      },
    );

    expect(received).toBeDefined();
    expect(received!).toBeLessThanOrEqual(Date.now() + REQUEST_BUDGET_MS);
    expect(received!).toBeGreaterThanOrEqual(before + REQUEST_BUDGET_MS);
    // The route's `maxDuration` is 120 seconds.
    expect(REQUEST_BUDGET_MS).toBeLessThan(120_000);
  });
});
