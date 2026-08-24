#!/usr/bin/env node
/**
 * Coverage web server for the Playwright E2E coverage gate.
 *
 * Purpose
 *   Serve the Next.js app *in this process* so that V8 server-side coverage
 *   (NODE_V8_COVERAGE) actually observes the route handlers. The `next dev`
 *   CLI supervises a child process and is terminated with SIGTERM by
 *   Playwright, which skips V8's exit-time profile write; running Next
 *   programmatically lets us flush the profile deliberately.
 *
 * Prerequisites
 *   NODE_V8_COVERAGE must point at a writable directory.
 *   OPENAI_API_KEY is blanked by the Playwright config: this server must never
 *   reach a live provider.
 *
 * Usage
 *   NODE_V8_COVERAGE=.coverage/server node ./scripts/coverage-server.mjs
 *
 * Endpoints
 *   GET /__coverage__/flush  Writes the current V8 profile and returns 200.
 *                            Test-harness only; never part of the shipped app.
 */

import { createServer } from "node:http";
import { takeCoverage } from "node:v8";

import next from "next";

const hostname = process.env.COVERAGE_HOST ?? "127.0.0.1";
const port = Number(process.env.COVERAGE_PORT ?? 3101);

const app = next({ dev: true, hostname, port, dir: process.cwd() });
const handle = app.getRequestHandler();

await app.prepare();

const server = createServer((request, response) => {
  if (request.url === "/__coverage__/flush") {
    takeCoverage();
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("flushed");
    return;
  }
  handle(request, response);
});

const shutdown = () => {
  takeCoverage();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2_000).unref();
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

server.listen(port, hostname, () => {
  console.log(`[coverage-server] ready on http://${hostname}:${port}`);
});
