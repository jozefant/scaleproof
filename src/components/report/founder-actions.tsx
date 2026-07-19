import { ArrowUpRight } from "lucide-react";

import type { FounderAction } from "@/lib/report/contract";

function focusEvidence(sourceCheckId: string): void {
  const target = document.getElementById(`check-${sourceCheckId}`);
  if (!target) {
    return;
  }
  const details = target.closest("details");
  if (details instanceof HTMLDetailsElement) {
    details.open = true;
  }
  window.requestAnimationFrame(() => {
    target.focus();
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

export function FounderActions({ actions }: { actions: FounderAction[] }) {
  return (
    <section className="do-now">
      <div className="section-kicker">
        <span>Priority brief</span>
        <span>Maximum three actions</span>
      </div>
      <h2>Do these now.</h2>
      <div className="action-list">
        {actions.map((action) => (
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
              <small className="action-why">{action.whyNow}</small>
              <small className="action-verification">
                Complete when: {action.verification}
              </small>
              <span className="action-sources" aria-label="Supporting checks">
                {action.sourceCheckIds.map((sourceCheckId) => (
                  <button
                    type="button"
                    key={sourceCheckId}
                    onClick={() => focusEvidence(sourceCheckId)}
                    aria-label={`Open supporting check ${sourceCheckId}`}
                  >
                    <code>{sourceCheckId}</code>
                    <ArrowUpRight aria-hidden="true" size={14} />
                  </button>
                ))}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
