"use client";

import {
  AlertTriangle,
  ArrowDown,
  ArrowUpRight,
  Bot,
  Braces,
  ChevronDown,
  CircleDot,
  Download,
  FileSearch,
  Gauge,
  GitFork,
  LockKeyhole,
  RotateCcw,
  Scale,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import type {
  AnalysisReport,
  CheckResult,
  DataSensitivity,
  DomainId,
  GrowthTarget,
  ScanContext,
  Stage,
} from "@/lib/analysis/types";

import { ReadinessChart } from "./readiness-chart";

const DEFAULT_CONTEXT: ScanContext = {
  stage: "unknown",
  dataSensitivity: "unknown",
  growthTarget: "unknown",
};

const STAGE_OPTIONS: Array<{ value: Stage; label: string }> = [
  { value: "prototype", label: "Prototype" },
  { value: "live_early", label: "Live, early product" },
  { value: "scaling_production", label: "Scaling or production" },
  { value: "unknown", label: "I don't know" },
  { value: "withheld", label: "Prefer not to say" },
];

const DATA_OPTIONS: Array<{ value: DataSensitivity; label: string }> = [
  { value: "none", label: "No personal data" },
  { value: "basic_personal", label: "Basic account or customer data" },
  {
    value: "sensitive_regulated",
    label: "Sensitive or regulated data",
  },
  { value: "unknown", label: "I don't know" },
  { value: "withheld", label: "Prefer not to say" },
];

const GROWTH_OPTIONS: Array<{ value: GrowthTarget; label: string }> = [
  { value: "users_10x", label: "10x more users" },
  { value: "users_100x", label: "100x more users" },
  { value: "engineering_team", label: "A larger engineering team" },
  {
    value: "users_and_team",
    label: "Both users and engineering team",
  },
  { value: "unknown", label: "I don't know" },
  { value: "withheld", label: "Prefer not to say" },
];

const DOMAIN_ORDER: DomainId[] = [
  "architecture",
  "quality",
  "security",
  "operations",
  "reliability",
  "resilience",
  "agent_readiness",
];

const PHASES = [
  "Acquiring temporary copy",
  "Inspecting controls",
  "Scoring evidence",
  "Preparing founder brief",
];

function isAnalysisReport(
  value: AnalysisReport | { error?: string },
): value is AnalysisReport {
  return "verdict" in value;
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) {
    return `${bytes} B`;
  }
  if (bytes < 1_048_576) {
    return `${(bytes / 1_024).toFixed(1)} KB`;
  }
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function evidenceLabel(check: CheckResult): string {
  if (check.outcome === "fail") {
    return "Verified concern";
  }
  if (check.outcome === "not_applicable") {
    return "Not applicable";
  }
  if (check.outcome === "unknown" && check.evidenceTier === "runtime_only") {
    return "Not verifiable";
  }
  if (check.outcome === "unknown") {
    return "Missing evidence";
  }
  if (check.evidenceTier === "enforced") {
    return "Verified";
  }
  if (check.evidenceTier === "inferred") {
    return "Supported by evidence";
  }
  return "Documented only";
}

function evidenceTone(check: CheckResult): string {
  if (check.outcome === "fail") {
    return "negative";
  }
  if (check.outcome === "pass" && check.evidenceTier === "enforced") {
    return "positive";
  }
  if (check.outcome === "pass") {
    return "qualified";
  }
  return "neutral";
}

function verdictClass(verdict: AnalysisReport["verdict"]): string {
  return verdict.toLowerCase();
}

function markdownReport(report: AnalysisReport): string {
  const lines = [
    `# Scaleproof report: ${report.repositoryLabel}`,
    "",
    `**Verdict:** ${report.verdict}`,
    `**Score:** ${report.score}/100`,
    `**Evidence confidence:** ${report.confidence}%`,
    `**Generated:** ${new Date(report.generatedAt).toLocaleString("en-GB")}`,
    `**Heuristic:** ${report.heuristicVersion}`,
    "",
    `> ${report.disclaimer}`,
    "",
    report.verdictReason,
    "",
    "## Do now",
    "",
    ...report.actions.flatMap((action) => [
      `${action.rank}. **${action.title}**`,
      `   ${action.rationale}`,
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
        `- Module \`${module.scope}\`: ${module.band}; estimated bus factor ${module.estimatedBusFactor ?? "unknown"} from ${module.sampledCommits} commits`,
    ),
    `- ${report.busFactor.note}`,
    "",
    "## Domain scores",
    "",
    "| Domain | Score |",
    "| --- | ---: |",
    ...report.domains.map(
      (domain) => `| ${domain.label} | ${domain.score}/100 |`,
    ),
    "",
    "## Scan coverage",
    "",
    `- ${report.coverage.processedRelevantFiles} of ${report.coverage.discoveredRelevantFiles} relevant files processed`,
    `- ${formatBytes(report.coverage.processedTextBytes)} extracted text`,
    `- ${report.coverage.partial ? "Partial scan" : "Full discovered-file scan"}`,
    ...(report.coverage.limitsCrossed.length
      ? [`- Limits crossed: ${report.coverage.limitsCrossed.join(", ")}`]
      : []),
    "",
    "## Evidence dossier",
    "",
    ...report.checks.flatMap((check) => [
      `### ${check.title}`,
      "",
      `- Domain: ${check.domain}`,
      `- Result: ${evidenceLabel(check)}`,
      `- Severity: ${check.severity}`,
      `- Summary: ${check.summary}`,
      ...(check.evidence.length
        ? [
            `- Evidence locations: ${check.evidence
              .map((evidence) => `\`${evidence.path}\``)
              .join(", ")}`,
          ]
        : []),
      "",
    ]),
    "## AI synthesis boundary",
    "",
    `- Action source: ${report.ai.source}`,
    `- Findings used: ${report.ai.findingsIncluded} of ${report.ai.totalFindings}`,
    `- ${report.ai.note}`,
    "- No repository text, names, paths, snippets, secrets, or personal data were sent to OpenAI.",
    "",
    "---",
    "",
    "Jozef Antony",
  ];
  return lines.join("\n");
}

function downloadReport(report: AnalysisReport): void {
  const blob = new Blob([markdownReport(report)], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeName = report.repositoryLabel
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  link.href = url;
  link.download = `scaleproof-${safeName || "report"}.md`;
  link.click();
  URL.revokeObjectURL(url);
}

function Question<T extends string>({
  id,
  number,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  number: string;
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="question" htmlFor={id}>
      <span className="question-number">{number}</span>
      <span className="question-copy">{label}</span>
      <span className="select-shell">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value as T)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" size={15} />
      </span>
    </label>
  );
}

function Intake({
  onReport,
}: {
  onReport: (report: AnalysisReport) => void;
}) {
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [context, setContext] = useState<ScanContext>(DEFAULT_CONTEXT);
  const [isLoading, setIsLoading] = useState(false);
  const [phase, setPhase] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading) {
      return;
    }
    const timer = window.setInterval(() => {
      setPhase((current) => Math.min(current + 1, PHASES.length - 1));
    }, 2_100);
    return () => window.clearInterval(timer);
  }, [isLoading]);

  async function runAnalysis(source: "github" | "demo"): Promise<void> {
    setIsLoading(true);
    setPhase(0);
    setError(null);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          repositoryUrl:
            source === "github" ? repositoryUrl.trim() : undefined,
          context,
        }),
      });
      const payload = (await response.json()) as
        | AnalysisReport
        | { error?: string };
      if (!response.ok || !isAnalysisReport(payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "The scan could not be completed.",
        );
      }
      onReport(payload);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The scan could not be completed.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void runAnalysis("github");
  }

  return (
    <section className="intake-panel" aria-labelledby="intake-title">
      <div className="intake-heading">
        <span>Repository intake</span>
        <span>Public GitHub only</span>
      </div>
      <div className="intake-body">
        <div className="panel-index" aria-hidden="true">
          01
        </div>
        <h2 id="intake-title">Open the technical dossier.</h2>
        <p className="intake-intro">
          Add one public repository. Three optional answers improve the
          prioritization, not the evidence.
        </p>

        <form onSubmit={submit}>
          <label className="repo-label" htmlFor="repository-url">
            <GitFork aria-hidden="true" size={17} />
            Public repository URL
          </label>
          <div className="repo-row">
            <input
              id="repository-url"
              type="url"
              inputMode="url"
              autoComplete="url"
              value={repositoryUrl}
              onChange={(event) => setRepositoryUrl(event.target.value)}
              placeholder="https://github.com/owner/repository"
              required
              disabled={isLoading}
            />
            <button className="primary-button" type="submit" disabled={isLoading}>
              {isLoading ? "Scanning" : "Analyze"}
              <ArrowUpRight aria-hidden="true" size={17} />
            </button>
          </div>

          <div className="questions">
            <Question
              id="product-stage"
              number="A"
              label="What stage is the product at?"
              value={context.stage}
              options={STAGE_OPTIONS}
              onChange={(stage) =>
                setContext((current) => ({ ...current, stage }))
              }
            />
            <Question
              id="data-sensitivity"
              number="B"
              label="What kind of data does it handle?"
              value={context.dataSensitivity}
              options={DATA_OPTIONS}
              onChange={(dataSensitivity) =>
                setContext((current) => ({ ...current, dataSensitivity }))
              }
            />
            <Question
              id="growth-target"
              number="C"
              label="What growth are you preparing for?"
              value={context.growthTarget}
              options={GROWTH_OPTIONS}
              onChange={(growthTarget) =>
                setContext((current) => ({ ...current, growthTarget }))
              }
            />
          </div>

          {isLoading && (
            <div className="scan-progress" aria-live="polite">
              <div className="progress-rule">
                <span style={{ width: `${((phase + 1) / PHASES.length) * 100}%` }} />
              </div>
              <span>{PHASES[phase]}</span>
              <span>{String(phase + 1).padStart(2, "0")}/04</span>
            </div>
          )}

          {error && (
            <div className="error-notice" role="alert">
              <AlertTriangle aria-hidden="true" size={17} />
              <span>{error}</span>
            </div>
          )}
        </form>

        <div className="demo-row">
          <span>Need a known baseline?</span>
          <button
            type="button"
            className="text-button"
            disabled={isLoading}
            onClick={() => void runAnalysis("demo")}
          >
            Run the synthetic demo
            <ArrowUpRight aria-hidden="true" size={15} />
          </button>
        </div>
      </div>
    </section>
  );
}

function PrivacyBoundary({ report }: { report?: AnalysisReport }) {
  return (
    <aside className="privacy-boundary">
      <LockKeyhole aria-hidden="true" size={19} />
      <div>
        <strong>Zero source text sent to OpenAI</strong>
        <p>
          The model receives categorical control IDs, scores, severities, and
          predefined remediation codes only. Temporary repository files are
          deleted after scanning. Git-history identities and commit text are
          discarded after aggregate bus-factor counts are calculated.
        </p>
        {report && (
          <small>
            AI action brief: {report.ai.findingsIncluded} of{" "}
            {report.ai.totalFindings} actionable findings
            {report.ai.limited ? " (limited subset)" : ""}. {report.ai.note}
          </small>
        )}
      </div>
    </aside>
  );
}

function Landing({
  onReport,
}: {
  onReport: (report: AnalysisReport) => void;
}) {
  return (
    <>
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="Scaleproof home">
          SCALE<span>PROOF</span>
        </a>
        <div className="header-note">
          <CircleDot aria-hidden="true" size={13} />
          Evidence-based codebase readiness
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              Technical due diligence / founder edition
            </div>
            <h1>
              Can your codebase carry the{" "}
              <em>company</em> you&rsquo;re building?
            </h1>
            <div className="hero-foot">
              <p>
                A fast, evidence-based snapshot for products built with AI,
                contractors, or a team that moved faster than its foundations.
              </p>
              <div className="scale-marker" aria-label="10 times to 100 times">
                <span>10×</span>
                <ArrowDown aria-hidden="true" size={18} />
                <span>100×</span>
              </div>
            </div>
          </div>
          <Intake onReport={onReport} />
        </section>

        <section className="method-strip" aria-label="Scaleproof method">
          <div>
            <Braces aria-hidden="true" size={20} />
            <span>Deterministic scanner</span>
          </div>
          <div>
            <Scale aria-hidden="true" size={20} />
            <span>Versioned heuristic</span>
          </div>
          <div>
            <Sparkles aria-hidden="true" size={20} />
            <span>GPT-prioritized brief</span>
          </div>
          <div>
            <ShieldCheck aria-hidden="true" size={20} />
            <span>Privacy boundary</span>
          </div>
        </section>

        <section className="scope-section">
          <div className="scope-heading">
            <span>Evidence map</span>
            <h2>Seven questions beneath the headline question.</h2>
          </div>
          <div className="scope-grid">
            {[
              ["01", "Architecture", "Can teams change modules independently?"],
              ["02", "Quality", "Will faster delivery multiply regressions?"],
              ["03", "Security", "Are identity, data, and secrets bounded?"],
              ["04", "Operations", "Will failures be visible and owned?"],
              ["05", "Reliability", "Can the runtime absorb 10× and evolve to 100×?"],
              ["06", "Resilience", "Can data and service be recovered?"],
              [
                "07",
                "AI agents",
                "Can agents act safely and verify their own work?",
              ],
            ].map(([number, title, copy]) => (
              <article key={number} className="scope-card">
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <PrivacyBoundary />
      </main>
      <footer className="site-footer">
        <span>Scaleproof / Hackathon edition</span>
        <span>Jozef Antony</span>
      </footer>
    </>
  );
}

function GrowthCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <article className="growth-card">
      <div className="growth-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function Report({
  report,
  onReset,
}: {
  report: AnalysisReport;
  onReset: () => void;
}) {
  const checksByDomain = useMemo(
    () =>
      DOMAIN_ORDER.map((domainId) => ({
        domainId,
        label:
          report.domains.find((domain) => domain.id === domainId)?.label ??
          domainId,
        checks: report.checks.filter((check) => check.domain === domainId),
      })),
    [report],
  );

  return (
    <>
      <header className="report-header">
        <button className="wordmark wordmark-button" onClick={onReset}>
          SCALE<span>PROOF</span>
        </button>
        <div className="report-actions">
          <button className="secondary-button" onClick={() => downloadReport(report)}>
            <Download aria-hidden="true" size={16} />
            Download .md
          </button>
          <button className="secondary-button" onClick={onReset}>
            <RotateCcw aria-hidden="true" size={16} />
            New scan
          </button>
        </div>
      </header>

      <main className="report-page">
        {report.coverage.partial && (
          <section className="partial-banner" role="alert">
            <AlertTriangle aria-hidden="true" size={20} />
            <div>
              <strong>Partial scan — evidence limit crossed</strong>
              <span>
                Processed {report.coverage.processedRelevantFiles} of{" "}
                {report.coverage.discoveredRelevantFiles} relevant files. Limits:{" "}
                {report.coverage.limitsCrossed.join(", ") || "coverage"}.
                Fundable is blocked below 80% coverage.
              </span>
            </div>
          </section>
        )}

        <section className="dossier-cover">
          <div className="dossier-meta">
            <span>Technical readiness dossier</span>
            <span>
              {new Date(report.generatedAt)
                .toISOString()
                .slice(0, 10)
                .replaceAll("-", ".")}
            </span>
            <span>Heuristic {report.heuristicVersion}</span>
          </div>
          <div className="dossier-title">
            <div>
              <span className="repository-label">Repository under review</span>
              <h1>{report.repositoryLabel}</h1>
              <p>{report.verdictReason}</p>
              <span className="disclaimer">{report.disclaimer}</span>
            </div>
            <div
              className={`verdict-stamp ${verdictClass(report.verdict)}`}
              aria-label={`Verdict: ${report.verdict}`}
            >
              <small>Verdict</small>
              <strong>{report.verdict}</strong>
            </div>
          </div>
          <div className="score-rail">
            <div>
              <span>Readiness score</span>
              <strong>
                {report.score}<small>/100</small>
              </strong>
            </div>
            <div>
              <span>Evidence confidence</span>
              <strong>
                {report.confidence}<small>%</small>
              </strong>
            </div>
            <div>
              <span>Files assessed</span>
              <strong>
                {report.coverage.processedRelevantFiles}
                <small>/{report.coverage.discoveredRelevantFiles}</small>
              </strong>
            </div>
            <div>
              <span>Detected stack</span>
              <strong className="stack-value">
                {report.detectedStacks.join(" · ")}
              </strong>
            </div>
          </div>
        </section>

        <section className="do-now">
          <div className="section-kicker">
            <span>Priority brief</span>
            <span>Maximum three actions</span>
          </div>
          <h2>Do these now.</h2>
          <div className="action-list">
            {report.actions.map((action) => (
              <article className="action-item" key={action.remediationCode}>
                <span className="action-rank">
                  {String(action.rank).padStart(2, "0")}
                </span>
                <div>
                  <span className={`severity ${action.severity}`}>
                    {action.severity}
                  </span>
                  <h3>{action.title}</h3>
                  <p>{action.rationale}</p>
                </div>
                <ArrowUpRight aria-hidden="true" size={22} />
              </article>
            ))}
          </div>
        </section>

        <section className="evidence-overview">
          <div className="chart-panel">
            <div className="section-kicker">
              <span>Readiness ledger</span>
              <span>01—07</span>
            </div>
            <h2>What the repository can prove.</h2>
            <ReadinessChart domains={report.domains} />
          </div>
          <div className="growth-panel">
            <div className="section-kicker">
              <span>Scale horizon</span>
              <span>Architecture, not promises</span>
            </div>
            <GrowthCard
              icon={<Gauge aria-hidden="true" size={21} />}
              label="10× users"
              value={report.growth.users10x}
            />
            <GrowthCard
              icon={<ArrowUpRight aria-hidden="true" size={21} />}
              label="100× users"
              value={report.growth.users100x}
            />
            <GrowthCard
              icon={<Users aria-hidden="true" size={21} />}
              label="Engineering team"
              value={report.growth.team}
            />
            <GrowthCard
              icon={<Bot aria-hidden="true" size={21} />}
              label="AI-agent readiness"
              value={report.growth.agents}
            />
          </div>
        </section>

        <section className="bus-factor">
          <div className="bus-factor-heading">
            <div>
              <span>Knowledge concentration</span>
              <h2>Who can safely change the system?</h2>
            </div>
            <p>
              A directional estimate from recent git history, not a people
              assessment. No names, emails, logins, messages, or commit IDs are
              retained.
            </p>
          </div>
          <div className="bus-factor-ledger">
            {[report.busFactor.repository, ...report.busFactor.modules].map(
              (scope) => (
                <article key={scope.scope}>
                  <div>
                    <span>{scope.scope}</span>
                    <strong>{scope.band}</strong>
                  </div>
                  <dl>
                    <div>
                      <dt>Estimated bus factor</dt>
                      <dd>{scope.estimatedBusFactor ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Contributors</dt>
                      <dd>{scope.activeContributors || "—"}</dd>
                    </div>
                    <div>
                      <dt>Commits sampled</dt>
                      <dd>{scope.sampledCommits || "—"}</dd>
                    </div>
                    <div>
                      <dt>Largest share</dt>
                      <dd>
                        {scope.topContributorShare === null
                          ? "—"
                          : `${scope.topContributorShare}%`}
                      </dd>
                    </div>
                  </dl>
                </article>
              ),
            )}
          </div>
          <small>{report.busFactor.note}</small>
        </section>

        <section className="evidence-dossier">
          <div className="dossier-section-title">
            <div>
              <span>Evidence dossier</span>
              <h2>The details, separated from the decision.</h2>
            </div>
            <p>
              Findings show locations, never source snippets. Runtime-only facts
              remain explicitly unverified.
            </p>
          </div>
          <div className="domain-accordions">
            {checksByDomain.map((group, groupIndex) => (
              <details key={group.domainId}>
                <summary>
                  <span>{String(groupIndex + 1).padStart(2, "0")}</span>
                  <strong>{group.label}</strong>
                  <span>
                    {
                      group.checks.filter((check) => check.outcome === "pass")
                        .length
                    }{" "}
                    supported / {group.checks.length} checks
                  </span>
                  <ChevronDown aria-hidden="true" size={18} />
                </summary>
                <div className="check-table">
                  {group.checks.map((check) => (
                    <article className="check-row" key={check.id}>
                      <div>
                        <span className={`evidence-pill ${evidenceTone(check)}`}>
                          {evidenceLabel(check)}
                        </span>
                        <span className={`severity ${check.severity}`}>
                          {check.severity}
                        </span>
                      </div>
                      <div>
                        <h3>{check.title}</h3>
                        <p>{check.summary}</p>
                        {check.evidence.length > 0 && (
                          <ul className="evidence-paths">
                            {check.evidence.slice(0, 4).map((evidence) => (
                              <li key={`${check.id}-${evidence.path}`}>
                                <FileSearch aria-hidden="true" size={13} />
                                <code>{evidence.path}</code>
                                <span>{evidence.kind}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </section>

        <section className="scan-record">
          <div>
            <span>Scan record</span>
            <strong>
              {report.coverage.partial ? "Partial coverage" : "Limits not crossed"}
            </strong>
          </div>
          <div>
            <span>Text assessed</span>
            <strong>{formatBytes(report.coverage.processedTextBytes)}</strong>
          </div>
          <div>
            <span>Analysis time</span>
            <strong>{(report.coverage.durationMs / 1_000).toFixed(2)} s</strong>
          </div>
          <div>
            <span>Priority source</span>
            <strong>{report.ai.source}</strong>
          </div>
        </section>

        <PrivacyBoundary report={report} />
      </main>
      <footer className="site-footer">
        <span>Scaleproof / {report.disclaimer}</span>
        <span>Jozef Antony</span>
      </footer>
    </>
  );
}

export function ScaleproofApp() {
  const [report, setReport] = useState<AnalysisReport | null>(null);

  if (report) {
    return <Report report={report} onReset={() => setReport(null)} />;
  }

  return <Landing onReport={setReport} />;
}
