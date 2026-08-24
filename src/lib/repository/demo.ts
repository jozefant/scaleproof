import path from "node:path";

import { scanDirectory } from "./scanner";

/** Default location of the synthetic fixture inside a Scaleproof checkout. */
export function defaultDemoFixtureRoot(): string {
  return path.join(process.cwd(), "fixtures", "scaleproof-demo");
}

/**
 * Scan the synthetic demo repository.
 *
 * `root` exists so a caller that materializes the same fixture elsewhere (the
 * CLI unpacks its embedded copy into a temporary directory) reuses this exact
 * scan path. The repository label, source URL, and synthetic history are
 * identical for every root, so the produced report does not depend on it.
 */
export async function acquireDemoRepository(root: string = defaultDemoFixtureRoot()) {
  const snapshot = await scanDirectory({
    root,
    repositoryLabel: "scaleproof/demo-startup",
    sourceUrl: null,
  });
  return {
    ...snapshot,
    history: {
      source: "synthetic" as const,
      availability: "available" as const,
      repository: {
        scope: "Repository",
        sampledCommits: 24,
        attributedCommits: 24,
        activeContributors: 2,
        estimatedBusFactor: 1,
        topContributorShare: 88,
        band: "High concentration" as const,
      },
      modules: [
        {
          scope: "Major module 1",
          sampledCommits: 18,
          attributedCommits: 18,
          activeContributors: 1,
          estimatedBusFactor: 1,
          topContributorShare: 100,
          band: "High concentration" as const,
        },
      ],
      note:
        "Synthetic history fixture: deliberately concentrated to demonstrate the bus-factor assessment.",
    },
  };
}
