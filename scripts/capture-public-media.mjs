#!/usr/bin/env node

/**
 * Regenerate the public Scaleproof gallery from the deterministic synthetic demo.
 *
 * Usage:
 *   npm run capture:media
 *   SCALEPROOF_CAPTURE_PORT=3200 npm run capture:media
 *
 * The script starts an isolated local Next.js server with OpenAI disabled,
 * captures desktop-only 3:2 PNGs, and replaces only the named media files.
 */

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "@playwright/test";

const repositoryRoot = resolve(import.meta.dirname, "..");
const mediaDirectory = resolve(repositoryRoot, "docs/media");
const port = Number.parseInt(process.env.SCALEPROOF_CAPTURE_PORT ?? "3199", 10);
const baseUrl = `http://127.0.0.1:${port}`;
const desktopViewport = { width: 1500, height: 1000 };
const screenshots = [
  "scaleproof-landing.png",
  "scaleproof-report-overview.png",
  "scaleproof-growth-readiness.png",
  "scaleproof-knowledge-concentration.png",
  "scaleproof-evidence-dossier.png",
];

function assertCapturePort() {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(
      "SCALEPROOF_CAPTURE_PORT must be an integer between 1024 and 65535.",
    );
  }
}

function startServer() {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const server = spawn(
    npmCommand,
    ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        OPENAI_API_KEY: "",
        PLAYWRIGHT_TEST: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  return server;
}

async function waitForServer(server) {
  let output = "";
  const remember = (chunk) => {
    output = `${output}${chunk.toString()}`.slice(-4_000);
  };

  server.stdout?.on("data", remember);
  server.stderr?.on("data", remember);

  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`The local capture server stopped early:\n${output}`);
    }

    try {
      const response = await fetch(baseUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // The server is still starting.
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }

  throw new Error(`Timed out waiting for ${baseUrl}.\n${output}`);
}

async function stopServer(server) {
  if (server.exitCode !== null) {
    return;
  }

  server.kill("SIGTERM");
  await new Promise((resolveStop) => {
    const timeout = setTimeout(resolveStop, 5_000);
    server.once("exit", () => {
      clearTimeout(timeout);
      resolveStop();
    });
  });
}

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.waitForTimeout(150);
}

async function alignSection(page, selector) {
  await page.locator(selector).evaluate((element) => {
    const top = element.getBoundingClientRect().top + window.scrollY - 72;
    window.scrollTo(0, Math.max(top, 0));
  });
  await page.waitForTimeout(150);
}

async function capture(page, filename) {
  const image = await page.screenshot({ fullPage: false });
  const width = image.readUInt32BE(16);
  const height = image.readUInt32BE(20);

  if (width !== desktopViewport.width || height !== desktopViewport.height) {
    throw new Error(
      `${filename} is ${width}x${height}; expected ${desktopViewport.width}x${desktopViewport.height}.`,
    );
  }

  return { filename, image };
}

async function regenerateMedia() {
  assertCapturePort();
  await mkdir(mediaDirectory, { recursive: true });

  const server = startServer();
  let browser;

  try {
    await waitForServer(server);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      deviceScaleFactor: 1,
      viewport: desktopViewport,
    });
    const page = await context.newPage();

    const captures = [];
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await settle(page);
    captures.push(await capture(page, "scaleproof-landing.png"));

    await page.getByRole("button", { name: "Run the synthetic demo" }).click();
    await page.getByText("Technical readiness dossier").waitFor();
    if ((await page.locator(".action-item").count()) !== 3) {
      throw new Error("The synthetic demo did not produce exactly three actions.");
    }
    await settle(page);

    await alignSection(page, ".do-now");
    captures.push(await capture(page, "scaleproof-report-overview.png"));

    await alignSection(page, ".evidence-overview");
    captures.push(await capture(page, "scaleproof-growth-readiness.png"));

    await alignSection(page, ".bus-factor");
    captures.push(await capture(page, "scaleproof-knowledge-concentration.png"));

    const security = page.locator(".evidence-dossier details").filter({
      hasText: "Security & privacy",
    });
    if ((await security.count()) !== 1) {
      throw new Error("Could not find the Security & privacy evidence section.");
    }
    await security.locator("summary").click();
    await alignSection(page, ".evidence-dossier");
    captures.push(await capture(page, "scaleproof-evidence-dossier.png"));

    const capturedFilenames = new Set(captures.map(({ filename }) => filename));
    if (
      capturedFilenames.size !== screenshots.length ||
      screenshots.some((filename) => !capturedFilenames.has(filename))
    ) {
      throw new Error("The public gallery capture set is incomplete.");
    }

    await Promise.all(
      captures.map(({ filename, image }) =>
        writeFile(resolve(mediaDirectory, filename), image),
      ),
    );
    for (const { filename } of captures) {
      console.info(`Wrote docs/media/${filename}`);
    }
  } finally {
    await browser?.close();
    await stopServer(server);
  }
}

regenerateMedia().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
