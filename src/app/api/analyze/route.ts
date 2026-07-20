import {
  handleAnalyzeRequest,
  streamAnalyzeRequest,
} from "@/lib/application/analyze-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request): Promise<Response> {
  return request.headers.get("accept")?.includes("application/x-ndjson")
    ? streamAnalyzeRequest(request)
    : handleAnalyzeRequest(request);
}
