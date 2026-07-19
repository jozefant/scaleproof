import { ArrowUpRight, Bot, Gauge, Users } from "lucide-react";

import type { AnalysisReport } from "@/lib/report/contract";
import { ReadinessChart } from "../readiness-chart";

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

export function ReadinessSection({ report }: { report: AnalysisReport }) {
  return (
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
  );
}
