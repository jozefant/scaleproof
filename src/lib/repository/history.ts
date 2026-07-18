import { createHash } from "node:crypto";

import { HISTORY_LIMITS } from "@/lib/analysis/constants";
import type {
  HistoryConcentration,
  RepositoryFile,
  RepositoryHistory,
  RepositoryProvenance,
} from "@/lib/analysis/types";

const NON_MODULE_ROOTS = new Set([
  ".github",
  "docs",
  "examples",
  "fixtures",
  "scripts",
  "test",
  "tests",
]);

export function anonymizeContributor(value: string): string {
  return createHash("sha256")
    .update(`scaleproof-history:${value.trim().toLowerCase()}`)
    .digest("hex");
}

export function deriveMajorModuleScopes(files: RepositoryFile[]): string[] {
  const counts = new Map<string, number>();

  for (const file of files) {
    const segments = file.path.split("/").filter(Boolean);
    if (segments.length < 2) {
      continue;
    }

    const first = segments[0].toLowerCase();
    if (NON_MODULE_ROOTS.has(first)) {
      continue;
    }

    const scope =
      ["apps", "modules", "packages", "services"].includes(first) &&
      segments.length >= 3
        ? `${segments[0]}/${segments[1]}`
        : segments[0];
    counts.set(scope, (counts.get(scope) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((left, right) => right[1] - left[1])
    .slice(0, HISTORY_LIMITS.majorModules)
    .map(([scope]) => scope);
}

export function summarizeConcentration(
  scope: string,
  sampledCommits: number,
  contributorKeys: string[],
  commitDates: number[] = [],
): HistoryConcentration {
  const counts = contributorKeys.reduce<Map<string, number>>(
    (result, contributor) => {
      result.set(contributor, (result.get(contributor) ?? 0) + 1);
      return result;
    },
    new Map(),
  );
  const attributedCommits = contributorKeys.length;
  const activeContributors = counts.size;
  const sampleWindowDays =
    commitDates.length < 2
      ? null
      : Math.ceil(
          (Math.max(...commitDates) - Math.min(...commitDates)) /
            (24 * 60 * 60 * 1_000),
        );

  if (
    sampledCommits < HISTORY_LIMITS.minimumCommits ||
    attributedCommits < Math.ceil(sampledCommits / 2) ||
    activeContributors === 0
  ) {
    return {
      scope,
      sampledCommits,
      attributedCommits,
      activeContributors,
      estimatedBusFactor: null,
      topContributorShare: null,
      sampleWindowDays,
      band: "Insufficient evidence",
    };
  }

  const ranked = [...counts.values()].sort((left, right) => right - left);
  const topContributorShare = Math.round(
    (ranked[0] / attributedCommits) * 100,
  );
  const threshold = attributedCommits * 0.5;
  let cumulative = 0;
  let estimatedBusFactor = 0;
  for (const count of ranked) {
    cumulative += count;
    estimatedBusFactor += 1;
    if (cumulative >= threshold) {
      break;
    }
  }

  const band =
    estimatedBusFactor <= 1 || topContributorShare >= 65
      ? "High concentration"
      : estimatedBusFactor <= 2 || topContributorShare >= 45
        ? "Moderate concentration"
        : "Distributed";

  return {
    scope,
    sampledCommits,
    attributedCommits,
    activeContributors,
    estimatedBusFactor,
    topContributorShare,
    sampleWindowDays,
    band,
  };
}

function detectLovableProvenance(
  files: RepositoryFile[],
  history: RepositoryHistory,
): RepositoryProvenance | undefined {
  const signals = new Set<string>();

  for (const file of files) {
    const normalizedPath = file.path.toLowerCase();
    if (
      normalizedPath === "package.json" &&
      /["']lovable-tagger["']/.test(file.content)
    ) {
      signals.add("lovable-tagger dependency");
    }
    if (
      normalizedPath.endsWith(".md") &&
      /\b(built with lovable|edit this project.*lovable|lovable project)\b/i.test(
        file.content,
      )
    ) {
      signals.add("Lovable documentation marker");
    }
    if (
      normalizedPath === "package.json" &&
      /["']name["']\s*:\s*["']vite_react_shadcn_ts["']/.test(file.content)
    ) {
      signals.add("Lovable Vite template name");
    }
    if (
      normalizedPath.startsWith(".lovable/") ||
      normalizedPath === "lovable.json"
    ) {
      signals.add("Lovable metadata");
    }
  }

  const strongSignal = [...signals].some((signal) =>
    [
      "lovable-tagger dependency",
      "Lovable documentation marker",
      "Lovable metadata",
    ].includes(signal),
  );
  if (!strongSignal) {
    return undefined;
  }

  const repository = history.repository;
  const compactInitialHistory =
    repository.sampledCommits >= 1 &&
    repository.sampledCommits <= 20 &&
    repository.sampleWindowDays !== null &&
    repository.sampleWindowDays !== undefined &&
    repository.sampleWindowDays <= 7;

  return {
    platform: "Lovable",
    classification: compactInitialHistory
      ? "initial_export"
      : "established_project",
    signals: [...signals],
    note: compactInitialHistory
      ? "An explicit Lovable signature and a compact initial commit burst were detected. Initial single-owner concentration is contextual, not a scored failure."
      : "Lovable provenance was detected, but the history no longer looks like a compact initial export.",
  };
}

export function contextualizeGeneratedHistory(
  files: RepositoryFile[],
  history: RepositoryHistory,
): RepositoryHistory {
  const provenance = detectLovableProvenance(files, history);
  if (!provenance) {
    return history;
  }

  if (provenance.classification !== "initial_export") {
    return { ...history, provenance };
  }

  const contextualize = (
    concentration: HistoryConcentration,
  ): HistoryConcentration =>
    concentration.band === "High concentration"
      ? {
          ...concentration,
          band: "Expected for initial Lovable export",
        }
      : concentration;

  return {
    ...history,
    provenance,
    repository: contextualize(history.repository),
    modules: history.modules.map(contextualize),
    note: `${history.note} ${provenance.note}`,
  };
}

export function unavailableHistory(note: string): RepositoryHistory {
  return {
    source: "unavailable",
    repository: {
      scope: "Repository",
      sampledCommits: 0,
      attributedCommits: 0,
      activeContributors: 0,
      estimatedBusFactor: null,
      topContributorShare: null,
      band: "Insufficient evidence",
    },
    modules: [],
    note,
  };
}
