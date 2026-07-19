import path from "node:path";

import { scanDirectory } from "./scanner";

export async function acquireDemoRepository() {
  const snapshot = await scanDirectory({
    root: path.join(process.cwd(), "fixtures", "scaleproof-demo"),
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
