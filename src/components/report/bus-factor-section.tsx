import type { AnalysisReport } from "@/lib/report/contract";

export function BusFactorSection({ report }: { report: AnalysisReport }) {
  return (
    <section className="bus-factor">
      <div className="bus-factor-heading">
        <div>
          <span>Knowledge concentration</span>
          <h2>Who can safely change the system?</h2>
        </div>
        <p>
          A directional estimate from recent git history, not a people
          assessment. No names, emails, logins, messages, commit IDs, or raw
          module paths are retained.
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
      <small>
        History status: {report.busFactor.availability}. {report.busFactor.note}
      </small>
    </section>
  );
}
