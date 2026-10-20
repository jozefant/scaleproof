/**
 * Embedded synthetic demo repository for the CLI.
 *
 * Purpose: make `--demo` work from any working directory in the published
 * package, where `fixtures/scaleproof-demo` is not on disk. The build step
 * injects the fixture as a JSON blob through the esbuild `define` option; this
 * module unpacks it into a temporary directory and reuses the existing demo
 * acquisition and scan path unchanged.
 *
 * Usage: `acquireDemoSnapshot()` inside the CLI. Outside the bundle (Vitest,
 * tsx) the identifier is undeclared and the checkout fixture is used instead,
 * so development and the published command produce the same report.
 *
 * The fixture is synthetic scanner input authored in this repository. It is
 * still materialized defensively: only relative paths that stay inside the
 * temporary root are written, and the directory is removed in `finally`.
 */

import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { CliUsageError } from "@/cli/errors";
import {
  acquireDemoRepository,
  defaultDemoFixtureRoot,
} from "@/lib/repository/demo";
import type { RepositorySnapshot } from "@/lib/repository/types";

declare const __SCALEPROOF_DEMO_FIXTURE__: string | undefined;

/** Relative POSIX path to UTF-8 file content. */
export type DemoFixture = Record<string, string>;

/**
 * The fixture compiled into the bundle, or `null` when running from source.
 */
export function embeddedDemoFixture(): DemoFixture | null {
  // esbuild inlines the whole blob at every occurrence of the identifier, so
  // read it exactly once into a local.
  const encoded =
    typeof __SCALEPROOF_DEMO_FIXTURE__ === "string"
      ? __SCALEPROOF_DEMO_FIXTURE__
      : "";
  if (encoded.length === 0) {
    return null;
  }
  const parsed: unknown = JSON.parse(encoded);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  return parsed as DemoFixture;
}

function resolveInside(root: string, relativePath: string): string {
  const target = path.resolve(root, relativePath);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new CliUsageError(
      "The embedded demo fixture is not valid. Reinstall the package.",
    );
  }
  return target;
}

/** Write every fixture entry below `root`, creating parent directories. */
export async function materializeDemoFixture(
  fixture: DemoFixture,
  root: string,
): Promise<void> {
  for (const [relativePath, contents] of Object.entries(fixture)) {
    if (relativePath.length === 0 || path.isAbsolute(relativePath)) {
      throw new CliUsageError(
        "The embedded demo fixture is not valid. Reinstall the package.",
      );
    }
    const target = resolveInside(root, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents, "utf8");
  }
}

export interface DemoAcquisitionOptions {
  /**
   * Fixture blob to unpack. Defaults to the embedded copy; pass `null` to
   * force the checkout path, or a map to inject one in tests.
   */
  fixture?: DemoFixture | null;
  /** Fixture directory used when no blob is available. */
  checkoutRoot?: string;
}

/**
 * Acquire the demo snapshot from the embedded fixture when one is compiled in,
 * and from the checkout fixture otherwise. Both routes call the same
 * `acquireDemoRepository` scan, so the resulting report is identical.
 */
export async function acquireDemoSnapshot(
  options: DemoAcquisitionOptions = {},
): Promise<RepositorySnapshot> {
  const fixture =
    options.fixture === undefined ? embeddedDemoFixture() : options.fixture;

  if (fixture && Object.keys(fixture).length > 0) {
    const temporaryRoot = await mkdtemp(
      path.join(os.tmpdir(), "scaleproof-demo-"),
    );
    try {
      await materializeDemoFixture(fixture, temporaryRoot);
      return await acquireDemoRepository(temporaryRoot);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }

  const checkoutRoot = options.checkoutRoot ?? defaultDemoFixtureRoot();
  const present = await stat(checkoutRoot).then(
    (entry) => entry.isDirectory(),
    () => false,
  );
  if (!present) {
    throw new CliUsageError(
      "The synthetic demo fixture is unavailable in this build. Reinstall the package, or run --demo from a Scaleproof repository checkout.",
    );
  }
  return acquireDemoRepository(checkoutRoot);
}
