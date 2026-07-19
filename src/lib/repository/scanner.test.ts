import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { scanDirectory } from "./scanner";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("scanDirectory", () => {
  it("detects a stack while excluding dependency and lockfile bodies", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "scaleproof-test-"));
    temporaryDirectories.push(root);
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "scanner-test" }),
    );
    await writeFile(path.join(root, "package-lock.json"), '{"large":"body"}');

    const result = await scanDirectory({
      root,
      repositoryLabel: "test/scanner",
      sourceUrl: null,
    });

    expect(result.detectedStacks).toContain("Node.js / TypeScript");
    expect(result.files.map((file) => file.path)).toEqual(["package.json"]);
    expect(result.coverage.partial).toBe(false);
  });

  it("marks the scan partial when the shared acquisition deadline is exhausted", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "scaleproof-test-"));
    temporaryDirectories.push(root);
    await writeFile(path.join(root, "README.md"), "# Test");
    const startedAt = Date.now() - 100;

    const result = await scanDirectory({
      root,
      repositoryLabel: "test/expired",
      sourceUrl: null,
      startedAt,
      deadline: Date.now() - 1,
    });

    expect(result.coverage.partial).toBe(true);
    expect(result.coverage.limitsCrossed).toContain("duration");
  });

  it("processes files in deterministic priority and lexical order", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "scaleproof-test-"));
    temporaryDirectories.push(root);
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src", "z.ts"), "export const z = 1;");
    await writeFile(path.join(root, "src", "a.ts"), "export const a = 1;");
    await writeFile(path.join(root, "README.md"), "# Setup\nnpm run verify");
    await writeFile(path.join(root, "package.json"), '{"scripts":{}}');

    const first = await scanDirectory({
      root,
      repositoryLabel: "test/order",
      sourceUrl: null,
    });
    const second = await scanDirectory({
      root,
      repositoryLabel: "test/order",
      sourceUrl: null,
    });

    expect(first.files.map((file) => file.path)).toEqual([
      "package.json",
      "README.md",
      "src/a.ts",
      "src/z.ts",
    ]);
    expect(second.files.map((file) => file.path)).toEqual(
      first.files.map((file) => file.path),
    );
  });

  it("skips an oversized file without hiding later manifests", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "scaleproof-test-"));
    temporaryDirectories.push(root);
    await writeFile(path.join(root, "aaa.txt"), "x".repeat(1_048_577));
    await writeFile(path.join(root, "package.json"), '{"name":"visible"}');

    const result = await scanDirectory({
      root,
      repositoryLabel: "test/oversized",
      sourceUrl: null,
    });

    expect(result.files.map((file) => file.path)).toContain("package.json");
    expect(result.coverage.skippedOversizedFiles).toBe(1);
    expect(result.coverage.limitsCrossed).toContain("individual_file_bytes");
  });

  it("stops immediately when cancellation is requested", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "scaleproof-test-"));
    temporaryDirectories.push(root);
    await writeFile(path.join(root, "README.md"), "# Test");
    const controller = new AbortController();
    controller.abort();

    await expect(
      scanDirectory({
        root,
        repositoryLabel: "test/cancelled",
        sourceUrl: null,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
