/**
 * Embedded demo fixture tests.
 *
 * Purpose: prove that the fixture blob compiled into the published bundle is
 * unpacked safely, scanned through the existing demo acquisition path, and
 * removed afterwards, and that an absent fixture is a clear usage error.
 *
 * Every fixture used here is synthetic and created inside the test.
 */

import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  acquireDemoSnapshot,
  embeddedDemoFixture,
  materializeDemoFixture,
  type DemoFixture,
} from "@/cli/demo-fixture";
import { CliUsageError } from "@/cli/errors";

const SYNTHETIC_FIXTURE: DemoFixture = {
  "package.json": '{"name":"synthetic-demo","private":true}\n',
  "README.md": "# Synthetic demo\n\nUsed only by CLI tests.\n",
  "src/server.js": "export function handler() {\n  return 'ok';\n}\n",
};

async function temporaryRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "scaleproof-fixture-test-"));
}

// Other test files create demo directories in parallel. A private temporary
// root keeps their directories out of this check.
async function demoDirectoriesLeftBy(
  run: () => Promise<unknown>,
): Promise<string[]> {
  const isolatedRoot = await temporaryRoot();
  const tmpdir = vi.spyOn(os, "tmpdir").mockReturnValue(isolatedRoot);
  try {
    await run();
    return await readdir(isolatedRoot);
  } finally {
    tmpdir.mockRestore();
    await rm(isolatedRoot, { recursive: true, force: true });
  }
}

describe("materializeDemoFixture", () => {
  it("writes every entry, creating nested directories", async () => {
    const root = await temporaryRoot();
    try {
      await materializeDemoFixture(SYNTHETIC_FIXTURE, root);
      for (const [relativePath, contents] of Object.entries(
        SYNTHETIC_FIXTURE,
      )) {
        expect(await readFile(path.join(root, relativePath), "utf8")).toBe(
          contents,
        );
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each([
    ["../escaped.txt"],
    ["nested/../../escaped.txt"],
    [path.join(os.tmpdir(), "absolute.txt")],
    [""],
  ])("refuses to write outside the root: %s", async (relativePath) => {
    const root = await temporaryRoot();
    try {
      await expect(
        materializeDemoFixture({ [relativePath]: "x" }, root),
      ).rejects.toBeInstanceOf(CliUsageError);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("acquireDemoSnapshot", () => {
  it("returns no embedded fixture when running from source", () => {
    // The esbuild `define` is absent outside the published bundle.
    expect(embeddedDemoFixture()).toBeNull();
  });

  it("scans an injected fixture through the shared demo path", async () => {
    const snapshot = await acquireDemoSnapshot({
      fixture: SYNTHETIC_FIXTURE,
      checkoutRoot: path.join(os.tmpdir(), `scaleproof-absent-${randomUUID()}`),
    });

    expect(snapshot.repositoryLabel).toBe("scaleproof/demo-startup");
    expect(snapshot.sourceUrl).toBeNull();
    expect(snapshot.history.source).toBe("synthetic");
    expect(snapshot.coverage.processedRelevantFiles).toBe(
      Object.keys(SYNTHETIC_FIXTURE).length,
    );
    // Evidence paths stay relative, so a temporary root never reaches a report.
    for (const file of snapshot.files) {
      expect(path.isAbsolute(file.path)).toBe(false);
      expect(file.path).not.toContain(os.tmpdir());
    }
  });

  it("removes its temporary directory after the scan", async () => {
    const left = await demoDirectoriesLeftBy(() =>
      acquireDemoSnapshot({ fixture: SYNTHETIC_FIXTURE }),
    );
    expect(left).toEqual([]);
  });

  it("removes its temporary directory when the scan fails", async () => {
    const left = await demoDirectoriesLeftBy(() =>
      expect(
        acquireDemoSnapshot({ fixture: { "../escaped.txt": "x" } }),
      ).rejects.toBeInstanceOf(CliUsageError),
    );
    expect(left).toEqual([]);
  });

  it("reports a usage error when no fixture is available at all", async () => {
    await expect(
      acquireDemoSnapshot({
        fixture: null,
        checkoutRoot: path.join(
          os.tmpdir(),
          `scaleproof-absent-${randomUUID()}`,
        ),
      }),
    ).rejects.toBeInstanceOf(CliUsageError);
  });
});
