import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
});
