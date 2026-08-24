import { test as base, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

/**
 * Browser-side V8 coverage collection for the E2E coverage gate.
 *
 * Only active when `E2E_COVERAGE=1`, so the ordinary `npm run test:e2e` run
 * keeps its current behaviour and timing. Raw V8 entries (plus the resolved
 * source map for each script) are written to `E2E_COVERAGE_BROWSER_DIR`;
 * `scripts/e2e-coverage.mjs` merges them with the Next.js server-side
 * `NODE_V8_COVERAGE` profiles.
 */

const enabled = process.env.E2E_COVERAGE === "1";
const browserDir =
  process.env.E2E_COVERAGE_BROWSER_DIR ??
  path.join(process.cwd(), ".coverage", "browser");

type RawEntry = {
  url: string;
  source?: string;
  sourceMap?: unknown;
  functions: unknown[];
};

async function resolveSourceMap(
  page: Page,
  url: string,
  source: string,
): Promise<unknown> {
  const match = /\/\/# sourceMappingURL=(\S+)\s*$/m.exec(source);
  if (!match) {
    return undefined;
  }
  const reference = match[1];
  if (reference.startsWith("data:")) {
    const base64 = reference.slice(reference.indexOf(",") + 1);
    try {
      return JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
    } catch {
      return undefined;
    }
  }
  try {
    const mapUrl = new URL(reference, url).href;
    const response = await page.request.get(mapUrl);
    if (!response.ok()) {
      return undefined;
    }
    return await response.json();
  } catch {
    return undefined;
  }
}

export const test = base.extend<{ coveragePage: void }>({
  coveragePage: [
    async ({ page }, use) => {
      if (!enabled) {
        await use();
        return;
      }

      await page.coverage.startJSCoverage({ resetOnNavigation: false });
      await use();

      let raw: Awaited<ReturnType<Page["coverage"]["stopJSCoverage"]>>;
      try {
        raw = await page.coverage.stopJSCoverage();
      } catch {
        return;
      }

      const entries: RawEntry[] = [];
      for (const entry of raw) {
        if (!entry.url || !entry.url.startsWith("http")) {
          continue;
        }
        const source = entry.source ?? "";
        entries.push({
          url: entry.url,
          source,
          sourceMap: await resolveSourceMap(page, entry.url, source),
          functions: entry.functions,
        });
      }

      if (entries.length === 0) {
        return;
      }
      await mkdir(browserDir, { recursive: true });
      await writeFile(
        path.join(browserDir, `browser-${randomUUID()}.json`),
        JSON.stringify(entries),
        "utf8",
      );
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
export type {
  APIRequestContext,
  Page,
  TestInfo,
} from "@playwright/test";
