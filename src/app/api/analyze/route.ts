import { z } from "zod";

import { analyzeSnapshot } from "@/lib/analysis/analyze";
import { acquireDemoRepository } from "@/lib/repository/demo";
import {
  acquirePublicRepository,
  RepositoryAcquisitionError,
} from "@/lib/repository/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

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

export async function POST(request: Request): Promise<Response> {
  try {
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
        ? await acquireDemoRepository()
        : await acquirePublicRepository(parsed.data.repositoryUrl ?? "");

    const report = await analyzeSnapshot(snapshot, parsed.data.context);
    return Response.json(report, {
      status: 200,
      headers: noStoreHeaders(),
    });
  } catch (error) {
    if (error instanceof RepositoryAcquisitionError) {
      const status =
        error.code === "invalid_url"
          ? 400
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

    return Response.json(
      {
        error:
          "Scaleproof could not complete this scan. No repository content was retained.",
      },
      { status: 500, headers: noStoreHeaders() },
    );
  }
}
