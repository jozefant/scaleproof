import { describe, expect, it } from "vitest";

import {
  anonymizeContributor,
  contextualizeGeneratedHistory,
  deriveMajorModuleScopes,
  summarizeConcentration,
} from "./history";

describe("git-history aggregation", () => {
  it("estimates concentrated and distributed ownership without returning identities", () => {
    const lead = anonymizeContributor("lead@example.invalid");
    const second = anonymizeContributor("second@example.invalid");
    const third = anonymizeContributor("third@example.invalid");

    const concentrated = summarizeConcentration("Repository", 20, [
      ...Array<string>(16).fill(lead),
      ...Array<string>(3).fill(second),
      third,
    ]);
    const distributed = summarizeConcentration("services/orders", 20, [
      ...Array<string>(7).fill(lead),
      ...Array<string>(7).fill(second),
      ...Array<string>(6).fill(third),
    ]);

    expect(concentrated.band).toBe("High concentration");
    expect(concentrated.estimatedBusFactor).toBe(1);
    expect(concentrated.topContributorShare).toBe(80);
    expect(distributed.band).toBe("Moderate concentration");
    expect(JSON.stringify([concentrated, distributed])).not.toContain(
      "example.invalid",
    );
  });

  it("selects major code scopes and excludes documentation-only roots", () => {
    const files = [
      "services/api/a.ts",
      "services/api/b.ts",
      "services/api/c.ts",
      "packages/ui/a.ts",
      "packages/ui/b.ts",
      "packages/ui/c.ts",
      "docs/a.md",
      "docs/b.md",
      "docs/c.md",
    ].map((path) => ({ path, content: "", size: 0 }));

    expect(deriveMajorModuleScopes(files)).toEqual([
      "services/api",
      "packages/ui",
    ]);
  });

  it("returns insufficient evidence for a very small history sample", () => {
    const result = summarizeConcentration("Repository", 3, [
      anonymizeContributor("one"),
      anonymizeContributor("two"),
      anonymizeContributor("three"),
    ]);

    expect(result.band).toBe("Insufficient evidence");
    expect(result.estimatedBusFactor).toBeNull();
  });

  it("contextualizes bus factor one for a compact initial Lovable export", () => {
    const lead = anonymizeContributor("lead");
    const second = anonymizeContributor("second");
    const start = Date.parse("2026-07-01T09:00:00Z");
    const rawHistory = {
      source: "github_recent_commits" as const,
      availability: "available" as const,
      repository: summarizeConcentration(
        "Repository",
        11,
        [...Array<string>(7).fill(lead), ...Array<string>(4).fill(second)],
        Array.from({ length: 11 }, (_, index) => start + index * 60_000),
      ),
      modules: [],
      note: "Directional history sample.",
    };
    const files = [
      {
        path: "package.json",
        content: JSON.stringify({
          name: "vite_react_shadcn_ts",
          devDependencies: { "lovable-tagger": "1.0.0" },
        }),
        size: 100,
      },
    ];

    const contextualized = contextualizeGeneratedHistory(files, rawHistory);

    expect(contextualized.provenance?.classification).toBe("initial_export");
    expect(contextualized.repository.band).toBe(
      "Expected for initial Lovable export",
    );
    expect(contextualized.repository.estimatedBusFactor).toBe(1);
    expect(contextualized.note).toContain("not a scored failure");
  });

  it("keeps concentration scored after the compact Lovable export phase", () => {
    const lead = anonymizeContributor("lead");
    const start = Date.parse("2026-01-01T00:00:00Z");
    const rawHistory = {
      source: "github_recent_commits" as const,
      availability: "available" as const,
      repository: summarizeConcentration(
        "Repository",
        30,
        Array<string>(30).fill(lead),
        Array.from(
          { length: 30 },
          (_, index) => start + index * 24 * 60 * 60 * 1_000,
        ),
      ),
      modules: [],
      note: "Directional history sample.",
    };
    const files = [
      {
        path: "package.json",
        content: '{"devDependencies":{"lovable-tagger":"1.0.0"}}',
        size: 55,
      },
    ];

    const contextualized = contextualizeGeneratedHistory(files, rawHistory);

    expect(contextualized.provenance?.classification).toBe(
      "established_project",
    );
    expect(contextualized.repository.band).toBe("High concentration");
  });
});
