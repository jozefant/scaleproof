/**
 * Black-box tests for `scripts/canary.mjs`.
 *
 * The canary runs as a child process against a local server. Each case
 * returns one synthetic response shape that the canary must classify.
 */

import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const run = promisify(execFile);
const CANARY = path.resolve(__dirname, "../../scripts/canary.mjs");
const PROTECTION_MESSAGE = "Deployment Protection blocked the request";

let server: Server | undefined;

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

async function canaryAgainst(
  status: number,
  contentType: string,
  body: string,
): Promise<{ code: number; output: string }> {
  server = createServer((_request, response) => {
    response.writeHead(status, { "content-type": contentType });
    response.end(body);
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const env: NodeJS.ProcessEnv = { ...process.env, CANARY_URL: `http://127.0.0.1:${port}` };
  delete env.VERCEL_AUTOMATION_BYPASS_SECRET;
  try {
    const { stdout } = await run(process.execPath, [CANARY], { env });
    return { code: 0, output: stdout };
  } catch (error) {
    const failure = error as { code: number; stdout: string };
    return { code: failure.code, output: failure.stdout };
  }
}

const HTML = "<!doctype html><title>Authentication Required</title>";
const REPORT = JSON.stringify({
  heuristicVersion: "synthetic",
  verdict: "Fixable",
  actions: [{ remediationCode: "remove-exposed-secret" }],
});

describe("production canary", () => {
  it.each([401, 403])("names Deployment Protection for an HTML %i page", async (status) => {
    const result = await canaryAgainst(status, "text/html", HTML);
    expect(result.code).toBe(1);
    expect(result.output).toContain(PROTECTION_MESSAGE);
  });

  it("reports a non-JSON server error without blaming protection", async () => {
    const result = await canaryAgainst(500, "text/html", HTML);
    expect(result.code).toBe(1);
    expect(result.output).toContain("the response is not JSON");
    expect(result.output).not.toContain(PROTECTION_MESSAGE);
  });

  it("passes a valid report", async () => {
    const result = await canaryAgainst(200, "application/json", REPORT);
    expect(result.code).toBe(0);
    expect(result.output).toContain("ok");
  });
});
