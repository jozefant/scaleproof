import type { AnalysisReport } from "./contract";
import {
  CONTEXT_LABELS,
  evidenceLabel,
  formatBytes,
} from "./presentation";

function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

export function escapeMarkdownProse(value: string): string {
  return singleLine(value).replace(/([\\`*_[\]<>|])/g, "\\$1");
}

export function escapeMarkdownLinkLabel(value: string): string {
  return singleLine(value).replace(/([\\[\]])/g, "\\$1");
}

export function markdownCodeSpan(value: string): string {
  const normalized = singleLine(value);
  const longestRun = Math.max(
    0,
    ...(normalized.match(/`+/g) ?? []).map((run) => run.length),
  );
  const delimiter = "`".repeat(longestRun + 1);
  const content =
    normalized.startsWith("`") || normalized.endsWith("`")
      ? ` ${normalized} `
      : normalized;
  return `${delimiter}${content}${delimiter}`;
}

function markdownTableCell(value: string): string {
  return escapeMarkdownProse(value);
}

export function renderMarkdownReport(report: AnalysisReport): string {
  const lines = [
    `# Scaleproof report: ${escapeMarkdownProse(report.repositoryLabel)}`,
    "",
    `**Verdict:** ${report.verdict}`,
    `**Repository evidence score:** ${report.score}/100`,
    `**Evidence confidence:** ${report.confidence}%`,
    `**Generated:** ${new Date(report.generatedAt).toLocaleString("en-GB")}`,
    `**Schema:** ${report.schemaVersion}`,
    `**Heuristic:** ${report.heuristicVersion}`,
    ...(report.sourceUrl
      ? [
          `**Public source:** [${escapeMarkdownLinkLabel(report.repositoryLabel)}](${report.sourceUrl})`,
        ]
      : []),
    "",
    `> ${report.disclaimer}`,
    "",
    escapeMarkdownProse(report.verdictReason),
    "",
    "## Context assumptions",
    "",
    `- Product stage: ${CONTEXT_LABELS.stage[report.context.stage]}`,
    `- Data handled: ${CONTEXT_LABELS.dataSensitivity[report.context.dataSensitivity]}`,
    `- Growth target: ${CONTEXT_LABELS.growthTarget[report.context.growthTarget]}`,
    "",
    "These answers affect prioritization and severity; they do not replace repository evidence.",
    "",
    "## Do now",
    "",
    ...report.actions.flatMap((action) => [
      `${action.rank}. **${escapeMarkdownProse(action.title)}**`,
      `   ${escapeMarkdownProse(action.rationale)}`,
      `   - Why now: ${escapeMarkdownProse(action.whyNow)}`,
      `   - Source checks: ${action.sourceCheckIds.map(markdownCodeSpan).join(", ")}`,
      ...(action.evidence.length
        ? [
            `   - Evidence locations: ${action.evidence
              .map((item) => markdownCodeSpan(item.path))
              .join(", ")}`,
          ]
        : []),
      `   - Complete when: ${escapeMarkdownProse(action.verification)}`,
    ]),
    "",
    "## Growth horizon",
    "",
    `- 10x users: ${report.growth.users10x}`,
    `- 100x users: ${report.growth.users100x}`,
    `- Engineering team: ${report.growth.team}`,
    `- AI agents: ${report.growth.agents}`,
    "",
    "## Bus factor",
    "",
    `- History availability: ${report.busFactor.availability}`,
    `- Repository: ${report.busFactor.repository.band}`,
    `- Estimated bus factor: ${report.busFactor.repository.estimatedBusFactor ?? "insufficient evidence"}`,
    `- Active contributors in sample: ${report.busFactor.repository.activeContributors}`,
    `- Recent commits sampled: ${report.busFactor.repository.sampledCommits}`,
    ...(report.busFactor.repository.topContributorShare === null
      ? []
      : [
          `- Largest contributor share: ${report.busFactor.repository.topContributorShare}%`,
        ]),
    ...report.busFactor.modules.map(
      (module) =>
        `- Module ${markdownCodeSpan(module.scope)}: ${module.band}; estimated bus factor ${module.estimatedBusFactor ?? "unknown"} from ${module.sampledCommits} commits`,
    ),
    `- ${escapeMarkdownProse(report.busFactor.note)}`,
    "",
    "## Domain scores",
    "",
    "| Domain | Repository evidence score | Positive | Concrete negative | Missing | Runtime-only |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...report.domains.map(
      (domain) =>
        `| ${markdownTableCell(domain.label)} | ${domain.score}/100 | ${domain.positiveEvidenceWeight} | ${domain.concreteNegativeWeight} | ${domain.missingEvidenceWeight} | ${domain.runtimeOnlyWeight} |`,
    ),
    "",
    "## Scan coverage",
    "",
    `- ${report.coverage.processedRelevantFiles} of ${report.coverage.discoveredRelevantFiles} relevant files processed`,
    `- ${report.coverage.skippedBinaryFiles} binary and ${report.coverage.skippedOversizedFiles} oversized files skipped`,
    `- ${report.coverage.unprocessedRelevantFiles} relevant files unprocessed`,
    `- ${formatBytes(report.coverage.processedTextBytes)} extracted text`,
    `- ${report.coverage.partial ? "Partial scan" : "Full discovered-file scan"}`,
    ...(report.coverage.limitsCrossed.length
      ? [`- Limits crossed: ${report.coverage.limitsCrossed.join(", ")}`]
      : []),
    "",
    "## Evidence dossier",
    "",
    ...report.checks.flatMap((check) => [
      `### ${escapeMarkdownProse(check.title)}`,
      "",
      `- Check ID: ${markdownCodeSpan(check.id)}`,
      `- Domain: ${check.domain}`,
      `- Result: ${evidenceLabel(check)}`,
      `- Severity: ${check.severity}`,
      `- Summary: ${escapeMarkdownProse(check.summary)}`,
      ...(check.evidence.length
        ? [
            `- Evidence locations: ${check.evidence
              .map((evidence) => markdownCodeSpan(evidence.path))
              .join(", ")}`,
          ]
        : []),
      "",
    ]),
    "## AI synthesis boundary",
    "",
    `- Action source: ${report.ai.source}`,
    `- Findings used: ${report.ai.findingsIncluded} of ${report.ai.totalFindings}`,
    `- ${escapeMarkdownProse(report.ai.note)}`,
    "- No repository text, names, paths, snippets, secrets, or personal data were sent to OpenAI.",
    "",
    "---",
    "",
    "Jozef Antony",
  ];
  return lines.join("\n");
}
