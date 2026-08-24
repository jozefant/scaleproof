/**
 * CLI boundary and packaging tests.
 *
 * Purpose: keep the CLI a sibling adapter of the HTTP route rather than a
 * consumer of it, and keep the publishable `cli/` package minimal.
 *
 * These are static file assertions. Nothing is built, installed, or published.
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const CLI_SOURCE = path.join(process.cwd(), "src/cli");
const CLI_PACKAGE = path.join(process.cwd(), "cli");

async function cliModules(): Promise<string[]> {
  const entries = await readdir(CLI_SOURCE, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .filter((entry) => !entry.name.endsWith(".test.ts"))
    .map((entry) => path.join(CLI_SOURCE, entry.name));
}

describe("CLI dependency direction", () => {
  it("imports no HTTP route, Next.js, or React module", async () => {
    const modules = await cliModules();
    expect(modules.length).toBeGreaterThan(0);
    for (const modulePath of modules) {
      const source = await readFile(modulePath, "utf8");
      expect(source, modulePath).not.toMatch(
        /from ["'](?:next|next\/[^"']+|react|react-dom|react\/[^"']+)["']/,
      );
      expect(source, modulePath).not.toMatch(/@\/app|@\/components/);
      expect(source, modulePath).not.toMatch(/analyze-route/);
    }
  });

  it("reuses the shared application, report, and repository modules", async () => {
    const main = await readFile(path.join(CLI_SOURCE, "main.ts"), "utf8");
    expect(main).toContain("@/lib/application/analyze-repository");
    expect(main).toContain("@/lib/repository/github");
    expect(main).toContain("@/lib/report/markdown");
    expect(main).toContain("@/lib/shared/github-url");
    // Scoring and control policy stay in the analysis layer.
    expect(main).not.toMatch(/analysis\/(controls|scoring|actions)/);
  });

  it("accepts no credential flag", async () => {
    const main = await readFile(path.join(CLI_SOURCE, "main.ts"), "utf8");
    const options = main.slice(
      main.indexOf("options: {"),
      main.indexOf("allowPositionals") + 200,
    );
    expect(options).not.toMatch(/token|key|secret|password|auth/i);
    expect(main).toContain("env.OPENAI_API_KEY");
  });
});

describe("publishable cli package", () => {
  it("declares a strict files allowlist and no install-time behaviour", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(CLI_PACKAGE, "package.json"), "utf8"),
    ) as Record<string, unknown>;

    expect(manifest.files).toEqual([
      "bin/scaleproof.mjs",
      "dist/scaleproof.mjs",
      "README.md",
      "LICENSE",
    ]);
    expect(manifest.bin).toEqual({ scaleproof: "bin/scaleproof.mjs" });
    expect(manifest.dependencies).toBeUndefined();
    expect(manifest.optionalDependencies).toBeUndefined();
    expect(manifest.workspaces).toBeUndefined();
    expect(manifest.scripts).toBeUndefined();
    expect(manifest.engines).toEqual({ node: ">=22.11.0" });
  });

  it("keeps the root package private", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(process.cwd(), "package.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(manifest.private).toBe(true);
    const scripts = manifest.scripts as Record<string, string>;
    expect(scripts["build:cli"]).toBe("node ./scripts/build-cli.mjs");
    expect(scripts.verify).toContain("npm run build:cli");
  });

  it("ships the root licence unchanged", async () => {
    const [root, packaged] = await Promise.all([
      readFile(path.join(process.cwd(), "LICENSE"), "utf8"),
      readFile(path.join(CLI_PACKAGE, "LICENSE"), "utf8"),
    ]);
    expect(packaged).toBe(root);
  });

  it("embeds the synthetic demo fixture at build time", async () => {
    const script = await readFile(
      path.join(process.cwd(), "scripts/build-cli.mjs"),
      "utf8",
    );
    expect(script).toContain("__SCALEPROOF_DEMO_FIXTURE__");
    expect(script).toContain("fixtures/scaleproof-demo");
    // The fixture must never become a packaged file.
    const manifest = JSON.parse(
      await readFile(path.join(CLI_PACKAGE, "package.json"), "utf8"),
    ) as { files: string[] };
    expect(manifest.files.some((entry) => entry.includes("fixtures"))).toBe(
      false,
    );
  });

  it("keeps the launcher free of application logic", async () => {
    const launcher = await readFile(
      path.join(CLI_PACKAGE, "bin/scaleproof.mjs"),
      "utf8",
    );
    expect(launcher.startsWith("#!/usr/bin/env node")).toBe(true);
    expect(launcher).toContain('import("../dist/scaleproof.mjs")');
    expect(launcher).not.toMatch(/parseArgs|fetch\(|OPENAI_API_KEY/i);
  });
});
