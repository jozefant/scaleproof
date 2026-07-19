import { LockKeyhole } from "lucide-react";

import type { AnalysisReport } from "@/lib/report/contract";
import styles from "./privacy-boundary.module.css";

export function PrivacyBoundary({ report }: { report?: AnalysisReport }) {
  return (
    <aside
      className={`${styles.root} ${report ? styles.report : ""} privacy-boundary`}
    >
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
