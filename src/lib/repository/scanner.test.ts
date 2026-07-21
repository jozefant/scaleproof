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

  it("retains tracked editor settings for safe credential detection", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "scaleproof-test-"));
    temporaryDirectories.push(root);
    await mkdir(path.join(root, ".vscode"), { recursive: true });
    await writeFile(
      path.join(root, ".vscode", "settings.json"),
      '{ "serviceKey": "configured-at-runtime" }',
    );

    const result = await scanDirectory({
      root,
      repositoryLabel: "test/editor-settings",
      sourceUrl: null,
    });

    expect(result.files.map((file) => file.path)).toContain(
      ".vscode/settings.json",
    );
  });

  it("acquires exact dotenv and text private-key files within scanner guards", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "scaleproof-test-"));
    temporaryDirectories.push(root);
    const dotenvSecret = `SERVICE_ROLE_TOKEN=${"a".repeat(24)}`;
    const pemSecret = "-----BEGIN PRIVATE KEY-----\nsynthetic-pem";
    const keySecret = "-----BEGIN RSA PRIVATE KEY-----\nsynthetic-key";
    await writeFile(path.join(root, ".env"), dotenvSecret);
    await writeFile(path.join(root, "private.pem"), pemSecret);
    await writeFile(path.join(root, "private.key"), keySecret);
    await writeFile(path.join(root, "binary.key"), Buffer.from([0, 1, 2]));

    const result = await scanDirectory({
      root,
      repositoryLabel: "test/secret-acquisition",
      sourceUrl: null,
    });
    expect(result.files.map((file) => file.path)).toEqual(
      expect.arrayContaining([".env", "private.pem", "private.key"]),
    );
    expect(result.files.map((file) => file.path)).not.toContain("binary.key");

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
