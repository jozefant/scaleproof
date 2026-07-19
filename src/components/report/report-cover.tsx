import type { AnalysisReport } from "@/lib/report/contract";
import { CONTEXT_LABELS } from "@/lib/report/presentation";

export function ReportCover({ report }: { report: AnalysisReport }) {
  return (
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
        <span>Schema {report.schemaVersion}</span>
      </div>
      <div className="dossier-title">
        <div>
          <span className="repository-label">Repository under review</span>
          <h1>
            {report.sourceUrl ? (
              <a href={report.sourceUrl} target="_blank" rel="noreferrer">
                {report.repositoryLabel}
              </a>
            ) : (
              report.repositoryLabel
            )}
          </h1>
          <p>{report.verdictReason}</p>
          <span className="disclaimer">{report.disclaimer}</span>
        </div>
        <div
          className={`verdict-stamp ${report.verdict.toLowerCase()}`}
          aria-label={`Verdict: ${report.verdict}`}
        >
          <small>Verdict</small>
          <strong>{report.verdict}</strong>
        </div>
      </div>
      <div className="score-rail">
        <div>
          <span>Repository evidence score</span>
          <strong>
            {report.score}
            <small>/100</small>
          </strong>
        </div>
        <div>
          <span>Evidence confidence</span>
          <strong>
            {report.confidence}
            <small>%</small>
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
      <dl className="context-assumptions" aria-label="Scan context assumptions">
        <div>
          <dt>Product stage</dt>
          <dd>{CONTEXT_LABELS.stage[report.context.stage]}</dd>
        </div>
        <div>
          <dt>Data handled</dt>
          <dd>
            {CONTEXT_LABELS.dataSensitivity[report.context.dataSensitivity]}
          </dd>
        </div>
        <div>
          <dt>Growth target</dt>
          <dd>{CONTEXT_LABELS.growthTarget[report.context.growthTarget]}</dd>
        </div>
      </dl>
    </section>
  );
}
