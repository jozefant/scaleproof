"use client";

import {
  AlertTriangle,
  Download,
  RotateCcw,
} from "lucide-react";

import type { AnalysisReport } from "@/lib/report/contract";
import { formatBytes } from "@/lib/report/presentation";
import { PrivacyBoundary } from "../privacy-boundary";
import { BusFactorSection } from "./bus-factor-section";
import { EvidenceDossier } from "./evidence-dossier";
import { FounderActions } from "./founder-actions";
import { JourneyRail } from "../journey-rail";
import { ReadinessSection } from "./readiness-section";
import { ReportCover } from "./report-cover";
import { downloadReport } from "./report-download";
import styles from "./report.module.css";

export function Report({
  report,
  onReset,
}: {
  report: AnalysisReport;
  onReset: () => void;
}) {
  return (
    <>
      <header className={`report-header ${styles.header}`}>
        <button className="wordmark wordmark-button" onClick={onReset}>
          SCALE<span>PROOF</span>
        </button>
        <div className={styles.actions}>
          <button
            className={styles.secondaryButton}
            aria-label="Download Markdown report"
            onClick={() => downloadReport(report)}
          >
            <Download aria-hidden="true" size={16} />
            Download .md
          </button>
          <button
            className={styles.secondaryButton}
            aria-label="Start a new scan"
            onClick={onReset}
          >
            <RotateCcw aria-hidden="true" size={16} />
            New scan
          </button>
        </div>
      </header>

      <main className={styles.page}>
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

        <JourneyRail state="report" />
        <ReportCover report={report} />
        <FounderActions actions={report.actions} />
        <ReadinessSection report={report} />
        <BusFactorSection report={report} />
        <EvidenceDossier report={report} />

        <section className="scan-record">
          <div>
            <span>Scan record</span>
            <strong>
              {report.coverage.partial
                ? "Partial coverage"
                : "Limits not crossed"}
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
