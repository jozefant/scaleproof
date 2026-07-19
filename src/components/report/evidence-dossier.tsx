import { ChevronDown, FileSearch } from "lucide-react";

import type {
  AnalysisReport,
  PublicCheckResult,
  PublicDomainId,
} from "@/lib/report/contract";
import { evidenceLabel } from "@/lib/report/presentation";

const DOMAIN_ORDER: PublicDomainId[] = [
  "architecture",
  "quality",
  "security",
  "operations",
  "reliability",
  "resilience",
  "agent_readiness",
];

function evidenceTone(check: PublicCheckResult): string {
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

export function EvidenceDossier({ report }: { report: AnalysisReport }) {
  const groups = DOMAIN_ORDER.map((domainId) => ({
    domainId,
    label:
      report.domains.find((domain) => domain.id === domainId)?.label ??
      domainId,
    checks: report.checks.filter((check) => check.domain === domainId),
  }));

  return (
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
        {groups.map((group, groupIndex) => (
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
                <article
                  className="check-row"
                  key={check.id}
                  id={`check-${check.id}`}
                  tabIndex={-1}
                >
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
  );
}
