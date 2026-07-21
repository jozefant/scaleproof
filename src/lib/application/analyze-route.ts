import { z } from "zod";

import {
  MAX_SYNTHESIS_ATTEMPTS,
  MandatorySynthesisError,
  type SynthesisInput,
  type SynthesisRetryHandler,
  type SynthesisResult,
} from "@/lib/ai/synthesis";
import { analyzeRepository } from "@/lib/application/analyze-repository";
import { acquireDemoRepository } from "@/lib/repository/demo";
import {
  acquirePublicRepository,
  RepositoryAcquisitionError,
} from "@/lib/repository/github";
import {
  createExternalServiceDiagnostics,
  type ExternalServiceDiagnostics,
} from "@/lib/diagnostics/external-service";
import type { RepositorySnapshot } from "@/lib/repository/types";
import type {
  AnalysisReport,
  ScanContext,
} from "@/lib/report/contract";

const AnalyzeRequestSchema = z
  .object({
    source: z.enum(["demo", "github"]),
    repositoryUrl: z.string().url().max(300).optional(),
    context: z.object({
      stage: z.enum([
        "prototype",
        "live_early",
        "scaling_production",
        "unknown",
        "withheld",
      ]),
      dataSensitivity: z.enum([
        "none",
        "basic_personal",
        "sensitive_regulated",
        "unknown",
        "withheld",
      ]),
      growthTarget: z.enum([
        "users_10x",
        "users_100x",
        "engineering_team",
        "users_and_team",
        "unknown",
        "withheld",
      ]),
    }),
  })
  .superRefine((value, context) => {
    if (value.source === "github" && !value.repositoryUrl) {
      context.addIssue({
        code: "custom",
        path: ["repositoryUrl"],
        message: "A public GitHub repository URL is required.",
      });
    }
  });

function noStoreHeaders(): HeadersInit {
  return {
    "Cache-Control": "no-store, max-age=0",
    "Content-Type": "application/json",
    "X-Content-Type-Options": "nosniff",
  };
}

export interface AnalyzeRouteDependencies {
  acquireDemo: () => Promise<RepositorySnapshot>;
  acquirePublic: (
    repositoryUrl: string,
    signal?: AbortSignal,
    diagnostics?: ExternalServiceDiagnostics,
  ) => Promise<RepositorySnapshot>;
  analyze: (
    snapshot: RepositorySnapshot,
    context: ScanContext,
    signal?: AbortSignal,
    onSynthesisRetry?: SynthesisRetryHandler,
    diagnostics?: ExternalServiceDiagnostics,
  ) => Promise<AnalysisReport>;
}

function testMandatorySynthesis(input: SynthesisInput): Promise<SynthesisResult> {
  return Promise.resolve({
    actions: input.fallbackActions,
    meta: {
      source: "gpt-5.6",
      model: "gpt-5.6-test-boundary",
      findingsIncluded: input.fallbackActions.length,
      totalFindings: input.fallbackActions.length,
      inputTokens: null,
      outputTokens: null,
      limited: false,
      note: "Injected mandatory synthesis completed in the browser test boundary.",
    },
  });
}

const DEFAULT_DEPENDENCIES: AnalyzeRouteDependencies = {
  acquireDemo: acquireDemoRepository,
  acquirePublic: acquirePublicRepository,
  analyze: (snapshot, context, signal, onSynthesisRetry, diagnostics) =>
    analyzeRepository(snapshot, context, {
      signal,
      onSynthesisRetry,
      diagnostics,
      synthesize:
        process.env.PLAYWRIGHT_TEST === "1" ? testMandatorySynthesis : undefined,
    }),
};

export async function handleAnalyzeRequest(
  request: Request,
  dependencies: AnalyzeRouteDependencies = DEFAULT_DEPENDENCIES,
  onSynthesisRetry?: SynthesisRetryHandler,
): Promise<Response> {
  try {
    const diagnostics = createExternalServiceDiagnostics();
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > 8_192) {
      return Response.json(
        { error: "The analysis request is too large." },
        { status: 413, headers: noStoreHeaders() },
      );
    }

    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 8_192) {
      return Response.json(
        { error: "The analysis request is too large." },
        { status: 413, headers: noStoreHeaders() },
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return Response.json(
        { error: "The analysis request is not valid JSON." },
        { status: 400, headers: noStoreHeaders() },
      );
    }

    const parsed = AnalyzeRequestSchema.safeParse(json);
    if (!parsed.success) {
      return Response.json(
        {
          error:
            parsed.error.issues[0]?.message ??
            "The analysis request is not valid.",
        },
        { status: 400, headers: noStoreHeaders() },
      );
    }

    const snapshot =
      parsed.data.source === "demo"
        ? await dependencies.acquireDemo()
        : await dependencies.acquirePublic(
            parsed.data.repositoryUrl ?? "",
            request.signal,
            diagnostics,
          );

    const report = await dependencies.analyze(
      snapshot,
      parsed.data.context,
      request.signal,
      onSynthesisRetry,
      diagnostics,
    );
    return Response.json(report, {
      status: 200,
      headers: noStoreHeaders(),
    });
  } catch (error) {
    if (
      request.signal.aborted ||
      (error instanceof DOMException && error.name === "AbortError")
    ) {
      return Response.json(
        {
          error: "The repository scan was cancelled.",
          code: "cancelled",
        },
        { status: 499, headers: noStoreHeaders() },
      );
    }

    if (error instanceof RepositoryAcquisitionError) {
      const status =
        error.code === "invalid_url"
          ? 400
          : error.code === "cancelled"
            ? 499
            : error.code === "archive_too_large"
              ? 413
              : error.code === "duration_limit"
                ? 504
                : error.code === "not_found" ||
                    error.code === "private_repository"
                  ? 404
                  : 502;
      return Response.json(
        { error: error.message, code: error.code },
        { status, headers: noStoreHeaders() },
      );
    }

    if (error instanceof MandatorySynthesisError) {
      return Response.json(
        {
          error:
            "OpenAI could not complete the required action prioritization. Try this scan again.",
          code: "synthesis_unavailable",
        },
        { status: 503, headers: noStoreHeaders() },
      );
    }

    return Response.json(
      {
        error:
          "Scaleproof could not complete this scan. No repository content was retained.",
      },
      { status: 500, headers: noStoreHeaders() },
    );
  }
}

type AnalyzeStreamEvent =
  | {
      type: "synthesis_retry";
      attempt: number;
      maxAttempts: number;
      delayMs: number;
    }
  | { type: "report"; report: unknown }
  | { type: "error"; status: number; error: string; code?: string };

function streamHeaders(): HeadersInit {
  return {
    "Cache-Control": "no-store, max-age=0",
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  };
}

export function streamAnalyzeRequest(
  request: Request,
  dependencies: AnalyzeRouteDependencies = DEFAULT_DEPENDENCIES,
): Response {
  const encoder = new TextEncoder();
  const operation = new AbortController();
  const forwardCancellation = () =>
    operation.abort(
      request.signal.reason ??
        new DOMException("The repository scan was cancelled.", "AbortError"),
    );
  if (request.signal.aborted) {
    forwardCancellation();
  } else {
    request.signal.addEventListener("abort", forwardCancellation, {
      once: true,
    });
  }
  const analysisRequest = new Request(request, { signal: operation.signal });
  let open = true;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: AnalyzeStreamEvent): void => {
        if (open) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      };

      void handleAnalyzeRequest(
        analysisRequest,
        dependencies,
        (attempt, delayMs) => {
          send({
            type: "synthesis_retry",
            attempt,
            maxAttempts: MAX_SYNTHESIS_ATTEMPTS,
            delayMs,
          });
        },
      )
        .then(async (response) => {
          const payload: unknown = await response.json();
          if (response.ok) {
            send({ type: "report", report: payload });
            return;
          }
          const safePayload =
            typeof payload === "object" && payload !== null
              ? (payload as { error?: unknown; code?: unknown })
              : {};
          send({
            type: "error",
            status: response.status,
            error:
              typeof safePayload.error === "string"
                ? safePayload.error
                : "The scan could not be completed.",
            code:
              typeof safePayload.code === "string"
                ? safePayload.code
                : undefined,
          });
        })
        .catch(() => {
          send({
            type: "error",
            status: 500,
            error:
              "Scaleproof could not complete this scan. No repository content was retained.",
          });
        })
        .finally(() => {
          request.signal.removeEventListener("abort", forwardCancellation);
          if (open) {
            open = false;
            controller.close();
          }
        });
    },
    cancel() {
      open = false;
      operation.abort(
        new DOMException("The repository scan was cancelled.", "AbortError"),
      );
    },
  });

  return new Response(stream, {
    status: 200,
    headers: streamHeaders(),
  });
}
