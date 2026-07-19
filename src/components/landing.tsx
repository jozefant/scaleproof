import {
  ArrowDown,
  Braces,
  CircleDot,
  Scale,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import type { AnalysisReport } from "@/lib/report/contract";
import { Intake } from "./intake";
import { PrivacyBoundary } from "./privacy-boundary";

export function Landing({
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
              Can your codebase carry the <em>company</em> you&rsquo;re building?
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
              ["07", "AI agents", "Can agents act safely and verify their own work?"],
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
